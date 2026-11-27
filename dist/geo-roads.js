const base = new URL('./assets/geography/roads/', import.meta.url);
const rises = { median: .040, verge: .052, road: .065, path: .08, driveway: .085, marking: .092, showcaseMarking: .092 };
const illustrative = new Set(['median', 'verge', 'driveway', 'showcaseMarking']);

function roadGeometry(THREE, data, tile, metadata, terrain) {
  if (data.byteLength !== tile[3] || data.getUint32(0, false) !== 0x42425231)
    throw new Error('Invalid road tile');
  let cursor = 4;
  function read16() {
    const result = data.getUint16(cursor, true);
    cursor += 2;
    return result;
  }
  const batches = [];
  for (const kind of metadata.layers) {
    const count = data.getUint32(cursor, true);
    cursor += 4;
    const positions = [], uv = [], indices = [];
    for (let i = 0; i < count; i++) {
      const rings = [];
      const ringCount = read16();
      for (let r = 0; r < ringCount; r++) {
        const ring = [], pointCount = read16();
        for (let j = 0; j < pointCount; j++) {
          const x = read16() * metadata.scaleM;
          const z = read16() * metadata.scaleM;
          ring.push(new THREE.Vector2(x, z));
        }
        rings.push(ring);
      }
      const triangles = THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1));
      const points = rings.flat(), start = positions.length / 3;
      for (const point of points) {
        const x = point.x + tile[1], z = point.y + tile[2];
        positions.push(point.x, terrain.heightAt(x, z) + rises[kind], point.y);
        uv.push(x / 5, z / 5);
      }
      for (const [a,b,c] of triangles) {
        const p = points[a], q = points[b], r = points[c];
        const cross = (q.x-p.x)*(r.y-p.y) - (q.y-p.y)*(r.x-p.x);
        indices.push(start+a, start+(cross>0?c:b), start+(cross>0?b:c));
      }
    }
    if (!indices.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    batches.push([kind, geometry]);
  }
  if (cursor !== data.byteLength) {
    for (const [, geometry] of batches) geometry.dispose();
    throw new Error('Incomplete road tile');
  }
  return batches;
}

