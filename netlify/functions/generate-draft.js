// netlify/functions/generate-draft.js
// ─────────────────────────────────────────────────────────────────────────────
// On-demand, HUMAN-DRIVEN content generation from the worklist (North Star, 19 Jul).
// This is THE content path now that autonomous scheduler generation is OFF. Given ONE
// triaged opportunity, it generates NOW and drops a DRAFT in the Approvals Queue —
// it never auto-publishes (human gate intact).
//
// Dispatches by actionType, config-driven (reads brand voice + vertical from config):
//   meta_update    → optimise an existing page's SEO title + description   (safest, done)
//   page_creation  → draft a NEW landing/location page (title, slug, HTML, meta)
//   blog_draft     → draft a NEW blog/journal post (title, slug, HTML, meta)
//
// CONFIDENCE GATE: high/med → Generate (AI). low → the caller should route to 📋 Perch
//   (human). If a low-confidence call reaches here it returns { routeToPerch:true } and
//   generates nothing (no wasted Claude spend / wrong-target noise).
//
// Every queued item is LABELLED with what it is (payload.generatedType + item.title
// prefix) so the queue reads clearly.
//
//   POST { brand, keyword, url?, market?, actionType?, confidence?, competitorPage? }
//     → { ok, skipped?, routeToPerch?, item }

const { getBrandContext, getBrandExamples, getBrandFeedback, buildBrandPrompt, runBrandVoiceCheck, hardStripBannedTokens } = require('./_lib/brand');
const { callClaude, extractJson, createApproval, fetchGscWithPages } = require('./_lib/store');
const { getBrand, getVertical, gscPropertyFor } = require('./_lib/brands-config');
const { gatherIntelligence, routeAction } = require('./_lib/content-pipeline');
const { metaLengthRule, metaLenIssues } = require('./_lib/seo-meta');
const { INTERNATIONAL_MARKETS, citiesForMarketAsync } = require('./_lib/international-config');
const { authorize, denied, internalHeaders } = require('./_lib/auth');
const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SITE = process.env.NETLIFY_URL || process.env.URL || 'https://yolkseo.netlify.app';
const json = (status, body) => ({ statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const VALID_ACTIONS = ['meta_update', 'page_creation', 'blog_draft'];
// pageKind tells the generator what SHAPE the body must take (see
// /BONBIRD-SITE-ARCHITECTURE.md §4-5). Template pages are hybrids: ACF fields
// (hero images, venue NAP/hours/map, product cards) are HUMAN-owned and must never
// be attempted; post_content carries prose + an FAQ block that the theme turns into
// a styled accordion AND FAQPage JSON-LD.
const VALID_PAGE_KINDS = ['journal', 'template_location', 'template_product', 'city_hub', 'venue'];
// 'venue' = a single-store child page of a city hub (template-location.php, page_type=venue,
// parented to the hub). Generated like a location page but its WP TITLE is the venue name
// (preserved on fill), and NAP/images stay human (ACF). See BONBIRD-SITE-ARCHITECTURE §4.
const isTemplateKind = k => k === 'template_location' || k === 'template_product' || k === 'venue';

// The FAQ contract the theme parses. Validated before queueing so a malformed block
// never reaches WordPress (it would render as flat text with no schema).
// The FAQ heading the theme (`bonbird_split_faq`) splits on — accepts "FAQ" / "FAQs"
// / "Frequently Asked Questions", case-insensitive (confirmed with the site team,
// 20 Aug). One source so the presence-check and the split can't drift.
const FAQ_HEADING_RE = /<h2[^>]*>\s*(?:FAQs?|Frequently\s+Asked\s+Questions)\s*<\/h2>/i;

function validateFaqBlock(html) {
  const issues = [];
  if (!FAQ_HEADING_RE.test(html)) issues.push('missing an <h2>FAQs</h2> heading (also accepts "FAQ" / "Frequently Asked Questions")');
  const after = html.split(FAQ_HEADING_RE)[1] || '';
  const qs = (after.match(/<h3[^>]*>[\s\S]*?<\/h3>/gi) || []).length;
  const as = (after.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || []).length;
  if (qs < 3) issues.push(`only ${qs} <h3> question(s) after the FAQs heading (need at least 3)`);
  if (as < qs) issues.push(`${qs} questions but ${as} <p> answer(s) — each question needs an answer`);
  // ACF-owned things must not be authored into the body.
  if (/<img\b/i.test(html)) issues.push('contains an <img> — images are ACF/human-owned');
  return { ok: issues.length === 0, issues };
}

function store() {
  return getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
}
const JOB_KEY = id => `genDraftJob:${id}`;

// Claude occasionally returns an empty or non-JSON blob (~1-in-N) → the generator would
// 502 "generation returned no title/content" and, in a planner run, surface as a false
// "1 error" (seen live on Slack). ONE retry clears the transient case. `needsRetry(parsed)`
// is generator-specific: a legitimate {skip:true} must NOT retry. (v7.9.41)
async function callClaudeJson(userPrompt, opts, needsRetry) {
  let parsed = {};
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { text } = await callClaude(userPrompt, opts);
      parsed = extractJson(text) || {};
    } catch (e) { parsed = {}; if (attempt === 1) throw e; }
    if (!needsRetry(parsed)) return parsed;
    if (attempt === 0) console.warn('[generate-draft] empty/invalid generation — retrying once');
  }
  return parsed;
}

// H1 vs SEO title are different levers: the H1 (WP post_title, also the venue-card label)
// should be a clean human headline; the keyword-rich SEO title belongs in Yoast (metaTitle).
// The generator returns one SEO-shaped "title" (e.g. "Bonbird Lahore | Fresh Fried Chicken,
// No Bull") — cleanHeading strips the "| …" / " - …" / ": …" suffix to get the headline.
// (Splits only on a separator PADDED by spaces, so "Snack-A-Wrap" is safe.) (v7.9.46)
function cleanHeading(seoTitle) {
  const t = String(seoTitle || '').split(/\s*[|:]\s+|\s+[-–—]\s+/)[0].trim();
  return t || String(seoTitle || '').trim();
}

