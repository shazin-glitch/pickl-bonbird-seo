// netlify/functions/_lib/markets-config.js
// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for SEO MARKETS (the markets analog of brands-config.js).
//
// SCOPE: SEO ONLY. This is the config for the international SEO pipeline — the
// markets where we do keyword discovery, competitor tracking, intl content and
// rank/traffic reporting (the INTERNATIONAL_MARKETS analog). It deliberately does
// NOT touch the content calendar / SocialPilot (that's the content team's separate
// domain — CAL_MARKETS, SP_ACCOUNTS, MARKET_TIMEZONES live with the calendar and
// are NOT managed here).
//
// ONE record per SEO market, keyed `<brand>_<marketKey>` (e.g. pickl_bahrain).
// Folds in the SEO-side "add a market" fields that used to be scattered:
// INTERNATIONAL_MARKETS + MARKET_LOCATIONS (DataForSEO code) + MARKET_KEYWORD_TERMS
// (city disambiguation). So onboarding an SEO market = ONE record, ZERO code edits.
//
// UAE is the implicit HOME market — deliberately NOT a record here (matches the
// existing getMarketsForBrand semantics: it returns intl markets only; UAE is the
// fallback via international-config.marketForUrl).
//
// Blobs-first (marketsConfig:index + marketsConfig:<key>), code literals = seed/fallback.
// ─────────────────────────────────────────────────────────────────────────────

const { getStore } = require('@netlify/blobs');
const { INTERNATIONAL_MARKETS } = require('./international-config');

// City-disambiguation terms per marketKey (was MARKET_KEYWORD_TERMS in
// international-seo-background) — an SEO keyword-filtering concern, so it lives here.
const KEYWORD_TERMS = {
  bahrain:  ['bahrain', 'manama'],
  ksa:      ['saudi', 'riyadh', 'jeddah', 'ksa'],
  qatar:    ['qatar', 'doha', 'lusail'],
  egypt:    ['egypt', 'cairo'],
  jordan:   ['jordan', 'amman'],
  oman:     ['oman', 'muscat'],
  pakistan: ['pakistan', 'karachi', 'lahore', 'islamabad'],
};

// ── Build the seed record set from INTERNATIONAL_MARKETS (SEO markets only) ────
function buildSeed() {
  const out = {};
  for (const [key, m] of Object.entries(INTERNATIONAL_MARKETS)) {
    out[key] = {
      ...m,
      key,
      active: true,
      keywordTerms: KEYWORD_TERMS[m.marketKey] || [],
    };
  }
  return out;
}

const MARKET_SEED = buildSeed();

const INDEX_KEY = 'marketsConfig:index';
const RECORD_KEY = key => `marketsConfig:${key}`;

function store() {
  return getStore({ name: 'seo-tool', consistency: 'strong', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
}

let _cache = null, _cacheAt = 0;
const CACHE_TTL = 60 * 1000;

function _normalize(rec) {
  if (!rec || !rec.key) return null;
  const seed = MARKET_SEED[rec.key] || {};
  const m = { ...seed, ...rec };
  if (!m.brand && m.key.includes('_'))     m.brand = m.key.split('_')[0];
  m.wpBrand = m.wpBrand || m.brand;
  if (!m.marketKey && m.key.includes('_')) m.marketKey = m.key.split('_').slice(1).join('_');
  if (!m.label)  m.label = m.marketKey ? m.marketKey.toUpperCase() : m.key;
  if (!m.flag)   m.flag = '🏳️';
  if (m.active === undefined) m.active = true;
  if (!Array.isArray(m.languages)) m.languages = ['en'];
  if (!Array.isArray(m.keywordTerms)) m.keywordTerms = KEYWORD_TERMS[m.marketKey] || [];
  if (!m.marketSlug) m.marketSlug = m.marketKey;
  return m;
}

async function _load() {
  if (_cache && (Date.now() - _cacheAt) < CACHE_TTL) return _cache;
  const s = store();
  let keys = [];
  try { const idx = await s.get(INDEX_KEY, { type: 'json' }); if (Array.isArray(idx)) keys = idx; } catch {}
  const allKeys = [...new Set([...Object.keys(MARKET_SEED), ...keys])];
  const out = {};
  for (const key of allKeys) {
    let rec = null;
    try { rec = await s.get(RECORD_KEY(key), { type: 'json' }); } catch {}
    const n = _normalize(rec || MARKET_SEED[key] || { key });
    if (n) out[key] = n;
  }
  _cache = out; _cacheAt = Date.now();
  return out;
}

function _bustCache() { _cache = null; _cacheAt = 0; }

// ── Public accessors (SEO markets) ────────────────────────────────────────────

async function getMarkets(opts = {}) {
  const activeOnly = opts.activeOnly !== false;
  const all = Object.values(await _load());
  return activeOnly ? all.filter(m => m.active !== false) : all;
}

async function getMarket(key) {
  if (!key) return null;
  return (await _load())[key] || null;
}

// Intl SEO markets for a brand (UAE home is NOT included — matches legacy behaviour).
async function getMarketsForBrand(brand, opts = {}) {
  return (await getMarkets(opts)).filter(m => m.brand === brand);
}

// Object keyed by market key (drop-in for the old INTERNATIONAL_MARKETS literal).
async function getMarketsMap(opts = {}) {
  const out = {};
  for (const m of await getMarkets(opts)) out[m.key] = m;
  return out;
}

async function setMarket(record) {
  if (!record) throw new Error('market record required');
  if (!record.key && record.brand && record.marketKey) record.key = `${record.brand}_${record.marketKey}`;
  if (!record.key) throw new Error('market record requires a key (or brand + marketKey)');
  const s = store();
  await s.setJSON(RECORD_KEY(record.key), record);
  let idx = [];
  try { const cur = await s.get(INDEX_KEY, { type: 'json' }); if (Array.isArray(cur)) idx = cur; } catch {}
  if (!idx.includes(record.key)) { idx.push(record.key); await s.setJSON(INDEX_KEY, idx); }
  _bustCache();
  return _normalize(record);
}

async function deleteMarket(key) {
  const s = store();
  await s.delete(RECORD_KEY(key)).catch(() => {});
  let idx = [];
  try { const cur = await s.get(INDEX_KEY, { type: 'json' }); if (Array.isArray(cur)) idx = cur; } catch {}
  idx = idx.filter(x => x !== key);
  await s.setJSON(INDEX_KEY, idx);
  _bustCache();
}

// Flat marketKey → location_code (+ UAE home base), like the old MARKET_LOCATION_CODES.
async function getLocationCodes() {
  const out = { uae: 21191, uae_country: 2784 };
  for (const m of await getMarkets()) if (m.location_code) out[m.marketKey] = m.location_code;
  return out;
}

module.exports = {
  MARKET_SEED, buildSeed,
  getMarkets, getMarket, getMarketsForBrand, getMarketsMap,
  setMarket, deleteMarket, getLocationCodes,
  _bustCache,
};
