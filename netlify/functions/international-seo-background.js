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
const { INTERNATIONAL_MARKETS, getMarketsForBrand, buildMarketPrompt, getWpCredentials, buildPostUrl, getMarketPageTokens, isExcludedPageSlug } = require('./_lib/international-config');
const { getBrandContext, getBrandExamples, buildBrandPrompt, runBrandVoiceCheck, fixBrandVoice, hardStripBannedTokens } = require('./_lib/brand');
const { fetchGscDirect, fetchGscWithPages, listApprovals, createApproval, updateApproval, extractJson } = require('./_lib/store');
const { internalHeaders, authorizeJob } = require('./_lib/auth');

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

// Returns Map of "normalizedUrl::language" → {id, status, isGscDriven}
// Used for smart meta_update dedup: GSC-driven replaces seed-block, same-quality = first wins.
async function getQueuedMetaMap(brand) {
  try {
    const items = await listApprovals({ brand, limit: 300 });
    const map = new Map();
    for (const item of items) {
      if (item.type !== 'meta_update') continue;
      const url = item.payload?.url || item.payload?.targetUrl;
      if (!url) continue;
      const lang = item.payload?.language || 'en';
      const key = `${url.toLowerCase().replace(/\/$/, '')}::${lang}`;
      map.set(key, {
        id: item.id,
        status: item.status || 'pending',
        isGscDriven: !!(item.payload?.impressions > 0),
      });
    }
    return map;
  } catch { return new Map(); }
}

async function dismissPendingMeta(id, reason) {
  try {
    await updateApproval(id, { status: 'dismissed' }, {
      at: Date.now(), actor: 'claude (intl-seo)', action: 'dismissed',
      note: reason || 'replaced by higher-quality GSC-driven meta_update',
    });
    console.log(`[intl-seo] dismissed seed-block meta_update ${id}: ${reason}`);
  } catch (e) {
    console.warn(`[intl-seo] could not dismiss meta ${id}: ${e.message}`);
  }
}

