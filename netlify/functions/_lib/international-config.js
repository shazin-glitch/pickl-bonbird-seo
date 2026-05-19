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
    // DataForSEO
    location_code:   17000,
    currency:        'BHD',
    // Confirmed locations
    locations:       ['Al Aali Mall', 'Juffair Square'],
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
      'Reference Al Aali Mall and Juffair Square locations specifically',
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
      'Pickl has award-winning credentials (Time Out Dubai Best Burger) — use this',
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
    locations:       ['Lusail Boulevard, Doha'],
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
    locations:       [
      'Urban Lanes', 'Madinaty', 'Park St East',
      'Park Street West', 'Hyde Park',
    ],
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
    location_code:   2144,
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
    locations:       ['Souq Al Madina', 'Al Hail'],
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
    locations:       [],                  // confirm with Shazin
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
      'NOTE: Confirm Oman Bonbird locations before publishing location content',
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
    locations:       [],                  // confirm with Shazin
    seedKeywords: {
      en: [
        'fried chicken karachi', 'best fried chicken pakistan', 'crispy chicken lahore',
        'chicken restaurant karachi', 'fried chicken delivery pakistan',
        'halal fried chicken karachi', 'chicken tenders pakistan', 'best chicken pakistan',
        'crispy chicken burger pakistan', 'bonbird pakistan', 'best burger karachi',
        'chicken wrap pakistan', 'fried chicken lahore', 'crispy chicken islamabad',
      ],
    },
    culturalNotes: [
      'Pakistan is a massive fried chicken market — KFC, Hardees, local brands all strong',
      'Price-conscious audience — value positioning matters alongside quality',
      'Karachi and Lahore are primary cities — reference specifically if locations confirmed',
      'Halal is assumed — lead with freshness and flavour variety (spice system)',
      'Bonbird spice system (Plain Jane to XXX) is a strong hook for Pakistani audience',
      'Family bucket meals extremely popular — emphasise Bone-In bucket deals',
      'Food delivery dominant — Foodpanda, Careem Food — mention delivery',
      'NOTE: Confirm Pakistan city/locations with Shazin before publishing',
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
    locations:       [],                  // confirm with Shazin
    seedKeywords: {
      en: [
        'fried chicken doha', 'best fried chicken qatar', 'crispy chicken doha',
        'chicken restaurant doha', 'fried chicken delivery doha',
        'halal fried chicken qatar', 'chicken tenders doha', 'best chicken qatar',
        'crispy chicken burger doha', 'bonbird qatar', 'chicken wrap doha',
        'bone in chicken doha',
      ],
      ar: [
        'دجاج مقلي الدوحة', 'أفضل دجاج في قطر', 'دجاج مقرمش الدوحة',
        'مطعم دجاج الدوحة', 'توصيل دجاج الدوحة', 'دجاج حلال قطر',
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

// Returns the correct WP env vars for a market — single WP instance per brand
function getWpCredentials(market) {
  const prefix = market.wpBrand === 'pickl' ? 'WP_PICKL' : 'WP_BONBIRD';
  return {
    base: process.env[`${prefix}_BASE`],
    user: process.env[`${prefix}_USER`],
    pass: process.env[`${prefix}_APP_PASS`],
  };
}

// Build the full target URL for a post/page
function buildPostUrl(market, type, slug, language = 'en') {
  const isArabic   = language === 'ar';
  const baseSlug   = isArabic && market.arabicSlug ? market.arabicSlug : market.marketSlug;
  const brand      = market.wpBrand === 'pickl' ? 'https://eatpickl.com' : 'https://bonbirdchicken.com';

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

// Build Claude prompt context for a market
function buildMarketPrompt(market, brandCtx, language = 'en') {
  const isArabic = language === 'ar';
  return `
=== INTERNATIONAL MARKET CONTEXT ===
Brand: ${market.brand === 'pickl' ? 'Pickl' : 'Bonbird'}
Market: ${market.label} ${market.flag}
Language: ${isArabic ? 'Arabic (local dialect — NOT Modern Standard Arabic)' : 'English'}
Market page: ${buildPostUrl(market, 'page', '', language).replace(/\/$/, '')}
Journal URL pattern: ${buildPostUrl(market, 'blog_draft', '<post-slug>', language)}
Currency: ${market.currency}
${market.isNew ? '⚡ NEW MARKET — just opened May 2026. Content should celebrate the opening and drive first-visit traffic.' : ''}

CONFIRMED LOCATIONS IN THIS MARKET:
${market.locations.length > 0 ? market.locations.join(', ') : 'Locations TBC — do NOT invent or guess location names in content'}

TARGET KEYWORDS (${language.toUpperCase()}):
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

module.exports = {
  INTERNATIONAL_MARKETS,
  getMarketsForBrand,
  getAllMarketKeys,
  getMarket,
  getWpCredentials,
  buildPostUrl,
  buildMarketPrompt,
};
