import * as THREE from 'three';
import { lightingAt } from './solar.js';
import {getGeography,geoCredits} from './geo-world.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const vec = ([x, y, z]) => new THREE.Vector3(x, y, z);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = () => innerWidth <= 680;
const compactGPU = () =>
  mobile() || (navigator.maxTouchPoints > 0 && Math.min(innerWidth, innerHeight) <= 900);
const clamp = THREE.MathUtils.clamp;
const smooth = THREE.MathUtils.smootherstep;
const view = {
  overview: [[183, 152, 298], [0, 80, 0]],
  landing: [
    [475, 335, 540],
    [0, 20, 0],
  ],
  aerial: [
    [105, 213, 160],
    [0, 46, 0],
  ],
  street: [
    [55, 8, 111],
    [0, 65, 0],
  ],
  entrance: [
    [-44, 10, 99],
    [0, 14, 35],
  ],
  location: [
    [368, 358, 545],
    [0, 30, 0],
  ],
  clubhouse: [
    [98, 48, 113],
    [39, 12, 38],
  ],
  eco: [[55,38,76],[-6,15,13]],
  gardens: [
    [64, 25, 95],
    [32, 2, 18],
  ],
  sky: [
    [91, 70, 108],
    [38, 17, 36],
  ],
};
const wingTargets = { A: [0, 81, -21], B: [0, 81, 21] };
const eligibleFloors = new Set([12, 17, 18, 19, 20, 22, 23, 24, 25, 26]);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(43, 1, 0.6, 24000);
const pointer = new THREE.Vector2();
const ray = new THREE.Raycaster();
let renderer, controls, environment, sky, sun, fill, exterior, geography, selection, outline;
let skyLight, coarse, detailed, detailRequest;
let loader;
let active = true,
  ready = false,
  mood = 'day',
  flight = null,
  wing = null,
  level = null,
  section = 'overview';
let drawPending = true,
  lastDraw = 0,
  lowSamples = 0,
  frameId,
  mapData,
  callbacks,
  startPoint,
  cameraKey = 'landing';
let amenitySections=[], activeDeck='', renderedFrames=0;
export function registerAmenities(sections){amenitySections=sections;}
let markers = [],
  roofHeights = {};

function skyDome() {
  // A continuous sky and a sun lobe remain stable as the visitor orbits the site.
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false, depthTest:false,
    uniforms: {
      top: { value: new THREE.Color('#6b9caf') },
      horizon: { value: new THREE.Color('#f5dfb9') },
      sunColor: { value: new THREE.Color('#ffebc2') },
      sunDirection: {value:new THREE.Vector3(-.7,.23,-.55).normalize()},
    },
    vertexShader:
      'varying vec3 dir; void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec3 dir; uniform vec3 top,horizon,sunColor,sunDirection;
    void main(){vec3 n=normalize(dir);float h=pow(clamp(n.y,0.0,1.0),0.49);vec3 c=mix(horizon,top,h);
    float d=max(dot(n,normalize(sunDirection)),0.0);c+=sunColor*(0.23*pow(d,18.0)+0.5*pow(d,900.0));gl_FragColor=vec4(c,1.0);
    #include <colorspace_fragment>
    }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(4500, 40, 20), mat);
}

function projection() {
  if (!renderer) return;
  const w = innerWidth,
    h = innerHeight;
  camera.aspect = w / h;
  camera.fov = mobile() ? 52 : 43;
  camera.clearViewOffset();
  // Leave space beside the model for the description or the desktop selection sheet.
  const x = mobile()
    ? 0
    : section === 'overview'
      ? -0.155 * w
      : document.querySelector('#estatePanel').hidden
        ? 0
        : -0.125 * w;
  const y = mobile()
    ? section === 'overview'
      ? 0.13 * h
      : document.querySelector('#estatePanel').hidden
        ? 0
        : 0.15 * h
    : 0;
  camera.setViewOffset(w, h, x, y, w, h);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  drawPending = true;
}

