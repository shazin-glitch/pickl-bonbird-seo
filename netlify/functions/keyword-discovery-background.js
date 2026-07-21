// netlify/functions/keyword-discovery-background.js
// Keyword Discovery Engine — runs weekly, builds a scored opportunity list
// from DataForSEO keyword ideas + competitor data + GSC cross-reference.
//
// Approach: keyword-first, relevance-by-source, zero human input required.
//   1. PRIMARY candidate sources (relevant by construction):
//        GSC cache        → keywords we already rank for
//        competitorRanked → keywords tracked competitors rank for (filtered)
//   2. SUPPLEMENT: DataForSEO keyword ideas, gated by the positive allowlist.
//   3. Enrich ALL candidates (volume + CPC + KD) BEFORE scoring (batched, cheap).
//   4. Score = relevance × (0.35·volume + 0.25·winnability + 0.25·intent + 0.15·gap);
//        relevance-by-source multiplier; KD=0/null = UNKNOWN (never "easy").
//   5. Store top opportunities as keywordOpportunities:<brand>
//
// Runs Monday 4am UTC alongside main scheduler.
// Manual trigger: GET /.netlify/functions/keyword-discovery-background?brand=pickl&force=true

const { getStore }        = require('@netlify/blobs');
const { getBrandContext, isBrandedQuery } = require('./_lib/brand');
const { callClaude, extractJson } = require('./_lib/store');
const { INTERNATIONAL_MARKETS, getMarketPageTokens, getMarketAsync, getMarketsMapAsync } = require('./_lib/international-config');
const { resolveLocation } = require('./_lib/dfs-locations');
const { enrichKeywordsMixed } = require('./_lib/keyword-metrics');
const { getGscAccessToken, fetchGscPageQuery } = require('./_lib/gsc');
const { getBrand, getBrandSlugs, gscPropertyFor, ownDomainFor, relevanceConfigFor } = require('./_lib/brands-config');

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';

function getAuth() {
  const l = process.env.DATAFORSEO_LOGIN;
  const p = process.env.DATAFORSEO_PASSWORD;
  return 'Basic ' + Buffer.from(`${l}:${p}`).toString('base64');
}

// ── Menu seeds per brand ──────────────────────────────────────────────────────
const BRAND_SEEDS = {
  pickl: [
    'smash burger', 'double smash burger', 'chicken sandwich',
    'smash burger dubai', 'best burger dubai', 'chicken sando',
    'cheese burger dubai', 'burger delivery dubai',
  ],
  bonbird: [
    'fried chicken', 'crispy fried chicken', 'chicken sandwich',
    'bone in chicken', 'chicken rice bowl', 'chicken tenders',
    'fresh fried chicken dubai', 'fried chicken delivery dubai',
  ],
};

// Market location codes (DataForSEO)
const MARKET_LOCATIONS = {
  UAE:      21191,
  KSA:      2682,
  Bahrain:  17000,
  Qatar:    179,
  Egypt:    2818,
  Jordan:   2144,
  Oman:     2114,
  Pakistan: 2586,
};

// Off-menu dishes — keywords containing any of these terms are rejected before scoring
const OFF_MENU_DISHES = [
  // Wrong cuisines / dishes
  'butter chicken', 'biryani', 'kebab', 'shawarma', 'pizza', 'pasta',
  'fish and chips', 'sushi', 'tacos', 'burritos', 'ramen', 'dumplings',
  'hummus', 'falafel', 'steak house', 'bbq ribs', 'lobster', 'seafood',
  'kung pao', 'tikka', 'masala', 'korma', 'curry', 'cheesecake',
  'dim sum', 'pho', 'waffles', 'pancakes', 'crepes', 'gelato', 'ice cream',
  // Wrong business types
  'bakery', 'grocery', 'supermarket', 'salon', 'spa', 'hotel', 'gym',
  // Wrong intent
  'recipe', 'how to make', 'how to cook', 'calories in', 'nutrition',
  'breakfast cereal',
  // Generic non-food-category queries
  'clothing', 'fashion', 'shoes',
  // Coffee / competitor brands / Arabic off-menu (Pickl & Bonbird sell burgers + chicken,
  // not coffee, and we never target competitor brand names)
  'coffee', 'cappuccino', 'latte', 'starbucks', 'mcdonald', 'kfc', 'herfy', 'al baik', 'albaik',
  'هندي', 'بيتزا', 'قهوة', 'كافيه', 'ستاربكس', 'كنتاكي', 'شاورما', 'برياني', 'البيك', 'هرفي', 'سوشي', 'حلويات',
];

// POSITIVE relevance gate (the fix for garbage like ministries/museums/telecoms/
// prayer-times/competitor-restaurant-names). A keyword is only kept if it contains
// at least one on-category product/food root (EN + AR + UR). Generic "restaurant"/
// "مطعم" is deliberately NOT a root on its own — it lets competitor restaurant
// names through — so a term must carry a real product/food signal to qualify.
const RELEVANT_ROOTS = [
  // EN — products & category
  'burger', 'cheeseburger', 'hamburger', 'smash', 'patty', 'beef',
  'chicken', 'fried chicken', 'crispy chicken', 'broaster', 'nugget', 'tender', 'wing',
  'sando', 'sandwich', 'wrap', 'fries', 'shake', 'milkshake', 'hot dog', 'hotdog',
  'fast food', 'fast-food', 'halal food', 'plant based', 'plant-based', 'impossible burger',
  // AR — products & category
  'برجر', 'برغر', 'همبرغر', 'تشيز', 'دجاج', 'مقرمش', 'مقلي', 'ساندويتش', 'ساندويش', 'سندوتش',
  'سندويش', 'فرايز', 'بطاطس', 'بطاطا', 'ميلك شيك', 'ميلك شيك', 'ناجت', 'تندر', 'أجنحة',
  'هوت دوق', 'وجبات سريعة', 'برجر حلال', 'دجاج مقلي', 'دجاج مقرمش',
  // UR (Pakistan) — mostly English used, plus a couple of native roots
  'برگر', 'چکن', 'فرائز',
];
// VERTICAL-AWARE (CLAUDE.md #12): the relevance roots + off-menu blocklist now come
// from the brand's vertical (restaurant/cafe/corporate) via brands-config, not the
// hardcoded burger/chicken lists below. A café brand keeps coffee terms; a corporate
// brand has an EMPTY roots list (no positive category gate — rely on brand terms +
// the Claude filter). The RELEVANT_ROOTS / OFF_MENU_DISHES literals above remain the
// restaurant default (VERTICALS.restaurant mirrors them).
//   rel = { relevantRoots:[...], offMenu:[...] }  (from relevanceConfigFor(brand))
function isRelevantKeyword(kw, rel) {
  const roots = (rel && rel.relevantRoots) || RELEVANT_ROOTS;
  if (!roots.length) return true;               // no positive gate (corporate)
  const s = String(kw || '').toLowerCase();
  return roots.some(root => s.includes(root));
}

// Keep a keyword only if it (a) carries an on-category root (unless the vertical has
// none) AND (b) contains no off-menu/off-brand term. Positive gate + negative blocklist.
function applyStaticFilter(keywords, rel) {
  const offMenu = (rel && rel.offMenu) || OFF_MENU_DISHES;
  return keywords.filter(k => {
    const kw = k.keyword.toLowerCase();
    if (!isRelevantKeyword(kw, rel)) return false;         // must be on-category
    return !offMenu.some(term => kw.includes(term));       // and not off-menu/off-brand
  });
}

