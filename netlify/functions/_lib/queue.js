// netlify/functions/_lib/queue.js
// SINGLE source of truth for the approvals queue (P1.0 + P1.1).
//
// P1.0 consolidated the two drifted copies (store.js createApproval + approvals.js
// createItem) into this one module. P1.1 removed the mutable `approvals:index` blob:
// items are now discovered by a PREFIX SCAN (`store.list({ prefix:'approvals:item:' })`,
// which internally collects all pages — no truncation), so there is no shared mutable
// list in the write path → the BC3 read-modify-write race is GONE. create() just writes
// its own item key (O(1), race-free); pruning of dead items moved to a weekly sweep
// (pruneDead, called by the scheduler) instead of running on every create.
//
// Keys: approvals:item:<id> · audit:log · brandFeedback:<brand>. Strong consistency.

const { getStore } = require('@netlify/blobs');

const KEY_ITEM     = id => `approvals:item:${id}`;
const KEY_PREFIX   = 'approvals:item:';
const KEY_AUDIT    = 'audit:log';
const KEY_FEEDBACK = brand => `brandFeedback:${brand}`;

const DEAD_STATUSES = new Set(['rejected', 'failed']);
const DEAD_MAX_AGE  = 30 * 24 * 60 * 60 * 1000; // pruneDead removes dead items after 30 days

function store() {
  return getStore({ name: 'seo-tool', consistency: 'strong', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
}

function newId(prefix) {
  return `${prefix || 'itm'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// All item keys via prefix scan. The non-paginate list() collects every page internally,
// so this never truncates (unlike the old 500/2000-capped index).
async function allItemKeys() {
  const { blobs } = await store().list({ prefix: KEY_PREFIX });
  return (blobs || []).map(b => b.key);
}

// ── Items ─────────────────────────────────────────────────────────
async function get(id) { return store().get(KEY_ITEM(id), { type: 'json' }).catch(() => null); }
async function saveRaw(item) { await store().setJSON(KEY_ITEM(item.id), item); }

async function list(filter) {
  filter = filter || {};
  const s = store();
  const keys = await allItemKeys();
  let items = (await Promise.all(keys.map(k => s.get(k, { type: 'json' }).catch(() => null)))).filter(Boolean);
  // Newest first (was implicit via index unshift; now explicit by createdAt). The id
  // tiebreaker keeps ordering deterministic (stable across loads) when many items share
  // the same createdAt ms — e.g. a cron loop queuing a batch.
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || String(b.id).localeCompare(String(a.id)));
  if (filter.status) items = items.filter(i => i.status === filter.status);
  if (filter.brand)  items = items.filter(i => i.brand  === filter.brand);
  if (filter.type)   items = items.filter(i => i.type   === filter.type);
  if (filter.limit)  items = items.slice(0, filter.limit);
  return items;
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
  await saveRaw(item); // O(1), race-free — no shared index to read-modify-write
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
}

// Weekly cleanup: delete rejected/failed items older than 30 days. Keeps pushed/
// published/pending FOREVER (dedup + tracking need them). Called from the scheduler,
// not on every create — so create stays cheap.
async function pruneDead() {
  const s = store();
  const cutoff = Date.now() - DEAD_MAX_AGE;
  const keys = await allItemKeys();
  let removed = 0;
  for (const k of keys) {
    const it = await s.get(k, { type: 'json' }).catch(() => null);
    if (it && DEAD_STATUSES.has(it.status) && (it.updatedAt || 0) < cutoff) {
      await s.delete(k).catch(() => null);
      removed++;
    }
  }
  return removed;
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
  KEY_ITEM, KEY_PREFIX, KEY_AUDIT, KEY_FEEDBACK, newId,
  allItemKeys, list, get, saveRaw, create, update, remove, pruneDead,
  addAudit, getAudit, appendBrandFeedback,
};