// ── HTTP handler (UI). A blog/page generation (GSC pull + 3500-token Claude call +
// voice check) exceeds Netlify's ~26s gateway → a synchronous call 504s while the
// function keeps running and creates the draft anyway (a phantom-draft + false error the
// UI showed). So the UI path is now ASYNC: fire generate-draft-background, return a jobId,
// poll `action:'job'`. The executor calls generateDraftCore() IN-PROCESS instead (no
// gateway limit at all). See memory netlify-function-traps #2.
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const auth = await authorize(event);
  if (!auth.ok) return denied();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  // ── Poll a job (any authenticated session may read progress). ──
  if (body.action === 'job') {
    if (!body.jobId) return json(400, { error: 'jobId required' });
    const j = await store().get(JOB_KEY(body.jobId), { type: 'json' }).catch(() => null);
    return json(200, j || { status: 'none' });
  }

  // Generation spends Claude → session callers must be manager/admin (internal allowed).
  if (auth.via === 'session' && !['admin', 'manager'].includes(auth.user?.role)) {
    return json(403, { error: 'Manager or admin only' });
  }
  if (!body.brand || !body.keyword) return json(400, { error: 'brand and keyword are required' });

  // ── Fire the background worker + return a jobId to poll. ──
  const jobId = crypto.randomUUID();
  await store().setJSON(JOB_KEY(jobId), { status: 'running', startedAt: Date.now(),
    brand: body.brand, keyword: body.keyword, actionType: body.actionType || 'meta_update' });
  const base = process.env.URL || 'https://yolkseo.netlify.app';
  try {
    await fetch(`${base}/.netlify/functions/generate-draft-background`, {
      method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...body, jobId }),
    });
  } catch (e) { console.warn('[generate-draft] bg trigger failed:', e.message); }
  return json(202, { status: 'running', jobId });
};

// ── THE GENERATION CORE. Auth already done by the caller (HTTP handler role-gate, or the
// internal executor/background job). Returns an HTTP-shaped { statusCode, body } — reused
// verbatim by the background worker and (via generateDraftCore) the in-process executor.
async function coreGenerate(body, auth) {
  const { brand, keyword, url, market, competitorPage, postId, city, wpParent, parentId, pageTitle } = body;
  const pageKind = VALID_PAGE_KINDS.includes(body.pageKind) ? body.pageKind : null;
  const actionType = VALID_ACTIONS.includes(body.actionType) ? body.actionType : 'meta_update';
  const confidence = (body.confidence || '').toLowerCase();
  // The keyword CLUSTER this one page should target (from the planner), minus the primary —
  // so the writer covers the variants ("chicken near me seeb", "fried chicken al khoudh")
  // instead of only the primary, and we persist them for the queue + rank tracking (v7.9.60).
  const clusterKeywords = (Array.isArray(body.keywords) ? body.keywords : [])
    .map(k => String(k || '').trim()).filter(k => k && k.toLowerCase() !== String(keyword || '').toLowerCase());
  const uniqueCluster = [...new Set(clusterKeywords)].slice(0, 20);
  const currentPos = (body.currentPos == null) ? null : body.currentPos;   // rank at generation → positionAtPublish
  const volume   = (body.volume == null) ? null : body.volume;             // cluster monthly volume (for the queue card)
  const goalRank = (body.goalRank == null) ? null : body.goalRank;         // target position (commercial→3, blog→10)

  if (!brand || !keyword) return json(400, { error: 'brand and keyword are required' });

  // CONFIDENCE GATE — low-confidence opportunities go to a human (Perch), not AI.
  // Checked BEFORE the url requirement: a low-confidence item is deferred to Perch
  // regardless of whether it has a target url yet.
  if (confidence === 'low') {
    return json(200, { ok: true, routeToPerch: true, reason: 'Low confidence — route to Perch for human handling (no AI draft generated).' });
  }

  if (actionType === 'meta_update' && !url) return json(400, { error: 'url is required for a meta_update' });

  try {
    const brandCtx  = await getBrandContext(brand);
    const brandCfg  = await getBrand(brand);
    // 🔴 Hard stop: no content generation for a paused brand (e.g. Pickl while its
    // site is being fixed). Blocks the ⚡Generate button before any Claude spend.
    if (brandCfg?.contentPaused) {
      return json(200, { ok: false, paused: true,
        reason: `SEO content generation is paused for ${brandCfg.name || brand} while its site is being fixed. No draft was generated.` });
    }
    const vertical  = getVertical(brandCfg?.vertical);
    const examples  = await getBrandExamples(brand).catch(() => '');
    const feedback  = await getBrandFeedback(brand).catch(() => []); // past human rejections — never repeat
    const systemPrompt = buildBrandPrompt(brandCtx, examples);
    const mktEarly = market && market !== 'uae' ? INTERNATIONAL_MARKETS[market] : null;
    const { menuItems, menuDirective } = menuForMarket(brandCtx, brandCfg, mktEarly?.marketSlug);
    const isArabic = /[؀-ۿ]/.test(keyword);
    const mkt = mktEarly;
    const brandName = brandCfg?.name || (brand.charAt(0).toUpperCase() + brand.slice(1));

    // ── Intelligence (WS6, shared _lib/content-pipeline) — for ALL brands/markets ──
    // For page/blog creation we also pull the brand's GSC page+query rows to run the
    // cannibalization guard (cached, cheap). Meta updates target an existing page, so
    // no cannibalization risk — skip the GSC pull there.
    let intel = { promptDirective: '', competitors: null, cannibalPage: null, isLocal: false, serpTag: null };
    let effectiveAction = actionType;
    try {
      let rowsWithPages = null;
      if (actionType !== 'meta_update') {
        rowsWithPages = await fetchGscWithPages(await gscPropertyFor(brand)).catch(() => null);
      }
      intel = await gatherIntelligence({ brand, market: market || 'uae', keyword, currentPage: url, marketSlug: mkt?.marketSlug, rowsWithPages });
      // SERP-feature routing: a local-pack keyword must be a location page, not a blog.
      const routed = routeAction(actionType, intel.serpFeatures);
      effectiveAction = routed.actionType;
      if (routed.changed) intel.routeNote = routed.reason;
    } catch (e) { console.warn('[generate-draft] intelligence load failed (non-critical):', e.message); }

    // CANNIBALIZATION GUARD — don't create a new page/blog if a dedicated page already
    // ranks for this keyword; point the human at optimising that page's meta instead.
    if ((effectiveAction === 'page_creation' || effectiveAction === 'blog_draft') && intel.cannibalPage) {
      return json(200, { ok: true, skipped: true, cannibalization: true, existingPage: intel.cannibalPage,
        reason: `A dedicated page already ranks for "${keyword}" (${intel.cannibalPage}). Creating another would split authority — optimise that page's meta instead.` });
    }

    // ── MARKET PRESENCE (config-driven) ──────────────────────────────────────
    // Without this, the generator only knows the brand's HOME-market identity, so for
    // an international market the model concludes "this brand has no presence here" and
    // refuses — live: all 4 Bonbird Pakistan blog drafts were skipped with "Bonbird has
    // no presence in Pakistan and no locations in Lahore", while config lists THREE
    // Lahore venues. generateCityHub never had this bug because it injects the venue
    // list from config; blog/page/template paths did not. Venues come from
    // citiesForMarketAsync (config only — never invented), same source as the planner.
    // When a market genuinely has no venues we say THAT explicitly, so the model still
    // correctly avoids local/doorway framing.
    const presenceDirective = await buildPresenceDirective(market, mkt, brandName);
    // Table-stakes terms must never become the selling point in the copy either — the
    // planner stops them being the TARGET, this stops them being the ANGLE.
    const commodityDirective = buildCommodityDirective(brandCfg, market, mkt);
    // Home-market venues live in a `<brand>_uae` record, not under the bare key 'uae'
    // (v7.9.38 — lets a UAE-native brand like Southpour have city hubs). Resolve once and
    // use everywhere cities are needed, so the planner and generator agree.
    const cityMarketKey = (!market || market === 'uae') ? `${brand}_uae` : market;
    const linkCities = await citiesForMarketAsync(cityMarketKey).catch(() => []);
    const linkingDirective = buildLinkingDirective(mkt, linkCities, brandName);
    // Origin/ownership framing (config-driven) — keeps the "homegrown / not a franchise"
    // claim to the UAE home market and OUT of franchised markets (Oman/Qatar/Pakistan),
    // where the brand operates as a franchise. Fixes false copy like "not a franchise
    // flown in from somewhere else… now serving Muscat" on an Oman page. Injected into the
    // system prompt so it applies to every generator (meta/blog/page/hub/venue).
    const ownershipDirective = buildOwnershipDirective(market, mkt, brandName);
    // Per-item REVISION feedback (v7.9.59): when a human rejects a draft with feedback, the
    // "Rewrite with AI" button now regenerates through THIS engine and passes their note here
    // as the highest-priority instruction — so a rewrite gets every guard (ownership, menu,
    // voice, tagging) instead of the old parallel prompt map. Applied to every generator.
    const reviseDirective = body.reviseFeedback
      ? `\n\nREVISION REQUEST — highest priority: this page is being regenerated after a human reviewed the previous draft and asked for specific changes. Honor this above all else, and do NOT reproduce whatever they objected to:\n"${String(body.reviseFeedback).slice(0, 700)}"`
      : '';
    // Cluster directive (v7.9.60): tell the writer the secondary keywords this ONE page must
    // also serve, so the grouping actually shapes the content (not just the plan).
    const clusterDirective = uniqueCluster.length
      ? `\n\nSECONDARY KEYWORDS — this single page should also read naturally for these related searches; weave them into headings/copy where they genuinely fit. Do NOT keyword-stuff, list them, or repeat them verbatim: ${uniqueCluster.join(', ')}.`
      : '';
    const ctx = { brand, keyword, keywords: uniqueCluster, currentPos, volume, goalRank, url, market, cityMarketKey, competitorPage, brandCtx, brandCfg, vertical, examples, feedback, systemPrompt: systemPrompt + ownershipDirective + reviseDirective + clusterDirective, menuItems, menuDirective, isArabic, mkt, brandName, auth, intel, pageKind, postId, city, wpParent, parentId, pageTitle, presenceDirective, commodityDirective, linkingDirective };

    if (effectiveAction === 'meta_update')   return await generateMeta(ctx);
    if (effectiveAction === 'page_creation') return await generatePage(ctx);
    if (effectiveAction === 'blog_draft')    return await generateBlog(ctx);
    return json(400, { error: `Unknown actionType: ${actionType}` });
  } catch (e) {
    console.error(`[generate-draft/${actionType}] failed:`, e.message);
    return json(500, { error: e.message });
  }
}

