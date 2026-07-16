// netlify/functions/_lib/queue.js
// SINGLE source of truth for the approvals queue (P1.0 — pipeline unification).
// Previously the queue existed as TWO drifted copies — approvals.js (API path) and
// _lib/store.js createApproval (used by 6 background generators) — writing the SAME
// Blobs keys with divergent logic (root cause of BC1 index-truncation + BC3 race +
// BC5 dedup drift). This module is the one implementation; store.js and approvals.js
// both delegate to it. Behaviour is identical to the (post-BC1) approvals.js version.
//
// Keys (unchanged): approvals:index (id list, newest first) · approvals:item:<id> ·
// audit:log · brandFeedback:<brand>. Strong consistency (queue correctness > latency).
//
// NOTE (P1.1, later): the mutable approvals:index is still a read-modify-write race
// surface (BC3). The fix — deriving the list via store.list() prefix scan — is a
// SEPARATE verified step because it changes result ordering; not done here so P1.0
// stays strictly behaviour-preserving.

const { getStore } = require('@netlify/blobs');

const KEY_INDEX    = 'approvals:index';
const KEY_ITEM     = id => `approvals:item:${id}`;
const KEY_AUDIT    = 'audit:log';
const KEY_FEEDBACK = brand => `brandFeedback:${brand}`;

const PRUNE_CEILING = 2000;
const DEAD_STATUSES = new Set(['rejected', 'failed']);
const DEAD_MAX_AGE  = 30 * 24 * 60 * 60 * 1000; // dead items pruned after 30 days

function store() {
  return getStore({ name: 'seo-tool', consistency: 'strong', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
}

function newId(prefix) {
  return `${prefix || 'itm'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Index ─────────────────────────────────────────────────────────
async function getIndex() {
  return (await store().get(KEY_INDEX, { type: 'json' }).catch(() => null)) || [];
}
async function setIndex(ids) { await store().setJSON(KEY_INDEX, ids); }

// ── Items ─────────────────────────────────────────────────────────
async function get(id) { return store().get(KEY_ITEM(id), { type: 'json' }).catch(() => null); }
async function saveRaw(item) { await store().setJSON(KEY_ITEM(item.id), item); }

async function list(filter) {
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

async function create(input) {
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
    locationTag: input.locationTag || input.payload?.locationTag || '🇦🇪 UAE',
    languageTag: input.languageTag || input.payload?.languageTag || 'EN',
  };
  await saveRaw(item);

  // Index: newest first, prune dead (rejected/failed >30d), keep pushed/published/pending
  // forever so the dedup window never loses what's been published. NEVER hard-truncate.
  const idx = await getIndex();
  idx.unshift(id);
  const cutoff = now - DEAD_MAX_AGE;
  const s = store();
  const pruned = [];
  for (const eid of idx) {
    if (pruned.length >= PRUNE_CEILING) break;
    const existing = await s.get(KEY_ITEM(eid), { type: 'json' }).catch(() => null);
    if (!existing) continue;
    if (DEAD_STATUSES.has(existing.status) && existing.updatedAt < cutoff) {
      await s.delete(KEY_ITEM(eid)).catch(() => null);
      continue;
    }
    pruned.push(eid);
  }
  await setIndex(pruned);

  await addAudit({ at: now, actor: item.actor, action: 'queued', target: id, type: item.type, brand: item.brand, note: item.title });
  return item;
}

async function update(id, patch, histEvent) {
  const existing = await get(id);
  if (!existing) throw new Error('approval not found: ' + id);
  const updated = Object.assign({}, existing, patch, { updatedAt: Date.now() });
  if (histEvent) updated.history = (existing.history || []).concat([histEvent]);
  await saveRaw(updated);
  if (histEvent) await addAudit({ at: histEvent.at || Date.now(), actor: histEvent.actor, action: histEvent.action, target: id, type: updated.type, brand: updated.brand, note: histEvent.note || '' });
  return updated;
}

async function remove(id) {
  await store().delete(KEY_ITEM(id)).catch(() => null);
  const idx = await getIndex();
  await setIndex(idx.filter(x => x !== id));
}

// ── Audit log ─────────────────────────────────────────────────────
async function addAudit(event) {
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

// ── Brand feedback (rejection notes) ──────────────────────────────
async function appendBrandFeedback(brand, feedback) {
  if (!feedback?.trim()) return;
  const s = store();
  let notes = [];
  try { notes = JSON.parse(await s.get(KEY_FEEDBACK(brand), { type: 'text' }) || '[]'); } catch {}
  if (!Array.isArray(notes)) notes = [];
  const note = feedback.trim();
  if (!notes.includes(note)) {
    notes.push(note);
    if (notes.length > 20) notes = notes.slice(-20);
    await s.setJSON(KEY_FEEDBACK(brand), notes);
  }
}

module.exports = {
  KEY_INDEX, KEY_ITEM, KEY_AUDIT, KEY_FEEDBACK, newId,
  getIndex, setIndex, list, get, saveRaw, create, update, remove,
  addAudit, getAudit, appendBrandFeedback,
};
