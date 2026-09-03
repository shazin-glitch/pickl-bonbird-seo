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
const { citiesForMarketAsync, INTERNATIONAL_MARKETS } = require('./international-config'); // config-driven city hubs
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

  // Top by volume = highest-value first; the rest are lower-priority tail.
  // NOTE: the old 50/2500 squeeze existed only to fit the SYNCHRONOUS function limit
  // (v7.9.22). v7.9.23 moved the build into a background function with a 15-min budget,
  // so that constraint is obsolete — and it had become harmful: a richer prompt made the
  // model's JSON overrun 2500 tokens, so extractJson returned null and every build
  // silently fell back to `mode:'rules'` (a 43-item unclustered dump). Verified live.
  const topCands = [...candidates].sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 80);
  const kwLines = topCands.map(c =>
    `- "${c.keyword}" (vol ${c.volume || 0}${c.target ? `, we rank via ${String(c.target).replace(/^https?:\/\/[^/]+/, '')} @#${c.position || '?'}` : ', no page yet'})`).join('\n');
  const cityLines = cities.length
    ? cities.map(c => `- ${c.city} [slug: ${c.slug}] — venues: ${(c.venues || []).map(v => v.name).join(', ') || '—'}`).join('\n')
    : '(no configured cities)';

  const system = `You are a senior SEO strategist for ${ctx.brandName} — a ${ctx.promptNoun}, ${ctx.sells} — planning for ${ctx.marketLabel}. You produce a tight, high-quality launch plan, NOT a page-per-keyword dump.`;
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
- WHAT WINS FOR THIS BRAND: ${ctx.assetHint}
- ⚠️ WE HAVE VENUES ONLY IN: ${ctx.cityList || 'no cities (this brand has no venues — do NOT propose local, "near me", venue or city pages at all)'}. NEVER propose a local/location page for a city we are not in — that is a doorway page. Drop those keywords.
- ⚠️ "near me" / "nearest" / "nearby" keywords are answered by Google's LOCAL PACK from our Google Business Profile, NOT by a web page — a page cannot be "near" anyone. Never create a page or blog targeting the literal phrase. Instead CLUSTER that demand into the relevant city_hub above, or drop it. A generic category near-me term (e.g. "restaurants near me" for a specialist brand) is off-brand — drop it.
${ctx.commodityTerms && ctx.commodityTerms.length ? `- ⚠️ TABLE STAKES in ${ctx.marketLabel}, NEVER an angle: ${ctx.commodityTerms.join(', ')}. Every competitor here is the same, so it differentiates nothing. Treat "${ctx.commodityTerms[0]} X" and "X" as the SAME intent — cluster them into ONE item using the BASE keyword, and never make it the primary keyword or the page's selling point.\n` : ''}- ⚠️ NO TWO ITEMS MAY COMPETE WITH EACH OTHER. Before finalising, check every pair: if two items would serve the same product, intent or searcher — even under different words (e.g. "chicken burger" and "chicken sandwich" are the SAME product; a city hub and a local landing page for that same city are the SAME intent) — MERGE them into one item and list the loser in "dropped" with the reason. Shipping two pages for one intent splits authority and both lose. Exactly ONE item may own local/city intent for a given city: the city_hub.
- PRIORITISE by business value (volume × intent × winnability) and cap the plan to the ~15 highest-value items — a focused launch, not everything.

Return ONLY JSON:
{"plan":[{"primaryKeyword":"...","keywords":["..."],"assetType":"page_creation|blog_draft|meta_update|city_hub","target":"<url or null>","city":"<slug or null>","priority":1,"rationale":"one line"}],"dropped":[{"keyword":"...","reason":"..."}]}`;

  try {
    const { text } = await call(prompt, { system, max_tokens: 8000 });
    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.plan)) {
      console.warn(`[market-planner] LLM returned unparseable/!plan JSON (${(text || '').length} chars) — falling back to rules. Likely a max_tokens truncation.`);
      return null;
    }
    return parsed;
  } catch (e) { console.warn('[market-planner] LLM plan failed, falling back to rules:', e.message); return null; }
}

// ── IMPLICIT-LOCATION ("near me") + NO-VENUE-CITY GUARD ─────────────────────
// Google rewrites "near me"/"nearest" to the searcher's own coordinates and answers
// with the LOCAL PACK, which is ranked by Google Business Profile signals — proximity,
// prominence, categories, reviews — not by a web page. A page cannot be "near" anyone,
// so a landing page targeting the literal phrase is unrankable by construction. The
// demand is real; the right vessels are GBP + a CITY HUB / area page that ranks for the
// rewritten intent ("fried chicken in Gulberg, Lahore"). So: city_hub items are ALWAYS
// allowed to carry near-me demand (that IS the correct asset) — every other asset type
// targeting an implicit-location query is dropped and routed to local/GBP work.
// Live evidence (Bonbird Pakistan, v7.9.24): the plan queued page_creation for
// "restaurants near me", "nearest chicken shop to me" and "best fast food deals near me".
const _NEAR_ME_RE = /\b(near\s*me|nearest|near\s*by|nearby|close\s*to\s*me|around\s*me)\b/i;
// "<something> in <place>" — the explicit-city form. Used to catch a city we have NO
// venue in (live: "best burger in karachi" — Bonbird has no Karachi venue).
const _IN_CITY_RE = /\b(?:in|at|near)\s+([a-z\u0600-\u06FF][\w\u0600-\u06FF'-]+(?:\s+[a-z\u0600-\u06FF][\w\u0600-\u06FF'-]+)?)\s*$/i;

// Does the keyword name a city we actually have venues in? Config-driven — the city
// list comes from citiesForMarketAsync (venues), never a hardcoded gazetteer.
function _mentionsConfiguredCity(keyword, cityNames) {
  const kw = _kw(keyword);
  return cityNames.some(c => c && kw.includes(_kw(c)));
}

// ── COMMODITY TERMS ─────────────────────────────────────────────────────────
// A term that is TABLE STAKES in this market is not an SEO angle. Bonbird: every one of
// its markets (UAE, PK, QA, OM) is Muslim-majority, so every competitor is halal too —
// "halal fried chicken lahore" and "fried chicken lahore" are the same intent, and
// building a separate asset for the halal variant splits authority for no gain. GSC will
// keep showing halal queries; that is demand for fried chicken, already served by the
// base term. So we NORMALISE (strip the term) and let the dedupe fold the variant into
// the base keyword, rather than dropping the demand. Config-driven per brand, with a
// per-market override for a market where the term IS a differentiator (e.g. a UK entry).
function commodityTermsFor(brandCfg, marketKey) {
  const byMarket = (brandCfg && brandCfg.commodityTermsByMarket) || {};
  if (marketKey && Object.prototype.hasOwnProperty.call(byMarket, marketKey)) {
    return (byMarket[marketKey] || []).map(t => String(t).toLowerCase());
  }
  return ((brandCfg && brandCfg.commodityTerms) || []).map(t => String(t).toLowerCase());
}

// "halal fried chicken lahore" → "fried chicken lahore". Returns the original when
// stripping would leave nothing meaningful (a keyword that is ONLY the commodity term).
function stripCommodityTerms(keyword, terms) {
  if (!terms.length) return keyword;
  let out = String(keyword || '');
  for (const t of terms) {
    out = out.replace(new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ');
  }
  out = out.replace(/\s+/g, ' ').trim();
  return out.length >= 3 ? out : keyword;
}

// Menu synonym map (config-driven, per brand): wrong-name → canonical menu term, so
// GSC demand under the wrong word ("chicken fingers") folds into the right page
// ("chicken tenders") instead of spawning a fabricated product page. Keys lowercased.
function menuSynonymsFor(brandCfg) {
  const raw = (brandCfg && brandCfg.menuSynonyms) || {};
  const out = {};
  for (const [from, to] of Object.entries(raw)) out[String(from).toLowerCase()] = String(to);
  return out;
}
// "chicken fingers lahore" → "chicken tenders lahore". Whole-phrase, case-insensitive.
function applyMenuSynonyms(keyword, synMap) {
  if (!keyword || !synMap || !Object.keys(synMap).length) return keyword;
  let out = String(keyword);
  for (const [from, to] of Object.entries(synMap)) {
    out = out.replace(new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), to);
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Returns a drop reason, or null to keep. `cityNames` = configured city names + slugs.
function _localIntentDrop(item, cityNames) {
  // A city hub is the CORRECT home for local + near-me demand, and its city slug has
  // already been validated against the config — never drop it here.
  if (item.assetType === 'city_hub') return null;
  const kw = String(item.keyword || '');

  if (_NEAR_ME_RE.test(kw)) {
    return 'Implicit-location ("near me") query — answered by the local pack from Google Business Profile, not by a page. Route to GBP + the relevant city hub.';
  }
  const m = kw.match(_IN_CITY_RE);
  if (m && !_mentionsConfiguredCity(kw, cityNames)) {
    return `Targets "${m[1]}", where we have no configured venue — a local page for a city we are not in is a doorway page. Add the venue in Settings first, or drop.`;
  }
  return null;
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
// Compare targets by PATH — the same page arrives as an absolute URL from one source
// and a root-relative one from another, and they must count as the same page.
const _pathOf = u => String(u || '').replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '').toLowerCase() || null;

// Build the plan for one brand × market. `market` omitted/'uae' = home market.
// useLLM (default true): Claude clusters/judges/prioritises. false OR failure → rules.
// llmFn: injectable Claude for testing.
async function buildMarketPlan({ brand, market, useLLM = true, llmFn, verifyTargets = false, site, headers } = {}) {
  if (!brand) return { brand: null, market: market || 'uae', total: 0, items: [], error: 'brand required' };
  const isUae   = !market || market === 'uae';
  const sourceKey = isUae ? `keywordOpportunities:${brand}` : `keywordOpportunities:${brand}:${market}`;

  const data = await store().get(sourceKey, { type: 'json' }).catch(() => null);
  const opps = (data && Array.isArray(data.opportunities)) ? data.opportunities : [];

  // Don't re-plan what's already queued (pending) for this brand.
  let queued = new Set();
  let queuedCities = new Set();
  let queuedKeywords = [];   // raw keywords already queued/live, kept so the commodity +
                             // signature dedups can compare NEW items against what ALREADY
                             // EXISTS, not just against each other (the cross-run gap, v7.9.37).
  const kwStatus = new Map(); // _kw(keyword) -> 'live' | 'queued', for the skip-reason wording
  try {
    // Dedup against everything that already EXISTS or is in-flight — not just pending
    // (v7.9.55). A page published last week must not be re-proposed. pending/approved =
    // in-flight ("queued"); pushed/published = live. rejected/failed stay re-proposable.
    const all = await listApprovals({ brand }).catch(() => []);
    const arr = Array.isArray(all) ? all : (all && all.items) || [];
    const DEDUP = { pending: 'queued', approved: 'queued', pushed: 'live', published: 'live' };
    const _st = i => DEDUP[i.status || 'pending'];   // a status-less item is effectively pending
    const relevant = arr.filter(_st);
    // Dedup against the PRIMARY *and* every CLUSTER member of each queued/live item, so a
    // variant already covered by a shipped page (e.g. "fried chicken al khoudh" folded into
    // the Seeb hub) is never proposed again as its own page (v7.9.60).
    const kwsOf = i => {
      const p = i.payload || {};
      return [p.targetKeyword || p.keyword, ...(Array.isArray(p.keywords) ? p.keywords : [])].filter(Boolean);
    };
    queuedKeywords = relevant.flatMap(kwsOf);
    queued = new Set(queuedKeywords.map(_kw));
    queuedCities = new Set(relevant.filter(i => i.payload && i.payload.pageType === 'city_hub')
      .map(i => _kw(i.payload.slug || i.payload.city)).filter(Boolean));
    for (const i of relevant) for (const k of kwsOf(i)) kwStatus.set(_kw(k), _st(i));
  } catch { /* dedupe is best-effort */ }

  // Brand context (for the strategist prompt + fallback off-menu guard).
  let bc = null, offMenu = [], vert = getVertical(null);
  try {
    bc = await getBrand(brand); vert = getVertical(bc && bc.vertical);
    // Off-menu = the vertical's list PLUS a brand-specific list (rule #2: per-brand data
    // in config, not a code literal). Bonbird excludes "peri peri" — it sells Nashville-
    // style fried chicken, not peri-peri, so those keywords are off-brand (like the
    // "bun bo hue" case). Confirmed with Shazin 2026-08-26.
    offMenu = [...(vert.offMenu || []), ...((bc && bc.offMenu) || [])];
  } catch { /* no guard */ }
  const menuSyn = menuSynonymsFor(bc);   // wrong-name → canonical menu term (config)
  const commodityTerms = commodityTermsFor(bc, isUae ? 'uae' : market);
  const brandName   = (bc && bc.name) || brand;
  const sells       = (bc && bc.cuisine) || (getVertical(bc && bc.vertical).menuSummary) || 'its menu';
  const marketLabel = isUae ? 'UAE' : ((data && data.marketLabel) || market);

  // Candidate opportunities (cheap rule pre-pass: drop winning / queued / off-menu).
  const candidates = opps
    .filter(o => o && o.keyword && !SKIP_TIERS.has(o.tier))
    .filter(o => !queued.has(_kw(o.keyword)))
    .filter(o => !offMenu.some(t => t && _kw(o.keyword).includes(_kw(t))))
    // Fold wrong-name demand into the canonical menu term BEFORE clustering, so the LLM
    // sees "chicken tenders" (not "chicken fingers") and never proposes an off-menu page.
    .map(o => ({ keyword: applyMenuSynonyms(o.keyword, menuSyn), volume: o.volume || 0, tier: o.tier || null,
      target: o.targetPage || o.existingPage || null, position: (o.position == null ? null : o.position) }));

  // TWO DIFFERENT LISTS — conflating them caused a live regression (v7.9.36):
  //  · allCities  = every city we have venues in. This is the PRESENCE truth, used for
  //    the "we have venues only in X" prompt line and the no-venue/doorway guard.
  //  · cities     = those still NEEDING a hub (queued ones removed) — hub candidates only.
  // Using the filtered list for presence meant that once the Lahore hub was queued,
  // Lahore stopped counting as a venue city and every legitimate Lahore keyword was
  // dropped as "a city we are not in". With all hubs queued it would have told Claude we
  // have no venues at all and suppressed local content everywhere.
  // HOME-MARKET CITY HUBS (v7.9.38). Previously `isUae ? []` hard-disabled hubs for the
  // home market — right for Bonbird/Pickl (legacy static /ae/* pages) but wrong for a
  // UAE-native brand like Southpour (a Dubai cafe that WANTS city hubs). Now driven by
  // config: a brand's home venues live in a `<brand>_uae` market record; if none exists,
  // no hubs (safe). A brand whose home market is legacy-static opts out explicitly so a
  // future bonbird_uae record can never accidentally spawn hubs that collide with /ae/*.
  const homeMarketKey = `${brand}_uae`;
  const cityMarketKey = isUae ? homeMarketKey : market;
  const suppressHomeHubs = isUae && !!(bc && bc.legacyHomeMarket);
  const allCities = (suppressHomeHubs ? [] : await citiesForMarketAsync(cityMarketKey).catch(() => []))
    .filter(c => c && c.slug);
  const cities = allCities.filter(c => !queuedCities.has(_kw(c.slug)));
  const citySlugs = new Set(cities.map(c => _kw(c.slug)));

  // ── THE BRAIN (default): Claude clusters + judges relevance + picks asset + ranks.
  let items = null, mode = 'rules';
  if (useLLM) {
    const llm = await planWithClaude(candidates, cities, {
      brandName, sells, marketLabel,
      promptNoun: vert.promptNoun, assetHint: vert.assetHint || '',
      cityList: allCities.map(c => c.city).join(', '),
      commodityTerms,
    }, llmFn);
    if (llm && Array.isArray(llm.plan)) {
      const norm = llm.plan.map(it => _normalizeLlmItem(it, citySlugs))
        .filter(Boolean)
        // NB: don't silently drop already-queued/live keywords here — let them flow to the
        // signature-dedup below, which drops them WITH a reason ("already published" /
        // "already in the Approvals queue") so the skip is visible, not invisible (v7.9.55).
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

  // ── HARD GUARDS the LLM must not bypass (it is told these rules; this enforces them).
  // Config-driven: the allowed city list comes from venue config, never a literal.
  const cityNames = [...allCities.map(c => c.city), ...allCities.map(c => c.slug)].filter(Boolean);
  const dropped = [];

  // OFF-MENU is a hard guard, not just a candidate pre-filter — the LLM is told the brand's
  // menu but can still emit an off-brand keyword (e.g. "peri peri" for Bonbird), so enforce
  // it on the FINAL items too (v7.9.38). offMenu = vertical list + brand list.
  items = items.filter((it) => {
    const kw = _kw(it.keyword);
    const hit = offMenu.find(t => t && kw.includes(_kw(t)));
    if (hit) { dropped.push({ keyword: it.keyword, assetType: it.assetType,
      reason: `Off-brand — "${hit}" isn't something ${brandName} sells.` }); return false; }
    return true;
  });

  // Enforce menu synonyms on the FINAL items too — the LLM can still emit a wrong-name
  // keyword from its own knowledge; remap so it lands on the canonical page, not a new one.
  if (Object.keys(menuSyn).length) {
    for (const it of items) {
      const mapped = applyMenuSynonyms(it.keyword, menuSyn);
      if (_kw(mapped) !== _kw(it.keyword)) { it.menuSynonymFrom = it.keyword; it.keyword = mapped; }
    }
  }

  // NATIONAL-TERM FOLD (Shazin 2026-09-01): a bare-country term ("best fried chicken oman")
  // is a doorway page as its own asset, but the demand is real. Instead of dropping it,
  // attach it as a secondary keyword to the primary city hub (most-venued city; config
  // order breaks ties) — one authoritative page for the country, not a doorway.
  const nationalTerms = [_kw(marketLabel)].filter(t => t && t.length >= 3);
  const _cityOrder  = new Map(allCities.map((c, idx) => [_kw(c.slug), idx]));
  const _venueCount = new Map(allCities.map(c => [_kw(c.slug), (c.venues || []).length]));
  const primaryHub = items.filter(i => i.assetType === 'city_hub')
    .sort((a, b) => (_venueCount.get(_kw(b.city)) || 0) - (_venueCount.get(_kw(a.city)) || 0)
      || (_cityOrder.get(_kw(a.city)) ?? 999) - (_cityOrder.get(_kw(b.city)) ?? 999))[0] || null;

  items = items.filter((it) => {
    const reason = _localIntentDrop(it, cityNames);
    if (!reason) return true;
    const m = String(it.keyword || '').match(_IN_CITY_RE);
    const place = m ? _kw(m[1]) : '';
    if (primaryHub && it.assetType !== 'city_hub' && place && nationalTerms.includes(place)) {
      if (!Array.isArray(primaryHub.keywords)) primaryHub.keywords = [primaryHub.keyword];
      if (!primaryHub.keywords.map(_kw).includes(_kw(it.keyword))) primaryHub.keywords.push(it.keyword);
      dropped.push({ keyword: it.keyword, assetType: it.assetType,
        reason: `National term — folded into the "${primaryHub.keyword}" city hub as a secondary keyword (one authoritative page for ${marketLabel}, not a separate doorway page).` });
      return false;
    }
    dropped.push({ keyword: it.keyword, assetType: it.assetType, reason });
    return false;
  });

  // Normalise commodity terms out of the keyword, then fold duplicates together — the
  // LLM is told this rule, this enforces it. "halal fried chicken lahore" becomes
  // "fried chicken lahore"; if that already exists as an item, the variant is dropped
  // rather than shipping two assets for one intent.
  if (commodityTerms.length) {
    // Seed with ALREADY-QUEUED keywords (stripped the same way) so a commodity-variant of
    // a pending draft is caught, not just an in-plan repeat. "halal fried chicken lahore"
    // strips to "fried chicken lahore"; if that is already queued, drop it (v7.9.37).
    const seenKw = new Set(queuedKeywords.map(k => _kw(stripCommodityTerms(k, commodityTerms))));
    items = items.filter((it) => {
      const stripped = stripCommodityTerms(it.keyword, commodityTerms);
      if (_kw(stripped) !== _kw(it.keyword)) {
        it.commodityStrippedFrom = it.keyword;
        it.keyword = stripped;
      }
      const k = _kw(it.keyword);
      if (seenKw.has(k)) {
        // Only claim "commodity" when THIS item actually carried a commodity term. A plain
        // duplicate (no commodity term) is left for the signature-dedup below, which drops
        // it with the accurate reason ("already published" / "already queued"). (v7.9.55)
        if (it.commodityStrippedFrom) {
          dropped.push({ keyword: it.commodityStrippedFrom, assetType: it.assetType,
            reason: `"${commodityTerms.join('/')}" is table stakes in this market — every competitor is too, so it is not a differentiator. Folded into the existing "${it.keyword}" item/draft rather than building a second asset for the same intent.` });
          return false;
        }
      } else {
        seenKw.add(k);
      }
      return true;
    });
  }

  // Rules backstop for the prompt rule above: two items whose distinctive tokens are
  // IDENTICAL are the same target however they are worded. (Genuine synonym overlap —
  // "burger" vs "sandwich" — is semantic and stays the LLM's job.)
  {
    const _sig = kw => _slugTokens(kw).filter(t => !_STOPWORDS.has(t)).sort().join('|');
    // Seed with already-queued keywords so a near-duplicate of a PENDING draft is caught
    // cross-run, not just within this plan (v7.9.37). Marked so the reason can say so.
    const seenSig = new Map();
    // status: 'live' (published/pushed) | 'queued' (pending/approved) | null (in-plan dupe).
    for (const qk of queuedKeywords) { const s = _sig(qk); if (s && !seenSig.has(s)) seenSig.set(s, { kw: qk, status: kwStatus.get(_kw(qk)) || 'queued' }); }
    items = items.filter((it) => {
      const sig = _sig(it.keyword);
      if (!sig) return true;
      if (seenSig.has(sig)) {
        const prev = seenSig.get(sig);
        dropped.push({ keyword: it.keyword, assetType: it.assetType,
          reason: prev.status === 'live'
            ? `Already published for this brand ("${prev.kw}") — same target once generic modifiers are removed. The planner won't create a duplicate; re-optimising a live page is a separate action.`
            : prev.status === 'queued'
              ? `A draft for "${prev.kw}" is already in the Approvals queue — same target once generic modifiers are removed. Review or publish that one instead of generating a competing page.`
              : `Same target as "${prev.kw}" once generic modifiers are removed — two assets for one intent split authority, so only the higher-priority one is kept.` });
        return false;
      }
      seenSig.set(sig, { kw: it.keyword, status: null });
      return true;
    });
  }

  // ── STALE-TARGET FILTER: a meta_update whose target page no longer exists wastes a
  // launch slot. GSC keeps serving pre-rebuild URLs long after a site move (live: 2 of
  // Bonbird Pakistan's 3 meta targets were dead /pakistan/* slugs). Verified read-only
  // here so the PLAN is clean, not just the execute pre-flight. Only runs when the
  // caller supplies a site (the background worker does) — fails OPEN on any error.
  if (verifyTargets && site) {
    const metas = items.filter(i => i.assetType === 'meta_update' && i.target);
    await Promise.all(metas.map(async (m) => {
      try {
        const r = await fetch(`${site}/.netlify/functions/wordpress`, {
          method: 'POST', headers: { ...(headers || {}), 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_current_meta', brand, payload: { url: m.target } }),
        });
        const j = await r.json().catch(() => null);
        if (!j || !j.found) m._dead = `Target page no longer exists (${m.target}) — stale URL from GSC history.`;
      } catch { /* fail open — a WP hiccup must not empty the plan */ }
    })).catch(() => {});
    items = items.filter((it) => {
      if (!it._dead) return true;
      dropped.push({ keyword: it.keyword, assetType: it.assetType, reason: it._dead });
      return false;
    });
  }

  // ── METRICS (v7.9.55): attach demand + current rank + a goal to each item so the card
  // shows WHAT it targets, its monthly volume, where we rank NOW, and the target position.
  // LLM items don't carry these (clustering returns only keywords), so join back to the
  // research data. Volume = summed across the cluster (total addressable); position = the
  // BEST current rank among the clustered keywords, or null = not ranking yet.
  {
    const metric = new Map();  // _kw(synonym-normalized) -> { volume, position }
    for (const o of opps) {
      if (!o || !o.keyword) continue;
      const k = _kw(applyMenuSynonyms(o.keyword, menuSyn));
      const prev = metric.get(k) || { volume: 0, position: null };
      prev.volume += (o.volume || 0);
      const p = (o.position == null ? null : o.position);
      if (p != null) prev.position = (prev.position == null) ? p : Math.min(prev.position, p);
      metric.set(k, prev);
    }
    for (const it of items) {
      const kws = [it.keyword, ...(Array.isArray(it.keywords) ? it.keywords : [])];
      let vol = 0, pos = null; const seen = new Set();
      for (const kw of kws) {
        const k = _kw(applyMenuSynonyms(kw, menuSyn));
        if (seen.has(k)) continue; seen.add(k);
        const m = metric.get(k);
        if (m) { vol += (m.volume || 0); if (m.position != null) pos = (pos == null) ? m.position : Math.min(pos, m.position); }
      }
      if (!it.volume) it.volume = vol || null;               // keep a rules-path volume if already set
      if (it.position == null) it.position = pos;            // best current rank across the cluster, or null
      it.goalRank = it.assetType === 'blog_draft' ? 10 : 3;  // commercial pages aim top-3, blogs top-10
    }
  }

  items.sort((a, b) => ((b.priority || 0) - (a.priority || 0)) || ((b.volume || 0) - (a.volume || 0)) || _kw(a.keyword).localeCompare(_kw(b.keyword)));
  const counts = items.reduce((c, i) => { c[i.assetType] = (c[i.assetType] || 0) + 1; return c; }, {});

  return {
    brand, market: isUae ? 'uae' : market, sourceKey, mode,
    discoveredAt: (data && (data.updatedAt || data.fetchedAt)) || null,
    total: items.length,
    counts,           // asset-type mix — data-driven, NOT quotas
    items,
    dropped,          // what the guards removed, and why — shown in the UI

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
  // Forward the CLUSTER + current rank so the generator writes for all variants and the
  // draft records positionAtPublish (v7.9.60) — not just the primary keyword.
  const base = { brand, keyword: item.keyword, market: market || 'uae',
    keywords: Array.isArray(item.keywords) ? item.keywords : [],
    currentPos: (item.position == null ? null : item.position),
    volume: (item.volume == null ? null : item.volume),
    goalRank: (item.goalRank == null ? null : item.goalRank) };

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

// PRE-FLIGHT: a meta_update is only executable if its target page actually EXISTS.
// The plan's targets come from GSC history, which keeps serving pre-rebuild URLs long
// after a site move (live: 2 of Bonbird Pakistan's 3 meta targets were dead /pakistan/*
// slugs). Generating against a dead target burns a full Claude call on meta the human
// can never publish, so we resolve every target read-only FIRST — cheap, no spend, no
// writes. Unresolvable → reported as skipped, never generated. Failing OPEN on a lookup
// error (rather than dropping the item) keeps a WP hiccup from silently emptying a run.
async function preflightTargets(mapped, { brand, site, headers } = {}) {
  const metas = mapped.filter(m => m.call && m.call.actionType === 'meta_update');
  if (!metas.length) return mapped;

  // SAME-URL CONFLICT: two pending meta rewrites for ONE page silently overwrite each
  // other — whichever is published second wins and the first review is wasted. Live: both
  // "fried chicken lahore" and "fried chicken near me" queued against post 1170. A page
  // has exactly one title+description, so only one rewrite may ever be in flight.
  let pendingMetaUrls = new Set();
  try {
    const pend = await listApprovals({ brand, status: 'pending' }).catch(() => []);
    const arr = Array.isArray(pend) ? pend : (pend && pend.items) || [];
    pendingMetaUrls = new Set(arr
      .filter(i => i.payload && i.payload.wpAction === 'update_meta')
      .map(i => _pathOf(i.payload.url)).filter(Boolean));
  } catch { /* best-effort */ }

  const seenUrls = new Set();
  for (const m of metas) {
    const path = _pathOf(m.call.url);
    if (!path) continue;
    if (pendingMetaUrls.has(path)) {
      m.error = `A meta rewrite for ${path} is already awaiting review — a page has one title+description, so a second would overwrite the first. Publish or reject that one first.`;
      m.call = null;
    } else if (seenUrls.has(path)) {
      m.error = `Two selected items target the same page (${path}) — only one meta rewrite per page.`;
      m.call = null;
    } else {
      seenUrls.add(path);
    }
  }
  const live = mapped.filter(m => m.call && m.call.actionType === 'meta_update');
  if (!live.length) return mapped;
  await Promise.all(live.map(async (m) => {
    try {
      const r = await fetch(`${site}/.netlify/functions/wordpress`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_current_meta', brand, payload: { url: m.call.url } }),
      });
      const j = await r.json().catch(() => null);
      if (j && j.found) { m.targetPostId = j.postId || null; m.targetTitle = j.wpTitle || null; return; }
      m.error = `target page not found: ${m.call.url} (stale URL? the page may have moved) — meta cannot be written there`;
      m.call = null;
    } catch (e) { m.preflightWarning = `target check failed (${e.message}) — proceeding`; }
  }));
  return mapped;
}

// ── ROUTE page_creation → an EXISTING SCAFFOLD, or a correctly-templated NEW page ──
// A plain page_creation carries NO template, and handleCreatePage 409s that against the
// brand's writableTemplates allow-list — the body would never render. Worse, 12 real
// product scaffolds already sit as empty drafts (4 per market), so creating a page for
// one of them would duplicate it. So before generating we:
//   1. FILL a matching empty scaffold (postId → update_content) — the cheapest, safest win.
//   2. Else CREATE on the right template: product → template-product.php under the market
//      home; a VENUE/area page → blocked, because a venue page must be a child of its city
//      hub and its NAP/images are human-owned ACF (see /BONBIRD-SITE-ARCHITECTURE.md §4).
// Read-only; nothing is created here. Fails OPEN per item (leaves it untouched) on error.
const TEMPLATE_KIND = { 'template-product.php': 'template_product', 'template-location.php': 'template_location' };

const _slugTokens = s => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// Match conservatively: EVERY token of the scaffold slug must appear in the keyword, and
// a single-token scaffold never matches (slug "chicken" would otherwise swallow "chicken
// sandwich" and fill the generic product page with the wrong content). Verified against
// the live Pakistan set: "chicken tenders"→chicken-tenders ✓, "chicken sandwich"→none,
// "best burger in lahore"→none (chicken-burger needs both "chicken" AND "burger").
function _matchScaffold(keyword, scaffolds) {
  const kw = _slugTokens(keyword);
  if (!kw.length) return null;
  let best = null;
  for (const sc of scaffolds) {
    const st = _slugTokens(sc.slug);
    if (st.length < 2) continue;
    if (!st.every(t => kw.includes(t))) continue;
    if (!best || st.length > _slugTokens(best.slug).length) best = sc;
  }
  return best;
}

// Generic modifiers carry no product meaning — matching on them would fill the wrong
// scaffold ("best X in Y" must not match every scaffold because of "best").
const _STOPWORDS = new Set(['best', 'top', 'good', 'great', 'cheap', 'near', 'me', 'in', 'at', 'the', 'a',
  'and', 'or', 'for', 'with', 'my', 'to', 'of', 'on', 'new', 'order', 'delivery', 'online', 'price', 'menu']);

// Softer than _matchScaffold: ONE shared distinctive token is enough to say "this
// scaffold already owns this product". Used only after the strict match fails, and only
// to prefer filling over creating — never to pick between two scaffolds arbitrarily
// (ties are refused, so an ambiguous keyword falls through to a normal create).
function _matchScaffoldFamily(keyword, scaffolds) {
  const kw = _slugTokens(keyword).filter(t => !_STOPWORDS.has(t));
  if (!kw.length) return null;
  const hits = scaffolds.filter(sc => _slugTokens(sc.slug).some(t => !_STOPWORDS.has(t) && kw.includes(t)));
  if (hits.length !== 1) return null;                    // 0 = no family; >1 = ambiguous
  return hits[0];
}

async function preflightPageCreations(mapped, { brand, market, site, headers } = {}) {
  const targets = mapped.filter(m => m.call && m.call.actionType === 'page_creation' && m.call.pageKind !== 'city_hub');
  if (!targets.length || !site) return mapped;
  const mkt = INTERNATIONAL_MARKETS[market];
  const marketSlug = mkt && mkt.marketSlug;
  if (!marketSlug) return mapped;                      // home market — unchanged behaviour

  const wp = async (action, payload) => {
    const r = await fetch(`${site}/.netlify/functions/wordpress`, {
      method: 'POST', headers: { ...(headers || {}), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, brand, payload }),
    });
    return r.json().catch(() => null);
  };

  let scaffolds = [], venueNames = [], cityTokens = new Set();
  try {
    // The market's home page id is the ONLY reliable market signal for a scaffold: draft
    // links are "/?page_id=N", so list_scaffolds' token filter can't see the market.
    const home = await wp('get_current_meta', { url: `/${marketSlug}/` });
    const homeId = home && home.found ? home.postId : null;
    const list = await wp('list_scaffolds', { maxWords: 30 });
    scaffolds = ((list && list.scaffolds) || []).filter(sc =>
      TEMPLATE_KIND[sc.template] && (homeId ? Number(sc.parent) === Number(homeId) : false));
    const cities = await citiesForMarketAsync(market).catch(() => []);
    venueNames = cities.flatMap(c => (c.venues || []).map(v => v.name));
    // A venue named after its city (e.g. "Lahore Fort Branch") would otherwise make the
    // city token match EVERY keyword for that city and block them all. City tokens are
    // never venue-identifying on their own.
    cityTokens = new Set(cities.flatMap(c => [..._slugTokens(c.city), ..._slugTokens(c.slug)]));
  } catch { return mapped; }                            // fail open — route nothing

  for (const m of targets) {
    const kw = String(m.keyword || '');
    const sc = _matchScaffold(kw, scaffolds);
    if (sc) {
      m.call.pageKind = TEMPLATE_KIND[sc.template];
      m.call.postId   = sc.id;
      m.call.url      = sc.link || undefined;
      m.routedTo = `fill existing scaffold #${sc.id} (${sc.slug}, ${sc.template})`;
      continue;
    }
    // FAMILY CHECK — an unfilled scaffold covering this PRODUCT must win over creating a
    // new page beside it. The strict all-tokens match above deliberately refuses a wrong
    // fill, but on its own it produced a worse outcome live: "best burger in lahore"
    // created /pk/best-burger-lahore/ while the empty /pk/chicken-burger/ scaffold sat
    // right next to it — two pages competing for one product. If ANY distinctive token of
    // the keyword matches a scaffold slug token, that scaffold owns this product: fill it.
    const fam = _matchScaffoldFamily(kw, scaffolds);
    if (fam) {
      m.call.pageKind = TEMPLATE_KIND[fam.template];
      m.call.postId   = fam.id;
      m.call.url      = fam.link || undefined;
      m.routedTo = `fill existing scaffold #${fam.id} (${fam.slug}) — same product family, so filling it beats creating a competing page`;
      continue;
    }
    // A keyword naming a real VENUE/area is a venue page — it must be a child of that
    // city's hub and a human owns its NAP/images, so we refuse rather than mis-parent it.
    const kwTokens = _slugTokens(kw);
    const venue = venueNames.find(v => _slugTokens(v).some(t => t.length > 3 && !cityTokens.has(t) && kwTokens.includes(t)));
    if (venue) {
      m.error = `Looks like a venue page for "${venue}". A venue page must be created as a CHILD of that city's hub, with its address/hours/images added by a human (ACF) — the Nest can write its body once the page exists. Create + publish the city hub first, then add the venue page.`;
      m.call = null;
      continue;
    }
    // Otherwise a product/category page on the product template, under the market home.
    m.call.pageKind = 'template_product';
    m.call.wpParent = marketSlug;
    m.routedTo = `create a new product page on template-product.php under /${marketSlug}/`;
  }
  return mapped;
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

module.exports = { buildMarketPlan, planWithClaude, planItemToDraftCall, preflightTargets, preflightPageCreations, _matchScaffoldFamily, commodityTermsFor, stripCommodityTerms, selectPlanItems, MAX_EXECUTE, SKIP_TIERS };
