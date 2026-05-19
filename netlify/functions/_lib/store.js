// netlify/functions/_lib/store.js
// Shared helpers used by approvals.js, scheduler.js, reviews.js.
// All state lives in the existing 'seo-tool' Blobs store under namespaced keys.

const { getStore } = require('@netlify/blobs');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function store() {
  return getStore({
    name: 'seo-tool',
    consistency: 'strong',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_AUTH_TOKEN,
  });
}

function newId(prefix) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix || 'itm'}_${ts}_${rand}`;
}

// ── Approval queue ───────────────────────────────────────────────
const KEY_INDEX = 'approvals:index';
const KEY_ITEM  = id => `approvals:item:${id}`;
const KEY_AUDIT = 'audit:log';

async function getIndex() {
  return (await store().get(KEY_INDEX, { type: 'json' }).catch(() => null)) || [];
}
async function setIndex(ids) { await store().setJSON(KEY_INDEX, ids); }

async function listApprovals(filter) {
  filter = filter || {};
  const s = store();
  const ids = await getIndex();
  const items = await Promise.all(ids.map(id => s.get(KEY_ITEM(id), { type: 'json' }).catch(() => null)));
  let out = items.filter(Boolean);
  if (filter.status) out = out.filter(i => i.status === filter.status);
  if (filter.brand)  out = out.filter(i => i.brand  === filter.brand);
  if (filter.type)   out = out.filter(i => i.type   === filter.type);
  if (filter.limit)  out = out.slice(0, filter.limit);
  return out;
}

async function getApproval(id) {
  return store().get(KEY_ITEM(id), { type: 'json' }).catch(() => null);
}

async function createApproval(input) {
  const s = store();
  const id  = newId('itm');
  const now = Date.now();
  const item = {
    id, status: 'pending', createdAt: now, updatedAt: now,
    type:    input.type,
    brand:   input.brand,
    title:   input.title   || '',
    reason:  input.reason  || '',
    actor:   input.actor   || 'claude',
    payload: input.payload || {},
    originalPayload: input.payload || {},
    parentId: input.parentId || null,
    rejectionFeedback: input.rejectionFeedback || null,
    history: [{ at: now, actor: input.actor || 'claude', action: 'queued', note: input.reason || '' }],
    pushResult: null,
    // Location + language tags — always present for filtering
    locationTag: input.locationTag || input.payload?.locationTag || '🇦🇪 UAE',
    languageTag: input.languageTag || input.payload?.languageTag || 'EN',
  };
  await s.setJSON(KEY_ITEM(id), item);
  const idx = await getIndex();
  idx.unshift(id);
  if (idx.length > 500) idx.length = 500;
  await setIndex(idx);
  await logAudit({ at: now, actor: item.actor, action: 'queued', target: id, type: item.type, brand: item.brand, note: item.title });
  return item;
}

async function updateApproval(id, patch, histEvent) {
  const s = store();
  const existing = await s.get(KEY_ITEM(id), { type: 'json' });
  if (!existing) throw new Error('approval not found: ' + id);
  const updated = Object.assign({}, existing, patch, { updatedAt: Date.now() });
  if (histEvent) updated.history = (existing.history || []).concat([histEvent]);
  await s.setJSON(KEY_ITEM(id), updated);
  if (histEvent) await logAudit({ at: histEvent.at || Date.now(), actor: histEvent.actor, action: histEvent.action, target: id, type: updated.type, brand: updated.brand, note: histEvent.note || '' });
  return updated;
}

async function deleteApproval(id) {
  await store().delete(KEY_ITEM(id)).catch(() => null);
  const idx = await getIndex();
  await setIndex(idx.filter(x => x !== id));
}

// ── Audit log ────────────────────────────────────────────────────
async function logAudit(event) {
  const s = store();
  const log = (await s.get(KEY_AUDIT, { type: 'json' }).catch(() => null)) || [];
  log.unshift(event);
  if (log.length > 1000) log.length = 1000;
  await s.setJSON(KEY_AUDIT, log);
}

async function getAudit(filter) {
  filter = filter || {};
  const log = (await store().get(KEY_AUDIT, { type: 'json' }).catch(() => null)) || [];
  let out = log;
  if (filter.target) out = out.filter(e => e.target === filter.target);
  if (filter.actor)  out = out.filter(e => e.actor  === filter.actor);
  if (filter.brand)  out = out.filter(e => e.brand  === filter.brand);
  if (filter.limit)  out = out.slice(0, filter.limit);
  return out;
}

// ── Settings ─────────────────────────────────────────────────────
async function getSetting(key, fallback) {
  const v = await store().get(key, { type: 'json' }).catch(() => null);
  return v == null ? fallback : v;
}
async function setSetting(key, value) { await store().setJSON(key, value); }

// ── Server-side Claude caller ────────────────────────────────────
async function callClaude(prompt, opts) {
  opts = opts || {};
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: opts.model || 'claude-sonnet-4-20250514',
      max_tokens: opts.max_tokens || 2000,
      system: opts.system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Anthropic ${res.status}`);
  return { text: (data.content || []).map(b => b.text || '').join(''), raw: data };
}

