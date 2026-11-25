import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export async function renderModel(container, url, active) {
  const bytes = await (
    await fetch(url).then((r) => {
      if (!r.ok) throw Error('Model download failed.');
      return r;
    })
  ).arrayBuffer();
  if (!active()) return () => {};
  const renderer = new THREE.WebGLRenderer({ antialias: true }),
    scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(38, 1, 0.05, 2000);
  const controls = new OrbitControls(camera, renderer.domElement),
    env = new RoomEnvironment(),
    generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(env);
  scene.environment = environment.texture;
  scene.background = new THREE.Color('#696952');
  const textures = new KTX2Loader()
    .setTranscoderPath('vendor/addons/libs/basis/')
    .setWorkerLimit(1)
    .detectSupport(renderer);
  const manager = new THREE.LoadingManager();
  // Shared project uploads are standalone GLBs; keep all model resources within the reviewed binary.
  manager.setURLModifier((resource) => {
    if (!/^(blob:|data:)/.test(resource)) throw Error('The model references an external resource.');
    return resource;
  });
  const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(textures);
  let observer, model;
  const dispose = () => {
    observer?.disconnect();
    controls.dispose();
    env.dispose();
    generator.dispose();
    environment.dispose();
    textures.dispose();
    const seen = new Set();
    const free = (item) => {
      if (!item || seen.has(item)) return;
      seen.add(item);
      item.dispose?.();
    };
    model?.traverse((o) => {
      free(o.geometry);
      for (const material of [].concat(o.material || [])) {
        Object.values(material)
          .filter((v) => v?.isTexture)
          .forEach((t) => {
            if (!seen.has(t)) t.source?.data?.close?.();
            free(t);
          });
        free(material);
      }
    });
    renderer.dispose();
    renderer.forceContextLoss();
  };
  try {
    model = (await loader.parseAsync(bytes, '')).scene;
    if (!active()) {
      dispose();
      return () => {};
    }
    const bounds = new THREE.Box3().setFromObject(model),
      center = bounds.getCenter(new THREE.Vector3());
    const size = Math.max(bounds.getSize(new THREE.Vector3()).length(), 1);
    scene.add(model);
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(0.7, 0.55, 0.95).multiplyScalar(size));
    camera.near = size / 5000;
    camera.far = size * 25;
    controls.minDistance = size * 0.025;
    controls.maxDistance = size * 6;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const light = new THREE.HemisphereLight(0xfff8e3, 0x716958, 2.3);
    scene.add(light);
    container.append(renderer.domElement);
    const draw = () => {
      if (!active()) return;
      const w = container.clientWidth,
        h = Math.max(220, Math.min(450, innerHeight * 0.42));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.render(scene, camera);
    };
    controls.addEventListener('change', draw);
    controls.update();
    observer = new ResizeObserver(draw);
    observer.observe(container);
    draw();
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
