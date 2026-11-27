import * as THREE from 'three';
import { lightingAt } from './solar.js';
import {loadShowcase,landscapeHeight} from './showcase-landscape.js';
import {loadHybrid} from './hybrid-landscape.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ExteriorOrbitControls } from './exterior-orbit-controls.js';
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
const poolCenter = vec([40,24,37]);
const podiumCenter = vec([0,8,32]);
const terrainHeight = (x,z) => landscape?.terrain?.heightAt(x,z) ?? landscapeHeight(x,z);
const closeViews = new Set(['skyGarden','ecoGarden','pool']);
const view = {
  overview: [[-173, 116, 297], [0, 85, 8]],
  landing: [
    [475, 335, 540],
    [0, 20, 0],
  ],
  regional: [[-3500, 17500, -7500],[-1800,0,-9000]],
  aerial: [
    [105, 213, 160],
    [0, 46, 0],
  ],
  street: [
    [55, 8, 111],
    [0, 65, 0],
  ],
  entrance: [
    [-47, 8, 86],
    [-31, 6, 54],
  ],
  front: [[-173,116,297],[0,85,8]],
  frontage: [[-97,36,138],[-4,5,76]],
  gardensWide: [[314,228,425],[15,20,35]],
  rear: [[-118,89,-273],[0,85,0]],
  crown: [[46,167,105],[10,164,47]],
  balcony: [[-25,94,85],[-9,91,48]],
  podium: [[57,12,78],[21,8,51]],
  pool: [[56,34,51],[39.75,24,36.8]],
  skyGarden: [[7.7,180.5,32.3],[10.6,179.15,40]],
  ecoGarden: [[-14.5,18.6,52.5],[-5.4,16.2,57.2]],
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
const camera = new THREE.PerspectiveCamera(43, 1, 0.6, 12000);
const pointer = new THREE.Vector2();
const ray = new THREE.Raycaster();
let renderer, controls, environment, sky, sun, fill, exterior, landscape, selection, outline;
let ktx2;
const skyFiles = { day:'sky-light.hdr', morning:'sky-light.hdr', sunset: 'showcase/golden-hour.hdr', evening: 'sky-evening.hdr', night: 'sky-night.hdr' };
const skies = new Map();
let disposed = false;
let skyLight, coarse, detailed, detailedScreens, waterNormal, gardenLights;
let quality = 'auto';
let loadDetailed;
let active = true,
  ready = false,
  mood = 'sunset',
  flight = null,
  wing = null,
  level = null,
  section = 'overview';
let drawPending = true,
  lastDraw = 0,
  lowSamples = 0,
  frameId,
  lastFrame = 0,
  cameraUpdates = 0,
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
  if (cameraKey === 'front' || cameraKey === 'overview') {
    const panel = document.querySelector('#estatePanel');
    const dock = document.querySelector('#experienceDock');
    const top = document.querySelector('.header').getBoundingClientRect().bottom + 14;
    const left = !mobile() && !panel.hidden ? panel.getBoundingClientRect().right + 18 : 0;
    const bottom = mobile() && !panel.hidden
      ? panel.getBoundingClientRect().top - 10
      : dock.hidden ? h - 30 : dock.getBoundingClientRect().top - 12;
    const safeHeight = Math.max(bottom - top, h * .32);
    const safeWidth = w - left;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(
      Math.tan(THREE.MathUtils.degToRad(21.5)) * h / safeHeight,
      .25 * h / safeWidth,
    )));
    camera.setViewOffset(w, h, -left / 2, (h - top - bottom) / 2, w, h);
  } else if (cameraKey !== 'comparison') {
    camera.setViewOffset(w, h, x, y, w, h);
  }
  camera.updateProjectionMatrix();
  if (renderer.domElement.style.width !== w+'px' || renderer.domElement.style.height !== h+'px') {
    renderer.setSize(w, h);
  }
  drawPending = true;
}

