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
const { listApprovals, callClaude, extractJson } = require('./store'); // dedupe + LLM brain
const { citiesForMarketAsync } = require('./international-config'); // config-driven city hubs
const { getBrand, getVertical } = require('./brands-config'); // brand context + off-menu fallback guard

const EXECUTABLE = new Set(['meta_update', 'page_creation', 'blog_draft', 'city_hub']);

// ── THE BRAIN: one Claude call that clusters, judges relevance, picks the asset type,
// and prioritises into a launch set — the SEO-strategist decision layer. Rules can't
// cluster "chicken tenders" + "best chicken tenders lahore" into one page, or know
// "bun bo hue" isn't halal fried chicken. Returns a validated plan, or null on failure
// (caller falls back to the rule-based path). ONE call per plan-build (cheap).
async function planWithClaude(candidates, cities, ctx, llmFn) {
  const call = llmFn || callClaude;
  if ((!candidates.length && !cities.length) || typeof call !== 'function') return null;

  // Cap the set sent to Claude so the call fits Netlify's synchronous function limit
  // (~26s). Top by volume = highest-value first; the rest are lower-priority tail.
  const topCands = [...candidates].sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 50);
  const kwLines = topCands.map(c =>
    `- "${c.keyword}" (vol ${c.volume || 0}${c.target ? `, we rank via ${String(c.target).replace(/^https?:\/\/[^/]+/, '')} @#${c.position || '?'}` : ', no page yet'})`).join('\n');
  const cityLines = cities.length
    ? cities.map(c => `- ${c.city} [slug: ${c.slug}] — venues: ${(c.venues || []).map(v => v.name).join(', ') || '—'}`).join('\n')
    : '(no configured cities)';

  const system = `You are a senior SEO strategist for ${ctx.brandName} — ${ctx.sells} — planning for ${ctx.marketLabel}. You produce a tight, high-quality launch plan, NOT a page-per-keyword dump.`;
  const prompt = `Build a launch content plan for ${ctx.brandName} in ${ctx.marketLabel}.

CANDIDATE KEYWORDS (from research + current rankings):
${kwLines || '(none)'}

CONFIGURED CITIES (real venues — a city hub is allowed ONLY for these; never invent one):
${cityLines}

RULES:
- CLUSTER keyword variants that should live on ONE page (e.g. "chicken tenders" + "best chicken tenders lahore" → one page). One plan item per cluster, with a primaryKeyword + the clustered keywords.
- DROP anything not relevant to ${ctx.sells} (e.g. other cuisines, competitor brand names, informational-only noise with no business value). List drops with a reason.
- Choose assetType per cluster:
  • "city_hub" — ONLY for a configured city above (set "city" to its slug).
  • "page_creation" — a commercial/category/local landing page we don't have.
  • "blog_draft" — genuinely informational intent.
  • "meta_update" — ONLY when we already rank via a REAL dedicated page (not the homepage / market hub); set "target" to that URL.
- PRIORITISE by business value (volume × intent × winnability) and cap the plan to the ~15 highest-value items — a focused launch, not everything.

Return ONLY JSON:
{"plan":[{"primaryKeyword":"...","keywords":["..."],"assetType":"page_creation|blog_draft|meta_update|city_hub","target":"<url or null>","city":"<slug or null>","priority":1,"rationale":"one line"}],"dropped":[{"keyword":"...","reason":"..."}]}`;

  try {
    const { text } = await call(prompt, { system, max_tokens: 2500 });
    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.plan)) return null;
    return parsed;
  } catch (e) { console.warn('[market-planner] LLM plan failed, falling back to rules:', e.message); return null; }
}

