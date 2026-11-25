import { studioConfig as config } from './studio-config.js';

const preview = new URLSearchParams(location.search).get('studio-preview');
const consentKey = 'brigade.analytics.' + config.projectId;
const visitorKey = 'brigade.visitor.' + config.projectId;
export const salesConnected = () =>
  Boolean(config.url && config.publishableKey && config.projectId && !preview);
const read = (store, key) => {
  try {
    return JSON.parse(store.getItem(key));
  } catch {
    return null;
  }
};
export const analyticsEnabled = () => salesConnected() && read(localStorage, consentKey) === true;

export async function request(path, { token, method = 'GET', body, headers = {} } = {}) {
  const base = new URL(config.url);
  if (base.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
    throw Error('Configure HTTPS for this project.');
  }
  const apiHeaders = { apikey: config.publishableKey, ...headers };
  if (token) apiHeaders.Authorization = 'Bearer ' + token;
  if (path.startsWith('/rest/')) {
    apiHeaders['Accept-Profile'] = 'brigade';
    apiHeaders['Content-Profile'] = 'brigade';
  }
  if (body !== undefined && !(body instanceof Blob)) apiHeaders['Content-Type'] = 'application/json';
  const response = await fetch(new URL(path, base), {
    method,
    headers: apiHeaders,
    body: body instanceof Blob ? body : JSON.stringify(body),
    cache: 'no-store',
  });
  const raw = await response.text();
  let result;
  try {
    result = raw ? JSON.parse(raw) : null;
  } catch {
    result = null;
  }
  if (!response.ok)
    throw Error(
      result?.message ||
        result?.msg ||
        result?.error_description ||
        'Request failed (' + response.status + ')',
    );
  return result;
}
const rpc = (name, body, token) =>
  request('/rest/v1/rpc/' + name, {
    method: 'POST',
    body: { p_project: config.projectId, ...body },
    token,
  });

export async function loadPublication() {
  if (preview) return read(sessionStorage, 'brigade.preview.' + preview);
  return salesConnected() ? rpc('current_release', {}) : null;
}
let pendingVisitor;
async function visitor() {
  if (!pendingVisitor)
    pendingVisitor = (async () => {
      const old = read(localStorage, visitorKey);
      if (old?.expires_at > Date.now() / 1000 + 60) return old.access_token;
      const auth = old?.refresh_token
        ? await request('/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            body: { refresh_token: old.refresh_token },
          })
        : await request('/auth/v1/signup', { method: 'POST', body: { data: {} } });
      if (!auth.access_token) throw Error('Visitor sign-in is unavailable.');
      localStorage.setItem(visitorKey, JSON.stringify(auth));
      return auth.access_token;
    })().finally(() => {
      pendingVisitor = null;
    });
  return pendingVisitor;
}
export async function setAnalyticsConsent(granted) {
  if (!salesConnected()) return false;
  if (!granted) localStorage.removeItem(consentKey);
  const token = await visitor();
  await rpc('analytics_consent', { p_granted: Boolean(granted) }, token);
  if (granted) localStorage.setItem(consentKey, 'true');
  return Boolean(granted);
}
export async function trackExperience(event, subject = '') {
  if (!analyticsEnabled()) return;
  // An analytics outage must never interrupt camera movement or browsing.
  try {
    await rpc(
      'track_experience',
      { p_event: event, p_subject: String(subject).slice(0, 100) },
      await visitor(),
    );
  } catch (error) {
    console.debug('Engagement event unavailable.', error.message);
  }
}
let enquiryAttempt;
export async function submitEnquiry({ name, email, message, consent }) {
  if (!salesConnected()) throw Error('Sales service is unconfigured.');
  if (consent !== true) throw Error('Contact consent is required.');
  const fields = JSON.stringify([name, email, message]);
  if (enquiryAttempt?.fields !== fields) enquiryAttempt = { fields, id: crypto.randomUUID() };
  const result = await rpc(
    'submit_enquiry',
    { p_request: enquiryAttempt.id, p_name: name, p_email: email, p_message: message, p_consent: true },
    await visitor(),
  );
  enquiryAttempt = null;
  return result;
}
export async function publishedAssetUrl(path, token) {
  const result = await request(
    '/storage/v1/object/sign/brigade-studio-assets/' + path.split('/').map(encodeURIComponent).join('/'),
    { method: 'POST', body: { expiresIn: 300 }, token },
  );
  return new URL('/storage/v1' + result.signedURL, config.url).href;
}
