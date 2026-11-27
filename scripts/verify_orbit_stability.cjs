const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const origin = process.env.BRIGADE_URL || 'http://127.0.0.1:5173';
const evidence = path.join(__dirname, '../qa/evidence/orbit-stability');
const report = { scenarios: [], errors: [], gisRequests: [] };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    async function open(page) {
      page.on('pageerror', error => report.errors.push(error.message));
      page.on('request', request => {
        if (/\/assets\/geography\/|arcgis|sentinel|esri\.com/i.test(request.url())) report.gisRequests.push(request.url());
      });
      await page.goto(origin + '/?scene=towers');
      await page.locator('.estate-canvas-ready').waitFor();
      await page.evaluate(async () => { window.site = await import('/estate-scene.js'); });
    }
    const metrics = page => page.evaluate(() => site.sceneMetrics());
    const go = (page, view) => page.evaluate(async view => site.goView(view, 0), view);
    const verified = (name, data) => report.scenarios.push({ name, ...data });
    const radius = m => Math.hypot(...m.camera.map((v, i) => v - m.target[i]));
    await open(desktop);
    report.browser = browser.version();
    let x = 850, y = 455;
    const mouse = desktop.mouse;
    async function begin() { await mouse.move(x,y); await mouse.down(); }
    async function step(dx, dy = 0, steps = 1) {
      x += dx; y += dy;
      await mouse.move(x,y,{steps});
    }
    for (const direction of [1,-1]) for (const slow of [true,false]) {
      await go(desktop,'front');
      x=850;y=455;
      const before=await metrics(desktop);
      await begin();
      if (slow) {
        for(let j=0;j<12;j++){await step(direction*20);await delay(27);}
      } else await step(direction*240,0,3);
      await mouse.up();
      await delay(450);
      const after=await metrics(desktop);
      assert.deepEqual(after.target,before.target);
      assert.ok(Math.hypot(...after.camera.map((v,i)=>v-before.camera[i]))>25);
      verified((slow?'Slow ':'Fast ')+(direction===1?'clockwise':'anticlockwise'),{cameraUpdates:after.cameraUpdates-before.cameraUpdates});
    }
    await go(desktop,'aerial');
    x=860;y=430;
    await begin();await step(200,90,10);await step(-260,-110,8);await mouse.up();
    await desktop.evaluate(async()=>{await site.goView('street');});
    assert.ok((await metrics(desktop)).camera[1]<3);
    verified('Aerial to street and rapid direction changes');
    await go(desktop,'front');
    x=800;y=435;
    const prior=await metrics(desktop);
    await begin();await step(70,0,7);await mouse.wheel(0,-480);await delay(420);
    const closer=await metrics(desktop);
    assert.ok(radius(closer)<radius(prior)*.95);
    await step(-135,0,6);await mouse.wheel(0,480);await mouse.up();await delay(450);
    assert.ok(radius(await metrics(desktop))>radius(closer)*1.05);
    verified('Zoom in and out during rotation');
    await desktop.evaluate(()=>site.orbitBuilding());
    await desktop.waitForFunction(()=>site.sceneMetrics().motion==='orbit');
    await desktop.evaluate(()=>site.toggleOrbitPause());
    const paused=await metrics(desktop);
    await delay(360);
    assert.deepEqual((await metrics(desktop)).camera,paused.camera);
    await desktop.evaluate(()=>site.toggleOrbitPause());
    await delay(500);
    assert.notDeepEqual((await metrics(desktop)).camera,paused.camera);
    x=850;y=430;
    await begin();await step(140,0,8);await mouse.up();
    assert.equal((await metrics(desktop)).motion,'manual');
    verified('Pause, resume and manual interruption');
    await desktop.evaluate(()=>site.orbitBuilding());
    await desktop.waitForFunction(()=>site.sceneMetrics().motion==='orbit');
    await desktop.locator('#estatePanel button').getByText('Wing B',{exact:true}).click();
    await desktop.waitForFunction(()=>site.sceneMetrics().wing==='B'&&site.sceneMetrics().motion==='manual');
    await desktop.evaluate(()=>site.setMood('night'));
    assert.equal((await metrics(desktop)).mood,'night');
    verified('Wing selection during orbit and night lighting');
    await desktop.screenshot({ path:path.join(evidence,'night-wing.jpg') });
    for(const width of [390,820]) {
      const page=await browser.newPage({viewport:{width,height:844},hasTouch:true,isMobile:true});
      await open(page);
      await go(page,'front');
      const before=await metrics(page), cdp=await page.context().newCDPSession(page);
      const touch=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
      const center=Math.round(width*.62);
      await touch('touchStart',[{x:center,y:405}]);
      for(let i=1;i<=8;i++)await touch('touchMove',[{x:center-i*13,y:405}]);
      await touch('touchEnd',[]);
      await delay(400);
      const turned=await metrics(page);
      assert.notDeepEqual(turned.camera,before.camera);
      await touch('touchStart',[{x:center-28,y:385,id:1},{x:center+28,y:452,id:2}]);
      for(let i=1;i<=7;i++)await touch('touchMove',[{x:center-28-i*5,y:385,id:1},{x:center+28+i*5,y:452,id:2}]);
      await touch('touchEnd',[]);
      await delay(420);
      assert.ok(radius(await metrics(page))<radius(turned)*.98);
      verified(width+' px touch emulation drag and pinch');
      await page.close();
    }
    await desktop.goto(origin+'/?layout=B14&floor=25&view=walk&room=bedroom-1');
    await desktop.locator('#windowView').waitFor();
    await desktop.locator('#windowView').click();
    await desktop.locator('#buildingReturn').click();
    await desktop.waitForFunction(()=>!document.body.classList.contains('exploring'));
    verified('B14 window viewpoint, apartment entry and return');
    await open(desktop);
    await go(desktop,'front');
    const initial=await metrics(desktop);
    const endurance=await desktop.evaluate(async()=>{
      const frames=[], start=performance.now();
      site.orbitBuilding();
      return new Promise(resolve=>{
        function sample(now){
          const m=site.sceneMetrics();
          frames.push([now-start,m.renderedFrames,m.cameraUpdates,m.motion,m.camera,m.target,m.detail]);
          if(now-start>60000)return resolve({frames,metrics:m,heap:performance.memory?.usedJSHeapSize});
          if(m.motion==='manual')site.orbitBuilding();
          requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
    });
    assert.ok(endurance.frames.some(f=>f[3]==='orbit'));
    assert.ok(endurance.metrics.renderedFrames-initial.renderedFrames>600);
    report.endurance=endurance;
    verified('60 seconds of successive full automatic orbits');
    assert.deepEqual(report.errors,[]);
    assert.deepEqual(report.gisRequests,[]);
  } finally {
    fs.mkdirSync(evidence,{recursive:true});
    fs.writeFileSync(path.join(evidence,'scenarios.json'),JSON.stringify(report));
    await browser.close();
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
