// netlify/functions/keyword-discovery-background.js
// Keyword Discovery Engine — runs weekly, builds a scored opportunity list
// from DataForSEO keyword ideas + competitor data + GSC cross-reference.
//
// Approach: data-driven, zero human input required.
//   1. Menu items + brand + location → DataForSEO keyword ideas (what people search for)
//   2. Cross-reference with GSC cache → what do we already rank for?
//   3. Cross-reference with competitorRankedKeywords → do competitors rank for it?
//   4. Filter by menu relevancy, minimum volume, market fit
//   5. Score by: volume × CPC weight × gap vs competitors × reachability
//   6. Store top opportunities as keywordOpportunities:<brand>
//
// Runs Monday 4am UTC alongside main scheduler.
// Manual trigger: GET /.netlify/functions/keyword-discovery-background?brand=pickl&force=true

const { getStore }        = require('@netlify/blobs');
const { getBrandContext } = require('./_lib/brand');
const { callClaude, extractJson } = require('./_lib/store');
const { INTERNATIONAL_MARKETS } = require('./_lib/international-config');
const { resolveLocation } = require('./_lib/dfs-locations');
const { enrichKeywordsMixed } = require('./_lib/keyword-metrics');

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
function isRelevantKeyword(kw) {
  const s = String(kw || '').toLowerCase();
  return RELEVANT_ROOTS.some(root => s.includes(root));
}