// In-process entry point for trusted internal callers (the planner executor). Runs the
// full core with internal auth and returns a plain object — NO HTTP, so no gateway 26s
// limit (the executor has a 15-min budget). This is why the executor no longer 504s.
async function generateDraftCore(params) {
  const res = await coreGenerate(params, { via: 'internal', user: null });
  let data = {};
  try { data = JSON.parse(res.body); } catch { /* leave empty */ }
  return { statusCode: res.statusCode, ...data };
}

module.exports = { handler: exports.handler, coreGenerate, generateDraftCore, JOB_KEY, buildOwnershipDirective, cleanHeading };

// Tells the generator where the brand actually TRADES in this market, from venue
// config. Returns '' for the home market (unchanged behaviour) — only international
// markets carry a per-market venue list.
async function buildPresenceDirective(market, mkt, brandName) {
  if (!mkt || !market || market === 'uae') return '';
  let cities = [];
  try { cities = await citiesForMarketAsync(market); } catch { return ''; }
  if (!cities.length) {
    return `\n- ${brandName} has NO venues in ${mkt.label} yet. Do NOT write as though we have a location there, and do NOT target city-level "local" intent — write only what is true without a venue.`;
  }
  const lines = cities.map(c => `${c.city} (${(c.venues || []).map(v => v.name).join(', ') || 'venue'})`).join('; ');
  return `\n- PRESENCE — this is TRUE, do not contradict it: ${brandName} IS open and trading in ${mkt.label}, with venues in ${lines}. Never say or imply we have no presence, no locations, or no plans there.`
       + `\n- Reference venues by NAME only. Never invent an address, phone number, opening hours, or a venue that is not listed above.`;
}

// Origin/ownership framing (config-driven). The brand is homegrown ONLY in its UAE home
// market; every other market is a franchise/expansion by default (a market record may set
// ownership:'corporate' for a company-owned expansion). This stops the brand's UAE
// "homegrown / not a franchise" identity leaking into franchised markets — the source of
// copy like "not a franchise flown in from somewhere else… now serving Muscat" on an Oman
// page. Injected into the system prompt so it reaches every generation call.
function buildOwnershipDirective(market, mkt, brandName) {
  const isHome = !market || market === 'uae';
  if (isHome) {
    return `\n\nORIGIN: ${brandName} is homegrown in its UAE home market — founded in Dubai, not a franchise or import. UAE copy may lean into this local-origin pride.`;
  }
  const ownership = (mkt && mkt.ownership) || 'franchise';
  if (ownership === 'corporate') return '';
  const label = (mkt && mkt.label) || market;
  return `\n\nORIGIN & OWNERSHIP: ${brandName} operates in ${label} as a franchise/expansion market. HARD RULES: never use the words "homegrown", "local", or "not a franchise" ANYWHERE on the page — NOT EVEN "homegrown in Dubai" (the word is banned outright here) — and never imply it originated in ${label}. The UAE/Dubai origin is a LIGHT, OPTIONAL signal — mention Dubai AT MOST ONCE and only if it earns its place; NEVER build the page around it. Do not open with it, do not use a "born in Dubai → now in ${label}" hook, and NEVER use "no need to drive to Dubai"-style lines (that was a one-off, not a template). LEAD with the food, the flavour system, and genuine local ${label} relevance — origin is a footnote, not the story.`;
}

