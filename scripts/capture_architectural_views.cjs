const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const views = require('./architectural-views.json');
const base = process.env.BRIGADE_QA_URL || 'http://127.0.0.1:5173/experience/';
const output = path.join(__dirname,'../qa/evidence/architectural-comparison');
const decks = new Set(['sky-deck','eco-deck','clubhouse']);

async function load(page) {
  await page.goto(base);
  await page.locator('.estate-canvas-ready').waitFor({timeout:40000});
  await page.evaluate(async () => {
    window.captureScene = await import(new URL('estate-scene.js',document.baseURI));
  });
}

async function capture(browser) {
  fs.mkdirSync(output,{recursive:true});
  const page = await browser.newPage({
    viewport:{width:1920,height:1080},reducedMotion:'reduce',
  });
  try {
    await load(page);
    await page.screenshot({path:path.join(output,'desktop.jpg'),quality:92});
    await page.addStyleTag({
      content:'body > :not(#estateScene), .estate-shade, #scenePins { visibility:hidden!important }',
    });
    for (const [name,pose] of Object.entries(views)) {
      const frame = await page.evaluate(({camera,target,light,deck}) => {
        const scene = window.captureScene;
        const before = scene.sceneMetrics().renderedFrames;
        scene.setSection(deck ? 'amenities' : 'masterplan',deck);
        scene.setMood(light);
        scene.authorView(camera,target,true);
        return before;
      },{...pose,deck:decks.has(name) ? name : ''});
      await page.waitForFunction(before => window.captureScene.sceneMetrics().renderedFrames > before, frame);
      await page.waitForTimeout(650);
      await page.locator('#estateScene').screenshot({
        path:path.join(output,name+'-browser.jpg'),quality:92,
      });
    }
  } finally {
    await page.close();
  }

  const phone = await browser.newPage({
    viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,reducedMotion:'reduce',
  });
  try {
    await load(phone);
    await phone.screenshot({path:path.join(output,'mobile.jpg'),quality:92});
  } finally {
    await phone.close();
  }
}

(async () => {
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome'});
  try {
    await capture(browser);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