function cancelFlight() {
  if (!flight) return;
  const previous = flight;
  flight = null;
  controls.enabled = active;
  previous.done?.();
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
    controls.clearMomentum();
    camera.lookAt(controls.target);
    drawPending = true;
    return Promise.resolve();
  }
  // Interpolate around the focus in spherical coordinates to stay outside the building.
  const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  const to = new THREE.Spherical().setFromVector3(end.sub(endTarget));
  to.theta = from.theta + Math.atan2(Math.sin(to.theta - from.theta), Math.cos(to.theta - from.theta));
  controls.clearMomentum();
  controls.enabled = false;
  return new Promise((done) => {
    flight = {
      from,
      to,
      startTarget: controls.target.clone(),
      endTarget,
      duration,
      done,
    };
  });
}
function updateFlight(seconds) {
  if (!flight || flight.waitingForReveal || flight.paused) return;
  const f = flight;
  f.elapsed = Math.min(f.duration, (f.elapsed ?? 0) + seconds * 1000);
  const t = f.elapsed / f.duration;
  if (f.path) {
    const progress = smooth(t, 0, 1);
    camera.position.copy(f.path.getPointAt(progress));
    if(f.look)controls.target.copy(f.look.getPointAt(progress));
  } else {
    // Accelerate and brake over one second. Cruise at a constant angular speed.
    const ramp = 1000;
    const elapsed = f.elapsed;
    const progress = elapsed < ramp ? elapsed ** 2 / (2 * ramp)
      : elapsed > f.duration - ramp ? f.duration - ramp - (f.duration - elapsed) ** 2 / (2 * ramp)
      : elapsed - ramp / 2;
    const k = f.orbit ? progress / (f.duration - ramp) : smooth(t, 0, 1);
    controls.target.lerpVectors(f.startTarget, f.endTarget, k);
    const s = new THREE.Spherical(
      THREE.MathUtils.lerp(f.from.radius, f.to.radius, k),
      THREE.MathUtils.lerp(f.from.phi, f.to.phi, k),
      THREE.MathUtils.lerp(f.from.theta, f.to.theta, k),
    );
    camera.position.setFromSpherical(s).add(controls.target);
  }
  drawPending = true;
  camera.lookAt(controls.target);
  if (t >= 1) {cancelFlight();f.complete?.();}
}
function overviewView() {
  return view.overview;
}

export function playIntroduction() {
  if (!ready || !active || section !== 'overview' || reduced()) return;
  const geographic = landscape?.stats().imagery?.provider === 'arcgis' && landscape?.stats().regionalImagery?.provider === 'arcgis';
  goView(geographic ? 'regional' : 'landing', 0);
  const [start, focus] = geographic ? view.regional : view.landing;
  const [end, target] = overviewView();
  // The original local building sequence uses separate splines for the eye and its target.
  flight = {
    intro: true, duration: 14500,
    path: new THREE.CatmullRomCurve3((geographic ? [start,[-1300,8000,-4100],[200,1800,2100],[152,176,335],[-109,113,313],end] : [start,[330,240,434],[152,176,335],[-12,123,316],[-109,113,313],end]).map(vec)),
    look: new THREE.CatmullRomCurve3((geographic ? [focus,[-200,0,-1700],[0,20,0],[0,67,0],[0,83,0],target] : [focus,[0,48,1],[0,67,0],[0,83,0],[0,83,0],target]).map(vec)),
  };
  controls.enabled = false;
  cameraKey = 'overview';
  projection();
  callbacks.intro(true);
}

export function tourArchitecture() {
  if (!ready || !active) return Promise.resolve();
  const keys = ['aerial','front','podium','clubhouse','crown','overview'];
  if (reduced()) return goView('front',0);
  cancelFlight();
  const poses = [[camera.position.toArray(),controls.target.toArray()],...keys.map(key => view[key])];
  controls.clearMomentum();
  controls.enabled = false;
  return new Promise(done => {
    flight = {
      duration:17000, done,
      path:new THREE.CatmullRomCurve3(poses.map(([eye]) => vec(eye))),
      look:new THREE.CatmullRomCurve3(poses.map(([,target]) => vec(target))),
    };
  });
}
export function stopIntroduction() {
  if (flight) cancelFlight();
}

