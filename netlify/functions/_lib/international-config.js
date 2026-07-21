// netlify/functions/_lib/international-config.js
// Market configuration for international SEO pipelines.
//
// PICKL:   Bahrain, KSA, Qatar, Egypt, Jordan (/pickl-jordan/), Oman
// BONBIRD: Oman, Pakistan, Qatar
//
// URL STRUCTURE (target — dev to implement in parallel):
//   eatpickl.com/qatar/                     ← market landing page
//   eatpickl.com/qatar/journal/             ← journal index (WP parent page)
//   eatpickl.com/qatar/journal/<post-slug>/ ← individual blog post
//   eatpickl.com/qatar/<page-slug>/         ← standalone location/SEO page
//
// Jordan exception: /pickl-jordan/ (already indexed — do not change)
//
// WordPress: ONE WP instance per brand.
//   Pickl:   WP_PICKL_BASE / WP_PICKL_USER / WP_PICKL_APP_PASS
//   Bonbird: WP_BONBIRD_BASE / WP_BONBIRD_USER / WP_BONBIRD_APP_PASS
//
// Content posts to the correct market journal via WordPress parent page ID.
// WP parent page IDs per market stored in wpParentPageSlug — used to
// look up the page ID at post time via the WP REST API.

const INTERNATIONAL_MARKETS = {

  // ── PICKL MARKETS ────────────────────────────────────────────────────────

  pickl_bahrain: {
    brand:           'pickl',
    marketKey:       'bahrain',
    label:           'Bahrain',
    flag:            '🇧🇭',
    // URL paths — target structure (dev to wire up WP parent pages)
    marketSlug:      'bh',                    // eatpickl.com/bh/
    journalSlug:     'bh/journal',            // eatpickl.com/bh/journal/
    arabicSlug:      'bh-arabic',             // eatpickl.com/bh-arabic/ (exists)
    arabicJournalSlug: 'bh-arabic/journal',
    // WP — same instance as UAE Pickl
    wpBrand:         'pickl',                 // use WP_PICKL_* env vars
    wpMarketParent:  'bh',                    // WP page slug to look up parent ID
    languages:       ['en', 'ar'],
    // DataForSEO — authoritative Labs code (resolveLocation by name normally wins;
    // this is the cache-miss fallback, so it must be the REAL code, not a guess).
    // Bahrain = 2048 (was 17000, which is not Bahrain). Labs lang = ar only.
    location_code:   2048,
    currency:        'BHD',
    // Confirmed locations
    locations:       ['Al Aali Mall', 'Riffa'],
    seedKeywords: {
      en: [
        'smash burger bahrain', 'best burger in bahrain', 'best burger manama',
        'chicken sandwich bahrain', 'best fast food bahrain', 'halal burger bahrain',
        'burger restaurant manama', 'burger delivery bahrain', 'plant based burger bahrain',
        'chicken sando bahrain',
      ],
      ar: [
        'برغر البحرين', 'أفضل برغر في البحرين', 'ساندويش دجاج البحرين',
        'مطعم برغر المنامة', 'برغر حلال البحرين', 'توصيل برغر البحرين',
      ],
    },
    culturalNotes: [
      'Bahrain is cosmopolitan — mix of locals and large expat community',
      'Family dining is important — mention family-friendly atmosphere',
      'Halal is expected — emphasise quality and freshness instead',
      'Reference Al Aali Mall and Riffa locations specifically (Juffair Square is closed — never mention it)',
      'Bahrainis are food-savvy and aware of regional restaurant brands',
      'Arabic: use Gulf Arabic dialect',
    ],
  },

  pickl_ksa: {
    brand:           'pickl',
    marketKey:       'ksa',
    label:           'Saudi Arabia',
    flag:            '🇸🇦',
    marketSlug:      'ksa',
    journalSlug:     'ksa/journal',
    arabicSlug:      'ksa-arabic',
    arabicJournalSlug: 'ksa-arabic/journal',
    wpBrand:         'pickl',
    wpMarketParent:  'ksa',
    languages:       ['en', 'ar'],
    location_code:   2682,
    currency:        'SAR',
    locations:       ['Al Nakheel Mall Riyadh', 'U Walk Riyadh', 'La Palma Riyadh'],
    seedKeywords: {
      en: [
        'smash burger riyadh', 'best burger in riyadh', 'chicken sandwich riyadh',
        'best fast food riyadh', 'burger restaurant riyadh', 'smash burger saudi',
        'best burger saudi arabia', 'burger delivery riyadh', 'best chicken burger riyadh',
        'plant based burger riyadh', 'halal burger saudi arabia',
      ],
      ar: [
        'برغر الرياض', 'أفضل برغر في الرياض', 'ساندويش دجاج الرياض',
        'مطعم برغر الرياض', 'برغر حلال السعودية', 'توصيل برغر الرياض',
        'أفضل مطعم برغر السعودية', 'برغر سماش الرياض',
      ],
    },
    culturalNotes: [
      'Saudi Arabia — Vision 2030 context: young population, dining out culture growing rapidly',
      'Family sections culturally important — reference family-friendly dining',
      'Never reference alcohol, dating, or mixed-gender contexts',
      'Reference Al Nakheel Mall, U Walk, La Palma Riyadh locations specifically',
      'Arabic: Gulf Arabic dialect — NOT Modern Standard Arabic',
      'Halal is assumed — emphasise quality, freshness and no preservatives/hormones/antibiotics',
      'Food delivery is massive in KSA — mention delivery options naturally',
      'Pickl is genuinely award-winning — but ONLY cite the exact awards/counts in VERIFIED FACTS; never invent counts, years, or combine awards',
    ],
  },

  pickl_qatar: {
    brand:           'pickl',
    marketKey:       'qatar',
    label:           'Qatar',
    flag:            '🇶🇦',
    marketSlug:      'qatar',
    journalSlug:     'qatar/journal',
    arabicSlug:      'qatar-arabic',
    arabicJournalSlug: 'qatar-arabic/journal',
    wpBrand:         'pickl',
    wpMarketParent:  'qatar',
    languages:       ['en', 'ar'],
    location_code:   179,
    currency:        'QAR',
    locations:       ['West Walk, Doha', 'District 1, Doha'],
    seedKeywords: {
      en: [
        'smash burger doha', 'best burger in doha', 'chicken sandwich doha',
        'best fast food doha', 'burger restaurant doha', 'best burger qatar',
        'burger delivery doha', 'best chicken burger doha', 'smash burger qatar',
        'halal burger qatar', 'burgers lusail doha',
      ],
      ar: [
        'برغر الدوحة', 'أفضل برغر في الدوحة', 'ساندويش دجاج الدوحة',
        'مطعم برغر الدوحة', 'برغر حلال قطر', 'توصيل برغر الدوحة',
        'أفضل مطعم برغر قطر',
      ],
    },
    culturalNotes: [
      'Qatar is affluent — premium positioning lands well',
      'Large expat community means English content reaches a big audience',
      'Reference Lusail Boulevard specifically — it is a prestigious location',
      'Qatar has aggressive food delivery market — delivery angle important',
      'Gulf Arabic dialect for Arabic content',
      'Halal assumed — lead with quality, freshness and brand story',
      'Pickl Dubai origin story is a strong quality signal in Qatar',
    ],
  },

  pickl_egypt: {
    brand:           'pickl',
    marketKey:       'egypt',
    label:           'Egypt',
    flag:            '🇪🇬',
    marketSlug:      'egypt',
    journalSlug:     'egypt/journal',
    arabicSlug:      'egypt-arabic',
    arabicJournalSlug: 'egypt-arabic/journal',
    wpBrand:         'pickl',
    wpMarketParent:  'egypt',
    languages:       ['en', 'ar'],
    location_code:   2818,
    currency:        'EGP',
    locations:       ['Urban Lanes', 'Madinaty', 'Park Street East', 'Park Street West'],
    seedKeywords: {
      en: [
        'smash burger cairo', 'best burger in cairo', 'chicken sandwich cairo',
        'best fast food cairo', 'burger restaurant cairo', 'best burger egypt',
        'burger delivery cairo', 'best chicken burger egypt', 'halal burger egypt',
        'smash burger egypt',
      ],
      ar: [
        'برغر القاهرة', 'أفضل برغر في القاهرة', 'ساندويش دجاج القاهرة',
        'مطعم برغر القاهرة', 'برغر حلال مصر', 'توصيل برغر القاهرة',
        'أفضل مطعم برغر مصر', 'برغر سماش القاهرة',
      ],
    },
    culturalNotes: [
      'Egypt is a price-sensitive market — do not lead with premium pricing angles',
      'Egyptian Arabic dialect for Arabic content — very different from Gulf Arabic',
      'Cairo is primary city — Urban Lanes, Madinaty, Park St East, Park St West, Hyde Park',
      'Food delivery apps dominate — Talabat, Elmenus, Otlob — mention delivery',
      'Pickl UAE origin story is a strong quality signal for Egyptian audience',
      'Family dining and value are key themes',
      'Five Egypt locations gives strong "now across Cairo" angle',
    ],
  },

  pickl_jordan: {
    brand:           'pickl',
    marketKey:       'jordan',
    label:           'Jordan',
    flag:            '🇯🇴',
    // Jordan slug is /pickl-jordan/ — already indexed, do NOT change
    marketSlug:      'pickl-jordan',
    journalSlug:     'pickl-jordan/journal',
    arabicSlug:      'pickl-jordan-arabic',
    arabicJournalSlug: 'pickl-jordan-arabic/journal',
    wpBrand:         'pickl',
    wpMarketParent:  'pickl-jordan',
    languages:       ['en', 'ar'],
    // Jordan = 2400 (was 2144, which is SRI LANKA — a cache miss would have sent
    // Jordan SEO calls to Sri Lanka). Labs lang = ar only. Fallback must be real.
    location_code:   2400,
    currency:        'JOD',
    locations:       ['Vista 4, Amman'],
    seedKeywords: {
      en: [
        'smash burger amman', 'best burger in amman', 'chicken sandwich amman',
        'best fast food amman', 'burger restaurant amman', 'best burger jordan',
        'burger delivery amman', 'best chicken burger amman', 'halal burger jordan',
        'burgers vista 4 amman',
      ],
      ar: [
        'برغر عمان', 'أفضل برغر في عمان', 'ساندويش دجاج عمان',
        'مطعم برغر عمان', 'برغر حلال الأردن', 'توصيل برغر عمان',
        'أفضل مطعم برغر الأردن',
      ],
    },
    culturalNotes: [
      'Amman is a sophisticated dining city — food quality and authenticity matter',
      'Jordan has large expat and tourist population alongside locals',
      'Vista 4 is an upscale Amman location — reflects aspirational positioning',
      'Jordanian Arabic dialect for Arabic content',
      'Pickl is a UAE-born brand — Dubai origin resonates positively in Jordan',
      'Family and community dining themes work well',
      'Single location — focus content on the Vista 4 experience specifically',
    ],
  },

  pickl_oman: {
    brand:           'pickl',
    marketKey:       'oman',
    label:           'Oman',
    flag:            '🇴🇲',
    marketSlug:      'oman',
    journalSlug:     'oman/journal',
    arabicSlug:      null,               // English first — new market
    arabicJournalSlug: null,
    wpBrand:         'pickl',
    wpMarketParent:  'oman',
    languages:       ['en'],             // Add Arabic in Phase 3
    location_code:   2114,
    currency:        'OMR',
    isNew:           true,               // Opened May 2026
    locations:       ['Souq Al Madina, Muscat'],
    seedKeywords: {
      en: [
        'smash burger muscat', 'best burger in muscat', 'chicken sandwich oman',
        'best fast food muscat', 'burger restaurant muscat', 'best burger oman',
        'burger delivery muscat', 'new restaurant muscat 2026', 'best chicken burger muscat',
        'halal burger oman', 'burgers souq al madina muscat',
      ],
    },
    culturalNotes: [
      'BRAND NEW MARKET — Pickl opened in Oman May 2026. Lead with new opening energy.',
      'Two locations: Souq Al Madina and Al Hail, Muscat — mention both',
      'Muscat is primary city — reference specifically',
      'Omani audience is conservative and family-oriented',
      'Halal assumed — emphasise quality, freshness, UAE brand heritage',
      'English widely used in Oman food and lifestyle contexts',
      'New opening gives first-mover content advantage — create "now open" content',
    ],
  },

  // ── BONBIRD MARKETS ──────────────────────────────────────────────────────

  bonbird_oman: {
    brand:           'bonbird',
    marketKey:       'oman',
    label:           'Oman',
    flag:            '🇴🇲',
    marketSlug:      'oman',
    journalSlug:     'oman/journal',
    arabicSlug:      null,
    arabicJournalSlug: null,
    wpBrand:         'bonbird',           // use WP_BONBIRD_* env vars
    wpMarketParent:  'oman',
    languages:       ['en'],
    location_code:   2114,
    currency:        'OMR',
    locations:       ['Souq Al Madina, Muscat', 'Al Khoudh, Seeb'],
    seedKeywords: {
      en: [
        'fried chicken muscat', 'best fried chicken oman', 'crispy chicken muscat',
        'chicken restaurant muscat', 'fried chicken delivery muscat',
        'fresh fried chicken oman', 'chicken tenders muscat', 'best chicken oman',
        'chicken burger muscat', 'bonbird oman',
      ],
    },
    culturalNotes: [
      'Omani audience values quality and authenticity over trend-chasing',
      'Family dining is central — chicken by the bucket/box resonates',
      'Bonbird is Dubai-born — UAE origin is a quality signal in Oman',
      'Always fresh, hormone free, antibiotic free — lead with this',
      'Two locations: Souq Al Madina (Muscat) and Al Khoudh (Seeb) — mention both',
    ],
  },

  bonbird_pakistan: {
    brand:           'bonbird',
    marketKey:       'pakistan',
    label:           'Pakistan',
    flag:            '🇵🇰',
    marketSlug:      'pakistan',
    journalSlug:     'pakistan/journal',
    arabicSlug:      null,
    arabicJournalSlug: null,
    wpBrand:         'bonbird',
    wpMarketParent:  'pakistan',
    languages:       ['en'],             // English only — confirmed
    location_code:   2586,
    currency:        'PKR',
    locations:       ['Cue Cinemas, Gulberg Lahore', 'Dolmen Mall, DHA Lahore', 'Johar Town, Lahore'],
    seedKeywords: {
      en: [
        'fried chicken lahore', 'best fried chicken lahore', 'crispy chicken lahore',
        'chicken restaurant lahore', 'fried chicken delivery lahore',
        'fresh fried chicken pakistan', 'chicken tenders lahore', 'best chicken lahore',
        'crispy chicken burger lahore', 'bonbird pakistan', 'fried chicken gulberg',
        'chicken wrap lahore', 'best chicken dha lahore', 'crispy chicken johar town',
      ],
    },
    culturalNotes: [
      'Pakistan is a massive fried chicken market — KFC, Hardees, local brands all strong',
      'Price-conscious audience — value positioning matters alongside quality',
      'All locations are in Lahore — Gulberg, DHA, Johar Town — reference Lahore specifically',
      'Halal is assumed — lead with freshness and flavour variety (spice system)',
      'Bonbird spice system (Plain Jane to XXX) is a strong hook for Pakistani audience',
      'Family bucket meals extremely popular — emphasise Bone-In bucket deals',
      'Food delivery dominant — Foodpanda, Careem Food — mention delivery',
      'Three locations all in Lahore: Cue Cinemas Gulberg, Dolmen Mall DHA, Johar Town',
    ],
  },

  bonbird_qatar: {
    brand:           'bonbird',
    marketKey:       'qatar',
    label:           'Qatar',
    flag:            '🇶🇦',
    marketSlug:      'qatar',
    journalSlug:     'qatar/journal',
    arabicSlug:      null,
    arabicJournalSlug: null,
    wpBrand:         'bonbird',
    wpMarketParent:  'qatar',
    languages:       ['en', 'ar'],
    location_code:   179,
    currency:        'QAR',
    locations:       ['West Walk, Doha', 'District 1, Doha'],
    seedKeywords: {
      en: [
        'fried chicken doha', 'best fried chicken qatar', 'crispy chicken doha',
        'chicken restaurant doha', 'fried chicken delivery doha',
        'fresh fried chicken qatar', 'chicken tenders doha', 'best chicken qatar',
        'crispy chicken burger doha', 'bonbird qatar', 'chicken wrap doha',
        'bone in chicken doha',
      ],
      ar: [
        'دجاج مقلي الدوحة', 'أفضل دجاج في قطر', 'دجاج مقرمش الدوحة',
        'مطعم دجاج الدوحة', 'توصيل دجاج الدوحة', 'دجاج طازج قطر',
        'أفضل مطعم دجاج قطر', 'دجاج مقرمش طازج الدوحة',
      ],
    },
    culturalNotes: [
      'Qatar affluent market — quality and brand story matter',
      'Dubai-born brand — UAE origin resonates strongly in Qatar',
      'Always fresh, hormone free, antibiotic free — Gulf audience responds well',
      'Family bucket meals and group dining important',
      'Gulf Arabic dialect for Arabic content',
      'NOTE: Confirm Qatar Bonbird locations before publishing location content',
    ],
  },
};

