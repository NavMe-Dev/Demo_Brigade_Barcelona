import { studioConfig as config } from '../studio-config.js';
import { request } from '../sales.js';
import { catalog, blankManifest, seedDraft } from './catalog.js';

export const connected = Boolean(config.url && config.projectId && config.publishableKey);
const authKey = 'brigade.staff.' + config.projectId;
let session;
try {
  session = JSON.parse(sessionStorage.getItem(authKey));
} catch {}
export const loggedIn = () => Boolean(session);
export let role = '';
export const canEdit = () => !connected || ['editor', 'publisher'].includes(role);
export const canPublish = () => connected && role === 'publisher';
export async function login(email, password) {
  session = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
  sessionStorage.setItem(authKey, JSON.stringify(session));
}
let refreshing;
async function token() {
  if (!session) throw Error('Sign in to the studio.');
  if (session.expires_at < Date.now() / 1000 + 60) {
    refreshing ??= request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh_token },
    })
      .then((next) => {
        session = next;
        sessionStorage.setItem(authKey, JSON.stringify(next));
      })
      .finally(() => {
        refreshing = null;
      });
    await refreshing;
  }
  return session.access_token;
}
export async function logout() {
  try {
    if (session) await request('/auth/v1/logout?scope=local', { method: 'POST', token: await token() });
  } finally {
    session = null;
    sessionStorage.removeItem(authKey);
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith('brigade.preview.')) sessionStorage.removeItem(key);
  }
}
const call = async (path, opts = {}) => request('/rest/v1/' + path, { ...opts, token: await token() });
const filter = 'project_id=eq.' + encodeURIComponent(config.projectId);
async function all(table) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const part = await call(table + '?' + filter + '&order=id&limit=500&offset=' + offset);
    rows.push(...part);
    if (part.length < 500) return rows;
  }
}
let dbPromise;
function database() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('brigade-private-authoring', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('workspace');
      req.result.createObjectStore('files');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function readStore(store, key) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
let local;
async function changeLocal(change, file) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['workspace', 'files'], 'readwrite'),
      ws = tx.objectStore('workspace'),
      req = ws.get('draft');
    let result;
    req.onsuccess = () => {
      const current = req.result || local;
      try {
        if (local.revision !== current.revision)
          throw Error('Another tab changed this draft. Reload before saving.');
        result = structuredClone(current);
        change(result);
        result.revision += 1;
        ws.put(result, 'draft');
        if (file) tx.objectStore('files').put(file.blob, file.path);
      } catch (error) {
        tx.abort();
        reject(error);
      }
    };
    tx.oncomplete = () => {
      local = result;
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
export async function getContent() {
  if (!connected) {
    local = await readStore('workspace', 'draft');
    if (!local) {
      local = { manifest: await seedDraft(), versions: [], revision: 0 };
      await changeLocal(() => {});
    }
    return structuredClone(local.manifest);
  }
  const project = await call('projects?id=eq.' + config.projectId + '&select=org_id,title');
  if (!project.length) throw Error('Your account has no role on this project.');
  const membership = await call('memberships?org_id=eq.' + project[0].org_id + '&select=role');
  role = membership[0]?.role;
  const manifest = blankManifest();
  await Promise.all(
    Object.keys(catalog).map(async (table) => {
      manifest[table] = await all(table);
    }),
  );
  return manifest;
}
export async function saveRow(table, data, previous, file) {
  if (!connected) {
    await changeLocal((draft) => {
      const rows = draft.manifest[table],
        i = rows.findIndex((x) => x.id === data.id);
      if (i < 0) rows.push(data);
      else rows[i] = data;
    }, file);
    return;
  }
  if (file)
    await request('/storage/v1/object/brigade-studio-assets/' + file.path, {
      method: 'POST',
      body: file.blob,
      token: await token(),
      headers: { 'Content-Type': file.mime },
    });
  const path =
    table +
    (previous ? '?' + filter + '&id=eq.' + previous.id + '&revision=eq.' + previous.revision : '');
  try {
    const rows = await call(path, {
      method: previous ? 'PATCH' : 'POST',
      headers: { Prefer: 'return=representation' },
      body: { ...data, project_id: config.projectId },
    });
    if (!rows.length)
      throw Error('Record changed in another session. Reload to review the latest revision.');
  } catch (error) {
    // Storage RLS retains objects that a successful or simultaneous metadata write references.
    if (file)
      await request('/storage/v1/object/brigade-studio-assets', {
        method: 'DELETE',
        body: { prefixes: [file.path] },
        token: await token(),
      }).catch(() => {});
    throw error;
  }
}
export async function deleteRow(table, row, manifest) {
  if (!connected) {
    for (const [other, [, fields]] of Object.entries(catalog)) {
      if (
        fields.some(
          (f) =>
            f.type === 'link' && f.values === table && manifest[other].some((r) => r[f.key] === row.id),
        )
      )
        throw Error('Another record references this item. Update its references first.');
    }
    await changeLocal((draft) => {
      draft.manifest[table] = draft.manifest[table].filter((r) => r.id !== row.id);
    });
    return;
  }
  const deleted = await call(
    table + '?' + filter + '&id=eq.' + row.id + '&revision=eq.' + row.revision,
    { method: 'DELETE', headers: { Prefer: 'return=representation' } },
  );
  if (!deleted.length) throw Error('Record changed in another session. Reload before deleting.');
}
export async function createPreview() {
  if (!connected) {
    const version = {
      id: crypto.randomUUID(),
      state: 'preview',
      created_at: new Date().toISOString(),
      manifest: structuredClone(local.manifest),
    };
    await changeLocal((draft) => {
      draft.versions.unshift(version);
    });
    return version.id;
  }
  return call('rpc/create_preview', { method: 'POST', body: { p_project: config.projectId } });
}
export async function versions() {
  if (!connected) return local.versions.map(({ manifest, ...summary }) => summary);
  return call(
    'publication_versions?' +
      filter +
      '&select=id,created_at,state,published_at&order=created_at.desc&limit=25',
  );
}
export async function getVersion(id) {
  if (!connected) return local.versions.find((v) => v.id === id);
  return (await call('publication_versions?' + filter + '&id=eq.' + id))[0];
}
export async function approve(id) {
  if (!canPublish()) throw Error('Publisher permission is required.');
  return call('rpc/approve_and_publish', {
    method: 'POST',
    body: { p_project: config.projectId, p_version: id },
  });
}
export async function activity() {
  if (!connected) return { counts: [], enquiries: [] };
  const [counts, enquiries] = await Promise.all([
    call('rpc/engagement_summary', { method: 'POST', body: { p_project: config.projectId } }),
    call(
      'enquiries?' + filter + '&select=name,email,message,created_at&order=created_at.desc&limit=100',
    ),
  ]);
  return { counts, enquiries };
}
export async function openAsset(path) {
  if (!connected) {
    const blob = await readStore('files', path);
    if (!blob) throw Error('Local asset is missing.');
    return URL.createObjectURL(blob);
  }
  const { publishedAssetUrl } = await import('../sales.js');
  return publishedAssetUrl(path, await token());
}
