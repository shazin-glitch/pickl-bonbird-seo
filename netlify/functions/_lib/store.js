// netlify/functions/_lib/store.js
// Shared data layer for the approval system. Reuses the existing 'seo-tool'
// Blobs store (same one used by db-get/db-save/gsc-data) so everything stays
// in one place. CommonJS to match the rest of the codebase.
//
// Logical keys added to the 'seo-tool' store:
//   approvals:index               -> array of approval item ids, newest first
//   approvals:item:<id>           -> single approval item (JSON)
//   audit:log                     -> array of audit events, newest first (capped at 1000)
//   scheduler:lastrun:<jobName>   -> ISO timestamp of last successful run
//   wp:credentials                -> { pickl: {...}, bonbird: {...} } (set via UI)
//   notify:config                 -> { slackWebhook, emailTo, emailFrom, resendKey }
//   reviews:cache                 -> last fetched reviews by brand (placeholder mode)

const { getStore } = require('@netlify/blobs');

function store() {
  return getStore({
    name: 'seo-tool',
    consistency: 'strong',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_AUTH_TOKEN
  });
}

// ---- ID generation ---------------------------------------------------------

function newId(prefix) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix || 'itm'}_${ts}_${rand}`;
}

// ---- Approval queue --------------------------------------------------------
// Item shape:
// {
//   id, type, brand, status, createdAt, updatedAt, actor,
//   title,                 // short label shown in the queue
//   reason,                // why Claude queued this
//   payload,               // type-specific data (the thing to push)
//   originalPayload,       // pre-edit payload, used for diff view
//   parentId,              // null, or id of the rejected item this rewrites
//   rejectionFeedback,     // null, or the feedback that triggered rewrite
//   history,               // [ { at, actor, action, note } ]
//   pushResult             // null, or { ok, ref, message, at }
// }
//
// type: "blog_draft" | "meta_update" | "onpage_suggestion" | "review_response" | "schema_update"
// status: "pending" | "approved" | "rejected" | "pushed" | "failed"

const KEY_INDEX = 'approvals:index';
const KEY_ITEM = id => `approvals:item:${id}`;
const KEY_AUDIT = 'audit:log';

async function getIndex() {
  const s = store();
  return (await s.get(KEY_INDEX, { type: 'json' })) || [];
}

async function setIndex(ids) {
  await store().setJSON(KEY_INDEX, ids);
}

async function listApprovals(filter) {
  filter = filter || {};
  const s = store();
  const ids = await getIndex();
  const items = await Promise.all(
    ids.map(id => s.get(KEY_ITEM(id), { type: 'json' }).catch(() => null))
  );
  let out = items.filter(Boolean);
  if (filter.status) out = out.filter(i => i.status === filter.status);
  if (filter.brand) out = out.filter(i => i.brand === filter.brand);
  if (filter.type) out = out.filter(i => i.type === filter.type);
  if (filter.limit) out = out.slice(0, filter.limit);
  return out;
}

async function getApproval(id) {
  return store().get(KEY_ITEM(id), { type: 'json' });
}

async function createApproval(input) {
  const s = store();
  const id = newId('itm');
  const now = Date.now();
  const item = {
    id,
    type: input.type,
    brand: input.brand, // 'pickl' | 'bonbird'
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    actor: input.actor || 'claude',
    title: input.title || '',
    reason: input.reason || '',
    payload: input.payload || {},
    originalPayload: input.payload || {},
    parentId: input.parentId || null,
    rejectionFeedback: input.rejectionFeedback || null,
    history: [{
      at: now,
      actor: input.actor || 'claude',
      action: 'queued',
      note: input.reason || ''
    }],
    pushResult: null
  };
  await s.setJSON(KEY_ITEM(id), item);
  // newest first
  const idx = await getIndex();
  idx.unshift(id);
  // cap the index at 500 to keep things sane
  if (idx.length > 500) idx.length = 500;
  await setIndex(idx);
  await logAudit({
    at: now,
    actor: item.actor,
    action: 'queued',
    target: id,
    type: item.type,
    brand: item.brand,
    note: item.title || item.reason || ''
  });
  return item;
}

async function updateApproval(id, patch, historyEntry) {
  const s = store();
  const existing = await s.get(KEY_ITEM(id), { type: 'json' });
  if (!existing) throw new Error('approval not found: ' + id);
  const updated = Object.assign({}, existing, patch, {
    updatedAt: Date.now()
  });
  if (historyEntry) {
    updated.history = (existing.history || []).concat([historyEntry]);
  }
  await s.setJSON(KEY_ITEM(id), updated);
  if (historyEntry) {
    await logAudit({
      at: historyEntry.at || Date.now(),
      actor: historyEntry.actor,
      action: historyEntry.action,
      target: id,
      type: updated.type,
      brand: updated.brand,
      note: historyEntry.note || ''
    });
  }
  return updated;
}

async function deleteApproval(id) {
  const s = store();
  await s.delete(KEY_ITEM(id));
  const idx = await getIndex();
  await setIndex(idx.filter(x => x !== id));
}

// ---- Audit log -------------------------------------------------------------

async function logAudit(event) {
  const s = store();
  const log = (await s.get(KEY_AUDIT, { type: 'json' })) || [];
  log.unshift(event);
  if (log.length > 1000) log.length = 1000;
  await s.setJSON(KEY_AUDIT, log);
}

async function getAudit(filter) {
  filter = filter || {};
  const s = store();
  const log = (await s.get(KEY_AUDIT, { type: 'json' })) || [];
  let out = log;
  if (filter.target) out = out.filter(e => e.target === filter.target);
  if (filter.actor) out = out.filter(e => e.actor === filter.actor);
  if (filter.brand) out = out.filter(e => e.brand === filter.brand);
  if (filter.limit) out = out.slice(0, filter.limit);
  return out;
}

// ---- Settings helpers ------------------------------------------------------

async function getSetting(key, fallback) {
  const v = await store().get(key, { type: 'json' }).catch(() => null);
  return v == null ? fallback : v;
}

async function setSetting(key, value) {
  await store().setJSON(key, value);
}

// ---- Server-side Claude call ----------------------------------------------
// Functions need to call Claude server-to-server. We can't go through the
// /api/claude proxy from inside another function — that adds a network hop
// and the proxy is designed for browser CORS, not internal use. So we call
// Anthropic directly here, using the same env var.

async function callClaude(prompt, opts) {
  opts = opts || {};
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: opts.model || 'claude-sonnet-4-20250514',
      max_tokens: opts.max_tokens || 2000,
      system: opts.system,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Anthropic ${res.status}`);
  }
  const text = (data.content || []).map(b => b.text || '').join('');
  return { text, raw: data };
}

