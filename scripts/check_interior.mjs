// Run against the local static server. PLAYWRIGHT_MODULE may point to a local Playwright installation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BRIGADE_QA_URL || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--ignore-gpu-blocklist', '--enable-webgl'],
});
const report = { captured: new Date().toISOString(), browser: browser.version(), viewports: [] };
async function observe(page) {
  await page.addInitScript(() => {
    window.__THREE_DEVTOOLS__ = new EventTarget();
    window.__THREE_DEVTOOLS__.addEventListener('observe', (event) => {
      const r = event.detail;
      if (!r.isWebGLRenderer) return;
      const render = r.render;
      r.render = function (scene, cam) {
        if (r.domElement.parentElement?.id === 'scene') window.roomRender = { r, cam, scene };
        return render.call(this, scene, cam);
      };
    });
  });
}
try {
  for (const [width, height] of [
    [1920, 1080],
    [390, 844],
    [360, 800],
    [430, 932],
    [820, 1180],
    [1180, 820],
    [844, 390],
  ]) {
    console.log('Checking ' + width + ' × ' + height);
    const p = await browser.newPage({
      viewport: { width, height },
      hasTouch: width < 1920,
      deviceScaleFactor: width < 1920 ? 2 : 1,
    });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await observe(p);
    await p.goto(base + '?view=walk&room=primary-bedroom');
    await p.waitForFunction(
      () =>
        window.roomRender?.r.info.render.triangles > 500 &&
        document.body.classList.contains('walking') &&
        document.querySelector('#skipInterior').hidden &&
        document.querySelector('#roomName').textContent.toLowerCase().includes('primary'),
    );
    const results = await p.evaluate(async () => {
      const { r } = window.roomRender,
        gl = r.getContext(),
        debug = gl.getExtension('WEBGL_debug_renderer_info');
      const samples = [];
      let start = performance.now();
      for (let i = 0; i < 65; i++) {
        window.roomRender.cam.rotateY(0.0018);
        const t = await new Promise(requestAnimationFrame);
        if (i > 4) samples.push(t - start);
        start = t;
      }
      samples.sort((a, b) => a - b);
      return {
        driver: gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),
        webgl: gl.getParameter(gl.VERSION),
        triangles: r.info.render.triangles,
        drawCalls: r.info.render.calls,
        geometries: r.info.memory.geometries,
        textures: r.info.memory.textures,
        jsHeapUsedBytes: performance.memory?.usedJSHeapSize,
        pixelRatio: r.getPixelRatio(),
        frameMsMedian: samples[30],
        frameMsP95: samples[56],
      };
    });
    assert.equal(await p.locator('#interiorFilmstrip button').count(), 13);
    if (width === 1920 || width === 390)
      await p.screenshot({
        path: new URL('../qa/evidence/a3-bedroom-' + width + '.png', import.meta.url).pathname,
      });
    await p.locator('#planButton').click();
    assert.equal(await p.locator('#planDialog svg polygon').count(), 13);
    assert.match(await p.locator('#planDialog svg g').getAttribute('transform'), /rotate/);
    await p.locator('#planDialog polygon[aria-label="Take me to Kitchen"]').click();
    if (width === 1920) {
      await p.waitForURL(/room=kitchen/, { timeout: 25000 });
      await p.locator('#cardToggle').click();
      await p.locator('[data-light=evening]').click();
      assert.equal(await p.locator('[data-light=evening]').getAttribute('aria-pressed'), 'true');
      await p.locator('#tourButton').click();
      await p.locator('#pauseTour').click();
      const position = () => p.evaluate(() => window.roomRender.cam.position.toArray());
      const frozen = await position();
      await p.waitForTimeout(250);
      assert.deepEqual(await position(), frozen);
      await p.locator('#pauseTour').click();
      await p.locator('#exitTour').click();
      await p.locator('#motionButton').click();
      await p.locator('#roomList [data-room=deck]').click();
      await p.locator('#balconyView').click();
      await p.locator('.view-source').waitFor({ state: 'visible' });
      const before = await position();
      await p.keyboard.down('ArrowRight');
      await p.waitForTimeout(230);
      await p.keyboard.up('ArrowRight');
      assert.notDeepEqual(await position(), before);
      await p.locator('#dollhouseButton').click();
      const hidden = await p.evaluate(() =>
        ['walls_upper', 'ceiling', 'lighting_fixtures'].every(
          (n) => window.roomRender.scene.getObjectByName(n).visible === false,
        ),
      );
      assert.equal(hidden, true);
      report.desktopActions = [
        'plan room selection to kitchen',
        'evening illumination',
        'tour pause/resume/end',
        'simulated balcony and attribution',
        'collision-limited keyboard movement',
        'dollhouse visibility groups',
      ];
    } else {
      await p.locator('#motionButton').click();
      await p.locator('#interiorFilmstrip [data-room=living]').click();
      const previous = await p.evaluate(() => window.roomRender.cam.position.toArray());
      const rect = await p.locator('[data-move=forward]').boundingBox();
      assert.ok(rect);
      const cdp = await p.context().newCDPSession(p);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }],
      });
      await p.waitForTimeout(250);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.notDeepEqual(await p.evaluate(() => window.roomRender.cam.position.toArray()), previous);
    }
    assert.deepEqual(errors, []);
    report.viewports.push({ width, height, ...results });
    await p.close();
  }
  const p = await browser.newPage();
  await p.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, ...rest) {
      return t.includes('webgl') ? null : orig.call(this, t, ...rest);
    };
  });
  await p.goto(base + '?view=walk&room=bathroom-2');
  await p.locator('#fallbackRender[src$="room-bathroom-2.webp"]').waitFor({ state: 'visible' });
  assert.match(await p.locator('#fallbackLabel').innerText(), /Still room view/);
  report.fallback = 'Verified labelled still of Washroom 2 with WebGL disabled.';
  report.frameTimingScope =
    '60 measured requestAnimationFrame intervals during a small continuous yaw rotation in the live primary bedroom after 5 warmup frames. Draw counts exclude shadow pass overhead.';
  report.hardwareNote =
    'All viewport profiles use the same host GPU. Mobile/tablet dimensions and touch events are emulated in Chromium.';
  report.architecturalScope =
    'A3 brochure trace with illustrative furnishing, registration, assumed heights and outlook. No geographic or photometric survey.';
  const path = new URL('../qa/interior-browser.json', import.meta.url);
  await writeFile(path, JSON.stringify(report, null, 2) + '\n');
  console.log(report);
} finally {
  await browser.close();
}