// Validate/sanitise an LLM plan item into our executable item shape. Enforces the
// safety guards the LLM must not bypass: executable asset only, and a city_hub must
// reference a REAL configured city slug (never an invented one).
function _normalizeLlmItem(it, citySlugs) {
  if (!it || !it.primaryKeyword) return null;
  let assetType = EXECUTABLE.has(it.assetType) ? it.assetType : 'page_creation';
  let city = null;
  if (assetType === 'city_hub') {
    city = String(it.city || '').toLowerCase();
    if (!citySlugs.has(city)) return null; // invented/unknown city → drop (rule: config only)
  }
  return {
    keyword:   it.primaryKeyword,
    keywords:  Array.isArray(it.keywords) ? it.keywords.slice(0, 20) : [it.primaryKeyword],
    assetType,
    city,
    target:    (assetType === 'meta_update') ? (it.target || null) : null,
    priority:  Number.isFinite(it.priority) ? it.priority : 999,
    rationale: String(it.rationale || '').slice(0, 300),
    source:    'llm',
  };
}

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
// useLLM (default true): Claude clusters/judges/prioritises. false OR failure → rules.
// llmFn: injectable Claude for testing.
async function buildMarketPlan({ brand, market, useLLM = true, llmFn } = {}) {
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
    queuedCities = new Set(arr.filter(i => i.payload && i.payload.pageType === 'city_hub')
      .map(i => _kw(i.payload.slug || i.payload.city)).filter(Boolean));
  } catch { /* dedupe is best-effort */ }

  // Brand context (for the strategist prompt + fallback off-menu guard).
  let bc = null, offMenu = [];
  try { bc = await getBrand(brand); offMenu = (getVertical(bc && bc.vertical).offMenu) || []; } catch { /* no guard */ }
  const brandName   = (bc && bc.name) || brand;
  const sells       = (bc && bc.cuisine) || (getVertical(bc && bc.vertical).menuSummary) || 'its menu';
  const marketLabel = isUae ? 'UAE' : ((data && data.marketLabel) || market);

  // Candidate opportunities (cheap rule pre-pass: drop winning / queued / off-menu).
  const candidates = opps
    .filter(o => o && o.keyword && !SKIP_TIERS.has(o.tier))
    .filter(o => !queued.has(_kw(o.keyword)))
    .filter(o => !offMenu.some(t => t && _kw(o.keyword).includes(_kw(t))))
    .map(o => ({ keyword: o.keyword, volume: o.volume || 0, tier: o.tier || null,
      target: o.targetPage || o.existingPage || null, position: (o.position == null ? null : o.position) }));

  // Config-driven city-hub candidates (research-independent; never invented).
  const cities = (isUae ? [] : await citiesForMarketAsync(market).catch(() => []))
    .filter(c => c && c.slug && !queuedCities.has(_kw(c.slug)));
  const citySlugs = new Set(cities.map(c => _kw(c.slug)));

  // ── THE BRAIN (default): Claude clusters + judges relevance + picks asset + ranks.
  let items = null, mode = 'rules';
  if (useLLM) {
    const llm = await planWithClaude(candidates, cities, { brandName, sells, marketLabel }, llmFn);
    if (llm && Array.isArray(llm.plan)) {
      const norm = llm.plan.map(it => _normalizeLlmItem(it, citySlugs))
        .filter(Boolean)
        .filter(i => !queued.has(_kw(i.keyword)))
        .filter(i => !(i.assetType === 'city_hub' && queuedCities.has(_kw(i.city))));
      if (norm.length) { items = norm; mode = 'llm'; }
    }
  }

  // ── FALLBACK (LLM off/failed): rule-based assess over opps + config city hubs.
  if (!items) {
    const kwItems = opps
      .filter(o => o && o.keyword && !SKIP_TIERS.has(o.tier))
      .filter(o => !queued.has(_kw(o.keyword)))
      .map(o => {
        const a = _assess(o, offMenu);
        if (a.skip) return null;
        return { keyword: o.keyword, assetType: a.assetType, target: a.target, tier: o.tier || null,
          volume: o.volume || 0, position: (o.position == null ? null : o.position),
          priority: Math.round(((o.score || 0) * 1000)) / 1000, rationale: a.rationale, source: 'rules' };
      })
      .filter(Boolean);
    const cityItems = cities.map(c => ({
      keyword: `${c.city} city hub`, assetType: 'city_hub', city: c.slug, target: null, tier: 'local',
      volume: 0, position: null, priority: Math.round((0.7 + Math.min((c.venues || []).length, 5) * 0.02) * 1000) / 1000,
      rationale: `Local city hub for ${c.city} — venues: ${(c.venues || []).map(v => v.name).join(', ') || '—'}.`, source: 'rules' }));
    items = [...kwItems, ...cityItems];
  }

  items.sort((a, b) => ((b.priority || 0) - (a.priority || 0)) || ((b.volume || 0) - (a.volume || 0)) || _kw(a.keyword).localeCompare(_kw(b.keyword)));
  const counts = items.reduce((c, i) => { c[i.assetType] = (c[i.assetType] || 0) + 1; return c; }, {});

  return {
    brand, market: isUae ? 'uae' : market, sourceKey, mode,
    discoveredAt: (data && (data.updatedAt || data.fetchedAt)) || null,
    total: items.length,
    counts,           // asset-type mix — data-driven, NOT quotas
    items,
  };
}

