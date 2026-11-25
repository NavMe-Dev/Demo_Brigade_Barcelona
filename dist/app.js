import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeNavigator, insidePolygon } from './navigation.js';
import { installInteractivePlan } from './interior-plan.js';
import { layoutPackage } from './interior-layout.js';
import { configureEnquiry } from './interior-enquiry.js';

const $ = (id) => document.getElementById(id),
  mobile = () => window.innerWidth <= 800;
let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let mode = 'dollhouse',
  lightMode = 'day',
  entered = false,
  ready = false,
  failed = false,
  fallbackMode = false,
  activeRoom = 'living';
let renderer, scene, camera, controls, model, geometry, navigator3d, hemi, sun, ambient, ground;
let updatePlan, sweep, eveningLights, environmentTarget, balconyContext;
let roomViews = new Map();
let outlookWorld,outlookFloor,exteriorMap;
let skyTexture,
  sceneDirty = true,
  slowFrames = 0;
const previousCamera = new THREE.Matrix4();
let interiorEpoch = 0,
  renderFrame = 0,
  ktx;
let design = 'A3',
  selectedPackage,
  planDesign,
  desiredDesign,
  loadChain = Promise.resolve(),
  inputAbort;
let furnished = true,
  drawDistance = 28,
  film,
  firstRoom = 'living';
let roomTargets = {},
  roomOrder = [],
  shortNames = {},
  tourRooms = [];
let moveTween = null,
  walkPath = null,
  walkIndex = 0,
  yaw = 0,
  pitch = 0,
  tourActive = false,
  tourPaused = false,
  tourIndex = 0,
  tourDwell = 0;
let pointerDown = null,
  dragged = false,
  keys = new Set(),
  padMove = null,
  lastTime = 0,
  toastTimeout;
const homeTarget = new THREE.Vector3(7.7, 0.4, 6.2),
  hotspotRecords = [];
function savedCodes() {
  try {
    const codes = JSON.parse(localStorage.getItem('brigade-designs') || '[]');
    return Array.isArray(codes) ? codes : [];
  } catch {
    return [];
  }
}
function isSaved() {
  try {
    return (
      savedCodes().includes(design) ||
      (design === 'A3' && localStorage.getItem('brigade-a3-saved') === 'true')
    );
  } catch {
    return false;
  }
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $('toast').classList.remove('show'), 4500);
}
function showDialog(id) {
  stopTour();
  keys.clear();
  padMove = null;
  const d = $(id);
  if (!d.open) d.showModal();
}
document
  .querySelectorAll('.close-dialog')
  .forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach((d) =>
  d.addEventListener('click', (e) => {
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      d.close();
  }),
);
function updateSaved() {
  const saved = isSaved();
  ['saveHeader', 'saveButton'].forEach((id) => {
    $(id).classList.toggle('saved', saved);
    $(id).setAttribute('aria-pressed', String(saved));
  });
  $('saveHeader').setAttribute('aria-label', saved ? 'Remove saved home' : 'Save this home');
  $('saveHeader').title = saved ? 'Remove saved home' : 'Save this home';
  $('saveHeader').querySelector('span').textContent = saved ? 'Home saved' : 'Save home';
  $('saveButton').textContent = saved ? '♥ Home saved' : '♡ Save home';
}
function toggleSaved() {
  const saved = !isSaved();
  try {
    const codes = savedCodes().filter((code) => code !== design);
    if (saved) codes.push(design);
    localStorage.setItem('brigade-designs', JSON.stringify(codes));
    if (design === 'A3') localStorage.setItem('brigade-a3-saved', String(saved));
  } catch {}
  updateSaved();
  toast(saved ? 'Home saved in this browser.' : 'Home removed from your saved homes.');
}
$('saveHeader').onclick = toggleSaved;
$('saveButton').onclick = toggleSaved;
updateSaved();
export async function openInteriorPlan(code = design) {
  const requested = typeof code === 'string' ? code : design;
  try {
    const pkg = await layoutPackage(requested);
    showPlan(pkg);
    showDialog('planDialog');
    syncPlan();
  } catch {
    toast('The floor plan could not be loaded.');
  }
}
for (const id of ['heroPlan', 'planButton', 'loaderPlan', 'fallbackPlan'])
  $(id).onclick = () => openInteriorPlan();
$('planExplore').onclick = async () => {
  $('planDialog').close();
  if (!entered || design !== planDesign) await enterInterior({ design: planDesign });
};
$('aboutNav').onclick = () => showDialog('aboutDialog');
$('conceptBadge').onclick = () => showDialog('aboutDialog');
$('lifestyleNav').onclick = () => showDialog('lifestyleDialog');
$('enquiryButton').onclick = () => {
  $('enquiryForm').dataset.layout = design;
  document.querySelector('[data-enquiry-layout]').textContent =
    'Design ' + design + ' · Wing ' + design[0];
  showDialog('enquiryDialog');
};
configureEnquiry(toast);
function finishExit() {
  if (!entered) return;
  finishFilm();
  ++interiorEpoch;
  stopTour();
  hideOutlook();
  entered = false;
  sweep = null;
  keys.clear();
  padMove = null;
  cancelAnimationFrame(renderFrame);
  renderFrame = 0;
  $('arrival').classList.remove('hidden');
  for (const id of ['experience', 'hotspots', 'renderFallback', 'fallback', 'loader'])
    $(id).classList.add('hidden');
  document.body.classList.remove('exploring', 'walking', 'rendered-fallback');
  const url = new URL(location.href);
  url.searchParams.delete('view');
  url.searchParams.delete('room');
  history.replaceState(null, '', url);
  window.dispatchEvent(new CustomEvent('brigade:interior-exit', { detail: { design } }));
}
export function leaveInterior({ cinematic = false } = {}) {
  if (!entered) return Promise.resolve();
  if (!cinematic || fallbackMode || reducedMotion || !ready) {
    finishExit();
    return Promise.resolve();
  }
  return playFilm('exit');
}
$('homeButton').onclick = () => leaveInterior({ cinematic: true });
$('buildingReturn').onclick = () => leaveInterior({ cinematic: true });
$('skipInterior').onclick = () => skipInteriorAnimation();
$('furnishedMode').onchange = (e) => {
  const requested = e.target.checked;
  if (
    requested &&
    mode === 'walk' &&
    !makeNavigator(geometry, selectedPackage.colliders).canStand(camera.position.x, camera.position.z)
  ) {
    e.target.checked = false;
    toast('Move to a room viewpoint before restoring furnishings.');
    return;
  }
  furnished = requested;
  navigator3d = makeNavigator(geometry, furnished ? selectedPackage.colliders : []);
  const group = model?.getObjectByName('furniture');
  if (group) group.visible = furnished;
  sceneDirty = true;
  if (renderer) renderer.shadowMap.needsUpdate = true;
};
$('dollhouseAngle').onchange = () => {
  stopTour();
  switchMode('dollhouse');
};

