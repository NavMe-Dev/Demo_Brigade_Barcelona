import { createArcGISOverlay, mercatorTile } from './gis-arcgis.js';

const SENTINEL_RADIUS = 6400;
const SENTINEL_BLOCK = 2560;
const LOCAL_PATH = 'assets/geography/sentinel/';
const OPEN_CREDIT = 'Contains modified Copernicus Sentinel data (2025)';
// Linear-light multipliers preserve the optical image's local contrast and acquisition detail.
const ILLUMINATION = {
  day: [0.88, 0.89, 0.90],
  morning: [0.91, 0.79, 0.67],
  sunset: [0.76, 0.50, 0.36],
  evening: [0.23, 0.29, 0.39],
  night: [0.08, 0.105, 0.16],
};

async function loadTexture(THREE, path, signal) {
  const response = await fetch(LOCAL_PATH + path, { signal });
  if (!response.ok) throw Error('Local imagery unavailable');
  const url = URL.createObjectURL(await response.blob());
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    signal.throwIfAborted();
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// The DEM and footprint pipeline use this exact diagonal at every 32 m cell.
function groundPatch(THREE, terrain, x0, z0, x1, z1, geoProjection) {
  const step = terrain.step;
  const columns = Math.round((x1 - x0) / step) + 1,
    rows = Math.round((z1 - z0) / step) + 1;
  const vertices = columns * rows;
  const position = new Float32Array(vertices * 3),
    uv = new Float32Array(vertices * 2);
  const tones = new Uint8Array(vertices * 3),
    geographic = geoProjection && new Float32Array(vertices * 2);
  const indices = new Uint16Array((columns - 1) * (rows - 1) * 6);
  let p = 0,
    face = 0;
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < columns; col++, p++) {
      const x = x0 + col * step,
        z = z0 + row * step,
        y = terrain.heightAt(x, z);
      position.set([x, y, z], p * 3);
      uv.set([0.5 + x / (2 * SENTINEL_RADIUS), 0.5 - z / (2 * SENTINEL_RADIUS)], p * 2);
      // A small optical hillshade preserves imagery colour while revealing local relief.
      const slope = (y - terrain.heightAt(x - step, z) + terrain.heightAt(x, z + step) - y) / step;
      const shade = Math.round(255 * Math.max(0.81, Math.min(1, 0.96 + slope * 0.14)));
      tones.fill(shade, 3 * p, 3 * p + 3);
      if (geographic) {
        const tile = mercatorTile(...terrain.localToWGS84(x, z), geoProjection.level);
        geographic.set([tile[0] - geoProjection.x, tile[1] - geoProjection.y], p * 2);
      }
      if (row < rows - 1 && col < columns - 1) {
        const far = p + columns;
        indices.set([p, far, far + 1, p, far + 1, p + 1], face);
        face += 6;
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(tones, 3, true));
  if (geographic) geometry.setAttribute('geoTile', new THREE.BufferAttribute(geographic, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createImagery(
  THREE,
  terrain,
  { onChange = () => {}, quality = 'desktop', settings = {} } = {},
) {
  const mobile = quality === 'mobile',
    maxLocal = mobile ? 6 : 10;
  let mood = 'day';
  const tint = new THREE.Color().setRGB(...ILLUMINATION.day);
  const showcase = { value: 1 };
  const root = new THREE.Group();
  root.name = 'RegisteredTerrain';
  const arc =
    settings.arcgisImageryEnabled === true && settings.arcgisApiKey
      ? createArcGISOverlay(THREE, terrain, { onChange, mobile, key: settings.arcgisApiKey })
      : null;
  const sentinel = new Map(),
    frustum = new THREE.Frustum(),
    clip = new THREE.Matrix4();
  const cameraPos = new THREE.Vector3();
  let stopped = false,
    active = true,
    controller = new AbortController(),
    preview,
    previewPending = false;
  let regionPreview,
    regionPending = false,
    previewRetry = 0,
    regionRetry = 0;
  let lastCamera,
    lastHeight,
    localRequested = 0,
    wanted = new Set();
  const seed = new THREE.DataTexture(new Uint8Array([151, 143, 116, 255]), 1, 1);
  seed.colorSpace = THREE.SRGBColorSpace;
  seed.needsUpdate = true;
  const groundSurface = { value: seed };
  new THREE.TextureLoader().load(new URL('./assets/geography/roads/soil-color.webp', import.meta.url).href, texture => {
    if (stopped) return texture.dispose();
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    groundSurface.value = texture;
    onChange();
  }, undefined, () => {});
  function material() {
    const m = new THREE.MeshBasicMaterial({ map: seed, toneMapped: false, vertexColors: true });
    m.color = tint;
    arc?.decorate(m);
    const decorateGeography = m.onBeforeCompile;
    m.onBeforeCompile = (shader) => {
      decorateGeography.call(m, shader);
      shader.uniforms.showcase = showcase;
      shader.uniforms.groundSurface = groundSurface;
      shader.vertexShader = 'varying vec2 sitePosition;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>', '#include <begin_vertex>\nsitePosition = position.xz;',
      );
      shader.fragmentShader = 'uniform float showcase; uniform sampler2D groundSurface; varying vec2 sitePosition;\n' +
        shader.fragmentShader.replace('#include <color_fragment>', `
          float distanceToPlot = length(sitePosition * vec2(1.0, .88));
          float finish = showcase * (1.0 - smoothstep(175.0, 860.0, distanceToPlot));
          vec3 detail = texture2D(groundSurface, sitePosition / 6.0).rgb;
          vec3 wide = texture2D(groundSurface, sitePosition.yx / 31.0).rgb;
          float field = sin(sitePosition.x * .021) * cos(sitePosition.y * .028);
          vec3 ground = (detail * .41 + wide * .59) * vec3(.94,.90,.75) * (.90 + .13 * field);
          diffuseColor.rgb = mix(diffuseColor.rgb, ground * diffuse, finish);
          #include <color_fragment>
        `);
    };
    return m;
  }
  const horizon = material();
  const cuts = [-terrain.radius];
  for (let v = -SENTINEL_RADIUS; v <= SENTINEL_RADIUS; v += SENTINEL_BLOCK / 2) {
    if (v > -terrain.radius && v < terrain.radius) cuts.push(v);
  }
  cuts.push(terrain.radius);
  for (let iz = 1; iz < cuts.length; iz++)
    for (let ix = 1; ix < cuts.length; ix++) {
      const x0 = cuts[ix - 1],
        z0 = cuts[iz - 1],
        x1 = cuts[ix],
        z1 = cuts[iz];
      const col = Math.floor(((x0 + x1) / 2 + SENTINEL_RADIUS) / SENTINEL_BLOCK);
      const row = Math.floor(((z0 + z1) / 2 + SENTINEL_RADIUS) / SENTINEL_BLOCK);
      let item;
      if (col >= 0 && col < 5 && row >= 0 && row < 5) {
        const id = `${row}-${col}`;
        item = sentinel.get(id);
        if (!item) {
          item = { id, row, col, material: material(), patches: [], texture: null };
          sentinel.set(id, item);
        }
      }
      const mesh = new THREE.Mesh(
        groundPatch(THREE, terrain, x0, z0, x1, z1, arc?.projection),
        item?.material || horizon,
      );
      mesh.name = 'DEM ' + x0 + ',' + z0;
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
      item?.patches.push(mesh.geometry.boundingSphere);
    }
  function loadPreview() {
    if (preview || previewPending || stopped || !active || performance.now() < previewRetry) return;
    previewPending = true;
    const signal = controller.signal;
    return loadTexture(THREE, 'overview.webp', signal)
      .then((texture) => {
        if (stopped) {
          texture.dispose();
          return;
        }
        preview = texture;
        for (const item of sentinel.values()) if (!item.texture) item.material.map = preview;
        onChange();
      })
      .catch(() => {
        if (!signal.aborted) previewRetry = performance.now() + 60000;
      })
      .finally(() => {
        previewPending = false;
      });
  }
  function loadRegion() {
    if (regionPreview || regionPending || stopped || !active || performance.now() < regionRetry) return;
    regionPending = true;
    const signal = controller.signal;
    return loadTexture(THREE, 'horizon.webp', signal)
      .then((texture) => {
        if (stopped) {
          texture.dispose();
          return;
        }
        const scale = SENTINEL_RADIUS / terrain.radius;
        texture.repeat.set(scale, scale);
        texture.offset.setScalar((1 - scale) / 2);
        regionPreview = horizon.map = texture;
        onChange();
      })
      .catch(() => {
        if (!signal.aborted) regionRetry = performance.now() + 60000;
      })
      .finally(() => {
        regionPending = false;
      });
  }
  async function loadLocal(item) {
    item.pending = true;
    localRequested++;
    const signal = controller.signal;
    try {
      const t = await loadTexture(THREE, item.id + '.webp', signal);
      if (stopped || !wanted.has(item)) {
        t.dispose();
        return;
      }
      // Three's base UV is north-up in the source image's local X/Z axes.
      const scale = 256 / 258;
      t.repeat.set(5 * scale, 5 * scale);
      t.offset.set((1 - 256 * item.col) / 258, (1 - 256 * (4 - item.row)) / 258);
      item.texture = item.material.map = t;
      onChange();
    } catch {
      if (!signal.aborted) item.retry = performance.now() + 60000;
    } finally {
      item.pending = false;
      localRequested--;
      pumpLocal();
    }
  }
  function pumpLocal() {
    if (!active || stopped) return;
    for (const item of wanted) {
      if (localRequested >= (mobile ? 2 : 4)) break;
      if (!item.texture && !item.pending && !(item.retry > performance.now())) loadLocal(item);
    }
  }
  function update(camera, viewportHeight = innerHeight) {
    if (!active || stopped || !camera) return;
    lastCamera = camera;
    lastHeight = viewportHeight;
    root.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(root.matrixWorld);
    frustum.setFromProjectionMatrix(clip);
    cameraPos.setFromMatrixPosition(camera.matrixWorld);
    root.worldToLocal(cameraPos);
    const visible = [];
    for (const item of sentinel.values()) {
      let distance = Infinity;
      for (const sphere of item.patches)
        if (frustum.intersectsSphere(sphere))
          distance = Math.min(distance, cameraPos.distanceTo(sphere.center));
      if (Number.isFinite(distance)) visible.push({ item, distance });
    }
    visible.sort((a, b) => a.distance - b.distance);
    wanted = new Set(visible.slice(0, maxLocal).map((entry) => entry.item));
    for (const item of sentinel.values())
      if (item.texture && !wanted.has(item)) {
        item.texture.dispose();
        item.texture = null;
        item.material.map = preview || seed;
      }
    loadPreview();
    loadRegion();
    pumpLocal();
    arc?.update(camera, cameraPos, frustum, viewportHeight);
  }
  function setMood(mode) {
    const next = Object.hasOwn(ILLUMINATION, mode) ? mode : 'day';
    if (next === mood || stopped) return;
    mood = next;
    tint.setRGB(...ILLUMINATION[mood]);
    onChange();
  }
  function setActive(value) {
    active = Boolean(value);
    root.visible = active;
    arc?.setActive(active);
    if (!active) {
      controller.abort();
      controller = new AbortController();
    } else if (lastCamera) update(lastCamera, lastHeight);
  }
  function stats() {
    const a = arc?.stats(),
      detailed = [...sentinel.values()].filter((i) => i.texture).length;
    return {
      provider: 'sentinel',
      mood,
      attribution: OPEN_CREDIT,
      attributionUrl: 'https://dataspace.copernicus.eu/terms-and-conditions',
      visibleTiles: 0,
      maxZoom: null,
      reason: settings.arcgisImageryEnabled ? 'ArcGIS key required' : 'Local imagery',
      ...a,
      localImageryReady: Boolean(preview || detailed),
      localNativeTiles: detailed,
      loading: localRequested + Number(previewPending) + Number(regionPending) + (a?.loading || 0),
      textures: detailed + Number(Boolean(preview)) + Number(Boolean(regionPreview)) + (a?.textures || 0),
      estimatedTextureBytes:
        Math.ceil(
          ((detailed * 258 ** 2 +
            (preview ? 320 ** 2 : 0) +
            (regionPreview ? regionPreview.image.width ** 2 : 0)) *
            4 *
            4) /
            3,
        ) + (a?.estimatedTextureBytes || 0),
    };
  }
  function dispose() {
    stopped = true;
    controller.abort();
    arc?.dispose();
    root.removeFromParent();
    for (const mesh of root.children) mesh.geometry.dispose();
    for (const item of sentinel.values()) {
      item.texture?.dispose();
      item.material.dispose();
    }
    root.clear();
    horizon.dispose();
    if (groundSurface.value !== seed) groundSurface.value.dispose();
    seed.dispose();
    preview?.dispose();
    regionPreview?.dispose();
  }
  const baseReady = Promise.all([loadPreview(), loadRegion()]).then(() => Boolean(preview && regionPreview));
  return { root, tint, baseReady, update, setActive, setMood, stats, dispose,
    setPresentation: (mode) => { showcase.value = mode === 'showcase' ? 1 : 0; },
  };
}