// ── P3 EXECUTE: plan item → the exact generate-draft call ────────────────────
// ONE mapping, shared by the sync dryRun preview and the background executor, so a
// dry run shows EXACTLY what a real run will send (rule #1: verify what actually runs).
// generate-draft owns every content guard (contentPaused, cannibalization, voice,
// FAQ contract, writable-template, confidence) — we only translate, never bypass.
// Returns { call } or { error } (an un-executable item is reported, never guessed at).
function planItemToDraftCall(item, { brand, market } = {}) {
  if (!brand) return { error: 'brand required' };
  if (!item || !item.keyword) return { error: 'plan item has no keyword' };
  const base = { brand, keyword: item.keyword, market: market || 'uae' };

  switch (item.assetType) {
    case 'city_hub':
      // City must be a configured slug — generate-draft re-checks against
      // citiesForMarketAsync and 400s on an invented one (never trust the plan alone).
      if (!item.city) return { error: 'city_hub item has no city slug' };
      return { call: { ...base, actionType: 'page_creation', pageKind: 'city_hub', city: item.city } };
    case 'meta_update':
      if (!item.target) return { error: 'meta_update item has no target url' };
      return { call: { ...base, actionType: 'meta_update', url: item.target } };
    case 'page_creation':
      return { call: { ...base, actionType: 'page_creation' } };
    case 'blog_draft':
      return { call: { ...base, actionType: 'blog_draft' } };
    default:
      return { error: `unsupported assetType "${item.assetType}"` };
  }
}

// Hard ceiling on one execute run — a runaway selection can't spend unbounded Claude
// credit (each item is a full generation). The UI's topN/budget sits under this.
const MAX_EXECUTE = 25;

// Pick which plan items to execute. `select` accepts keywords (case-insensitive) and/or
// zero-based indices; `topN` takes the highest-priority N (the plan is already sorted).
// Neither given → nothing (explicit selection required; never "execute the whole plan"
// by accident). Always capped at MAX_EXECUTE.
function selectPlanItems(planItems, { select, topN, max = MAX_EXECUTE } = {}) {
  const all = Array.isArray(planItems) ? planItems : [];
  let chosen = [];
  if (Array.isArray(select) && select.length) {
    const kws = new Set(select.filter(s => typeof s === 'string').map(_kw));
    const idx = new Set(select.filter(s => Number.isInteger(s)));
    chosen = all.filter((it, i) => idx.has(i) || kws.has(_kw(it.keyword)));
  } else if (Number.isFinite(topN) && topN > 0) {
    chosen = all.slice(0, topN);
  }
  return chosen.slice(0, Math.max(0, Math.min(max, MAX_EXECUTE)));
}

module.exports = { buildMarketPlan, planWithClaude, planItemToDraftCall, selectPlanItems, MAX_EXECUTE, SKIP_TIERS };