$('residenceNav').onclick = () => enterInterior();
$('enterButton').onclick = () => enterInterior();
function toggleCard(force) {
  const collapsed = force === undefined ? !$('propertyCard').classList.contains('collapsed') : !force;
  $('propertyCard').classList.toggle('collapsed', collapsed);
  $('cardToggle').setAttribute('aria-expanded', String(!collapsed));
  $('cardToggle').querySelector('.toggle-symbol').textContent = collapsed ? '+' : '−';
}
$('cardToggle').onclick = () => toggleCard();
if (mobile()) toggleCard(false);
$('fullscreenButton').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen)
      await document.documentElement.requestFullscreen();
    else toast('Use your browser’s fullscreen or home screen option.');
  } catch {
    toast('Fullscreen is unavailable in this browser.');
  }
};
$('motionButton').onclick = () => {
  reducedMotion = !reducedMotion;
  document.body.classList.toggle('reduced-motion', reducedMotion);
  $('motionButton').setAttribute('aria-pressed', String(reducedMotion));
  stopTour();
  moveTween = null;
  walkPath = null;
  toast(
    reducedMotion
      ? 'Reduced motion on. Room changes use immediate viewpoints.'
      : 'Smooth camera transitions on.',
  );
};
document.body.classList.toggle('reduced-motion', reducedMotion);
$('motionButton').setAttribute('aria-pressed', String(reducedMotion));
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
  reducedMotion = e.matches;
  document.body.classList.toggle('reduced-motion', reducedMotion);
  stopTour();
});
$('resetButton').onclick = () => {
  stopTour();
  if (fallbackMode) {
    switchMode('dollhouse');
    return;
  }
  if (mode === 'walk') goToRoom(activeRoom, true);
  else resetDollhouse();
};
$('dollhouseButton').onclick = () => {
  stopTour();
  switchMode('dollhouse');
};
$('walkButton').onclick = () => {
  stopTour();
  switchMode('walk');
};
document
  .querySelectorAll('[data-light]')
  .forEach((b) => (b.onclick = () => setLighting(b.dataset.light)));
const amenities = [
  {
    title: 'The seven-level clubhouse',
    text: 'A setting for wellness, leisure and shared experiences across seven levels.',
    page: 12,
    image: 'clubhouse.webp',
  },
  {
    title: 'Above the everyday',
    text: 'Explore the brochure’s rooftop Sky Deck and landscaped spaces.',
    page: 10,
    image: 'sky-deck.webp',
  },
  {
    title: 'A landscaped arrival',
    text: 'A first glimpse of the proposed pathways and outdoor spaces.',
    page: 8,
    image: 'landscape.webp',
  },
];
for (const a of amenities) {
  const el = document.createElement('article');
  el.className = 'amenity-card';
  const img = new Image();
  img.src = `assets/${a.image}`;
  img.alt = `${a.title} — brochure artist’s impression`;
  const h = document.createElement('h3');
  h.textContent = a.title;
  const p = document.createElement('p');
  p.textContent = a.text;
  const s = document.createElement('small');
  s.textContent = `Brochure · PDF page ${a.page}`;
  el.append(img, h, p, s);
  $('amenityGallery').append(el);
}

function showPlan(pkg) {
  const item = pkg.source;
  const dialog = $('planDialog');
  dialog.querySelector('.eyebrow').textContent = 'PROJECT BROCHURE · PAGE ' + item.source_pdf_page;
  dialog.querySelector('h2').textContent = 'Unit ' + item.brochure_unit_label + ' · Wing ' + item.wing;
  dialog.querySelector('.plan-footer span').textContent =
    item.total_sba_sqft.toLocaleString('en-IN') +
    ' sq ft total SBA · ' +
    item.total_carpet_area_sqft.toLocaleString('en-IN') +
    ' sq ft total carpet area';
  if (planDesign === item.code) return;
  planDesign = item.code;
  updatePlan = installInteractivePlan(pkg.geometry, pkg.plan, async (room) => {
    dialog.close();
    if (!entered || design !== item.code) await enterInterior({ design: item.code, room });
    else {
      stopTour();
      goToRoom(room);
    }
  });
}
function applyMetadata(pkg) {
  selectedPackage = pkg;
  geometry = pkg.geometry;
  design = pkg.source.code;
  roomViews = new Map(pkg.views.map((view) => [view.room_id, view]));
  roomOrder = geometry.rooms.filter((room) => roomViews.has(room.id)).map((room) => room.id);
  shortNames = Object.fromEntries(geometry.rooms.map((room) => [room.id, room.label]));
  roomTargets = Object.fromEntries(
    pkg.views.map((view) => [view.room_id, view.node_id || view.room_id]),
  );
  firstRoom =
    roomOrder.find((room) => room === 'living' || /living/i.test(shortNames[room])) || roomOrder[0];
  activeRoom = firstRoom;
  tourRooms = roomOrder.filter((id) => !/(bath|wash|utility|closet)/i.test(id));
  if (!tourRooms.length) tourRooms = roomOrder;
  furnished = true;
  $('furnishedMode').checked = true;
  $('dollhouseAngle').value = 'isometric';
  navigator3d = makeNavigator(geometry, pkg.colliders);
  const xs = geometry.outline.map((p) => p[0]),
    zs = geometry.outline.map((p) => p[1]);
  homeTarget.set((Math.max(...xs) + Math.min(...xs)) / 2, 0.4, (Math.max(...zs) + Math.min(...zs)) / 2);
  drawDistance = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) * 1.82;
  const item = pkg.source,
    card = $('propertyCard');
  const wingLabel = document.createElement('span');
  wingLabel.textContent = 'Wing ' + item.wing;
  card
    .querySelector('#cardToggle strong')
    .replaceChildren(document.createTextNode('Design ' + item.code), wingLabel);
  const areas = card.querySelectorAll('.area-grid strong');
  [item.total_sba_sqft, item.total_carpet_area_sqft].forEach((n, i) => {
    areas[i].replaceChildren(document.createTextNode(n.toLocaleString('en-IN') + ' '));
    const u = document.createElement('small');
    u.textContent = 'sq ft';
    areas[i].append(u);
  });
  card.querySelector('.area-source').textContent = 'Project brochure · Page ' + item.source_pdf_page;
  const title = document.querySelector('#experience .scene-title');
  title.querySelector('.eyebrow').textContent = 'WING ' + item.wing + ' · DESIGN ' + item.code;
  title.querySelector('h1').textContent = 'Dollhouse';
  title.querySelector('p:last-of-type').textContent =
    item.bedrooms + ' bedrooms · ' + item.washrooms + ' washrooms' + (item.has_study ? ' · Study' : '');
  title.append($('conceptBadge'));
  updateSaved();
  showPlan(pkg);
  buildRooms();
}
function syncPlan() {
  const walking = entered && planDesign === design && mode === 'walk';
  const node = geometry?.navigation_nodes.find((n) => n.id === roomTargets[activeRoom]);
  const point = walking ? (fallbackMode ? node?.position : camera?.position.toArray()) : null;
  const framing = roomViews.get(activeRoom)?.look_at || node?.look_at;
  const heading =
    fallbackMode && node && framing
      ? (Math.atan2(framing[0] - node.position[0], node.position[2] - framing[2]) * 180) / Math.PI
      : (-yaw * 180) / Math.PI;
  updatePlan?.(point, heading, walking ? activeRoom : null);
}
function disposeScene() {
  hideOutlook();
  finishFilm();
  inputAbort?.abort();
  cancelAnimationFrame(renderFrame);
  renderFrame = 0;
  ready = false;
  failed = false;
  fallbackMode = false;
  controls?.dispose();
  skyTexture?.dispose();
  environmentTarget?.dispose();
  ktx?.dispose();
  const freed = new Set();
  scene?.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material || [])) {
      if (freed.has(m)) continue;
      for (const texture of Object.values(m))
        if (texture?.isTexture && !freed.has(texture)) {
          texture.dispose();
          texture.source?.data?.close?.();
          freed.add(texture);
        }
      m.dispose();
      freed.add(m);
    }
  });
  renderer?.dispose();
  renderer?.forceContextLoss();
  renderer?.domElement.remove();
  renderer =
    camera =
    scene =
    model =
    controls =
    skyTexture =
    environmentTarget =
    ktx =
    eveningLights =
    balconyContext =
      null;
  updatePlan = null;
  planDesign = null;
  geometry = null;
  sceneDirty = true;
}
export function preloadInterior(code = design) {
  if (typeof code !== 'string') code = design;
  if (code === desiredDesign && ((selectedPackage?.source.code === code && ready) || pendingLoad))
    return loadChain;
  desiredDesign = code;
  const request = ++loadGeneration;
  pendingLoad = true;
  loadChain = loadChain
    .catch(() => {})
    .then(async () => {
      if (request !== loadGeneration) return;
      const pkg = await layoutPackage(code);
      if (request !== loadGeneration) return;
      disposeScene();
      applyMetadata(pkg);
      inputAbort = new AbortController();
      await init();
    })
    .finally(() => {
      if (request === loadGeneration) pendingLoad = false;
    });
  return loadChain;
}
let pendingLoad = false,
  loadGeneration = 0;