// ── Helper functions ──────────────────────────────────────────────────────────

function getMarketsForBrand(brand) {
  return Object.entries(INTERNATIONAL_MARKETS)
    .filter(([, m]) => m.brand === brand)
    .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {});
}

function getAllMarketKeys() {
  return Object.keys(INTERNATIONAL_MARKETS);
}

function getMarket(marketKey) {
  return INTERNATIONAL_MARKETS[marketKey] || null;
}

// Returns the correct WP env vars for a market — single WP instance per brand.
// Env-var names derive from the brand slug (WP_<SLUG>_*), the same convention
// brands-config + wordpress.js use — so a NEW brand's market resolves with zero
// code edits (just set the env vars). No pickl/bonbird ternary.
function getWpCredentials(market) {
  const prefix = `WP_${String(market.wpBrand || market.brand || '').toUpperCase()}`;
  return {
    base: process.env[`${prefix}_BASE`],
    user: process.env[`${prefix}_USER`],
    pass: process.env[`${prefix}_APP_PASS`],
  };
}

// Build the full target URL for a post/page. brandDomain (e.g. 'https://eatpickl.com')
// should be passed from brands-config for a config-driven domain; falls back to the
// pickl/bonbird literals only for back-compat when a caller hasn't supplied it.
function buildPostUrl(market, type, slug, language = 'en', brandDomain = null) {
  const isArabic   = language === 'ar';
  const baseSlug   = isArabic && market.arabicSlug ? market.arabicSlug : market.marketSlug;
  const brand      = (brandDomain && brandDomain.replace(/\/$/, '')) ||
                     (market.wpBrand === 'pickl' ? 'https://eatpickl.com' : 'https://bonbirdchicken.com');

  if (type === 'blog_draft') {
    const journalBase = isArabic && market.arabicJournalSlug
      ? market.arabicJournalSlug
      : `${baseSlug}/journal`;
    return `${brand}/${journalBase}/${slug}/`;
  }
  // page_update / meta_update / onpage_suggestion — the market page itself
  // slug param is ignored to avoid double-slug (e.g. /oman/oman/)
  return `${brand}/${baseSlug}/`;
}