// A term that is table stakes in this market differentiates nothing — leading with it
// wastes the strongest copy real estate and reads defensively. Config-driven
// (brandsConfig.commodityTerms + per-market override); brands without it are unaffected.
// INTERNAL LINKING. Every draft in the first live batch shipped with ZERO internal
// links — for a launch cluster that is the biggest single miss: internal links are how a
// hub consolidates authority and how a brand realistically outranks aggregators for local
// terms. Only real, known URLs are offered (the market home + configured city hubs), so
// the model can never invent a path. Relative URLs so they survive a domain change.
function buildLinkingDirective(mkt, cities, brandName) {
  const targets = [];
  if (mkt?.marketSlug) targets.push(`/${mkt.marketSlug}/ — the ${mkt.label} home`);
  for (const c of (cities || [])) {
    if (c && c.slug && mkt?.marketSlug) targets.push(`/${mkt.marketSlug}/${c.slug}/ — the ${c.city} city hub`);
  }
  if (!targets.length) return '';
  return `\n- INTERNAL LINKS (required): include 2–3 contextual internal links in the body, as plain <a href="/path/">anchor</a> with descriptive anchor text (never "click here", never the bare URL). Link ONLY to these real ${brandName} pages — do NOT invent any other path:\n  ${targets.join('\n  ')}\n  Place them where they genuinely help the reader, not in a list at the end.`;
}

function buildCommodityDirective(brandCfg, market, mkt) {
  const byMarket = (brandCfg && brandCfg.commodityTermsByMarket) || {};
  const key = market || 'uae';
  const terms = Object.prototype.hasOwnProperty.call(byMarket, key)
    ? (byMarket[key] || [])
    : ((brandCfg && brandCfg.commodityTerms) || []);
  if (!terms.length) return '';
  const label = mkt ? mkt.label : 'this market';
  return `\n- ⚠️ TABLE STAKES in ${label} — NEVER the selling point: ${terms.join(', ')}. Every competitor here is the same, so it differentiates nothing. Do NOT put it in the title, H1, meta description, or opening line, and do not build a section around it. State it once in passing ONLY if a customer would genuinely ask. Lead on what actually sets us apart instead.`;
}

// Market-aware menu filtering (brief §3): an item discontinued in a market must not
// be generated for it. Returns the menu summary with excluded things stripped, plus a
// hard prompt rule naming them. Config-driven (brandsConfig.menuExcludeByMarket /
// .menuOnlyInMarkets) — brands without those keys behave exactly as before.
function menuForMarket(brandCtx, brandCfg, marketSlug) {
  const slug = String(marketSlug || brandCfg?.homeMarketSlug || '').toLowerCase();
  const excl = ((brandCfg?.menuExcludeByMarket || {})[slug] || []).map(x => String(x).toLowerCase());
  // Items restricted to other markets are excluded here too.
  for (const [item, markets] of Object.entries(brandCfg?.menuOnlyInMarkets || {})) {
    if (!markets.map(m => String(m).toLowerCase()).includes(slug)) excl.push(String(item).toLowerCase());
  }
  const blocked = (txt) => excl.some(e => String(txt).toLowerCase().includes(e));

  let summary;
  if (Array.isArray(brandCtx?.menu)) {
    summary = brandCtx.menu.map(m => m.name || m).filter(x => typeof x === 'string' && !blocked(x)).slice(0, 20).join(', ');
  } else if (brandCtx?.menu) {
    // Object form: drop whole categories that are excluded, and any excluded items in them.
    const parts = [];
    for (const [cat, items] of Object.entries(brandCtx.menu)) {
      if (blocked(cat)) continue;
      const kept = Array.isArray(items) ? items.filter(i => !blocked(i)) : (blocked(items) ? [] : [items]);
      if (kept.length) parts.push(cat);
    }
    summary = parts.slice(0, 20).join(', ');
  } else summary = '';

  const directive = excl.length
    ? `\n- NEVER mention these — not available in this market: ${excl.join(', ')}. Do not reference, imply, or substitute them.`
    : '';
  return { menuItems: summary, menuDirective: directive };
}

// Market taxonomy term for the target market, when the brand's site uses one
// (config-driven: brandsConfig.marketTaxonomy / .homeMarketSlug). Returns {} otherwise,
// so brands without a market taxonomy are unaffected. Bonbird: { market: ['om'] }.
function marketTaxonomyFor(ctx) {
  const tax = ctx.brandCfg?.marketTaxonomy;
  if (!tax) return {};
  const term = ctx.mkt?.marketSlug || ctx.brandCfg?.homeMarketSlug; // intl market, else home
  return term ? { taxonomies: { [tax]: [term] } } : {};
}

// Shared: labelled locationTag / languageTag for a queued item.
function tags(ctx) {
  return {
    locationTag: ctx.mkt ? `${ctx.mkt.flag || '🌍'} ${ctx.mkt.label}` : '🇦🇪 UAE',
    languageTag: ctx.isArabic ? 'AR' : 'EN',
    actor: ctx.auth.via === 'session' ? (ctx.auth.user?.email || 'user') : 'claude (worklist)',
  };
}

// Cluster + rank-at-generation for the PAYLOAD (v7.9.60): the queue shows what the page
// targets, tracking measures all variants, and positionAtPublish is set on publish for the
// closed-loop delta. Spread into every generator's payload (`...clusterMeta(ctx)`).
function clusterMeta(ctx) {
  return { keywords: ctx.keywords || [], currentPos: (ctx.currentPos == null ? null : ctx.currentPos),
    volume: (ctx.volume == null ? null : ctx.volume), goalRank: (ctx.goalRank == null ? null : ctx.goalRank) };
}

