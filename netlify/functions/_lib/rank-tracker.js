// netlify/functions/_lib/rank-tracker.js
// Shared rank-tracker logic (position-over-time per tracked keyword, per market).
// Used by the rank-tracker endpoint (read + curate) AND the weekly scheduler cron
// (append this week's positions). Single source of truth so both agree.
//
// STORAGE (config-driven, scalable per CLAUDE.md #12 — keyed brand×market):
//   trackedKeywords:<brand>:<market> = { brand, market, keywords:[{ keyword, vol, kd,
//       targetPage, intent, tier, pinned, aspirational, source, addedAt }], seededAt, updatedAt }
//   rankHistory:<brand>:<market>     = { <keywordLower>: [{ date:'YYYY-MM-DD', pos:Number|null }] }
//
// METHODOLOGY (locked — matches market-traffic): positions are attributed to a
// market by the PAGE Google serves (shared marketForUrl), NOT by query text — the
// whole-property query-only snapshot floods every market with UAE positions.

const { getMarketsForBrand, marketForUrl } = require('./international-config');

const HISTORY_CAP = 26; // ~6 months of weekly points; oldest trimmed
const SEED_LIMIT  = 25; // top-N worklist opportunities auto-seeded on first view

// [{ key, label, flag }] for a brand incl. UAE (the base property market). Derived
// from the single market config — a new brand/market appears here with no code edit.
function marketsForBrand(brand) {
  const intl = Object.entries(getMarketsForBrand(brand))
    .map(([key, m]) => ({ key, label: m.label || key, flag: m.flag || '🌍' }));
  return [{ key: 'uae', label: 'UAE', flag: '🇦🇪' }, ...intl];
}

const oppKey     = (brand, market) => market === 'uae' ? `keywordOpportunities:${brand}` : `keywordOpportunities:${brand}:${market}`;
const trackedKey = (brand, market) => `trackedKeywords:${brand}:${market}`;
const historyKey = (brand, market) => `rankHistory:${brand}:${market}`;

// Build tracked-keyword entries from the DATA-DRIVEN worklist opportunities (not the
// hand-authored seed list). Takes the top-N by the worklist's own score order.
async function seedFromWorklist(store, brand, market, limit = SEED_LIMIT) {
  const data = await store.get(oppKey(brand, market), { type: 'json' }).catch(() => null);
  const opps = Array.isArray(data?.opportunities) ? data.opportunities : [];
  return opps.slice(0, limit).map(o => ({
    keyword:      o.keyword,
    vol:          o.volume ?? null,
    kd:           o.kd ?? null,
    targetPage:   o.targetPage || o.existingPage || null,
    intent:       o.intent || null,
    tier:         o.tier || null,
    pinned:       false,
    aspirational: false,
    source:       'worklist',
    addedAt:      Date.now(),
  }));
}

async function getTracked(store, brand, market) {
  return store.get(trackedKey(brand, market), { type: 'json' }).catch(() => null);
}

async function saveTracked(store, brand, market, set) {
  const clean = { ...set, brand, market, updatedAt: Date.now() };
  await store.setJSON(trackedKey(brand, market), clean);
  return clean;
}

// Lazy-seed on first read: if no tracked set exists for this brand×market, create
// one from the worklist. Returns the set (may have an empty keyword list if the
// worklist hasn't run for that market yet).
async function ensureTracked(store, brand, market) {
  const existing = await getTracked(store, brand, market);
  if (existing && Array.isArray(existing.keywords)) return existing;
  const keywords = await seedFromWorklist(store, brand, market);
  const set = { brand, market, keywords, seededAt: Date.now(), updatedAt: Date.now() };
  await store.setJSON(trackedKey(brand, market), set);
  return set;
}

async function getHistory(store, brand, market) {
  return (await store.get(historyKey(brand, market), { type: 'json' }).catch(() => null)) || {};
}