// Build Claude prompt context for a market.
// brandName/brandDomain come from brands-config (config-driven); fall back to a
// capitalized slug / the buildPostUrl literal so existing callers still work.
function buildMarketPrompt(market, brandCtx, language = 'en', brandName = null, brandDomain = null) {
  const isArabic = language === 'ar';
  const bName = brandName || (market.brand ? market.brand.charAt(0).toUpperCase() + market.brand.slice(1) : 'the brand');
  const marketUrl = buildPostUrl(market, 'page', '', language, brandDomain).replace(/\/$/, '');
  return `
=== INTERNATIONAL MARKET CONTEXT ===
Brand: ${bName}
Market: ${market.label} ${market.flag}
Language: ${isArabic ? 'Arabic (local dialect — NOT Modern Standard Arabic)' : 'English'}
${market.isNew ? '⚡ NEW MARKET — just opened. Content should celebrate the opening and drive first-visit traffic.' : ''}

URL STRUCTURE (critical — use these exact patterns):
- Market root:     ${marketUrl}/
- Journal posts:   ${buildPostUrl(market, 'blog_draft', '<post-slug>', language, brandDomain)}
- Market slug:     /${market.marketSlug}/ — this identifies ALL pages for ${market.label}
- Any URL containing /${market.marketSlug}/ is a ${market.label} page, NOT a UAE page
- Write ONLY for the ${market.label} market — do not target or reference UAE, Dubai, or other markets as the location/destination. EXCEPTION: you MAY cite the brand's Dubai/UAE awards (see VERIFIED FACTS) as pedigree (e.g. "the team behind Dubai's award-winning Pickl"), but NEVER claim an award was won in ${market.label}, and never tell ${market.label} visitors to go to Dubai.

WHAT THIS MARKET NEEDS FROM CONTENT:
- Keywords must reference ${market.label} specifically (e.g. "best burger in ${market.label === 'Saudi Arabia' ? 'Riyadh' : market.label}")
- All location references must be from CONFIRMED LOCATIONS below — never invent locations
- CTA should drive visitors to the ${market.label} location(s), not UAE
- Tone and cultural references must match ${market.label} audience (see Cultural Notes)

CONFIRMED LOCATIONS IN ${market.label.toUpperCase()} (${market.locations.length} SEPARATE outlet${market.locations.length === 1 ? '' : 's'} — distinct places; NEVER merge two into one address like "X, Y"):
${market.locations.length > 0 ? market.locations.map((l, i) => `  ${i + 1}. ${l}`).join('\n') : 'Locations TBC — do NOT invent or guess any location names'}
${market.locations.length > 1 ? `- ${bName} ${market.label} is a MULTI-LOCATION brand (${market.locations.length} outlets) — represent it as a brand across ${market.label}, never as a single outlet. Say "and" between outlets, not a comma.` : ''}

TARGET KEYWORDS FOR THIS MARKET (${language.toUpperCase()}):
${(market.seedKeywords[language] || market.seedKeywords['en'] || []).join(', ')}

CULTURAL & CONTENT NOTES (follow strictly):
${market.culturalNotes.map(n => `- ${n}`).join('\n')}

${isArabic ? `ARABIC WRITING RULES:
- Use local dialect appropriate for ${market.label} — NOT Modern Standard Arabic
- Meta descriptions: 120-155 characters
- Title tags: 50-60 characters
- URLs are always in English (slugs) even for Arabic content` : ''}
=== END MARKET CONTEXT ===

${brandCtx}`.trim();
}