// ── meta_update ────────────────────────────────────────────────────────────────
async function generateMeta(ctx) {
  const { brand, keyword, url, competitorPage, brandCtx, feedback, systemPrompt, menuItems, menuDirective, isArabic, mkt, brandName, intel, commodityDirective, linkingDirective } = ctx;
  const intelDirective = (intel?.promptDirective || '') + (commodityDirective || '');

  // 1) current live meta (proven path — reuse the wordpress function)
  let currentTitle = null, currentDesc = null;
  try {
    const cmRes = await fetch(`${SITE}/.netlify/functions/wordpress`, {
      method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'get_current_meta', brand, payload: { url } }),
    });
    const cm = await cmRes.json().catch(() => null);
    if (cm?.found) { currentTitle = cm.currentTitle || null; currentDesc = cm.currentDesc || null; }
  } catch { /* proceed without current meta */ }

  const userPrompt = `You are auditing a ${brandName} page that ranks but under-performs on CTR. Write an improved SEO title + meta description for it.

RULES — non-negotiable:
${metaLengthRule}
- Only reference REAL menu items: ${menuItems || 'use items from the brand context'}${menuDirective || ''}
- Lead with the keyword; end with a reason to click. No generic phrases ("great food", "delicious", "best in Dubai").
- Write specifically about what the PAGE is about (the URL tells you the topic).${isArabic ? '\n- Write the title AND description in ARABIC (the keyword is Arabic).' : ''}${competitorPage ? `\n- A competitor ranks here with ${competitorPage} — make ours more specific and compelling than a generic competitor page.` : ''}${intelDirective}${feedback.length ? `\n\nHUMAN FEEDBACK — past rejections, never repeat these:\n${feedback.slice(0, 10).map(n => `- ${n}`).join('\n')}` : ''}

PAGE:
  URL: "${url}"
  Target keyword: "${keyword}"${mkt ? ` | Market: ${mkt.label}` : ''}
  Current title: "${currentTitle || 'NOT SET'}"
  Current description: "${currentDesc || 'NOT SET'}"

Return ONLY JSON:
{"skip": false, "skipReason": "only if the current meta is already excellent", "title": "...", "description": "...", "rationale": "one sentence — why current underperforms and why yours is better"}`;

  const parsed = await callClaudeJson(userPrompt, { max_tokens: 1200, system: systemPrompt }, p => !p.skip && (!p.title || !p.description));
  if (parsed.skip) return json(200, { ok: true, skipped: true, reason: parsed.skipReason || 'current meta already good' });
  const title = (parsed.title || '').trim();
  const description = (parsed.description || '').trim();
  if (!title || !description) return json(502, { error: 'generation returned no title/description' });

  const lengthIssues = metaLenIssues(title, description);
  let voiceScore = null, voiceIssues = [];
  try { const v = await runBrandVoiceCheck(`${title}\n${description}`, brandCtx, callClaude); voiceScore = v?.score ?? null; voiceIssues = v?.issues || []; } catch {}

  const t = tags(ctx);
  const item = await createApproval({
    type: 'meta_update', brand,
    title: `Meta: ${keyword}`,
    reason: parsed.rationale || `Optimise meta for "${keyword}" on ${url}`,
    ...t,
    payload: {
      url, title, description, targetKeyword: keyword, ...clusterMeta(ctx), wpAction: 'update_meta',
      currentMeta: { title: currentTitle, description: currentDesc },
      voiceScore, voiceIssues, lengthWarning: lengthIssues,
      competitorPage: competitorPage || null,
      serpFeatureTag: intel?.serpTag || null, competitors: intel?.competitors || null,
      generatedType: 'meta', label: 'Meta rewrite', source: 'worklist-generate',
    },
  });
  return json(200, { ok: true, item });
}

// ── page_creation ───────────────────────────────────────────────────────────────
async function generatePage(ctx) {
  const { brand, keyword, url, brandCtx, feedback, systemPrompt, menuItems, menuDirective, isArabic, mkt, brandName, vertical, intel, pageKind, postId, presenceDirective, commodityDirective, linkingDirective } = ctx;
  const intelDirective = (intel?.promptDirective || '') + (presenceDirective || '') + (commodityDirective || '') + (linkingDirective || '');
  if (pageKind === 'city_hub') return await generateCityHub(ctx);
  if (isTemplateKind(pageKind)) return await generateTemplatePage(ctx);

  const userPrompt = `You are creating a NEW ${vertical.promptNoun} landing/location page for ${brandName} to rank for a keyword it currently has no dedicated page for. Write the full page.

TARGET: "${keyword}"${mkt ? ` | Market: ${mkt.label}` : ' | Market: UAE'}
WHAT ${brandName.toUpperCase()} IS ABOUT: ${menuItems || vertical.menuSummary}

RULES — non-negotiable:
- This is a real, publishable page — write substantive, on-brand body copy (350–600 words) in ${brandName}'s voice.
- Structure with clear H2/H3 headings. Lead with the search intent behind "${keyword}".
- Only reference REAL offerings: ${menuItems || vertical.menuSummary}. Invent nothing (no fake locations, awards, or menu items).${menuDirective || ''}
- STAY ON TARGET: this page is about "${keyword}". Keep every section about it; mention other menu items only briefly as context, and never build a section around a different product that has (or should have) its own page — that splits ranking authority.
- ${metaLengthRule}${isArabic ? '\n- Write EVERYTHING (title, headings, body, meta) in ARABIC.' : ''}${intelDirective}${feedback.length ? `\n\nHUMAN FEEDBACK — never repeat these past rejections:\n${feedback.slice(0, 10).map(n => `- ${n}`).join('\n')}` : ''}

Return ONLY JSON:
{"skip": false, "skipReason": "only if this keyword should NOT get a dedicated page", "slug": "url-slug-no-domain", "title": "SEO title", "metaDescription": "...", "h1": "page H1", "contentHtml": "<h2>...</h2><p>...</p> full page body as HTML", "rationale": "one sentence — why this page wins the keyword"}`;

  const parsed = await callClaudeJson(userPrompt, { max_tokens: 3000, system: systemPrompt }, p => !p.skip && (!p.title || !p.contentHtml));
  if (parsed.skip) return json(200, { ok: true, skipped: true, reason: parsed.skipReason || 'not a good page-creation candidate' });
  const title = (parsed.title || '').trim();
  let contentHtml = (parsed.contentHtml || '').trim();
  if (!title || !contentHtml) return json(502, { error: 'generation returned no title/content' });
  contentHtml = hardStripBannedTokens(contentHtml);

  let voiceScore = null, voiceIssues = [];
  try { const v = await runBrandVoiceCheck(contentHtml.replace(/<[^>]+>/g, ' '), brandCtx, callClaude); voiceScore = v?.score ?? null; voiceIssues = v?.issues || []; } catch {}

  const t = tags(ctx);
  const item = await createApproval({
    type: 'page_creation', brand,
    title: `Page: ${keyword}`,
    reason: parsed.rationale || `Create a dedicated page targeting "${keyword}"`,
    ...t,
    payload: {
      url: url || null, slug: parsed.slug || '',
      title: parsed.h1 || cleanHeading(title),   // clean H1 as the WP page title
      metaTitle: title,                          // keyword-rich SEO title → Yoast
      description: parsed.metaDescription || '', h1: parsed.h1 || title,
      content: contentHtml, targetKeyword: keyword, ...clusterMeta(ctx), wpAction: 'create_page',
      ...marketTaxonomyFor(ctx),
      voiceScore, voiceIssues,
      serpFeatureTag: intel?.serpTag || null, competitors: intel?.competitors || null,
      routedFrom: intel?.routeNote || null,
      generatedType: 'page', label: 'New page', source: 'worklist-generate',
    },
  });
  return json(200, { ok: true, item, routeNote: intel?.routeNote || null });
}

