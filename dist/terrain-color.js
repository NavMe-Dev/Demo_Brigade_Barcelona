import * as THREE from 'three';

// Both packages use the same local metre-based axes. The image is preprojected
// into those axes by prepare_satellite.py and includes the surrounding horizon.
export async function colorTerrain(root, horizon) {
  const texture = await new THREE.TextureLoader().loadAsync('assets/geography/kokapet-color.webp');
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  root.updateMatrixWorld(true);
  const p = new THREE.Vector3();
  const relative = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const transform = new THREE.Matrix4();
  root.traverse((mesh) => {
    if (!mesh.isMesh || mesh.material.name !== 'Kokapet terrain') return;
    const positions = mesh.geometry.attributes.position;
    const uv = new Float32Array(positions.count * 2);
    transform.multiplyMatrices(relative, mesh.matrixWorld);
    for (let i = 0; i < positions.count; i++) {
      p.fromBufferAttribute(positions, i).applyMatrix4(transform);
      uv[2 * i] = 0.5 + p.x / 12800;
      uv[2 * i + 1] = 0.5 - p.z / 12800;
    }
    mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    // Optical imagery already includes sunlight. Avoid lighting its colors a second time.
    mesh.material.dispose();
    mesh.material = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xf3ede2,
      toneMapped: false,
      fog: true,
    });
  });
  if (horizon) {
    horizon.material.dispose();
    horizon.material = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xd0c9bb,
      toneMapped: false,
      fog: true,
    });
  }
  return texture;
}