// ── Market page discovery tokens ──────────────────────────────────────────────
// A page belongs to a market if any of these tokens matches a whole hyphen/slash
// segment of its slug (e.g. token "bahrain" matches /bahrain-events/ and
// /franchise-bahrain/; token "bh" matches /bh/). Tokens = root abbreviation +
// full country name. Hyphenated tokens (e.g. "pickl-jordan") match as substrings.
// The market's marketSlug + arabicSlug are merged in automatically by
// getMarketPageTokens, so this table only needs the human-readable names.
const MARKET_PAGE_TOKENS = {
  pickl_bahrain:    ['bh', 'bahrain'],
  pickl_ksa:        ['ksa', 'saudi'],
  pickl_qatar:      ['qatar'],
  pickl_egypt:      ['egypt'],
  pickl_jordan:     ['jordan'],          // also matches /pickl-jordan/ (segment "jordan")
  pickl_oman:       ['oman'],
  bonbird_oman:     ['oman'],
  bonbird_pakistan: ['pakistan'],
  bonbird_qatar:    ['qatar'],
};

// Slug substrings that disqualify a page from the meta sweep, even if it matches
// a market token. Legal/utility/campaign pages are never local-SEO landing pages.
// Matched as case-insensitive substrings of the slug.
const PAGE_SLUG_EXCLUDE = [
  // Legal / T&C / privacy / giveaway (note: live site has the typo "giveway")
  'terms-and-condition', 'terms-of', 'privacy', 'policy', 'cookie',
  'giveaway', 'giveway', 'disclaimer',
  // Campaign microsites — transient marketing, not evergreen local SEO
  'world-tour',
];