// ── template_location / template_product ──────────────────────────────────────
// Writes ONLY post_content for a page already assigned a data-driven template.
// The theme owns presentation: our FAQ block becomes an accordion + FAQPage schema.
// ACF (images, NAP, hours, product cards) is human-owned — never authored here.
async function generateTemplatePage(ctx) {
  const { brand, keyword, url, brandCtx, feedback, systemPrompt, menuItems, menuDirective,
          isArabic, mkt, brandName, vertical, intel, pageKind, postId, wpParent, parentId, pageTitle, presenceDirective, commodityDirective, linkingDirective } = ctx;
  const isVenue    = pageKind === 'venue';
  const isLocation = pageKind === 'template_location' || isVenue;   // a venue is a location page
  const marketLabel = mkt ? mkt.label : 'UAE';
  const intelDirective = (intel?.promptDirective || '') + (presenceDirective || '') + (commodityDirective || '') + (linkingDirective || '');
  // FILL an existing empty scaffold (postId) vs CREATE a new templated page. Creating
  // MUST carry the template, or handleCreatePage 409s it (writableTemplates allow-list)
  // and the body would never render — that gap is why plain page_creation items were
  // held back from the first batch run. See /BONBIRD-SITE-ARCHITECTURE.md §4.
  const isCreate = !postId;
  const template = isLocation ? 'template-location.php' : 'template-product.php';

  // When FILLING an existing page, label the approval card by the PAGE it updates (e.g.
  // "Bonbird Cue Cinemas"), not the keyword — a fill card showing "fried chicken gulberg
  // lahore" is unrecognisable as the Cue Cinemas page. Cheap read of the current WP title.
  let existingTitle = pageTitle || null;
  if (!isCreate && !existingTitle) {
    try {
      const cmRes = await fetch(`${SITE}/.netlify/functions/wordpress`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'get_current_meta', brand, payload: { postId } }),
      });
      const cm = await cmRes.json().catch(() => null);
      if (cm && cm.wpTitle) existingTitle = cm.wpTitle;
    } catch { /* fall back to keyword in the label */ }
  }

  const userPrompt = `You are writing the CONTENT BODY for an existing ${brandName} ${isLocation ? 'location' : 'product'} page in ${marketLabel}. The page's images, address, hours and product cards are managed separately by a human — you write ONLY the prose and FAQs.

TARGET KEYWORD: "${keyword}"${url ? `\nPAGE: ${url}` : ''}
WHAT ${brandName.toUpperCase()} OFFERS: ${menuItems || vertical.menuSummary}

REQUIRED STRUCTURE — follow exactly, the theme parses it:
1. An opening paragraph answering the intent behind "${keyword}" directly (no preamble, no "welcome to").
2. Two or three <h2> sections of genuinely useful, specific prose${isLocation ? ' — neighbourhood context, what the area is like, why someone here would come' : ' — what the product is, how it is made, how it differs'}.
3. Then EXACTLY this FAQ block, which the page turns into an accordion and FAQ schema:
   <h2>FAQs</h2>
   <h3>Question?</h3><p>Answer.</p>
   …at least 4 question/answer pairs, each a real question someone in ${marketLabel} would ask.

HARD RULES:
- NEVER write image tags, photo captions, opening hours, phone numbers or a street address — those are human/ACF-owned. Do not invent them.${isLocation ? '\n- Do NOT invent a venue, branch or address. Write about the AREA and the offer, not a specific street.' : ''}
- Only reference REAL offerings: ${menuItems || vertical.menuSummary}. Invent nothing.${menuDirective || ''}${isLocation ? '' : `
- STAY ON ONE PRODUCT: this page is about "${keyword}" and nothing else. Every <h2> must be about THIS product. You may mention a complementary item in a single passing phrase, but do NOT devote a heading or section to a DIFFERENT product that has its own page (e.g. no "Chicken Tenders" section on a fries page) — that splits ranking authority. If "${keyword}" maps to a specific named menu item, write about that item, not the category.`}
- Genuinely specific to ${marketLabel} — no interchangeable city-name filler. If a sentence would read identically for another market, rewrite it.
- ${metaLengthRule}${isArabic ? '\n- Write EVERYTHING in ARABIC.' : ''}${intelDirective}${feedback.length ? `\n\nHUMAN FEEDBACK — never repeat these past rejections:\n${feedback.slice(0, 10).map(n => `- ${n}`).join('\n')}` : ''}

Return ONLY JSON:
{"skip": false, "skipReason": "", ${isCreate ? '"slug": "url-slug-no-domain", ' : ''}"title": "SEO title", "metaDescription": "...", "contentHtml": "<p>intro…</p><h2>…</h2><p>…</p><h2>FAQs</h2><h3>Q?</h3><p>A.</p>…", "rationale": "one sentence — why this wins the keyword"}`;

  const parsed = await callClaudeJson(userPrompt, { max_tokens: 3200, system: systemPrompt }, p => !p.skip && (!p.title || !p.contentHtml));
  if (parsed.skip) return json(200, { ok: true, skipped: true, reason: parsed.skipReason || 'not a good candidate' });
  const title = (parsed.title || '').trim();
  let contentHtml = (parsed.contentHtml || '').trim();
  if (!title || !contentHtml) return json(502, { error: 'generation returned no title/content' });
  contentHtml = hardStripBannedTokens(contentHtml);

  // The FAQ block must be well-formed or the accordion + schema silently won't build.
  const faq = validateFaqBlock(contentHtml);
  if (!faq.ok) {
    return json(422, { error: `Generated body does not meet the template contract: ${faq.issues.join('; ')}`, issues: faq.issues, retryable: true });
  }

  let voiceScore = null, voiceIssues = [];
  try { const v = await runBrandVoiceCheck(contentHtml.replace(/<[^>]+>/g, ' '), brandCtx, callClaude); voiceScore = v?.score ?? null; voiceIssues = v?.issues || []; } catch {}

  const t = tags(ctx);
  // Creating needs the template + parent so the body renders; filling must NEVER carry
  // them (it would try to re-template an existing page).
  const createFields = isCreate ? {
    // Venue slug = the plain venue name (→ /pk/lahore/johar-town/); the path already carries
    // market+city, and the brand is in the domain, so keep the slug short & un-prefixed.
    slug: (isVenue ? (pageTitle || keyword) : parsed.slug) || '', template,
    ...(isLocation ? { pageType: 'venue' } : {}),
    // A venue parents to its city hub by ID; other creates parent to the market home slug.
    ...(parentId ? { parentId } : { wpParent: wpParent || mkt?.marketSlug || undefined }),
  } : {};
  const item = await createApproval({
    type: isCreate ? 'page_creation' : 'page_update', brand,
    title: `${isVenue ? 'Venue' : isLocation ? 'Location' : 'Product'} page: ${existingTitle || (isVenue ? (pageTitle || keyword) : keyword)}`,
    reason: parsed.rationale || `${isCreate ? 'Create' : 'Write the content body for'} the ${marketLabel} ${isLocation ? 'location' : 'product'} page targeting "${keyword}"`,
    ...t,
    payload: {
      // Existing scaffold → update its body by postId (never create a duplicate).
      postId: postId || undefined, url: url || null, postType: 'pages',
      // Venue pages: WP title = the venue NAME (given on create; PRESERVED on fill by
      // omitting title so we never clobber "Cue Cinemas"); SEO title → Yoast via metaTitle.
      ...(isVenue
        // Venue: WP title = "Brand Venue" (clean as both card + H1; brand = local keyword).
        // Fill preserves the human title (omit it). SEO title → Yoast via metaTitle.
        ? { ...(isCreate ? { title: `${brandName} ${pageTitle || keyword}`.trim() } : {}), metaTitle: title }
        // Product/location: clean H1 as WP title, keyword-rich SEO title → Yoast.
        : { title: cleanHeading(title), metaTitle: title }),
      description: parsed.metaDescription || '',
      content: contentHtml, targetKeyword: keyword, ...clusterMeta(ctx),
      wpAction: isCreate ? 'create_page' : 'update_content',
      ...createFields,
      ...marketTaxonomyFor(ctx),
      voiceScore, voiceIssues,
      faqPairs: (contentHtml.match(/<h3[^>]*>/gi) || []).length,
      serpFeatureTag: intel?.serpTag || null, competitors: intel?.competitors || null,
      generatedType: pageKind, label: `${isLocation ? 'Location' : 'Product'} page ${isCreate ? '(new)' : 'body'}`,
      humanTodo: 'Add hero/product images + NAP via ACF, then publish.',
      source: 'worklist-generate',
    },
  });
  return json(200, { ok: true, item, faqPairs: (contentHtml.match(/<h3[^>]*>/gi) || []).length });
}

