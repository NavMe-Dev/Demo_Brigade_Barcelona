import {readFile, writeFile, mkdir} from 'node:fs/promises';

const root = new URL('../dist/', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const save = (path, value) => writeFile(new URL(path, root), JSON.stringify(value, null, 2) + '\n');
const page = await readFile(new URL('index.html', root), 'utf8');
if (!page.includes('<!--APP_BASE-->')) throw Error('Missing static route base marker');
await mkdir(new URL('experience/', root), {recursive: true});
await writeFile(new URL('experience/index.html', root), page.replace('<!--APP_BASE-->', '<base href="../">'));

const source = await json('assets/brochure-manifest.json');
const layouts = [];
for (const a of source.layouts) {
  const legacy = a.code === 'A3';
  const base = 'assets/apartments/' + a.code + '/';
  const geometry = legacy ? 'assets/apartment-geometry.json' : base + 'geometry.json';
  const trace = await json(geometry);
  const decks = trace.rooms.filter(room => /deck|balcony/i.test(room.label));
  const balcony = decks.map(room => {
    const sizes = [room.published_dimensions_m, room.additional_published_dimensions_m].filter(Array.isArray);
    return room.label + (sizes.length ? ' · ' + sizes.map(size => size.join(' × ') + ' m').join(' + ') : '');
  }).join(', ');
  layouts.push({...a, id:a.code, verification:'Brochure dimensions and programme, illustrative traced geometry',
    plan:'assets/plans/' + a.code + '.webp', geometry, balcony,
    model:legacy ? 'assets/apartment-a3-web.glb' : base + 'apartment-' + a.code.toLowerCase() + '.glb',
    views:legacy ? 'assets/room-views.json' : base + 'views.json',
    preview:legacy ? 'assets/apartment-a3-thumbnail.webp' : base + 'overview.webp',
    collisions:legacy ? 'assets/furniture-colliders.json' : base + 'colliders.json'});
}
await save('data/unit-layouts.json', {layouts});
console.log('Built / and /experience/ with ' + layouts.length + ' independently sourced apartment records.');
