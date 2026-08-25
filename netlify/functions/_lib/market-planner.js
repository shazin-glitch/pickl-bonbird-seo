// netlify/functions/_lib/market-planner.js
// ─────────────────────────────────────────────────────────────────────────────
// MARKET PLANNER (P1) — read-only. Turns the per-market opportunity list (already
// scored + given a recommended action by keyword-discovery's recommendAction) into a
// ranked, deduped content PLAN for ONE brand × market. NO Claude, NO writes, NO
// generation. Works cold (research-led: keywordOpportunities:<brand>:<market>) or
// warm (keywordOpportunities:<brand>). Config-driven / scalable (rule #2).
// See /MARKET-PLANNER-PLAN.md. Execution (loop generate-draft) is a later phase.
// ─────────────────────────────────────────────────────────────────────────────

const { getStore } = require('@netlify/blobs');
const { listApprovals } = require('./store'); // dedupe vs already-queued (read-only)
const { citiesForMarketAsync } = require('./international-config'); // config-driven city hubs
const { getBrand, getVertical } = require('./brands-config'); // vertical off-menu for relevance guard

// A target URL is "generic" if it's the homepage or a single-segment market hub
// (e.g. /pk/, /ae/) — GSC mis-attributes cold-market long-tail to these, so they must
// NOT be treated as a real dedicated page (that produced 104 bogus "optimise /pk/"s).
function _isGenericTarget(url) {
  if (!url) return true; // no page at all = treat as generic (needs creation)
  const path = String(url).replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '');
  const segs = path.split('/').filter(Boolean);
  return segs.length <= 1; // '' (home) or '/pk' (market hub) — not a dedicated page
}

// Rough informational-intent check → route to a blog instead of a landing page.
const _INFO_RE = /\b(how|what|why|when|recipe|recipes|vs|guide|ideas|calories|history|best time)\b/i;

// Map an opportunity to an EXECUTABLE generate-draft action, correcting the
// cold-market mis-classification and generate-draft's vocabulary.
//   generate-draft knows: meta_update | page_creation | blog_draft (+ city_hub/template elsewhere)
function _assess(o, offMenu) {
  const kw = String(o.keyword || '').toLowerCase();
  // Relevance guard: drop clearly off-vertical keywords (config-driven off-menu list).
  if (offMenu.some(t => t && kw.includes(String(t).toLowerCase())))
    return { skip: true };

  const raw     = (o.action && o.action.actionType) || 'meta_update';
  const target  = o.targetPage || o.existingPage || null;
  const generic = _isGenericTarget(target);

  // page_update (discovery's "optimise existing page") isn't a generate-draft action.
  if (raw === 'page_update') {
    if (generic) {
      // No real dedicated page (or only the hub/home) → CREATE, not "update".
      return { assetType: _INFO_RE.test(kw) ? 'blog_draft' : 'page_creation', target: null,
        rationale: `No dedicated page yet (ranked via ${target || 'nothing'}) — create one for "${o.keyword}".` };
    }
    // A real, specific page → the safe executable move is a meta improvement.
    return { assetType: 'meta_update', target,
      rationale: (o.action && o.action.rationale) || `Improve meta on ${target} for "${o.keyword}".` };
  }
  // meta_update / page_creation / blog_draft pass through (but a meta_update pointed at a
  // generic page should become a real page).
  if (raw === 'meta_update' && generic)
    return { assetType: 'page_creation', target: null,
      rationale: `Only the homepage/market hub ranks for "${o.keyword}" — needs a dedicated page.` };
  return { assetType: raw, target: (raw === 'page_creation' || raw === 'blog_draft') ? null : target,
    rationale: (o.action && o.action.rationale) || (o.action && o.action.label) || '' };
}

function store() {
  return getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
}

// Tiers that need NO action: already winning (top3/top10) or just watch (monitor).
const SKIP_TIERS = new Set(['top3', 'top10', 'monitor']);

const _kw = k => String(k || '').toLowerCase().trim();

