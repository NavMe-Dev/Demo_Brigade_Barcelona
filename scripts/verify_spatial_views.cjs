const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {placements}=require('../dist/data/apartment-spatial.json');
const base=process.env.BRIGADE_QA_URL||'http://127.0.0.1:5173/';
const folder=path.join(__dirname,'../qa/evidence/spatial-views');
fs.mkdirSync(folder,{recursive:true});
const forbidden=/\/assets\/geography\/(?:sentinel\/|hyderabad-region\.webp|kokapet-color\.webp)/i;
const shot=(page,name)=>page.screenshot({path:path.join(folder,name+'.jpg'),quality:91});
const read=page=>page.evaluate(()=>window.apartment.getSpatialViewState());
async function open(page,code,floor,room){
  const url=new URL(base);
  url.search=new URLSearchParams({layout:code,view:'walk',floor,room});
  await page.goto(url.href);
  await page.evaluate(async()=>{window.apartment=await import(new URL('app.js',document.baseURI));});
  await page.waitForFunction(()=>window.apartment.getSpatialViewState()?.context&&document.body.classList.contains('walking'));
}
async function clickOpening(page,anchor){
  const select=page.locator('#windowAnchor');
  if(await select.isVisible())await select.selectOption(anchor.id);
  await page.locator(anchor.kind==='balcony'?'#balconyView':'#windowView').click();
  await page.waitForFunction(room=>window.apartment.getSpatialViewState()?.room===room,anchor.room);
  const state=await read(page);
  assert.ok(anchor.candidates.some(point=>Math.hypot(...point.map((v,i)=>v-state.camera[i]))<.025),
    'Eye remains at a collision-tested anchor '+anchor.id);
  return state;
}

async function run(){
  const browser=await chromium.launch({channel:'chrome'});
  const report={browser:browser.version(),layouts:[],errors:[],gis:[]};
  const bind=async page=>{
    await page.addInitScript(()=>{
      window.samples={};
      window.sampleMode='';
      window.__THREE_DEVTOOLS__=new EventTarget();
      window.__THREE_DEVTOOLS__.addEventListener('observe',({detail:renderer})=>{
        if(!renderer.isWebGLRenderer)return;
        const raw=renderer.render;
        renderer.render=function(scene,camera){
          const category=window.sampleMode;
          const start=performance.now();
          const result=raw.call(this,scene,camera);
          if(category)(window.samples[category]??=[]).push(performance.now()-start);
          return result;
        };
      });
    });
    page.on('pageerror',error=>report.errors.push(error.message));
    page.on('request',r=>{if(forbidden.test(r.url()))report.gis.push(r.url());});
  };
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
    await bind(page);
    for(const [code,data] of Object.entries(placements)){
      const windowChoices=data.anchors.filter(a=>a.kind==='window'&&a.eye);
      const window=code==='B14'?windowChoices[1]:code==='A6'?windowChoices.find(a=>a.room==='living'):windowChoices[0];
      const balcony=data.anchors.find(a=>a.kind==='balcony'&&a.eye);
      assert.ok(window&&balcony);
      await open(page,code,25,window.room);
      if(code==='B14')await page.evaluate(()=>window.sampleMode='window');
      const high=await clickOpening(page,window);
      if(code==='A6')await shot(page,'living-room-window');
      assert.equal(high.wing,code[0]);
      assert.equal(high.floor,25);
      if(code==='B14')await shot(page,'b14-floor-25-bedroom');
      const lower=data.floors[0],switchStart=Date.now();
      if(code==='B14')await page.evaluate(()=>window.sampleMode='floorSwitch');
      await page.locator('#apartmentFloor').selectOption(String(lower.floor));
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const low=await read(page);
      const switchMs=Date.now()-switchStart;
      assert.equal(low.floor,lower.floor);
      assert.deepEqual(high.camera,low.camera);
      assert.ok(high.worldEye[1]>low.worldEye[1]);
      if(code==='B14'){
        await shot(page,'b14-floor-12-bedroom');
        await page.locator('#apartmentFloor').selectOption('20');
        await shot(page,'b14-floor-20-bedroom');
        const start=Date.now();
        await page.evaluate(()=>window.sampleMode='comparison');
        await page.locator('#compareFloorViews').click();
        const images=page.locator('.floor-view-images img');
        await images.last().waitFor();
        assert.notEqual(await images.first().getAttribute('src'),await images.last().getAttribute('src'));
        report.compareMs=Date.now()-start;
        await shot(page,'compare-floors');
        await page.getByRole('dialog',{name:'Compare floor views'}).getByRole('button',{name:'Close'}).click();
      }
      if(code==='B14')await page.evaluate(()=>window.sampleMode='balcony');
      await page.locator('#balconyView').click();
      const deck=await read(page);
      assert.equal(deck.room,balcony.room);
      assert.ok(deck.context);
      assert.ok(balcony.candidates.some(eye=>eye.every((value,index)=>Math.abs(value-deck.camera[index])<0.02)));
      if(code==='B14'){
        await shot(page,'b14-balcony');
        await page.locator('#cardToggle').click();
        await page.evaluate(()=>window.sampleMode='dollhouse');
        await page.locator('#dollhouseButton').click();
        await shot(page,'b14-dollhouse');
        await page.locator('#dollhouseAngle').selectOption('building');
        assert.ok((await read(page)).context);
        await shot(page,'b14-in-building');
        await page.evaluate(()=>window.sampleMode='walkthrough');
        await page.locator('#walkButton').click();
        await page.locator('#lightingModes [data-light=sunset]').click();
        await page.waitForTimeout(400);
        await shot(page,'golden-hour-interior');
        await page.locator('#lightingModes [data-light=night]').click();
        await page.waitForTimeout(650);
        await shot(page,'night-interior');
        report.interiorCpuRenderMs=await page.evaluate(()=>{ window.sampleMode='';return window.samples; });
      }
      await page.locator('#buildingReturn').click();
      await page.waitForFunction(()=>!document.body.classList.contains('exploring'));
      report.layouts.push({code,window:window.id,balcony:deck.room,lower:low.floor,upper:high.floor,
        yaw:high.yaw,lowerEye:low.worldEye,upperEye:high.worldEye,switchMs,triangles:high.triangles,drawCalls:high.drawCalls});
      console.log('Spatial checks passed',code);
    }
    await page.goto(new URL('?scene=towers&wing=B&floor=25',base).href);
    await page.locator('.estate-canvas-ready').waitFor();
    await page.evaluate(async()=>{
      const exterior=await import(new URL('estate-scene.js',document.baseURI));
      exterior.highlight('B',25,'B14');
      await exterior.focusDesign('B14',25,0);
    });
    await page.waitForTimeout(400);
    await shot(page,'b14-exterior-highlight');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(async()=>{
      const exterior=await import(new URL('estate-scene.js',document.baseURI));
      window.sampleMode='orbit';
      exterior.orbitBuilding();
    });
    await page.waitForTimeout(2200);
    report.exteriorOrbitCpuRenderMs=await page.evaluate(()=>window.samples.orbit||[]);
    await page.close();
    const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,reducedMotion:'reduce'});
    await bind(phone);
    const window=placements.B14.anchors.filter(a=>a.kind==='window'&&a.eye)[1];
    await open(phone,'B14',25,window.room);
    await clickOpening(phone,window);
    await shot(phone,'mobile-window');
    await phone.close();
    assert.deepEqual(report.errors,[]);
    assert.deepEqual(report.gis,[]);
    fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2)+'\n');
  }finally{await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
