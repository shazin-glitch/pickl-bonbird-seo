// netlify/functions/approvals.js
// Approval-queue API. Single endpoint, multiple actions via { action: '...' }.
//
// GET /api/approvals                           -> list pending (default filter)
// GET /api/approvals?status=all                -> list all
// GET /api/approvals?id=itm_...                -> single item
// GET /api/approvals?audit=1&target=itm_...    -> audit log for an item
//
// POST /api/approvals body:
//   { action: 'create',  ...itemFields, actor }            (used by scheduler/reviews)
//   { action: 'approve', id, actor }                        push as-is
//   { action: 'edit_approve', id, payload, actor }          user-edited then approve
//   { action: 'reject',  id, feedback, actor, requeue }     reject + optional Claude rewrite
//   { action: 'delete',  id, actor }                        admin housekeeping
//   { action: 'identify', actor }                           record an actor name (audit)
//
// On approve/edit_approve, this function delegates the actual *push* to the
// type-specific handler (wordpress.js, reviews.js). The push is an internal
// fetch to /.netlify/functions/<name>; both sit in the same Netlify deploy
// so the call is in-region and fast.

const {
  listApprovals, getApproval, createApproval, updateApproval, deleteApproval,
  getAudit, logAudit,
  callClaude,
  ok, bad, preflight, parseBody
} = require('./_lib/store');
const { notifyQueued, notifyPushFailed } = require('./_lib/notify');

const SITE_URL = process.env.URL || 'https://yolkseo.netlify.app';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  // ---- GET: read endpoints --------------------------------------------------
  if (event.httpMethod === 'GET') {
    const q = event.queryStringParameters || {};

    if (q.id) {
      const item = await getApproval(q.id);
      if (!item) return bad(404, 'not found');
      return ok({ item });
    }

    if (q.audit) {
      const events = await getAudit({
        target: q.target || undefined,
        actor: q.actor || undefined,
        brand: q.brand || undefined,
        limit: parseInt(q.limit, 10) || 200
      });
      return ok({ events });
    }

    const filter = {};
    if (q.status && q.status !== 'all') filter.status = q.status;
    else if (!q.status) filter.status = 'pending';
    if (q.brand) filter.brand = q.brand;
    if (q.type) filter.type = q.type;
    filter.limit = parseInt(q.limit, 10) || 200;
    const items = await listApprovals(filter);
    const counts = await summarize();
    return ok({ items, counts });
  }

  // ---- POST: actions --------------------------------------------------------
  if (event.httpMethod !== 'POST') return bad(405, 'Method Not Allowed');

  const body = parseBody(event);
  if (body === null) return bad(400, 'Invalid JSON');

  const action = body.action;
  const actor = body.actor || 'unknown';

  try {
    switch (action) {
      case 'create':
        return await handleCreate(body, actor);
      case 'approve':
        return await handleApprove(body, actor, /*edited*/ false);
      case 'edit_approve':
        return await handleApprove(body, actor, /*edited*/ true);
      case 'reject':
        return await handleReject(body, actor);
      case 'delete':
        return await handleDelete(body, actor);
      case 'identify':
        await logAudit({
          at: Date.now(), actor, action: 'identify', target: null,
          note: 'first session for actor'
        });
        return ok({ ok: true });
      default:
        return bad(400, `unknown action: ${action}`);
    }
  } catch (err) {
    console.error('approvals error', err);
    return bad(500, err.message || 'internal error');
  }
};

// ---- handlers ---------------------------------------------------------------

async function handleCreate(body, actor) {
  // Allow a single item or a batch
  const inputs = Array.isArray(body.items) ? body.items : [body];
  const created = [];
  for (const input of inputs) {
    if (!input.type || !input.brand) {
      return bad(400, 'type and brand are required');
    }
    const item = await createApproval({
      type: input.type,
      brand: input.brand,
      title: input.title,
      reason: input.reason,
      payload: input.payload,
      parentId: input.parentId || null,
      rejectionFeedback: input.rejectionFeedback || null,
      actor
    });
    created.push(item);
  }
  // Fire-and-forget notification — don't block the response on Slack/email
  notifyQueued(created).catch(e => console.warn('notify failed:', e.message));
  return ok({ items: created });
}

