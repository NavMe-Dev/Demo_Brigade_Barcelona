const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const views = require('./architectural-views.json');
const base = process.env.BRIGADE_QA_URL || 'http://127.0.0.1:5173/experience/';
const output = process.env.BRIGADE_VISUAL_REPORT || path.join(__dirname,'../qa/evidence/architectural-comparison');
const decks = new Set(['sky-deck','eco-deck','clubhouse']);

async function load(page) {
  const url = new URL(base);
  url.searchParams.set('scene', 'towers');
  await page.goto(url.href);
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
  const report = {};
  try {
    await page.addInitScript(() => {
      window.exteriorOcclusion = new Set();
      window.__THREE_DEVTOOLS__ = new EventTarget();
      window.__THREE_DEVTOOLS__.addEventListener('observe', ({ detail: renderer }) => {
        if (!renderer.isWebGLRenderer) return;
        const render = renderer.render;
        renderer.render = function (scene, camera) {
          const result = render.call(this, scene, camera);
          if (renderer.domElement.parentElement?.id === 'estateCanvas') {
            scene.traverseVisible((mesh) => {
              if (!mesh.isMesh || !mesh.geometry.getAttribute('uv1')) return;
              for (const material of [].concat(mesh.material)) {
                if (material.aoMap?.channel === 1) window.exteriorOcclusion.add(material.name);
              }
            });
          }
          return result;
        };
      });
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await load(page);
    await page.waitForFunction(() => window.captureScene.sceneMetrics()?.detail === 'full');
    await page.locator('#scenePins button').last().waitFor({state:'visible'});
    const visiblePins = await page.locator('#scenePins button:visible').allTextContents();
    if (visiblePins.join(',') !== 'Wing A,Wing B') throw Error('Both wing markers must be visible');
    report.desktopWingMarkers = visiblePins;
    report.secondaryUvOcclusion = await page.evaluate(() => [...window.exteriorOcclusion]);
    if (!report.secondaryUvOcclusion.length) throw Error('Browser draw did not use the podium occlusion UV set');
    await page.screenshot({path:path.join(output,'desktop.jpg'),quality:92});
    await page.getByRole('button', { name: 'Real-world Location', exact: true }).click();
    await page.waitForFunction(() => window.captureScene.sceneMetrics()?.presentation === 'location');
    await page.waitForTimeout(1800);
    report.locationImageryProvider = await page.evaluate(() => window.captureScene.sceneMetrics().gis.imagery.provider);
    await page.screenshot({path:path.join(output,'location.jpg'),quality:92});
    await page.getByRole('button', { name: 'Architectural Showcase', exact: true }).click();
    await page.waitForFunction(() => window.captureScene.sceneMetrics()?.presentation === 'showcase');
    await page.addStyleTag({
      content:'body > :not(#estateScene), .estate-shade, #scenePins { visibility:hidden!important }',
    });
    for (const [name,pose] of Object.entries(views)) {
      const frame = await page.evaluate(async ({camera,target,light,deck}) => {
        const scene = window.captureScene;
        const before = scene.sceneMetrics().renderedFrames;
        scene.setSection(deck ? 'amenities' : 'masterplan',deck);
        await Promise.all([scene.setMood(light), scene.authorView(camera,target,true,true)]);
        return before;
      },{...pose,deck:decks.has(name) ? name : ''});
      await page.waitForFunction(before => window.captureScene.sceneMetrics().renderedFrames > before, frame);
      await page.waitForTimeout(650);
      await page.locator('#estateScene').screenshot({
        path:path.join(output,name+'-browser.jpg'),quality:92,
      });
    }
    for (const [label, light] of [['daylight','day'], ['golden-hour','sunset']]) {
      const crown = views['facade-crown'];
      await page.evaluate(async ({ crown, light }) => {
        const scene = window.captureScene;
        scene.setSection('masterplan');
        await Promise.all([scene.setMood(light), scene.authorView(crown.camera,crown.target,true,true)]);
      }, { crown, light });
      await page.waitForTimeout(300);
      await page.locator('#estateScene').screenshot({
        path:path.join(output,'materials-'+label+'.jpg'),quality:92,
      });
    }
    if (errors.length) throw Error(errors.join('\n'));
  } finally {
    await page.close();
  }

  const phone = await browser.newPage({
    viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,reducedMotion:'reduce',
  });
  try {
    await load(phone);
    report.mobileWingMarkers = await phone.locator('#scenePins button:visible').allTextContents();
    if (report.mobileWingMarkers.join(',') !== 'Wing A,Wing B') throw Error('Both mobile wing markers must be visible');
    await phone.screenshot({path:path.join(output,'mobile.jpg'),quality:92});
  } finally {
    await phone.close();
  }
  fs.writeFileSync(path.join(output,'capture.json'),JSON.stringify(report,null,2)+'\n');
}

(async () => {
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome'});
  try {
    await capture(browser);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
