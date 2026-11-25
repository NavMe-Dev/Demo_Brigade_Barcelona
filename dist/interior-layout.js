// Each record resolves to the geometry, navigation data and stills for one brochure design.
let manifest;
export function brochureLayouts() {
  if (!manifest)
    manifest = fetchJSON('assets/brochure-manifest.json')
      .then((data) => data.layouts)
      .catch((error) => {
        manifest = null;
        throw error;
      });
  return manifest;
}
export async function fetchJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw Error('Could not load ' + path);
  return response.json();
}
const cache = new Map();
export async function layoutPackage(code) {
  const source = (await brochureLayouts()).find((layout) => layout.code === code);
  if (!source) throw Error('Unknown brochure design.');
  if (cache.has(code)) return cache.get(code);
  const original = code === 'A3',
    base = original ? 'assets/' : 'assets/apartments/' + code + '/';
  const files = original
    ? {
        model: 'apartment-a3-web.glb',
        geometry: 'apartment-geometry.json',
        colliders: 'furniture-colliders.json',
        views: 'room-views.json',
        overview: 'apartment-a3-thumbnail.webp',
      }
    : {
        model: 'apartment-' + code.toLowerCase() + '.glb',
        geometry: 'geometry.json',
        colliders: 'colliders.json',
        views: 'views.json',
        overview: 'overview.webp',
      };
  const plan = original ? 'assets/plan-a3.webp' : 'assets/plans/' + code + '.webp';
  const promise = Promise.all(
    [files.geometry, files.colliders, files.views].map((file) => fetchJSON(base + file)),
  )
    .then(([geometry, colliders, views]) => ({
      source,
      geometry,
      colliders,
      views: views.views,
      plan,
      model: base + files.model,
      overview: base + files.overview,
      base,
    }))
    .catch((error) => {
      cache.delete(code);
      throw error;
    });
  cache.set(code, promise);
  return promise;
}
