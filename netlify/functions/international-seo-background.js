// netlify/functions/international-seo-background.js
// Background function (15min timeout) — generates localised SEO content
// for all international markets and queues to the approvals system.
//
// Runs: Monday 4:00am UTC = 8:00am Dubai time (same as main scheduler)
// Manual trigger: GET /.netlify/functions/international-seo-background?market=all
// Single market:  GET /.netlify/functions/international-seo-background?market=pickl_ksa
//
// Per market, per language, generates:
//   1. blog_draft  — localised blog post targeting primary keyword
//   2. page_update — meta title + description for the market landing page
//   3. onpage_suggestion — content improvement for the market page

const { getStore } = require('@netlify/blobs');
const { INTERNATIONAL_MARKETS, getMarketsForBrand, buildMarketPrompt, getWpCredentials, buildPostUrl } = require('./_lib/international-config');
const { getBrandContext, getBrandExamples, buildBrandPrompt, runBrandVoiceCheck, fixBrandVoice } = require('./_lib/brand');
const { fetchGscDirect, fetchGscWithPages, listApprovals, createApproval, extractJson } = require('./_lib/store');
const { internalHeaders } = require('./_lib/auth');

// ── Brand feedback helper ─────────────────────────────────────────
async function getBrandFeedback(brand) {
  try {
    const s = getStore({ name: 'seo-tool', consistency: 'strong', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    const raw = await s.get(`brandFeedback:${brand}`, { type: 'text' });
    const notes = JSON.parse(raw || '[]');
    return Array.isArray(notes) ? notes : [];
  } catch { return []; }
}

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL         = 'claude-sonnet-4-6';
const CACHE_TTL_MS  = 7 * 24 * 60 * 60 * 1000; // 7 days — for seed keyword content only

// ── Data-driven helpers (mirrors main scheduler logic) ────────────────────────

// Returns a function that checks if a GSC page URL belongs to this market
// Handles both nested (/egypt/) and flat (/egypt, /egypt-menu) URL structures
function marketPageMatcher(market) {
  const slugs = [market.marketSlug.toLowerCase()];
  if (market.arabicSlug) slugs.push(market.arabicSlug.toLowerCase());
  return (pageUrl) => {
    if (!pageUrl) return false;
    const path = pageUrl.replace(/^https?:\/\/[^\/]+/, '').toLowerCase();
    return slugs.some(slug =>
      path === `/${slug}` ||
      path === `/${slug}/` ||
      path.startsWith(`/${slug}/`) ||
      path.startsWith(`/${slug}-`)
    );
  };
}

// Market keyword terms — used to detect if a keyword is about a DIFFERENT market
const MARKET_KEYWORD_TERMS = {
  bahrain:  ['bahrain', 'manama'],
  ksa:      ['saudi', 'riyadh', 'jeddah', 'ksa'],
  qatar:    ['qatar', 'doha', 'lusail'],
  egypt:    ['egypt', 'cairo'],
  jordan:   ['jordan', 'amman'],
  oman:     ['oman', 'muscat'],
  pakistan: ['pakistan', 'karachi', 'lahore', 'islamabad'],
};

// Returns false if keyword clearly mentions a DIFFERENT market's cities
function keywordMatchesMarket(keyword, marketKey) {
  const kw = keyword.toLowerCase();
  const thisTerms = MARKET_KEYWORD_TERMS[marketKey] || [];
  for (const [mKey, terms] of Object.entries(MARKET_KEYWORD_TERMS)) {
    if (mKey === marketKey) continue;
    for (const term of terms) {
      if (kw.includes(term) && !thisTerms.some(t => kw.includes(t))) {
        return false; // keyword is about a different market
      }
    }
  }
  return true;
}

// Returns false if keyword mentions a dish not on the brand's menu
function keywordMatchesMenu(keyword, brandCtx) {
  if (!brandCtx?.menu) return true;
  const kw = keyword.toLowerCase();
  const menuText = JSON.stringify(brandCtx.menu).toLowerCase();
  const offMenu = ['butter chicken','biryani','kebab','shawarma','pizza','pasta',
    'fish and chips','shrimp','lamb chops','steak','hummus','falafel','sushi',
    'tacos','burritos','noodles','ramen','dumplings'];
  for (const dish of offMenu) {
    if (kw.includes(dish) && !menuText.includes(dish)) return false;
  }
  return true;
}

// Pages already queued for a given brand + type — prevents duplicates
async function getQueuedPagesForMarket(brand, type) {
  try {
    const pending = await listApprovals({ brand, limit: 300 });
    const pages = new Set();
    for (const item of pending) {
      if (item.type !== type) continue;
      const url = item.payload?.url;
      if (url) pages.add(url.toLowerCase().replace(/\/$/, ''));
    }
    return pages;
  } catch { return new Set(); }
}

async function getQueuedKeywordsForMarket(brand) {
  try {
    const pending = await listApprovals({ brand, limit: 300 });
    const kws = new Set();
    for (const item of pending) {
      const kw = item.payload?.targetKeyword || item.payload?.keyword;
      if (kw) kws.add(kw.toLowerCase().trim());
    }
    return kws;
  } catch { return new Set(); }
}

// ── Core data-driven analysis per market ──────────────────────────────────────
// Mirrors runMetaRewrites from scheduler-background.js but scoped to a market's pages.
// Returns { queued, skipped, candidates }
async function runMarketDataDrivenSEO(market, brandCtx, brandExamples, force = false) {
  const BRAND_GSC = { pickl: 'https://eatpickl.com/', bonbird: 'https://bonbirdchicken.com/' };
  const tag = `[intl-seo/${market.marketKey}]`;

  // Fetch GSC data with page URLs
  let rowsWithPages;
  try {
    rowsWithPages = await fetchGscWithPages(BRAND_GSC[market.brand]);
  } catch (e) {
    console.warn(`${tag} fetchGscWithPages failed: ${e.message}`);
    return { queued: 0, skipped: 'gsc_failed' };
  }

  // Filter to this market's pages only
  const isMarketPage = marketPageMatcher(market);
  const marketRows   = rowsWithPages.filter(r => r.page && isMarketPage(r.page));
  console.log(`${tag} GSC rows for market: ${marketRows.length} / ${rowsWithPages.length} total`);

  if (marketRows.length < 3) {
    return { queued: 0, skipped: 'insufficient_data', rows: marketRows.length };
  }

  // Group by page — pick highest-impression keyword per page
  const pageMap = {};
  for (const r of marketRows) {
    const pageUrl = r.page.split('?')[0].split('#')[0];
    if (!pageMap[pageUrl] || r.impressions > pageMap[pageUrl].impressions) {
      pageMap[pageUrl] = { ...r, page: pageUrl };
    }
  }

  const expected = pos => Math.max(0.005, 0.30 / pos);
  const alreadyQueuedPages = await getQueuedPagesForMarket(market.brand, 'meta_update');
  const alreadyQueuedKws   = await getQueuedKeywordsForMarket(market.brand);

  const candidates = Object.values(pageMap)
    .filter(r => r.position <= 20 && r.impressions >= 50) // lower threshold than UAE (50 not 100)
    .map(r => ({ ...r, ctrGap: expected(r.position) - r.ctr }))
    .filter(r => r.ctrGap > 0.010) // 1.0pp threshold (slightly lower than UAE's 1.5pp)
    .filter(r => force || !alreadyQueuedKws.has(r.keyword.toLowerCase().trim()))
    .filter(r => force || !alreadyQueuedPages.has(r.page.toLowerCase().replace(/\/$/, '')))
    .filter(r => keywordMatchesMenu(r.keyword, brandCtx))
    .filter(r => keywordMatchesMarket(r.keyword, market.marketKey))
    .sort((a, b) => b.ctrGap - a.ctrGap)
    .slice(0, 3); // max 3 meta rewrites per market per run

  if (!candidates.length) {
    console.log(`${tag} no CTR gap candidates after filtering (${Object.keys(pageMap).length} pages checked)`);
    return { queued: 0, skipped: 'no_candidates', pages: Object.keys(pageMap).length };
  }

  // Build prompt for international meta rewrites
  const brandPrompt    = buildBrandPrompt(brandCtx, brandExamples);
  const marketCtx      = buildMarketPrompt(market, brandPrompt, 'en');
  const brandName      = brandCtx?.name || market.brand;
  const voiceFn        = voiceClaudeAdapter(brandName);
  const menuItems      = brandCtx?.menu ? [
    ...(brandCtx.menu.cheeseburgers || []).slice(0, 3),
    ...(brandCtx.menu.chickenSandos || brandCtx.menu.sandwiches || []).slice(0, 2),
    ...(brandCtx.menu.friesAndSides || brandCtx.menu.sides || []).slice(0, 2),
  ].join(' | ') : '';
  const feedbackNotes  = await getBrandFeedback(market.brand);

  const userPrompt = `These ${brandName} ${market.label} pages rank well but have poor click-through rates. Rewrite each meta to be specific, on-brand and compelling.

MARKET CONTEXT: ${market.label}
CULTURAL NOTES: ${(market.culturalNotes || []).join(' | ')}

RULES:
- Title: 52-58 characters exactly
- Description: 150-158 characters exactly
- Only reference REAL menu items: ${menuItems || 'use items from brand context'}
- No generic phrases ("great food", "best in ${market.label}", "quality ingredients")
- CRITICAL: Write for the PAGE's topic based on its URL — not just the keyword
- The URL tells you what the page is about. Match the meta to the page content.
- Lead with the keyword naturally, end with a reason to click${feedbackNotes.length ? `

HUMAN FEEDBACK — NEVER do any of the following (these were explicitly rejected by the team):
${feedbackNotes.map(n => `- ${n}`).join('\n')}` : ''}

PAGES TO REWRITE:
${candidates.map((r, i) => `${i+1}. URL: "${r.page}" | Keyword: "${r.keyword}" | Position: ${r.position.toFixed(1)} | CTR: ${(r.ctr * 100).toFixed(1)}% | ${r.impressions} impressions`).join('\n')}

Return ONLY a JSON array:
[{"keyword":"...","url":"exact URL from input","title":"52-58 chars","description":"150-158 chars","targetKeyword":"...","rationale":"one sentence why this improves CTR"}]`;

  const raw    = await callClaude(marketCtx, userPrompt);
  const parsed = extractJson(raw);
  if (!Array.isArray(parsed)) {
    console.warn(`${tag} Claude did not return JSON array`);
    return { queued: 0, skipped: 'parse_error' };
  }

  let queued = 0;
  const wp = getWpCredentials(market);
  for (const p of parsed) {
    const matched = candidates.find(r => r.page === p.url || r.keyword === p.keyword);
    if (!matched) { console.warn(`${tag} unknown URL from Claude: ${p.url}`); continue; }
    try {
      // Brand voice check on generated title + description
      const metaContent = `${p.title}\n${p.description}`;
      const voiceCheck  = await runBrandVoiceCheck(metaContent, brandCtx, voiceFn)
        .catch(() => ({ score: null, issues: [], verdict: 'UNKNOWN' }));

      await createApproval({
        type:        'meta_update',
        brand:       market.brand,
        market:      market.marketKey,
        actor:       'claude (intl-scheduler)',
        locationTag: `${market.flag} ${market.label}`,
        reason:      p.rationale || `Low CTR vs expected for position ${matched.position?.toFixed(1)} — ${market.label}`,
        payload: {
          url:           matched.page,
          title:         p.title,
          description:   p.description,
          targetKeyword: p.targetKeyword || p.keyword,
          currentPos:    matched.position,
          impressions:   matched.impressions,
          ctrGap:        matched.ctrGap != null ? (matched.ctrGap * 100).toFixed(1) : null,
          wpAction:      'update_meta',
          wpBase:        wp.base, wpUser: wp.user, wpPass: wp.pass,
          language:      'en',
          voiceScore:    voiceCheck.score,
          voiceIssues:   voiceCheck.issues,
        },
      });
      queued++;
      console.log(`${tag} queued meta_update: ${matched.page} (${p.keyword})`);
    } catch (e) { console.error(`${tag} createApproval failed: ${e.message}`); }
  }

  return { queued, candidates: candidates.length };
}

// ── International keyword opportunities (pos 11-20 → page_update, pos 21-35 → blog_draft) ─────
async function runMarketKeywordOpportunities(market, brandCtx, brandExamples, force = false) {
  const BRAND_GSC = { pickl: 'https://eatpickl.com/', bonbird: 'https://bonbirdchicken.com/' };
  const tag = `[intl-opps/${market.marketKey}]`;

  let rowsWithPages;
  try {
    rowsWithPages = await fetchGscWithPages(BRAND_GSC[market.brand]);
  } catch (e) {
    console.warn(`${tag} GSC fetch failed: ${e.message}`);
    return { queued: 0, skipped: 'gsc_failed' };
  }

  const isMarketPage  = marketPageMatcher(market);
  const marketRows    = rowsWithPages.filter(r => r.page && isMarketPage(r.page));

  if (marketRows.length < 3) {
    return { queued: 0, skipped: 'insufficient_data', rows: marketRows.length };
  }

  // Group by page — pick highest-impression keyword per page
  const pageMap = {};
  for (const r of marketRows) {
    const pageUrl = r.page.split('?')[0].split('#')[0];
    if (!pageMap[pageUrl] || r.impressions > pageMap[pageUrl].impressions) {
      pageMap[pageUrl] = { ...r, page: pageUrl };
    }
  }

  const alreadyQueuedPages = await getQueuedPagesForMarket(market.brand, 'page_update');
  const alreadyQueuedKws   = await getQueuedKeywordsForMarket(market.brand);
  const feedbackNotes      = await getBrandFeedback(market.brand);
  const brandPrompt        = buildBrandPrompt(brandCtx, brandExamples);
  const marketCtx          = buildMarketPrompt(market, brandPrompt, 'en');
  const wp                 = getWpCredentials(market);
  const brandName          = brandCtx?.name || (market.brand === 'pickl' ? 'Pickl' : 'Bonbird');
  const voiceFn            = voiceClaudeAdapter(brandName);
  let queued               = 0;
  let pageCreations        = 0;

  // ── QUICK WINS: pos 11-20 → page_update ──────────────────────────────────
  const quickWins = Object.values(pageMap)
    .filter(r => r.position > 10 && r.position <= 20 && r.impressions >= 30)
    .filter(r => force || !alreadyQueuedKws.has(r.keyword.toLowerCase().trim()))
    .filter(r => force || !alreadyQueuedPages.has(r.page.toLowerCase().replace(/\/$/, '')))
    .filter(r => keywordMatchesMenu(r.keyword, brandCtx))
    .filter(r => keywordMatchesMarket(r.keyword, market.marketKey))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 2);

  for (const r of quickWins) {
    try {
      const userPrompt = `This ${market.brand === 'pickl' ? 'Pickl' : 'Bonbird'} page ranks position ${r.position.toFixed(1)} for "${r.keyword}" in ${market.label} with ${r.impressions} impressions but isn't on page 1.

PAGE: ${r.page}
KEYWORD: "${r.keyword}"
POSITION: ${r.position.toFixed(1)}
IMPRESSIONS: ${r.impressions}
MARKET: ${market.label}${feedbackNotes.length ? `

HUMAN FEEDBACK — NEVER do any of the following:
${feedbackNotes.map(n => `- ${n}`).join('\n')}` : ''}

Provide 3-5 specific on-page changes to push this to top 10. Be tactical and specific — reference the URL, what the page is likely about, and what changes will move rankings.

Return ONLY JSON:
{"title":"Page update: [keyword]","suggestions":["specific change 1","specific change 2","specific change 3"],"rationale":"one sentence on the ranking opportunity","targetKeyword":"${r.keyword}"}`;

      const raw    = await callClaude(marketCtx, userPrompt);
      const parsed = extractJson(raw);
      if (!parsed?.suggestions) { console.warn(`${tag} page_update parse error`); continue; }

      await createApproval({
        type:    'page_update',
        brand:   market.brand,
        market:  market.marketKey,
        actor:   'claude (intl-opps)',
        locationTag: `${market.flag} ${market.label}`,
        reason:  parsed.rationale || `Position ${r.position.toFixed(1)} quick win — ${r.impressions} impressions for "${r.keyword}"`,
        payload: {
          url:              r.page,
          targetKeyword:    r.keyword,
          currentPos:       r.position,
          impressions:      r.impressions,
          suggestions:      parsed.suggestions,
          suggestionTitle:  parsed.title,
          suggestionDetail: parsed.suggestions.join(' | '),
          wpBase:  wp.base, wpUser: wp.user, wpPass: wp.pass,
          language: 'en',
        },
      });
      queued++;
      console.log(`${tag} queued page_update: ${r.page} (pos ${r.position.toFixed(1)})`);
    } catch (e) { console.error(`${tag} page_update failed: ${e.message}`); }
  }

  // ── CONTENT GAPS: pos 21-35 ──────────────────────────────────────────────────
  // For each candidate, check if the ranking page is already a dedicated post (depth > market root).
  // If yes → page_update (fix what exists, don't create competing content).
  // If no (ranking via market root/category only) → blog_draft (create dedicated page).
  function isDedicatedPage(pageUrl) {
    const path = pageUrl.replace(/^https?:\/\/[^\/]+/, '').replace(/\/$/, '').toLowerCase();
    const slug = market.marketSlug.toLowerCase();
    // Market root: /bahrain or /bahrain-something but no child segment
    if (path === `/${slug}` || path === `/${slug}/`) return false;
    // Dedicated post: /bahrain/some-post — has a child segment
    if (path.startsWith(`/${slug}/`) && path.split('/').filter(Boolean).length > 1) return true;
    return false;
  }

  // Local/service search intent → deserves a dedicated landing PAGE, not a blog
  // post (mirrors how the UAE scheduler splits page_creation vs content_gaps).
  function hasLocationIntent(keyword) {
    const kw = keyword.toLowerCase();
    const signals = [
      market.label, market.marketSlug,
      ...(market.locations || []),
      'delivery', 'near me', 'order', 'restaurant', 'best',
    ].filter(Boolean).map(s => String(s).toLowerCase());
    return signals.some(s => kw.includes(s));
  }

  const contentGaps = Object.values(pageMap)
    .filter(r => r.position > 20 && r.position <= 35 && r.impressions >= 20)
    .filter(r => force || !alreadyQueuedKws.has(r.keyword.toLowerCase().trim()))
    .filter(r => keywordMatchesMenu(r.keyword, brandCtx))
    .filter(r => keywordMatchesMarket(r.keyword, market.marketKey))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 1);

  for (const r of contentGaps) {
    try {
      const existingPage = isDedicatedPage(r.page);

      if (existingPage) {
        // Dedicated page already exists but ranking poorly — update it, don't create a competing one
        const userPrompt = `This ${market.brand === 'pickl' ? 'Pickl' : 'Bonbird'} page already exists but ranks at position ${r.position.toFixed(1)} for "${r.keyword}" in ${market.label} — it needs on-page improvements to break into page 1.

PAGE: ${r.page}
KEYWORD: "${r.keyword}"
POSITION: ${r.position.toFixed(1)}
IMPRESSIONS: ${r.impressions}
MARKET: ${market.label}
NOTE: This is an existing page. Do NOT suggest creating a new page — suggest how to improve this one.${feedbackNotes.length ? `

HUMAN FEEDBACK — NEVER do any of the following:
${feedbackNotes.map(n => `- ${n}`).join('\n')}` : ''}

Provide 4-6 specific on-page improvements (content depth, heading structure, internal links, keyword coverage, E-E-A-T signals) to push it from position ${r.position.toFixed(1)} into top 10.

Return ONLY JSON:
{"title":"Page update: [keyword]","suggestions":["specific change 1","specific change 2","specific change 3"],"rationale":"one sentence on why improving this page beats creating a new one","targetKeyword":"${r.keyword}"}`;

        const raw    = await callClaude(marketCtx, userPrompt);
        const parsed = extractJson(raw);
        if (!parsed?.suggestions) { console.warn(`${tag} content-gap page_update parse error`); continue; }

        await createApproval({
          type:    'page_update',
          brand:   market.brand,
          market:  market.marketKey,
          actor:   'claude (intl-opps)',
          locationTag: `${market.flag} ${market.label}`,
          reason:  parsed.rationale || `Existing page at pos ${r.position.toFixed(1)} for "${r.keyword}" — improve rather than duplicate`,
          payload: {
            url:              r.page,
            targetKeyword:    r.keyword,
            currentPos:       r.position,
            impressions:      r.impressions,
            suggestions:      parsed.suggestions,
            suggestionTitle:  parsed.title,
            suggestionDetail: parsed.suggestions.join(' | '),
            wpBase:  wp.base, wpUser: wp.user, wpPass: wp.pass,
            language: 'en',
          },
        });
        queued++;
        console.log(`${tag} queued page_update (existing, pos ${r.position.toFixed(1)}): ${r.page}`);

      } else if (hasLocationIntent(r.keyword)) {
        // Location/service intent + no dedicated page → full landing PAGE.
        // International port of the UAE scheduler's runPageCreation — previously
        // these gaps only ever produced a blog post, never a proper landing page.
        const userPrompt = `Create a complete, conversion-focused landing page for ${brandName} in ${market.label} targeting "${r.keyword}".

Google shows ${r.impressions} impressions at position ${r.position.toFixed(1)} but only the market root (${r.page}) is ranking — there is no dedicated page for this yet. Building one captures this traffic.

This is a STANDALONE PAGE (not a blog post):
- H1 leads naturally with "${r.keyword}" — a line someone would actually say
- 3-4 H2 sections: why ${brandName} is the best option in ${market.label}, local area context, menu highlights relevant to this keyword, how to order/visit
- Reference real ${market.label} locations (${market.locations?.join(', ') || market.label}) and real menu items by name
- Internal links to the market menu and locations pages
- Image placeholder comments: <!-- IMAGE: [specific food photo description] -->
- CTA section at the bottom (Order Now / Find Us / View Menu)
- 500-800 words — punchy, not padded${feedbackNotes.length ? `

HUMAN FEEDBACK — NEVER do any of the following:
${feedbackNotes.map(n => `- ${n}`).join('\n')}` : ''}

Return ONLY JSON:
{"title":"SEO title 55-60 chars","description":"meta description 150-158 chars","targetKeyword":"${r.keyword}","slug":"market-aware-url-slug e.g best-burger-${market.marketSlug}","pageHeading":"H1 text","excerpt":"short description for page lists","body":"<full page HTML — h2, p, ul, strong, image placeholder comments — no outer html/body tags>","pageType":"location|service","rationale":"why a dedicated page will outrank the market root"}`;

        const raw    = await callClaude(marketCtx, userPrompt);
        const parsed = extractJson(raw);
        if (!parsed?.body || !parsed?.title) { console.warn(`${tag} page_creation parse error`); continue; }

        // Brand voice gate — auto-fix 5-7, skip below 5 (mirrors UAE runPageCreation)
        let voiceCheck = await runBrandVoiceCheck(parsed.body, brandCtx, voiceFn)
          .catch(() => ({ score: 6, issues: [], verdict: 'PASS', topFix: null }));
        if (voiceCheck.score >= 5 && voiceCheck.score < 8) {
          const fixed = await fixBrandVoice(parsed.body, voiceCheck, brandCtx, voiceFn, brandExamples);
          if (fixed.improved) { parsed.body = fixed.content; voiceCheck = fixed.voiceCheck; }
        }
        if (voiceCheck.score < 5) { console.warn(`${tag} page_creation voice ${voiceCheck.score}/10 too low — skipped`); continue; }

        await createApproval({
          type:    'page_creation',
          brand:   market.brand,
          market:  market.marketKey,
          actor:   'claude (intl-opps)',
          locationTag: `${market.flag} ${market.label}`,
          title:   `New ${market.label} page: ${parsed.title}`,
          reason:  parsed.rationale || `No dedicated page — market root ranks pos ${r.position.toFixed(1)} for "${r.keyword}" (${r.impressions} impressions). Nest under /${market.marketSlug}/ at publish.`,
          payload: {
            title:         parsed.title,
            description:   parsed.description,
            targetKeyword: parsed.targetKeyword || r.keyword,
            slug:          parsed.slug,
            pageHeading:   parsed.pageHeading,
            excerpt:       parsed.excerpt,
            body:          parsed.body,
            pageType:      parsed.pageType || 'location',
            wpAction:      'create_page',
            voiceScore:    voiceCheck.score,
            voiceIssues:   voiceCheck.issues,
            voiceTopFix:   voiceCheck.topFix || voiceCheck.issues?.[0] || null,
            currentPos:    r.position,
            impressions:   r.impressions,
            wpBase:  wp.base, wpUser: wp.user, wpPass: wp.pass,
            language: 'en',
          },
        });
        queued++; pageCreations++;
        console.log(`${tag} queued page_creation (location intent, pos ${r.position.toFixed(1)}): "${parsed.title}"`);

      } else {
        // Informational intent + no dedicated page → blog post (existing behavior)
        const menuItems  = brandCtx?.menu ? [
          ...(brandCtx.menu.cheeseburgers || []).slice(0, 3),
          ...(brandCtx.menu.chickenSandos || brandCtx.menu.sandwiches || []).slice(0, 2),
        ].join(', ') : '';

        const userPrompt = `Write a focused blog post for ${brandName} in ${market.label} targeting "${r.keyword}".

This keyword shows ${r.impressions} impressions at position ${r.position.toFixed(1)} but only the market root page (${r.page}) is ranking — there is no dedicated page for this topic yet. A dedicated post will capture this traffic properly.

LANGUAGE: English
WORD COUNT: 400-550 words
TARGET KEYWORD: "${r.keyword}"
MARKET: ${market.label}
REAL MENU ITEMS TO REFERENCE: ${menuItems || 'use items from brand context'}
MARKET LOCATIONS: ${market.locations?.join(', ') || market.label}${feedbackNotes.length ? `

HUMAN FEEDBACK — NEVER do any of the following:
${feedbackNotes.map(n => `- ${n}`).join('\n')}` : ''}

Every sentence must sound like the brand — specific, direct, no filler. Open with energy. Reference real menu items by name.

Return EXACTLY:
### TITLE
[brand-voice title targeting ${r.keyword}]

### SLUG
[url-friendly-slug]

### META_DESCRIPTION
[150-158 chars]

### FOCUS_KEYWORD
${r.keyword}

### BODY
[full post in HTML — h2 headings, short paragraphs]`;

        const raw      = await callClaude(marketCtx, userPrompt);
        const title    = parseSection(raw, 'TITLE').trim();
        const slug     = parseSection(raw, 'SLUG').trim().replace(/[^a-z0-9-]/g, '');
        const metaDesc = parseSection(raw, 'META_DESCRIPTION').trim();
        const body     = parseSection(raw, 'BODY').trim();
        if (!title || !body) { console.warn(`${tag} blog_draft parse error`); continue; }

        const metaContent = `${title}\n${metaDesc}`;
        const voiceCheck  = await runBrandVoiceCheck(metaContent, brandCtx, voiceFn)
          .catch(() => ({ score: null, issues: [], verdict: 'UNKNOWN' }));

        await createApproval({
          type:    'blog_draft',
          brand:   market.brand,
          market:  market.marketKey,
          actor:   'claude (intl-opps)',
          locationTag: `${market.flag} ${market.label}`,
          reason:  `No dedicated page — market root ranks at pos ${r.position.toFixed(1)} for "${r.keyword}" (${r.impressions} impressions)`,
          payload: {
            title, slug, body,
            metaTitle:       title,
            metaDescription: metaDesc,
            targetKeyword:   r.keyword,
            focusKeyword:    r.keyword,
            currentPos:      r.position,
            impressions:     r.impressions,
            voiceScore:      voiceCheck.score,
            voiceIssues:     voiceCheck.issues,
            voiceTopFix:     voiceCheck.issues?.[0] || null,
            wpBase:  wp.base, wpUser: wp.user, wpPass: wp.pass,
            language: 'en',
          },
        });
        queued++;
        console.log(`${tag} queued blog_draft (new, no dedicated page): "${title}" (pos ${r.position.toFixed(1)})`);
      }
    } catch (e) { console.error(`${tag} content-gap failed: ${e.message}`); }
  }

  return { queued, quickWins: quickWins.length, contentGaps: contentGaps.length, pageCreations };
}

