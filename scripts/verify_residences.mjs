// Live buyer UI verification. Run the static site first. An optional layout argument runs one design.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeNavigator } from '../dist/navigation.js';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const all = (await json('brochure-manifest.json')).layouts;
const only = process.argv[2],
  entries = only ? all.filter((r) => r.code === only) : all;
const base = process.env.BRIGADE_QA_URL || 'http://127.0.0.1:5173/';
const qa = resolve(process.env.BRIGADE_RESIDENCE_QA_DIR || fileURLToPath(new URL('../qa/', import.meta.url)));
const folder = join(qa, 'evidence');
await mkdir(folder, { recursive: true });
const dataPath = (name) => new URL('../dist/assets/' + name, import.meta.url);
async function json(file) {
  return JSON.parse(await readFile(new URL('../dist/assets/' + file, import.meta.url), 'utf8'));
}
const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist'] });
const report = {
  captured: new Date().toISOString(),
  browser: browser.version(),
  layouts: [],
  scope:
    'Live Chrome WebGL2 and actual layout assets. Phone/tablet controls use emulated touch on the host GPU. Source coordinates and inferred geometry are illustrative.',
};
try {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.addInitScript(() => {
    window.__THREE_DEVTOOLS__ = new EventTarget();
    window.__THREE_DEVTOOLS__.addEventListener('observe', ({ detail: r }) => {
      if (!r.isWebGLRenderer) return;
      const original = r.render;
      r.render = function (scene, camera) {
        const result = original.call(this, scene, camera);
        if (r.domElement.parentElement?.id === 'scene') window.residenceFrame = { scene, camera, r };
        return result;
      };
    });
  });
  for (const source of entries) {
    const code = source.code,
      original = code === 'A3',
      prefix = original ? '' : 'apartments/' + code + '/';
    const geo = await json(prefix + (original ? 'apartment-geometry.json' : 'geometry.json')),
      views = (await json(prefix + (original ? 'room-views.json' : 'views.json'))).views,
      colliders = await json(prefix + (original ? 'furniture-colliders.json' : 'colliders.json'));
    const model =
        prefix + (original ? 'apartment-a3-web.glb' : 'apartment-' + code.toLowerCase() + '.glb'),
      modelBytes = await readFile(dataPath(model));
    const hash = createHash('sha256').update(modelBytes).digest('hex');
    const thumbFiles = new Set(views.map((r) => r.file));
    assert.equal(thumbFiles.size, views.length, 'Unique room thumbnails');
    assert.equal(geo.rooms.length, views.length, code + ' room coverage');
    const nodes = new Map(geo.navigation_nodes.map((n) => [n.id, n])),
      nav = makeNavigator(geo, colliders);
    const validRoomIds = new Set(geo.rooms.map((r) => r.id));
    let directed = 0;
    for (const v of views) {
      assert.ok(validRoomIds.has(v.room_id), v.room_id);
      const node = nodes.get(v.node_id || v.room_id);
      assert.ok(node);
      assert.ok(nav.canStand(node.position[0], node.position[2]), code + ' ' + v.node_id + ' clear');
      for (const w of views) {
        const route = nav.route(node.position, w.node_id || w.room_id);
        assert.ok(route, code + ' ' + v.room_id + ' → ' + w.room_id);
        for (let i = 1; i < route.length; i++)
          assert.ok(
            nav.lineClear(route[i - 1], route[i]),
            code + ' ' + v.room_id + ' → ' + w.room_id + ' clear segment',
          );
        directed++;
      }
    }
    const last = views.find((v) => v.room_id.includes('kitchen')) || views.at(-1);
    const modelResponse = page.waitForResponse((r) => r.url().endsWith('/assets/' + model) && r.ok());
    await page.goto(base + '?layout=' + code + '&design=' + code + '&view=walk&room=' + last.room_id);
    await modelResponse;
    await page.waitForFunction(
      () =>
        window.residenceFrame?.r.info.render.triangles > 0 &&
        document.body.classList.contains('walking'),
    );
    assert.ok((await page.locator('#cardToggle strong').textContent()).includes(code));
    const roomTest = await page.evaluate(async () => {
      const controls = [...document.querySelectorAll('#interiorFilmstrip button')],
        visited = [];
      for (const button of controls) {
        button.click();
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        visited.push({
          id: button.dataset.room,
          location: new URLSearchParams(location.search).get('room'),
        });
      }
      const result = await Promise.all(
        controls.map(async (button) => {
          const img = button.querySelector('img');
          img.loading = 'eager';
          await img.decode();
          return img.naturalWidth > 0;
        }),
      );
      return { visited, thumbnails: result.every(Boolean) };
    });
    assert.ok(roomTest.thumbnails);
    assert.equal(roomTest.visited.length, views.length);
    await page.locator('#planButton').click();
    const plan = page.locator('#planDialog');
    await plan.waitFor({ state: 'visible' });
    assert.equal(await plan.locator('svg polygon').count(), geo.rooms.length);
    const planSrc = await plan.locator('.plan-image-wrap img').getAttribute('src');
    assert.equal(planSrc, original ? 'assets/plan-a3.webp' : 'assets/plans/' + code + '.webp');
    await plan.locator('svg polygon').nth(0).focus();
    await page.keyboard.press('Enter');
    await plan.waitFor({ state: 'hidden' });
    await page.locator('#dollhouseButton').click();
    await page.locator('#cardToggle').click();
    await page.locator('#dollhouseAngle').selectOption('top');
    await page.waitForFunction(
      () =>
        Math.abs(
          window.residenceFrame.camera.getWorldDirection(
            new window.residenceFrame.camera.position.constructor(),
          ).y,
        ) > 0.99,
    );
    await page.locator('#furnishedMode').uncheck();
    assert.equal(
      await page.evaluate(() => window.residenceFrame.scene.getObjectByName('furniture')?.visible),
      false,
    );
    await page.locator('#furnishedMode').check();
    await page.locator('#dollhouseAngle').selectOption('isometric');
    const lighting = [];
    for (const key of ['morning', 'day', 'sunset', 'night']) {
      await page.locator('#lightingModes [data-light="' + key + '"]').click();
      lighting.push(await page.evaluate(() => window.residenceFrame.r.toneMappingExposure));
    }
    assert.equal(new Set(lighting).size, 4);
    await page.locator('#lightingModes [data-light="day"]').click();
    await page.locator('#cardToggle').click();
    if (code === 'B10') await page.screenshot({ path: join(folder, 'b10-dollhouse.png') });
    const frame = await page.evaluate(() => {
      const { r, scene } = window.residenceFrame;
      return {
        triangles: r.info.render.triangles,
        drawCalls: r.info.render.calls,
        webgl2: r.getContext() instanceof WebGL2RenderingContext,
        roofOff: scene.getObjectByName('ceiling')?.visible === false,
      };
    });
    assert.ok(frame.webgl2 && frame.roofOff && frame.triangles > 0);
    assert.deepEqual(errors, []);
    assert.ok(
      roomTest.visited.every((v) => v.id === v.location),
      code +
        ' target remains within requested room: ' +
        JSON.stringify(roomTest.visited.filter((v) => v.id !== v.location)),
    );
    await page.locator('#buildingReturn').click();
    await page.waitForFunction(() => !document.body.classList.contains('exploring'));
    report.layouts.push({
      code,
      sourcePage: source.source_pdf_page,
      model,
      sha256: hash,
      rooms: geo.rooms.length,
      collisionFreeDirectedRoomRoutes: directed,
      decodedRoomThumbnails: views.length,
      interactiveRoomSelections: roomTest.visited.length,
      sourcePlan: planSrc,
      deepLinkedRoom: last.room_id,
      lightingPresets: 4,
      furnitureToggle: true,
      topDownAndIsometric: true,
      backToBuilding: true,
      ...frame,
    });
    console.log(
      'Passed ' + code + ' · ' + geo.rooms.length + ' rooms · ' + directed + ' collision-free routes',
    );
  }
  if (!only) {
    assert.equal(new Set(report.layouts.map((r) => r.sha256)).size, 13);
    await writeFile(
      join(qa, 'all-residences.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
  }
} finally {
  await browser.close();
}
