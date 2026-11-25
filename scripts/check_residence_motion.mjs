import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { makeNavigator } from '../dist/navigation.js';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BRIGADE_QA_URL || 'http://127.0.0.1:5173/experience/';
const dir = new URL('../dist/assets/apartments/B10/', import.meta.url);
const nav = makeNavigator(
  JSON.parse(await readFile(new URL('geometry.json', dir))),
  JSON.parse(await readFile(new URL('colliders.json', dir))),
);
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'no-preference',
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.motionTrace = [];
    window.motionStart = 0;
    addEventListener('brigade:interior-enter', () => (window.motionStart = performance.now()));
    window.__THREE_DEVTOOLS__ = new EventTarget();
    window.__THREE_DEVTOOLS__.addEventListener('observe', ({ detail: r }) => {
      if (!r.isWebGLRenderer) return;
      const draw = r.render;
      r.render = function (s, c) {
        const result = draw.call(this, s, c);
        if (r.domElement.parentElement?.id !== 'scene' || !s.getObjectByName('ceiling')) return result;
        window.motionFrame = { scene: s, cam: c, r };
        if (document.body.classList.contains('walking') && document.body.classList.contains('exploring'))
          window.motionTrace.push(c.position.toArray());
        return result;
      };
    });
  });
  await page.goto(base + '?layout=B10&room=bedroom-1');
  await page.locator('#skipInterior').waitFor({ state: 'visible' });
  await page.locator('#skipInterior').waitFor({ state: 'hidden', timeout: 30000 });
  const arrival = await page.evaluate(() => ({
    durationMs: Math.round(performance.now() - window.motionStart),
    positions: motionTrace.slice(),
    room: document.querySelector('#roomName').textContent,
    triangles: motionFrame.r.info.render.triangles,
  }));
  assert.match(arrival.room, /Bedroom 1/);
  assert.ok(arrival.triangles > 0);
  function checkTrace(positions) {
    assert.ok(positions.length >= 2);
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      assert.ok(nav.canStand(p[0], p[2]), 'Safe camera sample ' + p);
      if (i) assert.ok(nav.lineClear(positions[i - 1], p), 'Clear eye-level segment');
    }
  }
  checkTrace(arrival.positions);
  await page.mouse.move(640, 375);
  await page.mouse.down();
  await page.mouse.move(645, 610, { steps: 15 });
  await page.mouse.up();
  const target = await page.evaluate(async () => {
    const { Raycaster, Vector2, Vector3 } = await import('three');
    const { cam, scene, r } = motionFrame,
      canvas = r.domElement,
      rect = canvas.getBoundingClientRect(),
      ray = new Raycaster();
    const { layoutPackage } = await import(new URL('interior-layout.js', document.baseURI));
    const { makeNavigator } = await import(new URL('navigation.js', document.baseURI));
    const pkg = await layoutPackage('B10'),
      nav = makeNavigator(pkg.geometry, pkg.colliders);
    for (let y = 0.91; y > 0.25; y -= 0.024)
      for (let x = 0.04; x < 0.96; x += 0.024) {
        const sx = rect.left + x * rect.width,
          sy = rect.top + y * rect.height;
        if (document.elementFromPoint(sx, sy) !== canvas) continue;
        ray.setFromCamera(new Vector2(x * 2 - 1, 1 - y * 2), cam);
        const h = ray.intersectObjects(scene.children, true).find((hit) => {
          for (let o = hit.object; o; o = o.parent) if (!o.visible) return false;
          return true;
        });
        if (
          !h?.face ||
          h.point.y > 0.3 ||
          h.face.normal.clone().transformDirection(h.object.matrixWorld).y < 0.75
        )
          continue;
        const dest = [h.point.x, cam.position.y, h.point.z];
        if (
          Math.hypot(dest[0] - cam.position.x, dest[2] - cam.position.z) < 0.24 ||
          !nav.lineClear(cam.position.toArray(), dest)
        )
          continue;
        return { sx, sy, start: cam.position.toArray(), dest };
      }
    return null;
  });
  assert.ok(target, 'Visible reachable floor');
  await page.mouse.click(target.sx, target.sy);
  await page.waitForFunction(
    (dest) =>
      motionFrame.cam.position.distanceTo(new motionFrame.cam.position.constructor(...dest)) < 0.13,
    target.dest,
  );
  const before = await page.evaluate(() => motionTrace.length);
  await page.locator('#buildingReturn').click();
  await page.locator('#skipInterior').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.body.classList.contains('exploring'));
  const reverse = await page.evaluate((n) => motionTrace.slice(n), before);
  checkTrace(reverse);
  assert.ok(!(await page.locator('#estatePanel').isHidden()));
  await page.goto(base + '?layout=B10&room=kitchen');
  await page.locator('#skipInterior').waitFor({ state: 'visible' });
  await page.locator('#skipInterior').click();
  assert.match(await page.locator('#roomName').textContent(), /kitchen/i);
  await page.locator('#buildingReturn').click();
  await page.locator('#skipInterior').click();
  await page.waitForFunction(() => !document.body.classList.contains('exploring'));
  assert.deepEqual(errors, []);
  const result = {
    browser: browser.version(),
    layout: 'B10',
    sharedRoom: 'bedroom-1',
    arrivalDurationMs: arrival.durationMs,
    entryEyeLevelSamples: arrival.positions.length,
    reverseEyeLevelSamples: reverse.length,
    collisionFree: true,
    clickToMove: true,
    completeReverse: true,
    skipToRequestedRoom: true,
    skipReverse: true,
    pageErrors: errors,
  };
  await writeFile(
    new URL('../qa/residence-motion.json', import.meta.url),
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(result);
} finally {
  await browser.close();
}
