// netlify/functions/dataforseo-locations.js
// Fetches DataForSEO's AUTHORITATIVE location list (the source of truth for which
// location_code to send) and caches a country -> {code, iso, languages} map in
// Blobs `dfsLocations`. The resolver (_lib/dfs-locations) reads this so EVERY
// market — current or future — resolves its location_code by country name instead
// of a hand-entered number that can be wrong (e.g. Qatar was 179 = invalid).
//
// Covers ALL countries DataForSEO Labs supports, so any brand/market plugged in
// later is automatically accounted for.
//
// Trigger: GET /.netlify/functions/dataforseo-locations        (uses cache if present)
//          GET /.netlify/functions/dataforseo-locations?refresh=true   (refetch)

const { getStore } = require('@netlify/blobs');
const { INTERNATIONAL_MARKETS } = require('./_lib/international-config');

const DFS = 'https://api.dataforseo.com/v3';

function authHeader() {
  return 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
}
function store() {
  return getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
}

exports.handler = async (event) => {
  const s = store();
  const refresh = (event.queryStringParameters || {}).refresh === 'true';

  let map = await s.get('dfsLocations', { type: 'json' }).catch(() => null);

  if (!map || refresh) {
    // Labs locations_and_languages = exactly the set keyword_ideas / ranked_keywords accept.
    const res  = await fetch(`${DFS}/dataforseo_labs/locations_and_languages`, { headers: { Authorization: authHeader() } });
    const data = await res.json();
    if (data.status_code !== 20000) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: `DataForSEO ${data.status_code}: ${data.status_message}` }) };
    }
    const items = data.tasks?.[0]?.result || [];
    map = { byName: {}, byIso: {}, fetchedAt: Date.now(), count: 0 };
    for (const it of items) {
      // Country-level only: location_type 'Country', or a name with no comma
      // (cities/regions are "City,Region,Country").
      const isCountry = it.location_type === 'Country' || (it.location_name && !it.location_name.includes(','));
      if (!isCountry || !it.location_code) continue;
      const languages = (it.available_languages || [])
        .map(l => l.language_code || l.language_name).filter(Boolean);
      const rec = { code: it.location_code, iso: it.country_iso_code || null, languages };
      if (it.location_name)      map.byName[it.location_name.toLowerCase()] = rec;
      if (it.country_iso_code)   map.byIso[it.country_iso_code.toLowerCase()] = rec;
      map.count++;
    }
    // Diagnostic: did Gulf countries appear in the RAW response at all (before any filter)?
    map._rawCount = items.length;
    map._gulfRaw  = items
      .filter(i => /qatar|oman|bahrain|kuwait|saudi|emirate|jordan/i.test(i.location_name || ''))
      .map(i => ({ name: i.location_name, code: i.location_code, type: i.location_type }));
    if (!map.count) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'No country-level locations parsed from DataForSEO response', rawCount: items.length }) };
    }
    await s.set('dfsLocations', JSON.stringify(map));
  }

  // Verification: configured (in our market config) vs authoritative (DataForSEO).
  const markets = {};
  const seen = new Set();
  for (const m of Object.values(INTERNATIONAL_MARKETS)) {
    if (seen.has(m.label)) continue;
    seen.add(m.label);
    const rec = map.byName[m.label.toLowerCase()];
    markets[m.label] = {
      configured:    m.location_code,
      authoritative: rec?.code || 'NOT FOUND',
      match:         rec?.code === m.location_code,
      languages:     rec?.languages || [],
    };
  }
  markets['UAE'] = { authoritative: map.byName['united arab emirates']?.code || 'NOT FOUND' };

  return { statusCode: 200, body: JSON.stringify({
    ok: true,
    countriesCached: map.count,
    rawCount: map._rawCount,                 // total items in raw API response (only on ?refresh=true)
    gulfRaw: map._gulfRaw,                    // raw Gulf/Jordan matches (only on ?refresh=true)
    allCountries: Object.keys(map.byName).sort(),
    fetchedAt: map.fetchedAt,
    markets,
  }, null, 2) };
};