// True if a slug should be skipped by the meta sweep (legal/utility/campaign).
function isExcludedPageSlug(slug) {
  const s = String(slug || '').toLowerCase();
  return PAGE_SLUG_EXCLUDE.some(pat => s.includes(pat));
}

// Returns the de-duped token list for a market (object or "brand_marketKey" string).
// Always includes marketSlug + arabicSlug so the root pages are covered.
function getMarketPageTokens(marketOrKey) {
  const key = typeof marketOrKey === 'string'
    ? marketOrKey
    : `${marketOrKey.brand}_${marketOrKey.marketKey}`;
  const m = typeof marketOrKey === 'object' ? marketOrKey : INTERNATIONAL_MARKETS[key];
  const tokens = [...(MARKET_PAGE_TOKENS[key] || [])];
  if (m) {
    if (m.marketSlug) tokens.push(String(m.marketSlug).toLowerCase());
    if (m.arabicSlug) tokens.push(String(m.arabicSlug).toLowerCase());
  }
  return [...new Set(tokens.map(t => String(t).toLowerCase().trim()).filter(Boolean))];
}

// Shared: does a page URL belong to a market (whole-segment token match — handles
// flat slugs like /bh/, /bahrain-locations/, /bh-arabic/)? Single source of truth
// so keyword-discovery, onpage-audit and market-traffic all attribute URLs the same
// way (CLAUDE.md #12). NOTE: keyword-discovery/onpage-audit still have local copies —
// migrate them to this on next touch.
function urlMatchesTokens(url, tokens) {
  if (!url || !tokens || !tokens.length) return false;
  const path = String(url).replace(/^https?:\/\/[^\/]+/, '').toLowerCase();
  return tokens.some(t => path === `/${t}` || path === `/${t}/` || path.startsWith(`/${t}/`) || path.startsWith(`/${t}-`));
}

