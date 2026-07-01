// netlify/functions/gbp-data.js
// Fetches GBP location health data + ratings/reviews via v4 API.
//
// Flow:
//   1. Account Management API  → list accounts
//   2. Business Information API → list locations (readMask MUST be encodeURIComponent'd)
//   3. v4 Reviews API           → per-location ratings + unanswered review queue
//
// CRITICAL — location name format mismatch between APIs:
//   The Business Information v1 API returns location names as "locations/{id}"
//   (NO account prefix). The legacy v4 Reviews API REQUIRES the full path
//   "accounts/{accountId}/locations/{id}/reviews". Calling v4 with just
//   "locations/{id}" returns 400 "Invalid Request Message". We therefore rebuild
//   each location's v4 resource name from the account it was listed under.

const { getStore } = require('@netlify/blobs');

const ACCOUNT_MGMT_BASE = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const BIZ_INFO_BASE     = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const REVIEW_BASE       = 'https://mybusiness.googleapis.com/v4';
const CACHE_TTL_MS      = 6 * 60 * 60 * 1000; // 6 hours

const CORS = {
  'Content-Type':                'application/json',
  'Access-Control-Allow-Origin': '*',
};

const { authorize, denied } = require('./_lib/auth');
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  { const _a = await authorize(event); if (!_a.ok) return denied(); }

  const brand = event.queryStringParameters?.brand || 'pickl';

  const store = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });

  // Check for GBP tokens
  let tokens;
  try { tokens = await store.get('gbpTokens', { type: 'json' }); } catch { tokens = null; }

  if (!tokens?.access_token) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ notConnected: true }) };
  }

  // Cache v9 — adds photoCount (v4 media) + per-review locationAddr; newest-first
  const cacheKey = `gbpCache:${brand}:v9`;
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
    // readMask MUST be encodeURIComponent'd — the Business Information API
    // requires commas to be encoded (%2C) or it rejects the request with
    // "Invalid Request Message" (400).
    const readMask = encodeURIComponent('name,title,storefrontAddress,phoneNumbers,websiteUri,regularHours,metadata,profile');
    const allLocations = [];
    let locError = null;
    for (const account of accounts.slice(0, 10)) {
      try {
        let pageToken = '';
        do {
          const url = `${BIZ_INFO_BASE}/${account.name}/locations?readMask=${readMask}&pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
          const locRes  = await fetch(url, { headers: { Authorization: auth } });
          const locData = await locRes.json();
          console.log(`[gbp-data] Locations for ${account.name}:`, JSON.stringify(locData).slice(0, 500));
          if (!locRes.ok) {
            locError = locData.error?.message || `Locations API failed (${locRes.status})`;
            break;
          }
          for (const loc of locData.locations || []) {
            allLocations.push(parseLocation(loc, account.name));
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
        // Fetch reviews (newest first) AND media (photo count) per location, in
        // parallel. We only read totalMediaItemCount from media, so pageSize=1.
        const orderBy = encodeURIComponent('updateTime desc');

        const perLocation = await Promise.all(
          brandLocations.map(async (loc) => {
            const out = { loc, data: null, photoCount: null };

            // Reviews → ratings, counts, unanswered queue
            try {
              const url = `${REVIEW_BASE}/${loc.v4Name}/reviews?pageSize=50&orderBy=${orderBy}`;
              const res = await fetch(url, { headers: { Authorization: auth } });
              if (res.ok) {
                out.data = await res.json();
              } else {
                const errBody = await res.json().catch(() => ({}));
                console.error(`[gbp-data] Reviews ${res.status} for ${loc.name}:`, JSON.stringify(errBody).slice(0, 200));
              }
            } catch (e) {
              console.warn('[gbp-data] Reviews failed for', loc.name, ':', e.message);
            }

            // Media → total photo count
            try {
              const mres = await fetch(`${REVIEW_BASE}/${loc.v4Name}/media?pageSize=1`, { headers: { Authorization: auth } });
              if (mres.ok) {
                const md = await mres.json();
                if (typeof md.totalMediaItemCount === 'number') out.photoCount = md.totalMediaItemCount;
              } else {
                console.warn(`[gbp-data] Media ${mres.status} for ${loc.name}`);
              }
            } catch (e) {
              console.warn('[gbp-data] Media failed for', loc.name, ':', e.message);
            }

            return out;
          })
        );

        for (const { loc, data, photoCount } of perLocation) {
          if (photoCount != null) loc.photoCount = photoCount;
          if (!data) continue;
          reviewsApiPending = false;

          loc.rating        = typeof data.averageRating === 'number' ? parseFloat(data.averageRating.toFixed(1)) : null;
          loc.totalReviews  = data.totalReviewCount || 0;

          const unanswered  = (data.reviews || []).filter(r => !r.reviewReply);
          loc.unansweredReviews = unanswered.length;

          // Health rules: RED = rating below 4.0 (hurts local-pack ranking).
          // AMBER = listing data gaps (set in parseLocation) OR a lot of
          // unanswered reviews. GREEN = healthy.
          if (loc.rating && loc.rating < 4.0) {
            loc.flags.push(`Low rating (${loc.rating}★)`);
            loc.health = 'red';
          } else if (loc.unansweredReviews > 10 && loc.health === 'green') {
            loc.health = 'amber';
          }

          // Queue every unanswered review for this location (up to the fetched
          // page of 50, newest first). Tagged with address so identical titles
          // (e.g. all "Bonbird Chicken Shop") are distinguishable + filterable.
          for (const r of unanswered.slice(0, 50)) {
            unansweredReviews.push({
              id:           r.reviewId,
              locationId:   loc.v4Name,
              locationName: loc.name,
              locationAddr: loc.address || '',
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

function parseLocation(loc, accountName) {
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

  // Build the v4 resource name: "accounts/{id}/locations/{id}". The Business
  // Information API returns loc.name as "locations/{id}" (no account prefix),
  // but the v4 Reviews API requires the account-qualified path or it 404s.
  const locId  = (loc.name || '').split('/').pop();
  const v4Name = accountName && locId ? `${accountName}/locations/${locId}` : loc.name;

  return {
    id:               loc.name,
    v4Name,
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
