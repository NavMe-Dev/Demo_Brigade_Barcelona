const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const stage=process.argv[2];
assert.ok(['before','after'].includes(stage),'Pass before or after.');
const url=process.env.BRIGADE_QA_URL||'http://127.0.0.1:5173/experience/';
const qa=path.join(__dirname,'../qa');
const profiles=[{name:'desktop',width:1920,height:1080,dpr:1},{name:'phone',width:390,height:844,dpr:2}];
async function profile(browser,p){
 const mobile=p.name==='phone',ctx=await browser.newContext({viewport:{width:p.width,height:p.height},hasTouch:mobile,
   isMobile:mobile,deviceScaleFactor:p.dpr,reducedMotion:'no-preference'});
 try{
  const page=await ctx.newPage(),cdp=await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:20e6/8,uploadThroughput:5e6/8,connectionType:'wifi'});
  await page.addInitScript(()=>{
   performance.setResourceTimingBufferSize(3000);
   window.sceneTiming={frames:[],first:null,control:null};
   const observeControl=()=>{
    const el=document.querySelector('.estate-cta');
    if(el?.onclick&&el.getClientRects().length&&sceneTiming.control===null)sceneTiming.control=performance.now();
    if(sceneTiming.control===null)requestAnimationFrame(observeControl);
   };
   requestAnimationFrame(observeControl);
   window.__THREE_DEVTOOLS__=new EventTarget();
   window.__THREE_DEVTOOLS__.addEventListener('observe',({detail:r})=>{
     if(!r.isWebGLRenderer)return;
     const draw=r.render;
     r.render=function(scene,camera){
       const result=draw.call(this,scene,camera);
       if(r.domElement.parentElement?.id==='estateCanvas'&&r.info.render.triangles>10000){
         const mark=performance.now();
         sceneTiming.first??=mark;
         sceneTiming.frames.push(mark);
       }
       return result;
     };
   });
  });
  const heap=async(label)=>{
    const h=await cdp.send('Runtime.getHeapUsage');
    const scene=await page.evaluate(async()=>(await import(new URL('estate-scene.js',document.baseURI))).sceneMetrics());
    return {label,jsUsedBytes:h.usedSize,jsAllocatedBytes:h.totalSize,embedderUsedBytes:h.embedderHeapUsedSize,backingStorageBytes:h.backingStorageSize,
      geometries:scene.geometries,textures:scene.textures,triangles:scene.triangles,drawCalls:scene.drawCalls,gis:scene.gis||null};
  };
  await page.route('**/data/arcgis-runtime.json',route=>route.fulfill({json:{arcgisImageryEnabled:false,arcgisApiKey:''}}));
  await page.goto(url,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.sceneTiming?.first&&window.sceneTiming?.control);
  const initial=await heap('first exterior draw');
  await page.getByRole('button',{name:'Replay introduction',exact:true}).waitFor({timeout:23000});
  await page.waitForLoadState('networkidle');
  const atOverview=await heap('settled overview');
  const camera=await page.evaluate(async()=>{
    const scene=await import(new URL('estate-scene.js',document.baseURI));
    const frames=window.sceneTiming.frames;
    const start=performance.now(),first=frames.length;
    await scene.goView('aerial',4500);
    await new Promise(requestAnimationFrame);
    const end=performance.now(),marks=frames.slice(first);
    const intervals=marks.slice(1).map((t,i)=>t-marks[i]).sort((a,b)=>a-b);
    const gl=document.querySelector('#estateCanvas canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {firstUIReadyMs:Math.round(sceneTiming.control),firstExteriorMs:Math.round(sceneTiming.first),sampleMs:Math.round(end-start),
      frames:marks.length,fps:+(marks.length*1000/(end-start)).toFixed(1),medianIntervalMs:+intervals[Math.floor(intervals.length*.5)].toFixed(1),
      p95IntervalMs:+intervals[Math.floor(intervals.length*.95)].toFixed(1),gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),pixelRatio:scene.sceneMetrics().pixelRatio};
  });
  const afterMove=await heap('aerial approach');
  const navigation=await page.evaluate(async()=>{
    const scene=await import(new URL('estate-scene.js',document.baseURI));
    const route=[[[135,104,145],[310,0,410]],[[1370,220,650],[1650,0,790]],[[-1730,245,-1220],[-2110,0,-1620]],[[183,152,298],[0,80,0]]];
    const stops=[];
    for(const [position,target] of route){
      await scene.authorView(position,target);
      await new Promise(resolve=>setTimeout(resolve,600));
      const m=scene.sceneMetrics();
      stops.push({camera:m.camera,gis:m.gis||null,geometries:m.geometries,textures:m.textures,triangles:m.triangles});
    }
    return stops;
  });
  await page.waitForLoadState('networkidle');await cdp.send('HeapProfiler.collectGarbage');
  const final=await heap('return from neighborhood after collection');
  const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({file:new URL(r.name).pathname,bytes:r.transferSize})));
  const tileResources=resources.filter(r=>/\/assets\/geography\/|\/tiles?\//i.test(r.file));
  return {...p,...camera,memory:[initial,atOverview,afterMove,final],neighborhoodStops:navigation,
    resourceCount:resources.length,totalResourceTransferBytes:resources.reduce((n,r)=>n+r.bytes,0),gisResourceCount:tileResources.length,
    gisTransferBytes:tileResources.reduce((n,r)=>n+r.bytes,0),gisResourceFiles:tileResources.map(r=>r.file),
    requestedApartmentModels:resources.filter(r=>/apartment-[ab]\d+.*\.glb$/i.test(r.file)).length};
 }finally{await ctx.close();}
}
async function main(){
 const b=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome'});
 try{
  const report={stage,url,date:new Date().toISOString(),browser:b.version(),network:{downMbps:20,upMbps:5,latencyMs:40,cache:'disabled'},trials:[]};
  for(const p of profiles){const trial=await profile(b,p);report.trials.push(trial);console.log(p.name,trial.firstExteriorMs,trial.fps);}
  fs.writeFileSync(path.join(qa,'gis-performance-'+stage+'.json'),JSON.stringify(report,null,2)+'\n');
 }finally{await b.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