// Attribute a page URL to its market key for a brand ('uae' if not an intl page).
// SYNC form — uses the seed literal only (covers the built-in markets). For a
// config-onboarded market use marketForUrlAsync.
function marketForUrl(url, brand) {
  const markets = Object.entries(INTERNATIONAL_MARKETS).filter(([, m]) => m.brand === brand);
  for (const [key, m] of markets) {
    if (urlMatchesTokens(url, getMarketPageTokens(m))) return key;
  }
  return 'uae';
}

// ── Blobs-aware async accessors (markets-config is the source of truth) ────────
// Lazy require avoids a circular dependency (markets-config requires this file for
// its seed). These see markets onboarded via Settings, not just the seed literals.
function _mc() { return require('./markets-config'); }

// All SEO markets for a brand as a {key: market} object (Blobs-merged).
async function getMarketsForBrandAsync(brand) {
  const list = await _mc().getMarketsForBrand(brand);
  return list.reduce((acc, m) => { acc[m.key] = m; return acc; }, {});
}

// One market by key (Blobs-merged), or null.
async function getMarketAsync(key) { return _mc().getMarket(key); }

// Full SEO market map (Blobs-merged), drop-in for the INTERNATIONAL_MARKETS literal.
async function getMarketsMapAsync() { return _mc().getMarketsMap(); }

