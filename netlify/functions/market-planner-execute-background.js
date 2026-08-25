// netlify/functions/market-planner-execute-background.js
// MARKET PLANNER P3a — EXECUTE. Loops the selected plan items through generate-draft
// (THE one generation engine) so drafts land in the Approvals Queue for human review.
// Background because N generations at ~15–20s each blow past the synchronous function
// limit (a sync loop 504s AND still spends the credits — see memory netlify-function-traps).
// Progress is stored at marketPlanRun:<brand>:<market>; /api/market-planner action:'run' polls it.
//
// NOT scheduled (Netlify 403s any HTTP call to a scheduled function) and must be invoked
// at /.netlify/functions/market-planner-execute-background directly (CLAUDE.md rule 7).
//
// This function NEVER publishes and never writes to WordPress — generate-draft only ever
// creates a pending approval. Every content guard (contentPaused, cannibalization, voice
// gate, FAQ contract, writable-template, confidence) stays inside generate-draft.

const { getStore } = require('@netlify/blobs');
const { authorizeJob, internalHeaders } = require('./_lib/auth');

function store() {
  return getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
}
const RUN_KEY = (b, m) => `marketPlanRun:${b}:${m || 'uae'}`;
const SITE = process.env.URL || process.env.NETLIFY_URL || 'https://yolkseo.netlify.app';

const VALID_ACTIONS = new Set(['meta_update', 'page_creation', 'blog_draft']);
// Stop starting new generations with < 90s of the 15-min budget left, so the run record
// is always closed out cleanly rather than dying mid-item with status stuck on 'running'.
const BUDGET_MS = 13.5 * 60 * 1000;

// Classify one generate-draft response into a run result the queue/UI can read.
function classify(status, res) {
  if (status >= 400 || (res && res.error)) return { status: 'error', reason: (res && res.error) || `HTTP ${status}` };
  if (res && res.paused)       return { status: 'skipped', reason: res.reason || 'brand content generation is paused' };
  if (res && res.routeToPerch) return { status: 'routed',  reason: res.reason || 'low confidence — routed to Perch' };
  if (res && res.skipped)      return { status: 'skipped', reason: res.reason || 'generator skipped this item' };
  if (res && res.item)         return { status: 'queued',  itemId: res.item.id || null, title: res.item.title || null };
  return { status: 'error', reason: 'generate-draft returned no item' };
}

exports.handler = async (event) => {
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not authenticated' }) };

  let brand, market, calls;
  try { const b = JSON.parse(event.body || '{}'); brand = b.brand; market = b.market; calls = b.calls; }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  if (!brand || !Array.isArray(calls) || !calls.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'brand and a non-empty calls[] are required' }) };
  }

  const runKey = RUN_KEY(brand, market);
  const startedAt = Date.now();
  const results = [];
  let done = 0;

  // Preserve whatever the sync starter recorded (startedBy, un-executable skips).
  const seed = (await store().get(runKey, { type: 'json' }).catch(() => null)) || {};
  const save = (extra) => store().setJSON(runKey, {
    ...seed, brand, market: market || 'uae', startedAt: seed.startedAt || startedAt,
    total: calls.length, done, results, ...extra,
  }).catch(e => console.warn('[planner-exec] progress save failed:', e.message));

  console.log(`[planner-exec] ${runKey} — ${calls.length} item(s)`);

  for (const c of calls) {
    const label = `${c.assetType || '?'} "${c.keyword}"`;
    if (Date.now() - startedAt > BUDGET_MS) {
      results.push({ keyword: c.keyword, assetType: c.assetType, status: 'skipped', reason: 'run budget reached — re-run to finish the rest' });
      done++; continue;
    }
    // Defence in depth: only ever POST an action generate-draft actually accepts.
    if (!c.call || !VALID_ACTIONS.has(c.call.actionType) || c.call.brand !== brand) {
      results.push({ keyword: c.keyword, assetType: c.assetType, status: 'error', reason: 'invalid or mismatched call — refused' });
      done++; await save({ status: 'running' }); continue;
    }

    try {
      const r = await fetch(`${SITE}/.netlify/functions/generate-draft`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(c.call),
      });
      const res = await r.json().catch(() => null);
      const out = classify(r.status, res);
      results.push({ keyword: c.keyword, assetType: c.assetType, ...out });
      console.log(`[planner-exec] ${label} → ${out.status}${out.reason ? ` (${out.reason})` : ''}`);
    } catch (e) {
      // A timeout here may still have spent Claude server-side — say so, don't auto-retry.
      results.push({ keyword: c.keyword, assetType: c.assetType, status: 'error',
        reason: `${e.message} — the generation may still have completed; check Approvals before re-running.` });
      console.error(`[planner-exec] ${label} failed:`, e.message);
    }
    done++;
    await save({ status: 'running' });
  }

  const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  await save({ status: 'done', finishedAt: Date.now(), counts });
  console.log(`[planner-exec] ${runKey} done — ${JSON.stringify(counts)}`);
  return { statusCode: 200, body: JSON.stringify({ ok: true, done, counts }) };
};
