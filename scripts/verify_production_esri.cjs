// Browser verification for a static production build. URLs and credentials are sanitized before reporting.
const {chromium}=require('playwright');
const fs=require('node:fs');
const base=process.env.BRIGADE_QA_URL;
const output=process.env.BRIGADE_QA_OUTPUT;
if(!base||!output)throw Error('Specify QA URL and output folder');
fs.mkdirSync(output,{recursive:true});
const report={base,checkedAt:new Date().toISOString(),checks:[],failures:[],consoleErrors:[],pageErrors:[],requestsFailed:[],httpErrors:[],arcgisErrors:[],tileResponses:0,elevationResponses:0,cspViolations:[],captures:[]};
let credential='';
function clean(value){let s=String(value);if(credential)s=s.split(credential).join('[REDACTED]');return s.replace(/https?:\/\/[^\s"'<>]+/g,u=>{try{const p=new URL(u);return p.origin+p.pathname}catch{return '[URL]'}}).slice(0,800);}
const safeURL=value=>{try{const u=new URL(value);return u.origin+u.pathname;}catch{return String(value).slice(0,120);}};
function check(name,result){report[result?'checks':'failures'].push(name);}
async function shot(p,name){await p.screenshot({path:output+'/'+name+'.jpg'});report.captures.push(name+'.jpg');}
async function setup(context){
 const p=await context.newPage();
 await p.exposeFunction('reportCSP',v=>report.cspViolations.push({directive:v.directive,blocked:safeURL(v.blocked||base)}));
 await p.addInitScript(()=>{window.__contextLost=0;document.addEventListener('webglcontextlost',()=>window.__contextLost++,true);document.addEventListener('securitypolicyviolation',e=>window.reportCSP({directive:e.violatedDirective,blocked:e.blockedURI}));});
 p.on('pageerror',e=>report.pageErrors.push(clean(e.message)));
 p.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(clean(m.text()));});
 p.on('requestfailed',r=>{if(r.failure()?.errorText!=='net::ERR_ABORTED')report.requestsFailed.push({url:safeURL(r.url()),error:clean(r.failure()?.errorText)})});
 p.on('response',async r=>{
  const u=new URL(r.url());if(r.status()>=400)report.httpErrors.push({url:safeURL(r.url()),status:r.status()});
  if(!u.hostname.endsWith('arcgis.com'))return;
  if(u.pathname.includes('/tile/')&&r.ok())report.tileResponses++;
  if(u.pathname.endsWith('/getSamples')&&r.ok())report.elevationResponses++;
  if(r.headers()['content-type']?.includes('json'))try{const data=await r.json();if(data.error)report.arcgisErrors.push({url:safeURL(r.url()),code:data.error.code,message:clean(data.error.message)})}catch{}
 });
 return p;
}
async function ready(p){await p.locator('.estate-canvas-ready').waitFor({timeout:60000});await p.evaluate(async()=>{window.auditScene=await import(new URL('estate-scene.js',document.baseURI));});}
async function waitImagery(p,regional=false){await p.waitForFunction(region=>{const s=window.auditScene.sceneMetrics()?.landscape?.[region?'regionalImagery':'imagery'];return s?.provider==='arcgis'&&s?.visibleTiles>0;},regional,{timeout:60000});}
(async()=>{
const browser=await chromium.launch({channel:'chrome'});try{
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 const response=await context.request.get(new URL('data/arcgis-runtime.json',base).href);
 const config=await response.json();credential=config.arcgisApiKey||'';
 report.configuration={enabled:config.arcgisImageryEnabled,keyPresent:!!credential};
 check('Published runtime enables Esri imagery',config.arcgisImageryEnabled&&credential);
 if(!config.arcgisImageryEnabled||!credential)throw Error('Published runtime is disabled');
 const p=await setup(context);
 const doc=await p.goto(base+'?scene=towers&light=morning');report.cspHeader=doc.headers()['content-security-policy']||null;
 await ready(p);await p.evaluate(()=>auditScene.authorView([-173,240,397],[0,60,8]));await waitImagery(p);
 await p.waitForFunction(()=>{const s=auditScene.sceneMetrics().landscape.imagery;return s.highestVisibleZoom>=18&&s.loading===0},null,{timeout:45000}).catch(()=>{});
 report.exterior=await p.evaluate(()=>auditScene.sceneMetrics());
 check('Satellite tiles render around the building',report.exterior.landscape.imagery.provider==='arcgis'&&report.exterior.landscape.imagery.visibleTiles>0);
 check('Plot 20 anchor matches Neopolis coordinates',Math.hypot(report.exterior.landscape.anchor[0]-78.312086932,report.exterior.landscape.anchor[1]-17.402192529)<1e-7);
 report.terrain=await p.evaluate(()=>{
  const world=auditScene.getExteriorLandscape(),seen=new Map();let seams=0,maximumSeamErrorM=0,maximumSamplerErrorM=0;
  world.root.traverse(m=>{if(!m.isMesh||!m.material?.customProgramCacheKey?.().includes('hybrid-parcel'))return;const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++){const x=a.getX(i),y=a.getY(i),z=a.getZ(i),key=x+','+z;maximumSamplerErrorM=Math.max(maximumSamplerErrorM,Math.abs(y-world.terrain.heightAt(x,z)));if(seen.has(key)){seams++;maximumSeamErrorM=Math.max(maximumSeamErrorM,Math.abs(y-seen.get(key)))}else seen.set(key,y)}});
  return {seams,maximumSeamErrorM,maximumSamplerErrorM};
 });
 check('Terrain patches meet without measurable seams',report.terrain.maximumSeamErrorM<.001&&report.terrain.maximumSamplerErrorM<.005);
 await shot(p,'exterior');
 report.orbit=[];
 for(let i=0;i<12;i++){const a=i*Math.PI/6;await p.evaluate(a=>auditScene.authorView([Math.sin(a)*440,250,Math.cos(a)*440],[0,65,0]),a);await p.waitForTimeout(220);report.orbit.push(await p.evaluate(()=>{const m=auditScene.sceneMetrics();return {camera:m.camera,triangles:m.triangles,frames:m.renderedFrames,contextLost:window.__contextLost}}));if([3,6,9].includes(i))await shot(p,'orbit-'+i);}
 check('Full orbit keeps finite camera positions and rendered geometry',report.orbit.every(s=>s.camera.every(Number.isFinite)&&s.triangles>0&&s.contextLost===0));
 await p.evaluate(async()=>{await auditScene.getExteriorLandscape().regionReady;await auditScene.goView('regional',0)});await waitImagery(p,true);await p.waitForTimeout(2000);
 report.regional=await p.evaluate(()=>auditScene.sceneMetrics().landscape.regionalImagery);await shot(p,'regional');
 check('Regional satellite environment renders',report.regional.provider==='arcgis'&&report.regional.visibleTiles>0);
 await context.close();
 const phone=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
 const m=await setup(phone);await m.goto(base+'?scene=towers&wing=B&light=morning');await ready(m);await waitImagery(m);await m.waitForTimeout(1600);
 report.mobile=await m.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,metrics:auditScene.sceneMetrics(),contextLost:window.__contextLost}));await shot(m,'mobile');
 check('Mobile renders real imagery without horizontal overflow',report.mobile.metrics.landscape.imagery.provider==='arcgis'&&report.mobile.scrollWidth<=report.mobile.width&&report.mobile.contextLost===0);
 await phone.close();
 check('No ArcGIS authentication failures',!report.httpErrors.some(e=>[401,403,498,499].includes(e.status))&&!report.arcgisErrors.some(e=>[401,403,498,499].includes(e.code)));
 check('No browser script or CSP failures',!report.pageErrors.length&&!report.cspViolations.length);
}catch(e){report.failures.push(clean(e.message));}finally{await browser.close();fs.writeFileSync(output+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({base,checks:report.checks,failures:report.failures,tileResponses:report.tileResponses,elevationResponses:report.elevationResponses,httpErrors:report.httpErrors,arcgisErrors:report.arcgisErrors,consoleErrors:report.consoleErrors,pageErrors:report.pageErrors,cspViolations:report.cspViolations,requestsFailed:report.requestsFailed,output}));if(report.failures.length)process.exitCode=1;}
})();
