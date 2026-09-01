// netlify/functions/cron-weekly-background.js
// Weekly cron DISPATCHER (Monday 4am UTC). Restores the parked Monday data pipeline
// (P4). Why a separate dispatcher: a function with a `schedule` gets HTTP-403'd by
// Netlify, which broke the on-demand "Run Audit" button when scheduler-background was
// scheduled directly. So scheduler-background stays schedule-LESS (HTTP-invocable), and
// THIS scheduled fn fires it once a week over HTTP with internalHeaders().
//
// ⚡ DATA-ONLY, NO CONTENT GENERATION. It calls scheduler-background with NO `jobs`, so
// only the unconditional DATA jobs run (GSC snapshot, rank history, CPC enrichment,
// published-item tracking, pruneApprovals, + the per-brand technical-seo fan-out).
// Autonomous content-gen stays OFF (North Star) — content is on-demand via the planner.
// international-seo-background is NOT fired here (it IS content-gen → stays manual).
//
// This fn is cron-invoked only, so being scheduled is fine (nothing HTTP-calls it).

const { authorizeJob, internalHeaders } = require('./_lib/auth');

const SITE = process.env.URL || process.env.NETLIFY_URL || 'https://yolkseo.netlify.app';

exports.handler = async (event) => {
  // Cron invokes have no httpMethod (authorizeJob treats that as the scheduled path);
  // an internal header also passes. A public HTTP hit without either is rejected.
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, body: JSON.stringify({ error: 'Not authenticated' }) };

  console.log('[cron-weekly] firing scheduler-background (data jobs only, no content gen)');
  try {
    // Fire-and-forget: scheduler-background is a background fn (returns 202, 15-min budget).
    // No `jobs` key → content generators are skipped; only data/measurement jobs run.
    await fetch(`${SITE}/.netlify/functions/scheduler-background`, {
      method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({}),
    });
  } catch (e) {
    console.error('[cron-weekly] failed to fire scheduler-background:', e.message);
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true, fired: 'scheduler-background' }) };
};
