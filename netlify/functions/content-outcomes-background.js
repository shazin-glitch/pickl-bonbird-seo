// netlify/functions/content-outcomes-background.js
// Closed-loop ranking attribution (intl content-intelligence gap #4 of 4).
//
// The publish path (approvals.js) already stamps every shipped item with a
// baseline: trackingKeyword + positionAtPublish + publishedAt. Nothing ever read
// those back — so the system could generate content forever without knowing if a
// single piece actually moved a ranking. This job closes the loop:
//   for each pushed/published item ≥ MIN_AGE_DAYS old, look up the keyword's
//   CURRENT position from the GSC cache, compute the delta vs positionAtPublish,
//   patch the item with an `outcome`, and aggregate into contentOutcomes:<brand>.
//
// Delta semantics: GSC position is "lower = better", so
//   delta = positionAtPublish - positionNow   (positive = ranking improved).
//
// Trigger: Monday 6am UTC cron (alongside snapshots-background), or manually via
//   GET /.netlify/functions/content-outcomes-background

const { getStore } = require('@netlify/blobs');
const { authorizeJob, internalHeaders } = require('./_lib/auth');
const { listApprovals, updateApproval } = require('./_lib/store');

const NEST_SITE = process.env.URL || 'https://yolkseo.netlify.app';