function extractJson(text) {
  if (!text) return null;
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch (_) {}
  const fi = s.indexOf('{'), li = s.lastIndexOf('}');
  if (fi !== -1 && li > fi) { try { return JSON.parse(s.slice(fi, li + 1)); } catch (_) {} }
  const fa = s.indexOf('['), la = s.lastIndexOf(']');
  if (fa !== -1 && la > fa) { try { return JSON.parse(s.slice(fa, la + 1)); } catch (_) {} }
  return null;
}

// ── HTTP helpers ─────────────────────────────────────────────────
function ok(body) {
  return { statusCode: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS), body: JSON.stringify(body) };
}
function bad(status, message) {
  return { statusCode: status, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS), body: JSON.stringify({ error: message }) };
}
function preflight() { return { statusCode: 200, headers: CORS, body: '' }; }
function parseBody(event) {
  try { return event.body ? JSON.parse(event.body) : {}; } catch (_) { return null; }
}

module.exports = {
  store, newId,
  listApprovals, getApproval, createApproval, updateApproval, deleteApproval,
  logAudit, getAudit,
  getSetting, setSetting,
  callClaude, extractJson,
  ok, bad, preflight, parseBody, CORS,
};

// ── GSC fetch — cache-first, live API fallback ───────────────────
// Reads from Blobs cache (written by gsc-data.js when the Analytics tab loads).
// Falls back to live GSC API only if cache is missing or older than 24 hours.
// This keeps scheduler runs fast — no 25s API call on every trigger.
async function fetchGscDirect(siteUrl) {
  const s = store();
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  // Try cache first
  try {
    const cached = await s.get('gscCache:' + siteUrl, { type: 'json' });
    if (cached && cached.rows && cached.cachedAt && (Date.now() - cached.cachedAt) < CACHE_TTL) {
      console.log('GSC cache hit for', siteUrl, '—', cached.rows.length, 'rows, age', Math.round((Date.now()-cached.cachedAt)/60000), 'min');
      return cached.rows;
    }
  } catch (_) {}

  console.log('GSC cache miss for', siteUrl, '— fetching live');

  // Cache miss — fetch live
  const gscTokens = await s.get('gscTokens', { type: 'json' }).catch(() => null);
  if (!gscTokens || !gscTokens.access_token) {
    throw new Error('GSC not connected — open the Analytics tab first to populate the cache');
  }

  let token = gscTokens.access_token;

  // Refresh token if needed
  if (gscTokens.refresh_token && gscTokens.expires_at && Date.now() > gscTokens.expires_at - 60000) {
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: gscTokens.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    const refreshData = await refreshRes.json();
    if (refreshData.access_token) {
      token = refreshData.access_token;
      await s.setJSON('gscTokens', {
        ...gscTokens,
        access_token: token,
        expires_at: Date.now() + (refreshData.expires_in || 3600) * 1000,
      });
    }
  }

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);
  const fmt = d => d.toISOString().split('T')[0];

  const gscRes = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        dimensions: ['query'],
        rowLimit: 500,
        dataState: 'final',
      }),
    }
  );

  const gscData = await gscRes.json();
  if (gscData.error) throw new Error(gscData.error.message || 'GSC API error');

  const rows = (gscData.rows || []).map(row => ({
    keyword:     row.keys[0],
    clicks:      row.clicks,
    impressions: row.impressions,
    ctr:         Math.round(row.ctr * 1000) / 10,
    position:    Math.round(row.position * 10) / 10,
  }));

  // Write to cache for next scheduler run
  await s.setJSON('gscCache:' + siteUrl, { rows, cachedAt: Date.now() }).catch(() => null);
  return rows;
}

module.exports = Object.assign(module.exports, { fetchGscDirect });
