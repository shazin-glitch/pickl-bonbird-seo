// netlify/functions/_lib/international-config.js
// Market configuration for international SEO pipelines.
//
// PICKL:   Bahrain, KSA, Qatar, Egypt, Jordan, Oman, Kuwait + Iraq (pre-launch)
// BONBIRD: Oman, Pakistan, Qatar
//
// URL STRUCTURE — both sites now use ISO market folders (Bonbird since 2026-08-18,
// Pickl verified 2026-10-20): /ae/ /sa/ /qa/ /eg/ /jo/ /bh/ /om/ /kw/ /iq/ (Pickl),
// /ae/ /om/ /qa/ /pk/ (Bonbird). Old word folders (/ksa/ /qatar/ /egypt/ /oman/
// /pickl-jordan/) 301 to the ISO ones; they stay in MARKET_PAGE_TOKENS so historical
// GSC rows still attribute. Pickl venue pages live at /location/<slug>/ (no market
// in the URL) — their market comes from the site's country feed (venueMarketMap).
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
    countryCode:    'BH',      // ISO-3166 — hreflang locale + schema addressCountry
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
    marketSlug:      'sa',                // ISO — site migrated 2026-10 (was 'ksa', now 301s)
    journalSlug:     'sa/journal',
    arabicSlug:      null,                // /ksa-arabic/ 404s — new site is English-only
    arabicJournalSlug: null,
    wpBrand:         'pickl',
    wpMarketParent:  null,                // /sa/ is theme-routed, not a WP page (see SETUP v7.9.131)
    languages:       ['en', 'ar'],
    location_code:   2682,
    currency:        'SAR',
    countryCode:    'SA',      // ISO-3166 — hreflang locale + schema addressCountry
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
    marketSlug:      'qa',                // ISO — site migrated 2026-10 (was 'qatar', now 301s)
    journalSlug:     'qa/journal',
    arabicSlug:      null,                // /qatar-arabic/ 404s — new site is English-only
    arabicJournalSlug: null,
    wpBrand:         'pickl',
    wpMarketParent:  null,                // /qa/ is theme-routed, not a WP page
    languages:       ['en', 'ar'],
    location_code:   2634, // Qatar (Google geo 2000+ISO 634). Was 179 — invalid: every DataForSEO call returned nothing (fixed v7.9.124)
    currency:        'QAR',
    countryCode:    'QA',      // ISO-3166 — hreflang locale + schema addressCountry
    locations:       ['West Walk, Doha', 'District One, Doha'],
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
    marketSlug:      'eg',                // ISO — site migrated 2026-10 (was 'egypt', now 301s)
    journalSlug:     'eg/journal',
    arabicSlug:      null,                // /egypt-arabic/ 404s — new site is English-only
    arabicJournalSlug: null,
    wpBrand:         'pickl',
    wpMarketParent:  null,                // /eg/ is theme-routed, not a WP page
    languages:       ['en', 'ar'],
    location_code:   2818,
    currency:        'EGP',
    countryCode:    'EG',      // ISO-3166 — hreflang locale + schema addressCountry
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
    // The site moved Jordan to /jo/ (2026-10); /pickl-jordan/ now 301s there and stays a
    // legacy token in MARKET_PAGE_TOKENS so its indexed history still attributes.
    marketSlug:      'jo',
    journalSlug:     'jo/journal',
    arabicSlug:      null,                // /pickl-jordan-arabic/ 404s — new site is English-only
    arabicJournalSlug: null,
    wpBrand:         'pickl',
    wpMarketParent:  null,                // /jo/ is theme-routed, not a WP page
    languages:       ['en', 'ar'],
    // Jordan = 2400 (was 2144, which is SRI LANKA — a cache miss would have sent
    // Jordan SEO calls to Sri Lanka). Labs lang = ar only. Fallback must be real.
    location_code:   2400,
    currency:        'JOD',
    countryCode:    'JO',      // ISO-3166 — hreflang locale + schema addressCountry
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
    marketSlug:      'om',                // ISO — site migrated 2026-10 (was 'oman', now 301s)
    journalSlug:     'om/journal',
    arabicSlug:      null,               // English first — new market
    arabicJournalSlug: null,
    wpBrand:         'pickl',
    wpMarketParent:  null,                // /om/ is theme-routed, not a WP page
    languages:       ['en'],             // Add Arabic in Phase 3
    location_code:   2512, // Oman (Google geo 2000+ISO 512). Was 2114 — invalid: every DataForSEO call returned nothing (fixed v7.9.124)
    currency:        'OMR',
    countryCode:    'OM',      // ISO-3166 — hreflang locale + schema addressCountry
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

  // Kuwait + Iraq: market folders /kw/ /iq/ are live but NOTHING is open (verified
  // 2026-10-20, ~/Documents/pickl-seo/02h-venue-facts-kuwait-iraq.md). launchStatus
  // 'pre_launch' keeps them in reporting/attribution but out of the paid DataForSEO
  // fan-outs (keyword discovery, competitor matrix) until they open — flip it to
  // 'live' in Settings → SEO Markets. No venues/locations: never invent them.
  pickl_kuwait: {
    brand:           'pickl',
    marketKey:       'kuwait',
    label:           'Kuwait',
    flag:            '🇰🇼',
    marketSlug:      'kw',
    journalSlug:     'kw/journal',
    arabicSlug:      null,
    arabicJournalSlug: null,
    wpBrand:         'pickl',
    wpMarketParent:  null,
    languages:       ['en'],
    location_code:   2414, // Kuwait (country) — verified against DataForSEO's locations list 2026-10-20
    currency:        'KWD',
    countryCode:     'KW',
    launchStatus:    'pre_launch',
    locations:       [],
    venues:          [],
    seedKeywords:    { en: ['burger kuwait', 'best burger in kuwait', 'smash burger kuwait', 'chicken sandwich kuwait'] },
    culturalNotes: [
      'PRE-LAUNCH — nothing is open in Kuwait. Never claim an opening date, a venue, a mall, an area or a city.',
      'PICK is an unrelated Kuwaiti health-food chain — never confuse or compare.',
      'Gulf Arabic dialect for any Arabic content.',
    ],
  },

  pickl_iraq: {
    brand:           'pickl',
    marketKey:       'iraq',
    label:           'Iraq',
    flag:            '🇮🇶',
    marketSlug:      'iq',
    journalSlug:     'iq/journal',
    arabicSlug:      null,
    arabicJournalSlug: null,
    wpBrand:         'pickl',
    wpMarketParent:  null,
    languages:       ['en'],
    location_code:   2368, // Iraq (country) — verified against DataForSEO's locations list 2026-10-20
    currency:        'IQD',
    countryCode:     'IQ',
    launchStatus:    'pre_launch',
    locations:       [],
    venues:          [],
    seedKeywords:    { en: ['burger baghdad', 'best burger in baghdad', 'smash burger iraq', 'burger iraq mall'] },
    culturalNotes: [
      'PRE-LAUNCH — nothing is open in Iraq. The first venue is planned for Iraq Mall, Al-Dora, Baghdad; never claim an opening date.',
      'Iraq Gates is unconfirmed — do not describe it.',
      'Iraqi Arabic dialect for any Arabic content.',
    ],
  },

  // ── BONBIRD MARKETS ──────────────────────────────────────────────────────

  bonbird_oman: {
    brand:           'bonbird',
    marketKey:       'oman',
    label:           'Oman',
    flag:            '🇴🇲',
    marketSlug:      'om',            // ISO — site rebuilt 2026-08-18 (was 'oman')
    journalSlug:     'om/journal',
    arabicSlug:      null,
    arabicJournalSlug: null,
    wpBrand:         'bonbird',           // use WP_BONBIRD_* env vars
    wpMarketParent:  'om',
    languages:       ['en'],
    location_code:   2512, // Oman (Google geo 2000+ISO 512). Was 2114 — invalid: every DataForSEO call returned nothing (fixed v7.9.124)
    currency:        'OMR',
    countryCode:    'OM',      // ISO-3166 — hreflang locale + schema addressCountry
    locations:       ['Souq Al Madina, Muscat', 'Al Khoudh, Seeb'],
    // Structured venue records — the city-hub source of truth (rule 12). `locations`
    // strings are kept as-is for existing prompt/consumer code (join/split/interp).
    // type: 'dine_in' (dine-in + pickup + delivery) | 'dark_kitchen' (pickup/delivery
    // only, NO dine-in — content must not imply dining in). Confirmed w/ Shazin 20 Aug.
    venues: [
      { name: 'Souq Al Madina', city: 'Muscat', type: 'dine_in' },
      { name: 'Al Khoudh',      city: 'Seeb',   type: 'dine_in' },
    ],
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
    marketSlug:      'pk',            // ISO — site rebuilt 2026-08-18 (was 'pakistan')
    journalSlug:     'pk/journal',
    arabicSlug:      null,
    arabicJournalSlug: null,
    wpBrand:         'bonbird',
    wpMarketParent:  'pk',
    languages:       ['en'],             // English only — confirmed
    location_code:   2586,
    currency:        'PKR',
    countryCode:    'PK',      // ISO-3166 — hreflang locale + schema addressCountry
    locations:       ['Cue Cinemas, Gulberg Lahore', 'Dolmen Mall, DHA Lahore', 'Johar Town, Lahore'],
    venues: [
      { name: 'Cue Cinemas, Gulberg', city: 'Lahore', type: 'dine_in' },
      { name: 'Dolmen Mall, DHA',      city: 'Lahore', type: 'dine_in' },
      { name: 'Johar Town',            city: 'Lahore', type: 'dark_kitchen' }, // pickup/delivery only — no dine-in
    ],
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
    marketSlug:      'qa',            // ISO — site rebuilt 2026-08-18 (was 'qatar')
    journalSlug:     'qa/journal',
    arabicSlug:      null,
    arabicJournalSlug: null,
    wpBrand:         'bonbird',
    wpMarketParent:  'qa',
    languages:       ['en', 'ar'],
    location_code:   2634, // Qatar (Google geo 2000+ISO 634). Was 179 — invalid: every DataForSEO call returned nothing (fixed v7.9.124)
    currency:        'QAR',
    countryCode:    'QA',      // ISO-3166 — hreflang locale + schema addressCountry
    locations:       ['West Walk, Doha', 'District One, Doha'],
    venues: [
      { name: 'West Walk',  city: 'Doha', type: 'dine_in' },
      { name: 'District One', city: 'Doha', type: 'dark_kitchen' }, // pickup/delivery only — no dine-in (Shazin, 2026-09)
    ],
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
      'Qatar venues confirmed 2026-08-26: West Walk + District One, both Doha (per Shazin / live site).',
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
  // Pickl moved to ISO folders 2026-10 — the old words (+ their dead -arabic twins) are
  // kept so historical GSC rows on the 301'd URLs still attribute (same as Bonbird).
  pickl_bahrain:    ['bh', 'bahrain'],
  pickl_ksa:        ['sa', 'ksa', 'saudi', 'ksa-arabic'],
  pickl_qatar:      ['qa', 'qatar', 'qatar-arabic'],
  pickl_egypt:      ['eg', 'egypt', 'egypt-arabic'],
  pickl_jordan:     ['jo', 'jordan', 'pickl-jordan', 'pickl-jordan-arabic'],
  pickl_oman:       ['om', 'oman'],
  pickl_kuwait:     ['kw', 'kuwait'],
  pickl_iraq:       ['iq', 'iraq'],
  bonbird_oman:     ['om', 'oman'],          // 'oman' kept: pre-2026-08-18 URLs in historical GSC
  bonbird_pakistan: ['pk', 'pakistan'],
  bonbird_qatar:    ['qa', 'qatar'],
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

// ── Venue pages with no market in the URL (Pickl: /location/<slug>/) ──────────
// Some sites file every venue under one flat folder, so the URL can't say which market
// a venue is in (every Pickl venue used to land in 'uae'). The site's own WordPress
// taxonomy knows, and exposes it on a public per-term RSS feed. Config-driven (rule 12):
//   brandsConfig.venuePathBase   — the venue folder, e.g. 'location'
//   brandsConfig.venueMarketFeed — feed path with {cc} = the market's ISO countryCode
//                                  (lowercase), e.g. '/country/{cc}/feed/'
// The home market uses brandsConfig.homeCountryCode and maps to 'uae'. A brand without
// these fields gets an empty map (pure URL-token attribution, unchanged).
// Keyed by the venue's post SLUG (last path segment), not the feed's full link: the
// feed can report a stale permalink (Pickl UAE: /dubai/jbr/ 404s, live = /location/jbr/).
const VENUE_MAP_TTL = 10 * 60 * 1000;
const VENUE_FEED_MAX_PAGES = 10;
const _venueMaps = new Map(); // brand → { at, promise }

function _lastSeg(u) {
  const segs = String(u || '').replace(/^https?:\/\/[^\/]+/, '').split(/[?#]/)[0].toLowerCase().split('/').filter(Boolean);
  return segs.length ? segs[segs.length - 1] : null;
}

async function _fetchFeedSlugs(url) {
  const slugs = [];
  for (let page = 1; page <= VENUE_FEED_MAX_PAGES; page++) {
    let xml = null;
    try {
      const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}paged=${page}`, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) break;                       // WP 404s past the last page
      xml = await r.text();
    } catch { if (page === 1) throw new Error('feed unreachable'); break; }
    const items = xml.split('<item>').slice(1);
    if (!items.length) break;
    for (const it of items) {
      const m = it.match(/<link>([^<]+)<\/link>/);
      const slug = m && _lastSeg(m[1].trim());
      if (slug) slugs.push(slug);
    }
  }
  return slugs;
}

async function _buildVenueMap(brand) {
  const cfg = await require('./brands-config').getBrand(brand).catch(() => null);
  const base = cfg && cfg.venuePathBase ? String(cfg.venuePathBase).replace(/^\/+|\/+$/g, '').toLowerCase() : null;
  const feed = cfg && cfg.venueMarketFeed;
  const domain = cfg && cfg.domain ? String(cfg.domain).replace(/\/+$/, '') : null;
  const bySlug = new Map();
  if (!base || !feed || !domain) return { base: null, bySlug };
  const targets = [];
  if (cfg.homeCountryCode) targets.push({ key: 'uae', cc: cfg.homeCountryCode });
  for (const m of await _mc().getMarketsForBrand(brand)) if (m.countryCode) targets.push({ key: m.key, cc: m.countryCode });
  const failed = [];
  // ≤3 feeds in flight — bursts trip the sites' CDN rate limits (see page-registry).
  const queue = [...targets];
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      const url = `${domain}${feed.replace('{cc}', String(t.cc).toLowerCase())}`;
      try { for (const slug of await _fetchFeedSlugs(url)) if (!bySlug.has(slug)) bySlug.set(slug, t.key); }
      catch { failed.push(t.key); }
    }
  }));
  if (failed.length) console.warn(`[venueMarketMap/${brand}] feed unreachable for ${failed.join(', ')} — those venues fall back to URL tokens`);
  return { base, bySlug };
}

// { base, bySlug: Map(slug → marketKey) } for a brand. Cached per warm function
// instance (10 min) so per-row callers (market-traffic, rank tracker) fetch it once.
async function venueMarketMap(brand) {
  const hit = _venueMaps.get(brand);
  if (hit && (Date.now() - hit.at) < VENUE_MAP_TTL) return hit.promise;
  const promise = _buildVenueMap(brand).catch(() => ({ base: null, bySlug: new Map() }));
  _venueMaps.set(brand, { at: Date.now(), promise });
  return promise;
}

// SYNC: market key for a venue URL (/<base>/<slug>/), or null if not a known venue.
function venueMarketFor(url, vmap) {
  if (!vmap || !vmap.base || !vmap.bySlug || !vmap.bySlug.size) return null;
  const segs = String(url || '').replace(/^https?:\/\/[^\/]+/, '').split(/[?#]/)[0].toLowerCase().split('/').filter(Boolean);
  if (segs.length !== 2 || segs[0] !== vmap.base) return null;
  return vmap.bySlug.get(segs[1]) || null;
}

// SYNC: the one attribution rule for pre-fetched markets ({key: market} object or array)
// + venue map: known venue → its market; else URL-token match; else home ('uae').
function attributeUrlToMarket(url, markets, vmap) {
  const v = venueMarketFor(url, vmap);
  if (v) return v;
  const list = Array.isArray(markets) ? markets.map(m => [m.key, m]) : Object.entries(markets || {});
  for (const [key, m] of list) {
    if (urlMatchesTokens(url, getMarketPageTokens(m))) return key;
  }
  return 'uae';
}

// Attribute a URL to its market key for a brand, INCLUDING config-onboarded markets
// and venue pages whose market only the site's taxonomy knows.
async function marketForUrlAsync(url, brand) {
  const [list, vmap] = await Promise.all([_mc().getMarketsForBrand(brand), venueMarketMap(brand)]);
  return attributeUrlToMarket(url, list, vmap);
}

// UAE (home market) DataForSEO locations — ONE definition for every caller.
// SERP calls use Dubai city; Labs (country-level only) uses the UAE country code.
// ⚠ This was 21191 until v7.9.131 — that code is ARAGUA, VENEZUELA (verified against
// DataForSEO's free locations list 2026-10-20), so every UAE SERP call (competitor
// matrix, AI Overview) had been querying Venezuela. 1000013 = "Dubai,Dubai,United Arab Emirates".
const UAE_SERP_LOCATION_CODE    = 1000013;
const UAE_COUNTRY_LOCATION_CODE = 2784;
// Labs endpoints only accept country codes: map the UAE SERP (city) code to the country.
function labsLocationCode(code) {
  return (!code || code === UAE_SERP_LOCATION_CODE) ? UAE_COUNTRY_LOCATION_CODE : code;
}

// Flat map of marketKey → location_code for quick lookup by any function
const MARKET_LOCATION_CODES = Object.fromEntries(
  Object.entries(INTERNATIONAL_MARKETS).map(([key, m]) => [key, m.location_code])
);
// Also expose UAE as a base reference
MARKET_LOCATION_CODES['uae'] = UAE_SERP_LOCATION_CODE;
MARKET_LOCATION_CODES['uae_country'] = UAE_COUNTRY_LOCATION_CODE;

// City-hub targets for a market: groups the structured `venues` records by city.
// Returns [{ city, slug, marketKey, marketSlug, venues:[{name,city,type}] }]. This is
// the single source for city-hub generation — a hub is created per city, listing its
// venues (a `dark_kitchen` venue is pickup/delivery only → prose must not imply dine-in).
// Empty when a market has no `venues` (don't invent cities — rule 12 / anti-doorway).
function _groupCities(m, marketKey) {
  const vs = Array.isArray(m && m.venues) ? m.venues : [];
  const byCity = {};
  for (const v of vs) {
    if (!v || !v.city) continue;
    const slug = String(v.city).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!byCity[slug]) byCity[slug] = { city: v.city, slug, marketKey, marketSlug: m && m.marketSlug, venues: [] };
    byCity[slug].venues.push({ name: v.name, city: v.city, type: v.type || 'dine_in' });
  }
  return Object.values(byCity);
}

// SYNC — seed literal only (built-in markets). For a config-onboarded market or to
// see venue edits made in Settings, use citiesForMarketAsync (reads Blobs-merged).
function citiesForMarket(marketKey) {
  return _groupCities(INTERNATIONAL_MARKETS[marketKey], marketKey);
}

// ASYNC — reads the Blobs-MERGED market config (rule 12), so markets/venues added or
// edited via Settings are picked up with no code edit. Falls back to the seed literal.
async function citiesForMarketAsync(marketKey) {
  let m = null;
  try { m = await _mc().getMarket(marketKey); } catch { /* fall back to seed */ }
  return _groupCities(m || INTERNATIONAL_MARKETS[marketKey], marketKey);
}

// Group cities from an ALREADY-LOADED market record (e.g. one /api/config already has),
// so callers don't re-fetch or re-implement the grouping. Single source (rule 12).
function citiesFromMarketRecord(m) {
  return _groupCities(m, (m && (m.key || m.marketKey)) || '');
}

module.exports = {
  INTERNATIONAL_MARKETS,
  citiesForMarket,
  citiesForMarketAsync,
  citiesFromMarketRecord,
  MARKET_LOCATION_CODES,
  UAE_SERP_LOCATION_CODE,
  UAE_COUNTRY_LOCATION_CODE,
  labsLocationCode,
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
  venueMarketMap,
  venueMarketFor,
  attributeUrlToMarket,
};