// Scalar form of applyStaticFilter — used to gate GSC organic candidates too.
function passesStaticRelevance(kw, rel) {
  const offMenu = (rel && rel.offMenu) || OFF_MENU_DISHES;
  const s = String(kw || '').toLowerCase();
  return isRelevantKeyword(s, rel) && !offMenu.some(term => s.includes(term));
}

// ── DataForSEO keyword ideas ──────────────────────────────────────────────────
// Returns { ideas: [...], diag: "<human-readable reason>" } so the UI can show
// the REAL DataForSEO outcome instead of guessing "balance/location code".
async function getKeywordIdeas(seeds, locationCode, authHeader, minVolume = 10, languageCode = 'en') {
  // Labs requires country-level codes. UAE is passed as city (21191) so map it to country (2784).
  // International markets already use country-level codes so pass through unchanged.
  const kwLocationCode = locationCode === 21191 ? 2784 : locationCode;

  // keyword_ideas validates the location+language pair against its database.
  // Some markets (e.g. Saudi Arabia 2682) reject language_code 'en' with task
  // error 40501 "Invalid Field: 'language_code'" even though UAE (2784) accepts
  // it. language_code is OPTIONAL for this endpoint (DataForSEO auto-derives it
  // from the location), so on a language rejection we retry without it.
  async function postIdeas(includeLanguage) {
    const payload = {
      keywords:          seeds,
      location_code:     kwLocationCode,
      limit:             200,
      include_serp_info: false,
      order_by:          ['keyword_info.search_volume,desc'],
      filters:           [['keyword_info.search_volume', '>', minVolume]],
    };
    if (includeLanguage) payload.language_code = languageCode;
    const res = await fetch(`${DATAFORSEO_BASE}/dataforseo_labs/google/keyword_ideas/live`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body:    JSON.stringify([payload]),
    });
    return res.json();
  }

  try {
    let data       = await postIdeas(true);
    let task       = data.tasks?.[0] || {};
    let taskStatus = task.status_code;
    let taskMsg    = task.status_message;
    let langDropped = false;

    // Retry without language_code if it was rejected for this location.
    if (data.status_code === 20000 && taskStatus && taskStatus !== 20000 && /language_code/i.test(taskMsg || '')) {
      console.warn(`[kw-discovery] keyword_ideas rejected language_code for loc ${kwLocationCode} — retrying without language`);
      data       = await postIdeas(false);
      task       = data.tasks?.[0] || {};
      taskStatus = task.status_code;
      taskMsg    = task.status_message;
      langDropped = true;
    }

    console.log(`[kw-discovery] keyword_ideas top-level: ${data.status_code} | task id: ${task.id || 'no-task-id'} | task status: ${taskStatus} | task msg: ${taskMsg} | loc: ${kwLocationCode}${langDropped ? ' (no lang)' : ''} | seeds: ${seeds.length}`);

    if (data.status_code !== 20000) {
      console.warn(`[kw-discovery] keyword_ideas failed ${data.status_code}: ${data.status_message}`);
      return { ideas: [], diag: `DataForSEO error ${data.status_code}: ${data.status_message}` };
    }
    if (taskStatus && taskStatus !== 20000) {
      return { ideas: [], diag: `DataForSEO task error ${taskStatus}: ${taskMsg} (loc ${kwLocationCode})` };
    }

    const items = task.result?.[0]?.items || [];
    console.log(`[kw-discovery] keyword_ideas raw items: ${items.length}`);
    const ideas = items.map(item => {
      const info = item.keyword_info || {};
      return {
        keyword:     item.keyword || '',
        volume:      info.search_volume || 0,
        cpc:         info.cpc || 0,
        competition: info.competition_level || 'medium',
      };
    }).filter(k => k.keyword && k.volume > 0);

    const diag = items.length === 0
      ? `DataForSEO OK but returned 0 ideas for location ${kwLocationCode} (${langDropped ? 'auto-lang' : languageCode}) from ${seeds.length} seeds`
      : `${items.length} ideas fetched, ${ideas.length} with volume>${minVolume}${langDropped ? ' (auto-lang)' : ` (${languageCode})`}`;
    return { ideas, diag };

  } catch (e) {
    console.warn('[kw-discovery] keyword_ideas error:', e.message);
    return { ideas: [], diag: `Request failed: ${e.message}` };
  }
}

// ── Claude relevancy filter ───────────────────────────────────────────────────
// Sends all keywords to Claude in one batch — model understands brand context and
// filters out irrelevant keywords (wrong cuisine, competitor brand names, unrelated
// businesses) far more reliably than a static list ever could.
async function filterKeywordsWithClaude(allKeywords, brandName, brandCtx, marketLabel = 'UAE', rel = null) {
  if (!allKeywords.length) return allKeywords;

  // Batch so large sets (esp. full Arabic batches) aren't dropped wholesale in a
  // single Claude call. Recurse with ≤BATCH chunks; the single-batch path below
  // runs the actual filter and fails OPEN if a chunk comes back empty.
  const BATCH = 50;
  if (allKeywords.length > BATCH) {
    const out = [];
    for (let i = 0; i < allKeywords.length; i += BATCH) {
      const part = await filterKeywordsWithClaude(allKeywords.slice(i, i + BATCH), brandName, brandCtx, marketLabel, rel);
      out.push(...part);
    }
    console.log(`[kw-discovery] Claude filter (batched): ${allKeywords.length} → ${out.length} keywords`);
    return out;
  }
  const keywords = allKeywords;

  // VERTICAL-AWARE: describe the business + what it sells from the vertical +
  // brand menu, NOT hardcoded burger/chicken framing — so a café/corporate brand
  // isn't told to keep only "food/restaurant" keywords.
  const promptNoun  = (rel && rel.promptNoun) || 'restaurant';
  const menuSummary = Object.entries(brandCtx?.menu || {})
    .map(([cat, items]) => `${cat}: ${Array.isArray(items) ? items.join(', ') : items}`)
    .join('; ') || (rel && rel.menuSummary) || 'burgers and chicken';

  const kwList = keywords.map((k, i) => `${i + 1}. ${k.keyword}`).join('\n');

  const prompt = `You are filtering keyword research results for ${brandName}, a ${promptNoun} operating in ${marketLabel}.

What ${brandName} sells / is about: ${menuSummary}

Below are ${keywords.length} keywords. Return ONLY the numbers of keywords that are CATEGORY or INTENT searches — where someone is looking for the kind of thing ${brandName} actually offers (see above). This is a ${marketLabel} market, so local-language (e.g. Arabic) category searches are valid and should be KEPT.

KEEP: category and intent searches that match what ${brandName} sells/offers (in ANY language spoken in ${marketLabel}). Keep distinct phrasings and local-language variants of a real category as SEPARATE keywords — do not treat them as duplicates.

REJECT — competitor brand names (most important rule):
- "dime burger" ✗ (Dime Burger is a UAE restaurant chain)
- "goat burger" ✗ (Goat Burger is a UAE chain)
- "pox chicken" ✗ (Pox Chicken is a UAE restaurant)
- "j j chicken" / "jjs chicken" / "jeje chicken" ✗ (all same brand — JJ's Chicken)
- "black tap" ✗ (Black Tap is a restaurant chain)
- "cheesecake factory" ✗ (brand name)
- "nandos" / "kfc" / "mcdonald" / "starbucks" ✗ (brand names)
- Any phrase where a word or two-word combo is a specific restaurant/chain name — when in doubt, reject

REJECT — anything outside what ${brandName} offers (see "What ${brandName} sells / is about" above): a product, category or cuisine the brand does not sell is not an opportunity.

REJECT — wrong intent or too generic:
- "recipes" / "how to make" / "calories in" ✗ (informational, no restaurant intent)
- "order food dubai" ✗ (too generic)
- Delivery platforms: talabat, deliveroo, zomato, noon food ✗

REJECT — near-duplicates: if you see 3+ variants of the SAME BRAND NAME (jj chicken, jjs chicken, jeje chicken), keep at most 1. BUT do NOT treat Arabic morphological/phrasing variants of a real category as duplicates — "برغر", "أفضل برغر", "مطعم برغر", "مطاعم برغر" are DISTINCT valid keywords, KEEP them all.

Return a JSON array of numbers only. Example: [1, 3, 7, 12]

Keywords:
${kwList}`;

  try {
    const { text } = await callClaude(prompt, { max_tokens: 1500 });
    const indices = extractJson(text);
    if (!Array.isArray(indices)) {
      console.warn('[kw-discovery] Claude filter returned non-array, using all keywords');
      return keywords;
    }
    const filtered = indices
      .filter(n => typeof n === 'number' && n >= 1 && n <= keywords.length)
      .map(n => keywords[n - 1]);
    // Fail OPEN: a non-trivial batch returning zero is almost always a filter
    // failure (e.g. a full Arabic batch Claude couldn't map), not a genuine
    // "all irrelevant" verdict — keep the batch rather than silently dropping it.
    if (filtered.length === 0 && keywords.length > 10) {
      console.warn(`[kw-discovery] Claude filter returned 0 of ${keywords.length} — keeping batch (fail-open)`);
      return keywords;
    }
    console.log(`[kw-discovery] Claude filter: ${keywords.length} → ${filtered.length} keywords`);
    return filtered;
  } catch (e) {
    console.warn('[kw-discovery] Claude filter failed, using all keywords:', e.message);
    return keywords;
  }
}

