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
const { authorizeJob } = require('./_lib/auth');
const { listApprovals, updateApproval } = require('./_lib/store');

// GSC cache keys differ per brand (query-dimension cache: { rows:[{keyword,position}] }).
const BRAND_GSC = {
  pickl:   'gscCache:https://eatpickl.com/',
  bonbird: 'gscCache:sc-domain:bonbirdchicken.com',
};

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

  for (const brand of Object.keys(BRAND_GSC)) {
    try {
      // Current positions by keyword (best/only row per query in the cache).
      const gsc = await store.get(BRAND_GSC[brand], { type: 'json' }).catch(() => null);
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

      await store.set(`contentOutcomes:${brand}`, JSON.stringify({
        brand,
        updatedAt: new Date().toISOString(),
        totals: { tracked: outcomes.length, improved, declined, flat: outcomes.length - improved - declined, awaitingAge: pending, awaitingSignal: noSignal },
        outcomes,
      })).catch(() => {});

      summary[brand] = { measuredThisRun: measured, tracked: outcomes.length, improved, declined, awaitingAge: pending, awaitingSignal: noSignal };
      console.log(`[content-outcomes] ${brand} — measured ${measured}, tracked ${outcomes.length} (↑${improved} ↓${declined}), ${pending} too-recent, ${noSignal} no-GSC-signal`);
    } catch (e) {
      console.error(`[content-outcomes] ${brand} failed: ${e.message}`);
      summary[brand] = { error: e.message };
    }
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, summary }) };
};