async function handleApprove(body, actor, edited) {
  const { id } = body;
  if (!id) return bad(400, 'id required');
  const item = await getApproval(id);
  if (!item) return bad(404, 'not found');
  if (item.status !== 'pending') {
    return bad(400, `cannot approve item with status: ${item.status}`);
  }

  // If the user edited, save the new payload but keep the original on the item
  // so the audit trail and diff view remain truthful.
  let payload = item.payload;
  if (edited) {
    if (!body.payload) return bad(400, 'payload required for edit_approve');
    payload = body.payload;
  }

  // Mark approved (before push) so the queue reflects intent even if push fails
  await updateApproval(id, {
    status: 'approved',
    payload
  }, {
    at: Date.now(),
    actor,
    action: edited ? 'edit_approve' : 'approve',
    note: edited ? 'user edited then approved' : 'approved as-is'
  });

  // Dispatch the actual push
  const pushResult = await pushItem(Object.assign({}, item, { payload }));

  await updateApproval(id, {
    status: pushResult.ok ? 'pushed' : 'failed',
    pushResult: Object.assign({ at: Date.now() }, pushResult)
  }, {
    at: Date.now(),
    actor: 'system',
    action: pushResult.ok ? 'pushed' : 'push_failed',
    note: pushResult.message || (pushResult.ok ? 'pushed successfully' : 'push failed')
  });

  if (!pushResult.ok) {
    notifyPushFailed(item, pushResult.message).catch(() => {});
  }

  const final = await getApproval(id);
  return ok({ item: final, pushResult });
}

async function handleReject(body, actor) {
  const { id, feedback } = body;
  const requeue = body.requeue !== false; // default true
  if (!id) return bad(400, 'id required');
  if (!feedback || !feedback.trim()) {
    return bad(400, 'feedback required for rejection');
  }
  const item = await getApproval(id);
  if (!item) return bad(404, 'not found');
  if (item.status !== 'pending') {
    return bad(400, `cannot reject item with status: ${item.status}`);
  }

  await updateApproval(id, { status: 'rejected', rejectionFeedback: feedback }, {
    at: Date.now(),
    actor,
    action: 'reject',
    note: feedback
  });

  if (!requeue) {
    return ok({ item: await getApproval(id), rewrite: null });
  }

  // Ask Claude to rewrite based on feedback. Type-specific prompt.
  const rewritten = await rewriteWithClaude(item, feedback);
  if (!rewritten) {
    // Don't fail the whole request; the rejection succeeded, just no rewrite
    return ok({
      item: await getApproval(id),
      rewrite: null,
      rewriteError: 'Claude rewrite failed; item rejected without requeue'
    });
  }

  const newItem = await createApproval({
    type: item.type,
    brand: item.brand,
    title: item.title ? `${item.title} (revised)` : 'Revised draft',
    reason: `Rewritten after feedback: ${feedback.slice(0, 140)}`,
    payload: rewritten,
    parentId: item.id,
    rejectionFeedback: feedback,
    actor: 'claude'
  });

  notifyQueued(newItem).catch(() => {});

  return ok({
    item: await getApproval(id),
    rewrite: newItem
  });
}

async function handleDelete(body, actor) {
  const { id } = body;
  if (!id) return bad(400, 'id required');
  const item = await getApproval(id);
  if (!item) return bad(404, 'not found');
  await deleteApproval(id);
  await logAudit({
    at: Date.now(), actor, action: 'delete', target: id,
    type: item.type, brand: item.brand, note: 'item deleted'
  });
  return ok({ ok: true });
}

// ---- push dispatcher -------------------------------------------------------
// Internal call to the appropriate push handler. We POST to the same Netlify
// site so we hit our own functions, not external services.

async function pushItem(item) {
  const base = SITE_URL.replace(/\/$/, '');
  let endpoint = null;
  let pushBody = null;

  switch (item.type) {
    case 'blog_draft':
      endpoint = '/.netlify/functions/wordpress';
      pushBody = { action: 'create_draft', brand: item.brand, payload: item.payload };
      break;
    case 'meta_update':
    case 'onpage_suggestion':
    case 'schema_update':
      endpoint = '/.netlify/functions/wordpress';
      pushBody = { action: 'update_meta', brand: item.brand, payload: item.payload };
      break;
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
      body: JSON.stringify(pushBody)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, message: data.error || `push failed: ${res.status}` };
    }
    return { ok: true, ref: data.ref || data.id || null, message: data.message || 'pushed' };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

// ---- rewrite-on-rejection --------------------------------------------------

