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
const { authorizeJob } = require('./_lib/auth');
const { generateDraftCore, JOB_KEY } = require('./generate-draft');

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
    await store().setJSON(JOB_KEY(jobId), { ...out, status: 'done', finishedAt: Date.now() });
    console.log(`[generate-draft-bg] ${jobId} done — HTTP ${out.statusCode}${out.item ? ` (queued ${out.item.id})` : out.skipped ? ' (skipped)' : ''}`);
  } catch (e) {
    console.error(`[generate-draft-bg] ${jobId} failed:`, e.message);
    await store().setJSON(JOB_KEY(jobId), { status: 'error', statusCode: 500, error: e.message, finishedAt: Date.now() }).catch(() => {});
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
