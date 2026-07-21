// netlify/functions/_lib/brands-config.js
// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for the operational brand layer (CLAUDE.md #12).
//
// One Blobs record per brand under `brandsConfig:<slug>` + an index
// `brandsConfig:index` (array of slugs). The code literals below are ONLY a
// seed/fallback so the platform boots with Pickl + Bonbird out of the box; the
// Blobs records win. A NEW brand (Southpour, Yolk, …) is added by writing ONE
// brandsConfig record via Settings → it then appears in every dropdown and every
// cron loop with ZERO code edits.
//
// This carries the OPERATIONAL config (domain, GSC property, WP env prefix, GBP
// ids, competitors, colour, flag, vertical). The VOICE config (menu, tone,
// positioning) still lives in `brandContext:<slug>` via _lib/brand.js — the two
// are linked by slug. getBrand() = operational; getBrandContext() = voice.
//
// Replaces: scheduler BRANDS literal, the `brand==='pickl'?eatpickl:bonbird`
// GSC-site ternary (~7 files), WP_PICKL/WP_BONBIRD prefix ternaries, GBP env
// maps, per-brand competitor/keyword seed lists, and the blind ['pickl','bonbird']
// cron iterations that CLAUDE.md #12 warns about.
// ─────────────────────────────────────────────────────────────────────────────

const { getStore } = require('@netlify/blobs');

// ── Vertical definitions ──────────────────────────────────────────────────────
// A brand's `vertical` drives keyword relevance so a café/corporate brand does
// NOT get burger/chicken keywords. keyword-discovery keys off this instead of the
// old hardcoded RELEVANT_ROOTS / OFF_MENU_DISHES / brandGenericSeeds food lists.
//   relevantRoots : positive allowlist. EMPTY = no hard category gate (rely on
//                   brand terms + the Claude filter) — right for corporate.
//   offMenu       : disqualifying terms (wrong category / competitor types).
//   promptNoun    : how the Claude relevance filter frames the business.
//   seeds(label)  : generic per-market seed keywords for this vertical.
//   menuSummary   : fallback menu description when brandContext has none.
const VERTICALS = {
  restaurant: {
    promptNoun: 'restaurant',
    menuSummary: 'burgers, fried chicken and fast food',
    relevantRoots: [
      'burger', 'cheeseburger', 'hamburger', 'smash', 'patty', 'beef',
      'chicken', 'fried chicken', 'crispy chicken', 'broaster', 'nugget', 'tender', 'wing',
      'sando', 'sandwich', 'wrap', 'fries', 'shake', 'hot dog', 'meal', 'combo',
      'fast food', 'fast-food', 'halal food', 'plant based', 'plant-based', 'impossible burger',
      'restaurant', 'delivery', 'dine', 'takeaway', 'takeout', 'near me',
      // Arabic / Urdu food roots
      'برغر', 'برجر', 'دجاج', 'ساندويتش', 'مطعم', 'وجبات', 'توصيل', 'فرايز',
    ],
    offMenu: [
      'butter chicken', 'biryani', 'kebab', 'shawarma', 'pizza', 'pasta',
      'sushi', 'tacos', 'burritos', 'noodles', 'ramen', 'dumplings', 'curry',
      'tikka', 'kung pao', 'steak', 'lamb chops', 'hummus', 'falafel',
      'cheesecake', 'bakery', 'cake', 'dessert shop',
      'coffee', 'cappuccino', 'latte', 'espresso', 'starbucks',
      'قهوة', 'كافيه', 'ستاربكس',
    ],
    seeds: (label) => [
      `best burger in ${label}`, `burger restaurant ${label}`, `smash burger ${label}`,
      `best fried chicken in ${label}`, `fried chicken restaurant ${label}`, `crispy chicken ${label}`,
    ],
  },
  cafe: {
    promptNoun: 'café / coffee shop',
    menuSummary: 'specialty coffee, espresso drinks, pastries and brunch',
    relevantRoots: [
      'coffee', 'cafe', 'café', 'espresso', 'latte', 'cappuccino', 'flat white',
      'americano', 'cortado', 'macchiato', 'mocha', 'cold brew', 'iced coffee',
      'matcha', 'tea', 'chai', 'pastry', 'croissant', 'bakery', 'cake', 'brunch',
      'breakfast', 'dessert', 'roastery', 'beans', 'specialty coffee', 'barista',
      'coffee shop', 'delivery', 'near me', 'takeaway',
      // Arabic
      'قهوة', 'كافيه', 'مقهى', 'إسبريسو', 'لاتيه', 'كابتشينو', 'فطور', 'حلويات',
    ],
    offMenu: [
      'burger', 'fried chicken', 'shawarma', 'biryani', 'pizza', 'kebab',
      'sushi', 'steak', 'butter chicken', 'nuggets', 'hot dog',
    ],
    seeds: (label) => [
      `best coffee in ${label}`, `coffee shop ${label}`, `specialty coffee ${label}`,
      `best cafe ${label}`, `brunch ${label}`, `breakfast ${label}`,
    ],
  },
  corporate: {
    promptNoun: 'corporate brand / restaurant group',
    menuSummary: 'a hospitality group and its portfolio of brands',
    // No hard category gate — corporate visibility is brand/company + intent
    // driven (careers, franchise, investors, about). Rely on brand terms + Claude.
    relevantRoots: [],
    offMenu: [],
    seeds: (label) => [
      `restaurant group ${label}`, `hospitality group ${label}`, `franchise opportunities ${label}`,
      `careers ${label}`, `about the company ${label}`,
    ],
  },
};

