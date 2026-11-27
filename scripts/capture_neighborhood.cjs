const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.BRIGADE_QA_URL || 'http://127.0.0.1:5173/';
const output = process.env.BRIGADE_VISUAL_REPORT || path.join(__dirname,'../qa/evidence/neighborhood-rebuild');
fs.mkdirSync(output,{recursive:true});

async function open(browser, viewport, phone = false) {
  const page = await browser.newPage({viewport, reducedMotion:'reduce',
    isMobile:phone, hasTouch:phone, deviceScaleFactor:phone?2:1});
  const errors = [];
  page.on('pageerror', error=>errors.push(error.message));
  page.on('console', message=>{ if (message.type()==='error') errors.push(message.text()); });
  await page.goto(new URL('?scene=towers',base).href);
  await page.locator('.estate-canvas-ready').waitFor({timeout:30000});
  await page.evaluate(async()=>{ window.estate = await import(new URL('estate-scene.js',document.baseURI)); });
  await page.waitForFunction(()=>window.estate.sceneMetrics()?.gis?.roads?.ready);
  return {page, errors};
}

const metrics = page => page.evaluate(()=>window.estate.sceneMetrics());
const shot = (page,name) => page.screenshot({path:path.join(output,name+'.jpg'),quality:92});

(async()=>{
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome'});
  try {
    const {page,errors} = await open(browser,{width:1920,height:1080});
    await page.waitForFunction(()=>window.estate.sceneMetrics().detail === 'full' &&
      window.estate.sceneMetrics().gis.roads.visibleTiles > 10);
    const report = { browser:browser.version(), showcase:await metrics(page) };
    assert.deepEqual(await page.locator('#scenePins button:visible').allTextContents(),['Wing A','Wing B']);
    await shot(page,'hero');
    await page.evaluate(()=>window.estate.goView('overview',0));
    await shot(page,'archived-camera');
    for (const [name,action] of [
      ['front-road','Front Road'], ['entrance','Main entrance'], ['street','Street-level view'],
      ['neighborhood','Neighborhood View'],
    ]) {
      await page.getByRole('button',{name:action,exact:true}).click();
      await page.waitForTimeout(550);
      await shot(page,name);
    }
    await page.evaluate(()=>window.estate.goView('rear',0));
    await page.waitForTimeout(800);
    await shot(page,'rear');
    await page.evaluate(()=>window.estate.goView('front',0));
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>{
      window.orbitAngles = [];
      window.estate.orbitBuilding();
      window.orbitSampler = setInterval(()=>{
        const {camera,target} = window.estate.sceneMetrics();
        window.orbitAngles.push(Math.atan2(camera[0]-target[0],camera[2]-target[2]));
      },100);
    });
    for (let i = 0;i<8;i++) {
      await page.waitForTimeout(1550);
      await shot(page,'orbit-'+i);
    }
    const angles = await page.evaluate(()=>{
      clearInterval(window.orbitSampler);
      return window.orbitAngles;
    });
    const angularDistance = angles.slice(1).reduce((total,value,i)=>
      total+Math.atan2(Math.sin(value-angles[i]),Math.cos(value-angles[i])),0);
    assert.ok(Math.abs(angularDistance) > 5.7, 'Actual camera must complete almost a full revolution during sampling');
    report.orbitDegreesObserved = Math.round(Math.abs(angularDistance)*180/Math.PI);
    await page.emulateMedia({reducedMotion:'reduce'});
    for (const [name,mood,view] of [['golden-hour','sunset','front'],['night','night','entrance']]) {
      await page.evaluate(async ({mood,view})=>{
        await Promise.all([window.estate.setMood(mood),window.estate.goView(view,0)]);
      },{mood,view});
      await page.waitForTimeout(400);
      await shot(page,name);
    }
    await page.evaluate(()=>window.estate.setMood('day'));
    await page.getByRole('button',{name:'Real-world Location',exact:true}).click();
    await page.waitForFunction(()=>window.estate.sceneMetrics().presentation === 'location');
    await page.waitForTimeout(950);
    await shot(page,'location');
    report.location = await metrics(page);
    assert.deepEqual(errors,[]);
    await page.close();

    const phone = await open(browser,{width:390,height:844},true);
    await shot(phone.page,'mobile');
    report.mobile = await metrics(phone.page);
    assert.deepEqual(phone.errors,[]);
    await phone.page.close();
    fs.writeFileSync(path.join(output,'capture.json'),JSON.stringify(report,null,2)+'\n');
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
