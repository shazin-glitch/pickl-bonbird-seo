// netlify/functions/gbp-data.js
// Fetches Google Business Profile location health data.
//
// Flow:
//   1. Account Management API → list accounts
//   2. Account Management API → list locations under each account
//   3. Business Information API → get details per location (name, address, hours, etc.)

const { getStore } = require('@netlify/blobs');

const ACCOUNT_MGMT_BASE = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const BIZ_INFO_BASE     = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const CACHE_TTL_MS      = 6 * 60 * 60 * 1000; // 6 hours

const CORS = {
  'Content-Type':                'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  const brand = event.queryStringParameters?.brand || 'pickl';

  const store = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });

  // Check for GBP tokens
  let tokens;
  try { tokens = await store.get('gbpTokens', { type: 'json' }); } catch { tokens = null; }

  if (!tokens?.access_token) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ notConnected: true }) };
  }

  // Check cache (v4 key — v3 cached unfiltered all-brand locations)
  const cacheKey = `gbpCache:${brand}:v4`;
  try {
    const cached = await store.get(cacheKey, { type: 'json' });
    if (cached?.cachedAt && (Date.now() - cached.cachedAt) < CACHE_TTL_MS && cached.locations) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify(cached) };
    }
  } catch { /* cache miss */ }

  // Refresh token if needed
  let accessToken = tokens.access_token;
  if (tokens.refresh_token && tokens.expires_at && Date.now() > tokens.expires_at - 60000) {
    try {
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: tokens.refresh_token,
          grant_type:    'refresh_token',
        }),
      });
      const rd = await r.json();
      if (rd.access_token) {
        accessToken = rd.access_token;
        await store.set('gbpTokens', JSON.stringify({ ...tokens, access_token: accessToken, expires_at: Date.now() + (rd.expires_in || 3600) * 1000 }));
      }
    } catch (e) { console.warn('[gbp-data] Token refresh failed:', e.message); }
  }

  const auth = `Bearer ${accessToken}`;

  try {
    // ── Step 1: List accounts ─────────────────────────────────────────────────
    const accountsRes  = await fetch(`${ACCOUNT_MGMT_BASE}/accounts`, { headers: { Authorization: auth } });
    const accountsData = await accountsRes.json();
    console.log('[gbp-data] Accounts response:', JSON.stringify(accountsData).slice(0, 300));

    if (!accountsRes.ok) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: accountsData.error?.message || 'Accounts API failed', locations: [], reviews: [], reviewsApiPending: true, cachedAt: Date.now() }) };
    }

    const accounts = accountsData.accounts || [];
    if (!accounts.length) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ locations: [], reviews: [], reviewsApiPending: true, cachedAt: Date.now(), debugNote: 'No accounts returned — check GBP account has locations' }) };
    }

    // ── Step 2: List locations via the BUSINESS INFORMATION API ───────────────
    // Locations are NOT in the Account Management API (that only has accounts +
    // admins). locations.list lives in Business Information and REQUIRES a
    // readMask or it returns 400 INVALID_ARGUMENT. The list response already
    // contains the full location objects, so no per-location detail call is
    // needed (saves N requests + quota).
    const readMask = 'name,title,storefrontAddress,phoneNumbers,websiteUri,regularHours,metadata,profile';
    const allLocations = [];
    let locError = null;
    for (const account of accounts.slice(0, 10)) {
      try {
        let pageToken = '';
        do {
          const url = `${BIZ_INFO_BASE}/${account.name}/locations?readMask=${encodeURIComponent(readMask)}&pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
          const locRes  = await fetch(url, { headers: { Authorization: auth } });
          const locData = await locRes.json();
          console.log(`[gbp-data] Locations for ${account.name}:`, JSON.stringify(locData).slice(0, 300));
          if (!locRes.ok) {
            locError = locData.error?.message || `Locations API failed (${locRes.status})`;
            break;
          }
          for (const loc of locData.locations || []) {
            allLocations.push(parseLocation(loc));
          }
          pageToken = locData.nextPageToken || '';
        } while (pageToken);
      } catch (e) {
        locError = e.message;
        console.warn('[gbp-data] Location list failed for', account.name, ':', e.message);
      }
    }

    // No locations AND an API error → surface the real reason (front-end shows it).
    if (!allLocations.length && locError) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: locError, locations: [], reviews: [], reviewsApiPending: true, cachedAt: Date.now() }) };
    }

    // Filter to the requested brand (locations tagged by name in parseLocation).
    const brandLocations = allLocations.filter(l => l.brand === brand);

    const result = {
      brand,
      locations: brandLocations,
      reviews: [],
      reviewsApiPending: true,
      cachedAt: Date.now(),
      ...(brandLocations.length ? {} : {
        debugNote: allLocations.length
          ? `Found ${allLocations.length} location(s) in this Google account, but none are named as "${brand}". Locations are matched to a brand by their listing name.`
          : `Connected to ${accounts.length} account(s) but found 0 locations. Make sure the Google account you connected manages the ${brand} listings.`,
      }),
    };

    // Only cache successful (non-empty) results so a transient failure doesn't
    // stick in cache for 6h.
    if (brandLocations.length) await store.set(cacheKey, JSON.stringify(result)).catch(() => {});

    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };

  } catch (err) {
    console.error('[gbp-data] Error:', err.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: err.message, locations: [], reviews: [], reviewsApiPending: true, cachedAt: Date.now() }) };
  }
};

function parseLocation(loc) {
  const address = [
    ...(loc.storefrontAddress?.addressLines || []),
    loc.storefrontAddress?.locality,
    loc.storefrontAddress?.administrativeArea,
  ].filter(Boolean).join(', ');

  const hasHours = !!(loc.regularHours?.periods?.length);
  const flags    = [];
  let health     = 'green';

  if (!hasHours)                           { flags.push('No hours set');      health = 'amber'; }
  if (!loc.profile?.description)           { flags.push('No description');    if (health === 'green') health = 'amber'; }
  if (!loc.phoneNumbers?.primaryPhone)     { flags.push('No phone number');   if (health === 'green') health = 'amber'; }

  // Infer brand from the listing title (both brands live under one Google
  // account, so the brand param can't filter at the API level). Used by the
  // handler to filter to the requested brand.
  const title = loc.title || loc.name?.split('/').pop() || 'Location';
  const tl    = title.toLowerCase();
  const brand = tl.includes('pickl') ? 'pickl' : tl.includes('bonbird') ? 'bonbird' : null;

  return {
    id:               loc.name,
    name:             title,
    brand,
    address,
    rating:           null, // from reviews API (pending approval)
    totalReviews:     null,
    unansweredReviews: 0,
    hasHours,
    photoCount:       null,
    health,
    flags,
    googleMapsUri:    loc.metadata?.mapsUri || null,
  };
}
