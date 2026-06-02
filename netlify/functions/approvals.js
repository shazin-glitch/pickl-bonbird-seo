// netlify/functions/approvals.js
// Approval queue API. Single endpoint, action-dispatched.
//
// GET  /api/approvals                    list items (filter: status, brand, type, limit)
// GET  /api/approvals?id=itm_...         single item
// GET  /api/approvals?audit=1            audit log
//
// POST /api/approvals body { action, ...fields }
//   create        queue new item(s) — used by scheduler/reviews
//   approve       push item as-is to WP/GBP
//   edit_approve  user-edited payload, then push
//   reject        reject + Claude rewrites based on feedback (USES CLAUDE API)
//   delete        dismiss without any Claude call (Task 3 — ZERO API CREDITS USED)
//   identify      log a new actor name (first session)

const { getStore } = require('@netlify/blobs');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const SITE_URL = process.env.URL || 'https://yolkseo.netlify.app';

// ── Blobs store ─────────────────────────────────────────────────
function store() {
  return getStore({
    name: 'seo-tool',
    consistency: 'strong',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_AUTH_TOKEN,
  });
}

const KEY_INDEX = 'approvals:index';
const KEY_ITEM  = id => `approvals:item:${id}`;
const KEY_AUDIT = 'audit:log';

function newId() {
  return `itm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Queue helpers ────────────────────────────────────────────────
async function getIndex() {
  return (await store().get(KEY_INDEX, { type: 'json' }).catch(() => null)) || [];
}
async function setIndex(ids) { await store().setJSON(KEY_INDEX, ids); }

async function listItems(filter) {
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

async function getItem(id) { return store().get(KEY_ITEM(id), { type: 'json' }).catch(() => null); }

async function saveItem(item) { await store().setJSON(KEY_ITEM(item.id), item); }

async function createItem(input) {
  const id  = newId();
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
    // Location + language tags for filtering
    locationTag: input.payload?.locationTag || input.locationTag || '🇦🇪 UAE',
    languageTag: input.payload?.languageTag || input.languageTag || 'EN',
  };
  await saveItem(item);
  const idx = await getIndex();
  idx.unshift(id);
  if (idx.length > 500) idx.length = 500;
  await setIndex(idx);
  await addAudit({ at: now, actor: item.actor, action: 'queued', target: id, type: item.type, brand: item.brand, note: item.title });
  return item;
}

async function patchItem(id, patch, histEvent) {
  const existing = await getItem(id);
  if (!existing) throw new Error('approval not found: ' + id);
  const updated = Object.assign({}, existing, patch, { updatedAt: Date.now() });
  if (histEvent) updated.history = (existing.history || []).concat([histEvent]);
  await saveItem(updated);
  if (histEvent) await addAudit({ at: histEvent.at || Date.now(), actor: histEvent.actor, action: histEvent.action, target: id, type: updated.type, brand: updated.brand, note: histEvent.note || '' });
  return updated;
}

async function removeItem(id) {
  await store().delete(KEY_ITEM(id)).catch(() => null);
  const idx = await getIndex();
  await setIndex(idx.filter(x => x !== id));
}

// ── Audit log ────────────────────────────────────────────────────
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

// ── Counts summary ───────────────────────────────────────────────
async function summarize() {
  const all = await listItems({ limit: 500 });
  const c = s => all.filter(i => i.status === s).length;
  return { pending: c('pending'), approved: c('approved'), pushed: c('pushed'), rejected: c('rejected'), failed: c('failed'), total: all.length };
}

// ── HTTP helpers ─────────────────────────────────────────────────
function ok(body)           { return { statusCode: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS), body: JSON.stringify(body) }; }
function bad(status, msg)   { return { statusCode: status, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS), body: JSON.stringify({ error: msg }) }; }
function preflight()        { return { statusCode: 200, headers: CORS, body: '' }; }
function parseBody(event)   { try { return event.body ? JSON.parse(event.body) : {}; } catch (_) { return null; } }

// ═══════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  if (event.httpMethod === 'GET') {
    const q = event.queryStringParameters || {};
    if (q.id) {
      const item = await getItem(q.id);
      return item ? ok({ item }) : bad(404, 'not found');
    }
    if (q.audit) {
      return ok({ events: await getAudit({ target: q.target, actor: q.actor, brand: q.brand, limit: parseInt(q.limit, 10) || 200 }) });
    }
    const filter = {};
    if (q.status && q.status !== 'all') filter.status = q.status;
    else if (!q.status) filter.status = 'pending';
    if (q.brand) filter.brand = q.brand;
    if (q.type)  filter.type  = q.type;
    filter.limit = parseInt(q.limit, 10) || 200;
    const [items, counts] = await Promise.all([listItems(filter), summarize()]);
    return ok({ items, counts });
  }

  if (event.httpMethod !== 'POST') return bad(405, 'Method Not Allowed');

  const body = parseBody(event);
  if (body === null) return bad(400, 'Invalid JSON');

  const actor = body.actor || 'unknown';

  try {
    switch (body.action) {

      case 'create': {
        const inputs = Array.isArray(body.items) ? body.items : [body];
        const created = [];
        for (const inp of inputs) {
          if (!inp.type || !inp.brand) return bad(400, 'type and brand are required');
          created.push(await createItem({ ...inp, actor }));
        }
        // Fire-and-forget notification (import inline to avoid top-level require issues)
        notifyQueued(created).catch(e => console.warn('notify error:', e.message));
        return ok({ items: created });
      }

      case 'approve':
        return await handleApprove(body, actor, false);

      case 'edit_approve':
        return await handleApprove(body, actor, true);

      case 'reject':
        // ⚠ This path DOES call Claude. Use 'delete' to dismiss without Claude.
        return await handleReject(body, actor);

      case 'publish':
        return await handlePublishItem(body, actor);

      case 'delete': {
        // ══════════════════════════════════════════════════════
        // TASK 3 — DISMISS BUTTON
        // Removes the item from Blobs + adds audit event.
        // ZERO calls to Claude or any external API.
        // ══════════════════════════════════════════════════════
        const { id } = body;
        if (!id) return bad(400, 'id required');
        const item = await getItem(id);
        if (!item) return bad(404, 'not found');
        await removeItem(id);
        await addAudit({
          at: Date.now(), actor, action: 'dismissed',
          target: id, type: item.type, brand: item.brand,
          note: `"${item.title || item.type}" dismissed without API call`,
        });
        return ok({ ok: true, message: 'Item dismissed' });
      }

      case 'identify':
        await addAudit({ at: Date.now(), actor, action: 'identify', target: null, note: 'first session' });
        return ok({ ok: true });

      default:
        return bad(400, `unknown action: ${body.action}`);
    }
  } catch (e) {
    console.error('approvals error', e);
    return bad(500, e.message || 'internal error');
  }
};

// ── approve / edit_approve ───────────────────────────────────────
async function handleApprove(body, actor, edited) {
  const { id } = body;
  if (!id) return bad(400, 'id required');
  const item = await getItem(id);
  if (!item) return bad(404, 'not found');
  if (item.status !== 'pending') return bad(400, `cannot approve item with status: ${item.status}`);

  const payload = edited ? (body.payload || item.payload) : item.payload;
  if (edited && !body.payload) return bad(400, 'payload required for edit_approve');

  await patchItem(id, { status: 'approved', payload }, {
    at: Date.now(), actor,
    action: edited ? 'edit_approve' : 'approve',
    note: edited ? 'user edited then approved' : 'approved as-is',
  });

  const pushResult = await pushItem(Object.assign({}, item, { payload }));
  const final = await patchItem(id, {
    status:           pushResult.ok ? 'pushed' : 'failed',
    pushResult:       Object.assign({ at: Date.now() }, pushResult),
    // Tracking fields — used by Monday scheduler to measure ranking movement
    trackingKeyword:  pushResult.ok ? (payload.targetKeyword || payload.keyword || null) : null,
    positionAtPublish: pushResult.ok ? (payload.currentPos || payload.currentPosition || null) : null,
    publishedAt:      pushResult.ok ? Date.now() : null,
  }, {
    at: Date.now(), actor: 'system',
    action: pushResult.ok ? 'pushed' : 'push_failed',
    note: pushResult.message || '',
  });

  if (!pushResult.ok) notifyPushFailed(item, pushResult.message).catch(() => {});
  return ok({ item: final, pushResult });
}

// ── reject + Claude rewrite ──────────────────────────────────────
async function handleReject(body, actor) {
  const { id, feedback } = body;
  if (!id)                    return bad(400, 'id required');
  if (!feedback?.trim())      return bad(400, 'feedback required');
  const item = await getItem(id);
  if (!item)                  return bad(404, 'not found');
  if (item.status !== 'pending') return bad(400, `cannot reject item with status: ${item.status}`);

  await patchItem(id, { status: 'rejected', rejectionFeedback: feedback }, {
    at: Date.now(), actor, action: 'reject', note: feedback,
  });

  const requeue = body.requeue !== false;
  if (!requeue) return ok({ item: await getItem(id), rewrite: null });

  // Call Claude for the rewrite
  const newPayload = await rewriteWithClaude(item, feedback);
  if (!newPayload) {
    return ok({ item: await getItem(id), rewrite: null, rewriteError: 'Claude rewrite failed; item rejected without requeue' });
  }

  const newItem = await createItem({
    type: item.type, brand: item.brand,
    title: (item.title || '') + ' (revised)',
    reason: `Rewritten after feedback: ${feedback.slice(0, 140)}`,
    payload: newPayload,
    parentId: item.id,
    rejectionFeedback: feedback,
    actor: 'claude',
  });

  notifyQueued([newItem]).catch(() => {});
  return ok({ item: await getItem(id), rewrite: newItem });
}

// ── publish ──────────────────────────────────────────────────────
// Triggered by "Approve & Publish" button — flips WP draft → published.
async function handlePublishItem(body, actor) {
  const { id } = body;
  if (!id) return bad(400, 'id required');
  const item = await getItem(id);
  if (!item) return bad(404, 'not found');

  const PUBLISHABLE = ['blog_draft', 'page_creation', 'page_update'];
  if (!PUBLISHABLE.includes(item.type)) {
    return bad(400, `${item.type} cannot be published directly — approve it first to create the WP draft, then publish from WP admin`);
  }

  // If not yet pushed to WP, approve first (creates the draft), then publish
  let postId = item.pushResult && item.pushResult.id ? item.pushResult.id : null;
  let postType = item.pushResult && item.pushResult.postType ? item.pushResult.postType : null;

  if (!postId) {
    // Item hasn't been pushed yet — push it first as draft
    await patchItem(id, { status: 'approved' }, { at: Date.now(), actor, action: 'approve', note: 'auto-approved before publish' });
    const pushResult = await pushItem(item);
    if (!pushResult.ok) {
      await patchItem(id, { status: 'failed', pushResult: Object.assign({ at: Date.now() }, pushResult) }, { at: Date.now(), actor: 'system', action: 'push_failed', note: pushResult.message });
      return bad(500, `Could not push to WordPress before publishing: ${pushResult.message}`);
    }
    postId   = pushResult.id;
    postType = pushResult.postType;
    await patchItem(id, { status: 'pushed', pushResult: Object.assign({ at: Date.now() }, pushResult) }, { at: Date.now(), actor: 'system', action: 'pushed', note: pushResult.message });
  }

  if (!postId) return bad(500, 'Could not determine WP post ID to publish');

  // Now call wordpress.js publish action
  const base = SITE_URL.replace(/\/$/, '');
  const res = await fetch(base + '/.netlify/functions/wordpress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'publish', brand: item.brand, payload: { postId, postType } }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return bad(res.status, `Publish failed: ${data.error || res.status}`);
  }

  await patchItem(id, {
    status: 'published',
    publishResult: { at: Date.now(), ref: data.ref, message: data.message },
    // Tracking fields — position at time of publish, for Monday movement tracking
    trackingKeyword:   item.trackingKeyword   || item.payload?.targetKeyword || null,
    positionAtPublish: item.positionAtPublish || item.payload?.currentPos    || null,
    publishedAt:       Date.now(),
  }, { at: Date.now(), actor, action: 'published', note: data.message || `Published at ${data.ref}` });

  return ok({ item: await getItem(id), publishResult: data });
}

// ── push dispatcher ──────────────────────────────────────────────
async function pushItem(item) {
  const base = SITE_URL.replace(/\/$/, '');
  let endpoint, pushBody;
  switch (item.type) {
    case 'blog_draft':
      endpoint = '/.netlify/functions/wordpress';
      pushBody = { action: 'create_draft', brand: item.brand, payload: item.payload };
      break;

    case 'meta_update':
    case 'schema_update': {
      const p = Object.assign({}, item.payload);
      if (p.url && !p.url.startsWith('http')) p.url = 'https://' + p.url.replace(/^\/+/, '');
      if (!p.postId && !p.url) return { ok: false, message: `${item.type} is missing a URL or postId — use Edit Draft to add the page URL` };
      endpoint = '/.netlify/functions/wordpress';
      pushBody = { action: 'update_meta', brand: item.brand, payload: p };
      break;
    }

    case 'page_update': {
      // Claude has rewritten content for an existing page — push as a draft revision
      const p = Object.assign({}, item.payload);
      if (p.url && !p.url.startsWith('http')) p.url = 'https://' + p.url.replace(/^\/+/, '');
      if (!p.postId && !p.url) return { ok: false, message: 'page_update is missing a URL — use Edit Draft to set the target page URL' };
      endpoint = '/.netlify/functions/wordpress';
      pushBody = { action: 'update_content', brand: item.brand, payload: p };
      break;
    }

    case 'page_creation': {
      // Claude has written a brand new WP Page — create it as a draft
      const p = Object.assign({}, item.payload);
      if (!p.title || !p.body) return { ok: false, message: 'page_creation payload is missing title or body' };
      endpoint = '/.netlify/functions/wordpress';
      pushBody = { action: 'create_page', brand: item.brand, payload: p };
      break;
    }

    case 'onpage_suggestion':
      // Human-action card — no structured WP write, just mark as actioned
      return { ok: true, ref: null, message: 'Marked as actioned — implement this suggestion manually in WordPress' };

    case 'review_response':
      endpoint = '/.netlify/functions/reviews';
      pushBody = { action: 'post_response', brand: item.brand, payload: item.payload };
      break;

    default:
      return { ok: false, message: `no push handler for type: ${item.type}` };
  }
  try {
    const res = await fetch(base + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pushBody),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok
      ? { ok: true, ref: data.ref || data.editUrl || null, message: data.message || 'pushed' }
      : { ok: false, message: data.error || `push failed: ${res.status}` };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ── Claude rewrite ───────────────────────────────────────────────
async function callClaude(prompt, maxTokens) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens || 2000, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Anthropic ${res.status}`);
  return (data.content || []).map(b => b.text || '').join('');
}

