// ArcGIS REST imagery. Tile bytes live only in this session's bounded texture array.
const SERVICE = 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer';
const SIDE = 256,
  TILE_BYTES = SIDE * SIDE * 4;
const VERIFIED_ZOOM = 19; // Published at Plot 20; reevaluated against the current source and tilemap.
const RETRY_DELAYS = [1500, 5000, 15000], REQUEST_TIMEOUT = 12000;
const ITEM = 'https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9';
export function mercatorTile(lon, lat, z) {
  const n = 2 ** z;
  return [((lon + 180) / 360) * n, ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) * n) / 2];
}
function geographic(x, y, level) {
  const n = 2 ** level;
  return [(360 * x) / n - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI];
}
function tileId(z, x, y) {
  return z + '/' + y + '/' + x;
}

export function createArcGISOverlay(THREE, terrain, { mobile, onChange, key, startLevel = 12 }) {
  const START = startLevel;
  const capacity = mobile ? 32 : 64,
    concurr = mobile ? 2 : 4;
  const { radius } = terrain,
    origin = terrain.localToWGS84(0, 0);
  const corners = [
    [-radius, -radius],
    [radius, -radius],
    [radius, radius],
    [-radius, radius],
  ].map(([x, z]) => mercatorTile(...terrain.localToWGS84(x, z), START));
  const minX = Math.floor(Math.min(...corners.map((p) => p[0]))),
    minY = Math.floor(Math.min(...corners.map((p) => p[1])));
  const endX = Math.ceil(Math.max(...corners.map((p) => p[0]))),
    endY = Math.ceil(Math.max(...corners.map((p) => p[1])));
  const projection = { x: minX, y: minY, level: START };
  const tiles = new Map(),
    activeTiles = new Map(),
    inflight = new Map(),
    blocks = new Map(),
    unavailable = new Set();
  const fades = new Float32Array(capacity),
    localEye = new THREE.Vector3(),
    frustum = new THREE.Frustum();
  const tableUniform = { value: null },
    atlasUniform = { value: null },
    multiplier = { value: 1 };
  let atlas,
    table,
    width,
    height,
    allSlots = [],
    desired = new Map(),
    toLoad = [];
  let maxZoom,
    enabled = true,
    active = true,
    disposed = false,
    booting = false,
    metadataReady = false,
    ctrl = new AbortController();
  let reason = 'Checking imagery coverage',
    credit = '',
    latestCamera,
    viewport,
    fadeFrame = 0;
  let decodeContext,
    lastKey = '',
    metaRetryAt = 0,
    metaFailures = 0,
    retryTimer = 0,
    generation = 0;
  function decorate(material) {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        geoAtlas: atlasUniform,
        geoPages: tableUniform,
        geoMultiplier: multiplier,
        geoFade: { value: fades },
      });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 geoTile; varying vec2 vGeoTile;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvGeoTile = geoTile;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
        varying vec2 vGeoTile;
        uniform highp sampler2DArray geoAtlas;
        uniform highp sampler2D geoPages;
        uniform float geoMultiplier;
        uniform float geoFade[${capacity}];
        vec4 imagerySample(float slot, float level) {
          vec2 uv = vGeoTile * exp2(level);
          return textureGrad(geoAtlas, vec3(fract(uv), slot-1.0), dFdx(uv), dFdy(uv));
        }`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          if (geoMultiplier > 1.0) {
            ivec2 cell = ivec2(floor(vGeoTile*geoMultiplier));
            vec4 page = floor(texelFetch(geoPages,cell,0)*255.0+0.5);
            if (page.x > 0.0) {
              vec4 tint = vec4(diffuse, opacity);
              vec4 parentColor = diffuseColor;
              if(page.z > 0.0) parentColor = tint * imagerySample(page.z,page.w);
              diffuseColor = mix(parentColor, tint * imagerySample(page.x,page.y), geoFade[int(page.x)-1]);
            }
          }`,
        );
    };
    material.customProgramCacheKey = () => `registered-imagery-${capacity}`;
  }
  async function request(path, query, signal, json = true) {
    const citation = path.startsWith('/4/');
    const source = citation ? 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer' : SERVICE;
    const url = new URL(source + path);
    if (query) url.search = new URLSearchParams(query);
    // This raster service's CORS preflight rejects Authorization headers.
    // ArcGIS supports the public, origin-restricted browser token parameter.
    if (!citation) url.searchParams.set('token', key);
    signal.throwIfAborted();
    const pending = new AbortController(), cancel = () => pending.abort();
    signal.addEventListener('abort', cancel, { once: true });
    const deadline = setTimeout(cancel, REQUEST_TIMEOUT);
    try {
      const r = await fetch(url, {
        signal: pending.signal,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
      });
      if (!r.ok) throw Object.assign(Error('Imagery service unavailable'), { code: r.status });
      if (!json && !r.headers.get('content-type')?.includes('json')) return await r.blob();
      const data = await r.json();
      if (data.error)
        throw Object.assign(Error('ArcGIS service rejected the request'), { code: data.error.code });
      if (!json) throw Error('No image at this zoom');
      return data;
    } finally {
      clearTimeout(deadline);
      signal.removeEventListener('abort', cancel);
    }
  }
  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = 0;
    if (!active || disposed || !enabled) return;
    const deadlines = metadataReady
      ? [...desired.values()].filter((t) => !activeTiles.has(t.id) && !inflight.has(t.id)
        && (t.z === START || activeTiles.has(tileId(t.z - 1, t.x >> 1, t.y >> 1)))).map((t) => t.retry)
      : [metaRetryAt];
    const next = Math.min(...deadlines.filter((at) => at > 0 && Number.isFinite(at)));
    if (!Number.isFinite(next)) return;
    // The scene renders on demand: a clock gate alone never wakes an idle camera.
    retryTimer = setTimeout(() => {
      retryTimer = 0;
      if (!active || disposed || !enabled) return;
      if (metadataReady) pump();
      else boot();
      onChange();
    }, Math.max(0, next - performance.now()));
  }
  function allocate() {
    const factor = 2 ** (maxZoom - START);
    width = (endX - minX) * factor;
    height = (endY - minY) * factor;
    table = new THREE.DataTexture(new Uint8Array(width * height * 4), width, height);
    table.needsUpdate = true;
    tableUniform.value = table;
    multiplier.value = factor;
    atlas = new THREE.DataArrayTexture(new Uint8Array(capacity * TILE_BYTES), SIDE, SIDE, capacity);
    atlas.minFilter = THREE.LinearMipmapLinearFilter;
    atlas.magFilter = THREE.LinearFilter;
    atlas.generateMipmaps = true;
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.anisotropy = 4;
    atlas.needsUpdate = true;
    atlasUniform.value = atlas;
    allSlots = Array.from({ length: capacity }, (_, i) => capacity - 1 - i);
  }
  function releaseAtlas() {
    multiplier.value = 1;
    atlas?.dispose();
    table?.dispose();
    atlasUniform.value = tableUniform.value = null;
    atlas = table = null;
    activeTiles.clear();
    fades.fill(0);
  }
  async function boot() {
    if (booting || metadataReady || !active || !enabled || performance.now() < metaRetryAt) return;
    booting = true;
    metaRetryAt = 0;
    reason = 'Checking imagery coverage';
    const epoch = generation;
    const signal = ctrl.signal;
    try {
      const meta = await request('', { f: 'json' }, signal);
      if (
        meta.tileInfo?.rows !== 256 ||
        meta.tileInfo?.cols !== 256 ||
        ![3857, 102100, 102113].includes(meta.tileInfo.spatialReference?.wkid || meta.spatialReference?.wkid)
      )
        throw Error('Unsupported basemap grid');
      const cacheMax = Math.max(...meta.tileInfo.lods.map((l) => l.level));
      // The scale index has empty levels even when global service metadata advertises z23.
      const source = await request(
        '/4/query',
        {
          f: 'json',
          geometry: origin.join(','),
          geometryType: 'esriGeometryPoint',
          inSR: 4326,
          spatialRel: 'esriSpatialRelIntersects',
          outFields: 'SRC_RES,MaxMapLevel,NICE_DESC',
          returnGeometry: false,
        },
        signal,
      ).catch((error) => {
        if (signal.aborted) throw error;
        // Some entitlements expose tiled imagery without the optional citation operation.
        // The local published bound still requires a positive live per-tile cache check.
        return { features: [] };
      });
      const records = source.features
        ?.map((f) => f.attributes)
        .filter((a) => a.SRC_RES > 0 && a.MaxMapLevel >= START)
        .sort((a, b) => a.SRC_RES - b.SRC_RES);
      let limit = Math.min(cacheMax, records?.[0]?.MaxMapLevel ?? VERIFIED_ZOOM);
      while (Math.max(endX - minX, endY - minY) * 2 ** (limit - START) > 1024) limit--;
      let available = false;
      for (let z = limit; z >= START; z--) {
        const [x, y] = mercatorTile(...origin, z).map(Math.floor);
        const hit = await availableTile({ x, y, z }, signal);
        if (hit) {
          maxZoom = z;
          available = true;
          break;
        }
      }
      if (!available) throw Error('No cached World Imagery at the plot');
      if (!active || disposed || signal.aborted || epoch !== generation) return;
      credit = String(meta.copyrightText || 'Esri, Vantor, Earthstar Geographics and the GIS User Community');
      const regionalCredits = [...new Set(records?.map((record) => record.NICE_DESC).filter(Boolean))];
      for (const source of regionalCredits)
        if (!credit.toLowerCase().includes(source.toLowerCase())) credit += ', ' + source;
      allocate();
      metadataReady = true;
      metaFailures = 0;
      reason = 'Loading available World Imagery tiles';
      if (latestCamera) select();
    } catch (error) {
      if (!signal.aborted && epoch === generation) fail(error);
    } finally {
      if (epoch === generation) {
        booting = false;
        scheduleRetry();
        if (!disposed) onChange();
      }
    }
  }
  function fail(error) {
    const denied = [401, 403, 498, 499].includes(error.code);
    reason = denied ? 'ArcGIS authorization unavailable' : 'Geographic imagery unavailable; architectural ground';
    if (denied) {
      enabled = false;
      ctrl.abort();
      for (const c of inflight.values()) c.abort();
      clearTimeout(retryTimer);
      retryTimer = 0;
      releaseAtlas();
      metadataReady = false;
    } else {
      const delay = RETRY_DELAYS[metaFailures++];
      metaRetryAt = delay === undefined ? Infinity : performance.now() + delay;
    }
  }
  async function availableTile(t, signal) {
    const x = t.x - (t.x % 8),
      y = t.y - (t.y % 8),
      id = tileId(t.z, x, y);
    if (!blocks.has(id)) {
      if (blocks.size > 192) blocks.delete(blocks.keys().next().value);
      const pending = request(`/tilemap/${t.z}/${y}/${x}/8/8`, { f: 'json' }, signal).catch((error) => {
        if (blocks.get(id) === pending) blocks.delete(id);
        throw error;
      });
      blocks.set(id, pending);
    }
    const data = await blocks.get(id),
      loc = data.location || { left: x, top: y, width: 8, height: 8 };
    const col = t.x - loc.left,
      row = t.y - loc.top;
    return (
      col >= 0 && row >= 0 && col < loc.width && row < loc.height && data.data?.[row * loc.width + col] === 1
    );
  }
  function getTile(z, x, y) {
    const id = tileId(z, x, y);
    if (tiles.has(id)) return tiles.get(id);
    const pts = [
      [x, y],
      [x + 1, y],
      [x + 1, y + 1],
      [x, y + 1],
    ].map(([tx, ty]) => terrain.wgs84ToLocal(...geographic(tx, ty, z)));
    const minX = Math.min(...pts.map((p) => p[0])),
      maxX = Math.max(...pts.map((p) => p[0]));
    const minZ = Math.min(...pts.map((p) => p[1])),
      maxZ = Math.max(...pts.map((p) => p[1]));
    const cx = (minX + maxX) / 2,
      cz = (minZ + maxZ) / 2,
      cy = terrain.heightAt(cx, cz);
    const span = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
    const [low, high] = terrain.sceneRangeM || [-90, 45];
    const bound = new THREE.Sphere(
      new THREE.Vector3(cx, (low + high) / 2, cz),
      Math.hypot((maxX - minX) / 2, (maxZ - minZ) / 2, (high - low) / 2),
    );
    const t = { id, z, x, y, cx, cy, cz, minX, maxX, minZ, maxZ, span, bound };
    if (tiles.size > 2048) tiles.clear();
    tiles.set(id, t);
    return t;
  }
  function select() {
    if (!active || !enabled || !metadataReady || disposed || !latestCamera) return;
    const leaves = [],
      next = new Map();
    const focal = viewport / (2 * Math.tan((latestCamera.fov * Math.PI) / 360));
    function consider(t) {
      if (
        unavailable.has(t.id) ||
        t.minX > radius ||
        t.maxX < -radius ||
        t.minZ > radius ||
        t.maxZ < -radius ||
        !frustum.intersectsSphere(t.bound)
      )
        return;
      const distance = Math.hypot(
        Math.max(0, t.minX - localEye.x, localEye.x - t.maxX),
        localEye.y - t.cy,
        Math.max(0, t.minZ - localEye.z, localEye.z - t.maxZ),
      );
      // Center distance breaks ties between cells whose rotated bounding boxes overlap.
      const effective = Math.max(6, distance, localEye.distanceTo(t.bound.center) * 0.32);
      const score = (t.span * focal) / effective / SIDE;
      next.set(t.id, t);
      if (score > (mobile ? 1.45 : 1.25) && t.z < maxZoom) leaves.push({ t, score });
    }
    for (let y = minY; y < endY; y++) for (let x = minX; x < endX; x++) consider(getTile(START, x, y));
    while (leaves.length && next.size + 4 <= capacity) {
      leaves.sort((a, b) => b.score - a.score);
      const { t } = leaves.shift();
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) consider(getTile(t.z + 1, t.x * 2 + dx, t.y * 2 + dy));
    }
    desired = next;
    toLoad = [...next.values()];
    for (const [id, entry] of inflight) if (!desired.has(id)) entry.abort();
    const nextKey = [...desired.keys()].join('|');
    if (nextKey !== lastKey) {
      lastKey = nextKey;
      rebuildTable();
    }
    pump();
  }
  function rebuildTable() {
    if (!table) return;
    const pixels = table.image.data;
    pixels.fill(0);
    // Keep the previous tile visible while its replacement is loading. Clearing
    // it as soon as the camera selects a new set leaves a one-frame architectural
    // ground hole during rotation, which reads as a flashing/glitching surface.
    // Desired entries are written last so a newly loaded tile always wins over
    // the retained tile it replaces.
    for (const entry of [...activeTiles.values()]
      .sort((a, b) => Number(desired.has(a.tile.id)) - Number(desired.has(b.tile.id)) || a.tile.z - b.tile.z)) {
      const t = entry.tile,
        span = 2 ** (maxZoom - t.z),
        sourceScale = 2 ** (maxZoom - START);
      const left = t.x * span - minX * sourceScale,
        top = t.y * span - minY * sourceScale;
      for (let y = top; y < top + span; y++)
        for (let x = left; x < left + span; x++) {
          const off = (y * width + x) * 4;
          pixels[off + 2] = pixels[off];
          pixels[off + 3] = pixels[off + 1];
          pixels[off] = entry.slot + 1;
          pixels[off + 1] = t.z - START;
        }
    }
    table.needsUpdate = true;
  }
  function animateFade() {
    cancelAnimationFrame(fadeFrame);
    fadeFrame = 0;
    if (!active || disposed) return;
    let again = false;
    const now = performance.now();
    for (const { slot, loaded } of activeTiles.values()) {
      fades[slot] = Math.min(1, (now - loaded) / 180);
      if (fades[slot] < 1) again = true;
    }
    onChange();
    if (again) fadeFrame = requestAnimationFrame(animateFade);
  }
  function freeSlot() {
    if (allSlots.length) return allSlots.pop();
    const item = [...activeTiles.values()]
      .filter((a) => !desired.has(a.tile.id))
      .sort((a, b) => a.loaded - b.loaded)[0];
    if (!item) return null;
    activeTiles.delete(item.tile.id);
    return item.slot;
  }
  async function fetchTile(t, controller, epoch) {
    const signal = controller.signal;
    let bitmap;
    try {
      const available = await availableTile(t, ctrl.signal);
      signal.throwIfAborted();
      if (!available) {
        unavailable.add(t.id);
        return;
      }
      signal.throwIfAborted();
      const blob = await request('/tile/' + t.id, null, signal, false);
      bitmap = await createImageBitmap(blob);
      if (bitmap.width !== SIDE || bitmap.height !== SIDE) throw Error('Unexpected imagery dimensions');
      if (signal.aborted || disposed || !desired.has(t.id) || !atlas) return;
      decodeContext ??= Object.assign(document.createElement('canvas'), {
        width: SIDE,
        height: SIDE,
      }).getContext('2d', { willReadFrequently: true });
      decodeContext.drawImage(bitmap, 0, 0);
      const slot = freeSlot();
      if (slot === null) return;
      atlas.image.data.set(decodeContext.getImageData(0, 0, SIDE, SIDE).data, slot * TILE_BYTES);
      atlas.addLayerUpdate(slot);
      atlas.needsUpdate = true;
      fades[slot] = 0;
      activeTiles.set(t.id, { tile: t, slot, loaded: performance.now() });
      t.failures = 0;
      t.retry = 0;
      reason = 'World Imagery';
      rebuildTable();
      animateFade();
    } catch (error) {
      if (!signal.aborted && !disposed && epoch === generation) {
        if ([401, 403, 498, 499].includes(error.code)) fail(error);
        else {
          const delay = RETRY_DELAYS[t.failures || 0];
          t.failures = (t.failures || 0) + 1;
          t.retry = delay === undefined ? Infinity : performance.now() + delay;
          if (!activeTiles.size) reason = 'Geographic imagery unavailable; architectural ground';
        }
      }
    } finally {
      bitmap?.close();
      if (inflight.get(t.id) === controller) inflight.delete(t.id);
      if (epoch === generation) {
        pump();
        if (!disposed) onChange();
      }
    }
  }
  function pump() {
    if (!active || disposed || !metadataReady || !enabled) return;
    for (const t of toLoad) {
      if (inflight.size >= concurr) break;
      if (activeTiles.has(t.id) || inflight.has(t.id) || unavailable.has(t.id) || t.retry > performance.now())
        continue;
      // A coarse tile must arrive first, giving every requested child a visible parent.
      if (t.z > START && !activeTiles.has(tileId(t.z - 1, t.x >> 1, t.y >> 1))) continue;
      const abort = new AbortController();
      inflight.set(t.id, abort);
      t.retry = 0;
      fetchTile(t, abort, generation);
    }
    scheduleRetry();
  }
  function update(camera, eye, visible, height) {
    latestCamera = camera;
    localEye.copy(eye);
    frustum.copy(visible);
    viewport = height;
    if (metadataReady) select();
    else boot();
  }
  function setActive(value) {
    active = Boolean(value);
    if (!active) {
      generation++;
      booting = false;
      ctrl.abort();
      ctrl = new AbortController();
      blocks.clear();
      for (const c of inflight.values()) c.abort();
      inflight.clear();
      clearTimeout(retryTimer);
      retryTimer = 0;
      cancelAnimationFrame(fadeFrame);
    } else if (metadataReady) {
      select();
      animateFade();
    } else {
      boot();
      scheduleRetry();
    }
  }
  function retry() {
    if (disposed) return;
    generation++;
    ctrl.abort();
    ctrl = new AbortController();
    for (const c of inflight.values()) c.abort();
    inflight.clear();
    blocks.clear();
    unavailable.clear();
    enabled = true;
    booting = false;
    metaFailures = metaRetryAt = 0;
    for (const t of new Set([...tiles.values(), ...desired.values()])) t.failures = t.retry = 0;
    reason = metadataReady ? 'Loading available World Imagery tiles' : 'Checking imagery coverage';
    if (metadataReady) select();
    else boot();
    scheduleRetry();
    onChange();
  }
  function stats() {
    const count = [...activeTiles.keys()].filter((id) => desired.has(id)).length;
    const failures = metaFailures > 0 || [...desired.values()].some((t) => t.failures > 0);
    const noCoverage = metadataReady && !count && !inflight.size && unavailable.size > 0;
    const state = count ? 'ready' : !enabled ? 'unauthorized' : booting || inflight.size ? 'loading'
      : retryTimer ? 'retrying' : failures || noCoverage ? 'unavailable' : 'loading';
    return {
      ...(count ? { provider: 'arcgis', attribution: credit, attributionUrl: ITEM } : {}),
      reason: noCoverage ? 'No cached World Imagery in this view' : reason,
      state,
      canRetry: !disposed && (!enabled || failures || noCoverage),
      loading: inflight.size + Number(booting),
      visibleTiles: count,
      maxZoom: maxZoom ?? null,
      highestVisibleZoom: Math.max(
        0,
        ...[...activeTiles.values()].filter((t) => desired.has(t.tile.id)).map((t) => t.tile.z),
      ),
      textures: atlas ? 2 : 0,
      estimatedTextureBytes: atlas ? Math.ceil((capacity * TILE_BYTES * 4) / 3) + width * height * 4 : 0,
    };
  }
  function dispose() {
    disposed = true;
    setActive(false);
    releaseAtlas();
    tiles.clear();
    desired.clear();
    unavailable.clear();
  }
  return { projection, decorate, update, setActive, stats, retry, dispose };
}
