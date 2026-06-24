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

// resolveLocationCode(countryName, fallbackCode, isoCode?) -> number
async function resolveLocationCode(country, fallback = null, isoCode = null) {
  try {
    const map = await store().get('dfsLocations', { type: 'json' });
    if (map) {
      const byName = country && map.byName && map.byName[String(country).toLowerCase()];
      if (byName && byName.code) return byName.code;
      const byIso = isoCode && map.byIso && map.byIso[String(isoCode).toLowerCase()];
      if (byIso && byIso.code) return byIso.code;
    }
  } catch { /* fall through to fallback */ }
  return fallback;
}

module.exports = { resolveLocationCode };
