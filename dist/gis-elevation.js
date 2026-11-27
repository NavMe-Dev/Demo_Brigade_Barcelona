const SERVICE = 'https://elevation.arcgis.com/arcgis/rest/services/WorldElevation/Terrain/ImageServer';
const GRID_RADIUS = 2048;
const GRID_STEP = 64;
const GRID_WIDTH = GRID_RADIUS * 2 / GRID_STEP + 1;
const BATCH_SIZE = 96;

function smooth(value, low, high) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

function parcelDistance(x, z, boundary) {
  let inside = false, distance = Infinity;
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
    const [a, b] = boundary[j], [c, d] = boundary[i];
    const dx = c - a, dz = d - b;
    const length = dx * dx + dz * dz;
    const t = length ? Math.max(0, Math.min(1, ((x - a) * dx + (z - b) * dz) / length)) : 0;
    distance = Math.min(distance, Math.hypot(x - a - t * dx, z - b - t * dz));
    if ((b > z) !== (d > z) && x < (c - a) * (z - b) / (d - b) + a) inside = !inside;
  }
  return inside ? -distance : distance;
}

function sampler(samples, width, radius, step) {
  return (x, z) => {
    const gx = Math.max(0, Math.min(width - 1, (x + radius) / step));
    const gz = Math.max(0, Math.min(width - 1, (z + radius) / step));
    const i = Math.min(width - 2, Math.floor(gx));
    const j = Math.min(width - 2, Math.floor(gz));
    const a = gx - i, b = gz - j, k = j * width + i;
    if (a >= b) return (1 - a) * samples[k] + (a - b) * samples[k + 1] + b * samples[k + width + 1];
    return (1 - b) * samples[k] + (b - a) * samples[k + width] + a * samples[k + width + 1];
  };
}

// Await this once before creating ground, roads or building bases. The completed
// sampler never mutates a visible scene and proprietary samples remain in memory.
export async function loadEsriElevation(base, settings, boundary, { timeoutMs = 12000 } = {}) {
  if (!settings.arcgisImageryEnabled || !settings.arcgisApiKey) return base;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const samples = new Float32Array(GRID_WIDTH * GRID_WIDTH).fill(NaN);
  const sources = new Set(), datums = new Set();
  let next = 0, requests = 0, finest = Infinity, coarsest = 0;
  const start = performance.now();
  try {
    async function worker() {
      while (next < samples.length) {
        const offset = next;
        next += BATCH_SIZE;
        const count = Math.min(BATCH_SIZE, samples.length - offset);
        const points = Array.from({ length: count }, (_, index) => {
          const k = offset + index;
          const x = k % GRID_WIDTH * GRID_STEP - GRID_RADIUS;
          const z = Math.floor(k / GRID_WIDTH) * GRID_STEP - GRID_RADIUS;
          return base.localToWGS84(x, z).map(value => Number(value.toFixed(8)));
        });
        const params = new URLSearchParams({
          f: 'json', token: settings.arcgisApiKey,
          geometry: JSON.stringify({ points, spatialReference: { wkid: 4326 } }),
          geometryType: 'esriGeometryMultipoint', returnFirstValueOnly: 'true',
          pixelSize: '24,24', interpolation: 'RSP_BilinearInterpolation',
          outFields: 'Name,VerticalDatum,ProductName,LowPS,Source',
        });
        requests++;
        const response = await fetch(SERVICE + '/getSamples?' + params, {
          signal: controller.signal, cache: 'no-store',
        });
        if (!response.ok) throw new Error('Elevation service unavailable');
        const data = await response.json();
        if (data.error || data.samples?.length !== count) throw new Error('Elevation sampling incomplete');
        const seen = new Set();
        for (const sample of data.samples) {
          const id = sample.locationId, value = Number(sample.value), attributes = sample.attributes || {};
          const resolution = Number(attributes.LowPS);
          if (!Number.isInteger(id) || id < 0 || id >= count || seen.has(id) || !Number.isFinite(value) ||
              value < -500 || value > 10000 || !Number.isFinite(resolution) || resolution > 100 || resolution <= 0 ||
              !attributes.VerticalDatum) throw new Error('Elevation source unavailable at required detail');
          seen.add(id);
          samples[offset + id] = value;
          datums.add(attributes.VerticalDatum);
          sources.add(attributes.ProductName || attributes.Name);
          finest = Math.min(finest, resolution);
          coarsest = Math.max(coarsest, resolution);
        }
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker));
    if (datums.size !== 1 || samples.some(value => !Number.isFinite(value))) throw new Error('Mixed elevation reference');
    const absoluteHeight = sampler(samples, GRID_WIDTH, GRID_RADIUS, GRID_STEP);
    const sourceOrigin = absoluteHeight(0, 0);
    const heights = new Float32Array(base.width * base.width);
    for (let row = 0; row < base.width; row++) for (let col = 0; col < base.width; col++) {
      const x = col * base.step - base.radius, z = row * base.step - base.radius;
      const existing = base.heightAt(x, z);
      const extent = Math.max(Math.abs(x), Math.abs(z));
      const blend = extent < GRID_RADIUS
        ? smooth(parcelDistance(x, z, boundary), 8, 128) * (1 - smooth(extent, 1536, GRID_RADIUS)) : 0;
      heights[row * base.width + col] = existing + blend * (absoluteHeight(x, z) - sourceOrigin - existing);
    }
    return {
      ...base, samples: heights, unitsPerCountM: 1,
      heightAt: sampler(heights, base.width, base.radius, base.step),
      esriElevation: {
        provider: 'Esri World Elevation', service: SERVICE, sources: [...sources], datum: [...datums][0],
        sourceOriginM: sourceOrigin, sourceSpacingM: [finest, coarsest], gridStepM: GRID_STEP,
        sampleCount: samples.length, radiusM: GRID_RADIUS, blendOutStartM: 1536,
        requests, readyMs: Math.round(performance.now() - start),
        reference: 'Relative to Esri origin sample, feathered to EGM96 fallback. This is an approximate local vertical registration.',
      },
    };
  } catch {
    controller.abort();
    return { ...base, esriElevation: { provider: 'open DEM', reason: 'Esri elevation unavailable', requests } };
  } finally {
    clearTimeout(timer);
  }
}