// Build the plan for one brand × market. `market` omitted/'uae' = home market.
async function buildMarketPlan({ brand, market } = {}) {
  if (!brand) return { brand: null, market: market || 'uae', total: 0, items: [], error: 'brand required' };
  const isUae   = !market || market === 'uae';
  const sourceKey = isUae ? `keywordOpportunities:${brand}` : `keywordOpportunities:${brand}:${market}`;

  const data = await store().get(sourceKey, { type: 'json' }).catch(() => null);
  const opps = (data && Array.isArray(data.opportunities)) ? data.opportunities : [];

  // Don't re-plan what's already queued (pending) for this brand.
  let queued = new Set();
  let queuedCities = new Set();
  try {
    const pending = await listApprovals({ brand, status: 'pending' }).catch(() => []);
    const arr = Array.isArray(pending) ? pending : (pending && pending.items) || [];
    queued = new Set(arr.map(i => _kw(i.payload && (i.payload.targetKeyword || i.payload.keyword))).filter(Boolean));
    // city hubs are queued as page_creation with payload.pageType === 'city_hub' + a slug
    queuedCities = new Set(arr.filter(i => i.payload && i.payload.pageType === 'city_hub')
      .map(i => _kw(i.payload.slug || i.payload.city)).filter(Boolean));
  } catch { /* dedupe is best-effort */ }

  // Off-menu terms for this brand's vertical → relevance guard (config-driven).
  let offMenu = [];
  try { const bc = await getBrand(brand); offMenu = (getVertical(bc && bc.vertical).offMenu) || []; } catch { /* no guard */ }

  const items = opps
    .filter(o => o && o.keyword && !SKIP_TIERS.has(o.tier))          // skip already-winning / monitor
    .filter(o => !queued.has(_kw(o.keyword)))                         // skip already-queued
    .map(o => {
      const a = _assess(o, offMenu);
      if (a.skip) return null;
      return {
        keyword:   o.keyword,
        assetType: a.assetType,                                       // EXECUTABLE: meta_update|page_creation|blog_draft
        target:    a.target,
        tier:      o.tier || null,
        volume:    o.volume || 0,
        position:  (o.position == null ? null : o.position),
        priority:  Math.round(((o.score || 0) * 1000)) / 1000,       // discovery's composite score
        rationale: a.rationale,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.priority - a.priority) || (b.volume - a.volume) || _kw(a.keyword).localeCompare(_kw(b.keyword)));

  // ── CONFIG-DRIVEN ASSETS (research-independent) ──────────────────────────────
  // City hubs come from the venue config (citiesForMarketAsync), NOT from keyword
  // data — so a market DataForSEO doesn't cover (e.g. Oman/Qatar have 0 keyword
  // ideas) still gets a real plan. One hub per configured city that isn't already
  // queued. Execution's create_page duplicate-guard blocks any city that already
  // has a page (e.g. UAE legacy /ae/dubai/), so we don't need a WP read here.
  // UAE ('uae') isn't in the market config → no city hubs (correct: new-cities-only).
  let cityHubItems = [];
  try {
    const cities = isUae ? [] : (await citiesForMarketAsync(market).catch(() => []));
    cityHubItems = (cities || [])
      .filter(c => c && c.slug && !queuedCities.has(_kw(c.slug)))
      .map(c => ({
        keyword:   `${c.city} city hub`,
        assetType: 'city_hub',
        city:      c.slug,
        target:    null,
        tier:      'local',
        volume:    0,                                   // no keyword-volume data (config-driven)
        position:  null,
        priority:  Math.round((0.7 + Math.min((c.venues || []).length, 5) * 0.02) * 1000) / 1000,
        rationale: `Local city hub for ${c.city} — venues: ${(c.venues || []).map(v => v.name).join(', ') || '—'}.`,
      }));
  } catch { /* config assets are best-effort */ }

  const allItems = [...items, ...cityHubItems]
    .sort((a, b) => (b.priority - a.priority) || (b.volume - a.volume) || _kw(a.keyword).localeCompare(_kw(b.keyword)));

  const counts = allItems.reduce((c, i) => { c[i.assetType] = (c[i.assetType] || 0) + 1; return c; }, {});

  return {
    brand,
    market: isUae ? 'uae' : market,
    sourceKey,
    discoveredAt: (data && (data.updatedAt || data.fetchedAt)) || null,
    total: allItems.length,
    counts,           // e.g. { meta_update: 3, page_creation: 4, blog_draft: 6, city_hub: 2 } — data-driven, NOT quotas
    items: allItems,
  };
}

module.exports = { buildMarketPlan, SKIP_TIERS };
