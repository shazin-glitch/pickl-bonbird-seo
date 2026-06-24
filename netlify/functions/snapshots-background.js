// netlify/functions/snapshots-background.js
// Banks trend history for the upcoming monthly reports. GSC, Share-of-Voice,
// backlinks, AI-overview and LLM-mentions already keep their own history — the
// two gaps are GBP (only a latest cache) and speed (technicalSeo:<brand> is
// overwritten each run). This captures dated snapshots of both so month-1
// reports have a trend to show instead of launching empty.
//
// Dated keys, written ONCE PER DAY, never overwritten (mirrors gscSnapshot):
//   gbpSnapshot:<brand>:<YYYY-MM-DD>
//   speedSnapshot:<brand>:<YYYY-MM-DD>
//
// Schedule: Monday 6:00am UTC (after the 4am Monday jobs populate fresh data).
// Manual: GET /.netlify/functions/snapshots-background?brand=pickl

const { getStore } = require('@netlify/blobs');

const SITE_URL = process.env.URL || 'https://yolkseo.netlify.app';

function store() {
  return getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
}

// Write once per day — never overwrite an existing dated snapshot.
async function saveOnce(key, payload) {
  const s = store();
  const existing = await s.get(key, { type: 'json' }).catch(() => null);
  if (existing) return false;
  await s.set(key, JSON.stringify(payload));
  return true;
}

// ── GBP snapshot — ratings / reviews / response rate / photos / health ───────
async function snapshotGbp(brand, dateKey) {
  let data;
  try {
    const res = await fetch(`${SITE_URL}/.netlify/functions/gbp-data?brand=${brand}`);
    data = await res.json();
  } catch (e) { return { ok: false, reason: `gbp fetch failed: ${e.message}` }; }

  if (data?.notConnected) return { ok: false, reason: 'GBP not connected' };
  const locs = (data?.locations || []).filter(l => l.brand === brand);
  if (!locs.length) return { ok: false, reason: 'no locations' };

  const rated           = locs.filter(l => typeof l.rating === 'number');
  const totalReviews    = locs.reduce((s, l) => s + (l.totalReviews || 0), 0);
  const totalUnanswered = locs.reduce((s, l) => s + (l.unansweredReviews || 0), 0);
  const totalPhotos     = locs.reduce((s, l) => s + (l.photoCount || 0), 0);
  const health = { green: 0, amber: 0, red: 0 };
  for (const l of locs) if (health[l.health] != null) health[l.health]++;

  const snapshot = {
    brand, date: dateKey, savedAt: Date.now(),
    locationCount: locs.length,
    avgRating:     rated.length ? Math.round((rated.reduce((s, l) => s + l.rating, 0) / rated.length) * 100) / 100 : null,
    totalReviews, totalUnanswered, totalPhotos,
    // Approx — unanswered is from the fetched review page, good enough for trend.
    responseRateProxy: totalReviews ? Math.round((1 - totalUnanswered / totalReviews) * 1000) / 10 : null,
    health,
    locations: locs.map(l => ({
      id: l.id, name: l.name, rating: l.rating, totalReviews: l.totalReviews,
      unansweredReviews: l.unansweredReviews, photoCount: l.photoCount, health: l.health,
    })),
  };
  const saved = await saveOnce(`gbpSnapshot:${brand}:${dateKey}`, snapshot);
  return { ok: true, saved, locations: locs.length, avgRating: snapshot.avgRating };
}

// ── Speed snapshot — PageSpeed/technical audit (no field-name assumptions) ───
async function snapshotSpeed(brand, dateKey) {
  const audit = await store().get(`technicalSeo:${brand}`, { type: 'json' }).catch(() => null);
  if (!audit) return { ok: false, reason: 'no technicalSeo audit yet' };
  const snapshot = {
    brand, date: dateKey, savedAt: Date.now(),
    summary:         audit.summary         || null,
    results:         audit.results         || [],
    intlResults:     audit.intlResults     || [],
    technicalChecks: audit.technicalChecks || null,
  };
  const saved = await saveOnce(`speedSnapshot:${brand}:${dateKey}`, snapshot);
  return { ok: true, saved, pages: (audit.results || []).length };
}

exports.handler = async (event) => {
  console.log(`[snapshots] Starting — ${new Date().toISOString()}`);
  const dateKey = new Date().toISOString().split('T')[0];
  const qs      = event.queryStringParameters || {};
  const brands  = qs.brand ? [qs.brand] : ['pickl', 'bonbird'];

  const results = {};
  for (const brand of brands) {
    results[brand] = {
      gbp:   await snapshotGbp(brand, dateKey).catch(e => ({ ok: false, reason: e.message })),
      speed: await snapshotSpeed(brand, dateKey).catch(e => ({ ok: false, reason: e.message })),
    };
    console.log(`[snapshots] ${brand}:`, JSON.stringify(results[brand]));
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true, date: dateKey, results }) };
};