function getVertical(name) {
  return VERTICALS[name] || VERTICALS.restaurant;
}

// ── Seed brand records (fallback only — Blobs wins) ───────────────────────────
const BRAND_SEED = {
  pickl: {
    slug:          'pickl',
    name:          'Pickl',
    vertical:      'restaurant',
    active:        true,
    domain:        'https://eatpickl.com',
    ownDomain:     'eatpickl.com',
    gscProperty:   'https://eatpickl.com/',        // canonical GSC siteUrl (API + cache key)
    wpEnvPrefix:   'WP_PICKL',                      // → WP_PICKL_BASE / _USER / _APP_PASS
    gbpAccountEnv: 'GBP_PICKL_ACCOUNT_ID',
    gbpLocationEnv:'GBP_PICKL_LOCATION_ID',
    color:         '#185FA5',
    flag:          '🟡',
    cuisine:       'smash burgers',
    tone:          'bold, casual-premium, Dubai-cool',
    brandedTerms:  ['pickle', 'pickles', 'بيكل', 'بكل', 'بيكلز', 'بيك'],
    // for LLM-mention / AI-overview / digest branded-query detection (broad on purpose)
    brandTerms:    ['pickl', 'pickle', 'pickel', 'pikle', 'pickels', 'pickls', 'بيكل', 'بكلز', 'بيكلز'],
    competitors: [
      { name: 'Salt',        domain: 'saltuae.com'    },
      { name: 'High Joint',  domain: 'highjoint.co'   },
      { name: 'Shake Shack', domain: 'shakeshack.com' },
      { name: 'Five Guys',   domain: 'fiveguys.ae'    },
    ],
    keywordSeeds: [
      'smash burger', 'double smash burger', 'chicken sandwich',
      'smash burger dubai', 'best burger dubai', 'chicken sando',
      'cheese burger dubai', 'burger delivery dubai',
    ],
  },
  bonbird: {
    slug:          'bonbird',
    name:          'Bonbird',
    vertical:      'restaurant',
    active:        true,
    domain:        'https://bonbirdchicken.com',
    ownDomain:     'bonbirdchicken.com',
    gscProperty:   'sc-domain:bonbirdchicken.com',  // canonical (majority of files + gsc-data cache)
    wpEnvPrefix:   'WP_BONBIRD',
    gbpAccountEnv: 'GBP_BONBIRD_ACCOUNT_ID',
    gbpLocationEnv:'GBP_BONBIRD_LOCATION_ID',
    color:         '#D85A30',
    flag:          '🔴',
    cuisine:       'halal fried chicken',
    tone:          'warm, family-friendly, UAE-local',
    brandedTerms:  ['bon bird', 'بونبيرد', 'بون بيرد'],
    brandTerms:    ['bonbird', 'bon bird'],
    competitors: [
      { name: "Raising Cane's",     domain: 'raisingcanes.com'    },
      { name: 'Jailbird',           domain: 'jailbirddubai.com'   },
      { name: "Dave's Hot Chicken", domain: 'daveshotchicken.com' },
      { name: 'Toit',               domain: 'toitchicken.com'     },
      { name: 'Nash Hot Chicken',   domain: 'nashhotchicken.com'  },
      { name: 'Peppers',            domain: 'peppersuae.com'      },
      { name: 'Jollibee',           domain: 'jollibee.com.ph'     },
      { name: 'KFC',                domain: 'kfc.com'             },
      { name: 'Popeyes',            domain: 'popeyes.com'         },
    ],
    keywordSeeds: [
      'fried chicken', 'crispy fried chicken', 'chicken sandwich',
      'bone in chicken', 'chicken rice bowl', 'chicken tenders',
      'fresh fried chicken dubai', 'fried chicken delivery dubai',
    ],
  },
};

