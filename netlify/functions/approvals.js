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
const { getBrandContext, getBrandExamples, buildBrandPrompt } = require('./_lib/brand');
const { authorize, denied, internalHeaders } = require('./_lib/auth');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const SITE_URL = process.env.URL || 'https://yolkseo.netlify.app';

// ── Approval queue — single implementation in _lib/queue.js (P1.0) ──────────
const queue = require('./_lib/queue');
// Aliased to the names this handler already uses. store.js + this file both delegate
// to queue.js now (was two drifted copies of the queue → root cause of BC1/BC3/BC5).
const listItems          = queue.list;
const getItem            = queue.get;
const createItem         = queue.create;
const patchItem          = queue.update;
const removeItem         = queue.remove;
const addAudit           = queue.addAudit;
const getAudit           = queue.getAudit;
const appendBrandFeedback = queue.appendBrandFeedback;

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

  // Auth gate on ALL methods (#11): GET returns non-public pipeline data (items,
  // payloads, target keywords, audit log across every brand) — not just POST mutations.
  // Internal callers (international-seo read/create) pass x-nest-internal; browser uses session.
  const auth = await authorize(event);
  if (!auth.ok) return denied();

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

  // Derive actor from the verified session (no longer trust body.actor) so the
  // audit log can't be forged. Internal/service calls keep their stated actor.
  const actor = auth.via === 'session' ? auth.user.email : (body.actor || 'system');

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

      case 'rewrite_published':
        return await handleRewritePublished(body, actor);

      case 'republish':
        return await handleRepublish(body, actor);

      case 'mark_native_reviewed': {
        const { id } = body;
        if (!id) return bad(400, 'id required');
        const item = await getItem(id);
        if (!item) return bad(404, 'not found');
        item.payload = { ...(item.payload || {}), nativeReview: 'reviewed' };
        item.updatedAt = Date.now();
        await patchItem(id, { payload: item.payload, updatedAt: item.updatedAt });
        await addAudit({ at: Date.now(), actor, action: 'native_reviewed', target: id, type: item.type, brand: item.brand });
        return ok({ ok: true });
      }

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

  if (edited && !body.payload) return bad(400, 'payload required for edit_approve');
  // Merge edited payload onto the original — never replace wholesale.
  // Replacing drops market/language/url/wpParent which causes wrong-place publish.
  const payload = edited ? Object.assign({}, item.payload, body.payload) : item.payload;

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

  // Persist feedback so schedulers avoid repeating the same mistake
  appendBrandFeedback(item.brand, feedback).catch(() => {});

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
    headers: internalHeaders({ 'Content-Type': 'application/json' }),
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

// ── rewrite_published — Claude fixes already-published meta ─────
async function handleRewritePublished(body, actor) {
  const { id, feedback } = body;
  if (!id)              return bad(400, 'id required');
  if (!feedback?.trim()) return bad(400, 'feedback required');
  const item = await getItem(id);
  if (!item) return bad(404, 'not found');
  const ALLOWED = ['pushed', 'published', 'failed'];
  if (!ALLOWED.includes(item.status)) {
    return bad(400, `cannot rewrite item with status: ${item.status} — use reject for pending items`);
  }
  const p = item.payload || {};
  const currentTitle = p.metaTitle || p.title || '';
  const currentDesc  = p.metaDescription || p.description || '';
  const currentKw    = p.focusKeyword || p.targetKeyword || '';

  const isArabic = /[؀-ۿ]/.test(currentTitle + currentDesc);
  const langRules = isArabic
    ? `Language: Arabic. Rules — keep brand names in English (Pickl, Bonbird). "smash burger" → "سماش برغر" (NEVER "لحم بقري مسحوق"). Gulf Arabic style, not MSA.`
    : `Language: English. UAE restaurant tone.`;

  // Brand context + examples — same quality gate as scheduler
  const brandCtx      = await getBrandContext(item.brand).catch(() => null);
  const brandExamples = await getBrandExamples(item.brand).catch(() => null);
  const systemPrompt  = buildBrandPrompt(brandCtx, brandExamples) || `You are a UAE restaurant SEO copywriter for ${item.brand}.`;

  const prompt = `You are a UAE restaurant SEO copywriter for ${item.brand}.
The user flagged a problem with a published page. Fix ONLY what the feedback describes. If the current text contains factually wrong menu items or locations, also correct those even if not mentioned in feedback.

TARGET PAGE: ${p.url || '—'}
FOCUS KEYWORD — do NOT change this: "${currentKw}"

CURRENT VALUES:
SEO Title: ${currentTitle}
Meta Description: ${currentDesc}

USER FEEDBACK: "${feedback}"

RULES:
1. Focus keyword stays exactly: "${currentKw}" — never change it
2. Fix what feedback asks. Also remove any factually wrong menu items or locations not in the brand context above.
3. SEO title: 50-60 chars, must contain the focus keyword naturally
4. Meta description: 150-160 chars, must contain the focus keyword naturally
5. ${langRules}

Return ONLY valid JSON — no markdown, no explanation:
{"metaTitle":"...","metaDescription":"...","focusKeyword":"${currentKw}"}`;

  try {
    const text = await callClaude(prompt, { max_tokens: 1000, system: systemPrompt });
    const proposed = extractJson(text);
    if (!proposed) return bad(500, 'Claude did not return valid JSON');
    // Enforce focus keyword never changes
    proposed.focusKeyword = currentKw;
    return ok({ proposed, focusKeyword: currentKw });
  } catch (e) {
    console.error('rewrite_published failed:', e.message);
    return bad(500, e.message);
  }
}

