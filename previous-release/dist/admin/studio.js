import * as store from './store.js';
import { catalog, common, salesTables, validateRecord } from './catalog.js';
import { studioConfig } from '../studio-config.js';
const $ = (id) => document.getElementById(id);
const el = (tag, text) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
};
const status = (text) => {
  $('status').textContent = text;
};
const guard = (fn) => async (event) => {
  const control = event?.currentTarget,
    disable = control instanceof HTMLButtonElement;
  try {
    if (disable) control.disabled = true;
    await fn(event);
  } catch (error) {
    status(error.message);
  } finally {
    if (disable) control.disabled = false;
  }
};
const action = (label, fn) => {
  const button = el('button', label);
  button.type = 'button';
  button.onclick = guard(fn);
  return button;
};
const option = (value, label) => new Option(label, value);
let content,
  table = 'buildings',
  current;
const mimes = {
  glb: 'model/gltf-binary',
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  ktx2: 'image/ktx2',
};
for (const [key, [label]] of Object.entries(catalog)) $('collection').add(option(key, label));
$('collection').onchange = () => {
  table = $('collection').value;
  renderList();
};
$('mode').textContent = store.connected
  ? 'Connected project · Authorized team workspace'
  : 'Private browser draft · Changes stay on this device';
$('add').onclick = () => edit(null);
$('logout').onclick = guard(async () => {
  await store.logout();
  location.reload();
});
$('login').onsubmit = guard(async (event) => {
  event.preventDefault();
  const values = new FormData(event.target);
  await store.login(values.get('email'), values.get('password'));
  event.target.reset();
  await start();
});
async function start() {
  $('logout').hidden = !store.connected || !store.loggedIn();
  if (store.connected && !store.loggedIn()) {
    $('login').hidden = false;
    return;
  }
  content = await store.getContent();
  $('app').hidden = false;
  $('login').hidden = true;
  $('add').hidden = !store.canEdit();
  if (store.connected) $('mode').textContent = 'Connected project · ' + store.role;
  await changeTab('content');
}
async function changeTab(tab) {
  for (const key of ['content', 'release', 'activity']) $(key).hidden = tab !== key;
  document
    .querySelectorAll('nav button')
    .forEach((b) => b.setAttribute('aria-current', String(b.dataset.tab === tab)));
  status('');
  if (tab === 'content') renderList();
  if (tab === 'release') await renderVersions();
  if (tab === 'activity') await renderActivity();
}
document
  .querySelectorAll('nav button')
  .forEach((b) => (b.onclick = guard(() => changeTab(b.dataset.tab))));