export function createRoads(THREE, terrain, onChange = () => {}) {
  const root = new THREE.Group();
  root.name = 'OSM terrain-conforming roads and paths';
  const controller = new AbortController();
  const color = { median: '#65684b', verge: '#847764', road: '#414044', path: '#a79780', driveway: '#93806c', marking: '#bdb4a0', showcaseMarking: '#beb5a1' };
  const materials = Object.fromEntries(Object.entries(color).map(([kind, value]) => [
    kind, new THREE.MeshStandardMaterial({ color: value, roughness: .89 }),
  ]));
  // Lane paint is an intentional thin overlay over the road surface.
  for (const kind of ['marking', 'showcaseMarking']) {
    materials[kind].polygonOffset = true;
    materials[kind].polygonOffsetFactor = -1;
    materials[kind].polygonOffsetUnits = -1;
  }
  const textures = [];
  const loader = new THREE.TextureLoader();
  for (const [slot, file, colorSpace] of [
    ['map','asphalt-color.webp',THREE.SRGBColorSpace],
    ['normalMap','asphalt-normal.webp',THREE.NoColorSpace],
  ]) {
    loader.load(new URL(file,base).href, texture => {
      if (controller.signal.aborted) {
        texture.dispose();
        return;
      }
      texture.colorSpace = colorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 4;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      textures.push(texture);
      materials.road[slot] = texture;
      if (slot === 'map') materials.road.color.set('#777274');
      materials.road.normalScale.setScalar(.38);
      materials.road.needsUpdate = true;
      onChange();
    }, undefined, () => {});
  }
  for (const [kind,slot,file,space] of [
    ['median','map','grass-base-color.png',THREE.SRGBColorSpace],
    ['driveway','map','paving-base-color.png',THREE.SRGBColorSpace],
    ['driveway','normalMap','paving-normal.png',THREE.NoColorSpace],
  ]) {
    loader.load(new URL('./assets/textures/architecture/'+file, import.meta.url).href, texture => {
      if (controller.signal.aborted) return texture.dispose();
      texture.colorSpace = space;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 4;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      textures.push(texture);
      materials[kind][slot] = texture;
      materials[kind].color.set(kind === 'median' ? '#938d70' : '#e2d8c8');
      materials[kind].normalScale.setScalar(.33);
      materials[kind].needsUpdate = true;
      onChange();
    }, undefined, () => {});
  }
  const tileGroups = new Map(), pending = new Set(), retry = new Map(), bundles = new Map();
  const projection = new THREE.Matrix4(), frustum = new THREE.Frustum();
  const position = new THREE.Vector3();
  let metadata, selected = [], lastUpdate = -Infinity, profile = 'auto', active = true;
  let presentation = 'showcase';
  let nearReady = false;
  const startup = fetch(new URL('index.json', base), { signal: controller.signal })
    .then(response => {
      if (!response.ok) throw new Error('Road index unavailable');
      return response.json();
    })
    .then(index => {
      metadata = index;
      const near = index.tiles.filter(([,x,z]) => x >= -index.tileSize && x < index.tileSize &&
        z >= -index.tileSize && z < index.tileSize);
      selected = near;
      return Promise.all(near.map(loadTile)).then(results => {
        nearReady = results.length > 0 && results.every(Boolean);
        if (!controller.signal.aborted) onChange();
      });
    }).catch(() => {});
  function disposeTile(group) {
    group.removeFromParent();
    group.traverse(mesh => mesh.geometry?.dispose());
  }
  async function loadTile(tile) {
    const [id, x, z, bytes, bundle, offset] = tile;
    pending.add(id);
    try {
      if (!bundles.has(bundle)) {
        const request = fetch(new URL(bundle+'.bin', base), { signal: controller.signal }).then(response => {
          if (!response.ok) throw new Error('Road bundle unavailable');
          return response.arrayBuffer();
        }).catch(error => {
          bundles.delete(bundle);
          throw error;
        });
        bundles.set(bundle, request);
      }
      const data = new DataView(await bundles.get(bundle), offset, bytes);
      if (controller.signal.aborted) return false;
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      for (const [kind,geometry] of roadGeometry(THREE,data,tile,metadata,terrain)) {
        const mesh = new THREE.Mesh(geometry, materials[kind]);
        mesh.name = kind;
        mesh.receiveShadow = Math.hypot(x+128,z+128) < 650;
        mesh.visible = !illustrative.has(kind) || presentation === 'showcase';
        group.add(mesh);
      }
      root.add(group);
      tileGroups.set(id, group);
      retry.delete(id);
      onChange();
      return true;
    } catch {
      if (!controller.signal.aborted) retry.set(id, performance.now() + 10000);
      return false;
    } finally {
      pending.delete(id);
    }
  }
  function update(camera) {
    if (!metadata || !active || controller.signal.aborted) return;
    const now = performance.now();
    const mobile = profile === 'performance' || (profile === 'auto' && innerWidth <= 680);
    if (now - lastUpdate >= 260) {
      lastUpdate = now;
      camera.getWorldPosition(position);
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      const radius = position.y > 600 ? 5100 : mobile ? 1150 : 2350;
      const terrainLow = terrain.sceneRangeM?.[0] ?? -115;
      const terrainHigh = terrain.sceneRangeM?.[1] ?? 90;
      const previous = new Set(selected.map(tile=>tile[0]));
      const half = metadata.tileSize/2, candidates = [];
      for (const tile of metadata.tiles) {
        const [,x,z] = tile;
        const distance = Math.hypot(x+half-position.x,z+half-position.z);
        const local = x >= -metadata.tileSize && x < metadata.tileSize &&
          z >= -metadata.tileSize && z < metadata.tileSize;
        const retention = previous.has(tile[0]) ? half : 0;
        if (!local && distance > radius + retention) continue;
        const bounds = new THREE.Box3(new THREE.Vector3(x,terrainLow-.1,z),
          new THREE.Vector3(x+2*half,terrainHigh+.2,z+2*half));
        if (local || frustum.intersectsBox(bounds)) candidates.push([local ? -1 : distance-retention,tile]);
      }
      selected = candidates.sort((a,b) => a[0]-b[0]).slice(0,mobile ? 22 : 68).map(row=>row[1]);
      const wanted = new Set(selected.map(tile=>tile[0]));
      for (const [id,group] of tileGroups) {
        group.visible = wanted.has(id);
        if (!group.visible && tileGroups.size > (mobile ? 34 : 94)) {
          disposeTile(group);
          tileGroups.delete(id);
        }
      }
    }
    for (const tile of selected) {
      if (pending.size >= 5) break;
      const id = tile[0];
      if (!tileGroups.has(id) && !pending.has(id) && (retry.get(id) ?? 0) <= now) loadTile(tile);
    }
    if (!nearReady && selected.length && metadata.tiles.filter(([,x,z]) => x >= -metadata.tileSize &&
      x < metadata.tileSize && z >= -metadata.tileSize && z < metadata.tileSize)
      .every(([id]) => tileGroups.has(id))) {
      nearReady = true;
      onChange();
    }
  }
  return {
    root, startup, update,
    setActive(value) { active = Boolean(value); root.visible = active; lastUpdate = -Infinity; },
    setQuality(value) { profile = value; lastUpdate = -Infinity; },
    setPresentation(value) {
      presentation = value;
      for (const group of tileGroups.values()) for (const mesh of group.children)
        if (illustrative.has(mesh.name)) mesh.visible = value === 'showcase';
    },
    stats: () => ({ ready: nearReady, tiles: tileGroups.size, visibleTiles: [...tileGroups.values()].filter(g=>g.visible).length }),
    dispose() {
      controller.abort();
      for (const group of tileGroups.values()) disposeTile(group);
      tileGroups.clear();
      bundles.clear();
      selected = [];
      for (const material of Object.values(materials)) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