export function goView(key, duration) {
  cameraKey = key;
  if (controls) controls.maxDistance = key === 'regional' ? 60000 : 1800;
  if (controls) controls.minDistance = closeViews.has(key) || ['amenities','masterplan'].includes(section) ? .8 : 12;
  projection();
  if(key==='street'){const x=-52,z=80;return fly([x,terrainHeight(x,z)+1.7,z],[-17,16,62],duration);}
  const pair = key === 'overview' ? overviewView() : view[key] || overviewView();
  return fly(...pair, duration);
}
export function focusWing(id, duration) {
  cameraKey = 'wing';
  projection();
  const t = wingTargets[id] || wingTargets.A;
  return fly([t[0] + (id === 'A' ? -99 : 93), t[1] + 37, t[2] + (id === 'A' ? -138 : 138)], t, duration);
}
export function focusFloor(id, floor, duration = 830) {
  cameraKey = 'floor';
  projection();
  const t = wingTargets[id];
  const y = floorY(floor);
  return fly(
    [t[0] + (id === 'A' ? -99 : 93), y + 17, t[2] + (id === 'A' ? -105 : 105)],
    [t[0], y, t[2]],
    duration,
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
function selectSky(value) {
  if (!skyLight || disposed) return;
  const file = skyFiles[value];
  if (!file) {
    scene.background = scene.environment = skyLight;
    return;
  }
  if (!skies.has(file)) {
    const request = new HDRLoader().loadAsync('assets/' + file).then((texture) => {
      if (disposed) {
        texture.dispose();
        return null;
      }
      texture.mapping = THREE.EquirectangularReflectionMapping;
      return texture;
    }).catch(() => {
      skies.delete(file);
      return null;
    });
    skies.set(file, request);
  }
  return skies.get(file).then((texture) => {
    if (value !== mood || disposed) return;
    scene.background = scene.environment = texture || skyLight;
    drawPending = true;
  });
}
export function setMood(value){
 mood=value;landscape?.setMood(mood);
 if(!renderer||!mapData)return;
 const mode=lightingAt(value,mapData);
 const afterDark = value === 'evening' || value === 'night';
 scene.fog.color.set(mode.sky);scene.backgroundIntensity=mode.background;scene.backgroundBlurriness=0;
 sky.material.uniforms.horizon.value.set(mode.sky);sky.material.uniforms.top.value.set(afterDark?'#101d36':'#6993aa');
 const direction = value==='sunset' ? [-.66,.24,1] : value==='day' ? [-.28,.60,1] : mode.direction;
 sun.position.fromArray(direction).normalize().multiplyScalar(220).add(sun.target.position);
 sky.material.uniforms.sunDirection.value.fromArray(mode.direction).normalize();sky.material.uniforms.sunColor.value.set(mode.sun).multiplyScalar(afterDark?.12:1);
 const skyRotation=Math.atan2(mode.direction[0],mode.direction[2]);scene.environmentRotation.y=skyRotation;scene.backgroundRotation.y=skyRotation;
 sky.visible=!skyLight;
 const skyReady = selectSky(value);
 sun.color.set(mode.sun);sun.intensity=mode.intensity*.86;fill.intensity=mode.ambient*.45;
 fill.color.set(afterDark?'#afbddf':'#e2edfe');
 scene.environmentIntensity=mode.env*.83;renderer.toneMappingExposure=mode.exposure*.95;
 for(const root of [coarse,detailed])if(root)root.traverse(o=>{const m=o.material;
  if(m?.emissive&&/warm reflected glass|garden lantern/i.test(m.name)){m.emissive.set('#e8aa66');m.emissiveIntensity=afterDark?.25:value==='sunset'?.07:0;}
 });
 updateGardenLighting();
 renderer.shadowMap.needsUpdate=true;drawPending=true;
 return skyReady;
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
 flight.waitingForReveal = false;
 flight.paused = false;
 updateFlight(flight.duration / 1000);
 drawPending=true;
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
  selection = new THREE.Group();
  outline = new THREE.Group();
  const yf = floor ? floorY(floor) : 15;
  const height = floor ? 3.15 : (roofHeights[id] || 174) - 15;
  addSelectionSilhouette(rects, yf - (floor ? height / 2 : 0), height,
    floor ? 0xffdf79 : 0xf8d597, floor ? .55 : .075, true);
  if (!floor) {
    const other = id === 'A' ? 'B' : 'A';
    addSelectionSilhouette(mapData.wings[other].footprints, 15,
      (roofHeights[other] || 174) - 15, 0x312a29, .13, false);
  }
  scene.add(selection, outline);
}
// Draw the exterior boundary of the footprint union once. The brochure's
// intersecting bay and service-core rectangles otherwise stack transparent faces.
function addSelectionSilhouette(rectangles, bottom, height, color, opacity, edged) {
  const rects = rectangles.map(([x1,z1,x2,z2])=>[x1-.45,z1-.45,x2+.45,z2+.45]);
  const xs = [...new Set(rects.flatMap(r=>[r[0],r[2]]))].sort((a,b)=>a-b);
  const zs = [...new Set(rects.flatMap(r=>[r[1],r[3]]))].sort((a,b)=>a-b);
  const covered = (i,j)=>rects.some(([a,b,c,d])=>a<=xs[i] && b<=zs[j] && c>=xs[i+1] && d>=zs[j+1]);
  const faces=[], lines=[];
  const top=bottom+height;
  function wall(x,z,u,v) {
    const a=[x,bottom,z], b=[u,bottom,v], c=[u,top,v], d=[x,top,z];
    faces.push(...a,...b,...c,...a,...c,...d);
    lines.push(...a,...b,...c,...d);
  }
  for(let i=0;i<xs.length-1;i++) for(let j=0;j<zs.length-1;j++){
    if(!covered(i,j))continue;
    const x=xs[i], u=xs[i+1], z=zs[j], v=zs[j+1];
    if(!covered(i-1,j))wall(x,z,x,v);
    if(!covered(i+1,j))wall(u,v,u,z);
    if(!covered(i,j-1))wall(u,z,x,z);
    if(!covered(i,j+1))wall(x,v,u,v);
  }
  const geometry = values=>new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(values,3));
  selection.add(new THREE.Mesh(geometry(faces),new THREE.MeshBasicMaterial({
    color,opacity,transparent:true,depthWrite:false,side:THREE.FrontSide,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
  })));
  if(edged)outline.add(new THREE.LineSegments(geometry(lines),new THREE.LineBasicMaterial({
    color:0xffe6a0,transparent:true,opacity:opacity>.1?.95:.49,depthWrite:false,
  })));
}
const pinPoint = new THREE.Vector3();
const pinRay = new THREE.Ray();
const pinHit = new THREE.Vector3();
function updatePins() {
  const placed = [];
  const projected = markers.map(marker=>{
    pinPoint.fromArray(marker.pos);
    const distance = pinRay.direction.copy(pinPoint).sub(camera.position).length();
    pinRay.origin.copy(camera.position);
    pinRay.direction.normalize();
    const occluded = marker.occluders.some(box=>pinRay.intersectBox(box,pinHit) &&
      pinHit.distanceTo(camera.position) < distance-2);
    pinPoint.project(camera);
    return {marker,distance,occluded,z:pinPoint.z,x:(pinPoint.x*.5+.5)*innerWidth,y:(.5-pinPoint.y*.5)*innerHeight};
  }).sort((a,b)=>a.distance-b.distance);
  for(const { marker:{el}, x, y, z, occluded } of projected){
    el.hidden = !active || occluded || z < -1 || z > 1 || x < 22 ||
      x > innerWidth-22 || y < 22 || y > innerHeight-22 ||
      placed.some(p=>Math.abs(p.x-x)<78&&Math.abs(p.y-y)<30);
    el.style.left = x+'px';
    el.style.top = y+'px';
    if(!el.hidden)placed.push({x,y});
  }
}
export function setSection(value, amenity = '') {
  section = value;activeDeck=amenity;
  updateGardenLighting();
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
              ['A', 'Wing A', [-25, 119, -20]],
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
      const occluders = ['A','B'].filter(wing=>id!==wing).flatMap(wing=>
        (mapData?.wings[wing]?.footprints??[]).map(([x,z,u,v])=>
          new THREE.Box3(new THREE.Vector3(x,15,z),new THREE.Vector3(u,roofHeights[wing]||174,v))));
      markers.push({ el, pos, occluders });
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
  const minimum=terrainHeight(p.x,p.z)+1.5;
  if (p.y < minimum) p.y = minimum;
  if(section==='amenities'||closeViews.has(cameraKey))return;
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
  if (!coarse || flight?.orbit || flight?.orbitApproach) return;
  const distance = camera.position.distanceTo(controls.target);
  const close = distance < (exterior === detailed ? 550 : 495);
  const high = quality !== 'performance' && (quality !== 'auto' || !compactGPU());
  const next = high && detailed && (flight?.intro || close) ? detailed : coarse;
  const screenRange = detailedScreens?.visible ? 175 : 135;
  const showScreens = next === detailed && renderer.getPixelRatio() > .8 &&
    camera.position.distanceToSquared(podiumCenter) < screenRange ** 2;
  if (detailedScreens && detailedScreens.visible !== showScreens) {
    detailedScreens.visible = showScreens;
    renderer.shadowMap.needsUpdate = true;
    drawPending = true;
  }
  if (next !== exterior) {
    exterior.visible = false;
    exterior = next;
    exterior.visible = true;
    renderer.shadowMap.needsUpdate = true;
    drawPending = true;
  }
}
function installDetail(model) {
  detailed = model.scene;
  detailedScreens = detailed.getObjectByName('Podium_clay_screens');
  detailed.traverse(prepareExteriorMesh);
  hideIllustrativeFrontage();
  detailed.visible = false;
  scene.add(detailed);
  setMood(mood);
}
function rippleNormal() {
  const size = 32;
  const data = new Uint8Array(size*size*4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x/size*Math.PI*2;
      const v = y/size*Math.PI*2;
      const nx = .21*Math.cos(2*u+v)+.10*Math.cos(u-3*v);
      const ny = .13*Math.cos(2*u+v)-.24*Math.cos(u-3*v);
      const nz = Math.sqrt(1-nx*nx-ny*ny);
      data.set([128+127*nx,128+127*ny,128+127*nz,255],4*(y*size+x));
    }
  }
  const texture = new THREE.DataTexture(data,size,size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
function updateGardenLighting() {
  if (!gardenLights) return;
  for (const light of gardenLights) {
    light.intensity = mood==='night' ? (section==='amenities'&&activeDeck===light.userData.deck?12:6) : 0;
  }
}
// The compatibility GLBs keep their original art. Omit their short frontage
// strip when the registered road layer is ready, while retaining the sports courts.
function removeIllustrativeFrontage(object) {
  if (!object.isMesh || !object.parent?.name.includes('Courts_pergolas_and_approach') &&
    !object.name.includes('Courts_pergolas_and_approach')) return;
  const name = object.material.name;
  if (name === 'Warm charcoal asphalt' || name === 'Buff limestone paving') {
    object.visible = false;
  } else if (name === 'Court striping' && !object.userData.frontageFiltered) {
    const source = object.geometry;
    const positions = source.getAttribute('position');
    const keep = [];
    const index = i=>source.index ? source.index.getX(i) : i;
    for (let i = 0; i < (source.index?.count ?? positions.count); i += 3) {
      const a = index(i), b = index(i+1), c = index(i+2);
      if (Math.max(positions.getZ(a),positions.getZ(b),positions.getZ(c)) < 40) keep.push(a,b,c);
    }
    object.geometry = source.clone().setIndex(keep);
    object.userData.frontageFiltered = true;
  }
}
function hideIllustrativeFrontage() {
  if (!landscape) return;
  for (const model of [coarse,detailed]) {
    if (!model || model.userData.frontageReplaced) continue;
    model.traverse(removeIllustrativeFrontage);
    model.userData.frontageReplaced = true;
    renderer.shadowMap.needsUpdate = true;
  }
}
function prepareExteriorMesh(object) {
  if (!object.isMesh) return;
  object.castShadow = ![].concat(object.material).some(material => material.transparent);
  object.receiveShadow = true;
  for (const material of [].concat(object.material)) {
    for (const texture of [material.map, material.normalMap, material.roughnessMap, material.aoMap]) {
      if (texture) texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    }
    if (material.name.startsWith('Reflecting pools')) {
      const geometry = object.geometry;
      if (!geometry.getAttribute('uv')) {
        const positions = geometry.getAttribute('position');
        const coordinates = new Float32Array(positions.count*2);
        for (let i=0; i<positions.count; i++) {
          coordinates[i*2] = positions.getX(i)*.68;
          coordinates[i*2+1] = positions.getZ(i)*.68;
        }
        geometry.setAttribute('uv',new THREE.BufferAttribute(coordinates,2));
      }
      waterNormal ??= rippleNormal();
      material.normalMap = waterNormal;
      material.normalScale.setScalar(.47);
    }
  }
}
export function setQuality(value) {
  quality = value;
  landscape?.setQuality(value);
  if (!ready) return;
  if ((quality === 'high' || quality === 'cinematic') && !detailed) loadDetailed?.();
  const performance = quality === 'performance' || (quality === 'auto' && compactGPU());
  const cinematic = quality === 'cinematic';
  renderer.setPixelRatio(Math.min(devicePixelRatio, performance ? .95 : cinematic ? 2 : 1.65));
  const shadowSize = performance ? 1024 : cinematic ? Math.min(renderer.capabilities.maxTextureSize, 4096) : 2048;
  if (sun.shadow.mapSize.x !== shadowSize) {
    sun.shadow.mapSize.setScalar(shadowSize);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  renderer.shadowMap.needsUpdate = true;
  drawPending = true;
}
function draw(now) {
  if (!active) {
    frameId = 0;
    return;
  }
  frameId = requestAnimationFrame(draw);
  if (!ready || !active || document.hidden) {
    lastFrame = lastDraw = 0;
    return;
  }
  const elapsed = lastFrame ? (now - lastFrame) / 1000 : 1 / 60;
  const seconds = Math.min(elapsed, .05);
  lastFrame = now;
  const animating = Boolean(flight && !flight.waitingForReveal && !flight.paused);
  if (flight) {
    if (animating) {
      updateFlight(flight.orbit && elapsed > .25 ? seconds : elapsed);
      cameraUpdates++;
    }
  } else {
    if (controls.advance(seconds)) cameraUpdates++;
    guardCamera();
  }
  const far = camera.position.y > 900 ? 80000 : 12000;
  const near = camera.position.y > 900 ? 4 : .6;
  if(camera.far !== far){camera.far=far;camera.near=near;camera.updateProjectionMatrix();}
  chooseDetail();
  if (waterNormal && !reduced() && section === 'amenities' && activeDeck === 'clubhouse' &&
      camera.position.distanceToSquared(poolCenter) < 85**2) {
    waterNormal.offset.set(now*.000085,now*.00004);
    drawPending = true;
  }
  if (!drawPending) {
    lastDraw = 0;
    return;
  }
  if (quality === 'auto' && animating && lastDraw) {
    lowSamples = now - lastDraw > 37 ? lowSamples + 1 : Math.max(0, lowSamples - 1);
    if (lowSamples > 18 && renderer.getPixelRatio() > 0.85) {
      renderer.setPixelRatio(Math.max(0.85, renderer.getPixelRatio() * 0.85));
      lowSamples = 0;
    }
  }
  sky.position.copy(camera.position);
  scene.fog.density=.00022/(1+Math.max(0,camera.position.y-1000)/1500)**2;
  camera.updateMatrixWorld();
  landscape?.update(camera,innerHeight*renderer.getPixelRatio());
  updateGeographicCredit();
  camera.updateMatrixWorld();
  updatePins();
  renderer.render(scene, camera);
  if (++renderedFrames === 1) {
    if (!compactGPU() || quality === 'cinematic' || quality === 'high') loadDetailed?.();
    const canvas = renderer.domElement;
    canvas.classList.add('estate-canvas-ready');
    const opening = flight;
    if (opening?.intro) {
      opening.waitingForReveal = true;
      const begin = () => {
        canvas.onanimationend = canvas.onanimationcancel = null;
        opening.waitingForReveal = false;
        opening.elapsed = 0;
      };
      canvas.onanimationend = canvas.onanimationcancel = begin;
    }
  }
  drawPending = false;
  lastDraw = now;
}
let geographicCreditKey = '';
function updateGeographicCredit() {
  const state = landscape?.stats();
  const imagery = state?.imagery?.provider === 'arcgis' ? state.imagery : state?.regionalImagery?.provider === 'arcgis' ? state.regionalImagery : state?.imagery;
  const credit = document.querySelector('#geographicCredit');
  if (!credit) return;
  // Full source notices stay in the shared credits dialog across every scene.
  const licensed = imagery?.provider === 'arcgis';
  const loading = imagery?.state === 'loading' || (!imagery?.state && /Checking|Loading/.test(imagery?.reason || ''));
  const message = licensed ? imagery.attribution : loading ? 'Loading Esri satellite imagery…'
    : imagery?.state === 'retrying' ? 'Reconnecting to Esri satellite imagery…'
    : imagery?.state === 'unauthorized' ? 'Esri imagery access unavailable'
    : 'Geographic imagery unavailable · Architectural ground';
  const canRetry = !licensed && Boolean(imagery?.canRetry);
  const hasEsriElevation = state?.elevation?.provider === 'Esri World Elevation';
  document.querySelector('#mapEsriCredit').hidden = !licensed && !hasEsriElevation;
  const retry = document.querySelector('#mapRetry');
  retry.hidden = !canRetry;
  retry.onclick = () => landscape?.retryImagery();
  const key = message + hasEsriElevation + canRetry;
  if (key === geographicCreditKey) return;
  geographicCreditKey = key;
  credit.replaceChildren();
  for(const [label,href] of [
    ...(licensed ? [['Powered by Esri','https://www.esri.com/'],[message,imagery.attributionUrl]] : [[message,null]]),
    ...(hasEsriElevation ? [['Elevation · Esri, Airbus and contributors','https://elevation.arcgis.com/arcgis/rest/services/WorldElevation/Terrain/ImageServer']] : []),
    ['© OpenStreetMap contributors','https://www.openstreetmap.org/copyright'],
    ['Terrain and footprint credits','assets/geography/CREDITS.txt'],
  ]) {
    const node = document.createElement(href?'a':'span');node.textContent=label;
    if(href){node.href=href;node.target='_blank';node.rel='noopener noreferrer';}
    credit.append(node);
  }
}
window.addEventListener('brigade:landscape-change',updateGeographicCredit);

export function activate(value) {
  active = value;
  if (value && landscape) {
    scene.add(landscape.root);
    landscape.setMood(mood);
  }
  landscape?.setActive(value);
  if (!value) {
    cancelFlight();
    controls?.clearMomentum();
    if (controls) controls.enabled = false;
    cancelAnimationFrame(frameId);
    frameId = lastFrame = lastDraw = 0;
  }
  else {
    if (controls) controls.enabled = true;
    projection();
    drawPending = true;
    if (ready && !frameId) frameId = requestAnimationFrame(draw);
  }
}
function dispose() {
  cancelAnimationFrame(frameId);
  removeEventListener('resize', projection);
  document.removeEventListener('visibilitychange', resetFrameClock);
  controls?.dispose();
  landscape?.dispose();
  const geometries = new Set(),
    materials = new Set();
  scene.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) for (const m of [].concat(o.material)) materials.add(m);
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();

  disposed = true;
  for (const sky of skies.values()) sky.then((texture) => { if(texture!==skyLight)texture?.dispose(); });
  ktx2?.dispose();
  skyLight?.dispose();
  waterNormal?.dispose();
  environment?.dispose();
  renderer?.dispose();
}
function resetFrameClock() {
  lastFrame = lastDraw = 0;
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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    controls = new ExteriorOrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.rotateSpeed = .45;
    controls.zoomSpeed = .65;
    controls.panSpeed = .5;
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
    sun.shadow.normalBias = 0.065;
    sun.shadow.bias = -0.00014;
    sun.target.position.y = 45;
    fill = new THREE.HemisphereLight(0xd5e7ef, 0xb8a085, 1.7);
    scene.add(sun, sun.target, fill);
    gardenLights = [
      [[9.6,179.18,39.3],'sky-deck'], [[-6.8,16.3,56.3],'eco-deck'],
      [[40,24.6,37],'clubhouse'],
    ].map(([position,deck]) => {
      const light = new THREE.PointLight(deck === 'clubhouse' ? 0xaedbff : 0xffb467,0,9);
      light.position.fromArray(position);
      light.userData.deck = deck;
      return light;
    });
    scene.add(...gardenLights);
    const gen = new THREE.PMREMGenerator(renderer),
      room = new RoomEnvironment();
    environment = gen.fromScene(room, 0.04);
    room.dispose();
    gen.dispose();
    scene.environment = environment.texture;
    
    projection();
    bindInteractions();
    ktx2 = new KTX2Loader().setTranscoderPath('vendor/addons/libs/basis/').detectSupport(renderer);
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2);
    const [model, metadata, world, hdr] = await Promise.all([
      loader.loadAsync('assets/exterior-lod.glb'),
      fetch('assets/scene-map.json')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      loadHybrid(loader, invalidateLandscape).catch(error => {
        console.warn('Geographic context unavailable, retaining architectural landscape',error.message);
        return loadShowcase(loader,invalidateLandscape);
      }),
      new HDRLoader().loadAsync('assets/' + skyFiles.sunset).catch(() => null),
    ]);
    mapData = metadata;
    coarse = exterior = model.scene;
    exterior.traverse(prepareExteriorMesh);
    scene.add(exterior);
    let detailRequest;
    loadDetailed = () => {
      detailRequest ??= loader.loadAsync('assets/brigade-barcelona.glb')
        .then(model => { if (ready) installDetail(model); })
        .catch(() => { detailRequest = null; });
      return detailRequest;
    };
    landscape = world;
    hideIllustrativeFrontage();
    function invalidateLandscape(shadows = true) {
      if (disposed) return;
      drawPending = true;
      if(shadows)renderer.shadowMap.needsUpdate = true;
      window.dispatchEvent(new Event('brigade:landscape-change'));
    }
    scene.add(world.root);
    invalidateLandscape();
    world.setActive(active);
    if (hdr) {
      skyLight = hdr;
      skies.set(skyFiles.sunset,Promise.resolve(hdr));
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = hdr;
      environment.dispose();
      environment = null;
    }
    await setMood(mood);
    for (const [id, data] of Object.entries(mapData?.wings || {})) {
      if (data.target) wingTargets[id] = data.target;
      const wingMesh = exterior.getObjectByName('Wing_' + id);
      if (wingMesh) roofHeights[id] = new THREE.Box3().setFromObject(wingMesh).max.y;
    }
    for (const [key, pos] of Object.entries(mapData?.amenities || {})) {
      if (key === 'pool') continue;
      const alias = { skyDeck: 'sky', entry: 'entrance' }[key] || key;
      if (view[alias] && Array.isArray(pos)) {
        const shift = vec(pos).sub(vec(view[alias][1]));
        view[alias] = [vec(view[alias][0]).add(shift).toArray(), pos];
      }
    }
    ready = true;
    setQuality(quality);
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
    if(section === 'overview' && !reduced()) await landscape.prepareArrival?.(camera,innerHeight*renderer.getPixelRatio());
    setSection(section);
    highlight(wing, level);
    frameId = requestAnimationFrame(draw);
    addEventListener('resize', projection);
    document.addEventListener('visibilitychange', resetFrameClock);
    addEventListener('pagehide', (event) => {
      if (!event.persisted) dispose();
    });
    return true;
  } catch (error) {
    console.error('Exterior scene unavailable', error);
    dispose();
    handlers.fallback('Exterior rendering · live 3D unavailable');
    return false;
  }
}
export function getExteriorContext() {
  return coarse;
}
export async function getExteriorLighting(value) {
  await setMood(value);
  return { background: scene.background, environment: scene.environment,
    rotation: scene.environmentRotation.y, direction: sun.position.clone().sub(sun.target.position).normalize() };
}
export function getExteriorLandscape() {
  if (!landscape) throw new Error('The exterior landscape is unavailable.');
  return landscape;
}
export function authorView(position, target, eyeLevel=false, centered=false) {
  cameraKey = centered ? 'comparison' : 'authored';
  projection();
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
  controls.clearMomentum();
  controls.enabled = false;
  flight = {
    path: new THREE.CatmullRomCurve3(points),
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
    quality,
    detail: exterior === coarse ? 'low' : 'full',
    floor: level, renderedFrames, cameraUpdates, motion:flight?.orbit ? (flight.paused ? 'paused' : 'orbit') : flight ? 'transition' : 'manual', mood, solarDirection:sun.position.clone().sub(sun.target.position).normalize().toArray(),
    wing,
    landscape: landscape?.stats(),

  };
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
  flight.orbitApproach = true;
  controls.enabled = true;
  flight.complete=()=>{
    const start=new THREE.Spherical().setFromVector3(camera.position.clone().sub(pivot)),end=start.clone();
    end.theta+=Math.PI*2;
    flight={orbit:true,from:start,to:end,startTarget:pivot,endTarget:pivot,duration:24000};
  };
}

export function toggleOrbitPause() {
  if (!flight?.orbit) return;
  flight.paused = !flight.paused;
  return flight.paused;
}
