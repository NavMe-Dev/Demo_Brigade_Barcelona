const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const stage = process.argv[2];
assert.ok(['before','after'].includes(stage),'Use before or after as the argument.');
const root = path.join(__dirname,'..');
const url = process.env.BRIGADE_QA_URL || 'http://127.0.0.1:5173/experience/';
const directory = path.join(root,'qa/evidence/gis');
const profiles = [
  {name:'desktop',width:1920,height:1080,dpr:1,settled:[183,152,298],target:[0,80,0]},
  {name:'phone',width:390,height:844,dpr:2,settled:[218,165,345],target:[0,81,0]}
];
const near = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]))<.001;

async function attach(page) {
  await page.addInitScript(()=>{
    window.__THREE_DEVTOOLS__=new EventTarget();
    window.__THREE_DEVTOOLS__.addEventListener('observe',({detail:r})=>{
      if(!r.isWebGLRenderer)return;
      const draw=r.render;
      r.render=function(scene,camera){
        const result=draw.call(this,scene,camera);
        if(r.domElement.parentElement?.id==='estateCanvas'&&r.info.render.triangles>10000){
          window.gisExterior={scene,camera,r};
        }
        return result;
      };
    });
  });
}

async function capture(page,profile,name,position,target){
  await page.evaluate(async({position,target})=>{
    const mod=await import(new URL('estate-scene.js',document.baseURI));
    await mod.authorView(position,target);
  },{position,target});
  await page.waitForTimeout(450);
  await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});
  if(stage==='after'){
    await page.waitForFunction(()=>{
      const gis=window.readGISMetrics()?.gis;
      return gis?.buildings.ready&&gis.buildings.pending===0&&gis.imagery.localNativeTiles>0;
    },null,{timeout:30000});
  }
  const result=await page.evaluate(async({width,height,wantPoster})=>{
    const m=await import(new URL('estate-scene.js',document.baseURI));
    const {scene,camera,r}=window.gisExterior;
    // Read at the end of a real WebGL draw before the browser clears its back buffer.
    r.render(scene,camera);
    const copy=document.createElement('canvas');
    copy.width=width;copy.height=height;
    copy.getContext('2d').drawImage(r.domElement,0,0,width,height);
    return {image:copy.toDataURL('image/webp',.94),poster:wantPoster?r.domElement.toDataURL('image/webp',.94):null,
      metrics:m.sceneMetrics(),credits:document.getElementById('geoCredits')?.innerText||null,viewport:[innerWidth,innerHeight],
      buffer:[r.domElement.width,r.domElement.height],view:camera.view,fov:camera.fov};
  },{width:profile.width,height:profile.height,wantPoster:stage==='after'&&name==='wide'});
  assert.ok(near(result.metrics.camera,position)&&near(result.metrics.target,target),'Camera must match the recorded pose.');
  const file=stage+'-'+profile.name+'-'+name+'.webp';
  const pixels=Buffer.from(result.image.split(',')[1],'base64');
  fs.writeFileSync(path.join(directory,file),pixels);
  if(stage==='after'&&name==='wide'){
    assert.equal(result.metrics.gis.imagery.provider,'sentinel','Offline posters must use the distributable imagery.');
    const poster=profile.name==='phone'?'mobile':'desktop';
    fs.writeFileSync(path.join(root,'dist/assets/estate-overview-'+poster+'.webp'),Buffer.from(result.poster.split(',')[1],'base64'));
  }
  const {image,poster,...details}=result;
  return {file,pose:name,position,target,...details};
}
async function main() {
  fs.mkdirSync(directory,{recursive:true});
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome'});
  const report={stage,url,browser:browser.version(),date:new Date().toISOString(),captures:[]};
  try{
    for(const profile of profiles){
      const mobile=profile.name==='phone';
      const page=await browser.newPage({viewport:{width:profile.width,height:profile.height},deviceScaleFactor:profile.dpr,
        hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce'});
      try{
        await attach(page);
        await page.route('**/data/arcgis-runtime.json',route=>route.fulfill({json:{arcgisImageryEnabled:false,arcgisApiKey:''}}));
        await page.goto(url);
        await page.waitForFunction(()=>window.gisExterior);
        await page.evaluate(async()=>{window.readGISMetrics=(await import(new URL('estate-scene.js',document.baseURI))).sceneMetrics;});
        await page.waitForFunction(()=>Boolean(window.readGISMetrics()?.geographicContext),null,{timeout:20000});
        await page.waitForLoadState('networkidle');
        const poses=[['wide',[475,335,540],[0,20,0]],['overview',profile.settled,profile.target],['context',[135,104,145],[310,0,410]]];
        for(const [name,position,target] of poses){
          const record=await capture(page,profile,name,position,target);
          report.captures.push(record);
          if(stage==='after'&&name==='wide'){
            await page.screenshot({path:path.join(directory,'hero-'+profile.name+'.png'),scale:'css'});
          }
        }
      }finally{await page.close();}
    }
  }finally{await browser.close();}
  fs.writeFileSync(path.join(root,'qa/gis-'+stage+'.json'),JSON.stringify(report,null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
