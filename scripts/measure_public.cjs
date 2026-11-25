const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.BRIGADE_QA_URL||'http://127.0.0.1:5173/experience/';
const trials=[];
async function run(){
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome'});
 try{
  for(const [width,height,dpr,mobile] of [[1920,1080,1,false],[390,844,2,true]]){
   const ctx=await browser.newContext({viewport:{width,height},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:dpr});
   try{
    const page=await ctx.newPage(),cdp=await ctx.newCDPSession(page);
    await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
    await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:20e6/8,uploadThroughput:5e6/8,connectionType:'wifi'});
    await page.goto(base,{waitUntil:'commit'});
    await page.waitForSelector('.estate-cta:visible');
    await page.waitForFunction(()=>Boolean(document.querySelector('.estate-cta').onclick));
    // Activation through the landing CTA confirms the first interactive control is usable.
    await page.locator('.estate-cta').click();await page.waitForFunction(()=>document.body.dataset.section==='towers');
    const uiMs=await page.evaluate(()=>Math.round(performance.now()));
    await page.waitForFunction(async()=>Boolean((await import(new URL('estate-scene.js',document.baseURI))).sceneMetrics()?.triangles));
    await page.locator('#estatePanelContent').getByRole('button',{name:'Wing B',exact:true}).click();
    await page.waitForFunction(async()=>(await import(new URL('estate-scene.js',document.baseURI))).sceneMetrics()?.wing==='B');
    const exteriorMs=await page.evaluate(()=>Math.round(performance.now()));
    await page.waitForTimeout(1800);await page.waitForLoadState('networkidle');
    const frames=await page.evaluate(async()=>{
      const m=await import(new URL('estate-scene.js',document.baseURI));
      await m.goView('overview',0);await new Promise(requestAnimationFrame);
      const initial=m.sceneMetrics(),start=performance.now();
      await m.goView('aerial',4500);
      const end=performance.now(),last=m.sceneMetrics();
      const gl=document.querySelector('#estateCanvas canvas').getContext('webgl2');
      const ext=gl.getExtension('WEBGL_debug_renderer_info');
      return {seconds:+((end-start)/1000).toFixed(2),frames:last.renderedFrames-initial.renderedFrames,fps:+((last.renderedFrames-initial.renderedFrames)*1000/(end-start)).toFixed(1),pixelRatio:last.pixelRatio,drawCalls:last.drawCalls,triangles:last.triangles,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),detail:last.detail};
    });
    const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({file:r.name.split('/').pop(),bytes:r.transferSize})));
    const row={width,height,dpr,mobile,uiMs,exteriorMs,frames,transferredBytes:resources.reduce((n,r)=>n+r.bytes,0),requestedApartmentModels:resources.filter(r=>/apartment-[ab].*\.glb$/.test(r.file)).length};
    trials.push(row);console.log(JSON.stringify(row));
   }finally{await ctx.close();}
  }
 }finally{fs.writeFileSync(path.join(__dirname,'../qa/performance.json'),JSON.stringify({browser:browser.version(),date:new Date().toISOString(),network:{downloadMbps:20,uploadMbps:5,latencyMs:40,coldCache:true},trials},null,2)+'\n');await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