// ── Source relevance (relevant-by-construction) ───────────────────────────────
// The keyword-first model ranks sources by how confidently the keyword is OURS:
//   gsc        — we already rank for it → relevant by definition
//   competitor — a tracked competitor ranks for it → relevant by construction
//   idea       — idea-expansion, only kept after the positive allowlist → weakest
// This is the multiplier that demotes idea-expansion below the primary sources.
const SOURCE_RELEVANCE = { gsc: 1.0, competitor: 0.9, idea: 0.75 };

// ── Long-term targets (Stage 3) ───────────────────────────────────────────────
// A strategically valuable but not-yet-winnable keyword — the multi-month play, as
// opposed to a quick win. MODERN definition (NOT the old "volume > 5k" cutoff):
// hard by difficulty (KD ≥ threshold) OR hard by position (KD unknown, we don't rank
// and an established competitor holds the top), AND worth pursuing (real traffic
// potential OR strong commercial intent). Ranked WITHIN the group by traffic potential
// (capped volume × intent), never raw volume. Surfaced as a guaranteed tagged group at
// the END of the worklist — it never displaces quick-wins.
//
// SCALABLE (CLAUDE.md #12): all thresholds live in ONE config object, overridable per
// deployment via the Blobs key `config:keyword-longterm` (merged over these defaults) —
// tune it for a new brand/market with no code edit. Nothing here is brand/market-specific.
const DEFAULT_LONG_TERM_CONFIG = {
  kdThreshold:      60,   // KD ≥ this = hard by difficulty
  unrankablePos:    30,   // KD unknown + our pos worse than this (or unranked) = hard by position
  competitorTopPos: 10,   // ...AND a competitor sits in the top N = an established incumbent
  minVolume:        300,  // "worth it" floor when intent isn't strong
  strongIntentMin:  1.0,  // intentScore for transactional/commercial (see intentScore)
  volCap:           5000, // cap volume in the traffic-potential ranking (sparse-KD safety)
  longTermLimit:    15,   // max long-term targets surfaced (guaranteed, appended)
  mainLimit:        100,  // top-N of the normal worklist (unchanged behaviour)
};

// ── Intent (commercial/transactional > informational) ─────────────────────────
// A restaurant wants eaters, not recipe-readers. Transactional/local terms
// (delivery, order, near me, menu, best <food> in <city>) beat informational
// ones (recipe, calories, how to make). EN + AR markers; medium default.
const INTENT_HIGH = [
  'near me', 'delivery', 'deliver', 'order', 'takeaway', 'take away', 'open now',
  'best', 'top', 'cheap', 'halal', 'menu', 'restaurant', 'buy', 'price', 'offers',
  'توصيل', 'قريب', 'أفضل', 'مطعم', 'قائمة', 'منيو', 'طلب', 'حلال', 'اسعار', 'أسعار', 'عروض',
];
const INTENT_LOW = [
  'recipe', 'how to make', 'how to cook', 'calories', 'nutrition', 'history',
  'meaning', 'vs ', ' vs', 'difference', 'what is', 'homemade',
  'طريقة', 'وصفة', 'سعرات', 'كيف', 'الفرق',
];
function intentScore(keyword) {
  const s = String(keyword || '').toLowerCase();
  if (INTENT_LOW.some(t => s.includes(t)))  return 0.3;
  if (INTENT_HIGH.some(t => s.includes(t))) return 1.0;
  return 0.6;
}
function intentLabel(keyword) {
  const v = intentScore(keyword);
  return v >= 1 ? 'transactional' : v <= 0.3 ? 'informational' : 'mixed';
}

// ── Winnability (difficulty-based reachability) ───────────────────────────────
// KD ONLY — "how hard is it to rank". Whether we ALREADY rank is handled by the
// position-opportunity term, not here (mixing them made already-ranking top-10 out-
// score quick-wins — backwards for an opportunity list).
// CRITICAL: DataForSEO returns KD=0 (or null) for regional/long-tail keywords it has
// no data for — that is UNKNOWN, NOT "easy". Unknown → neutral 0.5, never 1.0.
function winnabilityScore(kd) {
  if (kd == null || kd <= 0) return 0.5;
  return 1 - Math.min(kd, 100) / 100;
}

// ── "What we rank for" — own-domain organic keywords, URL-attributed ──────────
// SEMrush/Ahrefs model: pull our OWN domain's ranked keywords WITH the ranking
// URL so each keyword is attributed to the market whose page it ranks on. This is
// the market-correct replacement for the old whole-property GSC-query cache (no
// page dimension → flooded every intl market with UAE keywords; validated v7.4.47).
const LABS_RANKED_URL = 'https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live';
const OWN_DOMAINS = { pickl: 'eatpickl.com', bonbird: 'bonbirdchicken.com' };

// Navigational brand searches (people looking for US) — not opportunities. EN+AR.
// 'pick' is deliberately broad: the brand is "Pickl", so pick*/بيك* in these
// markets is navigational and near-zero volume — cheap to drop, costly to keep.
const BRAND_TERMS = {
  pickl:   ['pick', 'بيك', 'بيكل', 'بكل', 'بيكلز'],
  bonbird: ['bonbird', 'bon bird', 'بونبيرد', 'بون بيرد'],
};
// ownTerms (optional) lets a config brand pass its own branded terms so a NEW brand
// still drops its navigational queries (BRAND_TERMS only knows pickl/bonbird).
function isOwnBrandKeyword(kw, brand, ownTerms) {
  const s = String(kw || '').toLowerCase();
  const terms = (ownTerms && ownTerms.length) ? ownTerms : (BRAND_TERMS[brand] || []);
  return terms.some(t => s.includes(t));
}