// ── Claude content generation ─────────────────────────────────────────────────
async function callClaude(systemPrompt, userPrompt) {
  const res = await fetch(ANTHROPIC_API, {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 1500,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// Adapter so _lib/brand.js voice helpers (which call cb(prompt, opts) and read
// `.text`) work with the local callClaude(systemPrompt, userPrompt) → string.
// Passing callClaude directly makes the voice check silently fail and fall back
// to a neutral score — i.e. the gate becomes a no-op. Use this everywhere a
// voice check/fix runs in this file.
function voiceClaudeAdapter(brandName) {
  return (prompt) => callClaude(
    `You are ${brandName}'s copywriter and brand-voice analyst. Follow the instructions exactly and return only what is asked.`,
    prompt,
  );
}

// ── Parse Claude's structured output ─────────────────────────────────────────
function parseSection(text, section) {
  const regex = new RegExp(`###\\s*${section}[\\s\\S]*?\\n([\\s\\S]*?)(?=###|$)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

// ── Generate blog draft for a market+language ─────────────────────────────────
async function generateBlogDraft(market, brandCtx, brandExamples, language, usedKeywords = new Set()) {
  const keywords = market.seedKeywords[language] || market.seedKeywords['en'];
  // Rotate through keywords — skip ones used in this run
  const available = keywords.filter(k => !usedKeywords.has(k));
  const primaryKw = available[0] || keywords[0];
  usedKeywords.add(primaryKw);
  const isArabic  = language === 'ar';
  const marketCtx = buildMarketPrompt(market, buildBrandPrompt(brandCtx, brandExamples), language);

  const userPrompt = `Write a blog post for ${market.brand === 'pickl' ? 'Pickl' : 'Bonbird'} in ${market.label}.

This is NOT generic SEO content. Every sentence must sound unmistakably like the brand — specific, sharp, on-brand.

${market.isNew ? `ANGLE: NEW OPENING — ${market.brand === 'pickl' ? 'Pickl' : 'Bonbird'} just opened in ${market.label} in May 2026. Lead with the energy of a new opening. Make locals feel like they need to go NOW.` : `TARGET KEYWORD: "${primaryKw}"`}

Language: ${isArabic ? 'Arabic (local dialect — NOT Modern Standard Arabic)' : 'English'}

CONTENT REQUIREMENTS:
- 450-600 words — tight and specific, zero filler
- Opening line: make someone stop scrolling — not "Are you looking for..."
- 3 sections (use H2 or flowing paragraphs): each must reference a real menu item by name, a real location in ${market.label}, or a specific brand truth
- 3 questions locals actually search — answer them the way the brand talks, not a textbook
- End: a CTA that sounds like the brand — not "visit us today for a great experience"
- Reference: ${market.locations.length > 0 ? market.locations.join(', ') : `our ${market.label} location`}

BRAND VOICE SELF-CHECK — run before returning:
□ Could any sentence appear on a competitor's website? If yes — rewrite it
□ Is at least one specific menu item named by its actual name?
□ Does the opening make someone curious or hungry?
□ Does the CTA sound like the brand?

Return EXACTLY this structure:

### TITLE
[50-60 chars — sounds like the brand, not generic]

### META_DESCRIPTION
[120-155 chars — specific detail that makes people click]

### SLUG
[lowercase-hyphens-only]

### CONTENT
[Full post — paragraphs or minimal H2s. Brand voice throughout. Every sentence earns its place.]

### FOCUS_KEYWORD
[Single primary keyword]`;

  const raw = await callClaude(marketCtx, userPrompt);
  const result = {
    title:           parseSection(raw, 'TITLE'),
    metaDescription: parseSection(raw, 'META_DESCRIPTION'),
    slug:            parseSection(raw, 'SLUG'),
    content:         parseSection(raw, 'CONTENT'),
    focusKeyword:    parseSection(raw, 'FOCUS_KEYWORD'),
  };

  // Brand voice quality check — auto-fix if in warning zone
  if (result.content) {
    const voiceFn = voiceClaudeAdapter(brandCtx?.name || (market.brand === 'pickl' ? 'Pickl' : 'Bonbird'));
    let voiceCheck = await runBrandVoiceCheck(result.content, brandCtx, voiceFn).catch(() => ({ score: 6, verdict: 'PASS', issues: [] }));
    if (voiceCheck.score >= 5 && voiceCheck.score < 8) {
      const fixed = await fixBrandVoice(result.content, voiceCheck, brandCtx, voiceFn, brandExamples);
      if (fixed.improved) { result.content = fixed.content; voiceCheck = fixed.voiceCheck; }
    }
    result.voiceScore  = voiceCheck.score;
    result.voiceIssues = voiceCheck.issues;
    result.voiceTopFix = voiceCheck.topFix;
    console.log(`[intl-blog] ${market.label}/${language} — voice score: ${voiceCheck.score}/10 (${voiceCheck.verdict})`);
  }

  return result;
}

// ── Generate meta update for the market landing page ─────────────────────────
async function generateMetaUpdate(market, brandCtx, brandExamples, language) {
  const keywords = market.seedKeywords[language] || market.seedKeywords['en'];
  const isArabic  = language === 'ar';
  const marketCtx = buildMarketPrompt(market, buildBrandPrompt(brandCtx, brandExamples), language);

  const arabicRules = isArabic ? `
ARABIC RULES — non-negotiable:
- Write in Gulf Arabic (UAE/Bahrain/KSA style) — casual, punchy, not formal MSA
- NEVER translate brand names: "Pickl" stays "Pickl", "Bonbird" stays "Bonbird"
- NEVER translate menu item names literally — use the transliterated form:
  "smash burger" → "سماش برغر" (NOT "لحم بقري مسحوق" or "برغر مسحوق")
  "chicken sando" → "ساندويتش دجاج" or keep English
  "tenders" → "تيندرز" or "قطع دجاج مقرمشة"
  "loaded fries" → "فرايز مع إضافات"
- Keep the energy — Arabic marketing copy should feel as bold as the English
- Do NOT use "مسحوق" (powder) to describe burgers — it sounds unappetizing` : '';

  const userPrompt = `Write an optimised meta title and meta description for the ${market.brand === 'pickl' ? 'Pickl' : 'Bonbird'} ${market.label} landing page.

URL: ${buildPostUrl(market, 'meta_update', '', language)}
Language: ${isArabic ? 'Arabic (Gulf dialect)' : 'English'}
Top keywords to target: ${keywords.slice(0, 5).join(', ')}
${arabicRules}

Return EXACTLY this structure:

### META_TITLE
[50-60 characters. Include brand name and primary location keyword.]

### META_DESCRIPTION
[120-155 characters. Include a call to action. Include primary keyword. On-brand tone.]

### FOCUS_KEYWORD
[Single primary keyword — the most important one from the list above]`;

  const raw = await callClaude(marketCtx, userPrompt);

  return {
    metaTitle:       parseSection(raw, 'META_TITLE'),
    metaDescription: parseSection(raw, 'META_DESCRIPTION'),
    focusKeyword:    parseSection(raw, 'FOCUS_KEYWORD') || keywords[0] || '',
  };
}

// ── Generate on-page suggestion for market landing page ───────────────────────
async function generateOnPageSuggestion(market, brandCtx, brandExamples, language) {
  const keywords = market.seedKeywords[language] || market.seedKeywords['en'];
  const isArabic  = language === 'ar';
  const marketCtx = buildMarketPrompt(market, buildBrandPrompt(brandCtx, brandExamples), language);

  const userPrompt = `Analyse the ${market.brand === 'pickl' ? 'Pickl' : 'Bonbird'} ${market.label} landing page at ${buildPostUrl(market, 'meta_update', '', language)} and provide one specific on-page SEO improvement.

Language: ${isArabic ? 'Arabic (local dialect)' : 'English'}
Target keywords: ${keywords.slice(0, 5).join(', ')}
${market.isNew ? 'Note: This is a brand new market page — focus on establishing keyword relevance for the market.' : ''}

Return EXACTLY this structure:

### SUGGESTION_TITLE
[Short title for this suggestion, e.g. "Add H1 with location keyword"]

### SUGGESTION_DETAIL
[2-3 sentences explaining what to change, why it matters for SEO, and the expected impact. Be specific.]

### SUGGESTED_COPY
[The actual copy/text they should add or update — ready to use, on-brand tone, in the correct language]`;

  const raw = await callClaude(marketCtx, userPrompt);

  return {
    suggestionTitle:  parseSection(raw, 'SUGGESTION_TITLE'),
    suggestionDetail: parseSection(raw, 'SUGGESTION_DETAIL'),
    suggestedCopy:    parseSection(raw, 'SUGGESTED_COPY'),
  };
}

// ── Save to approvals queue via the approvals API ─────────────────────────────
async function queueApprovalItem(item) {
  const siteUrl = process.env.URL || 'https://yolkseo.netlify.app';

  // Build location tag: flag + country name
  const MARKET_FLAGS = {
    bahrain: '🇧🇭', ksa: '🇸🇦', qatar: '🇶🇦', egypt: '🇪🇬',
    jordan: '🇯🇴', oman: '🇴🇲', pakistan: '🇵🇰',
  };
  const flag        = MARKET_FLAGS[item.market] || '🌍';
  const locationTag = `${flag} ${item.marketLabel}`;
  const languageTag = (item.language || 'en').toUpperCase();

  const res = await fetch(`${siteUrl}/.netlify/functions/approvals`, {
    method: 'POST',
    headers: internalHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      action: 'create',
      actor:  'claude',
      type:    item.type,
      brand:   item.brand,
      title:   item.title,
      reason:  item.notes || `International SEO — ${item.marketLabel} ${languageTag}`,
      payload: {
        // Core content
        title:           item.title,
        body:            item.content || '',
        content:         item.content || '',
        metaTitle:       item.meta?.metaTitle || item.title,
        metaDescription: item.meta?.metaDescription || '',
        // meta_update renders p.description — map both so dashboard shows it
        description:     item.meta?.metaDescription || '',
        slug:            item.meta?.slug || '',
        targetKeyword:   item.meta?.focusKeyword || '',
        focusKeyword:    item.meta?.focusKeyword || '',
        // Voice quality score
        voiceScore:      item.meta?.voiceScore   || null,
        voiceIssues:     item.meta?.voiceIssues  || [],
        voiceTopFix:     item.meta?.voiceTopFix  || null,
        // Arabic content requires native reviewer sign-off before approval
        nativeReview:    item.language === 'ar' ? 'pending' : undefined,
        // GSC position data — populated when keyword already has impressions in the market
        // null for truly new content (no GSC data yet)
        currentPos:      item.meta?.currentPos   || null,
        impressions:     item.meta?.impressions   || null,
        // International metadata
        market:          item.market,
        marketLabel:     item.marketLabel,
        language:        item.language,
        locationTag,
        languageTag,
        targetUrl:       item.targetUrl,
        url:             item.targetUrl,
        wpBase:          item.wpBase,
        wpUser:          item.wpUser,
        wpPass:          item.wpPass,
        wpParent:        item.wpParent,
        // Suggestion fields
        suggestionTitle:  item.suggestionTitle,
        suggestionDetail: item.suggestionDetail,
        suggestedCopy:    item.suggestedCopy,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`approvals API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.items?.[0]?.id || data.item?.id || 'queued';
}

// ── Check if market+language was recently processed ───────────────────────────
async function wasRecentlyProcessed(store, marketKey, language) {
  try {
    const key  = `intlSeoRun:${marketKey}:${language}`;
    const data = await store.get(key, { type: 'json' });
    if (!data) return false;
    return Date.now() - new Date(data.runAt).getTime() < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

async function markProcessed(store, marketKey, language) {
  const key = `intlSeoRun:${marketKey}:${language}`;
  await store.set(key, JSON.stringify({ runAt: new Date().toISOString() }));
}

// ── Process a single market+language ─────────────────────────────────────────
async function processMarketLanguage(store, marketKey, market, language, force = false) {
  const tag = `[intl-seo] ${marketKey}/${language}`;
  console.log(`${tag} — starting`);

  const brandCtx      = await getBrandContext(market.brand);
  const brandExamples = await getBrandExamples(market.brand).catch(() => null);
  const queued        = [];
  const errors        = [];

  // ── DATA-DRIVEN ANALYSIS (always runs, no cache TTL) ───────────────────────
  // Run GSC-based meta rewrites for this market's actual pages.
  // Only runs once per market (not per language) — skip for non-English passes.
  if (language === 'en') {
    try {
      const gscResult = await runMarketDataDrivenSEO(market, brandCtx, brandExamples, force);
      console.log(`${tag} — data-driven result:`, JSON.stringify(gscResult));
      if (gscResult.queued > 0) {
        queued.push({ type: 'data_driven_meta', count: gscResult.queued });
      }
    } catch (e) {
      console.error(`${tag} — data-driven analysis failed: ${e.message}`);
      errors.push({ type: 'data_driven', error: e.message });
    }

    try {
      const oppsResult = await runMarketKeywordOpportunities(market, brandCtx, brandExamples, force);
      console.log(`${tag} — keyword opps result:`, JSON.stringify(oppsResult));
      if (oppsResult.queued > 0) {
        queued.push({ type: 'keyword_opportunities', count: oppsResult.queued });
      }
    } catch (e) {
      console.error(`${tag} — keyword opportunities failed: ${e.message}`);
      errors.push({ type: 'keyword_opps', error: e.message });
    }
  }

  // ── SEED KEYWORD CONTENT (7-day cache — generates new blog content) ────────
  if (!force && await wasRecentlyProcessed(store, marketKey, language)) {
    console.log(`${tag} — seed content skipped (processed within 7 days)`);
    return { queued, errors, seedSkipped: true };
  }

  // Fetch GSC data for this brand to look up existing positions/impressions per keyword
  // International market pages share the same GSC property as the main site
  const BRAND_GSC = { pickl: 'https://eatpickl.com/', bonbird: 'https://bonbirdchicken.com/' };
  let gscMap = {}; // keyword.toLowerCase() → { position, impressions }
  try {
    const gscRows = await fetchGscDirect(BRAND_GSC[market.brand] || BRAND_GSC.pickl);
    for (const row of gscRows) {
      if (row.keyword) gscMap[row.keyword.toLowerCase()] = { position: row.position, impressions: row.impressions };
    }
    console.log(`${tag} — GSC data fetched: ${Object.keys(gscMap).length} keywords`);
  } catch (e) {
    console.warn(`${tag} — GSC fetch failed (positions unavailable): ${e.message}`);
  }

  // Fuzzy GSC keyword lookup — exact match first, then market-term match, then word-overlap
  function findGscData(gscMap, focusKeyword, marketKey) {
    if (!gscMap || !focusKeyword) return null;
    const lower = focusKeyword.toLowerCase();
    // 1. Exact match
    if (gscMap[lower]) return gscMap[lower];
    // 2. Keywords containing the market country/city name
    const marketTerm = (marketKey || '').split('_')[1] || ''; // e.g. 'pakistan', 'oman'
    if (marketTerm) {
      const marketMatch = Object.entries(gscMap)
        .filter(([kw]) => kw.includes(marketTerm))
        .sort(([,a],[,b]) => (b.impressions||0) - (a.impressions||0));
      if (marketMatch.length) return marketMatch[0][1];
    }
    // 3. Word overlap — at least 2 meaningful words in common
    const kwWords = lower.split(' ').filter(w => w.length > 3);
    if (kwWords.length >= 2) {
      const overlapping = Object.entries(gscMap)
        .map(([kw, data]) => ({ kw, data, overlap: kwWords.filter(w => kw.includes(w)).length }))
        .filter(x => x.overlap >= 2)
        .sort((a, b) => b.data.impressions - a.data.impressions);
      if (overlapping.length) return overlapping[0].data;
    }
    return null;
  }

  // ── Generate multiple blog drafts per market (up to 3, keyword-rotated) ──────
  const MAX_BLOGS_PER_MARKET = 3;
  const usedKeywords = new Set();
  let blogsQueued = 0;

  while (blogsQueued < MAX_BLOGS_PER_MARKET) {
    try {
      const blog = await generateBlogDraft(market, brandCtx, brandExamples, language, usedKeywords);
      if (!blog.title || !blog.content) break;

      // Check for duplicate keyword already pending
      const siteUrl = process.env.URL || 'https://yolkseo.netlify.app';
      const existing = await fetch(`${siteUrl}/.netlify/functions/approvals?status=pending&brand=${market.brand}&type=blog_draft&limit=200`)
        .then(r => r.json()).catch(() => ({ items: [] }));
      const isDuplicate = (existing.items || []).some(i =>
        i.payload?.targetKeyword === blog.focusKeyword &&
        i.payload?.market === market.marketKey &&
        i.payload?.language === language
      );
      if (isDuplicate) {
        console.log(`${tag} — blog draft skipped (duplicate keyword: "${blog.focusKeyword}")`);
        blogsQueued++; // count it to avoid infinite loop
        continue;
      }

      const wp      = getWpCredentials(market);
      const gscData = findGscData(gscMap, blog.focusKeyword, market.marketKey);
      const id = await queueApprovalItem({
        type:        'blog_draft',
        brand:       market.brand,
        market:      market.marketKey,
        marketLabel: market.label,
        language,
        title:       blog.title,
        content:     blog.content,
        meta: {
          metaTitle:       blog.title,
          metaDescription: blog.metaDescription,
          slug:            blog.slug,
          focusKeyword:    blog.focusKeyword,
          voiceScore:      blog.voiceScore,
          voiceIssues:     blog.voiceIssues,
          voiceTopFix:     blog.voiceTopFix,
          currentPos:      gscData?.position   || null,
          impressions:     gscData?.impressions || null,
          gscKeyword:      gscData ? (Object.keys(gscMap).find(k => gscMap[k] === gscData) || null) : null,
        },
        targetUrl:   buildPostUrl(market, 'blog_draft', blog.slug || 'post', language),
        wpBase:      wp.base,
        wpUser:      wp.user,
        wpPass:      wp.pass,
        wpParent:    market.wpMarketParent,
        notes: `International SEO — ${market.label} ${language.toUpperCase()} blog post ${blogsQueued + 1}/${MAX_BLOGS_PER_MARKET}. Target keyword: ${blog.focusKeyword}`,
      });
      queued.push({ type: 'blog_draft', id });
      console.log(`${tag} — blog draft ${blogsQueued + 1}/${MAX_BLOGS_PER_MARKET} queued: ${id}`);
      blogsQueued++;
    } catch (e) {
      console.error(`${tag} — blog draft ${blogsQueued + 1} failed:`, e.message);
      errors.push({ type: 'blog_draft', error: e.message });
      break;
    }
  }

  // 2. Meta update for market landing page
  try {
    const meta = await generateMetaUpdate(market, brandCtx, brandExamples, language);
    if (meta.metaTitle && meta.metaDescription) {
      const wp = getWpCredentials(market);
      const id = await queueApprovalItem({
        type:        'meta_update',
        brand:       market.brand,
        market:      market.marketKey,
        marketLabel: market.label,
        language,
        title:       `Meta update — ${market.label} ${language.toUpperCase()} landing page`,
        meta: {
          metaTitle:       meta.metaTitle,
          metaDescription: meta.metaDescription,
          focusKeyword:    meta.focusKeyword,
        },
        targetUrl:   buildPostUrl(market, 'page', market.marketSlug, language),
        wpBase:      wp.base,
        wpUser:      wp.user,
        wpPass:      wp.pass,
        wpParent:    market.wpMarketParent,
        notes: `International SEO — optimised meta for ${market.label} page. Keyword: ${meta.focusKeyword}`,
      });
      queued.push({ type: 'meta_update', id });
      console.log(`${tag} — meta update queued: ${id}`);
    }
  } catch (e) {
    console.error(`${tag} — meta update failed:`, e.message);
    errors.push({ type: 'meta_update', error: e.message });
  }

  // 3. On-page suggestion
  try {
    const onpage = await generateOnPageSuggestion(market, brandCtx, brandExamples, language);
    if (onpage.suggestionTitle && onpage.suggestedCopy) {
      const wp = getWpCredentials(market);
      const id = await queueApprovalItem({
        type:        'onpage_suggestion',
        brand:       market.brand,
        market:      market.marketKey,
        marketLabel: market.label,
        language,
        title:       `${market.label} — ${onpage.suggestionTitle}`,
        content:     `${onpage.suggestionDetail}\n\n---\n\n**Suggested copy:**\n\n${onpage.suggestedCopy}`,
        targetUrl:   buildPostUrl(market, 'page', market.marketSlug, language),
        wpBase:      wp.base,
        wpUser:      wp.user,
        wpPass:      wp.pass,
        wpParent:    market.wpMarketParent,
        notes: `International SEO on-page suggestion for ${market.label} ${language.toUpperCase()}`,
      });
      queued.push({ type: 'onpage_suggestion', id });
      console.log(`${tag} — on-page suggestion queued: ${id}`);
    }
  } catch (e) {
    console.error(`${tag} — on-page suggestion failed:`, e.message);
    errors.push({ type: 'onpage_suggestion', error: e.message });
  }

  // Mark as processed
  await markProcessed(store, marketKey, language);

  return { queued, errors };
}

// ── Main handler ──────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  console.log(`[intl-seo] Starting — ${new Date().toISOString()}`);

  const store = getStore({
    name:   'seo-tool',
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  // Query params
  const marketParam = event.queryStringParameters?.market || 'all';
  const langParam   = event.queryStringParameters?.language || 'all';
  const force       = event.queryStringParameters?.force === 'true';

  // Determine which markets to run
  let marketsToRun = {};
  if (marketParam === 'all') {
    marketsToRun = INTERNATIONAL_MARKETS;
  } else if (marketParam === 'pickl') {
    marketsToRun = getMarketsForBrand('pickl');
  } else if (marketParam === 'bonbird') {
    marketsToRun = getMarketsForBrand('bonbird');
  } else if (INTERNATIONAL_MARKETS[marketParam]) {
    marketsToRun = { [marketParam]: INTERNATIONAL_MARKETS[marketParam] };
  } else {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Unknown market: ${marketParam}` }),
    };
  }

  const results = {};
  const summary = { total: 0, queued: 0, skipped: 0, errors: 0 };

  // Process each market sequentially to avoid Claude rate limits
  for (const [marketKey, market] of Object.entries(marketsToRun)) {
    results[marketKey] = {};

    const languagesToRun = langParam === 'all'
      ? market.languages
      : market.languages.filter(l => l === langParam);

    for (const language of languagesToRun) {
      summary.total++;
      try {
        const result = await processMarketLanguage(store, marketKey, market, language, force);
        results[marketKey][language] = result;
        if (result.skipped) {
          summary.skipped++;
        } else {
          summary.queued  += result.queued?.length  || 0;
          summary.errors  += result.errors?.length  || 0;
        }
      } catch (e) {
        console.error(`[intl-seo] ${marketKey}/${language} fatal error:`, e.message);
        results[marketKey][language] = { error: e.message };
        summary.errors++;
      }
    }
  }

  console.log('[intl-seo] Complete.', summary);

  // Send Slack notification if items were queued
  if (summary.queued > 0) {
    try {
      const siteUrl = process.env.URL || 'https://yolkseo.netlify.app';
      await fetch(`${siteUrl}/.netlify/functions/slack-notify`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          type:  'international_queue',
          count: summary.queued,
          items: [],
          market: { label: marketParam === 'all' ? 'All Markets' : marketParam, flag: '🌍' },
        }),
      });
    } catch (e) {
      console.warn('[intl-seo] Slack notification failed:', e.message);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      summary,
      results,
      completedAt: new Date().toISOString(),
    }),
  };
};
