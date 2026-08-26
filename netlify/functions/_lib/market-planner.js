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
  try {
    const pending = await listApprovals({ brand, status: 'pending' }).catch(() => []);
    const arr = Array.isArray(pending) ? pending : (pending && pending.items) || [];
    queued = new Set(arr.map(i => _kw(i.payload && (i.payload.targetKeyword || i.payload.keyword))).filter(Boolean));
    queuedCities = new Set(arr.filter(i => i.payload && i.payload.pageType === 'city_hub')
      .map(i => _kw(i.payload.slug || i.payload.city)).filter(Boolean));
  } catch { /* dedupe is best-effort */ }

  // Brand context (for the strategist prompt + fallback off-menu guard).
  let bc = null, offMenu = [], vert = getVertical(null);
  try { bc = await getBrand(brand); vert = getVertical(bc && bc.vertical); offMenu = vert.offMenu || []; } catch { /* no guard */ }
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
    const llm = await planWithClaude(candidates, cities, {
      brandName, sells, marketLabel,
      promptNoun: vert.promptNoun, assetHint: vert.assetHint || '',
      cityList: cities.map(c => c.city).join(', '),
    }, llmFn);
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

  // ── HARD GUARDS the LLM must not bypass (it is told these rules; this enforces them).
  // Config-driven: the allowed city list comes from venue config, never a literal.
  const cityNames = [...cities.map(c => c.city), ...cities.map(c => c.slug)].filter(Boolean);
  const dropped = [];
  items = items.filter((it) => {
    const reason = _localIntentDrop(it, cityNames);
    if (reason) { dropped.push({ keyword: it.keyword, assetType: it.assetType, reason }); return false; }
    return true;
  });

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
  await Promise.all(metas.map(async (m) => {
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

module.exports = { buildMarketPlan, planWithClaude, planItemToDraftCall, preflightTargets, preflightPageCreations, selectPlanItems, MAX_EXECUTE, SKIP_TIERS };