// Does a ranking URL belong to a market? Whole-segment token match (handles the
// flat intl slugs — /bh/, /bahrain-locations/, /bh-arabic/ — via getMarketPageTokens).
function urlMatchesTokens(url, tokens) {
  if (!url || !tokens || !tokens.length) return false;
  const path = String(url).replace(/^https?:\/\/[^\/]+/, '').toLowerCase();
  return tokens.some(t => path === `/${t}` || path === `/${t}/` || path.startsWith(`/${t}/`) || path.startsWith(`/${t}-`));
}

// Pull our own domain's ranked keywords (keyword + position + ranking URL + volume)
// from DataForSEO Labs. Same endpoint/shape the competitor matrix uses. Tries the
// market's languages, drops language_code on a 40501 rejection. SAFE: [] on failure.
async function fetchOwnRankedKeywords(domain, locationCode, langs, authHeader) {
  const labsLoc = (!locationCode || locationCode === 21191) ? 2784 : locationCode; // Labs needs country code
  const tgt = String(domain || '').replace(/^www\./, '');
  const seen = new Set(), out = [];
  const post = async (lang) => {
    const payload = {
      target: tgt, location_code: labsLoc,
      filters:  [['keyword_data.keyword_info.search_volume', '>', 0]],
      order_by: ['keyword_data.keyword_info.search_volume,desc'],
      limit: 200,
    };
    if (lang) payload.language_code = lang;
    const res = await fetch(LABS_RANKED_URL, {
      method: 'POST', headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify([payload]),
    });
    return res.json();
  };
  const parse = (data) => {
    for (const it of (data?.tasks?.[0]?.result?.[0]?.items || [])) {
      const kw = it.keyword_data?.keyword;
      const key = kw && kw.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        keyword:  kw,
        volume:   it.keyword_data?.keyword_info?.search_volume || 0,
        cpc:      it.keyword_data?.keyword_info?.cpc || 0,
        position: it.ranked_serp_element?.serp_item?.rank_absolute || null,
        url:      it.ranked_serp_element?.serp_item?.url || null,
      });
    }
  };
  const cands = [...new Set((langs && langs.length ? langs : ['en']).filter(Boolean))].slice(0, 2);
  try {
    let droppedLang = false;
    for (const lang of cands) {
      let data = await post(lang);
      const task = data?.tasks?.[0] || {};
      const langRej = /language_code/i.test(`${data?.status_message || ''} ${task.status_message || ''}`);
      if (task.status_code !== 20000 && langRej && !droppedLang) {
        droppedLang = true;
        parse(await post(null));   // location auto-derives language; result spans languages
        break;
      }
      if (data?.status_code === 20000 && task.status_code === 20000) parse(data);
      else console.warn(`[kw-discovery] own ranked_keywords ${tgt} loc ${labsLoc} lang ${lang}: ${data?.status_code}/${task.status_code} ${task.status_message || data?.status_message || ''}`);
    }
  } catch (e) {
    console.warn(`[kw-discovery] own ranked_keywords error: ${e.message}`);
  }
  return out;
}

// ── Position opportunity (the SEMrush/Ahrefs "quick-win vs already-ranking" lever)
// Opportunity value = MARGINAL gain from acting, not current success:
//   pos 11–20  striking distance → HIGHEST ROI (page 2 → page 1 is a big CTR jump)
//   not ranking + a competitor ranks top-10 → content gap, high
//   pos 21–50  push → medium
//   pos ≤10    already ranking well → LOW (little upside; near-won)
function positionOpportunity(ourPosition, competitorBest) {
  const pos = ourPosition || 101;
  if (pos <= 10)  return 0.15;                     // already ranking well — low upside
  if (pos <= 20)  return 1.0;                      // striking distance / quick win
  if (pos <= 50)  return 0.55;                     // push
  return competitorBest <= 10 ? 0.9 : 0.5;         // not ranking: competitor-owned gap ranks highest
}

// ── Opportunity scoring — SEMrush/Ahrefs-grade ────────────────────────────────
// score = relevance × (0.30·volume + 0.30·positionOpportunity + 0.20·intent + 0.20·winnability)
// Position opportunity is the PRIMARY lever (quick-wins & competitor gaps beat
// already-ranking top-10). Volume is CAPPED (min(vol/2000,1)) on purpose: our KD
// data is sparse, so we must not let an unknown-difficulty head term dominate on raw
// volume — a deliberate, robust deviation from a pure traffic-potential model.
// Relevance-by-source stays a multiplier so weak-source keywords can't out-score primary ones.
function scoreOpportunity(kw, ourPosition, competitorPositions) {
  const volumeNorm     = Math.min((kw.volume || 0) / 2000, 1);
  const competitorBest = Math.min(...(competitorPositions.length ? competitorPositions : [100]));
  const posOpp         = positionOpportunity(ourPosition, competitorBest);
  const win            = winnabilityScore(kw.kd);
  const intent         = intentScore(kw.keyword);
  const relevance      = SOURCE_RELEVANCE[kw.source] ?? 0.75;

  return relevance * (volumeNorm * 0.30 + posOpp * 0.30 + intent * 0.20 + win * 0.20);
}

// ── Tier classification ───────────────────────────────────────────────────────
function getTier(ourPosition, competitorBest, score) {
  const pos = ourPosition || 101;
  if (pos <= 3)                           return 'top3';
  if (pos <= 10)                          return 'top10';
  if (pos <= 20 && pos > 10)             return 'quick_win';
  if (pos <= 50 && pos > 20)             return 'push';
  if (competitorBest <= 10 && pos > 50)  return 'content_gap';
  if (pos > 50)                          return 'content_gap';
  return 'monitor';
}

// ── Recommended action (Stage 2 "decide" layer) ──────────────────────────────
// Turns a scored opportunity into a concrete next move, reusing the UAE tier→action
// rules. actionType maps to the existing generator/approval types. Local intent →
// landing page; otherwise blog. Where we already have a ranking page, we optimise it;
// where we don't, we create one.
const LOCATION_INTENT_TERMS = [
  'near me', 'delivery', 'deliver', 'order', 'takeaway', 'take away', 'open now',
  'قريب', 'توصيل', 'اقرب', 'أقرب', 'طلب',
];
function hasLocationIntent(keyword) {
  const s = String(keyword || '').toLowerCase();
  return LOCATION_INTENT_TERMS.some(t => s.includes(t));
}
// Match a keyword to an EXISTING page from the crawler inventory (pageInventory:<brand>),
// even one we don't rank for — so "create" only fires when we genuinely lack a relevant
// page (Shazin's point: GSC alone can't see a page that exists but doesn't rank).
const KW_STOPWORDS = new Set(['the','a','an','in','of','for','to','and','or','near','me','my','your',
  'best','top','good','great','cheap','online','order','delivery','deliver','restaurant','restaurants',
  'shop','shops','place','places','store','stores','food','near-me']);
