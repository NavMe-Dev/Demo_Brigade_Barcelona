const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BRIGADE_QA_URL || 'http://127.0.0.1:5173/';
const output = process.env.BRIGADE_VISUAL_REPORT || path.join(__dirname,'../qa/evidence/showcase-only');
const forbidden = /\/assets\/geography\/|\/vendor\/maplibre\/|\/(?:geo-|gis-|regional-)[^/]+\.js|\/data\/arcgis-runtime\.json|arcgis\.com|openstreetmap\.org/i;
fs.mkdirSync(output,{recursive:true});

async function start(browser, phone, network, errors) {
  const page=await browser.newPage({
    viewport:phone?{width:390,height:844}:{width:1920,height:1080},
    hasTouch:phone,isMobile:phone,deviceScaleFactor:phone?2:1,reducedMotion:'reduce',
  });
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/*',route=>{
    const url=route.request().url();
    network.add(url);
    return forbidden.test(url)?route.abort():route.continue();
  });
  await page.goto(new URL('?scene=towers',base).href);
  await page.locator('.estate-canvas-ready').waitFor({timeout:30000});
  await page.evaluate(async()=>{window.estate=await import(new URL('estate-scene.js',document.baseURI));});
  await page.waitForFunction(()=>window.estate.sceneMetrics()?.landscape?.plantingTiles>0);
  return page;
}
const shot=(page,name)=>page.screenshot({path:path.join(output,name+'.jpg'),quality:92});
const metrics=page=>page.evaluate(()=>window.estate.sceneMetrics());

(async()=>{
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome'});
  const errors=[],network=new Set();
  try{
    const page=await start(browser,false,network,errors);
    await page.waitForFunction(()=>window.estate.sceneMetrics().detail==='full' &&
      window.estate.sceneMetrics().landscape.specimenBatches>0);
    const report={browser:browser.version(),desktop:await metrics(page)};
    assert.equal(report.desktop.mood,'sunset');
    assert.equal(report.desktop.landscape.terrainIndirect,true);
    assert.deepEqual(await page.locator('#scenePins button:visible').allTextContents(),['Wing A','Wing B']);
    await shot(page,'hero-golden-hour');
    await page.locator('#panelClose').click();
    const viewpoints = [
      ['aerial-masterplan','aerial'],['front-road','frontage'],['rear-surroundings','rear'],
      ['entrance','entrance'],['street','street'],['clubhouse','clubhouse'],['pool','pool'],
      ['eco-deck','ecoGarden'],['sky-deck','skyGarden'],
    ];
    for (const [name,key] of viewpoints) {
      await page.evaluate(key=>window.estate.goView(key,0),key);
      await page.waitForTimeout(360);
      await shot(page,name);
    }
    await page.evaluate(async()=>{await Promise.all([window.estate.goView('front',0),window.estate.setMood('night')]);});
    await page.waitForTimeout(360);
    await shot(page,'night');
    await page.evaluate(async()=>{await window.estate.setMood('sunset');});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>{
      window.angles=[];
      window.estate.orbitBuilding();
      window.sampler=setInterval(()=>{
        const {camera,target}=window.estate.sceneMetrics();
        window.angles.push(Math.atan2(camera[0]-target[0],camera[2]-target[2]));
      },100);
    });
    for(let i=0;i<8;i++){await page.waitForTimeout(1550);await shot(page,'orbit-'+i);}
    const angles=await page.evaluate(()=>{clearInterval(window.sampler);return window.angles;});
    const angle=angles.slice(1).reduce((sum,value,i)=>sum+Math.atan2(Math.sin(value-angles[i]),Math.cos(value-angles[i])),0);
    report.orbitDegrees=Math.round(Math.abs(angle)*180/Math.PI);
    assert.ok(report.orbitDegrees>=356);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(new URL('?scene=journey',base).href);
    await page.waitForFunction(()=>document.body.dataset.section==='towers');
    await page.goto(new URL('?scene=location',base).href);
    await page.waitForFunction(()=>document.querySelector('#estatePanelContent').textContent.includes('Plot No 20'));
    await page.goto(new URL('?layout=A3&room=deck',base).href);
    const outlook=page.getByRole('button',{name:'Look out from the deck',exact:true});
    await outlook.waitFor({timeout:35000});
    await page.waitForFunction(()=>document.body.classList.contains('walking'));
    await outlook.click();
    await page.getByText('Illustrative landscape outlook.',{exact:true}).waitFor();
    await page.locator('#buildingReturn').click();
    await page.waitForFunction(()=>document.body.dataset.section==='towers'&&!document.body.classList.contains('exploring'));
    report.retainedBalconyOutlook=true;
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(async()=>{
      const estate=await import(new URL('estate-scene.js',document.baseURI));
      await estate.authorView([-173,116,297],[0,85,8],false,true);
    });
    await page.addStyleTag({content:'body > :not(#estateScene), .estate-shade, #scenePins {visibility:hidden!important}'});
    await page.waitForTimeout(350);
    await shot(page,'poster-desktop');
    await page.close();
    const phone=await start(browser,true,network,errors);
    assert.equal(await phone.locator('#estatePanel').isHidden(),true);
    assert.deepEqual(await phone.locator('#scenePins button:visible').allTextContents(),['Wing A','Wing B']);
    report.mobile=await metrics(phone);
    await shot(phone,'mobile');
    await phone.addStyleTag({content:'body > :not(#estateScene), .estate-shade, #scenePins {visibility:hidden!important}'});
    await phone.waitForTimeout(220);
    await shot(phone,'poster-mobile');
    await phone.close();
    report.requests=network.size;
    report.gisRequests=[...network].filter(url=>forbidden.test(url));
    report.errors=errors;
    assert.deepEqual(report.gisRequests,[]);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'capture.json'),JSON.stringify(report,null,2)+'\n');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