// Try to extract a JSON object from a Claude response that may have prose
// wrapped around it. Returns null if nothing parseable is found.
function extractJson(text) {
  if (!text) return null;
  // Try fenced code block first
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  // Find the first { ... } or [ ... ] balanced span
  const trimmed = candidate.trim();
  try { return JSON.parse(trimmed); } catch (_) {}
  // Fallback: find first { and last }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)); } catch (_) {}
  }
  const fa = trimmed.indexOf('[');
  const la = trimmed.lastIndexOf(']');
  if (fa !== -1 && la !== -1 && la > fa) {
    try { return JSON.parse(trimmed.slice(fa, la + 1)); } catch (_) {}
  }
  return null;
}

// ---- Standard HTTP helpers -------------------------------------------------

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function ok(body, extraHeaders) {
  return {
    statusCode: 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, CORS, extraHeaders || {}),
    body: JSON.stringify(body)
  };
}

function bad(status, message) {
  return {
    statusCode: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, CORS),
    body: JSON.stringify({ error: message })
  };
}

function preflight() {
  return { statusCode: 200, headers: CORS, body: '' };
}

function parseBody(event) {
  if (!event.body) return {};
  try { return JSON.parse(event.body); } catch (_) { return null; }
}

module.exports = {
  store,
  newId,
  // queue
  listApprovals,
  getApproval,
  createApproval,
  updateApproval,
  deleteApproval,
  // audit
  logAudit,
  getAudit,
  // settings
  getSetting,
  setSetting,
  // claude
  callClaude,
  extractJson,
  // http
  ok,
  bad,
  preflight,
  parseBody,
  CORS
};
