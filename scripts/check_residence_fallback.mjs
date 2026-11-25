// Uses Chrome's WebGL-off launch flag and real local files. No HTTP responses are mocked.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BRIGADE_QA_URL || 'http://127.0.0.1:5173/experience/';
const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-webgl'] });
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const failures = [],
    models = [];
  page.on('pageerror', (e) => failures.push(e.message));
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.endsWith('.glb')) models.push(new URL(r.url()).pathname);
  });
  const still = async (file, label) => {
    const img = page.locator('#fallbackRender[src$="' + file + '"]');
    await img.waitFor({ state: 'visible' });
    const width = await img.evaluate(async (image) => {
      await image.decode();
      return image.naturalWidth;
    });
    assert.ok(width > 0);
    assert.match(await page.locator('#fallbackLabel').textContent(), label);
    return width;
  };
  await page.goto(base + '?layout=B10&room=bedroom-3');
  assert.equal(
    await page.evaluate(() => document.createElement('canvas').getContext('webgl2') === null),
    true,
  );
  const bedroomWidth = await still('/B10/room-bedroom-3.webp', /Still room view/);
  assert.match(await page.locator('#roomName').textContent(), /Bedroom 3/i);
  assert.ok(await page.locator('#walkPad').isHidden());
  assert.ok(await page.locator('#furnishedMode').isDisabled());
  await page.locator('#cardToggle').tap();
  await page.locator('#tourButton').tap();
  assert.equal(
    await page.evaluate(() => document.activeElement === document.querySelector('#roomList button')),
    true,
  );
  await page.locator('#cardToggle').tap();
  await page.locator('#planButton').tap();
  const source = page.locator('#planDialog .plan-image-wrap img');
  assert.equal(await source.getAttribute('src'), 'assets/plans/B10.webp');
  await source.evaluate((img) => img.decode());
  const planRooms = await page.locator('#planDialog polygon').count();
  assert.equal(planRooms, 18);
  assert.match(
    await page.locator('#planDialog svg g[aria-label]').getAttribute('transform'),
    /translate\(/,
  );
  const kitchen = page.locator('#planDialog polygon[aria-label="Take me to Kitchen"]');
  await kitchen.focus();
  await page.keyboard.press('Enter');
  const kitchenWidth = await still('/B10/room-kitchen.webp', /Still room view/);
  assert.equal(new URL(page.url()).searchParams.get('room'), 'kitchen');
  await page.locator('#dollhouseButton').tap();
  const overviewWidth = await still('/B10/overview.webp', /3D unavailable/i);
  await page.locator('#buildingReturn').tap();
  await page.waitForFunction(() => !document.body.classList.contains('exploring'));
  assert.ok(await page.locator('#renderFallback').isHidden());
  await page.goto(base + '?layout=B10&room=sunroom');
  await still('/B10/room-living.webp', /Still room view/);
  await page.goto(base + '?layout=B13&room=living');
  await page.locator('.layout-pick').first().waitFor({ state: 'visible' });
  assert.ok(await page.locator('#experience').isHidden());
  const count = await page.locator('.layout-pick').count();
  assert.equal(count, 13);
  assert.deepEqual(failures, []);
  assert.equal(models.length, 0);
  const report = {
    captured: new Date().toISOString(),
    browser: browser.version(),
    viewport: [390, 844],
    webgl2: false,
    mode: 'Chrome --disable-webgl, local static files',
    design: 'B10',
    deepLinkedRoom: 'bedroom-3',
    bedroomImageWidth: bedroomWidth,
    sourcePlan: 'assets/plans/B10.webp',
    sourcePlanRoomRegions: planRooms,
    roomPickerFocus: true,
    positionAndDirectionOnSourcePlan: true,
    planSelection: 'kitchen',
    kitchenImageWidth: kitchenWidth,
    overviewImageWidth: overviewWidth,
    stillAndOverviewLabelsVerified: true,
    exitToBuilding: true,
    unknownRoomResolvedTo: 'living',
    unknownLayout: 'B13 returned to the 13-design collection',
    modelRequests: models,
    pageErrors: failures,
  };
  await writeFile(
    new URL('../qa/fallback.json', import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(report);
} finally {
  await browser.close();
}
