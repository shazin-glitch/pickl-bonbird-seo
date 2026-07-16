// netlify/functions/_lib/store.js
// Shared helpers used by approvals.js, scheduler.js, reviews.js.
// All state lives in the existing 'seo-tool' Blobs store under namespaced keys.

const { getStore } = require('@netlify/blobs');
const queue = require('./queue'); // single queue implementation (P1.0) — these fns delegate

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

// Queue functions delegate to the single implementation in _lib/queue.js (P1.0).
// Names/signatures preserved so the 6 background generators that import these keep working.
async function getIndex()            { return queue.getIndex(); }
async function setIndex(ids)         { return queue.setIndex(ids); }
async function listApprovals(filter) { return queue.list(filter); }
async function getApproval(id)       { return queue.get(id); }
async function createApproval(input) { return queue.create(input); }
async function updateApproval(id, patch, histEvent) { return queue.update(id, patch, histEvent); }
async function deleteApproval(id)    { return queue.remove(id); }
async function logAudit(event)       { return queue.addAudit(event); }
async function getAudit(filter)      { return queue.getAudit(filter); }

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
      model: opts.model || 'claude-sonnet-4-6',
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
    ctr:         row.ctr,  // decimal 0-1 — display code multiplies by 100
    position:    Math.round(row.position * 10) / 10,
  }));

  // Write to cache for next scheduler run
  await s.setJSON('gscCache:' + siteUrl, { rows, cachedAt: Date.now() }).catch(() => null);
  return rows;
}

module.exports = Object.assign(module.exports, { fetchGscDirect });

// ── fetchGscWithPages ─────────────────────────────────────────────────────────
// Same as fetchGscDirect but uses dimensions: ['query', 'page'] so every row
// includes the actual URL Google is serving for that keyword.
// Used by runMetaRewrites so it works with real page URLs instead of having
// Claude guess them (which caused empty-page meta updates).
// Cached separately under gscPageCache:<siteUrl> with same 24hr TTL.
async function fetchGscWithPages(siteUrl) {
  const s = store();
  const CACHE_TTL = 24 * 60 * 60 * 1000;
  const cacheKey  = 'gscPageCache:' + siteUrl;

  try {
    const cached = await s.get(cacheKey, { type: 'json' });
    if (cached && cached.rows && cached.cachedAt && (Date.now() - cached.cachedAt) < CACHE_TTL) {
      console.log('GSC page cache hit for', siteUrl, '—', cached.rows.length, 'rows');
      return cached.rows;
    }
  } catch (_) {}

  // Cache miss — fetch live (token refresh identical to fetchGscDirect)
  const gscTokens = await s.get('gscTokens', { type: 'json' }).catch(() => null);
  if (!gscTokens || !gscTokens.access_token) {
    throw new Error('GSC not connected');
  }

  let token = gscTokens.access_token;
  if (gscTokens.refresh_token && gscTokens.expires_at && Date.now() > gscTokens.expires_at - 60000) {
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: gscTokens.refresh_token,
        grant_type:    'refresh_token',
      }),
    });
    const rd = await refreshRes.json();
    if (rd.access_token) {
      token = rd.access_token;
      await s.setJSON('gscTokens', { ...gscTokens, access_token: token, expires_at: Date.now() + (rd.expires_in || 3600) * 1000 });
    }
  }

  const endDate   = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);
  const fmt = d => d.toISOString().split('T')[0];

  const gscRes = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({
        startDate:  fmt(startDate),
        endDate:    fmt(endDate),
        dimensions: ['query', 'page'],   // ← gives us real page URLs
        rowLimit:   1000,
        dataState:  'final',
      }),
    }
  );

  const gscData = await gscRes.json();
  if (gscData.error) throw new Error(gscData.error.message || 'GSC API error');

  const rows = (gscData.rows || []).map(row => ({
    keyword:     row.keys[0],
    page:        row.keys[1],   // actual URL Google is ranking for this keyword
    clicks:      row.clicks,
    impressions: row.impressions,
    ctr:         row.ctr,  // decimal 0-1 — display code multiplies by 100
    position:    Math.round(row.position * 10) / 10,
  }));

  await s.setJSON(cacheKey, { rows, cachedAt: Date.now() }).catch(() => null);
  return rows;
}

module.exports = Object.assign(module.exports, { fetchGscWithPages });