function renderList(selected) {
  const list = $('list');
  list.replaceChildren();
  for (const row of content[table]) {
    const button = action(row.code + ' · ' + row.title, () => edit(row));
    button.dataset.id = row.id;
    list.append(button);
  }
  if (selected) edit(content[table].find((r) => r.id === selected));
  else if (content[table].length) edit(content[table][0]);
  else {
    $('editor').hidden = true;
    $('empty').textContent = 'No records in this collection.';
  }
}
function edit(row) {
  current = row;
  $('empty').textContent = '';
  for (const b of $('list').children) b.setAttribute('aria-current', String(row?.id === b.dataset.id));
  const form = $('editor');
  form.hidden = false;
  form.replaceChildren(el('h2', row?.title || 'New record'));
  for (const field of [...common, ...catalog[table][1]]) {
    const label = el('label', field.label);
    let input;
    if (field.type === 'select' || field.type === 'link') {
      input = el('select');
      if (field.type === 'select') for (const value of field.values) input.add(option(value, value));
      else {
        input.add(option('', 'Select a record'));
        for (const item of content[field.values])
          input.add(option(item.id, item.code + ' · ' + item.title));
      }
    } else if (['textarea', 'path'].includes(field.type)) input = el('textarea');
    else {
      input = el('input');
      input.type = ['file', 'number', 'datetime-local', 'checkbox'].includes(field.type)
        ? field.type
        : field.type === 'integer'
          ? 'number'
          : 'text';
      if (field.type === 'number') input.step = 'any';
      if (field.type === 'file') input.accept = '.glb,.png,.jpg,.jpeg,.webp,.ktx2';
    }
    input.name = field.key;
    input.required = field.type !== 'checkbox' && !(field.type === 'file' && row?.object_path);
    if (field.key === 'code') input.maxLength = 100;
    if (field.key === 'title') input.maxLength = 160;
    if (field.key === 'source_ref') input.maxLength = 500;
    if (field.key === 'evidence' && salesTables.includes(table)) {
      input.value = 'verified';
      input.disabled = true;
    }
    if (row && row[field.key] != null) {
      const value = row[field.key];
      if (field.type === 'checkbox') input.checked = value;
      else if (['vector', 'path'].includes(field.type)) input.value = JSON.stringify(value);
      else if (field.type === 'datetime-local') {
        const date = new Date(value);
        input.value = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
      } else if (field.type !== 'file') input.value = value;
    }
    label.append(input);
    form.append(label);
    if (!store.canEdit()) input.disabled = true;
    if (field.type === 'file' && row?.object_path)
      form.append(
        action('Download current asset', async () => {
          const url = await store.openAsset(row.object_path),
            link = el('a');
          link.href = url;
          link.download = row.object_path.split('/').pop();
          link.click();
          if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 30000);
        }),
      );
  }
  if (store.canEdit()) {
    const save = el('button', 'Save draft');
    save.type = 'submit';
    form.append(save);
    if (row) {
      const del = action('Delete record', async () => {
        if (
          !confirm(
            'Delete ' +
              row.title +
              ' from the editable draft? Existing previews retain their snapshots.',
          )
        )
          return;
        await store.deleteRow(table, row, content);
        content = await store.getContent();
        renderList();
        status('Record deleted.');
      });
      del.className = 'danger';
      form.append(del);
    }
  }
}
async function uploadData(file) {
  const ext = file.name
      .split('.')
      .pop()
      .toLowerCase()
      .replace(/^jpeg$/, 'jpg'),
    mime = mimes[ext];
  if (!mime || file.size === 0 || file.size > 32 * 1024 * 1024)
    throw Error('Choose a supported file between 1 byte and 32 MiB.');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer()),
    signature = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  const valid = {
    glb: signature.startsWith('676c544602000000'),
    jpg: signature.startsWith('ffd8ff'),
    png: signature.startsWith('89504e470d0a1a0a'),
    ktx2: signature.startsWith('ab4b5458203230bb0d0a1a0a'),
    webp: signature.startsWith('52494646') && signature.slice(16) === '57454250',
  };
  if (!valid[ext]) throw Error('File contents do not match the selected format.');
  if (ext === 'glb') {
    const header = new DataView(await file.slice(0, 20).arrayBuffer());
    const jsonLength = header.getUint32(12, true);
    if (
      header.getUint32(8, true) !== file.size ||
      header.getUint32(16, true) !== 0x4e4f534a ||
      jsonLength > file.size - 20
    )
      throw Error('Invalid GLB header.');
    let document;
    try {
      document = JSON.parse(await file.slice(20, 20 + jsonLength).text());
    } catch {
      throw Error('Invalid GLB scene document.');
    }
    if (
      [...(document.buffers || []), ...(document.images || [])].some(
        (x) => x.uri && !x.uri.startsWith('data:'),
      )
    )
      throw Error('Embed all textures and buffers before uploading the GLB.');
  }
  return {
    blob: file,
    mime,
    path:
      (studioConfig.projectId || '00000000-0000-4000-8000-000000000001') +
      '/' +
      crypto.randomUUID() +
      '.' +
      ext,
  };
}
let saving = false;
$('editor').onsubmit = guard(async (event) => {
  event.preventDefault();
  if (saving) return;
  saving = true;
  const form = event.currentTarget;
  try {
    const row = { id: current?.id || crypto.randomUUID() };
    let upload;
    for (const f of [...common, ...catalog[table][1]]) {
      const input = form.elements[f.key];
      let value = input.value.trim();
      if (f.type === 'file') {
        upload = input.files[0] ? await uploadData(input.files[0]) : null;
        value = upload?.path || current?.object_path;
      }
      if (['number', 'integer'].includes(f.type)) value = Number(value);
      if (f.type === 'checkbox') value = input.checked;
      if (['vector', 'path'].includes(f.type)) {
        try {
          value = JSON.parse(value);
        } catch {
          throw Error('Enter valid coordinate arrays.');
        }
      }
      if (f.type === 'datetime-local') value = new Date(value).toISOString();
      row[f.key] = value;
    }
    validateRecord(table, row, content);
    await store.saveRow(table, row, current, upload);
    content = await store.getContent();
    renderList(row.id);
    status('Draft saved.');
  } finally {
    saving = false;
  }
});
$('freeze').onclick = guard(async () => {
  await store.createPreview();
  await renderVersions();
  status('Preview created from the current draft.');
});
async function renderVersions() {
  $('freeze').hidden = !store.canEdit();
  const box = $('versions');
  box.replaceChildren();
  if (!store.connected)
    box.append(
      el(
        'p',
        'Previews open on this browser. Connect an authorized publisher account to release changes to buyers.',
      ),
    );
  const versions = await store.versions();
  if (!versions.length) box.append(el('p', 'No previews yet.'));
  for (const v of versions) {
    const card = el('article');
    card.append(el('h3', new Date(v.created_at).toLocaleString()), el('small', v.state + ' · ' + v.id));
    card.append(
      action('Open buyer preview', async () => {
        const full = await store.getVersion(v.id);
        sessionStorage.setItem('brigade.preview.' + v.id, JSON.stringify(full));
        location.assign('../?studio-preview=' + encodeURIComponent(v.id));
      }),
    );
    const details = el('details'),
      summary = el('summary', 'Review frozen content');
    details.append(summary);
    card.append(details);
    details.ontoggle = guard(async () => {
      if (details.open && !details.querySelector('pre')) {
        const full = await store.getVersion(v.id);
        details.append(el('pre', JSON.stringify(full.manifest, null, 2)));
      }
    });
    if (store.canPublish() && v.state === 'preview') {
      const label = el('label'),
        check = el('input');
      check.type = 'checkbox';
      label.append(
        check,
        'I have reviewed the sources, assets, sales facts and illustrative labels in this preview.',
      );
      const publish = action('Approve and publish', async () => {
        if (!check.checked) return;
        await store.approve(v.id);
        await renderVersions();
        status('Approved release published.');
      });
      publish.disabled = true;
      check.onchange = () => {
        publish.disabled = !check.checked;
      };
      card.append(label, publish);
    }
    box.append(card);
  }
}
async function renderActivity() {
  const box = $('reports');
  box.replaceChildren();
  if (!store.connected) {
    box.append(
      el(
        'p',
        'Connect a sales or publisher account to review enquiries and consented visitor activity.',
      ),
    );
    return;
  }
  if (!['sales', 'publisher'].includes(store.role)) {
    box.append(el('p', 'Sales activity is available to sales and publisher accounts.'));
    return;
  }
  const { counts, enquiries } = await store.activity();
  box.append(el('h3', 'Visitor activity · last 30 days'));
  const metrics = el('div');
  metrics.className = 'metrics';
  for (const event of [
    'tower_select',
    'apartment_view',
    'room_view',
    'tour_complete',
    'compare',
    'enquiry_conversion',
  ]) {
    const item = el('p', event.replaceAll('_', ' '));
    item.append(el('strong', counts.find((x) => x.event === event)?.total || 0));
    metrics.append(item);
  }
  box.append(metrics, el('h3', 'Recent enquiries'));
  if (!enquiries.length) box.append(el('p', 'No enquiries received.'));
  for (const row of enquiries) {
    const card = el('article');
    card.append(
      el('h3', row.name),
      el('small', new Date(row.created_at).toLocaleString()),
      el('p', row.email),
      el('p', row.message),
    );
    box.append(card);
  }
}
start().catch((error) => status(error.message));
