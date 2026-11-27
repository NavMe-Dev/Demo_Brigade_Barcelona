// Deterministic network/lifecycle tests. Uses no credentials and contacts no services.
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/three.module.js';
import { createArcGISOverlay } from '../dist/gis-arcgis.js';

let now = 0, timerId = 0;
const timers = new Map();
globalThis.performance = { now: () => now };
globalThis.setTimeout = (callback, delay = 0) => {
  const id = ++timerId;
  timers.set(id, { callback, at: now + delay });
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 16);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.createImageBitmap = async () => ({ width: 256, height: 256, close() {} });
globalThis.document = { createElement: () => ({ getContext: () => ({
  drawImage() {}, getImageData: () => ({ data: new Uint8Array(256 * 256 * 4) }),
}) }) };
async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }
async function advance(ms) {
  const end = now + ms;
  let iterations = 0;
  while (true) {
    await flush();
    const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (!next || next[1].at > end) break;
    assert.ok(++iterations < 1000, 'retry timer must not spin');
    now = next[1].at;
    timers.delete(next[0]);
    next[1].callback();
  }
  now = end;
  await flush();
}
function fixture({ metaFailures = 0, tileFailures = 0, auth = false, hang = false } = {}) {
  now = 0; timers.clear();
  const calls = { metadata: 0, tile: 0, citation: 0, tilemap: 0 };
  const behavior = { metaFailures, tileFailures, auth, hang };
  const json = (data, status = 200) => ({ ok: status === 200, status,
    headers: { get: () => 'application/json' }, json: async () => data });
  globalThis.fetch = async (url, { signal }) => {
    const path = url.pathname;
    if (path.endsWith('/MapServer')) {
      calls.metadata++;
      if (behavior.auth) return json({}, 401);
      if (behavior.hang) return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
      });
      if (calls.metadata <= behavior.metaFailures) throw new TypeError('Synthetic network failure');
      return json({ tileInfo: { rows: 256, cols: 256, spatialReference: { wkid: 3857 },
        lods: [{ level: 12 }, { level: 13 }] }, copyrightText: 'Synthetic fixture' });
    }
    if (path.endsWith('/4/query')) { calls.citation++; return json({ features: [] }); }
    if (path.includes('/tilemap/')) {
      calls.tilemap++;
      const [, , top, left] = path.match(/tilemap\/(\d+)\/(\d+)\/(\d+)\/8\/8$/);
      return json({ location: { left: Number(left), top: Number(top), width: 8, height: 8 }, data: Array(64).fill(1) });
    }
    if (path.includes('/tile/')) {
      calls.tile++;
      if (calls.tile <= behavior.tileFailures) throw new TypeError('Synthetic tile failure');
      return { ok: true, headers: { get: () => 'image/jpeg' }, blob: async () => ({}) };
    }
    throw Error('Unexpected fixture request');
  };
  const terrain = { radius: 1, heightAt: () => 0,
    localToWGS84: (x, z) => [78.312 + x / 106000, 17.402 - z / 111000],
    wgs84ToLocal: (lon, lat) => [(lon - 78.312) * 106000, (17.402 - lat) * 111000] };
  const overlay = createArcGISOverlay(THREE, terrain, { mobile: false, key: 'synthetic', onChange() {} });
  const visible = new THREE.Frustum(...Array.from({ length: 6 }, () => new THREE.Plane(new THREE.Vector3(), 1)));
  overlay.update({ fov: 45 }, new THREE.Vector3(0, 1000, 0), visible, 1);
  return { overlay, calls, behavior };
}
let checks = 0;
function check(name, condition) { assert.ok(condition, name); checks++; console.log('PASS', name); }

{
  const { overlay, calls } = fixture({ metaFailures: 1 });
  await flush();
  check('Metadata failure exposes retry state', overlay.stats().state === 'retrying' && overlay.stats().canRetry);
  await advance(1500);
  check('Metadata recovers with a stationary camera', calls.metadata === 2 && overlay.stats().state === 'ready');
  overlay.dispose();
}
{
  const { overlay, calls } = fixture({ tileFailures: 1 });
  await flush();
  check('Tile failure exposes retry state', overlay.stats().state === 'retrying');
  await advance(1500);
  check('Tile recovers with a stationary camera', calls.tile === 2 && overlay.stats().state === 'ready');
  overlay.dispose();
}
{
  const { overlay, calls, behavior } = fixture({ hang: true });
  await flush();
  await advance(12000);
  check('Hung metadata request has a deadline', overlay.stats().state === 'retrying');
  behavior.hang = false;
  await advance(1500);
  check('Timed-out request recovers automatically', calls.metadata === 2 && overlay.stats().state === 'ready');
  overlay.dispose();
}
{
  const { overlay, calls, behavior } = fixture({ metaFailures: Infinity });
  await flush();
  await advance(120000);
  check('Network retries stop after three automatic attempts', calls.metadata === 4 && overlay.stats().state === 'unavailable');
  behavior.metaFailures = 0;
  overlay.retry();
  await flush();
  check('Manual retry restores exhausted imagery', calls.metadata === 5 && overlay.stats().state === 'ready');
  overlay.dispose();
}
{
  const { overlay, calls, behavior } = fixture({ auth: true });
  await flush();
  await advance(120000);
  check('Authorization denial waits for manual retry', calls.metadata === 1 && overlay.stats().state === 'unauthorized');
  behavior.auth = false;
  overlay.retry();
  await flush();
  check('Manual retry can recover authorization', calls.metadata === 2 && overlay.stats().state === 'ready');
  overlay.dispose();
}
{
  const { overlay, calls, behavior } = fixture({ hang: true });
  await flush();
  overlay.setActive(false);
  behavior.hang = false;
  overlay.setActive(true);
  await flush();
  check('Rapid deactivate/reactivate survives stale abort callbacks', calls.metadata === 2 && overlay.stats().state === 'ready');
  overlay.dispose();
}
{
  const { overlay, calls } = fixture({ metaFailures: Infinity });
  await flush();
  overlay.setActive(false);
  await advance(120000);
  check('Inactive scenes do not retry in background', calls.metadata === 1);
  overlay.setActive(true);
  await flush();
  check('Reactivation resumes a due retry', calls.metadata === 2);
  overlay.dispose();
  await advance(120000);
  check('Disposal cancels retry timers', calls.metadata === 2 && timers.size === 0);
}
console.log(`${checks} imagery recovery checks passed.`);
