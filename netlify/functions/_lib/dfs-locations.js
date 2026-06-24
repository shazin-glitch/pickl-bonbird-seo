// netlify/functions/_lib/dfs-locations.js
// Resolves a country -> DataForSEO location_code from the authoritative list cached
// by dataforseo-locations.js (Blobs key `dfsLocations`). Used by every DataForSEO
// caller so codes are never hand-entered/guessed per market.
//
// SAFE: if the cache is missing or the country isn't found, returns `fallback`
// (the market's configured code) — so it can only improve accuracy, never break.

const { getStore } = require('@netlify/blobs');

function store() {
  return getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
}

// resolveLocation(country, isoCode?) -> full record so callers know the supported
// languages AND whether the market is in DataForSEO Labs at all.
//   { code, languages, supported, inCache }
//   - inCache=false  → the authoritative list hasn't been fetched yet (caller should
//                      fall back to its config code; don't treat as "unsupported")
//   - supported=false → list IS cached but this country is NOT in Labs (e.g. Qatar,
//                       Oman) → caller should SKIP Labs calls gracefully, not POST
//                       an invalid code.
async function resolveLocation(country, isoCode = null) {
  try {
    const map = await store().get('dfsLocations', { type: 'json' });
    if (!map) return { code: null, languages: [], supported: null, inCache: false };
    const rec = (country && map.byName && map.byName[String(country).toLowerCase()])
             || (isoCode && map.byIso && map.byIso[String(isoCode).toLowerCase()])
             || null;
    if (rec && rec.code) return { code: rec.code, languages: rec.languages || [], supported: true, inCache: true };
    return { code: null, languages: [], supported: false, inCache: true };
  } catch {
    return { code: null, languages: [], supported: null, inCache: false };
  }
}

// Back-compat: resolveLocationCode(countryName, fallbackCode, isoCode?) -> number
async function resolveLocationCode(country, fallback = null, isoCode = null) {
  const r = await resolveLocation(country, isoCode);
  return (r.code != null) ? r.code : fallback;
}

module.exports = { resolveLocation, resolveLocationCode };