// Attribute a URL to its market key for a brand, INCLUDING config-onboarded markets.
async function marketForUrlAsync(url, brand) {
  const list = await _mc().getMarketsForBrand(brand);
  for (const m of list) {
    if (urlMatchesTokens(url, getMarketPageTokens(m))) return m.key;
  }
  return 'uae';
}

// Flat map of marketKey → location_code for quick lookup by any function
const MARKET_LOCATION_CODES = Object.fromEntries(
  Object.entries(INTERNATIONAL_MARKETS).map(([key, m]) => [key, m.location_code])
);
// Also expose UAE as a base reference
MARKET_LOCATION_CODES['uae'] = 21191;
MARKET_LOCATION_CODES['uae_country'] = 2784;

module.exports = {
  INTERNATIONAL_MARKETS,
  MARKET_LOCATION_CODES,
  getMarketsForBrand,
  getAllMarketKeys,
  getMarket,
  getWpCredentials,
  buildPostUrl,
  buildMarketPrompt,
  getMarketPageTokens,
  urlMatchesTokens,
  marketForUrl,
  MARKET_PAGE_TOKENS,
  isExcludedPageSlug,
  PAGE_SLUG_EXCLUDE,
  // Blobs-aware (config-onboarded markets) — prefer these in handlers:
  getMarketsForBrandAsync,
  getMarketAsync,
  getMarketsMapAsync,
  marketForUrlAsync,
};
