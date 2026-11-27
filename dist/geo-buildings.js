import { terrainSegmentSamples } from './geo-terrain.js';
// Binary footprint tiles retain outer and courtyard rings and decimetre local coordinates.
// Roofs and wall bottoms share the exact same triangle-interpolated datum as the imagery.
const base = new URL('./assets/geography/buildings/', import.meta.url);
const CEILINGS = {
  desktop: { tiles: 70, buildings: 10500, cache: 92, distance: 5500 },
  mobile: { tiles: 33, buildings: 3800, cache: 42, distance: 3800 },
};

function roofGroundMax(rings, terrain, fromEdges) {
  const outer = rings[0];
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const p of outer) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.y);
    maxZ = Math.max(maxZ, p.y);
  }
  // A piecewise planar terrain reaches its peak on a boundary or an interior grid vertex.
  function contains(ring, x, z) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i],
        b = ring[j];
      if (a.y > z !== b.y > z && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  let highest = fromEdges;
  for (let x = Math.ceil(minX / terrain.step) * terrain.step; x < maxX; x += terrain.step)
    for (let z = Math.ceil(minZ / terrain.step) * terrain.step; z < maxZ; z += terrain.step)
      if (contains(outer, x, z) && !rings.slice(1).some((h) => contains(h, x, z)))
        highest = Math.max(highest, terrain.heightAt(x, z));
  return highest;
}

