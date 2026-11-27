import * as THREE from 'three';
import { loadTerrain } from './geo-terrain.js';
import { createBuildings } from './geo-buildings.js';
import { createArrival } from './geo-arrival.js';
import { createRoads } from './geo-roads.js';
import { createImagery } from './gis-imagery.js';

// A small receiver drapes cast shadows over the terrain at the development and gate.
function siteShadows(terrain) {
  const steps = 12,
    span = steps * terrain.step,
    positions = [],
    indices = [];
  for (let z = 0; z <= steps; z++)
    for (let x = 0; x <= steps; x++) {
      const localX = x * terrain.step - span / 2,
        localZ = z * terrain.step - span / 2;
      positions.push(localX, terrain.heightAt(localX, localZ) + 0.025, localZ);
      if (x && z) {
        const corner = z * (steps + 1) + x;
        indices.push(corner - steps - 2, corner - 1, corner, corner - steps - 2, corner, corner - steps - 1);
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.ShadowMaterial({
    opacity: 0.27,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = 'Site terrain shadow receiver';
  return mesh;
}

let shared;
async function buildWorld() {
  const [terrain, settings] = await Promise.all([
    loadTerrain(),
    fetch(new URL('./data/arcgis-runtime.json', import.meta.url), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({})),
  ]);
  const root = new THREE.Group(),
    localCamera = new THREE.PerspectiveCamera(),
    inverse = new THREE.Matrix4();
  root.name = 'Registered geographic environment';
  const quality =
    innerWidth <= 680 || (navigator.maxTouchPoints > 0 && Math.min(innerWidth, innerHeight) <= 900)
      ? 'mobile'
      : 'desktop';
  const invalidate = () => window.dispatchEvent(new Event('brigade:geo-change'));
  const imagery = createImagery(THREE, terrain, { settings, quality, onChange: invalidate });
  const buildings = createBuildings(THREE, terrain, { quality, onChange: invalidate });
  const shadows = siteShadows(terrain);
  const roads = createRoads(THREE, terrain, invalidate);
  const arrival = createArrival(THREE, terrain, invalidate);
  root.add(imagery.root, buildings.root, roads.root, arrival.root, shadows);
  const [baseReady] = await Promise.all([imagery.baseReady, roads.startup]);
  if (!baseReady) {
    imagery.dispose();
    buildings.dispose();
    roads.dispose();
    arrival.dispose();
    shadows.geometry.dispose();
    shadows.material.dispose();
    throw new Error('Base terrain imagery unavailable');
  }
  let active = true,
    infrastructure,
    infrastructureRequest,
    showInfrastructure = false,
    regionRequest,
    mood = 'day';
  function setActive(value) {
    if (active === value) return;
    active = value;
    root.visible = value;
    imagery.setActive(value);
    buildings.setActive(value);
    roads.setActive(value);
  }
  async function setFeatures(value) {
    showInfrastructure = value;
    if (value && !infrastructure) {
      infrastructureRequest ??= import('./geo-infrastructure.js')
        .then((m) => {
          infrastructure = m.createInfrastructure(THREE, terrain, { onChange: invalidate });
          root.add(infrastructure.root);
          return infrastructure.setVisible(showInfrastructure);
        })
        .catch(() => {
          infrastructureRequest = null;
        });
      await infrastructureRequest;
    }
    if (infrastructure) infrastructure.setVisible(showInfrastructure);
    invalidate();
  }
  function update(camera, height) {
    if (!active) return;
    imagery.update(camera, height);
    root.updateWorldMatrix(true, false);
    inverse.copy(root.matrixWorld).invert();
    localCamera.matrix.multiplyMatrices(inverse, camera.matrixWorld);
    localCamera.matrix.decompose(localCamera.position, localCamera.quaternion, localCamera.scale);
    localCamera.projectionMatrix.copy(camera.projectionMatrix);
    localCamera.updateMatrixWorld();
    buildings.update(localCamera);
    roads.update(localCamera);
  }
  function ensureRegion() {
    regionRequest ??= import('./regional-terrain.js')
      .then((m) => m.createRegion(terrain))
      .then((mesh) => {
        mesh.material.color = imagery.tint;
        root.add(mesh);
        setMood(mood);
        invalidate();
        return mesh;
      })
      .catch((e) => {
        regionRequest = null;
        throw e;
      });
    return regionRequest;
  }
  function setMood(value) {
    mood = value;
    imagery.setMood(value);
    arrival.setMood(value);
    shadows.material.opacity = value === 'evening' ? 0.13 : 0.27;
  }
  return {
    root,
    terrain,
    update,
    setActive,
    setFeatures,
    ensureRegion,
    setMood,
    setQuality(value) {
      roads.setQuality(value);
      arrival.setQuality(value);
    },
    setTerrainPresentation: imagery.setPresentation,
    setPresentation(value) {
      imagery.setPresentation(value);
      roads.setPresentation(value);
      arrival.setPresentation(value);
    },
    shadows,
    stats: () => ({
      anchorElevationM: terrain.anchorElevationM,
      radius: terrain.radius,
      step: terrain.step,
      imagery: imagery.stats(),
      buildings: buildings.stats(),
      roads: roads.stats(),
      infrastructure: infrastructure?.stats(),
    }),
    dispose() {
      shadows.geometry.dispose();
      shadows.material.dispose();
      imagery.dispose();
      buildings.dispose();
      roads.dispose();
      arrival.dispose();
      infrastructure?.dispose();
      regionRequest
        ?.then((mesh) => {
          mesh.geometry.dispose();
          mesh.material.map.dispose();
          mesh.material.dispose();
        })
        .catch(() => {});
      root.clear();
      root.removeFromParent();
      shared = null;
    },
  };
}
export function getGeography() {
  return (shared ??= buildWorld().catch((e) => {
    shared = null;
    throw e;
  }));
}

export function geoCredits(node, imagery) {
  if (!node) return;
  const parts = [
    ...(imagery?.provider === 'arcgis'
      ? [
          ['Powered by Esri', 'https://www.esri.com/'],
          [imagery.attribution, imagery.attributionUrl],
        ]
      : []),
    ['Contains modified Copernicus Sentinel data (2025)', 'assets/geography/IMAGERY.txt'],
    ['© OpenStreetMap contributors', 'https://www.openstreetmap.org/copyright'],
    ['Overture & terrain sources', 'assets/geography/CREDITS.txt'],
  ];
  const key = JSON.stringify(parts);
  if (node.dataset.credits === key) return;
  node.dataset.credits = key;
  node.replaceChildren();
  for (const [label, href] of parts) {
    if (node.childNodes.length) node.append(' · ');
    const a = document.createElement('a');
    a.textContent = label;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    node.append(a);
  }
}
