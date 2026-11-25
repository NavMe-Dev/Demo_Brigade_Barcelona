// Inspect every triangulated roof and grounded wall in the delivered 3D footprint layer.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from '../../dist/vendor/three/three.module.js';
import { loadTerrain, localToWGS84, wgs84ToLocal } from '../../dist/geo-terrain.js';
import { buildFootprintTile } from '../../dist/geo-buildings.js';
const root = new URL('../../', import.meta.url),
  geo = new URL('dist/assets/geography/', root);
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
globalThis.fetch = async (url) => new Response(await readFile(url));
const terrain = await loadTerrain(),
  index = await json(new URL('buildings/index.json', geo));
const material = new THREE.MeshStandardMaterial();
let foundations = 0,
  roofTriangles = 0,
  maxGroundError = 0,
  maxMidpointError = 0,
  footprints = 0,
  minWall = Infinity;
for (const tile of index.tiles) {
  const data = await readFile(new URL('buildings/' + tile.file, geo));
  const mesh = buildFootprintTile(
    THREE,
    terrain,
    tile,
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    material,
    index.tileSize,
  );
  const geometry = mesh.geometry,
    pos = geometry.attributes.position.array,
    normal = geometry.attributes.normal.array,
    indices = geometry.index.array;
  footprints += mesh.userData.buildings;
  for (let i = 0; i < indices.length; i += 3) {
    if (normal[indices[i] * 3 + 1] > 0.9) {
      roofTriangles++;
      continue;
    }
    const a = indices[i] * 3,
      b = indices[i + 1] * 3,
      c = indices[i + 2] * 3;
    if (pos[a] === pos[b] && pos[a + 2] === pos[b + 2] && pos[b + 1] > pos[a + 1]) {
      const x = pos[a] + mesh.position.x,
        z = pos[a + 2] + mesh.position.z,
        xx = pos[c] + mesh.position.x,
        zz = pos[c + 2] + mesh.position.z;
      minWall = Math.min(minWall, pos[b + 1] - pos[a + 1]);
      foundations++;
      maxGroundError = Math.max(maxGroundError, Math.abs(pos[a + 1] - terrain.heightAt(x, z)));
      maxMidpointError = Math.max(
        maxMidpointError,
        Math.abs((pos[a + 1] + pos[c + 1]) / 2 - terrain.heightAt((x + xx) / 2, (z + zz) / 2)),
      );
    }
  }
  geometry.dispose();
}
const parcel = await json(new URL('plot-20.geojson', geo));
const latSeconds = [
  9.388, 10.109, 10.084, 9.892, 9.63, 9.376, 9.194, 9.087, 8.916, 8.752, 8.356, 8.056, 7.685, 7.39,
  6.695, 5.587,
];
const lonSeconds = [
  46.23, 42.196, 42.169, 41.985, 41.758, 41.563, 41.437, 41.364, 41.264, 41.167, 40.973, 40.847, 40.72,
  40.622, 40.412, 45.292,
];
let dmsError = 0,
  padError = 0,
  roundTrip = 0;
const ring = parcel.geometry.coordinates[0];
for (let i = 0; i < 16; i++) {
  const [lon, lat] = ring[i],
    x = wgs84ToLocal(lon, lat),
    out = localToWGS84(...x);
  dmsError = Math.max(
    dmsError,
    Math.hypot(
      (17 + 24 / 60 + latSeconds[i] / 3600 - lat) * 111320,
      (78 + 18 / 60 + lonSeconds[i] / 3600 - lon) * 106225,
    ),
  );
  roundTrip = Math.max(roundTrip, Math.hypot((out[0] - lon) * 106225, (out[1] - lat) * 111320));
  padError = Math.max(padError, Math.abs(terrain.heightAt(...x)));
}
assert.equal(footprints, index.total);
assert.ok(roofTriangles > footprints && foundations > footprints * 3);
assert.ok(maxGroundError < 0.002 && maxMidpointError < 0.002);
assert.ok(dmsError < 0.001 && roundTrip < 0.001 && padError < 0.001);
const output = {
  status: 'pass',
  tiles: index.tiles.length,
  footprints,
  foundationSegments: foundations,
  roofTriangles,
  minWallHeightM: minWall,
  maxFoundationVertexErrorM: maxGroundError,
  maxFoundationSegmentMidpointErrorM: maxMidpointError,
  hmdaSource:
    'Neopolis Phase III, Plot 20 coordinate table, page 22. Independent transcription of all DMS values A–P.',
  officialVertexCount: 16,
  maxCoordinateTranscriptionDifferenceM: dmsError,
  maxWgsRoundTripM: roundTrip,
  maximumPadHeightAtOfficialCornersM: padError,
  terrainReferenceM: terrain.anchorElevationM,
  samples: terrain.width ** 2,
  sourceModelTranslationY: 0,
  sceneElevationRangeM: terrain.sceneRangeM,
};
await writeFile(new URL('qa/geographic-geometry.json', root), JSON.stringify(output, null, 2) + '\n');
console.log(output);