export async function enterInterior({ design: code, room, cinematic = false, lighting, floor } = {}) {
  const query = new URLSearchParams(location.search);
  code = code || query.get('layout') || query.get('design') || design;
  const target = room || query.get('room'),
    epoch = ++interiorEpoch;
  try {
    await preloadInterior(code);
  } catch (error) {
    toast('Could not load design ' + code + '. Please try again.');
    throw error;
  }
  if (epoch !== interiorEpoch || desiredDesign !== code || design !== code) return;
  outlookFloor=Number(floor||query.get('floor'))||null;
  entered = true;
  $('arrival').classList.add('hidden');
  $('experience').classList.remove('hidden');
  $('loader').classList.add('hidden');
  document.body.classList.add('exploring');
  document.body.classList.toggle('rendered-fallback', fallbackMode);
  $('renderFallback').classList.toggle('hidden', !fallbackMode);
  $('fallback').classList.toggle('hidden', !failed);
  window.dispatchEvent(new CustomEvent('brigade:interior-enter', { detail: { design } }));
  if (failed) return;
  toggleCard(false);
  if (!fallbackMode) {
    if (!renderFrame) {
      lastTime = 0;
      renderFrame = requestAnimationFrame(render);
    }
    setLighting(lighting || lightMode);
  }
  if (!cinematic && roomViews.has(target)) switchMode('walk', target);
  else if (!cinematic && query.get('view') === 'walk') switchMode('walk', firstRoom);
  else {
    switchMode('dollhouse');
    if (cinematic && !fallbackMode && !reducedMotion) {
      resetDollhouse(false);
      moveTween = null;
      playFilm('enter', roomViews.has(target) ? target : firstRoom);
    } else if (cinematic) goToRoom(roomViews.has(target) ? target : firstRoom, true);
  }
}
async function init() {
  const pkg = selectedPackage;
  try {
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#ede8df');
    scene.fog = new THREE.Fog('#ede8df', 60, 150);
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, mobile() ? 1.5 : 1.8));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D apartment. Use room buttons to navigate. In walkthrough, drag to look and use arrow keys or WASD to move.',
    );
    renderer.domElement.tabIndex = 0;
    $('scene').append(renderer.domElement);
    const instance = renderer;
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      if (renderer !== instance) return;
      e.preventDefault();
      cancelAnimationFrame(renderFrame);
      renderFrame = 0;
      stopTour();
      initRenderedFallback();
    });
    camera = new THREE.PerspectiveCamera(mobile() ? 48 : 42, innerWidth / innerHeight, 0.05, 1800);
    camera.position.set(26, 26, 30);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(homeTarget);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 9;
    controls.maxDistance = Math.max(46, drawDistance * 2.8);
    controls.maxPolarAngle = Math.PI / 2.08;
    controls.minPolarAngle = 0.005;
    controls.enablePan = true;
    controls.addEventListener('start', () => {
      if (mode === 'dollhouse') {
        moveTween = null;
        stopTour();
      }
    });
    hemi = new THREE.HemisphereLight(0xfff7e8, 0x8a7160, 2.1);
    scene.add(hemi);
    ambient = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambient);
    sun = new THREE.DirectionalLight(0xffe4bc, 3.2);
    sun.position.set(-6, 18, 10);
    sun.target.position.set(7, 0, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(mobile() ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 0.5, far: 70 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.025;
    scene.add(sun, sun.target);
    const pmrem = new THREE.PMREMGenerator(renderer),
      environment = new RoomEnvironment();
    environmentTarget = pmrem.fromScene(environment, 0.04);
    scene.environment = environmentTarget.texture;
    scene.environmentIntensity = 0.45;
    environment.dispose();
    pmrem.dispose();
    // A sky-only HDR image contributes reflections without implying a particular view.
    import('three/addons/loaders/HDRLoader.js')
      .then(({ HDRLoader }) => new HDRLoader().loadAsync('assets/sky-light.hdr'))
      .then((texture) => {
        if (renderer !== instance || fallbackMode) {
          texture.dispose();
          return;
        }
        skyTexture = texture;
        skyTexture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = skyTexture;
        sceneDirty = true;
        if (model) setLighting(lightMode);
      })
      .catch(() => {
        /* The prefiltered room environment remains available offline. */
      });
    ground = new THREE.Mesh(
      new THREE.PlaneGeometry(250, 250),
      new THREE.MeshStandardMaterial({ color: 0xe9e3da, roughness: 1, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.23;
    ground.receiveShadow = true;
    scene.add(ground);
    const [{ KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
      import('three/addons/loaders/KTX2Loader.js'),
      import('three/addons/libs/meshopt_decoder.module.js'),
    ]);
    ktx = new KTX2Loader()
      .setTranscoderPath('vendor/addons/libs/basis/')
      .setWorkerLimit(mobile() ? 1 : 2)
      .detectSupport(renderer);
    const gltf = await new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .setKTX2Loader(ktx)
      .loadAsync(pkg.model, (e) => {
        if (e.lengthComputable && e.total)
          $('loadMessage').textContent =
            `Loading the 3D model · ${Math.min(99, Math.floor((e.loaded / e.total) * 100))}%`;
      });
    model = gltf.scene;
    scene.add(model);
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = !o.material?.transparent;
        o.receiveShadow = true;
        if (o.material) {
          o.material.envMapIntensity = 0.55;
          if (o.material.name.includes(' GI') && o.material.aoMap) {
            o.material.lightMap = o.material.aoMap;
            o.material.lightMapIntensity = 0.38;
            o.material.aoMapIntensity = 0.56;
          }
        }
      }
    });
    ktx.dispose();
    ktx = null;
    eveningLights = [new THREE.PointLight(0xffc384, 0, 12, 2), new THREE.PointLight(0xffdbb1, 0, 9, 2)];
    scene.add(...eveningLights);
    setupPointerControls();
    $('lightingModes').parentElement.querySelector('p').textContent =
      'Illustrative lighting and interior finishes';
    for (const b of document.querySelectorAll('[data-light],#furnishedMode,#dollhouseAngle'))
      b.disabled = false;
    $('walkButton').lastChild.textContent = 'Walkthrough';
    $('dollhouseButton').lastChild.textContent = 'Dollhouse';
    $('conceptBadge').firstChild.textContent = 'Brochure-based 3D concept ';
    setLighting('day');
    resize();
    setModelMode('dollhouse');
    resetDollhouse(false);
    ready = true;
    $('sceneStatus').textContent =
      'Wing ' + pkg.source.wing + ' · Design ' + design + ' · Concept model';
    $('loadMessage').textContent = 'Your home is ready';

    if (entered) {
      $('loader').classList.add('hidden');
      $('hotspots').classList.remove('hidden');
    }
  } catch (error) {
    console.error('Preview initialization failed:', error);
    if (geometry) {
      ktx?.dispose();
      renderer?.dispose();
      initRenderedFallback();
    } else {
      failed = true;
      ready = false;
      $('loader').classList.add('hidden');
      if (entered) $('fallback').classList.remove('hidden');
      $('sceneStatus').textContent = 'Source floor plan available';
    }
  }
}