async function rewriteWithClaude(item, feedback) {
  const promptByType = {
    blog_draft: buildBlogRewritePrompt,
    meta_update: buildMetaRewritePrompt,
    onpage_suggestion: buildSuggestionRewritePrompt,
    schema_update: buildSchemaRewritePrompt,
    review_response: buildReviewRewritePrompt
  };
  const builder = promptByType[item.type];
  if (!builder) return null;

  const prompt = builder(item, feedback);
  try {
    const { text } = await callClaude(prompt, { max_tokens: 3000 });
    return parseRewriteResponse(item.type, text);
  } catch (e) {
    console.error('rewrite failed:', e);
    return null;
  }
}

function buildBlogRewritePrompt(item, feedback) {
  const p = item.payload || {};
  return `You are an SEO copywriter for a UAE restaurant brand (${item.brand}). The previous blog draft was rejected with this feedback:

"${feedback}"

ORIGINAL DRAFT:
Title: ${p.title || ''}
Meta description: ${p.metaDescription || ''}
Target keyword: ${p.targetKeyword || ''}
Body (HTML or markdown):
${p.body || ''}

Rewrite the blog post addressing the feedback. Keep it UAE-focused, keyword-rich, and on-brand for ${item.brand}.

Return ONLY a JSON object — no commentary, no fences — with this shape:
{
  "title": "...",
  "metaDescription": "... (max 160 chars)",
  "targetKeyword": "...",
  "slug": "lowercase-hyphenated",
  "body": "<full HTML body>",
  "excerpt": "..."
}`;
}

function buildMetaRewritePrompt(item, feedback) {
  const p = item.payload || {};
  return `Rewrite SEO meta for a UAE restaurant page. Feedback to address:

"${feedback}"

ORIGINAL:
Page URL: ${p.url || ''}
Post ID: ${p.postId || ''}
Title: ${p.title || ''}
Description: ${p.description || ''}
Target keyword: ${p.targetKeyword || ''}

Return ONLY JSON:
{
  "url": "...",
  "postId": ${p.postId || 'null'},
  "title": "... (50-60 chars)",
  "description": "... (150-160 chars)",
  "targetKeyword": "..."
}`;
}

function buildSuggestionRewritePrompt(item, feedback) {
  const p = item.payload || {};
  return `Revise this on-page SEO suggestion for ${item.brand} (UAE restaurant) based on feedback:

"${feedback}"

ORIGINAL:
${JSON.stringify(p, null, 2)}

Return ONLY JSON in the same shape as the original payload, with the suggestion improved.`;
}

function buildSchemaRewritePrompt(item, feedback) {
  const p = item.payload || {};
  return `Revise this Restaurant JSON-LD schema for ${item.brand} based on feedback:

"${feedback}"

ORIGINAL:
${typeof p.schema === 'string' ? p.schema : JSON.stringify(p.schema, null, 2)}

Return ONLY JSON: { "schema": <the JSON-LD object>, "url": "${p.url || ''}", "postId": ${p.postId || 'null'} }`;
}

function buildReviewRewritePrompt(item, feedback) {
  const p = item.payload || {};
  return `Rewrite a Google review response for ${item.brand} (UAE restaurant). Feedback:

"${feedback}"

ORIGINAL REVIEW: "${p.reviewText || ''}"
ORIGINAL RESPONSE: "${p.responseText || ''}"

Return ONLY JSON:
{
  "reviewId": "${p.reviewId || ''}",
  "reviewText": "${(p.reviewText || '').replace(/"/g, '\\"')}",
  "responseText": "... (under 150 words, warm, includes a UAE keyword naturally)"
}`;
}

function parseRewriteResponse(type, text) {
  // Reuse extractJson logic via a local copy to avoid a circular import
  if (!text) return null;
  let candidate = text.trim();
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidate = fence[1].trim();
  try { return JSON.parse(candidate); } catch (_) {}
  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    try { return JSON.parse(candidate.slice(first, last + 1)); } catch (_) {}
  }
  return null;
}

// ---- summary ---------------------------------------------------------------

async function summarize() {
  const all = await listApprovals({ limit: 500 });
  return {
    pending: all.filter(i => i.status === 'pending').length,
    approved: all.filter(i => i.status === 'approved').length,
    pushed: all.filter(i => i.status === 'pushed').length,
    rejected: all.filter(i => i.status === 'rejected').length,
    failed: all.filter(i => i.status === 'failed').length,
    total: all.length
  };
}
