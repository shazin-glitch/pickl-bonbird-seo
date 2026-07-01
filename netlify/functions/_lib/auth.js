// netlify/functions/_lib/auth.js
// Shared authorization for mutating endpoints. Two trust paths:
//   1. Session  — browser requests carry the `yolk_session` cookie (same mechanism
//      as auth-user.js): cookie token → userSession:<token> Blob → role.
//   2. Internal — function-to-function + cron calls carry an `x-nest-internal`
//      header derived from NETLIFY_AUTH_TOKEN. That env var is present in EVERY
//      function context, so there's no new env var to set and no deploy-ordering
//      break. These calls have no user session (e.g. approvals→wordpress,
//      scheduler→wordpress, international-seo→approvals, slack-callback→calendar).
//
// Usage in a handler (gate only mutations, never GETs):
//   const { authorize, denied } = require('./_lib/auth');
//   const auth = await authorize(event);
//   if (!auth.ok) return denied();
//   // auth.via === 'session' → auth.user = { email, name, role }
//   // auth.via === 'internal' → trusted service call, auth.user = null

const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const BOOTSTRAP_ADMINS = ['shazin@yolkbrands.com', 'steve@yolkbrands.com'];

function authStore() {
  return getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
}

// Shared secret for internal service calls. Derived from an always-present env var
// so caller and validator compute the same value with no extra configuration.
function internalToken() {
  const seed = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_SITE_ID || 'nest-fallback-seed';
  return crypto.createHash('sha256').update('nest-internal:' + seed).digest('hex');
}

// Spread into a fetch() headers object for function-to-function / cron calls.
function internalHeaders(extra = {}) {
  return { 'x-nest-internal': internalToken(), ...extra };
}

function isInternalCall(event) {
  const h = event.headers || {};
  const tok = h['x-nest-internal'] || h['X-Nest-Internal'];
  return typeof tok === 'string' && tok.length > 0 && tok === internalToken();
}

// Validate the browser session cookie. Returns { email, name, role } or null.
async function getSessionUser(event) {
  const cookie = (event.headers && (event.headers.cookie || event.headers.Cookie)) || '';
  const m = cookie.match(/yolk_session=([^;]+)/);
  const token = m && m[1];
  if (!token) return null;
  try {
    const s = authStore();
    const session = await s.get(`userSession:${token}`, { type: 'json' });
    if (!session || !session.expiresAt || session.expiresAt < Date.now()) return null;
    let role = 'viewer';
    if (BOOTSTRAP_ADMINS.includes(session.email)) {
      role = 'admin';
    } else {
      try { const r = await s.get(`userRole:${session.email}`, { type: 'json' }); role = (r && r.role) || 'viewer'; }
      catch { role = 'viewer'; }
    }
    return { email: session.email, name: session.name || session.email, role };
  } catch {
    return null;
  }
}

// Allows an internal/service call OR a valid session.
// Returns { ok, via: 'internal'|'session'|null, user }.
async function authorize(event) {
  if (isInternalCall(event)) return { ok: true, via: 'internal', user: null };
  const user = await getSessionUser(event);
  if (user) return { ok: true, via: 'session', user };
  return { ok: false, via: null, user: null };
}

// A Netlify SCHEDULED (cron) invocation is not an HTTP request — it has no
// httpMethod (an attacker hitting the public URL always has one, so this can't be
// forged). Netlify also includes a `next_run` marker in the body as a backup signal.
function isScheduledInvoke(event) {
  if (!event || !event.httpMethod) return true;
  const body = typeof event.body === 'string' ? event.body : '';
  return /"next_run"/.test(body);
}

// Gate for background/cron JOBS (expensive: Anthropic + DataForSEO spend).
// Allowed: platform cron, internal service calls (x-nest-internal), or a valid
// session. MIGRATION NOTE: on Google VM, point the cron/scheduler at these
// endpoints WITH the x-nest-internal header — then the (Netlify-only) scheduled
// branch is unused and this gate is fully token-secured. Do not remove the header.
async function authorizeJob(event) {
  if (isScheduledInvoke(event)) return { ok: true, via: 'scheduled', user: null };
  if (isInternalCall(event))    return { ok: true, via: 'internal',  user: null };
  const user = await getSessionUser(event);
  if (user) return { ok: true, via: 'session', user };
  return { ok: false, via: null, user: null };
}

function denied(message) {
  return {
    statusCode: 401,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ error: message || 'Not authenticated — sign in to The Nest.' }),
  };
}

module.exports = { authorize, authorizeJob, isScheduledInvoke, getSessionUser, isInternalCall, internalToken, internalHeaders, denied, BOOTSTRAP_ADMINS };
