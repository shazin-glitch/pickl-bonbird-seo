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
  try {
    const pending = await listApprovals({ brand, status: 'pending' }).catch(() => []);
    const arr = Array.isArray(pending) ? pending : (pending && pending.items) || [];
    queued = new Set(arr.map(i => _kw(i.payload && (i.payload.targetKeyword || i.payload.keyword))).filter(Boolean));
  } catch { /* dedupe is best-effort */ }

  const items = opps
    .filter(o => o && o.keyword && !SKIP_TIERS.has(o.tier))          // skip already-winning / monitor
    .filter(o => !queued.has(_kw(o.keyword)))                         // skip already-queued
    .map(o => {
      const act = o.action || {};
      return {
        keyword:   o.keyword,
        assetType: act.actionType || 'meta_update',                  // meta_update | page_creation | blog_draft
        target:    o.targetPage || o.existingPage || null,           // existing page to improve, or null = new
        tier:      o.tier || null,
        volume:    o.volume || 0,
        position:  (o.position == null ? null : o.position),
        priority:  Math.round(((o.score || 0) * 1000)) / 1000,       // discovery's composite score
        rationale: act.rationale || act.label || '',
      };
    })
    .sort((a, b) => (b.priority - a.priority) || (b.volume - a.volume) || _kw(a.keyword).localeCompare(_kw(b.keyword)));

  const counts = items.reduce((c, i) => { c[i.assetType] = (c[i.assetType] || 0) + 1; return c; }, {});

  return {
    brand,
    market: isUae ? 'uae' : market,
    sourceKey,
    discoveredAt: (data && (data.updatedAt || data.fetchedAt)) || null,
    total: items.length,
    counts,           // e.g. { meta_update: 3, page_creation: 4, blog_draft: 6 } — data-driven, NOT quotas
    items,
  };
}

module.exports = { buildMarketPlan, SKIP_TIERS };
