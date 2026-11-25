import { publishedAssetUrl } from './sales.js';
import { catalog } from './admin/catalog.js';
const previewId = new URLSearchParams(location.search).get('studio-preview');
export async function resolveReleaseAsset(path) {
  if (!/^[a-f\d-]+\/[a-f\d-]+\.(?:glb|ktx2|webp|png|jpg)$/.test(path))
    throw Error('Invalid project asset path.');
  if (previewId) {
    const { openAsset } = await import('./admin/store.js');
    return openAsset(path);
  }
  return publishedAssetUrl(path);
}
const node = (tag, text) => {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  return n;
};
function humanValue(field, row, manifest) {
  const value = row[field.key];
  if (field.type === 'link')
    return manifest[field.values]?.find((r) => r.id === value)?.title || 'Unavailable';
  if (field.type === 'checkbox') return value ? 'Yes' : 'No';
  if (field.type === 'datetime-local') return new Date(value).toLocaleString();
  if (Array.isArray(value))
    return value.map((v) => (Array.isArray(v) ? '(' + v.join(', ') + ')' : v)).join(', ');
  return value;
}
export function mountReleaseLibrary(release) {
  const menu = document.querySelector('#estateNavDialog'),
    data = release?.manifest;
  if (!menu || !data || document.getElementById('releaseCollection')) return;
  const css = node('link');
  css.rel = 'stylesheet';
  css.href = new URL('./release-library.css', import.meta.url).href;
  document.head.append(css);
  const launch = node('button', previewId ? 'Review draft collection' : 'Project collection');
  launch.type = 'button';
  launch.className = 'release-launch';
  menu.querySelector('nav').after(launch);
  const dialog = node('dialog');
  dialog.id = 'releaseCollection';
  dialog.setAttribute('aria-label', 'Project collection');
  const header = node('div'),
    title = node('h2', previewId ? 'Draft collection' : 'Project collection'),
    close = node('button', 'Close');
  header.className = 'release-head';
  close.onclick = () => dialog.close();
  header.append(title, close);
  const filter = node('label', 'Collection'),
    select = node('select'),
    records = node('div'),
    stage = node('div');
  for (const [key, [label]] of Object.entries(catalog))
    if (data[key]?.length) select.add(new Option(label + ' (' + data[key].length + ')', key));
  filter.append(select);
  dialog.append(header, filter, stage, records);
  document.body.append(dialog);
  let epoch = 0,
    dispose = () => {},
    activeUrl = null;
  function reset() {
    epoch++;
    dispose();
    dispose = () => {};
    if (activeUrl?.startsWith('blob:')) URL.revokeObjectURL(activeUrl);
    activeUrl = null;
    stage.replaceChildren();
  }
  async function showAsset(asset) {
    reset();
    const turn = epoch,
      caption = node('p', asset.title + ' · ' + asset.evidence),
      viewport = node('div');
    viewport.className = 'release-asset';
    stage.append(caption, viewport);
    viewport.textContent = 'Loading asset…';
    stage.scrollIntoView({ block: 'nearest' });
    try {
      const url = await resolveReleaseAsset(asset.object_path);
      if (turn !== epoch) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
        return;
      }
      activeUrl = url;
      viewport.replaceChildren();
      if (asset.object_path.endsWith('.glb')) {
        const { renderModel } = await import('./release-model.js');
        if (turn !== epoch) return;
        const cleanup = await renderModel(viewport, url, () => turn === epoch);
        if (turn === epoch) dispose = cleanup;
        else cleanup();
      } else if (asset.object_path.endsWith('.ktx2')) {
        const link = node('a', 'Download KTX2 texture');
        link.href = url;
        link.download = 'texture.ktx2';
        viewport.append(link);
      } else {
        const img = node('img');
        img.alt = asset.title;
        img.src = url;
        img.onerror = () => {
          if (turn === epoch) viewport.textContent = 'Image unavailable.';
        };
        viewport.append(img);
      }
    } catch (error) {
      if (turn === epoch) viewport.textContent = 'Asset unavailable. ' + error.message;
    }
  }
  function render() {
    reset();
    records.replaceChildren();
    const key = select.value;
    if (!key) {
      records.textContent = 'This release contains no project records.';
      return;
    }
    for (const row of data[key]) {
      const details = node('details'),
        summary = node('summary', row.code + ' · ' + row.title),
        description = node('dl');
      const entry = (label, value) => {
        if (value != null && value !== '') description.append(node('dt', label), node('dd', value));
      };
      entry('Evidence', row.evidence);
      entry('Source', row.source_ref);
      for (const field of catalog[key][1])
        if (field.type !== 'file') entry(field.label, humanValue(field, row, data));
      details.append(summary, description);
      const asset = key === 'scene_assets' ? row : data.scene_assets?.find((a) => a.id === row.asset_id);
      if (asset) {
        const button = node('button', 'View asset');
        button.onclick = () => showAsset(asset);
        details.append(button);
      }
      records.append(details);
    }
  }
  launch.onclick = () => {
    menu.close();
    render();
    dialog.showModal();
  };
  dialog.addEventListener('close', () => {
    reset();
    document.querySelector('#estateMenu')?.focus();
  });
  select.onchange = render;
}
