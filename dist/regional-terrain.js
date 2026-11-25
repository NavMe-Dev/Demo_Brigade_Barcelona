import * as THREE from 'three';
export async function createRegion(terrain) {
  const [location, grid, texture] = await Promise.all([
    fetch('data/location.json').then((r) => r.json()),
    fetch('assets/geography/region-dem.json').then((r) => r.json()),
    new THREE.TextureLoader().loadAsync('assets/geography/hyderabad-region.webp'),
  ]);
  const [[west, north], , [east, south]] = location.region.corners;
  const { cols, rows, heights } = grid,
    vertices = [],
    uv = [],
    idx = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const u = i / (cols - 1),
        v = j / (rows - 1),
        [x, z] = terrain.wgs84ToLocal(west + u * (east - west), north + v * (south - north));
      const range = Math.max(Math.abs(x), Math.abs(z));
      const blend = THREE.MathUtils.smoothstep(range, terrain.radius, terrain.radius + 1000);
      const near = terrain.heightAt(x, z) - 12,
        far = heights[j * cols + i] - terrain.anchorElevationM;
      vertices.push(x, THREE.MathUtils.lerp(near, far, blend), z);
      uv.push(u, 1 - v);
      if (j && i) {
        const k = j * cols + i;
        // Keep an overlap skirt at the local DEM boundary; its upper surface owns the pixels.
        if (range > terrain.radius - 1300) idx.push(k - cols - 1, k - cols, k, k - cols - 1, k, k - 1);
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }),
  );
  mesh.name = 'Hyderabad regional terrain';
  return mesh;
}