// Keep a keyword only if it (a) carries an on-category product/food root AND
// (b) contains no off-menu/off-brand term. Positive gate + negative blocklist.
function applyStaticFilter(keywords) {
  return keywords.filter(k => {
    const kw = k.keyword.toLowerCase();
    if (!isRelevantKeyword(kw)) return false;                 // must be on-category
    return !OFF_MENU_DISHES.some(term => kw.includes(term));  // and not off-menu/off-brand
  });
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
async function filterKeywordsWithClaude(allKeywords, brandName, brandCtx, marketLabel = 'UAE') {
  if (!allKeywords.length) return allKeywords;

  // Batch so large sets (esp. full Arabic batches) aren't dropped wholesale in a
  // single Claude call. Recurse with ≤BATCH chunks; the single-batch path below
  // runs the actual filter and fails OPEN if a chunk comes back empty.
  const BATCH = 50;
  if (allKeywords.length > BATCH) {
    const out = [];
    for (let i = 0; i < allKeywords.length; i += BATCH) {
      const part = await filterKeywordsWithClaude(allKeywords.slice(i, i + BATCH), brandName, brandCtx, marketLabel);
      out.push(...part);
    }
    console.log(`[kw-discovery] Claude filter (batched): ${allKeywords.length} → ${out.length} keywords`);
    return out;
  }
  const keywords = allKeywords;

  const menuSummary = Object.entries(brandCtx?.menu || {})
    .map(([cat, items]) => `${cat}: ${Array.isArray(items) ? items.join(', ') : items}`)
    .join('; ') || 'burgers and chicken';

  const kwList = keywords.map((k, i) => `${i + 1}. ${k.keyword}`).join('\n');

  const isPickl   = brandName.toLowerCase() === 'pickl';
  const offMenu   = isPickl
    ? 'butter chicken, biryani, shawarma, pizza, pasta, sushi, coffee, cheesecake, bakery items, Indian food, Middle Eastern food not on menu'
    : 'burgers (we sell chicken, not burgers), pizza, pasta, shawarma, sushi, coffee, biryani, butter chicken, kung pao, tikka masala, curry dishes, bakery items';

  const prompt = `You are filtering keyword research results for ${brandName}, a restaurant operating in ${marketLabel}.

What ${brandName} sells: ${menuSummary}

Below are ${keywords.length} keywords. Return ONLY the numbers of keywords that are CATEGORY or INTENT searches — where someone is looking for a TYPE of food or restaurant that ${brandName} actually sells. This is a ${marketLabel} market, so local-language (e.g. Arabic) category searches are valid and should be KEPT.

KEEP examples:
- "best burger in dubai" ✓ (category search — Pickl sells burgers)
- "smash burger dubai" ✓ (food type Pickl sells)
- "fried chicken restaurant dubai" ✓ (category search — Bonbird sells fried chicken)
- "crispy chicken delivery dubai" ✓ (Bonbird food type + intent)
- "برغر" / "أفضل برغر" / "دجاج مقلي" / "مطعم برغر" ✓ (Arabic category searches for food the brand sells — KEEP these)

REJECT — competitor brand names (most important rule):
- "dime burger" ✗ (Dime Burger is a UAE restaurant chain)
- "goat burger" ✗ (Goat Burger is a UAE chain)
- "pox chicken" ✗ (Pox Chicken is a UAE restaurant)
- "j j chicken" / "jjs chicken" / "jeje chicken" ✗ (all same brand — JJ's Chicken)
- "black tap" ✗ (Black Tap is a restaurant chain)
- "cheesecake factory" ✗ (brand name)
- "nandos" / "kfc" / "mcdonald" / "starbucks" ✗ (brand names)
- Any phrase where a word or two-word combo is a specific restaurant/chain name — when in doubt, reject

REJECT — food not on ${brandName}'s menu:
${offMenu}

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

// ── Opportunity scoring ───────────────────────────────────────────────────────
// score = volume_norm × 0.4 + cpc_norm × 0.2 + gap_score × 0.3 + reachability × 0.1
function scoreOpportunity(kw, ourPosition, competitorPositions) {
  const volumeNorm      = Math.min(kw.volume / 2000, 1);
  const cpcNorm         = Math.min((kw.cpc || 0) / 3, 1);
  const competitorBest  = Math.min(...(competitorPositions.length ? competitorPositions : [100]));
  const ourPos          = ourPosition || 101;

  // Gap: competitor ranks well, we don't
  let gapScore = 0;
  if (ourPos > 20  && competitorBest <= 10) gapScore = 1.0; // they own it, we're nowhere
  else if (ourPos > 10 && competitorBest <= 10) gapScore = 0.7; // they're top 10, we're not
  else if (ourPos > 10 && competitorBest <= 20) gapScore = 0.5; // both in 11-20
  else if (ourPos <= 20 && ourPos > 3)           gapScore = 0.3; // we're close, no competitor needed
  else if (ourPos <= 3)                           gapScore = 0.0; // already winning

  // Reachability: easier competition = more reachable
  const reachability = kw.competition === 'low' ? 1.0 : kw.competition === 'medium' ? 0.6 : 0.3;

  return (volumeNorm * 0.4) + (cpcNorm * 0.2) + (gapScore * 0.3) + (reachability * 0.1);
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

// ── Main discovery per brand (optionally per market) ─────────────────────────
async function discoverKeywords(brand, store, authHeader, force = false, marketKey = null) {
  const isIntl   = marketKey && marketKey !== 'uae';
  const market   = isIntl ? INTERNATIONAL_MARKETS[marketKey] : null;
  const tag      = isIntl ? `[kw-discovery/${brand}/${marketKey}]` : `[kw-discovery/${brand}]`;
  const storeKey = isIntl ? `keywordOpportunities:${brand}:${marketKey}` : `keywordOpportunities:${brand}`;
  console.log(`${tag} starting discovery`);

  const brandCtx = await getBrandContext(brand);
  const brandName = brand.charAt(0).toUpperCase() + brand.slice(1);

  // For international: use market seed keywords + brand-appropriate generic seeds
  // NOTE: marketLabel/locationCode declared BEFORE brandGenericSeeds — they are
  // referenced inside the template literals below (TDZ crash if declared after).
  const marketLabel   = isIntl ? market.label : 'UAE';
  // Resolve location + supported languages from DataForSEO's authoritative list.
  const loc = isIntl
    ? await resolveLocation(market.label)
    : { code: MARKET_LOCATIONS.UAE, languages: ['en'], supported: true, inCache: true };
  const locationCode = loc.code || (isIntl ? market.location_code : MARKET_LOCATIONS.UAE);
  const brandGenericSeeds = brand === 'pickl'
    ? [`best burger in ${marketLabel}`, `burger restaurant ${marketLabel}`, `smash burger ${marketLabel}`]
    : [`best fried chicken in ${marketLabel}`, `fried chicken restaurant ${marketLabel}`, `crispy chicken ${marketLabel}`];

  // Load GSC cache — international pages live on same GSC property
  const GSC_URL   = brand === 'pickl' ? 'https://eatpickl.com/' : 'sc-domain:bonbirdchicken.com';
  const gscCache  = await store.get(`gscCache:${GSC_URL}`, { type: 'json' }).catch(() => null);
  const gscMap    = {};
  if (gscCache?.rows) {
    for (const row of gscCache.rows) {
      if (!row.keyword) continue;
      // For international: only include rows matching the market URL pattern
      if (isIntl && row.page && !row.page.includes(`/${market.marketSlug}`)) continue;
      gscMap[row.keyword.toLowerCase()] = row.position;
    }
  }
  console.log(`${tag} GSC positions loaded: ${Object.keys(gscMap).length} keywords`);

  // Load competitor ranked keywords — market-qualified for intl, unsuffixed for UAE (back-compat)
  const compKey  = isIntl ? `competitorRankedKeywords:${brand}:${marketKey}` : `competitorRankedKeywords:${brand}`;
  const compData = await store.get(compKey, { type: 'json' }).catch(() => null);
  const compMap  = {}; // keyword → [positions from competitors]
  const compMeta = {}; // keyword → { volume, cpc } — carry the real DataForSEO volume, don't discard it
  if (compData?.competitors) {
    for (const [, kwList] of Object.entries(compData.competitors)) {
      for (const kw of kwList || []) {
        const key = kw.keyword?.toLowerCase();
        if (key) {
          if (!compMap[key]) compMap[key] = [];
          compMap[key].push(kw.position || 100);
          if (!compMeta[key]) compMeta[key] = { volume: kw.searchVolume || 0, cpc: kw.cpc || 0 };
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
      if (!isIntl) return BRAND_SEEDS[brand] || [];
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
  const staticFilteredIdeas = applyStaticFilter(ideas);
  console.log(`${tag} static filter: ${ideas.length} → ${staticFilteredIdeas.length} ideas`);
  const filteredIdeas = await filterKeywordsWithClaude(staticFilteredIdeas, brandName, brandCtx, marketLabel);

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
  const staticFilteredComp = applyStaticFilter(rawCompKeywords);
  console.log(`${tag} comp static filter: ${rawCompKeywords.length} → ${staticFilteredComp.length} keywords`);
  const filteredComp = staticFilteredComp.length > 0
    ? await filterKeywordsWithClaude(staticFilteredComp.slice(0, 80), brandName, brandCtx, marketLabel)
    : [];
  console.log(`${tag} comp Claude filter: ${staticFilteredComp.length} → ${filteredComp.length} keywords`);

  // Merge all sources
  const allKeywords = [...filteredIdeas, ...filteredComp];
  const seen = new Set();
  const unique = allKeywords.filter(k => {
    if (!k.keyword || seen.has(k.keyword.toLowerCase())) return false;
    seen.add(k.keyword.toLowerCase());
    return true;
  });

  // Score and tier (no static filter — Claude already cleaned the list)
  const opportunities = unique
    .filter(k => k.volume >= (isIntl ? 0 : 10) || k.fromCompetitor)
    .map(k => {
      const kw           = k.keyword.toLowerCase();
      const ourPosition  = gscMap[kw] || null;
      const compPositions = compMap[kw] || [];
      const score        = scoreOpportunity(k, ourPosition, compPositions);
      const tier         = getTier(ourPosition, Math.min(...(compPositions.length ? compPositions : [100])), score);
      return {
        keyword:          k.keyword,
        volume:           k.volume,
        cpc:              k.cpc,
        competition:      k.competition,
        ourPosition:      ourPosition,
        competitorBest:   compPositions.length ? Math.min(...compPositions) : null,
        competitorCount:  compPositions.length,
        score:            Math.round(score * 1000) / 1000,
        tier,
        fromCompetitor:   k.fromCompetitor || false,
      };
    })
    .filter(k => k.tier !== 'top3') // already winning, skip
    .sort((a, b) => b.score - a.score)
    .slice(0, 100); // top 100 opportunities

  // Enrich with Keyword Difficulty (volume already present from keyword_ideas).
  try {
    const enrichLangs = (isIntl && loc.languages && loc.languages.length) ? loc.languages : ['en', 'ar'];
    // Labs (KD) needs a COUNTRY-level code. UAE is passed as city 21191 → map to 2784,
    // same as getKeywordIdeas does. Without this, every UAE keyword's KD came back null.
    const labsLocationCode = locationCode === 21191 ? 2784 : locationCode;
    const m = await enrichKeywordsMixed(opportunities.map(o => o.keyword), labsLocationCode, authHeader, enrichLangs);
    for (const o of opportunities) {
      const e = m[o.keyword.toLowerCase()];
      if (e) {
        if (e.kd != null) o.kd = e.kd;
        if ((!o.volume || o.volume === 0) && e.volume != null) o.volume = e.volume; // backfill competitor-sourced volume
      }
    }
    console.log(`${tag} KD-enriched ${Object.keys(m).length} opportunity keywords`);
  } catch (e) { console.warn(`${tag} KD enrich failed: ${e.message}`); }

  const summary = {
    quick_win:    opportunities.filter(k => k.tier === 'quick_win').length,
    push:         opportunities.filter(k => k.tier === 'push').length,
    content_gap:  opportunities.filter(k => k.tier === 'content_gap').length,
    top10:        opportunities.filter(k => k.tier === 'top10').length,
    monitor:      opportunities.filter(k => k.tier === 'monitor').length,
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
exports.handler = async (event) => {
  console.log('[kw-discovery] Starting', new Date().toISOString());

  const store      = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
  const authHeader = getAuth();
  const qs         = event.queryStringParameters || {};
  const force      = qs.force === 'true';
  const brandParam = qs.brand;
  const marketParam= qs.market; // specific market e.g. 'pickl_bahrain', or omit for UAE

  const brands = brandParam ? [brandParam] : ['pickl', 'bonbird'];

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
      const intlMarkets = Object.entries(INTERNATIONAL_MARKETS)
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