// ── Meta/optimization outcome loop ────────────────────────────────────────────
// The content loop above judges *rankings* for published content. This judges the
// CTR/position impact of the live EDITS the Nest makes (meta rewrites, content
// tweaks) — logged as `optimized` events in seoEvents:<brand> (v7.9.103) — by
// comparing the page's weekly snapshot at the change date vs the latest one. Weekly
// snapshots carry clicks+impressions+position, so CTR is derivable. Reports once ≥14
// days of post-change data exist; fires ONE Slack result per change (deduped via a
// reportedOutcomeAt stamp on the event) and folds results into contentOutcomes:<brand>.
function isoWeek(d) { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const f = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); const w = 1 + Math.round(((t - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7); return t.getUTCFullYear() + '-W' + String(w).padStart(2, '0'); }
const ctrOf = r => (r && r.i > 0) ? (r.c / r.i) * 100 : 0;

async function getSnap(store, brand, week) { return store.get(`pageSnapshot:${brand}:${week}`, { type: 'json' }).catch(() => null); }

async function measureMetaOutcomes(store, brand) {
  const log = (await store.get(`seoEvents:${brand}`, { type: 'json' }).catch(() => null)) || { events: [] };
  const optimized = (log.events || []).filter(e => e.type === 'optimized' && e.url && e.at);
  if (!optimized.length) return { results: [], totals: { tracked: 0 }, notify: [] };

  // latest snapshot (this week, or last week if this week's isn't built yet)
  const now = new Date();
  let cur = await getSnap(store, brand, isoWeek(now));
  if (!cur || !(cur.pages || []).length) cur = await getSnap(store, brand, isoWeek(new Date(Date.now() - 7 * 864e5)));
  const curByUrl = new Map((cur?.pages || []).map(p => [p.u, p]));

  const results = [], notify = [];
  let dirty = false;
  for (const e of optimized) {
    const at = new Date(e.at).getTime();
    const ageDays = Math.floor((Date.now() - at) / 864e5);
    // baseline = the latest weekly snapshot taken BEFORE the change (a true "before")
    let base = null;
    for (const d of [0, 7, 14]) {
      const s = await getSnap(store, brand, isoWeek(new Date(at - d * 864e5)));
      if (s && new Date(s.builtAt).getTime() <= at && (s.pages || []).some(p => p.u === e.url)) { base = s; break; }
    }
    const baseRow = base ? (base.pages || []).find(p => p.u === e.url) : null;
    const curRow = curByUrl.get(e.url);
    if (!baseRow || !curRow) { results.push({ url: e.url, action: e.action, at: e.at, ageDays, verdict: 'pending', reason: !baseRow ? 'no baseline snapshot' : 'no current snapshot' }); continue; }

    const baseCtr = +ctrOf(baseRow).toFixed(2), curCtr = +ctrOf(curRow).toFixed(2);
    const ctrDelta = +(curCtr - baseCtr).toFixed(2);
    const posDelta = (baseRow.p != null && curRow.p != null) ? +(baseRow.p - curRow.p).toFixed(1) : null; // + = improved
    const clicksDelta = (curRow.c || 0) - (baseRow.c || 0);
    let verdict;
    if (ageDays < MIN_AGE_DAYS) verdict = 'maturing';
    else if (e.action === 'meta_update') verdict = ctrDelta >= 0.2 ? 'improved' : ctrDelta <= -0.2 ? 'declined' : 'flat';
    else verdict = (posDelta != null && posDelta >= 1) || clicksDelta > 0 ? 'improved' : (posDelta != null && posDelta <= -1) ? 'declined' : 'flat';

    const r = { url: e.url, action: e.action, at: e.at, ageDays, market: e.market || null,
      baseline: { ctr: baseCtr, clicks: baseRow.c || 0, pos: baseRow.p, week: base.week },
      current: { ctr: curCtr, clicks: curRow.c || 0, pos: curRow.p, week: cur.week },
      ctrDelta, posDelta, clicksDelta, verdict };
    results.push(r);

    // Fire ONE Slack result per change, the first time it reaches a real verdict.
    if (['improved', 'declined', 'flat'].includes(verdict) && !e.reportedOutcomeAt) {
      notify.push(r);
      e.reportedOutcomeAt = new Date().toISOString();
      dirty = true;
    }
  }
  if (dirty) await store.set(`seoEvents:${brand}`, JSON.stringify(log)).catch(() => {});
  const graded = results.filter(r => ['improved', 'declined', 'flat'].includes(r.verdict));
  return {
    results,
    totals: { tracked: results.length, improved: graded.filter(r => r.verdict === 'improved').length, declined: graded.filter(r => r.verdict === 'declined').length, flat: graded.filter(r => r.verdict === 'flat').length, maturing: results.filter(r => r.verdict === 'maturing').length, pending: results.filter(r => r.verdict === 'pending').length },
    notify,
  };
}

// Announce matured optimization results (wins celebrated, no-lift flagged to revisit).
async function notifyMetaResults(brand, notify) {
  if (!notify.length) return;
  const arrow = v => v === 'improved' ? '↑' : v === 'declined' ? '↓' : '→';
  const items = notify.map(r => ({
    action: 'result', url: r.url,
    before: `CTR ${r.baseline.ctr}%`,
    after: `CTR ${r.current.ctr}% (${arrow(r.verdict)}${r.verdict === 'flat' ? ' no change — revisit' : ''})`,
  }));
  try {
    await fetch(`${NEST_SITE}/.netlify/functions/slack-notify`, {
      method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ type: 'seo_work', brand, items }),
    });
  } catch (e) { console.warn(`[content-outcomes] ${brand} result notify failed: ${e.message}`); }
}

// GSC cache key per brand = `gscCache:<gscProperty>` (query-dimension cache:
// { rows:[{keyword,position}] }). Derived from config so a new brand is included.
const { getBrands } = require('./_lib/brands-config');

const MIN_AGE_DAYS   = 14; // give content time to be indexed + re-ranked before judging
const REMEASURE_DAYS = 7;  // re-measure at most weekly so trends accumulate

function daysSince(ms) { return (Date.now() - ms) / 86400000; }