function extractJson(text) {
  if (!text) return null;
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch (_) {}
  const fi = s.indexOf('{'), li = s.lastIndexOf('}');
  if (fi !== -1 && li > fi) { try { return JSON.parse(s.slice(fi, li + 1)); } catch (_) {} }
  return null;
}

async function rewriteWithClaude(item, feedback) {
  const p = item.payload || {};
  const brand = item.brand;
  const prompts = {
    blog_draft:       `You are a UAE restaurant SEO copywriter for ${brand}. Rewrite this blog post addressing feedback: "${feedback}"\n\nOriginal title: ${p.title}\nOriginal meta: ${p.metaDescription}\nKeyword: ${p.targetKeyword}\n\nReturn ONLY JSON: {"title":"...","metaDescription":"...","targetKeyword":"...","slug":"...","excerpt":"...","body":"<full HTML>"}`,
    meta_update:      `Rewrite SEO meta for ${brand} (UAE restaurant). Feedback: "${feedback}"\nURL: ${p.url}, Title: ${p.title}, Description: ${p.description}\n\nReturn ONLY JSON: {"url":"...","title":"(50-60 chars)","description":"(150-160 chars)","targetKeyword":"..."}`,
    onpage_suggestion:`Revise this on-page suggestion for ${brand}. Feedback: "${feedback}"\n${JSON.stringify(p)}\n\nReturn ONLY JSON in the same shape.`,
    review_response:  `Rewrite this review response for ${brand}. Feedback: "${feedback}"\nReview: "${p.reviewText}"\nOriginal: "${p.responseText}"\n\nReturn ONLY JSON: {"reviewId":"${p.reviewId}","reviewText":"${(p.reviewText||'').replace(/"/g,'\\"')}","responseText":"(under 120 words, warm, UAE keyword natural)"}`,
    schema_update:    `Revise this schema for ${brand}. Feedback: "${feedback}"\n${JSON.stringify(p.schema||p)}\n\nReturn ONLY JSON: {"schema":<JSON-LD object>,"url":"${p.url||''}","postId":${p.postId||null}}`,
  };
  const prompt = prompts[item.type];
  if (!prompt) return null;
  try {
    const text = await callClaude(prompt, 3000);
    return extractJson(text);
  } catch (e) {
    console.error('rewrite failed:', e.message);
    return null;
  }
}

// ── notification stubs (mirrors notify.js, inline to avoid import issues) ───
async function notifyQueued(items) {
  if (!items || !items.length) return;
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  const text = items.length === 1
    ? `New approval: ${items[0].title || items[0].type} (${items[0].brand})`
    : `${items.length} new approvals queued`;
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `*${text}*\n<${SITE_URL}|Open approval queue →>` } }] }),
  }).catch(() => {});
}
async function notifyPushFailed(item, msg) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `:warning: Push failed for ${item.type} (${item.brand}): ${msg}` }),
  }).catch(() => {});
}
