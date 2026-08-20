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
const VALID_PAGE_KINDS = ['journal', 'template_location', 'template_product', 'city_hub'];
const isTemplateKind = k => k === 'template_location' || k === 'template_product';

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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const auth = await authorize(event);
  if (!auth.ok) return denied();
  // Generation spends Claude → session callers must be manager/admin (internal allowed).
  if (auth.via === 'session' && !['admin', 'manager'].includes(auth.user?.role)) {
    return json(403, { error: 'Manager or admin only' });
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const { brand, keyword, url, market, competitorPage, postId, city } = body;
  const pageKind = VALID_PAGE_KINDS.includes(body.pageKind) ? body.pageKind : null;
  const actionType = VALID_ACTIONS.includes(body.actionType) ? body.actionType : 'meta_update';
  const confidence = (body.confidence || '').toLowerCase();

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

    const ctx = { brand, keyword, url, market, competitorPage, brandCtx, brandCfg, vertical, examples, feedback, systemPrompt, menuItems, menuDirective, isArabic, mkt, brandName, auth, intel, pageKind, postId, city };

    if (effectiveAction === 'meta_update')   return await generateMeta(ctx);
    if (effectiveAction === 'page_creation') return await generatePage(ctx);
    if (effectiveAction === 'blog_draft')    return await generateBlog(ctx);
    return json(400, { error: `Unknown actionType: ${actionType}` });
  } catch (e) {
    console.error(`[generate-draft/${actionType}] failed:`, e.message);
    return json(500, { error: e.message });
  }
};

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

// ── meta_update ────────────────────────────────────────────────────────────────
async function generateMeta(ctx) {
  const { brand, keyword, url, competitorPage, brandCtx, feedback, systemPrompt, menuItems, menuDirective, isArabic, mkt, brandName, intel } = ctx;
  const intelDirective = intel?.promptDirective || '';

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

  const { text } = await callClaude(userPrompt, { max_tokens: 1200, system: systemPrompt });
  const parsed = extractJson(text) || {};
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
      url, title, description, targetKeyword: keyword, wpAction: 'update_meta',
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
  const { brand, keyword, url, brandCtx, feedback, systemPrompt, menuItems, menuDirective, isArabic, mkt, brandName, vertical, intel, pageKind, postId } = ctx;
  const intelDirective = intel?.promptDirective || '';
  if (pageKind === 'city_hub') return await generateCityHub(ctx);
  if (isTemplateKind(pageKind)) return await generateTemplatePage(ctx);

  const userPrompt = `You are creating a NEW ${vertical.promptNoun} landing/location page for ${brandName} to rank for a keyword it currently has no dedicated page for. Write the full page.

TARGET: "${keyword}"${mkt ? ` | Market: ${mkt.label}` : ' | Market: UAE'}
WHAT ${brandName.toUpperCase()} IS ABOUT: ${menuItems || vertical.menuSummary}

RULES — non-negotiable:
- This is a real, publishable page — write substantive, on-brand body copy (350–600 words) in ${brandName}'s voice.
- Structure with clear H2/H3 headings. Lead with the search intent behind "${keyword}".
- Only reference REAL offerings: ${menuItems || vertical.menuSummary}. Invent nothing (no fake locations, awards, or menu items).${menuDirective || ''}
- ${metaLengthRule}${isArabic ? '\n- Write EVERYTHING (title, headings, body, meta) in ARABIC.' : ''}${intelDirective}${feedback.length ? `\n\nHUMAN FEEDBACK — never repeat these past rejections:\n${feedback.slice(0, 10).map(n => `- ${n}`).join('\n')}` : ''}

Return ONLY JSON:
{"skip": false, "skipReason": "only if this keyword should NOT get a dedicated page", "slug": "url-slug-no-domain", "title": "SEO title", "metaDescription": "...", "h1": "page H1", "contentHtml": "<h2>...</h2><p>...</p> full page body as HTML", "rationale": "one sentence — why this page wins the keyword"}`;

  const { text } = await callClaude(userPrompt, { max_tokens: 3000, system: systemPrompt });
  const parsed = extractJson(text) || {};
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
      url: url || null, slug: parsed.slug || '', title,
      description: parsed.metaDescription || '', h1: parsed.h1 || title,
      content: contentHtml, targetKeyword: keyword, wpAction: 'create_page',
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
          isArabic, mkt, brandName, vertical, intel, pageKind, postId } = ctx;
  const isLocation = pageKind === 'template_location';
  const marketLabel = mkt ? mkt.label : 'UAE';
  const intelDirective = intel?.promptDirective || '';

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
- Only reference REAL offerings: ${menuItems || vertical.menuSummary}. Invent nothing.${menuDirective || ''}
- Genuinely specific to ${marketLabel} — no interchangeable city-name filler. If a sentence would read identically for another market, rewrite it.
- ${metaLengthRule}${isArabic ? '\n- Write EVERYTHING in ARABIC.' : ''}${intelDirective}${feedback.length ? `\n\nHUMAN FEEDBACK — never repeat these past rejections:\n${feedback.slice(0, 10).map(n => `- ${n}`).join('\n')}` : ''}