// ── city_hub ────────────────────────────────────────────────────────────────
// Creates a NEW city-hub PAGE (template-location.php, page_type=city_hub) under the
// market home. The theme loops the hub's CHILD venue pages as cards; we write ONLY the
// prose + FAQ body. City + its REAL venues come from the config (citiesForMarketAsync —
// rule 12, Blobs-merged so onboarded markets work), never invented. A dark_kitchen
// venue is pickup/delivery only (no dine-in) and the prompt is told so.
async function generateCityHub(ctx) {
  const { brand, keyword, market, cityMarketKey, brandCtx, feedback, systemPrompt, menuItems, menuDirective,
          isArabic, brandName, vertical, intel, city, commodityDirective, linkingDirective } = ctx;
  const intelDirective = (intel?.promptDirective || '') + (commodityDirective || '') + (linkingDirective || '');

  // Home-market venues are under `<brand>_uae`, not the bare 'uae' key (v7.9.38).
  const cities = await citiesForMarketAsync(cityMarketKey || market).catch(() => []);
  const hub = cities.find(c => c.slug === String(city || '').toLowerCase()) || null;
  if (!hub) return json(400, { error: `No city "${city}" with venues configured for market "${market}". Add it in Settings → SEO Markets (venues) — never invent a city/venue.` });
  const cityName = hub.city;
  const venueLines = hub.venues.map(v => `- ${v.name}${v.type === 'dark_kitchen' ? ' (PICKUP/DELIVERY ONLY — no dine-in)' : ' (dine-in + pickup + delivery)'}`).join('\n');

  const userPrompt = `You are writing the CONTENT BODY for a NEW ${brandName} city hub page for ${cityName}. Each venue's images/address/hours/phone/map are managed by a human (ACF) and the theme renders them as venue cards — you write ONLY the prose and FAQs.

TARGET KEYWORD: "${keyword}"
CITY: ${cityName}
WHAT ${brandName.toUpperCase()} OFFERS: ${menuItems || vertical.menuSummary}
REAL ${cityName.toUpperCase()} VENUES (reference by NAME only — never invent addresses; respect the dine-in/pickup note):
${venueLines}

REQUIRED STRUCTURE — follow exactly, the theme parses it:
1. An opening paragraph answering the intent behind "${keyword}" directly (no preamble, no "welcome to").
2. Two or three <h2> sections of genuinely useful, ${cityName}-specific prose — what ${brandName} offers in ${cityName}, the areas it serves, why a local would choose it.
3. Then EXACTLY this FAQ block, which the page turns into an accordion and FAQ schema:
   <h2>FAQs</h2>
   <h3>Question?</h3><p>Answer.</p>
   …at least 4 question/answer pairs, each a real question someone in ${cityName} would ask.

HARD RULES:
- NEVER write image tags, opening hours, phone numbers or street addresses — human/ACF-owned. Reference venues by NAME only.
- A venue marked PICKUP/DELIVERY ONLY has NO dine-in — never imply dining in there.
- Only reference REAL offerings: ${menuItems || vertical.menuSummary}, and the real venues above. Invent nothing (no fake venues, awards, or menu items).${menuDirective || ''}
- Genuinely specific to ${cityName} — no interchangeable city-name filler. If a sentence would read identically for another city, rewrite it.
- ${metaLengthRule}${isArabic ? '\n- Write EVERYTHING in ARABIC.' : ''}${intelDirective}${feedback.length ? `\n\nHUMAN FEEDBACK — never repeat these past rejections:\n${feedback.slice(0, 10).map(n => `- ${n}`).join('\n')}` : ''}

Return ONLY JSON:
{"skip": false, "skipReason": "", "title": "SEO title", "metaDescription": "...", "contentHtml": "<p>intro…</p><h2>…</h2><p>…</p><h2>FAQs</h2><h3>Q?</h3><p>A.</p>…", "rationale": "one sentence — why this hub wins the keyword"}`;

  const parsed = await callClaudeJson(userPrompt, { max_tokens: 3200, system: systemPrompt }, p => !p.skip && (!p.title || !p.contentHtml));
  if (parsed.skip) return json(200, { ok: true, skipped: true, reason: parsed.skipReason || 'not a good candidate' });
  const title = (parsed.title || '').trim();
  let contentHtml = (parsed.contentHtml || '').trim();
  if (!title || !contentHtml) return json(502, { error: 'generation returned no title/content' });
  contentHtml = hardStripBannedTokens(contentHtml);

  const faq = validateFaqBlock(contentHtml);
  if (!faq.ok) return json(422, { error: `Generated body does not meet the template contract: ${faq.issues.join('; ')}`, issues: faq.issues, retryable: true });

  let voiceScore = null, voiceIssues = [];
  try { const v = await runBrandVoiceCheck(contentHtml.replace(/<[^>]+>/g, ' '), brandCtx, callClaude); voiceScore = v?.score ?? null; voiceIssues = v?.issues || []; } catch {}

  const t = tags(ctx);
  const item = await createApproval({
    type: 'page_creation', brand,
    title: `City hub: ${cityName}`,
    reason: parsed.rationale || `Create the ${cityName} city hub targeting "${keyword}"`,
    ...t,
    payload: {
      title: cleanHeading(title), metaTitle: title, slug: hub.slug, description: parsed.metaDescription || '',
      content: contentHtml, targetKeyword: keyword, ...clusterMeta(ctx),
      wpAction: 'create_page',
      template: 'template-location.php',   // guard-allowed writable template
      pageType: 'city_hub',                // set via meta on create (site team, v7.9.9)
      wpParent: hub.marketSlug,            // market home (e.g. 'om' → /om/) — page market = ancestry
      ...marketTaxonomyFor(ctx),
      voiceScore, voiceIssues,
      faqPairs: (contentHtml.match(/<h3[^>]*>/gi) || []).length,
      serpFeatureTag: intel?.serpTag || null, competitors: intel?.competitors || null,
      generatedType: 'city_hub', label: `City hub — ${cityName}`,
      humanTodo: `Create + fill each ${cityName} venue as a child 'venue' page (ACF NAP) so the hub renders cards: ${hub.venues.map(v => v.name).join(', ')}.`,
      source: 'worklist-generate',
    },
  });
  return json(200, { ok: true, item, faqPairs: (contentHtml.match(/<h3[^>]*>/gi) || []).length });
}