const INDEX_KEY = 'brandsConfig:index';
const RECORD_KEY = slug => `brandsConfig:${slug}`;

function store() {
  return getStore({
    name: 'seo-tool',
    consistency: 'strong',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_AUTH_TOKEN,
  });
}

// ── Module-scope cache (warm container reuse) with short TTL ───────────────────
// Netlify reuses the module between invocations. A 60s TTL means a newly onboarded
// brand appears everywhere within a minute without a redeploy.
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL = 60 * 1000;

function _normalize(rec) {
  if (!rec || !rec.slug) return null;
  const seed = BRAND_SEED[rec.slug] || {};
  const merged = { ...seed, ...rec };
  // Derive sensible defaults for anything a minimal onboarding record omits.
  if (!merged.name)        merged.name = merged.slug.charAt(0).toUpperCase() + merged.slug.slice(1);
  if (!merged.vertical)    merged.vertical = 'restaurant';
  if (merged.active === undefined) merged.active = true;
  if (!merged.ownDomain && merged.domain) merged.ownDomain = String(merged.domain).replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!merged.gscProperty && merged.domain) merged.gscProperty = merged.domain.replace(/\/?$/, '/');
  if (!merged.wpEnvPrefix)   merged.wpEnvPrefix = `WP_${merged.slug.toUpperCase()}`;
  if (!merged.gbpAccountEnv) merged.gbpAccountEnv = `GBP_${merged.slug.toUpperCase()}_ACCOUNT_ID`;
  if (!merged.gbpLocationEnv)merged.gbpLocationEnv = `GBP_${merged.slug.toUpperCase()}_LOCATION_ID`;
  if (!merged.color)         merged.color = '#64748b';
  if (!merged.flag)          merged.flag = '🏳️';
  if (!Array.isArray(merged.brandedTerms)) merged.brandedTerms = [];
  if (!Array.isArray(merged.brandTerms))   merged.brandTerms = [merged.slug, merged.name.toLowerCase()];
  if (!Array.isArray(merged.competitors))  merged.competitors = [];
  if (!Array.isArray(merged.keywordSeeds)) merged.keywordSeeds = [];
  return merged;
}

// Read the full brand list. Blobs-first: index + per-slug records override the
// seed literals; seeds fill any gaps so Pickl/Bonbird always resolve even before
// their Blobs records exist.
async function _load() {
  if (_cache && (Date.now() - _cacheAt) < CACHE_TTL) return _cache;
  const s = store();
  let slugs = [];
  try {
    const idx = await s.get(INDEX_KEY, { type: 'json' });
    if (Array.isArray(idx)) slugs = idx;
  } catch { /* no index yet */ }
  // Union of seed slugs + index slugs so seeds are always present.
  const allSlugs = [...new Set([...Object.keys(BRAND_SEED), ...slugs])];
  const out = {};
  for (const slug of allSlugs) {
    let rec = null;
    try { rec = await s.get(RECORD_KEY(slug), { type: 'json' }); } catch { /* fall to seed */ }
    const normalized = _normalize(rec || BRAND_SEED[slug] || { slug });
    if (normalized) out[slug] = normalized;
  }
  _cache = out;
  _cacheAt = Date.now();
  return out;
}

