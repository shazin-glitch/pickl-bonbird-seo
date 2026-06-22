// netlify/functions/gbp-data.js
// Fetches GBP location health data + ratings/reviews via v4 API.
//
// Flow:
//   1. Account Management API  → list accounts
//   2. Business Information API → list locations (readMask — do NOT encodeURIComponent;
//      commas must be literal or the API returns empty objects)
//   3. v4 Reviews API           → per-location ratings + unanswered review queue
//      (graceful: if v4 not yet approved, returns reviewsApiPending:true)

const { getStore } = require('@netlify/blobs');

const ACCOUNT_MGMT_BASE = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const BIZ_INFO_BASE     = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const REVIEW_BASE       = 'https://mybusiness.googleapis.com/v4';
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

  // Cache v6 — bust v5 (was cached before Google My Business API v4 was enabled)
  const cacheKey = `gbpCache:${brand}:v6`;
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

    // ── Step 2: List locations via Business Information API ───────────────────
    // IMPORTANT: readMask must NOT be encodeURIComponent'd. Encoding commas as
    // %2C causes the API to treat the whole string as one field name and return
    // empty objects — regularHours and profile fields come back missing.
    const readMask = 'name,title,storefrontAddress,phoneNumbers,websiteUri,regularHours,metadata,profile';
    const allLocations = [];
    let locError = null;
    for (const account of accounts.slice(0, 10)) {
      try {
        let pageToken = '';
        do {
          const url = `${BIZ_INFO_BASE}/${account.name}/locations?readMask=${readMask}&pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
          const locRes  = await fetch(url, { headers: { Authorization: auth } });
          const locData = await locRes.json();
          console.log(`[gbp-data] Locations for ${account.name}:`, JSON.stringify(locData).slice(0, 500));
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

    if (!allLocations.length && locError) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: locError, locations: [], reviews: [], reviewsApiPending: true, cachedAt: Date.now() }) };
    }

    // Filter to requested brand (inferred from listing title in parseLocation)
    const brandLocations = allLocations.filter(l => l.brand === brand);

    // ── Step 3: v4 Reviews API — ratings + unanswered queue ──────────────────
    // Graceful: if API returns 403 (not yet approved) all locations stay with
    // rating:null and reviewsApiPending stays true.
    let reviewsApiPending = true;
    const unansweredReviews = [];

    if (brandLocations.length) {
      try {
        const reviewResults = await Promise.all(
          brandLocations.map(async (loc) => {
            try {
              const res = await fetch(`${REVIEW_BASE}/${loc.id}/reviews?pageSize=50`, { headers: { Authorization: auth } });
              console.log(`[gbp-data] Reviews ${loc.name}: ${res.status}`);
              if (!res.ok) return null;
              return { loc, data: await res.json() };
            } catch (e) {
              console.warn('[gbp-data] Reviews failed for', loc.name, ':', e.message);
              return null;
            }
          })
        );

        if (reviewResults.some(r => r !== null)) reviewsApiPending = false;

        for (const result of reviewResults) {
          if (!result) continue;
          const { loc, data } = result;

          loc.rating        = typeof data.averageRating === 'number' ? parseFloat(data.averageRating.toFixed(1)) : null;
          loc.totalReviews  = data.totalReviewCount || 0;

          const unanswered  = (data.reviews || []).filter(r => !r.reviewReply);
          loc.unansweredReviews = unanswered.length;

          if (loc.rating && loc.rating < 4.0) {
            loc.flags.push(`Low rating (${loc.rating}★)`);
            loc.health = 'red';
          } else if (loc.unansweredReviews > 3) {
            if (loc.health === 'green') loc.health = 'amber';
          }

          for (const r of unanswered.slice(0, 5)) {
            unansweredReviews.push({
              id:           r.reviewId,
              locationId:   loc.id,
              locationName: loc.name,
              rating:       { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[r.starRating] || 5,
              comment:      r.comment || '',
              reviewerName: r.reviewer?.displayName || 'Google User',
              relativeTime: timeAgo(r.updateTime),
              draftReply:   '',
            });
          }
        }
      } catch (e) {
        console.warn('[gbp-data] Reviews step failed:', e.message);
      }
    }

    const result = {
      brand,
      locations: brandLocations,
      reviews: unansweredReviews,
      reviewsApiPending,
      cachedAt: Date.now(),
      ...(brandLocations.length ? {} : {
        debugNote: allLocations.length
          ? `Found ${allLocations.length} location(s) in this Google account, but none are named as "${brand}". Locations are matched to a brand by their listing name.`
          : `Connected to ${accounts.length} account(s) but found 0 locations. Make sure the Google account you connected manages the ${brand} listings.`,
      }),
    };

    // Only cache non-empty results
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

  if (!hasHours)                         { flags.push('No hours set');   health = 'amber'; }
  if (!loc.profile?.description)         { flags.push('No description'); if (health === 'green') health = 'amber'; }
  if (!loc.phoneNumbers?.primaryPhone)   { flags.push('No phone');       if (health === 'green') health = 'amber'; }

  const title = loc.title || loc.name?.split('/').pop() || 'Location';
  const tl    = title.toLowerCase();
  const brand = tl.includes('pickl') ? 'pickl' : tl.includes('bonbird') ? 'bonbird' : null;

  console.log(`[gbp-data] "${title}": hasHours=${hasHours} hasDesc=${!!loc.profile?.description} hasPhone=${!!loc.phoneNumbers?.primaryPhone}`);

  return {
    id:               loc.name,
    name:             title,
    brand,
    address,
    rating:           null,
    totalReviews:     null,
    unansweredReviews: 0,
    hasHours,
    photoCount:       null,
    health,
    flags,
    googleMapsUri:    loc.metadata?.mapsUri || null,
  };
}

function timeAgo(isoString) {
  if (!isoString) return '';
  const diff  = Date.now() - new Date(isoString).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1)  return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7)   return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
