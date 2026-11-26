const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.BRIGADE_QA_URL || 'http://127.0.0.1:5173/experience/';
const destination = path.join(__dirname,'../qa/architectural-refresh.json');
const profiles = [
  ['desktop',1920,1080,1,false],
  ['tablet viewport',820,1180,2,true],
  ['phone viewport',390,844,2,true],
  ['kiosk viewport',2560,1440,1,false],
];

const metrics = page => page.evaluate(() => window.architectureQA.sceneMetrics());

async function open(page, query = '') {
  await page.goto(base + query);
  await page.locator('.estate-canvas-ready').waitFor({timeout:25000});
  await page.evaluate(async () => {
    window.architectureQA = await import(new URL('estate-scene.js',document.baseURI));
  });
}

async function viewport(browser, name, width, height, deviceScaleFactor, touch) {
  const page = await browser.newPage({
    viewport:{width,height}, deviceScaleFactor, hasTouch:touch, isMobile:touch,
    reducedMotion:'reduce',
  });
  try {
    await open(page);
    const info = await page.evaluate(() => {
      const canvas = document.querySelector('#estateCanvas canvas');
      const gl = canvas.getContext('webgl2');
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        fits:document.documentElement.scrollWidth <= innerWidth,
        canvasHeight:canvas.clientHeight,
        gpu:debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      };
    });
    assert.ok(info.fits && info.canvasHeight >= height-2);
    const frame = await metrics(page);
    assert.ok(frame.imagery && frame.triangles > 10000);
    return {name,width,height,deviceScaleFactor,touch,...info,detail:frame.detail};
  } finally {
    await page.close();
  }
}

async function buyerFlows(browser, report) {
  const page = await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const errors = [];
  page.on('pageerror',error => errors.push(error.message));
  try {
    await open(page,'?scene=towers&wing=A');
    await page.getByRole('button',{name:'Floor 12',exact:true}).click();
    assert.equal(await page.locator('.unit-chips button').count(),6);
    assert.equal((await metrics(page)).floor,12);
    await page.getByRole('button',{name:'Floor 17',exact:true}).click();
    assert.equal(await page.locator('.unit-chips button').count(),7);
    await page.locator('#estatePanelContent').getByRole('button',{name:'Wing B',exact:true}).click();
    await page.getByRole('button',{name:'Floor 22',exact:true}).click();
    assert.equal(await page.locator('.unit-chips button').count(),6);
    await page.getByRole('button',{name:'Explore design B10 on floor 22',exact:true}).click();
    await page.locator('#layoutInfo').getByText('Residence B10',{exact:true}).waitFor();
    report.checks.push('Wing A refuge and typical plate, Wing B floor 22, B10 selection');

    await open(page,'?amenity=clubhouse');
    await page.getByRole('button',{name:'Rooftop pool',exact:true}).click();
    assert.ok((await metrics(page)).camera[1] < 32);
    await open(page,'?amenity=sky-deck');
    await page.getByRole('button',{name:'Sky Deck garden',exact:true}).click();
    assert.ok((await metrics(page)).camera[1] > 179);
    await open(page,'?amenity=eco-deck');
    await page.getByRole('button',{name:'Eco Deck fire garden',exact:true}).click();
    assert.ok((await metrics(page)).camera[1] < 20);
    report.checks.push('Clubhouse pool, Sky Deck garden and Eco Deck fire garden camera presets');

    await page.locator('#estateLight').click();
    await page.locator('#estateMoods button[data-mood=evening]').click();
    assert.equal((await metrics(page)).mood,'evening');
    await page.locator('#estateLight').click();
    await page.locator('#estateQuality').selectOption('performance');
    await page.waitForFunction(() => window.architectureQA.sceneMetrics().detail === 'low');
    await page.locator('#estateQuality').selectOption('high');
    await page.waitForFunction(() => window.architectureQA.sceneMetrics().detail === 'full');
    report.checks.push('Evening lighting and live Performance/High quality switching');

    await open(page,'?layout=A3&view=dollhouse');
    await page.locator('body.exploring #scene canvas').waitFor({timeout:25000});
    assert.ok(await page.locator('#dollhouseButton').isVisible());
    await page.locator('#walkButton').click();
    await page.locator('body.walking').waitFor();
    report.checks.push('Shared A3 dollhouse and walkthrough entry');

    assert.deepEqual(errors,[]);
  } finally {
    await page.close();
  }
  const city = await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
  try {
    await open(city,'?scene=journey');
    await city.waitForFunction(() => window.architectureQA.sceneMetrics().detail === 'geographic',{timeout:20000});
    await city.locator('#skipCityFlight').click();
    await city.locator('#cityFlightHud').waitFor({state:'hidden'});
    report.checks.push('Geographic arrival asset lazy load and flight skip');
  } finally {
    await city.close();
  }
  const fallback = await browser.newPage({viewport:{width:1440,height:900}});
  try {
    await fallback.route('**/sentinel/overview.webp',route => route.abort());
    await fallback.goto(base);
    await fallback.getByRole('button',{name:'Retry 3D'}).waitFor();
    assert.equal(await fallback.locator('#estateCanvas .estate-canvas-ready').count(),0);
    report.checks.push('Interrupted base imagery holds the still fallback and exposes Retry 3D');
  } finally {
    await fallback.close();
  }
}

async function main() {
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome'});
  try {
    const report = {tested:new Date().toISOString(),browser:browser.version(),profiles:[],checks:[]};
    for (const profile of profiles) report.profiles.push(await viewport(browser,...profile));
    await buyerFlows(browser,report);
    fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
    console.log(report);
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode=1; });