function _bustCache() { _cache = null; _cacheAt = 0; }

// ── Public accessors ──────────────────────────────────────────────────────────

// All brand records (array). opts.activeOnly (default true) hides deactivated brands.
async function getBrands(opts = {}) {
  const activeOnly = opts.activeOnly !== false;
  const all = Object.values(await _load());
  return activeOnly ? all.filter(b => b.active !== false) : all;
}

// One brand record by slug (or null). Includes inactive brands.
async function getBrand(slug) {
  if (!slug) return null;
  const all = await _load();
  return all[slug] || null;
}

// Slugs only (for cron iteration). Replaces every hardcoded ['pickl','bonbird'].
async function getBrandSlugs(opts = {}) {
  return (await getBrands(opts)).map(b => b.slug);
}

// Write ONE brand record (onboarding / Settings edit) + keep the index in sync.
async function setBrand(record) {
  if (!record || !record.slug) throw new Error('brand record requires a slug');
  const s = store();
  await s.setJSON(RECORD_KEY(record.slug), record);
  let idx = [];
  try { const cur = await s.get(INDEX_KEY, { type: 'json' }); if (Array.isArray(cur)) idx = cur; } catch {}
  if (!idx.includes(record.slug)) { idx.push(record.slug); await s.setJSON(INDEX_KEY, idx); }
  _bustCache();
  return _normalize(record);
}

async function deleteBrand(slug) {
  const s = store();
  await s.delete(RECORD_KEY(slug)).catch(() => {});
  let idx = [];
  try { const cur = await s.get(INDEX_KEY, { type: 'json' }); if (Array.isArray(cur)) idx = cur; } catch {}
  idx = idx.filter(x => x !== slug);
  await s.setJSON(INDEX_KEY, idx);
  _bustCache();
}

// ── Resolver helpers (kill the ternaries) ─────────────────────────────────────

// Canonical GSC property string for a brand — used for BOTH the GSC API call and
// the gscCache:<property> blob key, so they can never diverge (the old bug where
// bonbird was 'sc-domain:' in some files and 'https://' in others).
async function gscPropertyFor(slug) {
  const b = await getBrand(slug);
  return b ? b.gscProperty : null;
}

async function ownDomainFor(slug) {
  const b = await getBrand(slug);
  return b ? b.ownDomain : null;
}

// WordPress credentials from the brand's env prefix (names come from config; the
// env-var VALUES stay in Netlify env). Works for a market object (wpBrand) too.
async function wpCredentialsFor(slug) {
  const b = await getBrand(slug);
  const prefix = b ? b.wpEnvPrefix : `WP_${String(slug).toUpperCase()}`;
  return {
    base: process.env[`${prefix}_BASE`],
    user: process.env[`${prefix}_USER`],
    pass: process.env[`${prefix}_APP_PASS`],
  };
}

// GBP account/location ids from the brand's configured env-var names.
async function gbpIdsFor(slug) {
  const b = await getBrand(slug);
  if (!b) return null;
  const acc = process.env[b.gbpAccountEnv];
  const loc = process.env[b.gbpLocationEnv];
  return (acc && loc) ? { accountId: acc, locationId: loc } : null;
}

// The vertical relevance config for a brand (keyword-discovery vertical adaptation).
async function relevanceConfigFor(slug) {
  const b = await getBrand(slug);
  return getVertical(b ? b.vertical : 'restaurant');
}

module.exports = {
  BRAND_SEED, VERTICALS, getVertical,
  getBrands, getBrand, getBrandSlugs, setBrand, deleteBrand,
  gscPropertyFor, ownDomainFor, wpCredentialsFor, gbpIdsFor, relevanceConfigFor,
  _bustCache,
};