function cancelFlight() {
  if (!flight) return;
  const previous = flight;
  flight = null;
  previous.done?.();
  if(previous.city){controls.maxDistance=1800;callbacks.cityEnd?.();}
  if(previous.intro)callbacks.intro(false);
}
function fly(pos, target, duration = 1250) {
  if (!ready) return Promise.resolve();
  cancelFlight();
  const end = vec(pos),
    endTarget = vec(target);
  if (reduced() || duration === 0) {
    camera.position.copy(end);
    controls.target.copy(endTarget);
    controls.update();
    drawPending = true;
    return Promise.resolve();
  }
  // Interpolate around the focus in spherical coordinates to stay outside the building.
  const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  const to = new THREE.Spherical().setFromVector3(end.sub(endTarget));
  to.theta = from.theta + Math.atan2(Math.sin(to.theta - from.theta), Math.cos(to.theta - from.theta));
  return new Promise((done) => {
    flight = {
      from,
      to,
      startTarget: controls.target.clone(),
      endTarget,
      time: performance.now(),
      duration,
      done,
    };
  });
}
function updateFlight(now) {
  if (!flight) return;
  const f = flight;
  // Start the clock on the first visible frame, including after a background-tab load.
  if(f.time === null) f.time = now;
  const t = clamp((now - f.time) / f.duration, 0, 1);
  if(f.city){
    const progress=smooth(t,0,1)*(f.keys.length-1),i=Math.min(f.keys.length-2,Math.floor(progress));
    const k=smooth(t,0,1);
    camera.position.copy(f.path.getPoint(k));controls.target.copy(f.look.getPoint(k));
    if(i!==f.stage){f.stage=i;callbacks.cityStage?.(f.keys[i]);}
  } else if (f.path) {
    const progress = smooth(t, 0, 1);
    camera.position.copy(f.path.getPointAt(progress));
    if(f.look)controls.target.copy(f.look.getPointAt(progress));
  } else {
    const k = smooth(t, 0, 1);
    controls.target.lerpVectors(f.startTarget, f.endTarget, k);
    const s = new THREE.Spherical(
      THREE.MathUtils.lerp(f.from.radius, f.to.radius, k),
      THREE.MathUtils.lerp(f.from.phi, f.to.phi, k),
      THREE.MathUtils.lerp(f.from.theta, f.to.theta, k),
    );
    camera.position.setFromSpherical(s).add(controls.target);
  }
  drawPending = true;
  if (t >= 1) {cancelFlight();f.complete?.();}
}
function overviewView() {
  return mobile() ? [[218, 165, 345], [0, 81, 0]] : view.overview;
}

export function playIntroduction() {
  if (!ready || !active || section !== 'overview' || reduced()) return;
  goView('landing', 0);
  const [start, focus] = view.landing;
  const [end, target] = overviewView();
  // The original local building sequence uses separate splines for the eye and its target.
  flight = {
    intro: true, time: null, duration: 8900,
    path: new THREE.CatmullRomCurve3([start, [265, 208, 380], [100, 137, 290], [-54, 114, 275], [36, 118, 263], end].map(vec)),
    look: new THREE.CatmullRomCurve3([focus, [0, 48, 1], [0, 67, 0], [0, 83, 0], [0, 83, 0], target].map(vec)),
  };
  cameraKey = 'overview';
  callbacks.intro(true);
}

export function stopIntroduction() {
  if (flight) cancelFlight();
}

