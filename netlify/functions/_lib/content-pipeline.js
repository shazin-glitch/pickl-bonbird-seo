// netlify/functions/_lib/content-pipeline.js
// ─────────────────────────────────────────────────────────────────────────────
// THE ONE content-intelligence brain (WS6). Per PLAN-FOR-OPUS §5 reframe: the
// single content path is the ON-DEMAND ⚡Generate — this lib carries the "good
// intelligence" that used to live ONLY in international-seo-background so it now
// runs for EVERY brand and market (incl. UAE), with no divergence:
//   • SERP-feature / local-pack routing  (loadSerpFeatureMap + serpFeatureBrief + routeAction)
//   • page-level competitor context       (loadCompetitorContext + competitorBrief)
//   • cannibalization guard                (cannibalizationCheck / existingDedicatedPageFor)
//
// Both generate-draft.js (live on-demand) AND international-seo-background.js
// (legacy, off) import from here — one copy, one behaviour. UAE = market 'uae'
// (competitor matrix stored unsuffixed; a "dedicated page" = any non-homepage page).
//
// Reads only Blobs written by other jobs (competitor matrix, GSC cache) — no spend.
// ─────────────────────────────────────────────────────────────────────────────

const { getStore } = require('@netlify/blobs');
const { ownDomainFor } = require('./brands-config');

function store() {
  return getStore({ name: 'seo-tool', consistency: 'strong', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
}

// competitorMatrix blob key — intl is per-market-suffixed, UAE (home) is unsuffixed.
function matrixKey(brand, market) {
  return (market && market !== 'uae') ? `competitorMatrix:${brand}:${brand}_${market}` : `competitorMatrix:${brand}`;
}

// ── SERP features ─────────────────────────────────────────────────────────────
// keyword(lower) → { localPack, peopleAlsoAsk, aiOverview, featuredSnippet, video }
async function loadSerpFeatureMap(brand, market) {
  try {
    const data = await store().get(matrixKey(brand, market), { type: 'json' });
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
  if (features.localPack)       parts.push('LOCAL PACK present — this is a local-intent SERP. A blog post will not rank here; the win is a dedicated location landing page plus Google Business Profile signals. Lead with address / area-served / hours / ordering intent, not an article.');
  if (features.peopleAlsoAsk)   parts.push('PEOPLE ALSO ASK present — add a concise FAQ section answering the top related questions directly, structured so it can carry FAQ schema.');
  if (features.aiOverview)      parts.push('AI OVERVIEW present — open with a direct, factual 1-2 sentence answer and use clear structured sub-points so the page is easy for AI answers to cite.');
  if (features.featuredSnippet) parts.push('FEATURED SNIPPET present — include a tight, snippet-style direct answer (40-55 words) or a short ordered/unordered list near the top to win the snippet.');
  if (features.video)           parts.push('VIDEO results present — consider an embedded or described video element for this topic.');
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
// keyword(lower) → [ { domain, url, rank } ] (top-3 competing pages, rank ≤10).
async function loadCompetitorContext(brand, market) {
  try {
    const data = await store().get(matrixKey(brand, market), { type: 'json' });
    const ourRoot = (await ownDomainFor(brand) || '').replace(/^www\./, '').split('.')[0];
    const map = {};
    for (const row of (data?.rows || [])) {
      if (!row?.keyword) continue;
      const comps = (row.topDomains || [])
        .filter(d => d.domain && (!ourRoot || !d.domain.includes(ourRoot)) && d.rank <= 10)
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
function normPage(p) { return String(p).split('?')[0].split('#')[0].toLowerCase().replace(/\/$/, ''); }

function buildOwnedKeywordMap(rowsWithPages) {
  const map = {}; // normalized keyword → Set(normalized pageUrl)
  for (const r of (rowsWithPages || [])) {
    if (!r.keyword || !r.page) continue;
    const kw = r.keyword.toLowerCase().trim();
    (map[kw] = map[kw] || new Set()).add(normPage(r.page));
  }
  return map;
}

// Existing DEDICATED page already ranking for this keyword (≠ currentPage), or null.
// intl: dedicated = under /<marketSlug>/ with a child segment. UAE (no marketSlug):
// dedicated = any non-homepage page (≥1 path segment).
function existingDedicatedPageFor(keyword, currentPage, ownedMap, marketSlug) {
  const pages = ownedMap[String(keyword).toLowerCase().trim()];
  if (!pages) return null;
  const cur = currentPage ? normPage(currentPage) : null;
  const slug = marketSlug ? String(marketSlug).toLowerCase() : null;
  for (const p of pages) {
    if (cur && p === cur) continue;
    const path = p.replace(/^https?:\/\/[^\/]+/, '');
    const segs = path.split('/').filter(Boolean);
    if (slug) { if (path.startsWith(`/${slug}/`) && segs.length > 1) return p; }
    else       { if (segs.length >= 1) return p; } // UAE: any non-homepage page
  }
  return null;
}

// ── Action routing (SERP-feature aware) ───────────────────────────────────────
// Given the requested action + the keyword's SERP features, recommend the RIGHT
// action type. Local-pack keywords should be a location/landing PAGE, never a blog.
// Returns { actionType, changed, reason }.
function routeAction(requestedType, features) {
  const brief = serpFeatureBrief(features);
  if (brief.isLocal && requestedType === 'blog_draft') {
    return { actionType: 'page_creation', changed: true,
      reason: 'Local Pack present — routed from blog to a location/landing page (a blog will not rank for local intent).' };
  }
  return { actionType: requestedType, changed: false, reason: '' };
}

// ── Convenience: gather all intelligence for ONE keyword (used by generate-draft) ──
// brand, market('uae'|marketKey), keyword, currentPage(optional), marketSlug(optional),
// rowsWithPages(optional — pass the brand's GSC page+query rows for the cannibalization
// guard; if omitted, the guard is skipped).
async function gatherIntelligence({ brand, market, keyword, currentPage, marketSlug, rowsWithPages }) {
  const kw = String(keyword || '').toLowerCase().trim();
  const [serpMap, compMap] = await Promise.all([
    loadSerpFeatureMap(brand, market),
    loadCompetitorContext(brand, market),
  ]);
  const features = serpMap[kw] || null;
  const comps    = compMap[kw] || null;
  const sBrief   = serpFeatureBrief(features);
  const cBrief   = competitorBrief(comps);
  let cannibalPage = null;
  if (rowsWithPages) {
    cannibalPage = existingDedicatedPageFor(keyword, currentPage, buildOwnedKeywordMap(rowsWithPages), marketSlug);
  }
  return {
    serpFeatures: features,
    serpTag: sBrief.tag,
    isLocal: sBrief.isLocal,
    competitors: cBrief.list,
    cannibalPage,                                   // existing dedicated page for this kw, or null
    promptDirective: `${sBrief.directive}${cBrief.directive}`, // inject into the generation prompt
  };
}

module.exports = {
  matrixKey,
  loadSerpFeatureMap, serpFeatureBrief,
  loadCompetitorContext, competitorBrief,
  normPage, buildOwnedKeywordMap, existingDedicatedPageFor,
  routeAction, gatherIntelligence,
};