// ── Core data-driven analysis per market ──────────────────────────────────────
// Mirrors runMetaRewrites from scheduler-background.js but scoped to a market's pages.
// Returns { queued, skipped, candidates }
async function runMarketDataDrivenSEO(market, brandCtx, brandExamples, force = false, language = 'en') {
  const BRAND_GSC = { pickl: 'https://eatpickl.com/', bonbird: 'https://bonbirdchicken.com/' };
  const isAr = language !== 'en';                          // ar/ur both surface as Arabic script in GSC
  const scriptMatch = kw => isAr ? /[؀-ۿ]/.test(kw) : !/[؀-ۿ]/.test(kw);
  const tag = `[intl-seo/${market.marketKey}/${language}]`;

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
  const alreadyQueuedMetaMap = await getQueuedMetaMap(market.brand);
  const alreadyQueuedKws     = await getQueuedKeywordsForMarket(market.brand);

  const candidates = Object.values(pageMap)
    .filter(r => r.position <= 20 && r.impressions >= 50) // lower threshold than UAE (50 not 100)
    .map(r => ({ ...r, ctrGap: expected(r.position) - r.ctr }))
    .filter(r => r.ctrGap > 0.010) // 1.0pp threshold (slightly lower than UAE's 1.5pp)
    .filter(r => force || !alreadyQueuedKws.has(r.keyword.toLowerCase().trim()))
    .filter(r => {
      if (force) return true;
      const key = `${r.page.toLowerCase().replace(/\/$/, '')}::${isAr ? 'ar' : 'en'}`;
      const ex = alreadyQueuedMetaMap.get(key);
      if (!ex) return true;                          // nothing queued — proceed
      if (ex.status !== 'pending') return false;     // pushed/approved — don't re-queue
      if (ex.isGscDriven) return false;              // already GSC-driven pending — first wins
      return true;                                   // seed-block pending — will dismiss + replace
    })
    .filter(r => keywordMatchesMenu(r.keyword, brandCtx))
    .filter(r => keywordMatchesMarket(r.keyword, market.marketKey))
    .filter(r => scriptMatch(r.keyword)) // this pass's language only (Arabic queries → ar pass)
    .sort((a, b) => b.ctrGap - a.ctrGap)
    .slice(0, 3); // max 3 meta rewrites per market per run

  if (!candidates.length) {
    console.log(`${tag} no CTR gap candidates after filtering (${Object.keys(pageMap).length} pages checked)`);
    return { queued: 0, skipped: 'no_candidates', pages: Object.keys(pageMap).length };
  }

  // Build prompt for international meta rewrites
  const brandPrompt    = buildBrandPrompt(brandCtx, brandExamples);
  const marketCtx      = buildMarketPrompt(market, brandPrompt, language);
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
${isAr ? `- Write the title and description in ARABIC (local ${market.label} dialect, NOT Modern Standard Arabic)
- Title: 50-60 characters · Description: 120-155 characters` : `- Title: 52-58 characters exactly
- Description: 150-158 characters exactly`}
- Only reference REAL menu items: ${menuItems || 'use items from brand context'}
${brandCtx?.menu?.spiceSystem ? `- ONLY use the brand's actual spice/heat system: ${brandCtx.menu.spiceSystem} — NEVER invent heat levels` : ''}- No generic phrases ("great food", "best in ${market.label}", "quality ingredients")
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
      let voiceCheck = await runBrandVoiceCheck(metaContent, brandCtx, voiceFn)
        .catch(() => ({ score: 6, issues: [], verdict: 'UNKNOWN' }));
      if (voiceCheck.score !== null && voiceCheck.score < 8) {
        const fixed = await fixBrandVoice(metaContent, voiceCheck, brandCtx, voiceFn, brandExamples, feedbackNotes);
        if (fixed.improved) {
          const lines = fixed.content.trim().split('\n').filter(Boolean);
          if (lines[0]) p.title       = lines[0].slice(0, 60);
          if (lines[1]) p.description = lines[1].slice(0, 160);
          voiceCheck = fixed.voiceCheck;
        }
      }
      if (voiceCheck.score !== null && voiceCheck.score < 8) {
        console.warn(`${tag} meta_update voice ${voiceCheck.score}/10 — gate reject (${matched.page})`);
        continue;
      }

      // Dismiss any pending seed-block meta for this page before queuing the GSC-driven one
      const metaKey = `${matched.page.toLowerCase().replace(/\/$/, '')}::${isAr ? 'ar' : 'en'}`;
      const existingMeta = alreadyQueuedMetaMap.get(metaKey);
      if (existingMeta && existingMeta.status === 'pending' && !existingMeta.isGscDriven) {
        await dismissPendingMeta(existingMeta.id, `replaced by GSC-driven meta_update for ${matched.page} (pos ${matched.position?.toFixed(1)}, ${matched.impressions} impressions)`);
      }

      await createApproval({
        type:        'meta_update',
        brand:       market.brand,
        market:      market.marketKey,
        actor:       'claude (intl-scheduler)',
        locationTag: `${market.flag} ${market.label}`,
        languageTag: language.toUpperCase(),
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
          language:      language,
          nativeReview:  isAr ? 'pending' : undefined,
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

// ── SERP-feature-aware routing ────────────────────────────────────────────────
// The competitor matrix captures which SERP features each keyword's results show
// (local pack, PAA, AI Overview, featured snippet, video). Content-gen used to
// ignore them and write a blog regardless. We now load them per market and (a)
// route local-pack keywords to a landing PAGE not a blog, and (b) inject
// feature-specific tactics into every prompt so content is built to win them.
async function loadSerpFeatureMap(market) {
  try {
    const s   = getStore({ name: 'seo-tool', consistency: 'strong', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    const key = `competitorMatrix:${market.brand}:${market.brand}_${market.marketKey}`;
    const data = await s.get(key, { type: 'json' });
    const map = {};
    for (const row of (data?.rows || [])) {
      if (row?.keyword && row.serpFeatures) map[row.keyword.toLowerCase().trim()] = row.serpFeatures;
    }
    return map;
  } catch { return {}; }
}

function serpFeatureBrief(features) {
  if (!features) return { tag: null, directive: '', isLocal: false };
  const parts = [];
  if (features.localPack)     parts.push('LOCAL PACK present — this is a local-intent SERP. A blog post will not rank here; the win is a dedicated location landing page plus Google Business Profile signals. Lead with address / area-served / hours / ordering intent, not an article.');
  if (features.peopleAlsoAsk) parts.push('PEOPLE ALSO ASK present — add a concise FAQ section answering the top related questions directly, structured so it can carry FAQ schema.');
  if (features.aiOverview)    parts.push('AI OVERVIEW present — open with a direct, factual 1-2 sentence answer and use clear structured sub-points so the page is easy for AI answers to cite.');
  if (features.featuredSnippet) parts.push('FEATURED SNIPPET present — include a tight, snippet-style direct answer (40-55 words) or a short ordered/unordered list near the top to win the snippet.');
  if (features.video)         parts.push('VIDEO results present — consider an embedded or described video element for this topic.');
  const tag = [
    features.localPack       && 'Local Pack',
    features.peopleAlsoAsk   && 'PAA',
    features.aiOverview      && 'AI Overview',
    features.featuredSnippet && 'Featured Snippet',
    features.video           && 'Video',
  ].filter(Boolean).join(' · ') || null;
  const directive = parts.length
    ? `\n\nSERP FEATURE STRATEGY — the live SERP for this keyword shows the features below; tailor the content to win them:\n${parts.map(p => '- ' + p).join('\n')}`
    : '';
  return { tag, directive, isLocal: !!features.localPack };
}

// ── Page-level competitor context ─────────────────────────────────────────────
// The matrix knows WHICH competitor pages outrank us for each keyword (topDomains:
// domain + url + rank). Content-gen used to see only a bare keyword. Now we feed
// the actual competing pages in, so the prompt writes to BEAT specific URLs rather
// than into a vacuum. Reads the same matrix blob as the SERP map.
async function loadCompetitorContext(market) {
  try {
    const s    = getStore({ name: 'seo-tool', consistency: 'strong', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    const key  = `competitorMatrix:${market.brand}:${market.brand}_${market.marketKey}`;
    const data = await s.get(key, { type: 'json' });
    const ourRoot = (market.brand === 'pickl' ? 'eatpickl' : 'bonbirdchicken');
    const map = {};
    for (const row of (data?.rows || [])) {
      if (!row?.keyword) continue;
      const comps = (row.topDomains || [])
        .filter(d => d.domain && !d.domain.includes(ourRoot) && d.rank <= 10)
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 3)
        .map(d => ({ domain: d.domain, url: d.url || null, rank: d.rank }));
      if (comps.length) map[row.keyword.toLowerCase().trim()] = comps;
    }
    return map;
  } catch { return {}; }
}

function competitorBrief(comps) {
  if (!comps || !comps.length) return { directive: '', list: null };
  const lines = comps.map(c => `  - #${c.rank} ${c.domain}${c.url ? ` (${c.url})` : ''}`).join('\n');
  return {
    list: comps,
    directive: `\n\nCOMPETITORS TO BEAT — these pages currently rank top-10 for this keyword. Your content must be more useful, specific and complete than theirs (don't copy them — out-cover them):\n${lines}`,
  };
}

// ── Cannibalization guard ─────────────────────────────────────────────────────
// Before creating a NEW page/blog for a keyword, confirm we don't already have a
// DEDICATED page ranking for it on the property. GSC is the source of truth for
// what exists + ranks; a second page for the same intent splits authority and the
// two pages cannibalize each other. Build keyword → ranking pages from the full
// (whole-property) GSC set, then check for an existing dedicated page.
function normPage(p) { return p.split('?')[0].split('#')[0].toLowerCase().replace(/\/$/, ''); }

function buildOwnedKeywordMap(rowsWithPages) {
  const map = {}; // normalized keyword → Set(normalized pageUrl)
  for (const r of rowsWithPages) {
    if (!r.keyword || !r.page) continue;
    const kw = r.keyword.toLowerCase().trim();
    (map[kw] = map[kw] || new Set()).add(normPage(r.page));
  }
  return map;
}

// Returns an existing dedicated page already ranking for this keyword (other than
// the page currently surfaced), or null. "Dedicated" = under the market slug with
// a child segment (mirrors isDedicatedPage), i.e. not the market root/category.
function existingDedicatedPageFor(keyword, currentPage, ownedMap, market) {
  const pages = ownedMap[keyword.toLowerCase().trim()];
  if (!pages) return null;
  const cur  = normPage(currentPage);
  const slug = market.marketSlug.toLowerCase();
  for (const p of pages) {
    if (p === cur) continue;
    const path = p.replace(/^https?:\/\/[^\/]+/, '');
    if (path.startsWith(`/${slug}/`) && path.split('/').filter(Boolean).length > 1) return p;
  }
  return null;
}

// ── International keyword opportunities (pos 11-20 → page_update, pos 21-35 → blog_draft) ─────
async function runMarketKeywordOpportunities(market, brandCtx, brandExamples, force = false, language = 'en') {
  const BRAND_GSC = { pickl: 'https://eatpickl.com/', bonbird: 'https://bonbirdchicken.com/' };
  const isAr = language !== 'en';                          // ar/ur both surface as Arabic script in GSC
  const scriptMatch = kw => isAr ? /[؀-ۿ]/.test(kw) : !/[؀-ۿ]/.test(kw);
  const langDirective = isAr
    ? `\nLANGUAGE: Write ALL output (titles, descriptions, suggestions, copy, body) in ARABIC — local ${market.label} dialect, NOT Modern Standard Arabic. URLs/slugs stay in English.`
    : '';
  const tag = `[intl-opps/${market.marketKey}/${language}]`;

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
  const marketCtx          = buildMarketPrompt(market, brandPrompt, language);
  const wp                 = getWpCredentials(market);
  const brandName          = brandCtx?.name || (market.brand === 'pickl' ? 'Pickl' : 'Bonbird');
  const voiceFn            = voiceClaudeAdapter(brandName);
  let queued               = 0;
  let pageCreations        = 0;
  const serpMap            = await loadSerpFeatureMap(market); // keyword → serpFeatures (from competitor matrix)
  const ownedMap           = buildOwnedKeywordMap(rowsWithPages); // keyword → pages we already rank for (cannibalization guard)
  const compCtx            = await loadCompetitorContext(market); // keyword → top competing pages (page-level competitor context)

  // ── QUICK WINS: pos 11-20 → page_update ──────────────────────────────────
  const quickWins = Object.values(pageMap)
    .filter(r => r.position > 10 && r.position <= 20 && r.impressions >= 30)
    .filter(r => force || !alreadyQueuedKws.has(r.keyword.toLowerCase().trim()))
    .filter(r => force || !alreadyQueuedPages.has(r.page.toLowerCase().replace(/\/$/, '')))
    .filter(r => keywordMatchesMenu(r.keyword, brandCtx))
    .filter(r => keywordMatchesMarket(r.keyword, market.marketKey))
    .filter(r => scriptMatch(r.keyword)) // this pass's language only
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 2);

  for (const r of quickWins) {
    try {
      const sb = serpFeatureBrief(serpMap[r.keyword.toLowerCase().trim()]);
      const cb = competitorBrief(compCtx[r.keyword.toLowerCase().trim()]);
      const userPrompt = `This ${market.brand === 'pickl' ? 'Pickl' : 'Bonbird'} page ranks position ${r.position.toFixed(1)} for "${r.keyword}" in ${market.label} with ${r.impressions} impressions but isn't on page 1.${langDirective}

PAGE: ${r.page}
KEYWORD: "${r.keyword}"
POSITION: ${r.position.toFixed(1)}
IMPRESSIONS: ${r.impressions}
MARKET: ${market.label}${feedbackNotes.length ? `

HUMAN FEEDBACK — NEVER do any of the following:
${feedbackNotes.map(n => `- ${n}`).join('\n')}` : ''}

Provide 3-5 specific on-page changes to push this to top 10. Be tactical and specific — reference the URL, what the page is likely about, and what changes will move rankings.${sb.directive}${cb.directive}

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
        languageTag: language.toUpperCase(),
        reason:  parsed.rationale || `Position ${r.position.toFixed(1)} quick win — ${r.impressions} impressions for "${r.keyword}"`,
        payload: {
          url:              r.page,
          targetKeyword:    r.keyword,
          currentPos:       r.position,
          impressions:      r.impressions,
          suggestions:      parsed.suggestions,
          suggestionTitle:  parsed.title,
          suggestionDetail: parsed.suggestions.join(' | '),
          serpFeatures:     serpMap[r.keyword.toLowerCase().trim()] || null,
          serpFeatureTag:   sb.tag,
          competitors:      cb.list,
          wpBase:  wp.base, wpUser: wp.user, wpPass: wp.pass,
          language: language,
          nativeReview: isAr ? 'pending' : undefined,
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
    .filter(r => scriptMatch(r.keyword)) // this pass's language only
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 1);

  for (const r of contentGaps) {
    try {
      const existingPage = isDedicatedPage(r.page);
      const sb = serpFeatureBrief(serpMap[r.keyword.toLowerCase().trim()]);
      const cb = competitorBrief(compCtx[r.keyword.toLowerCase().trim()]);

      // Cannibalization guard: we're only about to CREATE new content when the
      // ranking page is the market root (not a dedicated page). If a dedicated
      // page for this keyword already exists elsewhere, creating another splits
      // authority — skip it (the existing page gets picked up on its own merits).
      if (!existingPage && !force) {
        const owned = existingDedicatedPageFor(r.keyword, r.page, ownedMap, market);
        if (owned) {
          console.log(`${tag} cannibalization avoided — "${r.keyword}" already targeted by dedicated page ${owned}; not creating new content`);
          continue;
        }
      }

      if (existingPage) {
        // Dedicated page already exists but ranking poorly — update it, don't create a competing one
        const userPrompt = `This ${market.brand === 'pickl' ? 'Pickl' : 'Bonbird'} page already exists but ranks at position ${r.position.toFixed(1)} for "${r.keyword}" in ${market.label} — it needs on-page improvements to break into page 1.${langDirective}

PAGE: ${r.page}
KEYWORD: "${r.keyword}"
POSITION: ${r.position.toFixed(1)}
IMPRESSIONS: ${r.impressions}
MARKET: ${market.label}
NOTE: This is an existing page. Do NOT suggest creating a new page — suggest how to improve this one.${feedbackNotes.length ? `

HUMAN FEEDBACK — NEVER do any of the following:
${feedbackNotes.map(n => `- ${n}`).join('\n')}` : ''}

Provide 4-6 specific on-page improvements (content depth, heading structure, internal links, keyword coverage, E-E-A-T signals) to push it from position ${r.position.toFixed(1)} into top 10.${sb.directive}${cb.directive}

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
          languageTag: language.toUpperCase(),
          reason:  parsed.rationale || `Existing page at pos ${r.position.toFixed(1)} for "${r.keyword}" — improve rather than duplicate`,
          payload: {
            url:              r.page,
            targetKeyword:    r.keyword,
            currentPos:       r.position,
            impressions:      r.impressions,
            suggestions:      parsed.suggestions,
            suggestionTitle:  parsed.title,
            suggestionDetail: parsed.suggestions.join(' | '),
            serpFeatures:     serpMap[r.keyword.toLowerCase().trim()] || null,
            serpFeatureTag:   sb.tag,
            competitors:      cb.list,
            wpBase:  wp.base, wpUser: wp.user, wpPass: wp.pass,
            language: language,
            nativeReview: isAr ? 'pending' : undefined,
          },
        });
        queued++;
        console.log(`${tag} queued page_update (existing, pos ${r.position.toFixed(1)}): ${r.page}`);

      } else if (hasLocationIntent(r.keyword) || sb.isLocal) {
        // Location/service intent + no dedicated page → full landing PAGE.
        // International port of the UAE scheduler's runPageCreation — previously
        // these gaps only ever produced a blog post, never a proper landing page.
        const userPrompt = `Create a complete, conversion-focused landing page for ${brandName} in ${market.label} targeting "${r.keyword}".${langDirective}

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

${sb.directive}${cb.directive}

Return ONLY JSON:
{"title":"SEO title 55-60 chars","description":"meta description 150-158 chars","targetKeyword":"${r.keyword}","slug":"market-aware-url-slug e.g best-burger-${market.marketSlug}","pageHeading":"H1 text","excerpt":"short description for page lists","body":"<full page HTML — h2, p, ul, strong, image placeholder comments — no outer html/body tags>","pageType":"location|service","rationale":"why a dedicated page will outrank the market root"}`;

        const raw    = await callClaude(marketCtx, userPrompt);
        const parsed = extractJson(raw);
        if (!parsed?.body || !parsed?.title) { console.warn(`${tag} page_creation parse error`); continue; }

        // Brand voice gate — auto-fix 5-7, skip below 5 (mirrors UAE runPageCreation)
        let voiceCheck = await runBrandVoiceCheck(parsed.body, brandCtx, voiceFn)
          .catch(() => ({ score: 6, issues: [], verdict: 'PASS', topFix: null }));
        if (voiceCheck.score < 8) {
          const fixed = await fixBrandVoice(parsed.body, voiceCheck, brandCtx, voiceFn, brandExamples, feedbackNotes);
          if (fixed.improved) { parsed.body = fixed.content; voiceCheck = fixed.voiceCheck; }
        }
        if (voiceCheck.score < 8) { console.warn(`${tag} page_creation voice ${voiceCheck.score}/10 — gate reject`); continue; }

        await createApproval({
          type:    'page_creation',
          brand:   market.brand,
          market:  market.marketKey,
          actor:   'claude (intl-opps)',
          locationTag: `${market.flag} ${market.label}`,
          languageTag: language.toUpperCase(),
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
            serpFeatures:  serpMap[r.keyword.toLowerCase().trim()] || null,
            serpFeatureTag: sb.tag,
            competitors:   cb.list,
            wpAction:      'create_page',
            voiceScore:    voiceCheck.score,
            voiceIssues:   voiceCheck.issues,
            voiceTopFix:   voiceCheck.topFix || voiceCheck.issues?.[0] || null,
            currentPos:    r.position,
            impressions:   r.impressions,
            wpBase:  wp.base, wpUser: wp.user, wpPass: wp.pass,
            language: language,
            nativeReview: isAr ? 'pending' : undefined,
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

LANGUAGE: ${isAr ? `Arabic — local ${market.label} dialect, NOT Modern Standard Arabic` : 'English'}
WORD COUNT: 400-550 words
TARGET KEYWORD: "${r.keyword}"
MARKET: ${market.label}
REAL MENU ITEMS TO REFERENCE: ${menuItems || 'use items from brand context'}
${brandCtx?.menu?.spiceSystem ? `SPICE/HEAT SYSTEM (use ONLY these names, never invent levels): ${brandCtx.menu.spiceSystem}` : ''}MARKET LOCATIONS: ${market.locations?.join(', ') || market.label}${feedbackNotes.length ? `

HUMAN FEEDBACK — NEVER do any of the following:
${feedbackNotes.map(n => `- ${n}`).join('\n')}` : ''}

Every sentence must sound like the brand — specific, direct, no filler. Open with energy. Reference real menu items by name.${sb.directive}${cb.directive}

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
        let body       = parseSection(raw, 'BODY').trim();
        if (!title || !body) { console.warn(`${tag} blog_draft parse error`); continue; }

        body = hardStripBannedTokens(body);
        let voiceCheck = await runBrandVoiceCheck(body, brandCtx, voiceFn)
          .catch(() => ({ score: 6, issues: [], verdict: 'UNKNOWN' }));
        if (voiceCheck.score < 8) {
          const fixed = await fixBrandVoice(body, voiceCheck, brandCtx, voiceFn, brandExamples, feedbackNotes);
          if (fixed.improved) { body = fixed.content; voiceCheck = fixed.voiceCheck; }
        }
        if (voiceCheck.score < 5) {
          console.warn(`${tag} blog_draft voice ${voiceCheck.score}/10 too low — skipped (${r.keyword})`);
          continue;
        }

        await createApproval({
          type:    'blog_draft',
          brand:   market.brand,
          market:  market.marketKey,
          actor:   'claude (intl-opps)',
          locationTag: `${market.flag} ${market.label}`,
          languageTag: language.toUpperCase(),
          reason:  `No dedicated page — market root ranks at pos ${r.position.toFixed(1)} for "${r.keyword}" (${r.impressions} impressions)`,
          payload: {
            title, slug, body,
            metaTitle:       title,
            metaDescription: metaDesc,
            targetKeyword:   r.keyword,
            focusKeyword:    r.keyword,
            currentPos:      r.position,
            impressions:     r.impressions,
            serpFeatures:    serpMap[r.keyword.toLowerCase().trim()] || null,
            serpFeatureTag:  sb.tag,
            competitors:     cb.list,
            voiceScore:      voiceCheck.score,
            voiceIssues:     voiceCheck.issues,
            voiceTopFix:     voiceCheck.issues?.[0] || null,
            wpBase:  wp.base, wpUser: wp.user, wpPass: wp.pass,
            language: language,
            nativeReview: isAr ? 'pending' : undefined,
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
async function callClaude(systemPrompt, userPrompt, opts = {}) {
  const res = await fetch(ANTHROPIC_API, {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: opts.max_tokens || 1500,
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
async function generateBlogDraft(market, brandCtx, brandExamples, language, usedKeywords = new Set(), feedbackNotes = [], opportunityKeywords = []) {
  // Discovered keyword opportunities (from keyword-discovery) take priority over
  // static seeds — this is the wiring that makes intl discovery actually drive
  // content. Match opportunity keywords to the pass language (Arabic vs Latin).
  const isAr    = language === 'ar';
  const oppKw   = (opportunityKeywords || []).filter(k => isAr ? /[؀-ۿ]/.test(k) : !/[؀-ۿ]/.test(k));
  const keywords = [...oppKw, ...(market.seedKeywords[language] || market.seedKeywords['en'])];
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
${brandCtx?.menu?.spiceSystem ? `- ONLY use the brand's actual spice/heat system: ${brandCtx.menu.spiceSystem} — NEVER invent heat levels` : ''}
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

  // Brand voice gate — hard-strip, score, fix if <8, reject if still <8 after fix
  if (result.content) {
    result.content = hardStripBannedTokens(result.content);
    const voiceFn = voiceClaudeAdapter(brandCtx?.name || (market.brand === 'pickl' ? 'Pickl' : 'Bonbird'));
    let voiceCheck = await runBrandVoiceCheck(result.content, brandCtx, voiceFn).catch(() => ({ score: 6, verdict: 'PASS', issues: [] }));
    if (voiceCheck.score < 8) {
      const fixed = await fixBrandVoice(result.content, voiceCheck, brandCtx, voiceFn, brandExamples, feedbackNotes);
      if (fixed.improved) { result.content = fixed.content; voiceCheck = fixed.voiceCheck; }
    }
    console.log(`[intl-blog] ${market.label}/${language} — voice score: ${voiceCheck.score}/10 (${voiceCheck.verdict})`);
    if (voiceCheck.score < 8) {
      console.warn(`[intl-blog] ${market.label}/${language} — rejected by voice gate (${voiceCheck.score}/10)`);
      return null;
    }
    result.voiceScore  = voiceCheck.score;
    result.voiceIssues = voiceCheck.issues;
    result.voiceTopFix = voiceCheck.topFix;
  }

  return result;
}

// ── Fetch live page HTML from WP REST (strips tags, returns plain text) ───────
async function fetchPageText(market, language) {
  try {
    const slug   = language === 'ar' && market.arabicSlug ? market.arabicSlug : market.marketSlug;
    const prefix = market.wpBrand === 'pickl' ? 'WP_PICKL' : 'WP_BONBIRD';
    const wpBase = process.env[`${prefix}_BASE`];
    const wpUser = process.env[`${prefix}_USER`];
    const wpPass = process.env[`${prefix}_APP_PASS`];
    if (!wpBase || !wpUser || !wpPass) return null;
    const auth = Buffer.from(`${wpUser}:${wpPass.replace(/\s/g, '')}`).toString('base64');
    const headers = { Authorization: `Basic ${auth}` };
    for (const type of ['pages', 'posts']) {
      const res  = await fetch(`${wpBase}/wp-json/wp/v2/${type}?slug=${encodeURIComponent(slug)}&_fields=id,link,content,status`, { headers });
      const data = await res.json().catch(() => null);
      if (Array.isArray(data) && data.length) {
        const html  = data[0].content?.rendered || '';
        const text  = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const words = text.split(/\s+/).filter(Boolean).length;
        return { found: true, postId: data[0].id, postType: type, text: text.slice(0, 3000), wordCount: words, link: data[0].link };
      }
    }
    return { found: false };
  } catch (e) {
    console.warn('[fetchPageText] error:', e.message);
    return null;
  }
}

// ── Generate on-page suggestion for market landing page ───────────────────────
async function generateOnPageSuggestion(market, brandCtx, brandExamples, language) {
  // Safety: never generate Arabic suggestions when market has no Arabic slug
  if (language === 'ar' && !market.arabicSlug) {
    console.log(`[generateOnPageSuggestion] ${market.marketKey} — skipping AR (no arabicSlug)`);
    return null;
  }

  const keywords  = market.seedKeywords[language] || market.seedKeywords['en'];
  const isArabic  = language === 'ar';
  const marketCtx = buildMarketPrompt(market, buildBrandPrompt(brandCtx, brandExamples), language);
  const pageUrl   = buildPostUrl(market, 'page', market.marketSlug, language);

  // Fetch actual page content so Claude analyses real copy — not a blind URL
  const page = await fetchPageText(market, language);

  let pageContentBlock;
  if (page?.found && page.wordCount >= 50) {
    pageContentBlock = `PAGE CONTENT (${page.wordCount} words — analyse this):
---
${page.text}
---`;
  } else if (page?.found) {
    pageContentBlock = `Note: Page exists in WordPress but has very little content (${page.wordCount || 0} words). Focus suggestions on content gaps and what should be added.`;
  } else {
    pageContentBlock = `Note: This page does not exist in WordPress yet (URL: ${pageUrl}). Provide guidance on what the page SHOULD contain when built — target keywords, H1 structure, and content outline.`;
  }

  const userPrompt = `Analyse the ${market.brand === 'pickl' ? 'Pickl' : 'Bonbird'} ${market.label} landing page and provide one specific, actionable on-page SEO improvement.

URL: ${pageUrl}
Language: ${isArabic ? 'Arabic (local dialect)' : 'English'}
Target keywords: ${keywords.slice(0, 5).join(', ')}
${market.isNew ? '⚡ NEW MARKET — just opened. Prioritise establishing keyword relevance.' : ''}

${pageContentBlock}

BRAND CONSTRAINTS — non-negotiable in any suggested copy:
- Only reference real menu items from brand context
${brandCtx?.menu?.spiceSystem ? `- Spice/heat system: ${brandCtx.menu.spiceSystem} — use these exact names, never invent levels` : ''}- No generic phrases ("great food", "delicious", "quality ingredients")

Pick the SINGLE most impactful improvement from: H1 optimisation, missing keyword in first 100 words, weak/missing meta, thin content, no CTA, poor internal linking anchor text.

Return EXACTLY this structure:

### SUGGESTION_TITLE
[Short imperative title, e.g. "Add keyword-rich H1" or "Insert CTA above the fold"]

### SUGGESTION_DETAIL
[2-3 sentences: what to change, why it matters for SEO, expected impact. Reference SPECIFIC content from the page above — not generic advice.]

### SUGGESTED_COPY
[Ready-to-use copy in the correct language — the exact text to add or replace. Make it on-brand and specific to ${market.label}.]`;

  const raw = await callClaude(marketCtx, userPrompt);

  return {
    suggestionTitle:  parseSection(raw, 'SUGGESTION_TITLE'),
    suggestionDetail: parseSection(raw, 'SUGGESTION_DETAIL'),
    suggestedCopy:    parseSection(raw, 'SUGGESTED_COPY'),
  };
}

// Strip markdown/formatting and trim to a clean length at a sentence/word boundary
// (never mid-word). Fixes "**bold** leaks into title" and "desc cut off mid-word".
function cleanMeta(text, maxLen) {
  if (!text) return '';
  let s = String(text)
    .replace(/\*\*|__/g, '')                 // bold markers
    .replace(/\*([^*]+)\*/g, '$1')           // *italics*
    .replace(/`+/g, '')                      // code ticks
    .replace(/^#+\s*/gm, '')                 // heading hashes
    .replace(/^[-•]\s*/gm, '')               // stray bullets
    .replace(/\s+/g, ' ')                    // collapse whitespace
    .trim();
  if (s.length <= maxLen) return s;
  const slice = s.slice(0, maxLen);
  // Prefer ending at the LAST real sentence boundary inside the limit — a short
  // complete sentence beats a long fragment. If that leaves it under the min length,
  // the caller's min-length guard rejects it (better regenerated than truncated).
  let sentenceEnd = -1;
  const re = /[.!?؟](?=\s|$|["'”’)])/g; let mm;
  while ((mm = re.exec(slice)) !== null) sentenceEnd = mm.index;
  if (sentenceEnd >= 40) return slice.slice(0, sentenceEnd + 1).trim();
  // No usable sentence boundary — trim to a word boundary and drop any dangling connector.
  const wordEnd = slice.lastIndexOf(' ');
  let out = (wordEnd > 0 ? slice.slice(0, wordEnd) : slice).trim();
  const dangling = /[\s,]+(and|or|the|a|an|to|of|in|on|at|by|for|with|from|into|across|over|as|but|so|your|our)$/i;
  while (dangling.test(out)) out = out.replace(dangling, '');
  return out.replace(/[\s,]+$/, '').trim();
}

// True if the text makes any award/accolade claim (EN or AR) worth fact-checking.
function mentionsAward(text) {
  return /\baward|\bwinner|\bwinning|best burger|best fried chicken|restaurant of the year|time ?out|deliveroo|homegrown|\b\d+[- ]?(time|year)|years? (running|in a row)|جائز|جوائز|أفضل مطعم|أفضل برغر|فاز|الأفضل/i.test(String(text || ''));
}

// Fact-claim guard: a prompt rule alone did NOT stop Claude fabricating awards
// (e.g. "four-time TimeOut Best Burger" — it's 2× Best Burger + 4× Deliveroo RotY,
// separate awards). This is a mechanical backstop — when award language is present,
// a strict verifier checks it against the ONLY verified facts and rejects if wrong.
// Bilingual (handles the Arabic fabrications too). Fails CLOSED (reject) on doubt.
async function verifyAwardClaims(text, brandCtx) {
  const awards = (brandCtx?.awards || []).filter(Boolean).join('\n');
  if (!awards) return { ok: false, reason: 'brand has no verified awards, but the copy claims one' };
  const prompt = `VERIFIED AWARDS — the ONLY true awards/accolades for this brand:
${awards}

COPY TO CHECK (may be English or Arabic):
"${text}"

Check every award/accolade claim in the copy. Reply ONLY JSON: {"ok": boolean, "reason": "short"}.
Set ok=false if ANY claim is: a wrong count (e.g. "four-time Best Burger" when it's 2×), misattributed to the wrong body (e.g. Restaurant of the Year credited to Time Out instead of Deliveroo), exaggerated, invented, or COMBINES two separate awards into one. Set ok=true only if every award mention matches the verified facts exactly, or there are no award claims.`;
  try {
    const raw = await callClaude('You are a strict fact-checker. Return only JSON.', prompt, { max_tokens: 200 });
    const parsed = extractJson(raw);
    if (!parsed || typeof parsed.ok !== 'boolean') return { ok: false, reason: 'award-verifier-unparseable (fail-closed)' };
    return parsed;
  } catch (e) {
    return { ok: false, reason: `award-verifier-error: ${e.message} (fail-closed)` };
  }
}

// ── Full market page meta sweep ───────────────────────────────────────────────
// Discovers ALL of a market's WordPress pages (root + country sub-pages like
// /bahrain-events/, /franchise-bahrain/, /ksa-locations/) via slug-token matching,
// then runs a UAE-quality meta audit: fetch current meta → batch-evaluate with
// skip-if-good → voice-gate → dedup → queue improvements. Supersedes the old
// single-page generateMetaUpdate seed block.
async function runMarketPageMetaSweep(market, brandCtx, brandExamples, language, feedbackNotes = [], force = false) {
  const isAr = language === 'ar';
  const tag  = `[intl-sweep/${market.marketKey}/${language}]`;
  if (isAr && !market.arabicSlug) { console.log(`${tag} — skip AR (no arabicSlug)`); return { queued: 0, skipped: 'no_arabic_slug' }; }

  const siteUrl = process.env.URL || 'https://yolkseo.netlify.app';
  const tokens  = getMarketPageTokens(market);

  // 1. Discover pages from WordPress
  let allPages = [];
  try {
    const res = await fetch(`${siteUrl}/.netlify/functions/wordpress`, {
      method:  'POST',
      headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body:    JSON.stringify({ action: 'list_market_pages', brand: market.brand, payload: { tokens } }),
    });
    const data = await res.json().catch(() => null);
    allPages = data?.matched || [];
    console.log(`${tag} — discovered ${allPages.length}/${data?.total ?? '?'} pages [tokens: ${tokens.join(', ')}]: ${allPages.map(p => p.slug).join(', ') || '(none)'}`);
  } catch (e) {
    console.warn(`${tag} — page discovery failed: ${e.message}`);
    return { queued: 0, skipped: 'discovery_failed' };
  }
  if (!allPages.length) return { queued: 0, skipped: 'no_pages_found', tokens };

  // Drop legal/utility/campaign pages (T&C, privacy, giveaway, world-tour) — never local-SEO targets
  const excluded = allPages.filter(p => isExcludedPageSlug(p.slug));
  if (excluded.length) console.log(`${tag} — excluded ${excluded.length} non-SEO pages: ${excluded.map(p => p.slug).join(', ')}`);
  allPages = allPages.filter(p => !isExcludedPageSlug(p.slug));
  if (!allPages.length) return { queued: 0, skipped: 'all_pages_excluded', tokens };

  // 2. Partition by language — Arabic pages → ar pass; everything else → en pass
  const arSlug = (market.arabicSlug || '').toLowerCase();
  const pages = allPages.filter(p => {
    const slug = (p.slug || '').toLowerCase();
    const isArabicPage = slug.includes('arabic') || (arSlug && slug.includes(arSlug));
    return isAr ? isArabicPage : !isArabicPage;
  });
  if (!pages.length) { console.log(`${tag} — no pages for this language pass`); return { queued: 0, skipped: 'no_pages_this_language' }; }

  // Cap batch size to keep the single Claude call sane
  const MAX = force ? 25 : 15;
  const batch = pages.slice(0, MAX);
  if (pages.length > MAX) console.log(`${tag} — capping ${pages.length} → ${MAX} pages this run`);

  // 3. Fetch current meta for each page (by postId — no URL lookup needed)
  const currentMetaMap = {};
  for (const p of batch) {
    try {
      const cmRes = await fetch(`${siteUrl}/.netlify/functions/wordpress`, {
        method:  'POST',
        headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body:    JSON.stringify({ action: 'get_current_meta', brand: market.brand, payload: { postId: p.id, postType: 'pages' } }),
      });
      const cm = await cmRes.json().catch(() => null);
      if (cm?.found) currentMetaMap[p.id] = { title: cm.currentTitle || null, description: cm.currentDesc || null };
    } catch (_) { /* non-critical — evaluate without current meta */ }
  }

  // 4. UAE-quality batch prompt
  const marketCtx   = buildMarketPrompt(market, buildBrandPrompt(brandCtx, brandExamples), language);
  const menuItems   = brandCtx?.menu ? [
    ...(brandCtx.menu.cheeseburgers || []).slice(0, 3),
    ...(brandCtx.menu.chickenSandos || brandCtx.menu.sandwiches || []).slice(0, 2),
    ...(brandCtx.menu.friesAndSides || brandCtx.menu.sides || []).slice(0, 2),
  ].filter(Boolean).join(' | ') : '';
  const spiceSystem = brandCtx?.menu?.spiceSystem || '';
  const charRule    = isAr
    ? '- Title: 45-58 characters\n- Description: 120-150 characters — write ONE or TWO COMPLETE sentences that END with a full stop. Do NOT exceed 150. Never trail off mid-thought.'
    : '- Title: 45-58 characters\n- Description: 135-152 characters — write ONE or TWO COMPLETE sentences that END with a full stop. Count characters; do NOT exceed 152. Never trail off mid-thought (no ending like "...in five heat").';

  const userPrompt = `You are auditing ${market.brand === 'pickl' ? 'Pickl' : 'Bonbird'} ${market.label} pages. For EACH page, decide if the current meta is already good OR genuinely needs improvement.

Only propose a replacement if the current meta is vague, generic, missing, or doesn't reflect what the page is about. If it's already specific and on-brand — set "skip": true.
${isAr ? '\nWrite all titles/descriptions in Gulf Arabic dialect (NOT Modern Standard Arabic). Never translate brand or menu item names.\n' : ''}
RULES for any replacement — non-negotiable:
${charRule}
- Only reference REAL menu items: ${menuItems || 'use items from brand context'}
${spiceSystem ? `- ONLY use the brand's actual spice/heat system: ${spiceSystem} — NEVER invent heat levels\n` : ''}- No generic phrases ("great food", "delicious", "best in ${market.label}", "quality ingredients")
- Write specifically about what THIS page is about — the slug tells you (e.g. "franchise-${market.marketKey}" = franchising page; "${market.marketKey}-locations" = locations page; "${market.marketKey}-contact" = contact page). Do NOT write generic landing-page meta for a franchise or contact page.
- The TITLE must contain the page-type keyword + the brand + market — e.g. a contact page → "Contact ${market.brand === 'pickl' ? 'Pickl' : 'Bonbird'} ${market.label}" (${isAr ? 'تواصل مع' : 'Contact'}); a franchise page → "${isAr ? 'امتياز' : 'Franchise'}"; a locations page → "${isAr ? 'فروع' : 'Locations'}". A clever hook is fine, but the keyword must be present.
- PLAIN TEXT ONLY — no markdown, asterisks, bold (**), underscores, backticks, or any formatting characters in the title or description.
- The description MUST be a complete sentence within the character range — never cut it off mid-thought.
- LOCATIONS BY PAGE TYPE: journal/blog, about, franchise, events and other brand pages must speak to the WHOLE ${market.label} brand — do NOT anchor them to one outlet (a journal is ${market.brand === 'pickl' ? 'Pickl' : 'Bonbird'}'s ${market.label} stories, NOT "Al Aali Mall's spot"). Only locations/contact pages should foreground specific outlet names, and they must list outlets as SEPARATE places ("X and Y", never "X, Y" which reads as one address).
- Lead with the page's primary keyword, end with a reason to click${feedbackNotes.length ? `

HUMAN FEEDBACK — NEVER do any of the following (explicitly rejected by the team):
${feedbackNotes.map(n => `- ${n}`).join('\n')}` : ''}

PAGES TO EVALUATE:
${batch.map((p, i) => {
  const cur = currentMetaMap[p.id];
  const curBlock = cur
    ? `   Current title: "${cur.title || 'NOT SET'}"\n   Current desc:  "${cur.description || 'NOT SET'}"`
    : '   Current meta: unknown (not fetched)';
  return `${i + 1}. id: ${p.id} | slug: "${p.slug}" | "${p.title}"\n   URL: ${p.link}\n${curBlock}`;
}).join('\n\n')}

Return ONLY a JSON array — one object per page:
[{"id": <page id>, "url": "exact URL from input", "skip": false, "skipReason": "only if skip=true", "title": "${isAr ? 'optimised title' : '52-58 chars'}", "description": "${isAr ? 'optimised description' : '150-158 chars'}", "focusKeyword": "single primary keyword only", "rationale": "one sentence — why current underperforms and why yours is better"}]`;

  // Size the token budget to the batch so the JSON array can't truncate
  // (~350 tokens/page for title+desc+keyword+rationale, +headroom).
  const maxTokens = Math.min(8000, 1200 + batch.length * 380);
  const raw    = await callClaude(marketCtx, userPrompt, { max_tokens: maxTokens });
  let parsed   = extractJson(raw);
  // Salvage a truncated array: parse up to the last complete object, then close it.
  if (!Array.isArray(parsed)) {
    const start   = raw.indexOf('[');
    const lastObj = raw.lastIndexOf('}');
    if (start !== -1 && lastObj > start) {
      try { parsed = JSON.parse(raw.slice(start, lastObj + 1) + ']'); } catch (_) {}
    }
    if (Array.isArray(parsed)) console.warn(`${tag} — recovered ${parsed.length} items from a truncated response (raise batch headroom?)`);
  }
  if (!Array.isArray(parsed)) { console.warn(`${tag} — Claude did not return JSON array (raw ${raw.length} chars, tail: ${JSON.stringify(raw.slice(-120))})`); return { queued: 0, skipped: 'parse_error', discovered: batch.length }; }

  // 5. Per-page: skip / voice-gate / dedup / queue. Record EVERY decision + reason
  //    so the run is auditable (read via the sweep-report endpoint) — no log-hunting.
  const voiceFn       = voiceClaudeAdapter(brandCtx?.name || (market.brand === 'pickl' ? 'Pickl' : 'Bonbird'));
  const queuedMetaMap = await getQueuedMetaMap(market.brand);
  let queued = 0, skipped = 0;
  const decisions = [];
  const rec = (slug, action, reason) => decisions.push({ slug, action, reason });

  const titleMax = 60, descMax = isAr ? 155 : 158;
  const minTitle = 25, minDesc = isAr ? 90 : 110;

  for (const r of parsed) {
    if (r.skip) {
      console.log(`${tag} — skip ${r.url} (${r.skipReason || 'already good'})`);
      rec(r.url || '?', 'skipped', `already-good: ${r.skipReason || 'current meta fine'}`);
      skipped++; continue;
    }
    const page = batch.find(p =>
      String(p.id) === String(r.id) ||
      p.link === r.url ||
      p.link.replace(/\/$/, '') === String(r.url || '').replace(/\/$/, ''));
    if (!page) { console.warn(`${tag} — unknown page from Claude: ${r.url}`); rec(r.url || '?', 'skipped', 'unknown-page-from-claude'); continue; }
    if (!r.title || !r.description) { console.warn(`${tag} — missing title/desc for ${page.slug}`); rec(page.slug, 'skipped', 'missing-title-or-desc'); continue; }

    // Sanitize: strip markdown, trim at clean sentence/word boundaries (no ** leaks, no mid-word cuts)
    let title       = cleanMeta(r.title, titleMax);
    let description = cleanMeta(r.description, descMax);

    // Min-length guard (pre-voice, cheap early reject) — stops stubs like the 47-char Events desc
    if (title.length < minTitle || description.length < minDesc) {
      console.warn(`${tag} — meta too short for ${page.slug} (title ${title.length}c, desc ${description.length}c) — skipping`);
      rec(page.slug, 'skipped', `too-short (t${title.length}/d${description.length})`);
      skipped++; continue;
    }

    // Brand voice gate — one fix attempt, reject if still <8
    let voice = await runBrandVoiceCheck(`${title}\n${description}`, brandCtx, voiceFn).catch(() => ({ score: 8, issues: [] }));
    if (voice.score !== null && voice.score < 8) {
      const fixed = await fixBrandVoice(`${title}\n${description}`, voice, brandCtx, voiceFn, brandExamples, feedbackNotes);
      if (fixed.improved) {
        const lines = fixed.content.trim().split('\n').filter(Boolean);
        if (lines[0]) title       = cleanMeta(lines[0], titleMax);
        if (lines[1]) description = cleanMeta(lines[1], descMax);
        voice = fixed.voiceCheck;
      }
    }
    if (voice.score !== null && voice.score < 8) { console.warn(`${tag} — voice ${voice.score}/10 reject (${page.slug})`); rec(page.slug, 'skipped', `voice-reject (${voice.score}/10)`); continue; }

    // Re-check length AFTER the voice fix — the fix can shorten copy below the minimum (bug v7.4.37)
    if (title.length < minTitle || description.length < minDesc) {
      console.warn(`${tag} — meta too short after voice fix for ${page.slug} (title ${title.length}c, desc ${description.length}c) — skipping`);
      rec(page.slug, 'skipped', `too-short-after-voicefix (t${title.length}/d${description.length})`);
      skipped++; continue;
    }

    // Fact-claim guard — reject fabricated/wrong awards (prompt grounding alone didn't hold)
    if (mentionsAward(`${title} ${description}`)) {
      const fc = await verifyAwardClaims(`${title}\n${description}`, brandCtx);
      if (!fc.ok) {
        console.warn(`${tag} — award-claim reject (${page.slug}): ${fc.reason}`);
        rec(page.slug, 'skipped', `award-claim-unverified: ${fc.reason}`);
        skipped++; continue;
      }
    }

    // Dedup — GSC-driven (real impressions) wins; never double-queue a page
    const key      = `${page.link.toLowerCase().replace(/\/$/, '')}::${language}`;
    const existing = queuedMetaMap.get(key);
    if (existing && existing.status === 'pending') {
      console.log(`${tag} — skip ${page.slug} — meta already pending (${existing.isGscDriven ? 'GSC-driven' : 'sweep/seed'} ${existing.id})`);
      rec(page.slug, 'skipped', `already-pending (${existing.isGscDriven ? 'gsc-driven' : 'sweep'})`);
      skipped++; continue;
    }

    const id = await queueApprovalItem({
      type:        'meta_update',
      brand:       market.brand,
      market:      market.marketKey,
      marketLabel: market.label,
      language,
      title:       `Meta update — ${market.label}: ${page.title || page.slug}`,
      meta: {
        metaTitle:       title,
        metaDescription: description,
        focusKeyword:    String(r.focusKeyword || '').split('\n')[0].trim(),
        voiceScore:      voice.score,
        voiceIssues:     voice.issues || [],
        currentMeta:     currentMetaMap[page.id] || null,
      },
      targetUrl:   page.link,
      wpParent:    market.wpMarketParent,
      notes:       r.rationale || `Meta improvement for ${market.label} page: ${page.slug}`,
    });
    // Keep local map in sync so two Claude rows for the same page can't double-queue
    queuedMetaMap.set(key, { id, status: 'pending', isGscDriven: false });
    queued++;
    rec(page.slug, 'queued', `voice ${voice.score}/10, t${title.length}/d${description.length}`);
    console.log(`${tag} — queued meta_update for ${page.slug}: ${id}`);
  }

  return {
    queued, skipped,
    discovered: batch.length,
    found: pages.length,
    decisions,
    discoveredSlugs: batch.map(p => p.slug),
    excludedSlugs: excluded.map(p => p.slug),
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
        // Current WP meta (enables the side-by-side "Current vs Proposed" card view)
        currentMeta:     item.meta?.currentMeta  || null,
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
async function processMarketLanguage(store, marketKey, market, language, force = false, onlyMetaOnPage = false, skipOnPage = false) {
  const tag = `[intl-seo] ${marketKey}/${language}`;
  console.log(`${tag} — starting`);

  const brandCtx      = await getBrandContext(market.brand);
  const brandExamples = await getBrandExamples(market.brand).catch(() => null);
  const feedbackNotes = await getBrandFeedback(market.brand).catch(() => []);
  // Wire keyword-discovery output into content: read this market's opportunity
  // list and prioritise its top keywords in blog generation. Without this, intl
  // discovery runs every week but never drives a single piece of content.
  const oppData = await store.get(`keywordOpportunities:${market.brand}:${marketKey}`, { type: 'json' }).catch(() => null);
  const opportunityKeywords = (oppData?.opportunities || [])
    .filter(o => ['quick_win', 'content_gap', 'push', 'top10'].includes(o.tier))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 8)
    .map(o => o.keyword)
    .filter(Boolean);
  if (opportunityKeywords.length) console.log(`${tag} — ${opportunityKeywords.length} discovery opportunities feeding content`);
  const queued        = [];
  const errors        = [];

  // ── DATA-DRIVEN ANALYSIS (always runs, no cache TTL) ───────────────────────
  // Run GSC-based meta rewrites + keyword opportunities for this market's actual
  // pages, ONCE PER LANGUAGE PASS. Each pass filters GSC queries to its own script
  // (en → Latin, ar → Arabic), so Arabic searches drive Arabic content instead of
  // being processed as English. 'ur' (Pakistan) only gets seed content for now.
  if (language === 'en' || language === 'ar') {
    try {
      const gscResult = await runMarketDataDrivenSEO(market, brandCtx, brandExamples, force, language);
      console.log(`${tag} — data-driven result:`, JSON.stringify(gscResult));
      if (gscResult.queued > 0) {
        queued.push({ type: 'data_driven_meta', count: gscResult.queued });
      }
    } catch (e) {
      console.error(`${tag} — data-driven analysis failed: ${e.message}`);
      errors.push({ type: 'data_driven', error: e.message });
    }

    try {
      const oppsResult = await runMarketKeywordOpportunities(market, brandCtx, brandExamples, force, language);
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
  // ?only=meta,onpage skips blog generation (cheap focused re-run for meta/onpage only).
  // It also bypasses the 7-day cache so meta/onpage always run, and skips markProcessed
  // so the cache isn't reset (next full run still allowed to generate blogs).
  if (!onlyMetaOnPage) {
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
  // Safety: skip Arabic blogs when market has no Arabic slug (would land on English journal path)
  const MAX_BLOGS_PER_MARKET = language === 'ar' && !market.arabicSlug ? 0 : 3;
  const usedKeywords = new Set();
  let blogsQueued = 0;
  if (MAX_BLOGS_PER_MARKET === 0) console.log(`${tag} — skipping Arabic blogs (no arabicSlug)`);

  while (blogsQueued < MAX_BLOGS_PER_MARKET) {
    try {
      const blog = await generateBlogDraft(market, brandCtx, brandExamples, language, usedKeywords, feedbackNotes, opportunityKeywords);
      if (!blog) {
        console.warn(`${tag} — blog ${blogsQueued + 1} rejected by voice gate`);
        blogsQueued++;
        continue;
      }
      if (!blog.title || !blog.content) break;

      // Check for duplicate keyword already pending
      const siteUrl = process.env.URL || 'https://yolkseo.netlify.app';
      const existing = await fetch(`${siteUrl}/.netlify/functions/approvals?status=pending&brand=${market.brand}&type=blog_draft&limit=200`, { headers: internalHeaders() })
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

    // Mark as processed after blogs — prevents regeneration within the 7-day TTL.
    // Not called on onlyMetaOnPage re-runs so the cache isn't reset.
    await markProcessed(store, marketKey, language);
  } // end if (!onlyMetaOnPage)

  // 2. Full page meta sweep — discovers ALL market pages (root + country sub-pages
  //    like /bahrain-events/, /franchise-bahrain/) and queues UAE-quality meta
  //    improvements (skip-if-good). Supersedes the old single-page seed block.
  //    Only en/ar passes — 'ur' pages are covered by the English pass.
  if (language === 'en' || language === 'ar') {
    try {
      const sweep = await runMarketPageMetaSweep(market, brandCtx, brandExamples, language, feedbackNotes, force);
      console.log(`${tag} — page meta sweep:`, JSON.stringify(sweep));
      if (sweep.queued > 0) queued.push({ type: 'meta_update', count: sweep.queued });
      // Persist an auditable run report (read via /sweep-report?brand=&market=) — no log-hunting
      try {
        await store.setJSON(`sweepReport:${market.brand}:${market.marketKey}:${language}`, {
          at:        new Date().toISOString(),
          market:    market.marketKey,
          language,
          queued:    sweep.queued || 0,
          skipped:   typeof sweep.skipped === 'number' ? sweep.skipped : 0,
          skipReason: typeof sweep.skipped === 'string' ? sweep.skipped : null,
          discovered: sweep.discoveredSlugs || [],
          excluded:   sweep.excludedSlugs || [],
          decisions:  sweep.decisions || [],
        });
      } catch (e) { console.warn(`${tag} — could not write sweep report: ${e.message}`); }
    } catch (e) {
      console.error(`${tag} — page meta sweep failed:`, e.message);
      errors.push({ type: 'meta_sweep', error: e.message });
    }
  }

  // 3. On-page suggestion (skipped when ?only=meta)
  if (skipOnPage) {
    console.log(`${tag} — on-page suggestion skipped (?only=meta)`);
  } else try {
    const onpage = await generateOnPageSuggestion(market, brandCtx, brandExamples, language);
    if (onpage && onpage.suggestionTitle && onpage.suggestedCopy) {
      const id = await queueApprovalItem({
        type:             'onpage_suggestion',
        brand:            market.brand,
        market:           market.marketKey,
        marketLabel:      market.label,
        language,
        title:            `${market.label} — ${onpage.suggestionTitle}`,
        content:          `${onpage.suggestionDetail}\n\n---\n\n**Suggested copy:**\n\n${onpage.suggestedCopy}`,
        suggestionTitle:  onpage.suggestionTitle,
        suggestionDetail: onpage.suggestionDetail,
        suggestedCopy:    onpage.suggestedCopy,
        targetUrl:        buildPostUrl(market, 'page', market.marketSlug, language),
        wpParent:         market.wpMarketParent,
        notes:            `International SEO on-page suggestion for ${market.label} ${language.toUpperCase()}`,
      });
      queued.push({ type: 'onpage_suggestion', id });
      console.log(`${tag} — on-page suggestion queued: ${id}`);
    }
  } catch (e) {
    console.error(`${tag} — on-page suggestion failed:`, e.message);
    errors.push({ type: 'onpage_suggestion', error: e.message });
  }

  return { queued, errors };
}

// ── Main handler ──────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not authenticated' }) };
  console.log(`[intl-seo] Starting — ${new Date().toISOString()}`);

  const store = getStore({
    name:   'seo-tool',
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  // Query params
  const marketParam    = event.queryStringParameters?.market || 'all';
  const langParam      = event.queryStringParameters?.language || 'all';
  const force          = event.queryStringParameters?.force === 'true';
  const onlyParam      = event.queryStringParameters?.only || '';
  const onlyMetaOnPage = onlyParam === 'meta,onpage' || onlyParam === 'onpage,meta' || onlyParam === 'meta';
  const skipOnPage     = onlyParam === 'meta'; // meta-only: skip on-page suggestions

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
        const result = await processMarketLanguage(store, marketKey, market, language, force, onlyMetaOnPage, skipOnPage);
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
        headers: internalHeaders({ 'Content-Type': 'application/json' }),
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