// ── blog_draft ────────────────────────────────────────────────────────────────
async function generateBlog(ctx) {
  const { brand, keyword, brandCtx, feedback, systemPrompt, menuItems, menuDirective, isArabic, mkt, brandName, vertical, intel, presenceDirective, commodityDirective, linkingDirective } = ctx;
  const intelDirective = (intel?.promptDirective || '') + (presenceDirective || '') + (commodityDirective || '') + (linkingDirective || '');

  const userPrompt = `You are writing a NEW blog/journal post for ${brandName} to build topical authority and rank for an informational keyword. Write the full post.

TARGET: "${keyword}"${mkt ? ` | Market: ${mkt.label}` : ' | Market: UAE'}
WHAT ${brandName.toUpperCase()} IS ABOUT: ${menuItems || vertical.menuSummary}

RULES — non-negotiable:
- Write a genuinely useful, on-brand post (500–800 words) in ${brandName}'s voice — not SEO filler.
- Structure with H2/H3 headings. Answer the intent behind "${keyword}" first.
- Reference only REAL offerings: ${menuItems || vertical.menuSummary}. Invent nothing.${menuDirective || ''}
- ${metaLengthRule}${isArabic ? '\n- Write EVERYTHING in ARABIC.' : ''}${intelDirective}${feedback.length ? `\n\nHUMAN FEEDBACK — never repeat these past rejections:\n${feedback.slice(0, 10).map(n => `- ${n}`).join('\n')}` : ''}

Return ONLY JSON:
{"skip": false, "skipReason": "only if this keyword shouldn't be a blog", "slug": "post-slug", "title": "post title", "metaDescription": "...", "contentHtml": "<h2>...</h2><p>...</p> full post body as HTML", "rationale": "one sentence — the angle and why it ranks"}`;

  const parsed = await callClaudeJson(userPrompt, { max_tokens: 3500, system: systemPrompt }, p => !p.skip && (!p.title || !p.contentHtml));
  if (parsed.skip) return json(200, { ok: true, skipped: true, reason: parsed.skipReason || 'not a good blog candidate' });
  const title = (parsed.title || '').trim();
  let contentHtml = (parsed.contentHtml || '').trim();
  if (!title || !contentHtml) return json(502, { error: 'generation returned no title/content' });
  contentHtml = hardStripBannedTokens(contentHtml);

  let voiceScore = null, voiceIssues = [];
  try { const v = await runBrandVoiceCheck(contentHtml.replace(/<[^>]+>/g, ' '), brandCtx, callClaude); voiceScore = v?.score ?? null; voiceIssues = v?.issues || []; } catch {}

  const t = tags(ctx);
  const item = await createApproval({
    type: 'blog_draft', brand,
    title: `Blog: ${keyword}`,
    reason: parsed.rationale || `Write a blog post targeting "${keyword}"`,
    ...t,
    payload: {
      slug: parsed.slug || '', title, description: parsed.metaDescription || '',
      content: contentHtml, targetKeyword: keyword, ...clusterMeta(ctx), wpAction: 'create_draft',
      ...marketTaxonomyFor(ctx),
      voiceScore, voiceIssues,
      serpFeatureTag: intel?.serpTag || null, competitors: intel?.competitors || null,
      generatedType: 'blog', label: 'New blog post', source: 'worklist-generate',
    },
  });
  return json(200, { ok: true, item });
}