export function buildFootprintTile(THREE, terrain, record, buffer, material, tileSize) {
  const data = new DataView(buffer);
  if (
    data.byteLength !== record.bytes ||
    data.getUint32(0, false) !== 0x42424631 ||
    data.getUint32(4, true) !== record.count
  )
    throw Error('Incomplete building tile');
  const ox = record.tile[0] * tileSize,
    oz = record.tile[1] * tileSize;
  const positions = [],
    colors = [],
    facade = [],
    mainIndices = [],
    minorIndices = [];
  let largeBuildings = 0;
  let excludedRoadConflicts = 0;
  const heightMethods = { supplied: 0, floorCount: 0, estimated: 0 };
  const paint = ['#65685f', '#70695f', '#5e6362', '#756354'].map((c) => new THREE.Color(c));
  const roofs = ['#444d50', '#715244', '#4e5554', '#675347'].map((c) => new THREE.Color(c));
  function vertex(x, y, z, c, along = 0, above = 0, enabled = 0) {
    positions.push(x - ox, y, z - oz);
    colors.push(c.r, c.g, c.b);
    facade.push(along, above, enabled);
  }
  let i = 8;
  function u16() {
    const n = data.getUint16(i, true);
    i += 2;
    return n;
  }
  function i16() {
    const n = data.getInt16(i, true);
    i += 2;
    return n;
  }
  for (let f = 0; f < record.count; f++) {
    const height = u16() / 10;
    const heightMethod = data.getUint8(i++);
    heightMethods[['supplied', 'floorCount', 'estimated'][heightMethod] || 'estimated']++;
    const category = data.getUint8(i++);
    const shade = .80 + .20 * ((f * 37) % 17) / 16;
    const wall = paint[category].clone().multiplyScalar(shade);
    const roof = roofs[category].clone().multiplyScalar(shade);
    const parts = u16(),
      indices = [];
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (let p = 0; p < parts; p++) {
      const rings = [],
        segments = [];
      let highest = -Infinity;
      const ringCount = u16();
      for (let j = 0; j < ringCount; j++) {
        const ring = [],
          n = u16();
        for (let k = 0; k < n; k++) {
          const x = ox + i16() / 10,
            z = oz + i16() / 10;
          ring.push(new THREE.Vector2(x, z));
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minZ = Math.min(minZ, z);
          maxZ = Math.max(maxZ, z);
        }
        rings.push(ring);
        for (let k = 0; k < n; k++) {
          const edge = terrainSegmentSamples(ring[k], ring[(k + 1) % n], terrain);
          for (const a of edge) highest = Math.max(highest, a[1]);
          segments.push(edge);
        }
      }
      const top = roofGroundMax(rings, terrain, highest) + height;
      const roofStart = positions.length / 3;
      const points = rings.flat();
      for (const point of points) vertex(point.x, top, point.y, roof);
      for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1))) {
        const A = points[a],
          B = points[b],
          C = points[c];
        const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
        indices.push(roofStart + a, roofStart + (cross > 0 ? c : b), roofStart + (cross > 0 ? b : c));
      }
      for (const edge of segments) {
        const start = positions.length / 3;
        const [ax,,az] = edge[0];
        const windowed = Number(height >= 7 && Math.hypot(ax,az) < 1100);
        for (const [x, y, z] of edge) {
          const along = Math.hypot(x-ax,z-az);
          vertex(x, y, z, wall, along, y-highest, windowed);
          vertex(x, top, z, wall, along, top-highest, windowed);
        }
        for (let k = 0; k < edge.length - 1; k++) {
          const a = start + k * 2;
          indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
        }
      }
    }
    // Omit one unsurveyed 4.5 m extrusion beside the entrance. Its source
    // footprint intersects the estimated surface of OSM way 1451011423.
    // Match the original decimetre bounds so regenerating tile order is safe.
    // The underlying Overture source and packed footprint remain available.
    const entranceRoadConflict = heightMethod === 2 && height === 4.5 &&
      Math.abs(minX - 1.1) < .01 && Math.abs(maxX - 8.2) < .01 &&
      Math.abs(minZ - 110.8) < .01 && Math.abs(maxZ - 114.3) < .01;
    if (entranceRoadConflict) {
      excludedRoadConflicts++;
      continue;
    }
    // Keep distant high-rises and larger outlines in one contiguous draw range.
    const significant = height >= 12 || Math.hypot(maxX - minX, maxZ - minZ) >= 24;
    if (significant) largeBuildings++;
    const target = significant ? mainIndices : minorIndices;
    for (const index of indices) target.push(index);
  }
  if (i !== buffer.byteLength) throw Error('Unexpected footprint tile layout');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('facade', new THREE.Float32BufferAttribute(facade, 3));
  geometry.setIndex(mainIndices.concat(minorIndices));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(ox, 0, oz);
  mesh.name = 'Footprints ' + record.tile.join(',');
  mesh.receiveShadow = true;
  mesh.userData.buildings = record.count;
  mesh.userData.renderedBuildings = record.count - excludedRoadConflicts;
  mesh.userData.excludedRoadConflicts = excludedRoadConflicts;
  mesh.userData.largeBuildings = largeBuildings;
  mesh.userData.heightMethods = heightMethods;
  mesh.userData.provenance = 'Overture and OpenStreetMap footprints with approximate facades';
  mesh.userData.mainIndexCount = mainIndices.length;
  mesh.userData.residentBytes = Object.values(geometry.attributes).reduce(
    (s, a) => s + a.array.byteLength,
    geometry.index.array.byteLength,
  );
  return mesh;
}

