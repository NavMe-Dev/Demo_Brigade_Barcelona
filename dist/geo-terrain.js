// Geographic axes preserve the rotation and scale of the published Plot 20 registration.
const ORIGIN = [78.312086932, 17.402192529];
const EAST = [-0.233699171, -0.972308952];
const NORTH = [-0.972308952, 0.233699171];
const LAT_METRES = 111320;
const LON_METRES = LAT_METRES * Math.cos((ORIGIN[1] * Math.PI) / 180);
const metadataURL = new URL('./assets/geography/elevation.json', import.meta.url);
let sharedTerrain;

export function wgs84ToLocal(lon, lat) {
  const e = (lon - ORIGIN[0]) * LON_METRES;
  const n = (lat - ORIGIN[1]) * LAT_METRES;
  return [e * EAST[0] + n * NORTH[0], e * EAST[1] + n * NORTH[1]];
}

export function localToWGS84(x, z) {
  return [
    ORIGIN[0] + (x * EAST[0] + z * EAST[1]) / LON_METRES,
    ORIGIN[1] + (x * NORTH[0] + z * NORTH[1]) / LAT_METRES,
  ];
}

async function readTerrain(signal) {
  const response = await fetch(metadataURL, { signal });
  if (!response.ok) throw new Error('Elevation metadata unavailable');
  const metadata = await response.json();
  const binary = await fetch(new URL(metadata.file, metadataURL), { signal });
  if (!binary.ok) throw new Error('Elevation samples unavailable');
  const samples = new Int16Array(await binary.arrayBuffer());
  const { width, radius, step, unitsPerCountM: scale } = metadata;
  if (samples.length !== width * width) throw new Error('Incomplete elevation grid');
  // Interpolate on exactly the two planar triangles used to draw this cell.
  function heightAt(x, z) {
    const gx = Math.max(0, Math.min(width - 1, (x + radius) / step));
    const gz = Math.max(0, Math.min(width - 1, (z + radius) / step));
    const i = Math.min(width - 2, Math.floor(gx)),
      j = Math.min(width - 2, Math.floor(gz));
    const a = gx - i,
      b = gz - j,
      k = j * width + i;
    const nw = samples[k],
      se = samples[k + width + 1];
    if (a >= b) return ((1 - a) * nw + (a - b) * samples[k + 1] + b * se) * scale;
    return ((1 - b) * nw + (b - a) * samples[k + width] + a * se) * scale;
  }
  return { ...metadata, heightAt, wgs84ToLocal, localToWGS84 };
}

export function loadTerrain({ signal } = {}) {
  if (signal) return readTerrain(signal);
  sharedTerrain ??= readTerrain().catch((error) => {
    sharedTerrain = null;
    throw error;
  });
  return sharedTerrain;
}

export function terrainSegmentSamples(a, b, terrain) {
  const dx = b.x - a.x,
    dz = b.y - a.y,
    times = [0, 1];
  // All triangulation edges lie on these three sets of grid lines.
  for (const [start, change] of [
    [a.x + terrain.radius, dx],
    [a.y + terrain.radius, dz],
    [a.x - a.y, dx - dz],
  ]) {
    if (Math.abs(change) < 1e-8) continue;
    const low = Math.min(start, start + change),
      high = Math.max(start, start + change);
    for (let q = Math.floor(low / terrain.step) + 1; q * terrain.step < high - 1e-7; q++) {
      const t = (q * terrain.step - start) / change;
      if (t > 1e-7 && t < 1 - 1e-7) times.push(t);
    }
  }
  times.sort((u, v) => u - v);
  return times
    .filter((t, i) => !i || t - times[i - 1] > 1e-7)
    .map((t) => {
      const x = a.x + dx * t,
        z = a.y + dz * t;
      return [x, terrain.heightAt(x, z), z];
    });
}
