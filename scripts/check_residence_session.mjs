// Exercise successive real selections without reloading the buyer document.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BRIGADE_QA_URL || 'http://127.0.0.1:5173/experience/';
const source = JSON.parse(
  await readFile(new URL('../dist/assets/brochure-manifest.json', import.meta.url)),
);
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const errors = [],
    responseModels = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (path.includes('/apartment-') && path.endsWith('.glb')) responseModels.push(path);
  });
  await page.addInitScript(() => {
    window.loadedDocument = crypto.randomUUID();
    window.renderContexts = new Set();
    window.__THREE_DEVTOOLS__ = new EventTarget();
    window.__THREE_DEVTOOLS__.addEventListener('observe', ({ detail: r }) => {
      if (!r.isWebGLRenderer) return;
      const draw = r.render;
      r.render = function (scene, cam) {
        const result = draw.call(this, scene, cam);
        if (r.domElement.parentElement?.id === 'scene' && scene.getObjectByName('ceiling'))
          window.renderContexts.add(r.getContext());
        return result;
      };
    });
  });
  await page.goto(base + '?scene=apartments');
  const documentId = await page.evaluate(() => window.loadedDocument);
  const results = [];
  for (const { code } of source.layouts) {
    await page.getByRole('button', { name: 'All wings', exact: true }).click();
    await page.locator('.layout-pick[data-code="' + code + '"]').click();
    await page.getByRole('button', { name: 'Explore apartment in 3D', exact: true }).click();
    await page.waitForFunction(
      (code) =>
        document.body.classList.contains('walking') &&
        document.querySelector('#sceneStatus').textContent.includes('Design ' + code) &&
        window.renderContexts.size > 0,
      code,
    );
    const state = await page.evaluate(() => ({
      documentId: window.loadedDocument,
      canvases: document.querySelectorAll('#scene canvas').length,
      liveContexts: [...renderContexts].filter((gl) => !gl.isContextLost()).length,
      totalContexts: renderContexts.size,
      heapBytes: performance.memory?.usedJSHeapSize,
    }));
    assert.equal(state.documentId, documentId);
    assert.equal(state.canvases, 1);
    assert.equal(state.liveContexts, 1);
    await page.locator('#buildingReturn').click();
    await page.waitForFunction(() => !document.body.classList.contains('exploring'));
    results.push({
      code,
      canvases: state.canvases,
      activeInteriorContexts: state.liveContexts,
      seenInteriorContexts: state.totalContexts,
      heapBytes: state.heapBytes,
    });
  }
  assert.equal(responseModels.length, 13);
  assert.deepEqual(errors, []);
  const report = {
    browser: browser.version(),
    documentReloadsAfterOpening: 0,
    apartmentModelRequests: responseModels,
    results,
    measurement:
      'Renderer contexts observed on actual model draws. The test retains references to retired contexts to verify context loss. Heap includes retained test objects, browser caches and UI. Reduced motion enabled.',
  };
  await writeFile(
    new URL('../qa/residence-session.json', import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log('13 sequential selections, one live interior context, zero document reloads.');
} finally {
  await browser.close();
}