exports.handler = async (event) => {
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not authenticated' }) };
  const store = getStore({
    name:   'seo-tool',
    consistency: 'strong',
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  const summary = {};

  const brandList = await getBrands();
  for (const b of brandList) {
    const brand = b.slug;
    try {
      // Current positions by keyword (best/only row per query in the cache).
      const gsc = await store.get(`gscCache:${b.gscProperty}`, { type: 'json' }).catch(() => null);
      const posByKw = {};
      for (const row of (gsc?.rows || [])) {
        if (!row?.keyword || row.position == null) continue;
        const kw = row.keyword.toLowerCase().trim();
        if (posByKw[kw] == null || row.position < posByKw[kw]) posByKw[kw] = row.position;
      }

      const items = await listApprovals({ brand, limit: 500 });
      const outcomes = [];
      let measured = 0, pending = 0, noSignal = 0;

      for (const it of items) {
        if (!['pushed', 'published'].includes(it.status)) continue;
        const kw   = (it.trackingKeyword || it.payload?.targetKeyword || it.payload?.keyword || '').toLowerCase().trim();
        const base = it.positionAtPublish;
        const pub  = it.publishedAt;
        if (!kw || base == null || !pub) continue;

        const age = daysSince(pub);
        if (age < MIN_AGE_DAYS) { pending++; continue; }
        // Throttle re-measurement (but still surface the last known outcome below).
        if (it.outcome?.measuredAt && daysSince(it.outcome.measuredAt) < REMEASURE_DAYS) {
          outcomes.push({ id: it.id, keyword: kw, type: it.type, market: it.market || null, ...it.outcome, stale: false });
          continue;
        }

        const now = posByKw[kw];
        if (now == null) { noSignal++; continue; } // not yet showing in GSC for this keyword

        const delta   = Math.round((base - now) * 10) / 10; // + = improved
        const outcome = {
          measuredAt:        Date.now(),
          positionAtPublish: base,
          positionNow:       now,
          delta,
          ageDays:           Math.round(age),
          verdict:           delta >= 1 ? 'improved' : delta <= -1 ? 'declined' : 'flat',
        };

        await updateApproval(
          it.id,
          { outcome },
          { at: Date.now(), actor: 'system', action: 'outcome_measured',
            note: `"${kw}" ${base}→${now} (Δ${delta >= 0 ? '+' : ''}${delta})` }
        ).catch(() => {});

        outcomes.push({ id: it.id, keyword: kw, type: it.type, market: it.market || null, ...outcome });
        measured++;
      }

      // Sort best improvement first for easy reporting.
      outcomes.sort((a, b) => (b.delta || 0) - (a.delta || 0));
      const improved = outcomes.filter(o => o.verdict === 'improved').length;
      const declined = outcomes.filter(o => o.verdict === 'declined').length;

      // Meta/optimization outcomes (CTR impact of live edits) — folded into the same record.
      let meta = { results: [], totals: { tracked: 0 }, notify: [] };
      try { meta = await measureMetaOutcomes(store, brand); }
      catch (e) { console.warn(`[content-outcomes] ${brand} meta-outcomes failed: ${e.message}`); }

      await store.set(`contentOutcomes:${brand}`, JSON.stringify({
        brand,
        updatedAt: new Date().toISOString(),
        totals: { tracked: outcomes.length, improved, declined, flat: outcomes.length - improved - declined, awaitingAge: pending, awaitingSignal: noSignal },
        outcomes,
        metaResults: meta.results,
        metaTotals: meta.totals,
      })).catch(() => {});

      await notifyMetaResults(brand, meta.notify);

      summary[brand] = { measuredThisRun: measured, tracked: outcomes.length, improved, declined, awaitingAge: pending, awaitingSignal: noSignal, metaTracked: meta.totals.tracked, metaResults: meta.notify.length };
      console.log(`[content-outcomes] ${brand} — measured ${measured}, tracked ${outcomes.length} (↑${improved} ↓${declined}), ${pending} too-recent, ${noSignal} no-GSC-signal`);
    } catch (e) {
      console.error(`[content-outcomes] ${brand} failed: ${e.message}`);
      summary[brand] = { error: e.message };
    }
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, summary }) };
};
