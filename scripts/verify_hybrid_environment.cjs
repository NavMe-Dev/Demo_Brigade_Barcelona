const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { placements } = require('../dist/data/apartment-spatial.json');
const base = process.env.BRIGADE_QA_URL || 'http://127.0.0.1:5173/';
const folder = path.join(__dirname, '../qa/evidence/hybrid-environment');
const arcgis = /^https:\/\/[^/]*\.arcgis\.com\//i;
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,OPTIONS', 'access-control-allow-headers': 'Authorization' };
const report = { date: new Date().toISOString(), checks: [], failed: [], blocked: [], errors: [], captures: [], layouts: [] };
fs.mkdirSync(folder, { recursive: true });
const metrics = page => page.evaluate(() => window.estate.sceneMetrics());
const imagery = m => m.landscape?.imagery || m.gis?.imagery;
const check = (name, condition) => { assert.ok(condition, name); report.checks.push(name); };
async function capture(page, name) {
  await page.screenshot({ path: path.join(folder, name + '.jpg'), quality: 91 });
  report.captures.push(name);
}
function observe(page) {
  const log = { sentinel: [], arcgis: [], errors: [], failedLocal: [] };
  page.on('pageerror', error => { log.errors.push(error.message); report.errors.push(error.message); });
  page.on('console', message => {
    if (message.type() === 'error' && /THREE\.WebGLProgram|shader.*error|VALIDATE_STATUS/i.test(message.text())) {
      log.errors.push(message.text()); report.errors.push(message.text());
    }
  });
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (/sentinel|hyderabad-region\.webp|kokapet-color\.webp/.test(pathname)) log.sentinel.push(pathname);
    if (arcgis.test(request.url())) log.arcgis.push(pathname);
  });
  page.on('response', response => {
    if (response.status() >= 400 && response.url().startsWith(base)) log.failedLocal.push(new URL(response.url()).pathname);
  });
  return log;
}
async function config(page, enabled = false) {
  await page.route('**/data/arcgis-runtime.json', route => route.fulfill({ json: {
    arcgisImageryEnabled: enabled, arcgisApiKey: enabled ? 'local-hybrid-test-placeholder' : '',
  } }));
}
async function prepare(page, query = '?scene=towers') {
  await page.goto(new URL(query, base).href);
  await page.locator('.estate-canvas-ready').waitFor({ timeout: 45000 });
  await page.evaluate(async () => { window.estate = await import(new URL('estate-scene.js', document.baseURI)); });
  await page.waitForFunction(() => Boolean(window.estate.sceneMetrics()?.landscape), null, { timeout: 30000 });
}
async function terrainAudit(page) {
  return page.evaluate(async () => {
    const terrain = window.estate.getExteriorLandscape().terrain;
    const points = [[0,0],[-550,300],[2400,-4100],[6800,6500]];
    const roundTripErrorM = Math.max(...points.map(([x,z]) => {
      const [a,b] = terrain.wgs84ToLocal(...terrain.localToWGS84(x,z));
      return Math.hypot(a-x,b-z);
    }));
    const parcel = await fetch(new URL('assets/geography/plot-20.geojson', document.baseURI)).then(r => r.json());
    const heights = new Map();
    let vertices = 0, sharedVertices = 0, maximumSeamErrorM = 0, maximumHeightErrorM = 0;
    window.estate.getExteriorLandscape().root.traverse(mesh => {
      if (!mesh.isMesh || !mesh.material?.customProgramCacheKey?.().includes('hybrid-parcel')) return;
      const position = mesh.geometry.attributes.position;
      for (let i=0;i<position.count;i++) {
        const x=position.getX(i), y=position.getY(i), z=position.getZ(i), key=x+','+z;
        maximumHeightErrorM=Math.max(maximumHeightErrorM,Math.abs(y-terrain.heightAt(x,z)));
        if (heights.has(key)) { maximumSeamErrorM=Math.max(maximumSeamErrorM,Math.abs(y-heights.get(key))); sharedVertices++; }
        else heights.set(key,y);
        vertices++;
      }
    });
    return {
      vertices, sharedVertices, maximumSeamErrorM, maximumHeightErrorM,
      anchor: terrain.localToWGS84(0,0), anchorElevationM: terrain.anchorElevationM,
      roundTripErrorM, parcelVertices: parcel.geometry.coordinates[0].length-1,
      maximumParcelHeightM: Math.max(...parcel.geometry.coordinates[0].map(p => Math.abs(terrain.heightAt(...terrain.wgs84ToLocal(...p))))),
    };
  });
}
function intervals(samples) {
  const frames = samples.filter((r,i) => r.frames !== samples[i-1]?.frames);
  const values = frames.slice(1).map((r,i) => r.time-frames[i].time);
  const sorted = values.slice().sort((a,b) => a-b);
  return { renderedFrames: frames.length, meanFPS: 1000*values.length/values.reduce((a,b) => a+b,0),
    p95Ms: sorted[Math.ceil(sorted.length*.95)-1], p99Ms: sorted[Math.ceil(sorted.length*.99)-1],
    intervalsOver25Ms: values.filter(v => v>25).length };
}
async function captureAndOrbit(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const log = observe(page);
  await config(page);
  try {
    const start = Date.now();
    await prepare(page);
    report.firstReadyMs = Date.now()-start;
    await page.waitForTimeout(1500);
    report.terrain = await terrainAudit(page);
    check('Hybrid terrain follows one DEM with matching patch edges', report.terrain.vertices>100000 && report.terrain.sharedVertices>1000 && report.terrain.maximumSeamErrorM<.001 && report.terrain.maximumHeightErrorM<.005);
    check('Published geographic anchor round trips within 1 cm', report.terrain.roundTripErrorM < .01);
    check('Published parcel has 16 vertices and lies on the level project datum', report.terrain.parcelVertices === 16 && report.terrain.maximumParcelHeightM < .05);
    await page.locator('#panelClose').click();
    for (const [name, key] of [
      ['hero','front'],['aerial-masterplan','aerial'],['main-entrance','entrance'],
      ['front-road','frontage'],['rear-surroundings','rear'],['street-level','street'],
      ['clubhouse','clubhouse'],['eco-deck','ecoGarden'],['sky-deck','skyGarden'],
    ]) {
      await page.evaluate(key => window.estate.goView(key,0), key);
      await page.waitForTimeout(500);
      await capture(page,name);
    }
    await page.evaluate(async () => { await window.estate.goView('front',0); await window.estate.setMood('sunset'); });
    await page.waitForTimeout(350); await capture(page,'golden-hour');
    await page.evaluate(() => window.estate.setMood('night'));
    await page.waitForTimeout(350); await capture(page,'night');
    await page.evaluate(() => window.estate.setMood('sunset'));
    report.desktop = await metrics(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const orbit = await page.evaluate(async () => {
      const samples = [], start = performance.now();
      window.estate.orbitBuilding();
      return new Promise(resolve => {
        function frame(time) {
          const m = window.estate.sceneMetrics();
          samples.push({ time: time-start, frames: m.renderedFrames, updates:m.cameraUpdates,
            motion:m.motion, camera:m.camera, target:m.target, detail:m.detail });
          if (time-start >= 27000) return resolve({samples, metrics:m, heap:performance.memory?.usedJSHeapSize});
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
    });
    const active = orbit.samples.filter(r => r.motion === 'orbit');
    let degrees=0;
    for(let i=1;i<active.length;i++) {
      const angle = r => Math.atan2(r.camera[0]-r.target[0],r.camera[2]-r.target[2]);
      const difference = angle(active[i])-angle(active[i-1]);
      degrees += Math.atan2(Math.sin(difference),Math.cos(difference))*180/Math.PI;
    }
    check('Full 360-degree orbit completes in the hybrid environment', degrees > 358 && degrees < 362);
    check('Orbit target stays fixed', active.every(r => r.target.every((v,i) => Math.abs(v-active[0].target[i])<1e-8)));
    check('Automatic orbit uses one architecture LOD',new Set(active.map(r => r.detail)).size===1);
    report.orbit = { ...intervals(active), degrees, heap:orbit.heap, final:orbit.metrics };
    fs.writeFileSync(path.join(folder,'orbit-frames.json'), JSON.stringify(orbit.samples));
    check('Fallback makes no Esri or Sentinel requests', !log.arcgis.length && !log.sentinel.length);
    check('Fallback loads local assets without HTTP failures', !log.failedLocal.length);
    report.noKey = log;
    report.blocked.push('Hyderabad aerial and geographic arrival imagery screenshots require an entitled ArcGIS key. The no-key run captures the architectural terrain fallback.');
  } finally { await page.close(); }
  const mobile = await browser.newPage({ viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true,reducedMotion:'reduce' });
  observe(mobile); await config(mobile);
  try { await prepare(mobile); await mobile.waitForTimeout(1200); await capture(mobile,'mobile'); report.mobile=await metrics(mobile); }
  finally { await mobile.close(); }
}
async function performanceRun(browser, licensed=false) {
  report.performance=[];
  for(const width of [1440,390]) {
    const page=await browser.newPage({viewport:{width,height:width===390?844:900},deviceScaleFactor:width===390?2:1,hasTouch:width===390,isMobile:width===390,reducedMotion:'reduce'});
    observe(page);if(!licensed)await config(page);
    try {
      const loadStart=Date.now();
      await prepare(page);
      const firstReadyMs=Date.now()-loadStart;
      if(licensed)await page.waitForFunction(()=>window.estate.sceneMetrics().landscape.imagery?.provider==='arcgis',null,{timeout:60000});
      await page.evaluate(()=>window.estate.goView('front',0));
      await page.waitForTimeout(1800);
      await page.emulateMedia({reducedMotion:'no-preference'});
      const result=await page.evaluate(async()=>{
        const samples=[],start=performance.now();
        window.estate.orbitBuilding();
        return new Promise(resolve=>{
          function tick(time) {
            const m=window.estate.sceneMetrics();
            if(m.motion==='orbit')samples.push({time:time-start,frames:m.renderedFrames,updates:m.cameraUpdates});
            if(time-start>27000)return resolve({samples,final:m,heap:performance.memory?.usedJSHeapSize});
            requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        });
      });
      report.performance.push({width,height:width===390?844:900,firstReadyMs,emulatedTouch:width===390,...intervals(result.samples),heap:result.heap,final:result.final});
    }finally{await page.close();}
  }
}
async function licensedCapture(browser) {
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const log=observe(page);
  try {
    const response=await page.request.get(new URL('data/arcgis-runtime.json',base).href);
    const settings=await response.json();
    if(!settings.arcgisImageryEnabled||!settings.arcgisApiKey) {
      report.blocked.push('An enabled entitled browser key is required for live geographic imagery.');
      return;
    }
    await prepare(page,'?scene=towers');
    report.terrain=await terrainAudit(page);
    check('Live hybrid terrain matches its active sampler and patch edges',report.terrain.maximumSeamErrorM<.001&&report.terrain.maximumHeightErrorM<.005);
    await page.waitForFunction(()=>window.estate.sceneMetrics().landscape.imagery?.provider==='arcgis',null,{timeout:60000});
    check('Live configured imagery is displayed',imagery(await metrics(page)).visibleTiles>0);
    await page.locator('#panelClose').click();
    await page.evaluate(async()=>{await window.estate.getExteriorLandscape().regionReady;await window.estate.goView('regional',0);});
    await page.waitForFunction(()=>window.estate.sceneMetrics().landscape.regionalImagery?.provider==='arcgis',null,{timeout:60000});
    await page.waitForTimeout(1200);
    await capture(page,'hyderabad-aerial');
    for(const [name,key] of [
      ['hero','front'],['aerial-masterplan','aerial'],['main-entrance','entrance'],
      ['front-road','frontage'],['rear-surroundings','rear'],['street-level','street'],
      ['clubhouse','clubhouse'],['eco-deck','ecoGarden'],['sky-deck','skyGarden'],
    ]) {
      await page.evaluate(key=>window.estate.goView(key,0),key);
      await page.waitForTimeout(900);
      await capture(page,name);
    }
    await page.evaluate(async()=>{await window.estate.goView('front',0);await window.estate.setMood('sunset');});
    await page.waitForTimeout(400);await capture(page,'golden-hour');
    await page.evaluate(()=>window.estate.setMood('night'));await page.waitForTimeout(400);await capture(page,'night');
    report.live={imagery:imagery(await metrics(page)),networkRequests:log.arcgis.length,failedLocal:log.failedLocal};
    await page.emulateMedia({reducedMotion:'no-preference'});
    await prepare(page,'?');
    report.arrivalStart=await metrics(page);
    check('Initial licensed arrival starts over the geographic region',report.arrivalStart.camera[1]>1000&&report.arrivalStart.landscape.regionalImagery?.provider==='arcgis');
    await page.waitForTimeout(4200);await capture(page,'geographic-arrival');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(new URL('?layout=B14&floor=25&view=walk&room=bedroom-1',base).href);
    await page.locator('#windowView').waitFor({timeout:45000});
    await page.locator('#windowAnchor').selectOption(placements.B14.anchors.filter(a=>a.kind==='window'&&a.eye)[1].id);
    await page.locator('#windowView').click();await page.waitForTimeout(1200);await capture(page,'bedroom-window');
    await page.locator('#balconyView').click();await page.waitForTimeout(600);await capture(page,'balcony');
  }finally{await page.close();}
  const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  observe(mobile);
  try {
    await prepare(mobile);
    await mobile.waitForFunction(()=>window.estate.sceneMetrics().landscape.imagery?.provider==='arcgis',null,{timeout:60000});
    await mobile.waitForTimeout(1200);await capture(mobile,'mobile');
  }finally{await mobile.close();}
}
async function licensedArrival(browser) {
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
  observe(page);
  try {
    await prepare(page,'?');
    const first=await metrics(page),start=Date.now();
    check('Licensed initial arrival opens at geographic scale',first.camera[1]>1000&&first.landscape.regionalImagery?.provider==='arcgis');
    await page.waitForFunction(()=>window.estate.sceneMetrics().motion==='manual',null,{timeout:24000});
    const settled=await metrics(page);
    check('Geographic arrival settles at the building hero',Math.hypot(...settled.camera.map((v,i)=>v-[-173,116,297][i]))<.02);
    await page.locator('#introControl').click();
    await page.waitForFunction(()=>window.estate.sceneMetrics().camera[1]>10000);
    await page.locator('#introControl').click();
    check('Replay and Skip restore the architectural hero',Math.hypot(...(await metrics(page)).camera.map((v,i)=>v-[-173,116,297][i]))<.02);
    report.arrival={initial:first.camera,settled:settled.camera,readyToSettleMs:Date.now()-start};
  }finally{await page.close();}
}
async function finalTouchups(browser) {
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  observe(page);
  let tileResponses=0;
  page.on('response',response=>{if(new URL(response.url()).pathname.includes('/tile/')&&response.ok())tileResponses++;});
  await page.addInitScript(()=>{
    window.hybridInteriorFrames=0;
    window.__THREE_DEVTOOLS__=new EventTarget();
    window.__THREE_DEVTOOLS__.addEventListener('observe',({detail:renderer})=>{
      if(!renderer.isWebGLRenderer)return;
      const draw=renderer.render;
      renderer.render=function(scene,camera){
        const result=draw.call(this,scene,camera);
        if(renderer.domElement.parentElement?.id==='scene')window.hybridInteriorFrames++;
        return result;
      };
    });
  });
  try {
    await prepare(page);
    await page.waitForFunction(()=>window.estate.sceneMetrics().landscape.imagery?.provider==='arcgis',null,{timeout:60000});
    await page.locator('#panelClose').click();
    await page.evaluate(()=>window.estate.goView('front',0));
    await page.waitForTimeout(1500);await capture(page,'hero');await capture(page,'golden-hour');
    await page.evaluate(()=>window.estate.goView('rear',0));
    await page.waitForTimeout(800);await capture(page,'rear-surroundings');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await prepare(page,'?');
    await page.waitForTimeout(4200);await capture(page,'geographic-arrival');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.route('https://ibasemaps-api.arcgis.com/**/tile/**',async route=>{
      await new Promise(resolve=>setTimeout(resolve,750));
      await route.continue().catch(()=>{});
    });
    await page.goto(new URL('?layout=B14&floor=25&view=walk&room=bedroom-1',base).href);
    await page.locator('#windowView').waitFor({timeout:45000});
    await page.locator('#windowAnchor').selectOption(placements.B14.anchors.filter(a=>a.kind==='window'&&a.eye)[1].id);
    await page.locator('#windowView').click();
    await page.evaluate(async()=>{window.apartment=await import(new URL('app.js',document.baseURI));});
    const initial=await page.evaluate(()=>({frames:window.hybridInteriorFrames,camera:window.apartment.getSpatialViewState().camera}));
    const initialTiles=tileResponses;
    await page.waitForTimeout(5500);
    const final=await page.evaluate(()=>({frames:window.hybridInteriorFrames,camera:window.apartment.getSpatialViewState().camera}));
    check('Stationary window view repaints as delayed geographic tiles arrive',tileResponses>initialTiles&&final.frames>initial.frames);
    check('Geographic updates keep the window camera fixed',final.camera.every((v,i)=>Math.abs(v-initial.camera[i])<.00001));
    report.staticWindow={initialFrames:initial.frames,finalFrames:final.frames,arrivingTiles:tileResponses-initialTiles,camera:final.camera};
    await capture(page,'bedroom-window');
    await page.locator('#balconyView').click();await page.waitForTimeout(800);await capture(page,'balcony');
  }finally{await page.close();}
}
async function attribution(browser) {
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  observe(page);
  try {
    await page.goto(new URL('?layout=B14&floor=25&view=walk&room=bedroom-1',base).href);
    await page.locator('#windowView').waitFor({timeout:45000});
    await page.locator('#windowAnchor').selectOption(placements.B14.anchors.filter(a=>a.kind==='window'&&a.eye)[1].id);
    await page.locator('#windowView').click();
    await page.locator('#mapEsriCredit').waitFor({state:'visible',timeout:60000});
    check('Compact map credits and Esri attribution are visible from the apartment window',
      await page.locator('#mapCreditsControl').isVisible() && await page.locator('#mapEsriCredit').isVisible());
    check('Detailed credits live inside the closed map credits dialog',
      await page.locator('#mapCreditsDialog #geographicCredit').count() === 1 && !(await page.locator('#geographicCredit').isVisible()));
    await page.getByRole('button',{name:'Hide interface',exact:true}).click();
    check('Hiding the interface retains compact map credits and Esri attribution',
      await page.locator('#mapCreditsControl').isVisible() && await page.locator('#mapEsriCredit').isVisible());
    await page.locator('#mapCreditsButton').click();
    check('Detailed credits can be opened while the interface is hidden',
      await page.locator('#mapCreditsDialog').isVisible() && await page.locator('#geographicCredit').isVisible());
    await page.locator('#closeMapCredits').click();
    check('Closing map credits removes the detailed strip from the scene',
      !(await page.locator('#mapCreditsDialog').isVisible()) && !(await page.locator('#geographicCredit').isVisible()));
    await page.getByRole('button',{name:'Show interface',exact:true}).click();
    await page.waitForTimeout(800);await capture(page,'bedroom-window');
    await page.locator('#balconyView').click();await page.waitForTimeout(800);await capture(page,'balcony');
  }finally{await page.close();}
  const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,reducedMotion:'reduce'});
  observe(phone);
  try {
    await prepare(phone);
    await phone.locator('#mapEsriCredit').waitFor({state:'visible',timeout:60000});
    check('Mobile exterior retains compact map credits and Esri attribution',
      await phone.locator('#mapCreditsControl').isVisible() && await phone.locator('#mapEsriCredit').isVisible());
    check('Mobile exterior keeps detailed credits inside the closed dialog',
      await phone.locator('#mapCreditsDialog #geographicCredit').count() === 1 && !(await phone.locator('#geographicCredit').isVisible()));
    await phone.locator('#mapCreditsButton').click();
    check('Mobile map credits button opens the full source credits',
      await phone.locator('#mapCreditsDialog').isVisible() && await phone.locator('#geographicCredit').isVisible());
    await phone.locator('#closeMapCredits').click();
    check('Mobile map credits close restores the compact control',
      !(await phone.locator('#mapCreditsDialog').isVisible()) && await phone.locator('#mapCreditsControl').isVisible());
    await phone.waitForTimeout(1000);await capture(phone,'mobile');
  }finally{await phone.close();}
}
async function apartmentViews(browser,licensed=false) {
  const page = await browser.newPage({ viewport:{width:1440,height:900},reducedMotion:'reduce' });
  const log=observe(page); if(!licensed)await config(page);
  try {
    for(const [code,placement] of Object.entries(placements)) {
      const options=placement.anchors.filter(a=>a.kind==='window'&&a.eye);
      const anchor=code==='B14'?options[1]:options[0];
      await page.goto(new URL('?'+new URLSearchParams({layout:code,floor:25,view:'walk',room:anchor.room}),base).href);
      await page.evaluate(async()=>{window.apartment=await import(new URL('app.js',document.baseURI));});
      await page.waitForFunction(()=>window.apartment.getSpatialViewState()?.context&&document.body.classList.contains('walking'),null,{timeout:45000});
      if(licensed){
        await page.evaluate(async()=>{window.estate=await import(new URL('estate-scene.js',document.baseURI));});
        await page.waitForFunction(()=>window.estate.sceneMetrics().landscape.imagery?.provider==='arcgis',null,{timeout:60000});
      }
      if(await page.locator('#windowAnchor').isVisible())await page.locator('#windowAnchor').selectOption(anchor.id);
      await page.locator('#windowView').click();
      const upper=await page.evaluate(()=>window.apartment.getSpatialViewState());
      assert.ok(anchor.candidates.some(p=>Math.hypot(...p.map((v,i)=>v-upper.camera[i]))<.025));
      if(code==='B14')await capture(page,'bedroom-window');
      const lower=placement.floors[0].floor;
      await page.locator('#apartmentFloor').selectOption(String(lower));
      const low=await page.evaluate(()=>window.apartment.getSpatialViewState());
      assert.equal(low.floor,lower);assert.deepEqual(low.camera,upper.camera);assert.ok(low.worldEye[1]<upper.worldEye[1]);
      await page.locator('#balconyView').click();
      const balcony=await page.evaluate(()=>window.apartment.getSpatialViewState());
      assert.ok(balcony.context);
      if(code==='B14')await capture(page,'balcony');
      await page.locator('#buildingReturn').click();
      await page.waitForFunction(()=>!document.body.classList.contains('exploring'));
      report.layouts.push({code,upper:25,lower,window:anchor.id,balcony:balcony.room});
    }
    check('All 13 layouts retain window navigation, floor changes, balcony context and return', report.layouts.length===13);
    check('Apartment views make no Sentinel image requests',!log.sentinel.length);
  } finally { await page.close(); }
}
async function protocol(browser, denial=false) {
  const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});
  const log=observe(page);await config(page,true);
  await page.addInitScript(()=>{
    window.__THREE_DEVTOOLS__=new EventTarget();
    window.__THREE_DEVTOOLS__.addEventListener('observe',({detail:renderer})=>{
      if(!renderer.isWebGLRenderer)return;
      const draw=renderer.render;
      renderer.render=function(scene,camera){
        const result=draw.call(this,scene,camera);
        if(renderer.domElement.parentElement?.id==='estateCanvas')window.fixtureFrame={renderer,scene,camera};
        return result;
      };
    });
  });
  const tile=Buffer.from(await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const c=canvas.getContext('2d');c.fillStyle='#ec00db';c.fillRect(0,0,256,256);return canvas.toDataURL().split(',')[1];
  }),'base64');
  const auth=[];
  await page.route(arcgis,route=>{
    const req=route.request(),u=new URL(req.url());
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
    if(u.hostname==='elevation.arcgis.com')return route.fulfill({status:403,headers:cors,json:{error:{code:403,message:'Local elevation denial fixture'}}});
    if(u.hostname==='ibasemaps-api.arcgis.com')auth.push(u.searchParams.get('token')==='local-hybrid-test-placeholder');
    if(denial)return route.fulfill({status:403,headers:cors,json:{error:{code:403,message:'Local denial fixture'}}});
    if(u.pathname.includes('/tilemap/'))return route.fulfill({headers:cors,json:{data:Array(64).fill(1)}});
    if(u.pathname.includes('/tile/'))return route.fulfill({headers:cors,contentType:'image/png',body:tile});
    if(u.pathname.endsWith('/4/query'))return route.fulfill({headers:cors,json:{features:[{attributes:{SRC_RES:.31,MaxMapLevel:19}}]}});
    return route.fulfill({headers:cors,json:{copyrightText:'Local protocol fixture',tileInfo:{rows:256,cols:256,spatialReference:{wkid:3857},lods:[{level:12},{level:19}]}}});
  });
  try {
    await prepare(page);
    if(denial){
      await page.waitForFunction(()=>/unavailable|authorization/i.test(window.estate.sceneMetrics().landscape.imagery?.reason||''),null,{timeout:20000});
      const state=await metrics(page);
      check('Denied Esri service preserves a rendered architectural environment',state.triangles>10000&&log.arcgis.length>0&&!log.sentinel.length);
      report.denial={fixture:true,requests:log.arcgis.length,landscape:state.landscape};
    } else {
      await page.waitForFunction(()=>{const m=window.estate.sceneMetrics().landscape.imagery;return m?.provider==='arcgis'&&m.visibleTiles>6&&m.highestVisibleZoom>12;},null,{timeout:30000});
      await page.evaluate(async()=>{await window.estate.authorView([450,900,600],[0,0,0],false,true);await window.estate.setMood('day');});
      await page.waitForFunction(()=>window.estate.sceneMetrics().landscape.imagery?.visibleTiles>6,null,{timeout:30000});
      await page.waitForTimeout(1200);
      const pixelSample=await page.evaluate(()=>{
        const {renderer,scene,camera}=window.fixtureFrame;
        const fog=scene.fog;
        scene.fog=null;
        renderer.render(scene,camera);
        const canvas=document.createElement('canvas');canvas.width=160;canvas.height=100;
        const context=canvas.getContext('2d');context.drawImage(renderer.domElement,0,0,160,100);
        const rgba=context.getImageData(0,0,160,100).data;
        scene.fog=fog;
        renderer.render(scene,camera);
        let count=0, maximumRedBlueRatio=0;const colors=[];
        for(let i=0;i<rgba.length;i+=4){
          if(rgba[i]>90&&rgba[i+2]>80&&rgba[i]>rgba[i+1]*1.6&&rgba[i+2]>rgba[i+1]*1.5)count++;
          maximumRedBlueRatio=Math.max(maximumRedBlueRatio,Math.min(rgba[i],rgba[i+2])/Math.max(1,rgba[i+1]));
          if(i%1600===0)colors.push(Array.from(rgba.slice(i,i+4)));
        }
        return {matchingPixels:count,maximumRedBlueRatio,colors};
      });
      const matchingPixels=pixelSample.matchingPixels;
      const state=await metrics(page),tiles=imagery(state);
      check('Intercepted ArcGIS protocol loads authenticated tiles through the renderer',auth.length>0&&auth.every(Boolean)&&tiles.visibleTiles>0);
      report.fixturePixelSample={...pixelSample,imagery:tiles,camera:state.camera};
      check('Synthetic imagery reaches the terrain framebuffer',matchingPixels>25);
      check('Tile protocol produces no shader compilation errors',!log.errors.length);
      await page.evaluate(async()=>{
        await window.estate.getExteriorLandscape().regionReady;
        await window.estate.goView('regional',0);
      });
      await page.waitForFunction(()=>window.estate.sceneMetrics().landscape.regionalImagery?.visibleTiles>0,null,{timeout:30000});
      const regional=await metrics(page);
      check('Regional terrain also receives intercepted ArcGIS imagery',regional.landscape.regionalImagery.visibleTiles>0&&regional.camera[1]>10000);
      report.protocol={fixture:'Synthetic local tiles with fog disabled only during sampler readback. No coverage or appearance claim.',requests:log.arcgis.length,matchingPixelsIn160x100:matchingPixels,imagery:tiles,regional:regional.landscape.regionalImagery};
    }
  } finally {await page.close();}
}
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome'});
 report.browser=browser.version();
 try {
   const mode=process.argv[2];
   if(!mode||mode==='capture')await captureAndOrbit(browser);
   if(mode==='performance')await performanceRun(browser);
   if(mode==='performance-live')await performanceRun(browser,true);
   if(mode==='licensed')await licensedCapture(browser);
   if(mode==='arrival')await licensedArrival(browser);
   if(mode==='touchups')await finalTouchups(browser);
   if(mode==='attribution')await attribution(browser);
   if(!mode||mode==='apartments')await apartmentViews(browser);
   if(mode==='apartments-live')await apartmentViews(browser,true);
   if(!mode||mode==='protocol'){await protocol(browser);await protocol(browser,true);}
   check('No uncaught browser or shader errors',!report.errors.length);
 }catch(error){report.failed.push(error.message);throw error;}
 finally {fs.writeFileSync(path.join(folder,'report'+(process.argv[2]?'-'+process.argv[2]:'')+'.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