const filmstrip = document.createElement('nav');
filmstrip.id = 'interiorFilmstrip';
filmstrip.hidden = true;
filmstrip.setAttribute('aria-label', 'Room thumbnails');
$('experience').append(filmstrip);
const balconyButton = document.createElement('button');
balconyButton.id = 'balconyView';
balconyButton.textContent = 'Look out from the deck';
balconyButton.hidden = true;
const viewSource = document.createElement('p');
viewSource.className = 'view-source';
viewSource.hidden = true;
const outlookCaption=document.createElement('span');
const outlookCredits=document.createElement('span');outlookCredits.id='balconyCredits';
viewSource.append(outlookCaption,' ',outlookCredits);
$('roomCaption').append(balconyButton, viewSource);
function isBalcony(id) {
  return /deck|balcony/i.test(shortNames[id] || id);
}
function hideOutlook(){
  if(!balconyContext?.visible)return;
  outlookWorld?.setActive(false);
  if(outlookWorld?.root.parent===balconyContext)outlookWorld.root.removeFromParent();
  balconyContext.visible=false;viewSource.hidden=true;sceneDirty=true;
  if(camera){camera.far=1800;camera.updateProjectionMatrix();}
  if(scene?.fog){scene.fog.near=60;scene.fog.far=150;setLighting(lightMode);}
}
async function showOutlook() {
  if (!entered || fallbackMode || mode !== 'walk' || !isBalcony(activeRoom)) return;
  const currentScene=scene,epoch=interiorEpoch;
  stopTour();balconyButton.disabled=true;balconyButton.textContent='Preparing outlook…';
  try{
    const {getGeography,geoCredits}=await import('./geo-world.js');
    exteriorMap??=fetch('assets/scene-map.json').then(r=>{if(!r.ok)throw Error();return r.json();}).catch(e=>{exteriorMap=null;throw e;});
    const [world,map]=await Promise.all([getGeography(),exteriorMap]);
    if(epoch!==interiorEpoch || !entered || currentScene!==scene || mode!=='walk' || !isBalcony(activeRoom))return;
    const [x0,z0,x1,z1]=map.designFootprints[design];
    const directions={A1:[-1,0],A2:[-1,0],A3:[0,-1],A4:[0,-1],A5:[0,-1],A6:[1,0],A7:[1,0],
      B8:[1,0],B9:[1,0],B10:[0,1],B11:[0,1],B12:[-1,0],B14:[-1,0]};
    const [dx,dz]=directions[design];
    const level=outlookFloor?map.floorBase+(outlookFloor-1)*map.floorHeight:70;
    const sitePoint=new THREE.Vector3((x0+x1+dx*(x1-x0))/2,level,(z0+z1+dz*(z1-z0))/2);
    const railLength=r=>Math.hypot(r.a[0]-r.b[0],r.a[1]-r.b[1]);
    const rail=geometry.railings.reduce((longest,r)=>railLength(r)>railLength(longest)?r:longest);
    const deckEdge=new THREE.Vector3((rail.a[0]+rail.b[0])/2,0,(rail.a[1]+rail.b[1])/2);
    // The individual plan diagrams and the tower's floor-plate trace are a quarter-turn apart.
    balconyContext??=new THREE.Group();
    balconyContext.rotation.y=-Math.PI/2;
    balconyContext.position.copy(deckEdge).sub(sitePoint.applyQuaternion(balconyContext.quaternion));
    outlookWorld=world;world.shadows.visible=false;world.setMood(lightMode);balconyContext.add(world.root);scene.add(balconyContext);
    balconyContext.visible=true;world.setActive(true);
    camera.far=18000;camera.updateProjectionMatrix();
    scene.fog.near=550;scene.fog.far=6900;scene.background=scene.fog.color.clone();
    const n=navigator3d.nodes.get(roomTargets[activeRoom]);
    camera.position.fromArray(n.position);
    const forward=new THREE.Vector3(dx,0,dz).applyQuaternion(balconyContext.quaternion);
    smoothLook(camera.position.clone().addScaledVector(forward,20).add(new THREE.Vector3(0,-4,0)).toArray(),1.2);
    outlookCaption.textContent='Simulated view · '+(outlookFloor?'floor '+outlookFloor:'illustrative 70 m level')+' · approximate elevation, orientation and neighboring heights.';
    const refresh=()=>{
      if(!balconyContext?.visible||world.root.parent!==balconyContext)return;
      geoCredits(outlookCredits,world.stats().imagery);sceneDirty=true;
    };
    if(!balconyContext.userData.credits){
      window.addEventListener('brigade:geo-change',refresh,{signal:inputAbort.signal});
      balconyContext.userData.credits=true;
    }
    refresh();viewSource.hidden=false;sceneDirty=true;
  }catch{toast('The surrounding map could not load. Select the deck outlook to retry.');}
  finally{balconyButton.disabled=false;balconyButton.textContent='Look out from the deck';}
}
balconyButton.onclick = showOutlook;
function buildRooms() {
  $('roomList').replaceChildren();
  $('hotspots').replaceChildren();
  filmstrip.replaceChildren();
  hotspotRecords.length = 0;
  for (const id of roomOrder) {
    const room = geometry.rooms.find((r) => r.id === id);
    if (!room) continue;
    const visit = () => {
      stopTour();
      goToRoom(id);
      if (mobile()) toggleCard(false);
    };
    const btn = document.createElement('button');
    btn.dataset.room = id;
    btn.textContent = shortNames[id];
    btn.onclick = visit;
    $('roomList').append(btn);
    const thumb = document.createElement('button');
    thumb.dataset.room = id;
    thumb.setAttribute('aria-label', 'Take me to ' + room.label);
    const image = new Image();
    image.loading = 'lazy';
    image.src = selectedPackage.base + roomViews.get(id).file;
    image.alt = '';
    const label = document.createElement('span');
    label.textContent = shortNames[id];
    thumb.append(image, label);
    thumb.onclick = visit;
    filmstrip.append(thumb);
    const hotspot = document.createElement('button');
    hotspot.className = 'hotspot';
    hotspot.setAttribute('aria-label', 'Step inside ' + room.label);
    const dot = document.createElement('span');
    dot.className = 'dot';
    const markerName = document.createElement('span');
    markerName.className = 'hotspot-label';
    markerName.textContent = shortNames[id];
    if (/bath|wash|closet|utility|passage|puja/i.test(id)) hotspot.classList.add('compact');
    hotspot.append(dot, markerName);
    hotspot.onclick = visit;
    $('hotspots').append(hotspot);
    hotspotRecords.push({
      el: hotspot,
      room,
      position: new THREE.Vector3(room.center[0], 0.9, room.center[1]),
    });
  }
}
function setModelMode(m) {
  if (!model) return;
  sceneDirty = true;
  renderer.shadowMap.needsUpdate = true;
  if (skyTexture)
    scene.background =
      m === 'walk' && lightMode === 'day'
        ? skyTexture
        : new THREE.Color(lightMode === 'day' ? '#ede8df' : '#544853');
  if (scene && sun && model) setLighting(lightMode);
  if (eveningLights) eveningLights.forEach((light) => (light.visible = m === 'walk'));
  ['ceiling', 'walls_upper', 'lighting_fixtures'].forEach((name) => {
    const g = model.getObjectByName(name);
    if (g) g.visible = m === 'walk';
  });
  if (ground) ground.visible = m !== 'walk';
}
function updateModeUI() {
  filmstrip.hidden = mode !== 'walk';
  balconyButton.hidden = fallbackMode || mode !== 'walk' || !isBalcony(activeRoom);
  if (balconyButton.hidden) {
    viewSource.hidden = true;
    hideOutlook();
    if (scene?.fog) {
      scene.fog.near = 60;
      scene.fog.far = 150;
    }
  }
  document.body.classList.toggle('walking', mode === 'walk');
  $('dollhouseButton').classList.toggle('active', mode === 'dollhouse');
  $('dollhouseButton').setAttribute('aria-pressed', String(mode === 'dollhouse'));
  $('walkButton').classList.toggle('active', mode === 'walk');
  $('walkButton').setAttribute('aria-pressed', String(mode === 'walk'));
  $('roomCaption').classList.toggle('hidden', mode !== 'walk');
  $('walkPad').classList.toggle('hidden', mode !== 'walk' || fallbackMode);
  $('controlsHint').textContent =
    mode === 'walk'
      ? 'Tap the floor to walk · Drag to look · Use arrow keys or WASD'
      : 'Drag to orbit · Scroll to zoom · Select a room to step inside';
  $('hotspots').classList.toggle('hidden', mode === 'walk' || !entered);
  document
    .querySelectorAll('[data-room]')
    .forEach((b) => b.classList.toggle('active', mode === 'walk' && b.dataset.room === activeRoom));
}
function switchMode(next, room) {
  finishFilm();
  if (!ready) return;
  sweep = null;
  walkPath = null;
  moveTween = null;
  keys.clear();
  if (fallbackMode) {
    mode = next;
    activeRoom = room || activeRoom;
    if (mode === 'walk') updateRoomCaption();
    else interiorURL('dollhouse');
    updateModeUI();
    updateFallbackImage();
    return;
  }
  if (next === 'dollhouse') {
    mode = 'dollhouse';
    controls.enabled = true;
    setModelMode(mode);
    resetDollhouse();
    interiorURL('dollhouse');
  } else {
    const first = mode !== 'walk';
    mode = 'walk';
    controls.enabled = false;
    setModelMode(mode);
    if (first) jumpToNode(roomTargets[room || activeRoom] || 'living');
    else if (room) goToRoom(room);
    activeRoom = room || activeRoom;
    updateRoomCaption();
  }
  updateModeUI();
  resize();
}
function resetDollhouse(animate = true) {
  if (!camera) return;
  const distance = drawDistance * (mobile() ? 1.16 : 1);
  const target = homeTarget.clone();
  const direction =
    $('dollhouseAngle').value === 'top'
      ? new THREE.Vector3(0, 1, 0.006)
      : new THREE.Vector3(-0.34, 0.95, 1);
  const end = target.clone().add(direction.normalize().multiplyScalar(distance));
  if (animate && !reducedMotion) {
    moveTween = {
      start: camera.position.clone(),
      end,
      startTarget: controls.target.clone(),
      target,
      startTime: performance.now(),
      duration: 1100,
    };
  } else {
    camera.position.copy(end);
    controls.target.copy(target);
    controls.update();
  }
  setModelMode('dollhouse');
}
function interiorURL(view, room) {
  const url = new URL(location.href);
  url.searchParams.set('view', view);
  url.searchParams.set('layout', design);
  url.searchParams.set('design', design);
  if (room) url.searchParams.set('room', room);
  else url.searchParams.delete('room');
  if (url.href !== location.href) history.replaceState(null, '', url);
}
function updateRoomCaption() {
  const room = geometry.rooms.find((r) => r.id === activeRoom);
  if (!room) return;
  $('roomName').textContent = room.label;
  $('roomDimensions').textContent = room.published_dimensions_m
    ? `${room.published_dimensions_m.map((x) => x.toFixed(2)).join(' × ')} m · Brochure dimensions`
    : '';
  document
    .querySelectorAll('[data-room]')
    .forEach((b) => b.classList.toggle('active', b.dataset.room === activeRoom));
  interiorURL('walk', activeRoom);
}
function lookAt(position) {
  camera.lookAt(new THREE.Vector3(...position));
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  yaw = e.y;
  pitch = e.x;
}
function jumpToNode(id) {
  const n = navigator3d.nodes.get(id);
  if (!n) return;
  camera.position.set(...n.position);
  lookAt(roomViews.get(n.room_id)?.look_at || n.look_at);
  walkPath = null;
}
function goToRoom(roomId, instant = false) {
  if (!ready) return;
  sweep = null;
  if (fallbackMode) {
    mode = 'walk';
    activeRoom = roomId;
    updateRoomCaption();
    updateModeUI();
    updateFallbackImage();
    return;
  }
  const targetId = roomTargets[roomId];
  const node = navigator3d.nodes.get(targetId);
  if (!node) return;
  const first = mode !== 'walk';
  if (first) {
    mode = 'walk';
    controls.enabled = false;
    setModelMode(mode);
    jumpToNode(targetId);
  } else if (instant || reducedMotion) {
    jumpToNode(targetId);
  } else {
    const position = camera.position.toArray();
    const route = navigator3d.route(position, targetId);
    if (!route) {
      toast('Choose a nearby room viewpoint to continue.');
      return;
    }
    walkPath = {
      points: route.map((p) => new THREE.Vector3(...p)),
      targetId,
      finalRoom: roomId,
      finalLook: roomViews.get(roomId)?.look_at || node.look_at,
    };
    walkIndex = 1;
  }
  if (!walkPath) {
    activeRoom = roomId;
    updateRoomCaption();
  }
  updateModeUI();
  resize();
}
const lighting = {
  morning: {
    sky: '#eddcc8',
    hemi: '#f4e3c8',
    base: 0.9,
    direct: 2.7,
    sun: '#ffc48f',
    at: [12, 8, 7],
    environment: 0.55,
    exposure: 1.08,
    lamps: [3, 2],
  },
  day: {
    sky: '#ede8df',
    hemi: '#fff7e8',
    base: 1,
    direct: 3.25,
    sun: '#ffe4bc',
    at: [-10, 14, 19],
    environment: 0.66,
    exposure: 1.03,
    lamps: [1.8, 1.2],
  },
  sunset: {
    sky: '#c99887',
    hemi: '#f5bc99',
    base: 0.64,
    direct: 2.1,
    sun: '#ff9c64',
    at: [-16, 5, -9],
    environment: 0.56,
    exposure: 1.07,
    lamps: [8, 6],
  },
  evening: {
    sky: '#544853',
    hemi: '#a2acd4',
    base: 0.36,
    direct: 0.95,
    sun: '#ffb269',
    at: [-12, 7, -4],
    environment: 0.47,
    exposure: 1.02,
    lamps: [16, 10],
  },
};
function setLighting(value) {
  if (value === 'daylight') value = 'day';
  if (!lighting[value]) value = 'day';
  if (fallbackMode) {
    toast('Lighting controls are available in the live 3D view on supported devices.');
    return;
  }
  lightMode = value;
  document
    .querySelectorAll('[data-light]')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.light === value)));
  if (!scene) return;
  const profile = lighting[value];
  if(balconyContext?.visible)outlookWorld.setMood(value);
  sceneDirty = true;
  renderer.shadowMap.needsUpdate = true;
  scene.background =
    skyTexture && !balconyContext?.visible && mode === 'walk' && value === 'day' ? skyTexture : new THREE.Color(profile.sky);
  scene.backgroundIntensity = 0.85;
  scene.backgroundBlurriness = 0.18;
  scene.fog.color.set(profile.sky);
  hemi.intensity = profile.base;
  hemi.color.set(profile.hemi);
  ambient.intensity = value === 'evening' ? 0.1 : 0.13;
  sun.intensity = profile.direct;
  sun.color.set(profile.sun);
  sun.position.copy(homeTarget).add(new THREE.Vector3(...profile.at));
  sun.target.position.copy(homeTarget);
  renderer.toneMappingExposure = profile.exposure;
  scene.environmentIntensity = profile.environment;
  eveningLights?.forEach((light, i) => (light.intensity = profile.lamps[i]));
  ground?.material.color.set(profile.sky);
  model?.traverse((o) => {
    if (o.isLight) o.intensity = value === 'evening' ? o.userData.originalIntensity || 12 : 0;
  });
}
function stopTour() {
  finishFilm();
  walkPath = null;
  sweep = null;
  tourActive = false;
  tourPaused = false;
  tourDwell = 0;
  $('tourBar').classList.add('hidden');
  $('tourButton').innerHTML = fallbackMode
    ? 'Choose a room to explore'
    : '<svg viewBox="0 0 24 24"><path d="m9 5 11 7-11 7Z"/></svg>Take a guided tour';
  $('pauseTour').textContent = 'Pause';
}
$('tourButton').onclick = () => {
  if (!ready) return;
  if (fallbackMode) {
    toggleCard(true);
    $('roomList').querySelector('button')?.focus();
    return;
  }
  if (tourActive) {
    stopTour();
    walkPath = null;
    return;
  }
  tourActive = true;
  tourPaused = false;
  tourIndex = 0;
  tourDwell = 0;
  $('tourBar').classList.remove('hidden');
  $('tourButton').textContent = 'End guided tour';
  $('pauseTour').textContent = 'Pause';
  if (mobile()) toggleCard(false);
  goToRoom(tourRooms[0], true);
  $('tourStep').textContent = `1 / ${tourRooms.length} · ${shortNames[tourRooms[0]]}`;
};
$('pauseTour').onclick = () => {
  tourPaused = !tourPaused;
  $('pauseTour').textContent = tourPaused ? 'Resume' : 'Pause';
};
$('exitTour').onclick = () => {
  stopTour();
  walkPath = null;
};
function stepTour(dt) {
  if (!tourActive || tourPaused || walkPath || sweep) return;
  tourDwell += dt;
  if (tourDwell < 3.2) return;
  tourDwell = 0;
  tourIndex++;
  if (tourIndex >= tourRooms.length) {
    stopTour();
    toast('Tour complete. Take your time and explore your favourite rooms.');
    return;
  }
  goToRoom(tourRooms[tourIndex]);
  $('tourStep').textContent =
    `${tourIndex + 1} / ${tourRooms.length} · ${shortNames[tourRooms[tourIndex]]}`;
}
function finishFilm() {
  if (!film) return;
  const complete = film.resolve;
  film = null;
  $('skipInterior').hidden = true;
  if (controls) controls.enabled = mode === 'dollhouse';
  complete();
}
export function skipInteriorAnimation() {
  if (!film) return;
  const leaving = film.kind === 'exit',
    room = film.room;
  finishFilm();
  if (leaving) {
    finishExit();
    return;
  }
  goToRoom(room, true);
}
function pathPoint(points, progress) {
  const lengths = points.slice(1).map((p, i) => p.distanceTo(points[i]));
  let wanted = progress * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (wanted <= lengths[i])
      return points[i].clone().lerp(points[i + 1], lengths[i] ? wanted / lengths[i] : 1);
    wanted -= lengths[i];
  }
  return points.at(-1).clone();
}
function playFilm(kind, room = firstRoom) {
  if (film?.kind === kind) return film.done;
  stopTour();
  finishFilm();
  walkPath = null;
  moveTween = null;
  sweep = null;
  const entry =
    navigator3d.nodes.get(geometry.entrance_node || 'entry') ||
    navigator3d.nodes.get(roomTargets[firstRoom]);
  const destination =
    design === 'A3' && room === firstRoom
      ? navigator3d.nodes.get('living')
      : navigator3d.nodes.get(roomTargets[room]);
  const leaving = kind === 'exit',
    entrance = new THREE.Vector3(...entry.position);
  const from = leaving && mode === 'walk' ? camera.position.toArray() : entry.position;
  const id = leaving ? entry.id : destination.id;
  const route = navigator3d.route(from, id);
  if (!route) {
    if (leaving) finishExit();
    else goToRoom(room, true);
    return Promise.resolve();
  }
  const points = route.map((p) => new THREE.Vector3(...p));
  const heading = new THREE.Vector3(...(roomViews.get(room)?.look_at || destination.look_at));
  if (heading.distanceToSquared(points.at(-1)) < 0.01) heading.z -= 2;
  const overview = homeTarget
    .clone()
    .add(
      new THREE.Vector3(-0.34, 0.95, 1).normalize().multiplyScalar(drawDistance * (mobile() ? 1.16 : 1)),
    );
  const aerial = new THREE.Vector3(entrance.x, Math.max(6, drawDistance * 0.28), entrance.z + 0.02);
  let resolve;
  const done = new Promise((r) => (resolve = r));
  film = {
    kind,
    room,
    entry: entrance,
    points,
    heading,
    overview,
    aerial,
    start: camera.position.clone(),
    elapsed: 0,
    resolve,
    done,
    fromDollhouse: leaving && mode === 'dollhouse',
    walkTime: Math.min(
      1.9,
      Math.max(0.7, points.slice(1).reduce((sum, v, i) => sum + v.distanceTo(points[i]), 0) / 2.5),
    ),
  };
  controls.enabled = false;
  $('skipInterior').hidden = false;
  sceneDirty = true;
  return done;
}
function animateFilm(dt) {
  const f = film;
  f.elapsed += dt;
  const ease = (t) => THREE.MathUtils.smoothstep(t, 0, 1),
    position = camera.position;
  if (f.kind === 'exit') {
    if (f.fromDollhouse) {
      position.lerpVectors(f.start, f.overview, ease(f.elapsed / 0.9));
      camera.lookAt(homeTarget);
      if (f.elapsed >= 0.9) finishExit();
      return;
    }
    if (f.elapsed <= f.walkTime) {
      const t = ease(f.elapsed / f.walkTime),
        p = pathPoint(f.points, t),
        next = pathPoint(f.points, Math.min(1, t + 0.04));
      position.copy(p);
      if (next.distanceToSquared(p) > 0.001) camera.lookAt(next);
    } else {
      if (mode !== 'dollhouse') {
        mode = 'dollhouse';
        setModelMode(mode);
        updateModeUI();
      }
      const t = f.elapsed - f.walkTime;
      if (t <= 0.85) {
        position.lerpVectors(f.entry, f.aerial, ease(t / 0.85));
        camera.lookAt(f.heading);
      } else {
        const ratio = ease((t - 0.85) / 1.1);
        position.lerpVectors(f.aerial, f.overview, ratio);
        camera.lookAt(f.heading.clone().lerp(homeTarget, ratio));
      }
      if (t >= 1.95) finishExit();
    }
    return;
  }
  // Cutaway descent stays vertically over the traversable entrance. At eye height
  // the camera follows the layout's validated doorway graph into the living area.
  if (f.elapsed < 0.7) {
    const t = ease(f.elapsed / 0.7);
    position.lerpVectors(f.start, f.aerial, t);
    camera.lookAt(homeTarget.clone().lerp(f.entry, t));
  } else if (f.elapsed < 1.4) {
    const t = ease((f.elapsed - 0.7) / 0.7);
    position.lerpVectors(f.aerial, f.entry, t);
    camera.lookAt(f.entry.clone().lerp(f.heading, t));
  } else {
    if (mode !== 'walk') {
      mode = 'walk';
      setModelMode(mode);
      activeRoom = f.room;
      updateRoomCaption();
      updateModeUI();
      resize();
    }
    const t = (f.elapsed - 1.4) / f.walkTime;
    if (t < 1) {
      position.copy(pathPoint(f.points, ease(t)));
      camera.lookAt(f.heading);
    } else {
      position.copy(f.points.at(-1));
      lookAt(f.heading.toArray());
      const progress = ease((f.elapsed - 1.4 - f.walkTime) / 3.8);
      camera.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), progress * Math.PI * 2);
      if (progress >= 1) {
        lookAt(f.heading.toArray());
        finishFilm();
      }
    }
  }
}
function smoothLook(target, duration, reveal = false) {
  if (reducedMotion) {
    lookAt(target);
    return;
  }
  const previous = camera.quaternion.clone();
  lookAt(target);
  const end = camera.quaternion.clone();
  camera.quaternion.copy(previous);
  sweep = { start: previous, end, duration, time: 0, reveal };
}
function animateSweep(dt) {
  if (!sweep || tourPaused) return;
  sweep.time += dt;
  camera.quaternion.slerpQuaternions(
    sweep.start,
    sweep.end,
    THREE.MathUtils.smoothstep(sweep.time, 0, sweep.duration),
  );
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  pitch = e.x;
  yaw = e.y;
  if (sweep.time >= sweep.duration) {
    if (sweep.reveal) {
      const start = sweep.end;
      const end = start
        .clone()
        .premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.55));
      sweep = { start, end, duration: 3.3, time: 0, reveal: false };
    } else sweep = null;
  }
}
function setupPointerControls() {
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button !== 0) {
      dragged = true;
      return;
    }
    stopTour();
    pointerDown = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, id: e.pointerId };
    dragged = false;
    if (mode === 'walk') canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointerDown || e.pointerId !== pointerDown.id) return;
    if (Math.hypot(e.clientX - pointerDown.startX, e.clientY - pointerDown.startY) > 5) dragged = true;
    if (mode !== 'walk') return;
    yaw -= (e.clientX - pointerDown.x) * 0.004;
    pitch = THREE.MathUtils.clamp(pitch - (e.clientY - pointerDown.y) * 0.003, -1.1, 1.1);
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    pointerDown.x = e.clientX;
    pointerDown.y = e.clientY;
  });
  const up = (event) => {
    if (!pointerDown || event.pointerId !== pointerDown.id) return;
    if (!dragged && event.type === 'pointerup') walkToPointer(event);
    pointerDown = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  addEventListener(
    'keydown',
    (e) => {
      if (
        !entered ||
        mode !== 'walk' ||
        document.querySelector('dialog[open]') ||
        ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
      )
        return;
      if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        stopTour();
        walkPath = null;
        keys.add(e.key);
      }
    },
    { signal: inputAbort.signal },
  );
  addEventListener('keyup', (e) => keys.delete(e.key), { signal: inputAbort.signal });
  addEventListener(
    'blur',
    () => {
      keys.clear();
      padMove = null;
    },
    { signal: inputAbort.signal },
  );
  document.querySelectorAll('[data-move]').forEach((b) => {
    b.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        stopTour();
        walkPath = null;
        padMove = b.dataset.move;
        b.setPointerCapture(e.pointerId);
      },
      { signal: inputAbort.signal },
    );
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) =>
      b.addEventListener(ev, () => (padMove = null), { signal: inputAbort.signal }),
    );
  });
}
const raycaster = new THREE.Raycaster();
function walkToPointer(event) {
  if (!model || film || !navigator3d) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const point = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    1 - ((event.clientY - rect.top) / rect.height) * 2,
  );
  raycaster.setFromCamera(point, camera);
  const hit = raycaster.intersectObject(model, true).find((h) => {
    for (let o = h.object; o; o = o.parent) if (!o.visible) return false;
    return true;
  });
  if (!hit?.face) return;
  if (mode === 'dollhouse') {
    const room = geometry.rooms.find((r) => insidePolygon([hit.point.x, hit.point.z], r.polygon));
    if (room && roomTargets[room.id]) goToRoom(room.id);
    return;
  }
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  if (normal.y < 0.75 || hit.point.y > 0.32 || !navigator3d.canStand(hit.point.x, hit.point.z)) return;
  const goal = [hit.point.x, camera.position.y, hit.point.z],
    here = camera.position.toArray();
  let path;
  if (navigator3d.lineClear(here, goal)) path = [here, goal];
  else {
    const near = navigator3d.nearest(goal);
    if (!near) return;
    path = navigator3d.route(here, near.id);
    if (!path) return;
    path.push(goal);
  }
  const look = [goal[0] - Math.sin(yaw) * 2, goal[1], goal[2] - Math.cos(yaw) * 2];
  if (reducedMotion) {
    camera.position.set(...goal);
    return;
  }
  walkPath = { points: path.map((p) => new THREE.Vector3(...p)), finalLook: look };
  walkIndex = 1;
}
function manualWalk(dt) {
  if (!navigator3d || document.querySelector('dialog[open]')) return;
  let forward = 0,
    side = 0;
  if (keys.has('w') || keys.has('ArrowUp') || padMove === 'forward') forward++;
  if (keys.has('s') || keys.has('ArrowDown') || padMove === 'back') forward--;
  if (keys.has('a') || keys.has('ArrowLeft') || padMove === 'left') side--;
  if (keys.has('d') || keys.has('ArrowRight') || padMove === 'right') side++;
  if (!forward && !side) return;
  const norm = Math.hypot(forward, side);
  forward /= norm;
  side /= norm;
  const speed = 1.65 * dt,
    dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * side) * speed,
    dz = (-Math.cos(yaw) * forward - Math.sin(yaw) * side) * speed;
  const x = camera.position.x,
    z = camera.position.z;
  if (navigator3d.canStand(x + dx, z)) camera.position.x += dx;
  if (navigator3d.canStand(camera.position.x, z + dz)) camera.position.z += dz;
}
function animateWalk(dt) {
  if (!walkPath || tourPaused) return;
  const point = walkPath.points[walkIndex];
  if (!point) {
    walkPath = null;
    return;
  }
  const delta = point.clone().sub(camera.position),
    length = delta.length(),
    speed = 2.2 * dt;
  if (length <= speed) {
    camera.position.copy(point);
    walkIndex++;
    if (walkIndex >= walkPath.points.length) {
      if (walkPath.finalRoom) {
        activeRoom = walkPath.finalRoom;
        updateRoomCaption();
        updateModeUI();
      }
      smoothLook(walkPath.finalLook, 1.4, true);
      walkPath = null;
    }
    return;
  }
  delta.normalize();
  camera.position.addScaledVector(delta, speed);
  const targetQ = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(
      camera.position,
      camera.position.clone().add(delta),
      new THREE.Vector3(0, 1, 0),
    ),
  );
  camera.quaternion.slerp(targetQ, Math.min(1, dt * 4));
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  yaw = e.y;
  pitch = e.x;
}
function updateHotspots() {
  if (mode !== 'dollhouse' || !entered) return;
  const occupied = [];
  for (const r of hotspotRecords) {
    const p = r.position.clone().project(camera),
      x = (p.x * 0.5 + 0.5) * innerWidth,
      y = (-p.y * 0.5 + 0.5) * innerHeight;
    let visible =
      p.z < 1 && p.z > -1 && x > 60 && x < innerWidth - 40 && y > 120 && y < innerHeight - 130;
    if (!mobile() && x > innerWidth - 345) visible = false;
    if (mobile() && y > innerHeight - 220) visible = false;
    const width = r.el.classList.contains('compact') ? 34 : 120;
    const box = { x: x - width / 2, y: y - 19, w: width, h: 38 };
    if (
      occupied.some(
        (b) => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y,
      )
    )
      visible = false;
    r.el.style.display = visible ? 'flex' : 'none';
    if (visible) {
      r.el.style.left = `${x}px`;
      r.el.style.top = `${y}px`;
      occupied.push(box);
    }
  }
}
function resize() {
  if (!renderer || !camera) return;
  sceneDirty = true;
  const w = innerWidth,
    h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = mode === 'walk' ? 70 : mobile() ? 48 : 42;
  camera.clearViewOffset();
  if (mode === 'dollhouse') camera.setViewOffset(w, h, mobile() ? 0 : 150, mobile() ? -15 : 0, w, h);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  lastTime = 0;
  if (document.hidden) {
    keys.clear();
    padMove = null;
    if (tourActive) {
      tourPaused = true;
      $('pauseTour').textContent = 'Resume';
    }
  }
});
function render(now) {
  renderFrame = 0;
  if (!ready || !entered || fallbackMode) return;
  renderFrame = requestAnimationFrame(render);
  if (document.hidden) return;
  const interval = lastTime ? (now - lastTime) / 1000 : 0.016;
  const dt = Math.min(0.04, interval);
  lastTime = now;
  if (!entered) return;
  if (film) {
    animateFilm(dt);
    if (!entered) return;
  } else if (mode === 'dollhouse') {
    if (moveTween) {
      const t = THREE.MathUtils.clamp((now - moveTween.startTime) / moveTween.duration, 0, 1),
        e = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(moveTween.start, moveTween.end, e);
      controls.target.lerpVectors(moveTween.startTarget, moveTween.target, e);
      if (t >= 1) moveTween = null;
    }
    controls.update();
    updateHotspots();
  } else {
    if (!document.querySelector('dialog[open]')) {
      animateWalk(dt);
      animateSweep(dt);
      manualWalk(dt);
      stepTour(dt);
    }
  }
  if (mode === 'walk' && eveningLights) {
    eveningLights[0].position.set(camera.position.x, 2.65, camera.position.z);
    eveningLights[1].position.set(
      camera.position.x - Math.sin(yaw) * 3,
      2.7,
      camera.position.z - Math.cos(yaw) * 3,
    );
    if (mode === 'walk' && !film) {
      const room = geometry.rooms.find((r) =>
        insidePolygon([camera.position.x, camera.position.z], r.polygon),
      );
      if (room && room.id !== activeRoom) {
        activeRoom = room.id;
        updateRoomCaption();
        updateModeUI();
      }
    }
  }
  if ($('planDialog').open) syncPlan();
  camera.updateMatrixWorld();
  if (sceneDirty || !camera.matrixWorld.equals(previousCamera)) {
    if (interval > 0.033) slowFrames++;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames >= 32 && renderer.getPixelRatio() > 0.8) {
      renderer.setPixelRatio(Math.max(0.8, renderer.getPixelRatio() - 0.2));
      slowFrames = 0;
    }
    if(balconyContext?.visible)outlookWorld.update(camera,innerHeight*renderer.getPixelRatio());
    renderer.render(scene, camera);
    previousCamera.copy(camera.matrixWorld);
    sceneDirty = false;
  }
}
function initRenderedFallback() {
  fallbackMode = true;
  ready = true;
  failed = false;
  if (entered) {
    document.body.classList.add('rendered-fallback');
    $('loader').classList.add('hidden');
    $('renderFallback').classList.remove('hidden');
  }
  $('hotspots').classList.add('hidden');
  $('sceneStatus').textContent = 'Rendered views · Live 3D unavailable on this device';
  $('conceptBadge').firstChild.textContent = 'Rendered views · Device fallback ';
  $('walkButton').lastChild.textContent = 'Room views';
  $('dollhouseButton').lastChild.textContent = 'Overview';
  $('tourButton').textContent = 'Choose a room to explore';
  $('furnishedMode').disabled = true;
  $('dollhouseAngle').disabled = true;
  document.querySelectorAll('[data-light]').forEach((b) => (b.disabled = true));
  $('lightingModes').parentElement.querySelector('p').textContent = 'Live lighting requires 3D support.';
  updateFallbackImage();
}
function updateFallbackImage() {
  const overview = mode === 'dollhouse',
    image = $('fallbackRender');
  image.src = overview
    ? selectedPackage.overview
    : selectedPackage.base + roomViews.get(activeRoom).file;
  image.alt = overview
    ? 'Rendered cutaway of the brochure-derived apartment concept'
    : `Rendered view of ${shortNames[activeRoom] || activeRoom} from the same apartment concept`;
  image.onerror = () => {
    image.onerror = null;
    image.src = selectedPackage.overview;
    image.alt = 'Rendered apartment overview; the requested room image is unavailable';
    mode = 'dollhouse';
    updateModeUI();
    $('renderFallback').classList.remove('interior');
    $('fallbackLabel').textContent = 'Rendered apartment overview · Requested room image unavailable';
    interiorURL('dollhouse');
    toast('This room render is unavailable. Showing the apartment overview.');
  };
  $('renderFallback').classList.toggle('interior', !overview);
  $('fallbackLabel').textContent = overview
    ? 'Rendered apartment overview · 3D unavailable on this device'
    : 'Still room view · Select another room to explore';
  $('controlsHint').textContent = 'Choose a room or open the source floor plan';
  $('hotspots').classList.add('hidden');
  $('walkPad').classList.add('hidden');
}
matchMedia('(max-width:800px)').addEventListener('change', (event) => {
  if (event.matches) toggleCard(false);
});
addEventListener('pagehide', (e) => {
  if (!e.persisted) disposeScene();
});
