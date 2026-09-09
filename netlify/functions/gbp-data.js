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
const { getBrands } = require('./_lib/brands-config');

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

  // Cache v10 — adds full venue fields (phone, website, hours, fullAddress, placeId,
  // primaryPhoto URL) for the venue export; bump invalidates the older summary cache — v11 picks
  // up the clean 12h hours format + real venue photo (non-logo) selection. (v7.9.72)
  const cacheKey = `gbpCache:${brand}:v11`;
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
    // Config-driven brand tagging so a newly onboarded brand's GBP locations get
    // matched by its slug/name/brandTerms in the listing title (not just pickl/bonbird).
    const brandDefs = await getBrands();
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
            allLocations.push(parseLocation(loc, account.name, brandDefs));
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
            const out = { loc, data: null, photoCount: null, primaryPhoto: null };

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

            // Media → total photo count + a primary photo URL. Pick a REAL venue photo, not the
            // brand logo: PROFILE/LOGO are the logo and COVER is often the logo banner too, so we
            // prefer EXTERIOR → INTERIOR → FOOD_AND_DRINK → COVER → any other non-logo item, and
            // fall back to PROFILE only if nothing else exists. googleUrl is a viewable Google-hosted
            // image. (v7.9.72 — was returning logos)
            try {
              const mres = await fetch(`${REVIEW_BASE}/${loc.v4Name}/media?pageSize=100`, { headers: { Authorization: auth } });
              if (mres.ok) {
                const md = await mres.json();
                if (typeof md.totalMediaItemCount === 'number') out.photoCount = md.totalMediaItemCount;
                const items = md.mediaItems || [];
                const cat = m => m.locationAssociation?.category || '';
                const LOGOISH = new Set(['PROFILE', 'LOGO', 'COVER']);
                const byCat = c => items.find(m => cat(m) === c);
                const pick = byCat('EXTERIOR')
                          || byCat('INTERIOR')
                          || byCat('FOOD_AND_DRINK')
                          || byCat('AT_WORK')
                          || byCat('ADDITIONAL')
                          || items.find(m => m.mediaFormat === 'PHOTO' && !LOGOISH.has(cat(m)))
                          || items.find(m => !LOGOISH.has(cat(m)))
                          || byCat('COVER')
                          || items[0];
                out.primaryPhoto = (pick && (pick.googleUrl || pick.thumbnailUrl || pick.sourceUrl)) || null;
              } else {
                console.warn(`[gbp-data] Media ${mres.status} for ${loc.name}`);
              }
            } catch (e) {
              console.warn('[gbp-data] Media failed for', loc.name, ':', e.message);
            }

            return out;
          })
        );

        for (const { loc, data, photoCount, primaryPhoto } of perLocation) {
          if (photoCount != null) loc.photoCount = photoCount;
          if (primaryPhoto) loc.primaryPhoto = primaryPhoto;
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

// Format GBP regularHours into a clean, human 12-hour string grouped by identical days,
// e.g. "Mon–Thu: 12 pm – 12 am; Fri–Sat: 12 pm – 4 am; Sun: 11 am – 12 am". Merges a
// period that closes at midnight (24:00) with the next day's 00:00 opener (late-night
// spillover), so a shop open till 4am reads "… – 4 am" not two ugly rows. (v7.9.72)
const _DNUM = { SUNDAY:0, MONDAY:1, TUESDAY:2, WEDNESDAY:3, THURSDAY:4, FRIDAY:5, SATURDAY:6 };
const _DABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function _h12(t) {
  let h = (t && t.hours) || 0; const m = (t && t.minutes) || 0;
  if (h === 24) h = 0;
  const ap = h < 12 ? 'am' : 'pm';
  let hh = h % 12; if (hh === 0) hh = 12;
  return m ? `${hh}:${String(m).padStart(2,'0')} ${ap}` : `${hh} ${ap}`;
}
function formatHours(regularHours) {
  const P = regularHours?.periods || [];
  if (!P.length) return '';
  const mins = t => (((t && t.hours) || 0) * 60) + ((t && t.minutes) || 0);
  const byDay = {};
  for (const p of P) { const d = _DNUM[p.openDay]; if (d == null) continue; (byDay[d] = byDay[d] || []).push(p); }
  const spillClose = d => { const sp = (byDay[d] || []).find(p => mins(p.openTime) === 0); return sp ? sp.closeTime : null; };
  const perDay = {};
  for (let d = 0; d < 7; d++) {
    const arr = (byDay[d] || []).slice().sort((a,b) => mins(a.openTime) - mins(b.openTime));
    if (!arr.length) { perDay[d] = 'Closed'; continue; }
    if (arr.find(p => mins(p.openTime) === 0 && mins(p.closeTime) >= 1440)) { perDay[d] = 'Open 24 hours'; continue; }
    const main = arr.find(p => mins(p.openTime) > 0);
    if (!main) { perDay[d] = ''; continue; }          // only late-night spillover from prev day
    let close = main.closeTime;
    if (mins(close) >= 1440) { const nc = spillClose((d + 1) % 7); if (nc) close = nc; }
    perDay[d] = `${_h12(main.openTime)} – ${_h12(close)}`;
  }
  // Group consecutive days (Mon→Sun order) with identical hours into ranges.
  const order = [1,2,3,4,5,6,0];
  const out = []; let i = 0;
  while (i < order.length) {
    const v = perDay[order[i]]; if (v === '') { i++; continue; }
    let j = i; while (j + 1 < order.length && perDay[order[j+1]] === v) j++;
    const label = i === j ? _DABBR[order[i]] : `${_DABBR[order[i]]}–${_DABBR[order[j]]}`;
    out.push(`${label}: ${v}`); i = j + 1;
  }
  return out.join('; ');
}

function parseLocation(loc, accountName, brandDefs = []) {
  const sa = loc.storefrontAddress || {};
  const address = [
    ...(sa.addressLines || []),
    sa.locality,
    sa.administrativeArea,
  ].filter(Boolean).join(', ');
  const fullAddress = [
    ...(sa.addressLines || []),
    sa.locality,
    sa.administrativeArea,
    sa.postalCode,
    sa.regionCode,
  ].filter(Boolean).join(', ');

  const hasHours = !!(loc.regularHours?.periods?.length);
  const flags    = [];
  let health     = 'green';

  if (!hasHours)                         { flags.push('No hours set');   health = 'amber'; }
  if (!loc.profile?.description)         { flags.push('No description'); if (health === 'green') health = 'amber'; }
  if (!loc.phoneNumbers?.primaryPhone)   { flags.push('No phone');       if (health === 'green') health = 'amber'; }

  const title = loc.title || loc.name?.split('/').pop() || 'Location';
  const tl    = title.toLowerCase();
  // Tag by matching the location title against each configured brand's
  // slug / name / brandTerms. null if none match.
  const matched = brandDefs.find(bd => {
    const needles = [bd.slug, bd.name, ...(bd.brandTerms || [])]
      .filter(Boolean).map(x => String(x).toLowerCase());
    return needles.some(n => n && tl.includes(n));
  });
  const brand = matched ? matched.slug : null;

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
    fullAddress,
    country:          sa.regionCode || null,
    postalCode:       sa.postalCode || null,
    phone:            loc.phoneNumbers?.primaryPhone || null,
    website:          loc.websiteUri || null,
    hours:            formatHours(loc.regularHours),
    placeId:          loc.metadata?.placeId || null,
    rating:           null,
    totalReviews:     null,
    unansweredReviews: 0,
    hasHours,
    photoCount:       null,
    primaryPhoto:     null,   // filled from the media fetch below (v7.9.71)
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
