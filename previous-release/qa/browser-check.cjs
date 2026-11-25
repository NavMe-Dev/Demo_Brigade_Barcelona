// Run against a local server. Set PLAYWRIGHT_MODULE and CHROME_PATH when outside npm's module tree.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.TEST_ORIGIN || 'http://127.0.0.1:5173';
const report = { tested: new Date().toISOString(), profiles: [], checks: [], browserErrors: [] };
const check = (name, value) => {
  assert.ok(value, name);
  report.checks.push(name);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function metrics(p) {
  return p.evaluate(async () => (await import('./estate-scene.js')).sceneMetrics());
}
async function settled(p) {
  await p.waitForFunction(async () => {
    const m = (await import('./estate-scene.js')).sceneMetrics();
    return m?.imagery && m.geographicContext;
  });
}
async function timing(p) {
  return p.evaluate(
    () =>
      new Promise((resolve) => {
        const times = [];
        let previous, start;
        function frame(now) {
          start ??= now;
          if (previous) times.push(now - previous);
          previous = now;
          if (now - start < 2500) requestAnimationFrame(frame);
          else {
            times.sort((a, b) => a - b);
            resolve({
              samples: times.length,
              medianMs: +times[Math.floor(times.length / 2)].toFixed(2),
              p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(2),
            });
          }
        }
        requestAnimationFrame(frame);
      }),
  );
}
async function heap(p) {
  const session = await p.context().newCDPSession(p);
  await session.send('HeapProfiler.collectGarbage');
  const v = await session.send('Runtime.getHeapUsage');
  await session.detach();
  return v.usedSize;
}
async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  report.browser = browser.version();
  try {
    for (const [width, height, dpr] of [
      [1440, 900, 1],
      [390, 844, 3],
      [360, 800, 2],
      [820, 1180, 2],
      [844, 390, 2],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: dpr,
        isMobile: width < 900,
        hasTouch: width < 900,
      });
      const p = await context.newPage();
      p.setDefaultTimeout(10000);
      p.on('pageerror', (e) => report.browserErrors.push(e.message));
      p.on('console', (m) => {
        if (m.type() === 'error') report.browserErrors.push(m.text().slice(0, 200));
      });
      const requests = [];
      p.on('request', (r) => requests.push(new URL(r.url()).pathname));
      await p.goto(base);
      await settled(p);
      const modelReady = await p.evaluate(() => Math.round(performance.now()));
      const gl = await p.locator('#estateCanvas canvas').evaluate((canvas) => {
        const gl = canvas.getContext('webgl2');
        return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
      });
      check(width + 'x' + height + ' exterior uses WebGL2', gl);
      check(
        width + 'x' + height + ' apartment loads on demand',
        !requests.some((url) => url.includes('apartment-a3-web.glb')),
      );
      const times = await timing(p);
      await p.locator('#introControl').click();
      await wait(550);
      const profile = {
        width,
        height,
        deviceScaleFactor: dpr,
        renderer: gl,
        liveWithTerrainMs: modelReady,
        introFrames: times,
        exterior: await metrics(p),
      };
      report.profiles.push(profile);
      check(
        width + 'x' + height + ' fits viewport',
        await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      );
      if (width === 1440) {
        // Pick the front facade through the canvas with a real pointer.
        await p.mouse.click(Math.round(width * 0.665), Math.round(height * 0.46));
        await p.waitForFunction(() => new URLSearchParams(location.search).get('scene') === 'towers');
        check('Raycast selects labeled wing geometry', !!(await metrics(p)).wing);
        await p.locator('#estatePanel').getByRole('button', { name: 'Wing A', exact: true }).click();
        await wait(1500);
        const point = await p.evaluate(async () => {
          const T = await import('three'),
            s = await (await import('./estate-scene.js')).sceneMetrics();
          const lens = new T.PerspectiveCamera(43, innerWidth / innerHeight, 0.6, 6500);
          lens.position.fromArray(s.camera);
          lens.lookAt(new T.Vector3(...s.target));
          lens.setViewOffset(innerWidth, innerHeight, -0.125 * innerWidth, 0, innerWidth, innerHeight);
          lens.updateMatrixWorld();
          const v = new T.Vector3(-15, 15 + 3.05 * 18.5, -37.2).project(lens);
          return [((v.x + 1) * innerWidth) / 2, ((1 - v.y) * innerHeight) / 2];
        });
        await p.mouse.click(...point);
        await wait(150);
        check(
          'Direct facade selection picks the brochure floor',
          Number.isInteger((await metrics(p)).floor),
        );
        await p.locator('#estatePanel').getByRole('button', { name: '18', exact: true }).click();
        check('Floor selection highlights the matching band', (await metrics(p)).floor === 18);
        await p.locator('#estatePanel').getByRole('button', { name: 'View typical floor plan' }).click();
        await p.locator('.estate-plan-dialog img').waitFor({ state: 'visible' });
        check(
          'Brochure typical floor plate opens',
          await p.locator('.estate-plan-dialog img').isVisible(),
        );
        await p.keyboard.press('Escape');
        await p.getByRole('button', { name: 'Browse Wing A designs' }).click();
        await p.locator('#designChoice').selectOption('A3');
        await p.locator('#estatePanel').getByRole('button', { name: 'Save', exact: true }).click();
        check(
          'A3 save persists',
          await p.evaluate(() => localStorage.getItem('brigade-a3-saved') === 'true'),
        );
        await p.locator('#estatePanel').getByRole('button', { name: 'Compare', exact: true }).click();
        await p.getByRole('button', { name: 'Open comparison (1)' }).click();
        await p.locator('#compareChoice').selectOption('B10');
        check('3 and 4 BHK area comparison', (await p.locator('.compare-head').count()) === 2);
        await p.goto(base + '/?scene=towers&wing=A&floor=12');
        await settled(p);
        await p.getByRole('button', { name: 'Browse Wing A designs' }).click();
        check(
          'Refuge floor excludes A7',
          !(await p.locator('#designChoice option').allTextContents()).some((t) => t.startsWith('A7')),
        );
        await p.locator('#designChoice').selectOption('A3');
        const before = await heap(p);
        await p.getByRole('button', { name: 'Explore apartment in 3D' }).click();
        await p.waitForFunction(() => document.body.classList.contains('walking'));
        check(
          'Cinematic entry arrives in living room',
          /living/i.test(await p.locator('#roomName').innerText()),
        );
        check(
          'A3 renders through live WebGL',
          (await p.locator('#scene canvas').isVisible()) &&
            !(await p.locator('#renderFallback').isVisible()),
        );
        await p.locator('#planButton').click();
        await p.locator('#planDialog svg [role=button]').first().waitFor();
        check(
          'Source plan has all thirteen navigable rooms',
          (await p.locator('#planDialog svg [role=button]').count()) === 13,
        );
        await p.locator('#planDialog svg [aria-label*="Kitchen" i]').first().focus();
        await p.keyboard.press('Enter');
        await p.waitForFunction(
          () => /kitchen/i.test(document.getElementById('roomName').textContent),
          null,
          { timeout: 30000 },
        );
        check('Source plan selects kitchen', /kitchen/i.test(await p.locator('#roomName').innerText()));
        await p.locator('#homeButton').click();
        await p.waitForFunction(() => !document.body.classList.contains('exploring'));
        const retained = await heap(p);
        for (let i = 0; i < 4; i++) {
          await p.evaluate(async () => {
            const api = await import('./app.js');
            await api.enterInterior({ room: 'living' });
            api.leaveInterior();
          });
        }
        profile.heapBytes = {
          beforeInterior: before,
          afterFirstReturn: retained,
          afterFourMoreReturns: await heap(p),
        };
        await p.goto(base + '/?view=walk&room=deck');
        await p.waitForFunction(() => document.body.classList.contains('walking'));
        check(
          'Interior room deep link survives reload',
          /deck/i.test(await p.locator('#roomName').innerText()),
        );
        await p.locator('#homeButton').click();
      } else {
        await p.locator('[data-section=masterplan].estate-cta').tap();
        await p.locator('#estatePanel').getByRole('button', { name: 'Select a wing' }).tap();
        await p.locator('#estatePanel').getByRole('button', { name: 'Wing B', exact: true }).tap();
        await p.locator('#estatePanel').getByRole('button', { name: '22', exact: true }).tap();
        await p.locator('#panelClose').tap();
        check(width + 'x' + height + ' sheet collapses', await p.locator('#reopenPanel').isVisible());
        await wait(1400);
        const start = await metrics(p);
        const cdp = await context.newCDPSession(p);
        const cx = Math.round(width * 0.55),
          cy = Math.round(height * 0.35);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [
            { x: cx - 20, y: cy },
            { x: cx + 20, y: cy },
          ],
        });
        for (let i = 1; i < 7; i++)
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [
              { x: cx - 20 - i * 4, y: cy },
              { x: cx + 20 + i * 4, y: cy },
            ],
          });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await wait(150);
        check(
          width + 'x' + height + ' pinch changes camera',
          JSON.stringify(start.camera) !== JSON.stringify((await metrics(p)).camera),
        );
        await cdp.detach();
      }
      await p.locator('#estateLight').click();
      check(
        width + 'x' + height + ' evening control',
        (await p.locator('#estateLight').getAttribute('aria-pressed')) === 'true',
      );
      await p.locator('#estateMenu').click();
      await p.getByRole('dialog').getByRole('button', { name: 'Amenities', exact: true }).click();
      await p.locator('#estatePanel').getByRole('button', { name: 'Rooftop sky deck' }).click();
      check(
        width + 'x' + height + ' sky deck navigation',
        (await p.locator('#estatePanelTitle').innerText()).includes('sky deck'),
      );
      await context.close();
    }
    const fallback = await browser.newPage();
    await fallback.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return type.startsWith('webgl') ? null : get.call(this, type, ...args);
      };
    });
    await fallback.goto(base);
    await fallback.waitForFunction(() =>
      document.querySelector('#estateStatus').textContent.includes('unavailable'),
    );
    check('Exterior fallback explicitly labeled', await fallback.locator('#estateStatus').isVisible());
    await fallback.goto(base + '/?view=walk&room=kitchen');
    await fallback.waitForFunction(() => document.body.classList.contains('rendered-fallback'));
    check(
      'Fallback is the requested room image',
      (await fallback.locator('#fallbackRender').getAttribute('src')).includes('room-kitchen'),
    );
    await fallback.close();
    check('Live runs free of uncaught or console errors', report.browserErrors.length === 0);
  } finally {
    await browser.close();
  }
}
main()
  .then(() => {
    fs.writeFileSync(path.join(__dirname, 'buyer-browser.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('Passed', report.checks.length, 'checks');
  })
  .catch((e) => {
    console.error(e);
    console.error(JSON.stringify(report));
    process.exitCode = 1;
  });