// ── republish — push updated meta for already-published item ─────
async function handleRepublish(body, actor) {
  const { id, newTitle, newDescription, newFocusKeyword } = body;
  if (!id) return bad(400, 'id required');
  if (!newTitle && !newDescription) return bad(400, 'at least one of newTitle or newDescription is required');
  const item = await getItem(id);
  if (!item) return bad(404, 'not found');
  const ALLOWED = ['pushed', 'published', 'failed'];
  if (!ALLOWED.includes(item.status)) {
    return bad(400, `cannot republish item with status: ${item.status}`);
  }

  const updatedPayload = Object.assign({}, item.payload);
  if (newTitle)        updatedPayload.metaTitle        = newTitle;
  if (newDescription)  updatedPayload.metaDescription  = newDescription;
  if (newFocusKeyword) updatedPayload.focusKeyword      = newFocusKeyword;

  const pushResult = await pushItem(Object.assign({}, item, { payload: updatedPayload }));

  await patchItem(id, {
    payload: updatedPayload,
    pushResult: Object.assign({ at: Date.now() }, pushResult),
    republishedAt: Date.now(),
  }, {
    at: Date.now(), actor, action: 'republish',
    note: pushResult.ok ? 'Re-pushed with updated meta' : `Re-push failed: ${pushResult.message}`,
  });

  if (!pushResult.ok) notifyPushFailed(item, pushResult.message).catch(() => {});
  return ok({ item: await getItem(id), pushResult });
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
      // Claude has rewritten content for an existing page — update in place (WP keeps
      // the page's current status; a live page stays live with the approved rewrite)
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
      headers: internalHeaders({ 'Content-Type': 'application/json' }),
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
  const opts   = typeof maxTokens === 'object' ? maxTokens : { max_tokens: maxTokens };
  const key    = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const body   = { model: 'claude-sonnet-4-6', max_tokens: opts.max_tokens || 2000, messages: [{ role: 'user', content: prompt }] };
  if (opts.system) body.system = opts.system;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
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

  const brandCtx  = await getBrandContext(brand).catch(() => null);
  const brandExamples = await getBrandExamples(brand).catch(() => null);
  const system    = buildBrandPrompt(brandCtx, brandExamples) || undefined;

  const prompts = {
    blog_draft:       `Rewrite this blog post addressing feedback: "${feedback}"\n\nOriginal title: ${p.title}\nOriginal meta: ${p.metaDescription}\nKeyword: ${p.targetKeyword}\n\nReturn ONLY JSON: {"title":"...","metaDescription":"...","targetKeyword":"...","slug":"...","excerpt":"...","body":"<full HTML>"}`,
    meta_update:      `Rewrite SEO meta addressing feedback: "${feedback}"\nURL: ${p.url}, Title: ${p.metaTitle || p.title}, Description: ${p.metaDescription || p.description}\n\nReturn ONLY JSON: {"url":"...","metaTitle":"(50-60 chars)","metaDescription":"(150-160 chars)","targetKeyword":"..."}`,
    onpage_suggestion:`Revise this on-page suggestion based on feedback: "${feedback}"\n${JSON.stringify(p)}\n\nReturn ONLY JSON in the same shape.`,
    review_response:  `Rewrite this review response based on feedback: "${feedback}"\nReview: "${p.reviewText}"\nOriginal: "${p.responseText}"\n\nReturn ONLY JSON: {"reviewId":"${p.reviewId}","reviewText":"${(p.reviewText||'').replace(/"/g,'\\"')}","responseText":"(under 120 words, warm, UAE keyword natural)"}`,
    schema_update:    `Revise this schema based on feedback: "${feedback}"\n${JSON.stringify(p.schema||p)}\n\nReturn ONLY JSON: {"schema":<JSON-LD object>,"url":"${p.url||''}","postId":${p.postId||null}}`,
  };
  const prompt = prompts[item.type];
  if (!prompt) return null;
  try {
    const text = await callClaude(prompt, { max_tokens: 3000, system });
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