export function goView(key, duration) {
  cameraKey = key;
  if(key==='street' && geography){const x=-46.19,z=76.54;return fly([x,geography.terrain.heightAt(x,z)+1.7,z],[-10,25,2],duration);}
  const pair = key === 'overview' ? overviewView() : view[key] || overviewView();
  return fly(...pair, duration);
}
export function focusWing(id, duration) {
  const t = wingTargets[id] || wingTargets.A;
  return fly([t[0] + (id === 'A' ? -99 : 93), t[1] + 37, t[2] + (id === 'A' ? -138 : 138)], t, duration);
}
export function focusFloor(id, floor) {
  const t = wingTargets[id];
  const y = floorY(floor);
  return fly(
    [t[0] + (id === 'A' ? -99 : 93), y + 17, t[2] + (id === 'A' ? -105 : 105)],
    [t[0], y, t[2]],
    830,
  );
}
function floorY(n) {
  return (mapData?.floorBase ?? 15) + (n - 0.5) * (mapData?.floorHeight ?? 3.05);
}
export function zoom(factor) {
  if (!ready) return;
  cancelFlight();
  const delta = camera.position.clone().sub(controls.target);
  delta.setLength(clamp(delta.length() * factor, controls.minDistance, controls.maxDistance));
  fly(delta.add(controls.target).toArray(), controls.target.toArray(), 300);
}
export function setMood(value){
 mood=value;geography?.setMood(mood);
 if(!renderer||!mapData)return;
 const mode=lightingAt(value,mapData);
 scene.fog.color.set(mode.sky);scene.backgroundIntensity=mode.background;
 sky.material.uniforms.horizon.value.set(mode.sky);sky.material.uniforms.top.value.set(value==='evening'?'#384358':'#6993aa');
 sun.position.fromArray(mode.direction).multiplyScalar(220).add(sun.target.position);
 sky.material.uniforms.sunDirection.value.fromArray(mode.direction).normalize();sky.material.uniforms.sunColor.value.set(mode.sun);
 const skyRotation=Math.atan2(mode.direction[0],mode.direction[2]);scene.environmentRotation.y=skyRotation;scene.backgroundRotation.y=skyRotation;
 sky.visible=true;scene.background=null;
 sun.color.set(mode.sun);sun.intensity=mode.intensity*.86;fill.intensity=mode.ambient*.8;
 fill.color.set(value==='evening'?'#afbddf':'#e2edfe');
 scene.environmentIntensity=mode.env;renderer.toneMappingExposure=mode.exposure*.95;
 for(const root of [coarse,detailed])if(root)root.traverse(o=>{const m=o.material;
  if(m?.emissive&&/glaz|glass|window|lantern/i.test(m.name)){m.emissive.set('#e8aa66');m.emissiveIntensity=value==='evening'?.25:value==='sunset'?.07:0;}
 });
 renderer.shadowMap.needsUpdate=true;drawPending=true;
}
export function setEvening(value){setMood(value?'evening':'day');}
export function focusDesign(code,floor,duration=850){
 const bounds=mapData?.designFootprints[code];if(!bounds||!floor)return focusWing(code[0],duration);
 const [x1,z1,x2,z2]=bounds,y=floorY(floor),cx=(x1+x2)/2,cz=(z1+z2)/2;
 const dir=vec([cx,.01,cz]).normalize();
 return fly([cx+dir.x*52,y+12,cz+dir.z*52],[cx,y,cz],duration);
}
export function finishFlight(){
 if(!flight)return;
 updateFlight(flight.time+flight.duration);controls?.update();drawPending=true;
}
function hitWing(hit) {
  for (let p = hit.object; p; p = p.parent)
    if (['A', 'B'].includes(p.userData.wing)) return p.userData.wing;
  // gltfpack batches repeated facade modules as top-level GPU instances.
  // Resolve these hits against the same traced bays used to draw the floor overlays.
  const { x, y, z } = hit.point;
  if (!hit.object.isInstancedMesh || y < mapData.floorBase || y > 184) return null;
  for (const [id, w] of Object.entries(mapData.wings)) {
    if (
      w.footprints.some(
        ([x1, z1, x2, z2]) => x >= x1 - 1.8 && x <= x2 + 1.8 && z >= z1 - 1.8 && z <= z2 + 1.8,
      )
    )
      return id;
  }
  return null;
}
function clearSelection() {
  for (const mesh of [selection, outline]) {
    if (!mesh) continue;
    mesh.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    scene.remove(mesh);
  }
  selection = null;
  outline = null;
}
export function highlight(id, floor, design = null) {
  wing = id;
  level = floor;
  clearSelection();
  drawPending = true;
  if (!ready || !wing) return;
  const rects =
    design && floor && mapData.designFootprints[design]
      ? [mapData.designFootprints[design]]
      : mapData?.wings?.[id]?.footprints;
  if (!rects) return;
  const polys = rects.map(([x1, z1, x2, z2]) => [
    [x1 - 0.45, z1 - 0.45],
    [x2 + 0.45, z1 - 0.45],
    [x2 + 0.45, z2 + 0.45],
    [x1 - 0.45, z2 + 0.45],
  ]);
  selection = new THREE.Group();
  outline = new THREE.Group();
  const yf = floor ? floorY(floor) : 15,
    height = floor ? 3.15 : (roofHeights[id] || 174) - 15;
  for (const polygon of polys) {
    const shape = new THREE.Shape(polygon.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    const band = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        color: floor ? 0xffdf79 : 0xf8d597,
        transparent: true,
        opacity: floor ? 0.55 : 0.075,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    band.position.y = yf - (floor ? height / 2 : 0);
    selection.add(band);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(g, 18),
      new THREE.LineBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: floor ? 0.95 : 0.49 }),
    );
    edges.position.y = band.position.y;
    outline.add(edges);
  }
  if(!floor){
    const other=id==='A'?'B':'A';const h=(roofHeights[other]||174)-15;
    for(const [a,b,c,d] of mapData.wings[other].footprints){
      const accent=new THREE.Mesh(new THREE.BoxGeometry(c-a+1,h,d-b+1),new THREE.MeshBasicMaterial({color:0x312a29,transparent:true,opacity:.13,depthWrite:false}));
      accent.position.set((a+c)/2,15+h/2,(b+d)/2);selection.add(accent);
    }
  }
  scene.add(selection, outline);
}
function updatePins() {
  for (const { el, pos } of markers) {
    const p = vec(pos).project(camera);
    el.hidden = p.z < 0 || p.z > 1 || Math.abs(p.x) > 0.96 || Math.abs(p.y) > 0.8 || !active;
    el.style.left = (p.x * 0.5 + 0.5) * innerWidth + 'px';
    el.style.top = (-p.y * 0.5 + 0.5) * innerHeight + 'px';
  }
}
export function setSection(value, amenity = '') {
  section = value;activeDeck=amenity;
  if(controls)controls.minDistance=['amenities','masterplan'].includes(value)?.8:12;
  const host = document.querySelector('#scenePins');
  host.replaceChildren();
  markers = [];
  if (ready) {
    const pins =
      section === 'amenities'
        ? [
            ['clubhouse', 'Clubhouse', view.clubhouse[1]],
            ['eco-deck', 'Eco Deck', view.eco[1]],
            ['sky-deck', 'Sky Deck', view.sky[1]],
          ]
        : ['towers', 'masterplan'].includes(section)
          ? [
              ['A', 'Wing A', [-25, 151, -20]],
              ['B', 'Wing B', [13, 112, 38]],
            ]
          : [];
    for (const [id, label, pos] of pins) {
      if (id === amenity) continue;
      const el = document.createElement('button');
      el.className = 'estate-pin';
      el.textContent = label;
      el.onclick = () => (section === 'amenities' ? callbacks.amenity(id) : callbacks.wing(id));
      host.append(el);
      markers.push({ el, pos });
    }
  }
  projection();
  drawPending = true;
}
function bindInteractions() {
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute(
    'aria-label',
    'Exterior 3D model. Drag to orbit, pinch or scroll to zoom. Use Towers in navigation for keyboard selection.',
  );
  canvas.addEventListener('keydown',event=>{
  const key=event.key;
  if(['+','=','-'].includes(key)){event.preventDefault();zoom(key==='-'?1.17:.85);return;}
  if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(key))return;
  event.preventDefault();const pivot=controls.target.clone(),orb=new THREE.Spherical().setFromVector3(camera.position.clone().sub(pivot));
  if(key==='ArrowLeft')orb.theta-=.13;if(key==='ArrowRight')orb.theta+=.13;
  if(key==='ArrowUp')orb.phi-=.1;if(key==='ArrowDown')orb.phi+=.1;
  orb.phi=clamp(orb.phi,.12,Math.PI*.76);fly(new THREE.Vector3().setFromSpherical(orb).add(pivot).toArray(),pivot.toArray(),190);
 });
  controls.addEventListener('start', () => {
    cancelFlight();
    drawPending = true;
  });
  controls.addEventListener('change', () => {
    drawPending = true;
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.isPrimary) startPoint = [e.clientX, e.clientY];
    else startPoint = null;
  });
  canvas.addEventListener('pointercancel', () => {
    startPoint = null;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (
      !startPoint ||
      !ready ||
      !e.isPrimary ||
      Math.hypot(e.clientX - startPoint[0], e.clientY - startPoint[1]) > 5
    )
      return;
    startPoint = null;
    pointer.set((e.clientX / innerWidth) * 2 - 1, 1 - (e.clientY / innerHeight) * 2);
    ray.setFromCamera(pointer, camera);
    const hits=ray.intersectObject(exterior,true);
    if(['amenities','masterplan'].includes(section)&&hits.length){
      const catalog=amenitySections.find(s=>s.id===(section==='masterplan'?'masterplan':activeDeck));
      const point=hits[0].point;
      let closest,limit=5;
      for(const feature of catalog?.features||[])for(const location of feature.locations){
        if(!location.uv)continue;
        const distance=point.distanceTo(vec(location.world));
        if(distance<limit){limit=distance;closest=feature.id;}
      }
      if(closest){callbacks.feature?.(closest);return;}
    }
    for (const hit of hits) {
      if(['amenities','masterplan'].includes(section)){
        let object=hit.object;while(object&&!object.userData.amenityId)object=object.parent;
        if(object){callbacks.feature?.(object.userData.amenityId);break;}
      }
      const id = hitWing(hit);
      if (!id) continue;
      const picked = Math.round((hit.point.y - floorY(1)) / (floorY(2) - floorY(1))) + 1;
      if (wing === id && section === 'towers') {
        if (eligibleFloors.has(picked)) callbacks.floor(id, picked);
        else callbacks.unsupported(picked);
      } else if(section==='apartments'&&wing===id&&level){
        const {x,z}=hit.point;const design=Object.entries(mapData.designFootprints).find(([code,[x1,z1,x2,z2]])=>code.startsWith(id)&&x>=x1-1.8&&x<=x2+1.8&&z>=z1-1.8&&z<=z2+1.8);
        if(design)callbacks.design?.(design[0]);else callbacks.wing(id);
      }else callbacks.wing(id);
      break;
    }
  });
}
const clearance = new THREE.Vector3();
function guardCamera() {
  const p = camera.position;
  const minimum=(geography?.terrain.heightAt(p.x,p.z)??0)+1.5;
  if (p.y < minimum) p.y = minimum;
  if(section==='amenities')return;
  if (p.y > 185 || Math.abs(p.x) > 48 || Math.abs(p.z) > 57) return;
  const footprints = Object.values(mapData?.wings || {}).flatMap((w) => w.footprints);
  const obstructed = () =>
    footprints.some(([x1, z1, x2, z2]) => p.x > x1 - 2 && p.x < x2 + 2 && p.z > z1 - 2 && p.z < z2 + 2);
  if (!obstructed()) return;
  clearance.copy(p).sub(controls.target);
  clearance.y = 0;
  if (clearance.lengthSq() < 0.01) clearance.set(0, 0, 1);
  clearance.normalize().multiplyScalar(2);
  for (let step = 0; step < 55 && obstructed(); step++) p.add(clearance);
  camera.lookAt(controls.target);
  drawPending = true;
}
function chooseDetail() {
  if (!coarse) return;
  const close = !compactGPU() && camera.position.distanceTo(controls.target) < 535;
  if (close && !detailRequest) {
    detailRequest = loader
      .loadAsync('assets/brigade-barcelona.glb')
      .then((model) => {
        detailed = model.scene;
        detailed.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        setMood(mood);detailed.visible = false;
        scene.add(detailed);
        drawPending = true;
      })
      .catch(() => {});
  }
  const next = close && detailed ? detailed : coarse;
  if (next !== exterior) {
    exterior.visible = false;
    exterior = next;
    exterior.visible = true;
    renderer.shadowMap.needsUpdate = true;
    drawPending = true;
  }
}
function draw(now) {
  if (!active) {
    frameId = 0;
    return;
  }
  frameId = requestAnimationFrame(draw);
  if (!ready || !active || document.hidden) {
    lastDraw = 0;
    return;
  }
  const animating = Boolean(flight);
  updateFlight(now);
  controls.update();
  guardCamera();
  chooseDetail();
  if (!drawPending) {
    lastDraw = 0;
    return;
  }
  sky.position.copy(camera.position);
  scene.fog.density=.000145/(1+Math.max(0,camera.position.y-1000)/1500);
  geography?.update(camera,innerHeight*renderer.getPixelRatio());
  updatePins();
  renderer.render(scene, camera);renderedFrames++;
  drawPending = false;
  if (animating && lastDraw) {
    lowSamples = now - lastDraw > 37 ? lowSamples + 1 : Math.max(0, lowSamples - 1);
    if (lowSamples > 18 && renderer.getPixelRatio() > 0.85) {
      renderer.setPixelRatio(Math.max(0.85, renderer.getPixelRatio() * 0.85));
      lowSamples = 0;
    }
  }
  lastDraw = now;
}
export function activate(value) {
  active = value;
  if(value && geography){scene.add(geography.root);geography.shadows.visible=true;geography.setMood(mood);geoCredits(document.getElementById('geoCredits'),geography.stats().imagery);}
  geography?.setActive(value);
  if (!value) cancelFlight();
  else {
    projection();
    drawPending = true;
    if (ready && !frameId) frameId = requestAnimationFrame(draw);
  }
}
function dispose() {
  cancelAnimationFrame(frameId);
  controls?.dispose();
  geography?.dispose();
  const geometries = new Set(),
    materials = new Set();
  scene.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) for (const m of [].concat(o.material)) materials.add(m);
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();

  skyLight?.dispose();
  environment?.dispose();
  renderer?.dispose();
}
export async function initScene(handlers) {
  callbacks = handlers;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: !compactGPU(),
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, compactGPU() ? 1.35 : 1.65));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.rotateSpeed = 0.65;
    controls.minDistance = 20;
    controls.maxDistance = 1800;
    controls.maxPolarAngle = Math.PI * 0.8;
    scene.fog = new THREE.FogExp2(0xe0d3b6, 0.000145);
    sky = skyDome();
    scene.add(sky);
    sky.renderOrder=-100;
    sun = new THREE.DirectionalLight(0xffefd6, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(compactGPU() ? 1024 : 2048);
    Object.assign(sun.shadow.camera, {
      left: -150,
      right: 150,
      top: 170,
      bottom: -150,
      near: 1,
      far: 550,
    });
    sun.shadow.normalBias = 0.16;
    sun.target.position.y = 45;
    fill = new THREE.HemisphereLight(0xd5e7ef, 0xb8a085, 1.7);
    scene.add(sun, sun.target, fill);
    const gen = new THREE.PMREMGenerator(renderer),
      room = new RoomEnvironment();
    environment = gen.fromScene(room, 0.04);
    room.dispose();
    gen.dispose();
    scene.environment = environment.texture;
    
    projection();
    bindInteractions();
    loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const [model, metadata] = await Promise.all([
      loader.loadAsync('assets/exterior-lod.glb'),
      fetch('assets/scene-map.json')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    mapData = metadata;setMood(mood);
    coarse = exterior = model.scene;
    exterior.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    scene.add(exterior);
    for (const [id, data] of Object.entries(mapData?.wings || {})) {
      if (data.target) wingTargets[id] = data.target;
      const wingMesh = exterior.getObjectByName('Wing_' + id);
      if (wingMesh) roofHeights[id] = new THREE.Box3().setFromObject(wingMesh).max.y;
    }
    for (const [key, pos] of Object.entries(mapData?.amenities || {})) {
      const alias = { skyDeck: 'sky', entry: 'entrance' }[key] || key;
      if (view[alias] && Array.isArray(pos)) {
        const shift = vec(pos).sub(vec(view[alias][1]));
        view[alias] = [vec(view[alias][0]).add(shift).toArray(), pos];
      }
    }
    new HDRLoader().load(
      'assets/sky-light.hdr',
      (texture) => {
        skyLight = texture;
        texture.mapping = THREE.EquirectangularReflectionMapping;

        scene.environment = texture;
        scene.environmentRotation.y = scene.backgroundRotation.y = 0.72;
        setMood(mood);
        environment?.dispose();
        environment = null;
        drawPending = true;
      },
      undefined,
      () => {},
    );
    ready = true;
    renderer.shadowMap.needsUpdate = true;
    document.querySelector('#estateCanvas').append(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      ready = false;
      cancelFlight();
      document.querySelector('#estateCanvas').hidden = true;
      callbacks.fallback('3D paused · exterior rendering');
    });
    await goView(cameraKey, 0);
    setSection(section);
    highlight(wing, level);
    frameId = requestAnimationFrame(draw);
    addEventListener('resize', () => {
      projection();
      if (section === 'overview' && !flight) goView(cameraKey === 'landing' ? 'landing' : 'overview', 0);
    });
    addEventListener('pagehide', (event) => {
      if (!event.persisted) dispose();
    });
    getGeography().then(world=>{
      geography=world;geography.setMood(mood);
      if(active){scene.add(world.root);world.setActive(true);}
      renderer.shadowMap.needsUpdate=true;invalidateGeo();
    }).catch(handlers.contextMissing);
    function invalidateGeo(){
      if(!active||!ready)return;
      geoCredits(document.getElementById('geoCredits'),geography?.stats().imagery);
      drawPending=true;
    }
    window.addEventListener('brigade:geo-change',invalidateGeo);
    return true;
  } catch (error) {
    console.error('Exterior scene unavailable', error);
    dispose();
    handlers.fallback('Exterior rendering · live 3D unavailable');
    return false;
  }
}
export function authorView(position, target, eyeLevel=false) {
  if(controls)controls.minDistance=eyeLevel?.8:5;
  return fly(position, target);
}

