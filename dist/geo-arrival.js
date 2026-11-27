import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// All beds sit inside the published Plot 20 outline, alongside the conceptual drives.
const beds = [[-51,49,2.1],[-47,54,2],[-45,58,1.5],[-35,57,1.6],
  [-31,58,1.4],[-26,61,1.6],[-20,64,1.8],[-16,67,1.8],[-10,67,2.1]];
const base = new URL('./assets/geography/roads/', import.meta.url);

export function createArrival(THREE, terrain, onChange) {
  const root = new THREE.Group();
  root.name = 'Illustrative Plot 20 entry planting';
  const rim = new THREE.CylinderGeometry(1, .95, .23, 22);
  const soil = new THREE.CylinderGeometry(.92, .92, .06, 22);
  const stone = new THREE.MeshStandardMaterial({ color: '#a79980', roughness: .86 });
  const earth = new THREE.MeshStandardMaterial({ color: '#413827', roughness: .95 });
  const metal = new THREE.MeshStandardMaterial({ color: '#363027', roughness: .49, metalness: .32 });
  const lens = new THREE.MeshStandardMaterial({ color: '#fab973', emissive: '#ffa45d', emissiveIntensity: 0 });
  const bollard = new THREE.CylinderGeometry(.07,.083,.72,10);
  const cap = new THREE.CylinderGeometry(.064,.065,.07,10);
  const lights = [];
  const fernMeshes = [];
  let disposed = false, loaded = false, presentation = 'showcase', quality = 'auto';
  function install(mesh, x, z, lift) {
    mesh.position.set(x, terrain.heightAt(x,z)+lift, z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  }
  for (const [x,z,r] of beds) {
    install(new THREE.Mesh(rim,stone),x,z,.115).scale.set(r,1,r*.61);
    install(new THREE.Mesh(soil,earth),x,z,.22).scale.set(r,1,r*.61);
  }
  for (const [x,z] of [[-48,53],[-43,58],[-36,59],[-33,62],[-21,65],[-16,67]]) {
    install(new THREE.Mesh(bollard,metal),x,z,.39);
    install(new THREE.Mesh(cap,lens),x,z,.78);
    const light = new THREE.PointLight('#ffd097',0,8);
    light.position.set(x,terrain.heightAt(x,z)+.77,z);
    light.visible = false;
    root.add(light);
    lights.push(light);
  }
  const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const graft = new THREE.Object3D();
  function importFerns() {
    if (loaded || disposed) return;
    loaded = true;
    gltf.loadAsync(new URL('arrival-fern.glb', base).href).then(({scene}) => {
      const sources = [];
      scene.traverse(object => { if (object.isMesh) sources.push(object); });
      if (disposed) {
        for (const mesh of sources) releaseFern(mesh);
        return;
      }
      for (let variant = 0; variant < sources.length; variant++) {
        const source = sources[variant];
        const foliage = new THREE.InstancedMesh(source.geometry, source.material, beds.length * 3);
        let i = 0;
        for (const [x,z,r] of beds) {
          for (let k = 0; k < 3; k++) {
            const angle = variant*2.399963+k*2.09;
            graft.position.set(x+Math.cos(angle)*r*.63,terrain.heightAt(x,z)+.24,z+Math.sin(angle)*r*.40);
            graft.rotation.y = angle;
            graft.scale.setScalar(.94+.15*((i+variant)%3));
            graft.updateMatrix();
            foliage.setMatrixAt(i++,graft.matrix);
          }
        }
        foliage.castShadow = true;
        foliage.receiveShadow = true;
        foliage.computeBoundingSphere();
        fernMeshes.push(foliage);
        root.add(foliage);
      }
      visibility();
      onChange();
    }).catch(() => { loaded = false; });
  }
  function releaseFern(mesh) {
    mesh.geometry.dispose();
    for (const material of [].concat(mesh.material)) {
      for (const slot of ['map','normalMap','aoMap','roughnessMap','metalnessMap'])
        material[slot]?.dispose();
      material.dispose();
    }
  }
  function visibility() {
    root.visible = presentation === 'showcase';
    const detail = quality !== 'performance' && (quality !== 'auto' || innerWidth > 680);
    for (const mesh of fernMeshes) mesh.visible = detail;
    if (root.visible && detail) importFerns();
  }
  return {
    root,
    setPresentation(value) { presentation = value; visibility(); },
    setQuality(value) { quality = value; visibility(); },
    setMood(value) {
      const dark = value === 'night' || value === 'evening';
      lens.emissiveIntensity = dark ? 2.2 : 0;
      for (const light of lights) {
        light.visible = dark;
        light.intensity = dark ? 18 : 0;
      }
    },
    dispose() {
      disposed = true;
      for (const geometry of [rim, soil, bollard, cap]) geometry.dispose();
      for (const material of [stone,earth,metal,lens]) material.dispose();
      for (const mesh of fernMeshes) { releaseFern(mesh); mesh.dispose(); }
      root.clear();
    },
  };
}