export function createBuildings(
  THREE,
  terrain,
  { onChange = () => {}, quality = 'desktop', maxDistance, limits = {} } = {},
) {
  const root = new THREE.Group();
  root.name = 'Real-world building footprints';
  let compact = quality === 'performance' || quality === 'mobile' || quality === 'low' || quality === 'compact' ||
    (quality === 'auto' && (globalThis.innerWidth || 900) <= 680);
  const budget = { ...CEILINGS[compact ? 'mobile' : 'desktop'], ...limits };
  if (Number.isFinite(maxDistance)) budget.distance = maxDistance;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, envMapIntensity: .4 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute vec3 facade; varying vec3 footprintFacade;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nfootprintFacade = facade;');
    shader.fragmentShader = 'varying vec3 footprintFacade;\n' +
      shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec2 cell = footprintFacade.xy / vec2(3.6,3.1);
        vec2 bay = fract(cell);
        vec2 edge = max(fwidth(cell),vec2(.001));
        vec2 opening = smoothstep(vec2(.25,.29)-edge,vec2(.25,.29)+edge,bay)
          * (1.0-smoothstep(vec2(.75,.77)-edge,vec2(.75,.77)+edge,bay));
        float mask = opening.x * opening.y;
        float fade = 1.0 - smoothstep(180.0,520.0,length(vViewPosition));
        diffuseColor.rgb *= 1.0 - .43 * mask * fade * footprintFacade.z;
      `);
  };
  const manifestController = new AbortController(),
    cache = new Map(),
    pending = new Map(),
    failures = new Map();
  const frustum = new THREE.Frustum(),
    matrix = new THREE.Matrix4();
  let active = true,
    lastCamera;
  let records = [],
    tileSize = 512,
    ready = false,
    disposed = false,
    desired = new Set(),
    distant = new Set(),
    queue = [],
    lastUpdate = -Infinity,
    clock = 0;
  let visibleCount = 0,
    visibleBuildings = 0;
  function notify() {
    if (active && !disposed) onChange();
  }
  async function manifest() {
    try {
      const response = await fetch(new URL('index.json', base), { signal: manifestController.signal });
      if (!response.ok) throw Error('Building index unavailable');
      const m = await response.json();
      if (disposed) return;
      tileSize = m.tileSize;
      records = m.tiles.map((r) => {
        const [x0, z0, x1, z1] = r.bbox;
        const box = new THREE.Box3(
          new THREE.Vector3(x0, terrain.sceneRangeM[0], z0),
          new THREE.Vector3(x1, terrain.sceneRangeM[1] + r.maxHeight + 1, z1),
        );
        return { ...r, box };
      });
      ready = true;
      lastUpdate = -Infinity;
      notify();
    } catch (e) {
      if (e.name !== 'AbortError') failures.set('index', performance.now());
      notify();
    }
  }
  const started = manifest();
  function trim() {
    const stale = [...cache.entries()]
      .filter(([id]) => !desired.has(id))
      .sort((a, b) => a[1].seen - b[1].seen);
    while (cache.size > budget.cache && stale.length) {
      const [id, item] = stale.shift();
      root.remove(item.mesh);
      item.mesh.geometry.dispose();
      cache.delete(id);
    }
  }
  function recount() {
    visibleCount = 0;
    visibleBuildings = 0;
    for (const [id, item] of cache) {
      item.mesh.visible = desired.has(id);
      if (item.mesh.visible) {
        const low = distant.has(id),
          data = item.mesh.userData;
        item.mesh.geometry.setDrawRange(0, low ? data.mainIndexCount : Infinity);
        visibleCount++;
        visibleBuildings += low ? data.largeBuildings : data.renderedBuildings;
      }
    }
  }
  async function fetchTile(record) {
    const id = record.file,
      controller = new AbortController();
    pending.set(id, controller);
    try {
      const r = await fetch(new URL(id, base), { signal: controller.signal });
      if (!r.ok) throw Error('Building tile unavailable');
      const data = await r.arrayBuffer();
      if (disposed || !active || controller.signal.aborted) return;
      const mesh = buildFootprintTile(THREE, terrain, record, data, material, tileSize);
      root.add(mesh);
      cache.set(id, { mesh, seen: clock });
      failures.delete(id);
      trim();
      recount();
      notify();
    } catch (e) {
      if (e.name !== 'AbortError' && !disposed) failures.set(id, performance.now());
    } finally {
      pending.delete(id);
      // A rapid return may select the same tile before its aborted request settles.
      if (active && !disposed && controller.signal.aborted && desired.has(id) && !cache.has(id)) {
        queue.unshift(record);
      }
      if (!disposed) pump();
    }
  }
  function pump() {
    while (active && !disposed && pending.size < (compact ? 2 : 3) && queue.length) {
      const r = queue.shift();
      if (desired.has(r.file) && !pending.has(r.file) && !cache.has(r.file)) fetchTile(r);
    }
  }
  function update(camera) {
    lastCamera = camera;
    if (disposed || !active || !ready) return;
    const now = performance.now();
    if (now - lastUpdate < 110) return;
    lastUpdate = now;
    clock++;
    camera.updateMatrixWorld();
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(matrix);
    const px = camera.position.x,
      pz = camera.position.z;
    const ordered = [];
    for (const item of records) {
      const [x0, z0, x1, z1] = item.bbox;
      const dx = Math.max(0, x0 - px, px - x1),
        dz = Math.max(0, z0 - pz, pz - z1),
        distance = Math.hypot(dx, dz);
      const retention = desired.has(item.file) ? 65 : 0;
      if (distance <= budget.distance + retention && frustum.intersectsBox(item.box))
        ordered.push({ item, distance, priority: distance - retention });
    }
    ordered.sort((a, b) => a.priority - b.priority);
    const previousDistant = distant;
    desired = new Set();
    distant = new Set();
    queue = [];
    let count = 0;
    for (const { item, distance } of ordered) {
      if (desired.size >= budget.tiles || (count > 0 && count + item.count > budget.buildings)) continue;
      desired.add(item.file);
      count += item.count;
      const height = globalThis.innerHeight || 900;
      const range = Math.hypot(distance, Math.max(0, camera.position.y - terrain.sceneRangeM[1]));
      const metresPerPixel = (2 * range * Math.tan((camera.fov * Math.PI) / 360)) / height;
      const threshold = (compact ? .85 : 1.05) + (previousDistant.has(item.file) ? -.15 : .15);
      if (metresPerPixel > threshold) distant.add(item.file);
      const saved = cache.get(item.file);
      if (saved) saved.seen = clock;
      else if (
        !pending.has(item.file) &&
        (!failures.has(item.file) || now - failures.get(item.file) > 15000)
      )
        queue.push(item);
    }
    for (const [id, controller] of pending) if (!desired.has(id)) controller.abort();
    trim();
    recount();
    pump();
  }
  function setActive(value) {
    if (disposed || active === Boolean(value)) return;
    active = Boolean(value);
    root.visible = active;
    lastUpdate = -Infinity;
    if (!active) {
      queue = [];
      desired.clear();
      distant.clear();
      for (const request of pending.values()) request.abort();
      recount();
    } else if (lastCamera) update(lastCamera);
    notify();
  }
  function stats() {
    return {
      ready,
      active,
      visibleTiles: visibleCount,
      cachedTiles: cache.size,
      pending: pending.size,
      queued: queue.length,
      visibleBuildings,
      distantTiles: distant.size,
      residentBytes: [...cache.values()].reduce((s, v) => s + v.mesh.userData.residentBytes, 0),
      failures: failures.size,
      excludedRoadConflicts: [...cache.values()].reduce((sum, { mesh }) =>
        sum + mesh.userData.excludedRoadConflicts, 0),
      heightMethods: [...cache.values()].reduce((sum, { mesh }) => {
        for (const method of Object.keys(sum)) sum[method] += mesh.userData.heightMethods[method];
        return sum;
      }, { supplied: 0, floorCount: 0, estimated: 0 }),
    };
  }
  function dispose() {
    disposed = true;
    manifestController.abort();
    for (const c of pending.values()) c.abort();
    for (const { mesh } of cache.values()) mesh.geometry.dispose();
    material.dispose();
    root.clear();
    cache.clear();
    desired.clear();
    queue = [];
    recount();
    ready = false;
  }
  function setQuality(value) {
    compact = value === 'performance' || value === 'mobile' || value === 'low' || value === 'compact' ||
      (value === 'auto' && (globalThis.innerWidth || 900) <= 680);
    Object.assign(budget, CEILINGS[compact ? 'mobile' : 'desktop'], limits);
    if (Number.isFinite(maxDistance)) budget.distance = maxDistance;
    lastUpdate = -Infinity;
    if (lastCamera) update(lastCamera);
    notify();
  }
  return { root, update, setActive, setQuality, dispose, stats, ready: started };
}