export function cameraPath(waypoints) {
  if (!ready) return;
  cancelFlight();
  const points = [camera.position.clone(), ...waypoints.map(vec)];
  if (reduced()) {
    fly(waypoints.at(-1), controls.target.toArray(), 0);
    return;
  }
  flight = {
    path: new THREE.CatmullRomCurve3(points),
    time: performance.now(),
    duration: Math.min(20000, 2000 * points.length),
  };
}

// Used by local QA to measure the actual rendered frame and GPU allocation counts.
export function sceneMetrics() {
  if (!ready) return null;
  return {
    camera: camera.position.toArray(),
    target: controls.target.toArray(),
    pixelRatio: renderer.getPixelRatio(),
    triangles: renderer.info.render.triangles,
    drawCalls: renderer.info.render.calls,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    detail: exterior === coarse ? 'low' : 'full',
    floor: level, renderedFrames, mood, solarDirection:sun.position.clone().sub(sun.target.position).normalize().toArray(),
    wing,
    geographicContext: Boolean(geography),
    imagery: Boolean(geography?.stats().imagery.localImageryReady), gis:geography?.stats(),
  };
}

export async function playCityFlight(stillCurrent,onArrival){
  if(!ready)return;
  if(reduced()){goView('landing',0);onArrival();return;}
  const world=await getGeography();
  await world.ensureRegion();
  if(!stillCurrent() || !active)return;
  if(reduced()){goView('landing',0);onArrival();return;}
  cancelFlight();controls.maxDistance=65000;
  const at=(lon,lat,y)=>{const [x,z]=world.terrain.wgs84ToLocal(lon,lat);return vec([x,y,z]);};
  const eyes=[at(78.505,17.365,14000),at(78.413,17.378,7200),at(78.336,17.394,2600),
    vec([620,940,-440]),vec(view.landing[0])];
  const looks=[at(78.444,17.417,0),at(78.363,17.408,0),vec([-283,-56,-1208]),vec([0,0,0]),vec(view.landing[1])];
  // Centripetal splines keep the radically different city and parcel distances in metre space.
  flight={city:true,time:null,duration:9300,keys:['Hyderabad','Kokapet','Kokapet Lake','Neopolis · Plot 20','Brigade Barcelona'],
    path:new THREE.CatmullRomCurve3(eyes,false,'centripetal'),look:new THREE.CatmullRomCurve3(looks,false,'centripetal'), complete:onArrival};
  cameraKey='landing';drawPending=true;
}
export function orbitBuilding(){
  if(!ready || !active)return;
  cancelFlight();
  if(reduced())return goView('overview',0);
  const pivot=vec(overviewView()[1]);
  const direction=camera.position.clone().sub(pivot);
  const heading=Math.atan2(direction.x,direction.z);
  const radius=clamp(Math.hypot(direction.x,direction.z),220,390);
  const startEye=[pivot.x+radius*Math.sin(heading),clamp(camera.position.y,105,190),pivot.z+radius*Math.cos(heading)];
  fly(startEye,pivot.toArray(),750);
  flight.complete=()=>{
    const start=new THREE.Spherical().setFromVector3(camera.position.clone().sub(pivot)),end=start.clone();
    end.theta+=Math.PI*2;
    flight={from:start,to:end,startTarget:pivot,endTarget:pivot,time:null,duration:12000};
  };
}
let mapFeaturesEnabled=false;
export function mapFeatures(enabled){
  mapFeaturesEnabled=enabled;
  if(geography)geography.setFeatures(enabled);
  else if(enabled)getGeography().then(world=>world.setFeatures(mapFeaturesEnabled)).catch(()=>{});
}