Return ONLY JSON:
{"skip": false, "skipReason": "", "title": "SEO title", "metaDescription": "...", "contentHtml": "<p>intro…</p><h2>…</h2><p>…</p><h2>FAQs</h2><h3>Q?</h3><p>A.</p>…", "rationale": "one sentence — why this wins the keyword"}`;

  const { text } = await callClaude(userPrompt, { max_tokens: 3200, system: systemPrompt });
  const parsed = extractJson(text) || {};
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
  const item = await createApproval({
    type: 'page_update', brand,
    title: `${isLocation ? 'Location' : 'Product'} page: ${keyword}`,
    reason: parsed.rationale || `Write the content body for the ${marketLabel} ${isLocation ? 'location' : 'product'} page targeting "${keyword}"`,
    ...t,
    payload: {
      // Existing scaffold → update its body by postId (never create a duplicate).
      postId: postId || undefined, url: url || null, postType: 'pages',
      title, description: parsed.metaDescription || '',
      content: contentHtml, targetKeyword: keyword,
      wpAction: 'update_content',
      ...marketTaxonomyFor(ctx),
      voiceScore, voiceIssues,
      faqPairs: (contentHtml.match(/<h3[^>]*>/gi) || []).length,
      serpFeatureTag: intel?.serpTag || null, competitors: intel?.competitors || null,
      generatedType: pageKind, label: isLocation ? 'Location page body' : 'Product page body',
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
  const { brand, keyword, market, brandCtx, feedback, systemPrompt, menuItems, menuDirective,
          isArabic, brandName, vertical, intel, city } = ctx;
  const intelDirective = intel?.promptDirective || '';

  const cities = await citiesForMarketAsync(market).catch(() => []);
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

  const { text } = await callClaude(userPrompt, { max_tokens: 3200, system: systemPrompt });
  const parsed = extractJson(text) || {};
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
      title, slug: hub.slug, description: parsed.metaDescription || '',
      content: contentHtml, targetKeyword: keyword,
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
  const { brand, keyword, brandCtx, feedback, systemPrompt, menuItems, menuDirective, isArabic, mkt, brandName, vertical, intel } = ctx;
  const intelDirective = intel?.promptDirective || '';

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

  const { text } = await callClaude(userPrompt, { max_tokens: 3500, system: systemPrompt });
  const parsed = extractJson(text) || {};
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
      content: contentHtml, targetKeyword: keyword, wpAction: 'create_draft',
      ...marketTaxonomyFor(ctx),
      voiceScore, voiceIssues,
      serpFeatureTag: intel?.serpTag || null, competitors: intel?.competitors || null,
      generatedType: 'blog', label: 'New blog post', source: 'worklist-generate',
    },
  });
  return json(200, { ok: true, item });
}
