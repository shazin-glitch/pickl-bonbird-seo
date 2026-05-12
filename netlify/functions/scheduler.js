// netlify/functions/scheduler.js
// Thin synchronous wrapper. Accepts the request, fires scheduler-background.js
// asynchronously, and returns immediately so the browser/curl never times out.
// All actual work (GSC fetch + Claude + queue) runs in scheduler-background.js.
//
// dryRun is handled inline here since it's fast (no Claude calls).

const {
  fetchGscDirect, listApprovals,
  getSetting, ok, bad, preflight, parseBody,
} = require('./_lib/store');

const SITE_URL = process.env.URL || 'https://yolkseo.netlify.app';

const BRANDS = {
  pickl:   { gsc: 'https://eatpickl.com/' },
  bonbird: { gsc: 'sc-domain:bonbirdchicken.com' },
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  // GET = status check, returns last run summary
  if (event.httpMethod === 'GET') {
    const lastrun = await getSetting('scheduler:lastrun', null);
    return ok({ lastrun });
  }

  const body = parseBody(event) || {};
  const dryRun   = !!body.dryRun;
  const forceRun = !!body.forceRun;
  const brandsToRun = body.brand ? [body.brand].filter(b => BRANDS[b]) : Object.keys(BRANDS);
  const jobs = Array.isArray(body.jobs) && body.jobs.length
    ? body.jobs
    : ['quick_wins', 'meta_rewrites', 'content_gaps', 'page_creation'];

  // Dry run: fast candidate counting with no Claude — handle synchronously
  if (dryRun) {
    const summary = { startedAt: Date.now(), brands: {}, queued: 0, errors: [], dryRun: true };
    for (const brand of brandsToRun) {
      summary.brands[brand] = { jobs: {} };
      try {
        const rows = await fetchGscDirect(BRANDS[brand].gsc).catch(() => []);
        summary.brands[brand].gscRows = rows.length;
        const pending = await listApprovals({ brand, limit: 200 });
        const alreadyQueued = new Set(
          pending.map(i => (i.payload && (i.payload.targetKeyword || i.payload.keyword) || '').toLowerCase())
        );
        for (const job of jobs) {
          let candidates = [];
          if (job === 'quick_wins') {
            candidates = rows
              .filter(r => r.position >= 11 && r.position <= 20 && r.impressions >= 50)
              .filter(r => forceRun || !alreadyQueued.has(r.keyword.toLowerCase()));
          } else if (job === 'meta_rewrites') {
            const exp = pos => Math.max(0.5, 30 / pos);
            candidates = rows
              .filter(r => r.position <= 20 && r.impressions >= 100 && (exp(r.position) - r.ctr) > 1.5)
              .filter(r => forceRun || !alreadyQueued.has(r.keyword.toLowerCase()));
          } else if (job === 'content_gaps') {
            candidates = rows
              .filter(r => r.position > 8 && r.impressions >= 20)
              .filter(r => forceRun || !alreadyQueued.has(r.keyword.toLowerCase()));
          } else if (job === 'page_creation') {
            const loc = ['dubai','abu dhabi','sharjah','uae','delivery','near me','marina','jlt','downtown','deira','jbr','mall','city walk','difc'];
            candidates = rows
              .filter(r => r.position > 15 && r.impressions >= 60 && loc.some(s => r.keyword.toLowerCase().includes(s)))
              .filter(r => forceRun || !alreadyQueued.has(r.keyword.toLowerCase()));
          }
          candidates.sort((a, b) => b.impressions - a.impressions);
          summary.brands[brand].jobs[job] = {
            queued: 0,
            candidates: candidates.length,
            preview: candidates.slice(0, 5).map(r => r.keyword),
          };
        }
      } catch (e) {
        summary.errors.push({ brand, error: e.message });
      }
    }
    summary.finishedAt = Date.now();
    summary.durationMs = summary.finishedAt - summary.startedAt;
    return ok(summary);
  }

  // Real run: fire background function and return immediately with 202-style message
  const bgUrl = `${SITE_URL.replace(/\/$/, '')}/.netlify/functions/scheduler-background`;
  fetch(bgUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(e => console.error('Failed to trigger background scheduler:', e.message));

  return ok({
    message: 'Audit running in background — new items will appear in the Approvals tab in 30-60 seconds',
    jobs,
    brand: body.brand || 'both',
    forceRun,
    startedAt: Date.now(),
  });
};
