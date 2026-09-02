// netlify/functions/generate-draft-background.js
// Runs ONE content generation off the gateway clock. A blog/page generation (GSC pull +
// 3500-token Claude call + voice check) exceeds Netlify's ~26s synchronous limit, so the
// UI's synchronous ⚡ Generate used to 504 while the draft was created anyway (phantom
// draft + false error). The sync /api/generate-draft now fires THIS (15-min budget),
// stores the result at genDraftJob:<jobId>, and the UI polls `action:'job'`.
//
// NOT scheduled (Netlify 403s HTTP calls to scheduled fns) and invoked directly at
// /.netlify/functions/generate-draft-background (CLAUDE.md rule 7). Reuses the exact
// generation core (generateDraftCore) — every guard stays in one place.

const { getStore } = require('@netlify/blobs');
const { authorizeJob, internalHeaders } = require('./_lib/auth');
const { generateDraftCore, JOB_KEY } = require('./generate-draft');
const queue = require('./_lib/queue');

const SITE = process.env.URL || process.env.NETLIFY_URL || 'https://yolkseo.netlify.app';
function store() {
  return getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
}

exports.handler = async (event) => {
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not authenticated' }) };

  let params = {};
  try { params = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  const jobId = params.jobId;
  if (!jobId) return { statusCode: 400, body: JSON.stringify({ error: 'jobId required' }) };

  console.log(`[generate-draft-bg] ${jobId} — ${params.actionType || 'meta_update'} "${params.keyword}"`);
  try {
    const out = await generateDraftCore(params);   // { statusCode, ok?, item?, skipped?, paused?, error?, ... }

    // REVISION (v7.9.59): this run is a "Rewrite with AI" of an existing draft. Once the
    // fresh draft is created (with every guard applied), tag it "(revised)", parent it to
    // the original, and reject the original — so the queue swaps cleanly with no data loss.
    if (params.revisedFrom && out.item) {
      try {
        const orig = await queue.get(params.revisedFrom).catch(() => null);
        const base = String(out.item.title || '').replace(/\s*\(revised\)\s*$/i, '');
        await queue.update(out.item.id, {
          title: base + ' (revised)', parentId: params.revisedFrom,
          rejectionFeedback: params.reviseFeedback || null,
        }, { at: Date.now(), actor: 'claude', action: 'revised', note: `revision of ${params.revisedFrom}` });
        out.item.title = base + ' (revised)';
        if (orig && orig.status === 'pending') {
          await queue.update(params.revisedFrom, { status: 'rejected', rejectionFeedback: params.reviseFeedback || null },
            { at: Date.now(), actor: params.reviseActor || 'claude', action: 'reject', note: `${params.reviseFeedback || 'rewrite'} → revised as ${out.item.id}` });
        }
      } catch (e) { console.warn('[generate-draft-bg] revision bookkeeping failed (draft still queued):', e.message); }
    }

    await store().setJSON(JOB_KEY(jobId), { ...out, status: 'done', finishedAt: Date.now() });
    console.log(`[generate-draft-bg] ${jobId} done — HTTP ${out.statusCode}${out.item ? ` (queued ${out.item.id})` : out.skipped ? ' (skipped)' : ''}`);
    // Slack: one ping when a draft is actually queued (UI single-item path; the planner
    // executor sends its own run summary, so no double-ping). Blobs-first webhook. (v7.9.48)
    if (out.item) {
      try {
        await fetch(`${SITE}/.netlify/functions/slack-notify`, {
          method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ type: 'draft_queued', brand: params.brand, title: out.item.title, siteUrl: SITE }),
        });
      } catch (e) { console.warn('[generate-draft-bg] slack notify failed (non-critical):', e.message); }
    }
  } catch (e) {
    console.error(`[generate-draft-bg] ${jobId} failed:`, e.message);
    await store().setJSON(JOB_KEY(jobId), { status: 'error', statusCode: 500, error: e.message, finishedAt: Date.now() }).catch(() => {});
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