// Append this week's position for every tracked keyword across ALL of a brand's
// markets, from ONE page+query pull of the whole property. Only markets that already
// have a tracked set are updated (we don't invent tracking). Idempotent per date.
// Returns { market: keywordCount } for logging.
async function updateRankHistory(store, brand, pageQueryRows, dateStr) {
  const date    = dateStr || new Date().toISOString().slice(0, 10);
  const markets = marketsForBrand(brand).map(m => m.key);
  const updated = {};
  for (const market of markets) {
    const set = await getTracked(store, brand, market);
    if (!set || !Array.isArray(set.keywords) || !set.keywords.length) continue;

    // Best (lowest) position per keyword among rows whose PAGE belongs to this market.
    const best = {};
    for (const r of (pageQueryRows || [])) {
      if (!r.keyword || r.position == null) continue;
      if (marketForUrl(r.page, brand) !== market) continue;
      const k = r.keyword.toLowerCase();
      if (best[k] == null || r.position < best[k]) best[k] = r.position;
    }

    const hist = await getHistory(store, brand, market);
    for (const kwObj of set.keywords) {
      const k   = String(kwObj.keyword).toLowerCase();
      const pos = best[k] != null ? best[k] : null; // null = not ranking (outside returned rows)
      const arr = Array.isArray(hist[k]) ? hist[k] : [];
      const i   = arr.findIndex(p => p.date === date);
      if (i >= 0) arr[i] = { date, pos };
      else arr.push({ date, pos });
      while (arr.length > HISTORY_CAP) arr.shift();
      hist[k] = arr;
    }
    await store.setJSON(historyKey(brand, market), hist);
    updated[market] = set.keywords.length;
  }
  return updated;
}

// Position → visibility weight (rough CTR-shaped curve). Used for the summary score.
function posWeight(pos) {
  if (pos == null) return 0;
  if (pos <= 3)  return 1;
  if (pos <= 10) return 0.6;
  if (pos <= 20) return 0.3;
  if (pos <= 50) return 0.1;
  return 0;
}

// Compute the read-model view for a tracked set + its history + branded classifier.
// isBranded: (keyword) => boolean. Returns { keywords:[...], summary:{...} }.
// The summary is computed over NON-BRANDED keywords only (the real SEO KPI); the
// operational UI can recompute per its active filter from the returned rows.
function buildView(set, history, isBranded) {
  const keywords = (set.keywords || []).map(kw => {
    const k    = String(kw.keyword).toLowerCase();
    const arr  = Array.isArray(history[k]) ? history[k] : [];
    const pts  = arr.filter(p => p.pos != null);
    const current  = pts.length ? pts[pts.length - 1].pos : null;
    const previous = pts.length > 1 ? pts[pts.length - 2].pos : null;
    // delta > 0 = improved (moved UP the results, lower number is better)
    const delta = (current != null && previous != null) ? Math.round((previous - current) * 10) / 10 : null;
    return {
      ...kw,
      branded:  !!(isBranded && isBranded(kw.keyword)),
      current,
      previous,
      delta,
      history:  arr, // full [{date,pos}] incl. nulls for the sparkline
    };
  });

  const nb      = keywords.filter(k => !k.branded);
  const ranked  = nb.filter(k => k.current != null);
  const summary = {
    tracked:    nb.length,
    ranking:    ranked.length,
    top3:       nb.filter(k => k.current != null && k.current <= 3).length,
    top10:      nb.filter(k => k.current != null && k.current <= 10).length,
    improving:  nb.filter(k => k.delta != null && k.delta > 0).length,
    declining:  nb.filter(k => k.delta != null && k.delta < 0).length,
    avgPosition: ranked.length ? Math.round((ranked.reduce((s, k) => s + k.current, 0) / ranked.length) * 10) / 10 : null,
    visibility:  nb.length ? Math.round(100 * nb.reduce((s, k) => s + posWeight(k.current), 0) / nb.length) : 0,
  };
  return { keywords, summary };
}

module.exports = {
  HISTORY_CAP, SEED_LIMIT,
  marketsForBrand, oppKey, trackedKey, historyKey,
  seedFromWorklist, getTracked, saveTracked, ensureTracked, getHistory,
  updateRankHistory, buildView, posWeight,
};
