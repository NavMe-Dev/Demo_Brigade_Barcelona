// Optional cartographic lines and actual mapped tree points over the same elevation surface.
import { terrainSegmentSamples } from './geo-terrain.js';
const base = new URL('./assets/geography/', import.meta.url);
const palette = {
  arterial: '#fff3bb',
  street: '#e9d9ba',
  service: '#d3c8ae',
  path: '#fee2a1',
  green: '#92c98b',
  water: '#75c6e4',
  construction: '#df9f70',
  tree: '#84bb70',
};
export function createInfrastructure(THREE, terrain, { onChange = () => {} } = {}) {
  const root = new THREE.Group();
  root.name = 'Mapped roads, paths, land and water';
  root.visible = false;
  const controller = new AbortController();
  let disposed = false,
    loaded = false,
    promise,
    summary,
    failed = false;
  async function fetchLayer() {
    const [meta, r] = await Promise.all([
      fetch(new URL('infrastructure.json', base), { signal: controller.signal }),
      fetch(new URL('infrastructure.bin', base), { signal: controller.signal }),
    ]);
    if (!meta.ok || !r.ok) throw Error('Infrastructure overlay unavailable');
    const [m, buffer] = await Promise.all([meta.json(), r.arrayBuffer()]);
    if (disposed) return;
    const data = new DataView(buffer);
    if (data.byteLength !== m.bytes || data.getUint32(0, false) !== 0x42424931)
      throw Error('Incomplete infrastructure overlay');
    let index = 4;
    for (const kind of m.categories) {
      const positions = [],
        count = data.getUint32(index, true);
      index += 4;
      for (let i = 0; i < count; i++) {
        const n = data.getUint16(index, true);
        index += 2;
        let prev;
        for (let k = 0; k < n; k++) {
          const x = data.getInt16(index, true) * m.scaleM,
            z = data.getInt16(index + 2, true) * m.scaleM;
          index += 4;
          const point = new THREE.Vector2(x, z);
          if (kind === 'tree') positions.push(x, terrain.heightAt(x, z) + 0.65, z);
          else if (prev) {
            const samples = terrainSegmentSamples(prev, point, terrain);
            for (let h = 1; h < samples.length; h++) {
              const a = samples[h - 1],
                b = samples[h];
              positions.push(a[0], a[1] + 0.38, a[2], b[0], b[1] + 0.38, b[2]);
            }
          }
          prev = point;
        }
      }
      if (!positions.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.computeBoundingSphere();
      const layer =
        kind === 'tree'
          ? new THREE.Points(
              geometry,
              new THREE.PointsMaterial({
                color: palette.tree,
                size: 3.3,
                sizeAttenuation: true,
                transparent: true,
                opacity: 0.9,
                depthWrite: false,
              }),
            )
          : new THREE.LineSegments(
              geometry,
              new THREE.LineBasicMaterial({
                color: palette[kind],
                transparent: true,
                opacity: kind === 'service' ? 0.62 : 0.86,
                depthWrite: false,
              }),
            );
      layer.name = kind;
      root.add(layer);
    }
    if (index !== buffer.byteLength) throw Error('Invalid infrastructure record count');
    summary = m;
    failed = false;
    loaded = true;
    onChange();
  }
  function start() {
    if (disposed) return Promise.resolve();
    if (!promise)
      promise = fetchLayer().catch((e) => {
        failed = e.name !== 'AbortError';
        for (const item of root.children) {
          item.geometry.dispose();
          item.material.dispose();
        }
        root.clear();
        promise = null;
        if (!disposed) onChange();
      });
    return promise;
  }
  function setVisible(visible) {
    if (disposed) return;
    root.visible = Boolean(visible);
    if (root.visible) start();
    onChange();
  }
  function dispose() {
    disposed = true;
    controller.abort();
    for (const o of root.children) {
      o.geometry.dispose();
      o.material.dispose();
    }
    root.clear();
    root.visible = false;
    loaded = false;
  }
  function stats() {
    return {
      ready: loaded,
      visible: root.visible,
      failures: Number(failed),
      features: summary?.featureCounts || {},
      batches: root.children.length,
    };
  }
  return {
    root,
    setVisible,
    dispose,
    stats,
    get ready() {
      return start();
    },
  };
}