function keywordTokens(kw) {
  return String(kw || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
    .filter(t => t.length >= 3 && !KW_STOPWORDS.has(t));
}
function matchExistingPage(keyword, marketPages) {
  const toks = keywordTokens(keyword);
  if (!toks.length || !marketPages || !marketPages.length) return null;
  let best = null, bestScore = 0;
  for (const p of marketPages) {
    const hay = `${p.url || ''} ${p.title || ''} ${p.h1 || ''}`.toLowerCase();
    const hits = toks.filter(t => hay.includes(t)).length;
    const score = hits / toks.length;
    if (hits > 0 && score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore >= 0.5 ? best.url : null; // ≥50% of content tokens present → a real match
}

// True homepage ("/" or bare domain). Distinct from isGenericTargetPage, which also
// treats market-hub roots (/ksa) as generic — those are legit market landing pages.
function isHomepageUrl(url) {
  if (!url) return false;
  const path = String(url).replace(/^https?:\/\/[^\/]+/, '').replace(/\/+$/, '');
  return path === '' || path === '/';
}

// Recommended next action — reuses the UAE tier→action rules, now crawler-aware:
// if we don't rank but a relevant page already EXISTS, optimise it (never duplicate).
function recommendAction(opp, brandCtx) {
  const pos      = opp.ourPosition;
  const hasPage  = !!opp.targetPage;   // we already rank on a real page (any position)
  const existing = opp.existingPage;   // a page we have that plausibly targets this kw but doesn't rank

  // ── GUARDRAIL: page architecture (P1.6) ─────────────────────────────────────
  // Never recommend rewriting the HOMEPAGE for a NON-BRAND keyword. On a small site
  // the homepage ranks for everything by default, so GSC mis-attributes long-tail /
  // local queries to "/". The homepage must stay focused on the brand head term; a
  // non-brand keyword belongs on a dedicated page (a location page if local intent).
  // (Brand queries like "pickl"/"بيكل" ARE allowed to fine-tune the homepage.)
  const onHomepage = hasPage && isHomepageUrl(opp.targetPage);
  const branded    = brandCtx ? isBrandedQuery(opp.keyword, brandCtx) : false;
  if (onHomepage && !branded) {
    return hasLocationIntent(opp.keyword)
      ? { actionType: 'page_creation', label: 'Create a location/landing page',
          rationale: `Ranks via the homepage, but "${opp.keyword}" is a local/near-me query — it needs a dedicated location page, not a homepage rewrite.` }
      : { actionType: 'page_creation', label: 'Create a dedicated page',
          rationale: `Ranks via the homepage by default — a dedicated page targets "${opp.keyword}" better than rewriting the homepage (which stays focused on the brand head term).` };
  }

  // Already ranking top-10 → defend.
  if (opp.tier === 'top10')
    return { actionType: 'meta_update', label: 'Defend & fine-tune',
      rationale: `Ranking #${pos} — refresh title/meta to hold position and push toward the top 3.` };
  // We ALREADY rank on a real page (even if poorly, e.g. #64) → optimise/strengthen THAT page.
  // Never create a duplicate for a keyword we already rank for (cannibalization).
  if (hasPage) {
    const pageTwo = pos && pos <= 20;
    return { actionType: 'page_update',
      label: pageTwo ? 'Optimise page to reach page 1' : 'Strengthen the page to climb',
      rationale: `Ranking #${pos} on ${opp.targetPage} — ${pageTwo ? 'refresh title/H1/content + internal links to push onto page 1' : 'expand the content + internal links + target this keyword'}.` };
  }
  // We don't rank, but a relevant page EXISTS (from the crawler) → optimise it, don't duplicate.
  if (existing)
    return { actionType: 'page_update', label: 'Optimise existing page',
      rationale: `We don't rank yet, but a page already exists (${existing}) — optimise it for this keyword instead of creating a duplicate.` };
  // Genuinely no relevant page → create (landing vs blog by intent).
  return hasLocationIntent(opp.keyword)
    ? { actionType: 'page_creation', label: 'Create a location/landing page', rationale: 'A competitor ranks and we have no relevant page. Local intent → build a landing page.' }
    : { actionType: 'blog_draft', label: 'Create a blog post', rationale: 'A competitor ranks and we have no relevant page. Topic intent → write a post.' };
}

// ── Advisory flags + confidence (judgment-as-input for a non-SEO reviewer) ────
// Surfaces WHY a rec might need a second look, and how much to trust it — so the
// human gate is informed, not blind. All derived from data we already have.
function isGenericTargetPage(url, market) {
  if (!url) return false;
  const path = (String(url).replace(/^https?:\/\/[^\/]+/, '').replace(/\/+$/, '') || '/');
  if (path === '/') return true;                          // homepage
  for (const slug of [market && market.marketSlug, market && market.arabicSlug].filter(Boolean)) {
    if (path === '/' + String(slug).toLowerCase()) return true; // market hub root (/bh, /ksa)
  }
  return false;
}
function assessOpportunity(opp, source, market) {
  const flags = [];
  if (opp.targetPage && isGenericTargetPage(opp.targetPage, market))
    flags.push('Ranks via a generic/home page — a dedicated page would likely win this better.');
  if (opp.kd == null)     flags.push('Difficulty unknown (no KD data) — winnability is an estimate.');
  if (!(opp.volume > 0))  flags.push('Search volume unknown — opportunity size uncertain.');
  if (source === 'idea')  flags.push('From keyword-expansion — weaker signal than GSC or competitor data.');
  // confidence = how many independent signals we actually have
  const signals = [opp.ourPosition != null, opp.kd != null, opp.volume > 0, (opp.competitorCount || 0) > 0].filter(Boolean).length;
  const confidence = signals >= 3 ? 'high' : signals <= 1 ? 'low' : 'medium';
  return { confidence, flags };
}

// ── Long-term target classification (Stage 3) ─────────────────────────────────
// Is this opportunity a strategic multi-month play rather than a near-term win?
// See DEFAULT_LONG_TERM_CONFIG for the criteria. Quick-wins/top-10/top-3 are never
// long-term (they're already winnable/winning). Returns boolean.
function isLongTermTarget(opp, cfg) {
  if (['top3', 'top10', 'quick_win'].includes(opp.tier)) return false;
  const pos = opp.ourPosition;
  const hardByDifficulty = opp.kd != null && opp.kd >= cfg.kdThreshold;
  const hardByPosition   = opp.kd == null
    && (pos == null || pos > cfg.unrankablePos)
    && (opp.competitorBest != null && opp.competitorBest <= cfg.competitorTopPos);
  if (!(hardByDifficulty || hardByPosition)) return false;
  // Must be worth pursuing: meaningful volume OR strong commercial intent.
  const worthVolume = (opp.volume || 0) >= cfg.minVolume;
  const worthIntent = intentScore(opp.keyword) >= cfg.strongIntentMin;
  return worthVolume || worthIntent;
}

// Rank value WITHIN the long-term group — capped volume × intent (traffic potential),
// deliberately NOT raw volume (KD data is sparse; a head term shouldn't dominate).
function trafficPotential(opp, cfg) {
  return Math.round(Math.min(opp.volume || 0, cfg.volCap) * intentScore(opp.keyword));
}

// One-line "why this is a long-term play" for the reviewer (judgment-as-input).
function longTermReason(opp, cfg) {
  const bits = [];
  if (opp.kd != null && opp.kd >= cfg.kdThreshold) bits.push(`High difficulty (KD ${opp.kd})`);
  else if (opp.kd == null)                          bits.push('Difficulty unknown');
  if (opp.ourPosition == null)                      bits.push('we don\'t rank yet');
  else if (opp.ourPosition > cfg.unrankablePos)     bits.push(`we sit at #${opp.ourPosition}`);
  if (opp.competitorBest != null && opp.competitorBest <= cfg.competitorTopPos)
    bits.push(`a competitor holds #${opp.competitorBest}`);
  const value = intentScore(opp.keyword) >= cfg.strongIntentMin
    ? 'strong commercial intent' : `~${(opp.volume || 0).toLocaleString()} monthly searches`;
  return `${bits.join(', ')} — worth a sustained 3–6 month push for ${value}.`;
}

// ── Main discovery per brand (optionally per market) ─────────────────────────
async function discoverKeywords(brand, store, authHeader, force = false, marketKey = null) {
  const isIntl   = marketKey && marketKey !== 'uae';
  const market   = isIntl ? await getMarketAsync(marketKey) : null;
  const tag      = isIntl ? `[kw-discovery/${brand}/${marketKey}]` : `[kw-discovery/${brand}]`;
  const storeKey = isIntl ? `keywordOpportunities:${brand}:${marketKey}` : `keywordOpportunities:${brand}`;
  console.log(`${tag} starting discovery`);

  const brandCtx = await getBrandContext(brand);
  const brandCfg = await getBrand(brand);
  const brandName = brandCfg?.name || (brand.charAt(0).toUpperCase() + brand.slice(1));
  // Vertical relevance config (restaurant/cafe/corporate) — drives every static
  // filter + the generic seeds so a café/corporate brand isn't gated on food roots.
  const rel = await relevanceConfigFor(brand);
  const ownBrandTerms = BRAND_TERMS[brand] || [...(brandCfg?.brandedTerms || []), brand, (brandCfg?.name || '').toLowerCase()].filter(Boolean);

  // For international: use market seed keywords + vertical-appropriate generic seeds
  // NOTE: marketLabel/locationCode declared BEFORE brandGenericSeeds — they are
  // referenced inside the template literals below (TDZ crash if declared after).
  const marketLabel   = isIntl ? market.label : 'UAE';
  // Resolve location + supported languages from DataForSEO's authoritative list.
  const loc = isIntl
    ? await resolveLocation(market.label)
    : { code: MARKET_LOCATIONS.UAE, languages: ['en'], supported: true, inCache: true };
  const locationCode = loc.code || (isIntl ? market.location_code : MARKET_LOCATIONS.UAE);
  // Generic market seeds come from the VERTICAL (config-driven), not a pickl/bonbird
  // ternary — so Southpour gets coffee seeds and Yolk gets corporate seeds.
  const brandGenericSeeds = rel.seeds(marketLabel);

  // ── "What we rank for" — market-attributed via the ranking URL ───────────────
  // PRIMARY source = first-party GSC page+query (Google's own numbers, free, covers
  // EVERY market incl. Qatar/Oman/Pakistan which aren't in DataForSEO Labs). Each row
  // carries the page it ranks on → attribute to THIS market (intl) or to home (UAE =
  // NOT an intl page). Brand-navigational queries dropped — not opportunities.
  // FALLBACK = Labs own-domain ranked_keywords, only if GSC yields nothing for the
  // market (GSC not connected, or no local pages with impressions).
  const ownDomain = brandCfg?.ownDomain || OWN_DOMAINS[brand];
  const siteUrl   = brandCfg?.gscProperty || (await gscPropertyFor(brand));
  const marketTokens = isIntl ? getMarketPageTokens(market) : null;
  const intlTokensForBrand = Object.values(await getMarketsMapAsync())
    .filter(m => m.brand === brand)
    .flatMap(m => getMarketPageTokens(m));
  const belongsToMarket = (pageUrl) => isIntl
    ? urlMatchesTokens(pageUrl, marketTokens)
    : !urlMatchesTokens(pageUrl, intlTokensForBrand); // UAE = any page that isn't an intl market page
  const gscMap = {};        // keyword(lower) → our BEST position in this market
  const gscPageMap = {};    // keyword(lower) → the page URL we rank on (Stage 2 target page)
  const ownRankedKws = [];  // organic candidates we rank for in THIS market
  const seenOrganic  = new Set();
  // Record the page that holds our BEST position for a keyword.
  const noteOurPage = (kw, page, position) => {
    if (position == null || !page) return;
    if (gscMap[kw] == null || position < gscMap[kw]) { gscMap[kw] = position; gscPageMap[kw] = page; }
  };

  // 1) First-party GSC page+query
  try {
    const token = await getGscAccessToken(store);
    if (!token) {
      console.warn(`${tag} GSC not connected — no first-party organic source (will try Labs)`);
    } else {
      const { rows, error } = await fetchGscPageQuery(siteUrl, token);
      if (error) console.warn(`${tag} GSC page+query error: ${error}`);
      let kept = 0;
      for (const r of (rows || [])) {
        const kw = (r.keyword || '').toLowerCase();
        if (!kw || !belongsToMarket(r.page) || isOwnBrandKeyword(kw, brand, ownBrandTerms) || !passesStaticRelevance(kw, rel)) continue;
        noteOurPage(kw, r.page, r.position); // best rank + its page across this market's pages
        if (!seenOrganic.has(kw)) { seenOrganic.add(kw); ownRankedKws.push({ keyword: r.keyword, volume: 0, cpc: 0, competition: 'medium' }); kept++; }
      }
      console.log(`${tag} GSC page+query: ${rows?.length || 0} rows → ${kept} attributed to market (brand-filtered)`);
    }
  } catch (e) { console.warn(`${tag} GSC page+query failed: ${e.message}`); }

  // 2) Fallback — Labs own-domain ranked_keywords (only if GSC gave us nothing)
  const ownRankSupported = !(isIntl && loc.inCache && loc.supported === false);
  if (!ownRankedKws.length && ownRankSupported && ownDomain) {
    const rkLangs = (isIntl && loc.languages.length) ? loc.languages : ['en'];
    const ranked = await fetchOwnRankedKeywords(ownDomain, locationCode, rkLangs, authHeader);
    for (const r of ranked) {
      const kw = (r.keyword || '').toLowerCase();
      if (!kw || !belongsToMarket(r.url) || isOwnBrandKeyword(kw, brand, ownBrandTerms) || !passesStaticRelevance(kw, rel)) continue;
      noteOurPage(kw, r.url, r.position);
      if (!seenOrganic.has(kw)) { seenOrganic.add(kw); ownRankedKws.push({ keyword: r.keyword, volume: r.volume || 0, cpc: r.cpc || 0, competition: 'medium' }); }
    }
    console.log(`${tag} GSC empty → Labs own ranked_keywords fallback: ${ownRankedKws.length} keywords`);
  } else if (!ownRankedKws.length) {
    console.log(`${tag} own rankings: none (GSC empty${ownRankSupported ? '' : ', market not in Labs'})`);
  }

  // ── Page inventory (from the crawler) — this market's existing pages ──────────
  // Lets recommendAction decide "fix existing" vs "create" definitively: a page can
  // EXIST without ranking, which GSC alone can't see (Stage 2.3 / Shazin's point).
  const inventory   = await store.get(`pageInventory:${brand}`, { type: 'json' }).catch(() => null);
  const marketPages = (inventory?.pages || []).filter(p => p.market === (marketKey || 'uae'));
  console.log(`${tag} page inventory: ${marketPages.length} pages for this market (of ${inventory?.pages?.length || 0} crawled)`);

  // ── Business-priority input — human judgment the SEO engine can't infer ───────
  // Re-weights the worklist toward products/markets that matter commercially.
  // Neutral (boost 1.0) if unset → fully backward-compatible. Config-driven (#12).
  const bizPriority     = await store.get(`businessPriority:${brand}`, { type: 'json' }).catch(() => null);
  const priorityTerms   = (bizPriority?.products || []).map(t => String(t).toLowerCase());
  const isPriorityMarket = (bizPriority?.markets || []).includes(marketKey || 'uae');
  const businessBoost   = (kw) => priorityTerms.some(t => kw.includes(t)) ? 1.4 : 1.0;
  if (priorityTerms.length || isPriorityMarket) console.log(`${tag} business priority: ${priorityTerms.length} product terms, priorityMarket=${isPriorityMarket}`);

  // Load competitor ranked keywords — market-qualified for intl, unsuffixed for UAE (back-compat)
  const compKey  = isIntl ? `competitorRankedKeywords:${brand}:${marketKey}` : `competitorRankedKeywords:${brand}`;
  const compData = await store.get(compKey, { type: 'json' }).catch(() => null);
  const compMap  = {}; // keyword → [positions from competitors]
  const compMeta = {}; // keyword → { volume, cpc } — carry the real DataForSEO volume, don't discard it
  const compPageMap = {}; // keyword → the competitor URL holding the BEST rank (Stage 2 "page to beat")
  if (compData?.competitors) {
    for (const [, kwList] of Object.entries(compData.competitors)) {
      for (const kw of kwList || []) {
        const key = kw.keyword?.toLowerCase();
        if (key) {
          const pos = kw.position || 100;
          if (!compMap[key]) compMap[key] = [];
          compMap[key].push(pos);
          if (!compMeta[key]) compMeta[key] = { volume: kw.searchVolume || 0, cpc: kw.cpc || 0 };
          // keep the URL of the best-ranked competitor for this keyword
          if (kw.url && (compPageMap[key] == null || pos < compPageMap[key].position)) {
            compPageMap[key] = { url: kw.url, position: pos };
          }
        }
      }
    }
  }
  console.log(`${tag} competitor keywords loaded: ${Object.keys(compMap).length} unique`);

  // ── Fetch keyword ideas, LANGUAGE-AWARE ──────────────────────────────────
  // DataForSEO Labs keyword databases are per-country-per-language. KSA/Bahrain/
  // Jordan are Arabic-ONLY — sending English there returns ~nothing (or 40501).
  // Qatar/Oman aren't in Labs at all. Use the authoritative languages + matching
  // seeds, and skip gracefully when the market isn't in Labs.
  let ideas = [];
  let ideasDiag = '';
  if (isIntl && loc.inCache && loc.supported === false) {
    ideasDiag = `${marketLabel} is not in DataForSEO Labs — no keyword_ideas (relying on GSC + competitor data)`;
    console.warn(`${tag} ${ideasDiag}`);
  } else {
    const minVol = isIntl ? 0 : 10;
    const langs  = (isIntl && loc.languages.length) ? loc.languages : ['en'];
    const seedsFor = (lang) => {
      // UAE seeds: built-in BRAND_SEEDS, else the brand's configured keywordSeeds,
      // else the vertical's generic seeds — so a new brand seeds correctly.
      if (!isIntl) return BRAND_SEEDS[brand] || brandCfg?.keywordSeeds || rel.seeds('UAE');
      if (lang === 'ar') return (market.seedKeywords?.ar || []);
      return [...(market.seedKeywords?.en || []), ...brandGenericSeeds];
    };
    const seenIdea = new Set();
    const perLang  = [];
    for (const lang of langs.slice(0, 2)) { // cap at 2 language passes
      const seedSet = seedsFor(lang).filter(Boolean);
      if (!seedSet.length) continue;
      const { ideas: li } = await getKeywordIdeas(seedSet, locationCode, authHeader, minVol, lang);
      perLang.push(`${lang}:${li.length}`);
      for (const k of li) {
        const key = k.keyword.toLowerCase();
        if (!seenIdea.has(key)) { seenIdea.add(key); ideas.push(k); }
      }
    }
    ideasDiag = `langs[${langs.join(',')}] → ${ideas.length} ideas (${perLang.join(' ')})`;
  }
  console.log(`${tag} DataForSEO returned ${ideas.length} keyword ideas (${marketLabel}) — ${ideasDiag}`);

  // Static off-menu filter first (cheap, no API call), then Claude for brand/intent relevance
  const staticFilteredIdeas = applyStaticFilter(ideas, rel);
  console.log(`${tag} static filter: ${ideas.length} → ${staticFilteredIdeas.length} ideas`);
  const filteredIdeas = await filterKeywordsWithClaude(staticFilteredIdeas, brandName, brandCtx, marketLabel, rel);

  // Also add competitor keywords we don't yet track
  const rawCompKeywords = Object.entries(compMap)
    .filter(([kw]) => !gscMap[kw]) // not ranking for it at all
    .map(([kw]) => ({
      keyword:     kw,
      volume:      compMeta[kw]?.volume || 0, // real search volume from competitorRankedKeywords
      cpc:         compMeta[kw]?.cpc    || 0,
      competition: 'medium',
      fromCompetitor: true,
    }));

  // Competitor keywords must pass static filter + Claude — they're raw and include brand names
  const staticFilteredComp = applyStaticFilter(rawCompKeywords, rel);
  console.log(`${tag} comp static filter: ${rawCompKeywords.length} → ${staticFilteredComp.length} keywords`);
  const filteredComp = staticFilteredComp.length > 0
    ? await filterKeywordsWithClaude(staticFilteredComp.slice(0, 80), brandName, brandCtx, marketLabel, rel)
    : [];
  console.log(`${tag} comp Claude filter: ${staticFilteredComp.length} → ${filteredComp.length} keywords`);

  // ── Assemble candidates, PRIMARY sources first (relevant by construction) ────
  // Keyword-first model: GSC (what we rank for) + competitor-ranked keywords are
  // relevant by definition; idea-expansion is a SUPPLEMENT (already allowlist- +
  // Claude-filtered above). GSC bypasses the allowlist by design — our own
  // rankings define relevance. Dedup keeps the highest-relevance source per
  // keyword but never drops a real volume/cpc figure.
  const candidates = new Map(); // keywordLower → { keyword, volume, cpc, competition, source }
  const addCandidate = (keyword, { volume = 0, cpc = 0, competition = 'medium', source }) => {
    const key = String(keyword || '').toLowerCase();
    if (!key) return;
    const existing = candidates.get(key);
    if (existing) {
      if (volume > (existing.volume || 0)) existing.volume = volume;
      if (cpc    > (existing.cpc    || 0)) existing.cpc    = cpc;
      if ((SOURCE_RELEVANCE[source] || 0) > (SOURCE_RELEVANCE[existing.source] || 0)) existing.source = source;
      return;
    }
    candidates.set(key, { keyword, volume, cpc, competition, source });
  };

  // 1) Organic (primary) — keywords we rank for in THIS market (URL-attributed).
  //    pos<=3 (already winning) pruned at the tier stage. source 'gsc' = "we rank".
  for (const k of ownRankedKws) addCandidate(k.keyword, { volume: k.volume, cpc: k.cpc, competition: k.competition, source: 'gsc' });
  // 2) Competitor (primary) — filtered competitor-ranked keywords we don't own.
  for (const k of filteredComp) addCandidate(k.keyword, { volume: k.volume, cpc: k.cpc, competition: k.competition, source: 'competitor' });
  // 3) Idea-expansion (supplement) — allowlist + Claude filtered.
  for (const k of filteredIdeas) addCandidate(k.keyword, { volume: k.volume, cpc: k.cpc, competition: k.competition, source: 'idea' });
  const candList = [...candidates.values()];
  console.log(`${tag} candidates: ${candList.length} (gsc+competitor primary, ideas supplement)`);

  // ── Enrich ALL candidates (volume + CPC + KD) BEFORE scoring ─────────────────
  // Batched → ~2 API calls per language regardless of count, so cheap. Fixes the
  // old enrich-AFTER-slice bug where 0-volume GSC/competitor keywords were dropped
  // before volume backfill could reach them.
  try {
    const enrichLangs = (isIntl && loc.languages && loc.languages.length) ? loc.languages : ['en', 'ar'];
    // Labs (KD) needs a COUNTRY-level code. UAE is passed as city 21191 → map to 2784.
    const labsLocationCode = locationCode === 21191 ? 2784 : locationCode;
    const m = await enrichKeywordsMixed(candList.map(c => c.keyword), labsLocationCode, authHeader, enrichLangs);
    for (const c of candList) {
      const e = m[c.keyword.toLowerCase()];
      if (!e) continue;
      if ((!c.volume || c.volume === 0) && e.volume != null) c.volume = e.volume;
      if ((!c.cpc    || c.cpc    === 0) && e.cpc    != null) c.cpc    = e.cpc;
      // KD=0/null from DataForSEO = NO DATA (regional/long-tail) → UNKNOWN, not easy.
      c.kd = (e.kd != null && e.kd > 0) ? e.kd : null;
    }
    console.log(`${tag} enriched ${Object.keys(m).length}/${candList.length} candidates pre-scoring`);
  } catch (e) { console.warn(`${tag} pre-score enrich failed: ${e.message}`); }

  // Long-term config: defaults overridable via ONE Blobs key (scalable, no deploy).
  const ltCfg = { ...DEFAULT_LONG_TERM_CONFIG, ...((await store.get('config:keyword-longterm', { type: 'json' }).catch(() => null)) || {}) };

  // ── Score + tier ─────────────────────────────────────────────────────────────
  // Idea-expansion must clear a volume floor; primary sources (gsc/competitor) are
  // kept even at 0 volume — they're relevant by construction and score low anyway.
  const scored = candList
    .filter(c => c.volume >= (isIntl ? 0 : 10) || c.source !== 'idea')
    .map(c => {
      const kw            = c.keyword.toLowerCase();
      const ourPosition   = gscMap[kw] || null;
      const compPositions = compMap[kw] || [];
      const competitorBest = compPositions.length ? Math.min(...compPositions) : 100;
      const rawScore      = scoreOpportunity(c, ourPosition, compPositions);
      const boost         = businessBoost(kw);       // 1.4 if it hits a priority product term, else 1.0
      const score         = rawScore * boost;
      const tier          = getTier(ourPosition, competitorBest, score);
      const opp = {
        keyword:          c.keyword,
        volume:           c.volume,
        cpc:              c.cpc,
        kd:               c.kd ?? null,
        competition:      c.competition,
        intent:           intentLabel(c.keyword),
        source:           c.source,
        ourPosition:      ourPosition,
        competitorBest:   compPositions.length ? competitorBest : null,
        competitorCount:  compPositions.length,
        score:            Math.round(score * 1000) / 1000,
        tier,
        fromCompetitor:   c.source === 'competitor',
        fromGsc:          c.source === 'gsc',
        // Stage 2 "decide" layer — keyword → page → action
        targetPage:       gscPageMap[kw] || null,                 // the page we rank on (null = we don't rank)
        // an existing page (from the crawler) that plausibly targets this kw but doesn't rank — only when we don't already rank
        existingPage:     gscPageMap[kw] ? null : matchExistingPage(c.keyword, marketPages),
        competitorPage:   compPageMap[kw] ? compPageMap[kw].url : null, // the competitor page to beat
        businessBoost:    boost,           // >1 = matched a priority product (re-weighted up)
        priorityMarket:   isPriorityMarket, // this market is flagged commercially-priority
      };
      opp.action = recommendAction(opp, brandCtx);                // { actionType, label, rationale }
      const assessed = assessOpportunity(opp, c.source, market);
      opp.confidence = assessed.confidence;                        // 'high' | 'medium' | 'low'
      opp.flags      = assessed.flags;                             // advisory notes for the reviewer
      return opp;
    })
    .filter(k => k.tier !== 'top3') // already winning, skip
    // Drop already-ranking top-10 with no measured volume — near-won + no upside =
    // long-tail noise (the ~60 vol-0 "we rank #8" terms that flooded intl lists).
    .filter(k => !(k.tier === 'top10' && !(k.volume > 0)));

  // Long-term targets: split off BEFORE the top-N slice so the group is GUARANTEED
  // and never displaces quick-wins. Tag them, rank by traffic potential, cap the group.
  const longTerm = scored
    .filter(k => isLongTermTarget(k, ltCfg))
    .map(k => {
      k.tier             = 'long_term';
      k.longTerm         = true;
      k.trafficPotential = trafficPotential(k, ltCfg);
      k.whyLongTerm      = longTermReason(k, ltCfg);
      k.action           = recommendAction(k, brandCtx); // re-derive: tier changed
      return k;
    })
    .sort((a, b) => b.trafficPotential - a.trafficPotential)
    .slice(0, ltCfg.longTermLimit);
  const longTermKeys = new Set(longTerm.map(k => k.keyword.toLowerCase()));

  // Main worklist = everything else, top-N by score (unchanged behaviour).
  const main = scored
    .filter(k => !longTermKeys.has(k.keyword.toLowerCase()))
    .sort((a, b) => b.score - a.score)
    .slice(0, ltCfg.mainLimit);

  // Long-term group appended at the END (quick-wins → push → gaps → 🎯 long-term).
  const opportunities = [...main, ...longTerm];

  const summary = {
    quick_win:    opportunities.filter(k => k.tier === 'quick_win').length,
    push:         opportunities.filter(k => k.tier === 'push').length,
    content_gap:  opportunities.filter(k => k.tier === 'content_gap').length,
    top10:        opportunities.filter(k => k.tier === 'top10').length,
    monitor:      opportunities.filter(k => k.tier === 'monitor').length,
    long_term:    longTerm.length,
  };

  const result = {
    brand,
    market:        marketKey || 'uae',
    marketLabel,
    updatedAt:     new Date().toISOString(),
    opportunities,
    summary,
    gscKeywords:   Object.keys(gscMap).length,
    ideasFetched:  ideas.length,
    ideasDiag,     // real DataForSEO outcome string (shown in the UI empty state)
  };

  await store.set(storeKey, JSON.stringify(result));
  console.log(`${tag} stored ${opportunities.length} opportunities:`, JSON.stringify(summary));
  return result;
}

// ── Handler ───────────────────────────────────────────────────────────────────
const { authorizeJob } = require('./_lib/auth');

exports.handler = async (event) => {
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not authenticated' }) };
  console.log('[kw-discovery] Starting', new Date().toISOString());

  const store      = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
  const authHeader = getAuth();
  const qs         = event.queryStringParameters || {};
  const force      = qs.force === 'true';
  const brandParam = qs.brand;
  const marketParam= qs.market; // specific market e.g. 'pickl_bahrain', or omit for UAE

  const brands = brandParam ? [brandParam] : await getBrandSlugs();

  const results = {};
  for (const brand of brands) {
    try {
      // Run UAE discovery
      results[`${brand}:uae`] = await discoverKeywords(brand, store, authHeader, force, null);
    } catch (e) {
      console.error(`[kw-discovery] ${brand}/uae failed:`, e.message);
      results[`${brand}:uae`] = { error: e.message };
    }

    // Run international markets for this brand (skip if specific market requested)
    if (!marketParam) {
      const intlMarkets = Object.entries(await getMarketsMapAsync())
        .filter(([, m]) => m.brand === brand)
        .map(([key]) => key);

      for (const mk of intlMarkets) {
        try {
          results[`${brand}:${mk}`] = await discoverKeywords(brand, store, authHeader, force, mk);
        } catch (e) {
          console.error(`[kw-discovery] ${brand}/${mk} failed:`, e.message);
          results[`${brand}:${mk}`] = { error: e.message };
        }
      }
    } else if (marketParam !== 'uae') {
      // Single market requested
      try {
        results[`${brand}:${marketParam}`] = await discoverKeywords(brand, store, authHeader, force, marketParam);
      } catch (e) {
        results[`${brand}:${marketParam}`] = { error: e.message };
      }
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, results }),
  };
};
