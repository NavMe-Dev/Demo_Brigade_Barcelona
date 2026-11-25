const field = (key, label, type = 'text', values) => ({ key, label, type, values });
const link = (key, label, table) => field(key, label, 'link', table);
const asset = link('asset_id', 'Uploaded asset', 'scene_assets');
const apartment = link('apartment_type_id', 'Apartment design', 'apartment_types');
const unit = link('unit_id', 'Apartment unit', 'apartment_units');
const wing = link('wing_id', 'Wing', 'wings');
export const catalog = {
  buildings: ['Buildings', []],
  wings: ['Wings', [link('building_id', 'Building', 'buildings')]],
  floors: ['Floors', [wing, field('level', 'Floor level', 'integer')]],
  apartment_types: [
    'Apartment designs',
    [
      wing,
      field('bedrooms', 'Bedrooms', 'integer'),
      field('has_study', 'Includes study', 'checkbox'),
      field('total_sba_sqft', 'Total super built-up area (sq ft)', 'number'),
      field('total_carpet_area_sqft', 'Total carpet area (sq ft)', 'number'),
    ],
  ],
  apartment_units: ['Unit mappings', [link('floor_id', 'Floor', 'floors'), apartment]],
  rooms: [
    'Room destinations',
    [
      apartment,
      field('dimensions', 'Brochure dimensions'),
      field('destination', 'Navigation point [x, y, z]', 'vector'),
    ],
  ],
  scene_assets: ['Scene assets', [field('object_path', 'Upload GLB, KTX2 or image', 'file')]],
  architectural_models: ['Architectural models', [asset]],
  floor_plans: ['Floor plans', [apartment, asset]],
  camera_viewpoints: [
    'Camera viewpoints',
    [
      field('position', 'Camera position [x, y, z]', 'vector'),
      field('target', 'Look-at point [x, y, z]', 'vector'),
    ],
  ],
  camera_paths: ['Camera paths', [field('waypoints', 'Ordered camera points [[x, y, z], …]', 'path')]],
  amenities: ['Amenities', [field('description', 'Description', 'textarea')]],
  geographic_references: [
    'Geographic references',
    [
      field('latitude', 'Latitude', 'number'),
      field('longitude', 'Longitude', 'number'),
      field('attribution', 'Attribution'),
    ],
  ],
  inventory: [
    'Availability',
    [
      unit,
      field('availability', 'Availability', 'select', ['available', 'held', 'sold', 'withdrawn']),
      field('verified_at', 'Last verified', 'datetime-local'),
    ],
  ],
  pricing: [
    'Pricing',
    [
      unit,
      field('amount', 'Amount', 'number'),
      field('currency', 'ISO currency (e.g. INR)'),
      field('verified_at', 'Last verified', 'datetime-local'),
    ],
  ],
};
export const salesTables = ['inventory', 'pricing', 'apartment_units'];
export const common = [
  field('code', 'Identifier'),
  field('title', 'Display name'),
  field('evidence', 'Evidence', 'select', ['illustrative', 'verified']),
  field('source_ref', 'Source citation'),
];
export const blankManifest = () => Object.fromEntries(Object.keys(catalog).map((key) => [key, []]));
export async function seedDraft() {
  const response = await fetch('../assets/brochure-manifest.json');
  if (!response.ok) throw Error('The brochure manifest could not be loaded.');
  const brochure = await response.json(),
    draft = blankManifest();
  const row = (code, title, source_ref, fields = {}) => ({
    id: crypto.randomUUID(),
    code,
    title,
    evidence: 'verified',
    source_ref,
    ...fields,
  });
  draft.buildings.push(row('development', 'Brigade Barcelona', 'Brochure, pages 3 and 26'));
  for (const code of ['A', 'B'])
    draft.wings.push(
      row(code, 'Wing ' + code, 'Brochure design schedules, pages 17–23', {
        building_id: draft.buildings[0].id,
      }),
    );
  draft.apartment_types = brochure.layouts.map((layout) =>
    row(
      layout.code,
      layout.bedrooms + ' BHK' + (layout.has_study ? ' + study' : ''),
      'Brochure, page ' + layout.source_pdf_page,
      {
        bedrooms: layout.bedrooms,
        has_study: layout.has_study,
        total_sba_sqft: layout.total_sba_sqft,
        total_carpet_area_sqft: layout.total_carpet_area_sqft,
        wing_id: draft.wings.find((item) => item.code === layout.wing).id,
      },
    ),
  );
  return draft;
}
export function validateRecord(table, row, manifest) {
  if (manifest[table].some((other) => other.id !== row.id && other.code === row.code))
    throw Error('This identifier already exists.');
  for (const field of catalog[table][1]) {
    const value = row[field.key];
    if (field.type === 'link' && !manifest[field.values].some((item) => item.id === value))
      throw Error('Select a valid ' + field.label.toLowerCase() + '.');
    const vector = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
    if (field.type === 'vector' && !vector(value)) throw Error('Enter three finite coordinates.');
    if (
      field.type === 'path' &&
      !(Array.isArray(value) && value.length >= 2 && value.length <= 256 && value.every(vector))
    )
      throw Error('Enter 2–256 coordinate triples.');
  }
  if (
    table === 'apartment_types' &&
    !(
      row.bedrooms >= 1 &&
      row.bedrooms <= 20 &&
      row.total_sba_sqft >= row.total_carpet_area_sqft &&
      row.total_carpet_area_sqft > 0
    )
  )
    throw Error('Check the bedroom count and brochure areas.');
  if (table === 'pricing' && (!(row.amount > 0) || !/^[A-Z]{3}$/.test(row.currency)))
    throw Error('Enter a positive price and three-letter ISO currency.');
  if (
    table === 'geographic_references' &&
    (Math.abs(row.latitude) > 90 || Math.abs(row.longitude) > 180)
  )
    throw Error('Coordinates fall outside the geographic range.');
  if (salesTables.includes(table) && row.evidence !== 'verified')
    throw Error('A verified source is required for sales records.');
  if (table === 'apartment_units') {
    const floor = manifest.floors.find((x) => x.id === row.floor_id),
      type = manifest.apartment_types.find((x) => x.id === row.apartment_type_id);
    if (floor.wing_id !== type.wing_id)
      throw Error('The selected floor and design belong to different wings.');
  }
  if (
    ['pricing', 'inventory'].includes(table) &&
    (Date.parse(row.verified_at) > Date.now() ||
      manifest[table].some((x) => x.id !== row.id && x.unit_id === row.unit_id))
  )
    throw Error('Each unit accepts one current record with a past verification time.');
}
