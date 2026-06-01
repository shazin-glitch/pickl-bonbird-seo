// netlify/functions/gbp-data.js
// Fetches Google Business Profile location health data.
// Uses My Business Account Management API + My Business Business Information API.
//
// GET /api/gbp-data?brand=pickl   — returns location health for brand
// Returns { notConnected: true } if gbpTokens not in Blobs.

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
  const brandDomain = brand === 'pickl' ? 'eatpickl.com' : 'bonbirdchicken.com';

  const store = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });

  // Check for GBP tokens
  let tokens;
  try {
    tokens = await store.get('gbpTokens', { type: 'json' });
  } catch { tokens = null; }

  if (!tokens?.access_token) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ notConnected: true }) };
  }

  // Check cache
  const cacheKey = `gbpCache:${brand}:v2`;
  try {
    const cached = await store.get(cacheKey, { type: 'json' });
    if (cached && cached.cachedAt && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify(cached) };
    }
  } catch { /* cache miss */ }

  // Refresh token if needed
  let accessToken = tokens.access_token;
  if (tokens.refresh_token && tokens.expires_at && Date.now() > tokens.expires_at - 60000) {
    try {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: tokens.refresh_token,
          grant_type:    'refresh_token',
        }),
      });
      const refreshData = await refreshRes.json();
      if (refreshData.access_token) {
        accessToken = refreshData.access_token;
        await store.set('gbpTokens', JSON.stringify({
          ...tokens,
          access_token: accessToken,
          expires_at:   Date.now() + (refreshData.expires_in || 3600) * 1000,
        }));
      }
    } catch (e) {
      console.warn('[gbp-data] Token refresh failed:', e.message);
    }
  }

  const authHeader = `Bearer ${accessToken}`;

  try {
    // Step 1: Get accounts
    const accountsRes = await fetch(`${ACCOUNT_MGMT_BASE}/accounts`, {
      headers: { Authorization: authHeader },
    });
    const accountsData = await accountsRes.json();

    if (!accountsRes.ok) {
      console.error('[gbp-data] Accounts API error:', JSON.stringify(accountsData));
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: accountsData.error?.message || 'Failed to fetch accounts', notConnected: false }) };
    }

    const accounts = accountsData.accounts || [];
    if (!accounts.length) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ locations: [], reviews: [], reviewsApiPending: true, cachedAt: Date.now() }) };
    }

    // Step 2: Get locations across all accounts
    const allLocations = [];
    for (const account of accounts.slice(0, 5)) { // max 5 accounts
      try {
        const locRes = await fetch(
          `${BIZ_INFO_BASE}/${account.name}/locations?readMask=name,title,storefrontAddress,regularHours,metadata,profile,phoneNumbers&pageSize=100`,
          { headers: { Authorization: authHeader } }
        );
        const locData = await locRes.json();
        for (const loc of locData.locations || []) {
          allLocations.push(parseLocation(loc, account.name));
        }
      } catch (e) {
        console.warn('[gbp-data] Location fetch failed for account', account.name, ':', e.message);
      }
    }

    // Step 3: Try to get review summary (may fail if Reviews API not yet approved)
    let reviews = [];
    let reviewsApiPending = true;
    // Reviews will be fetched by gbp-reviews.js once API is approved

    const result = {
      brand,
      locations: allLocations,
      reviews,
      reviewsApiPending,
      cachedAt: Date.now(),
    };

    // Save to cache
    await store.set(cacheKey, JSON.stringify(result)).catch(() => {});

    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };

  } catch (err) {
    console.error('[gbp-data] Error:', err.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: err.message, locations: [], reviews: [], reviewsApiPending: true, cachedAt: Date.now() }) };
  }
};

function parseLocation(loc, accountName) {
  const address = [
    loc.storefrontAddress?.addressLines?.[0],
    loc.storefrontAddress?.locality,
    loc.storefrontAddress?.regionCode,
  ].filter(Boolean).join(', ');

  const rating       = loc.metadata?.mapsUri ? null : null; // rating comes from reviews API
  const hasHours     = !!(loc.regularHours?.periods?.length);
  const photoCount   = null; // requires Media API call

  // Determine health
  let health = 'green';
  const flags = [];

  if (!hasHours) { flags.push('No hours set'); health = 'amber'; }
  if (!loc.profile?.description) { flags.push('No description'); health = 'amber'; }
  if (!loc.phoneNumbers?.primaryPhone) { flags.push('No phone'); health = 'amber'; }

  return {
    id:             loc.name,
    accountName,
    name:           loc.title || 'Location',
    address,
    rating,
    totalReviews:   null, // populated by reviews API
    unansweredReviews: 0,
    hasHours,
    photoCount,
    health,
    flags,
    googleMapsUri:  loc.metadata?.mapsUri || null,
  };
}
