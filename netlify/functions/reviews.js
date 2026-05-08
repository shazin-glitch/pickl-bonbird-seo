// netlify/functions/reviews.js
// Google Business Profile (GBP) integration for Pickl + Bonbird.
//
// MODES
//   placeholder  : default. Returns sample reviews so the UI/queue work end-to-end.
//                  Posting just marks the queued response as "would push" and logs.
//   live         : activated when ALL of these env vars are set AND OAuth tokens
//                  are stored in Blobs (same pattern as GSC):
//                    GBP_PICKL_ACCOUNT_ID
//                    GBP_PICKL_LOCATION_ID
//                    GBP_BONBIRD_ACCOUNT_ID
//                    GBP_BONBIRD_LOCATION_ID
//                  Plus 'gbpTokens' in the seo-tool blob store
//                  (use the existing /api/auth/login flow with GBP scope added).
//
// ENDPOINTS
//   POST /api/reviews body:
//     { action: 'pull',          brand?, since? }   -> fetch new reviews, queue replies
//     { action: 'list',          brand? }           -> list cached reviews (UI display)
//     { action: 'post_response', brand, payload }   -> push approved reply to GBP
//     { action: 'mode' }                            -> report current mode + readiness
//
// To add GBP to your existing OAuth consent screen later, re-run the consent
// flow with the additional scope `https://www.googleapis.com/auth/business.manage`
// and store tokens under blob key `gbpTokens` (separate from `gscTokens`).

const {
  store, getSetting, setSetting,
  ok, bad, preflight, parseBody
} = require('./_lib/store');

const SITE_URL = process.env.URL || 'https://yolkseo.netlify.app';

const BRANDS = {
  pickl:   { name: 'Pickl',   accountEnv: 'GBP_PICKL_ACCOUNT_ID',   locationEnv: 'GBP_PICKL_LOCATION_ID' },
  bonbird: { name: 'Bonbird', accountEnv: 'GBP_BONBIRD_ACCOUNT_ID', locationEnv: 'GBP_BONBIRD_LOCATION_ID' }
};

function getBrandIds(brand) {
  const cfg = BRANDS[brand];
  if (!cfg) return null;
  const acc = process.env[cfg.accountEnv];
  const loc = process.env[cfg.locationEnv];
  if (!acc || !loc) return null;
  return { accountId: acc, locationId: loc };
}

async function getMode() {
  const tokens = await store().get('gbpTokens', { type: 'json' }).catch(() => null);
  const piclkReady = !!getBrandIds('pickl');
  const bonbirdReady = !!getBrandIds('bonbird');
  const tokensReady = !!(tokens && tokens.access_token);
  return {
    mode: tokensReady && (piclkReady || bonbirdReady) ? 'live' : 'placeholder',
    pickl:   { configured: piclkReady,   tokensReady },
    bonbird: { configured: bonbirdReady, tokensReady },
    setup: tokensReady ? null : 'Connect GBP OAuth + set GBP_<BRAND>_ACCOUNT_ID / GBP_<BRAND>_LOCATION_ID env vars'
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  if (event.httpMethod !== 'POST') return bad(405, 'Method Not Allowed');

  const body = parseBody(event);
  if (body === null) return bad(400, 'Invalid JSON');

  try {
    switch (body.action) {
      case 'mode':          return ok(await getMode());
      case 'pull':          return await handlePull(body);
      case 'list':          return await handleList(body);
      case 'post_response': return await handlePostResponse(body);
      default:              return bad(400, `unknown action: ${body.action}`);
    }
  } catch (err) {
    console.error('reviews error', err);
    return bad(500, err.message || 'reviews error');
  }
};

// ---- pull: fetch new reviews, draft replies, queue them --------------------

async function handlePull(body) {
  const mode = await getMode();
  const brandsToRun = body.brand
    ? [body.brand].filter(b => BRANDS[b])
    : Object.keys(BRANDS);

  const summary = { mode: mode.mode, brands: {}, queued: 0 };

  for (const brand of brandsToRun) {
    const reviews = mode.mode === 'live'
      ? await fetchLiveReviews(brand)
      : getPlaceholderReviews(brand);

    // Filter to reviews that haven't been queued already
    const seen = await getSeenIds(brand);
    const fresh = reviews.filter(r => !seen.has(r.reviewId));

    summary.brands[brand] = { fetched: reviews.length, fresh: fresh.length };

    if (!fresh.length) continue;

    // Draft a response for each fresh review and queue them
    const items = [];
    for (const review of fresh) {
      const draft = await draftResponse(brand, review);
      items.push({
        type: 'review_response',
        brand,
        title: `Reply to ${review.reviewerName} (${review.starRating}★)`,
        reason: `New ${review.sentiment} review needs a response`,
        payload: {
          reviewId: review.reviewId,
          reviewName: review.reviewName, // GBP resource name for posting reply
          reviewerName: review.reviewerName,
          starRating: review.starRating,
          sentiment: review.sentiment,
          reviewText: review.text,
          reviewedAt: review.createTime,
          responseText: draft
        }
      });
    }

    const queued = await batchQueue(items);
    summary.queued += queued;
    summary.brands[brand].queued = queued;

    // Mark these reviews as seen
    for (const r of fresh) seen.add(r.reviewId);
    await setSeenIds(brand, Array.from(seen));

    // Cache the latest fetch for the UI
    await store().setJSON(`reviews:cache:${brand}`, {
      fetchedAt: Date.now(),
      reviews
    });
  }

  return ok(summary);
}

async function handleList(body) {
  const brandsToRun = body.brand
    ? [body.brand].filter(b => BRANDS[b])
    : Object.keys(BRANDS);
  const out = {};
  for (const brand of brandsToRun) {
    const cached = await store().get(`reviews:cache:${brand}`, { type: 'json' }).catch(() => null);
    out[brand] = cached || { fetchedAt: null, reviews: [] };
  }
  return ok(out);
}

async function handlePostResponse(body) {
  const { brand, payload } = body;
  if (!brand || !payload) return bad(400, 'brand and payload required');
  const mode = await getMode();
  if (mode.mode !== 'live') {
    // Placeholder mode: pretend success. The approval queue records this
    // outcome so the user sees "pushed" with a clear marker.
    return ok({
      ok: true,
      ref: `placeholder:${payload.reviewId}`,
      message: '[placeholder mode] would post reply to GBP — connect API to push for real'
    });
  }

  const ids = getBrandIds(brand);
  if (!ids) return bad(503, `GBP IDs not set for ${brand}`);

  const token = await getValidToken();
  if (!token) return bad(401, 'GBP not connected — re-run OAuth with business.manage scope');

  // Use stored reviewName if we have it, otherwise build from IDs + reviewId
  const name = payload.reviewName
    || `accounts/${ids.accountId}/locations/${ids.locationId}/reviews/${payload.reviewId}`;
  const url = `https://mybusiness.googleapis.com/v4/${name}/reply`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ comment: payload.responseText })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return bad(res.status, `GBP reply failed: ${data.error?.message || res.status}`);
  }
  return ok({
    ok: true,
    ref: name,
    message: 'Reply posted to Google Business Profile'
  });
}

// ---- live API helpers ------------------------------------------------------

async function fetchLiveReviews(brand) {
  const ids = getBrandIds(brand);
  if (!ids) return [];
  const token = await getValidToken();
  if (!token) return [];
  const url = `https://mybusiness.googleapis.com/v4/accounts/${ids.accountId}/locations/${ids.locationId}/reviews?pageSize=20&orderBy=updateTime desc`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.warn('GBP fetch failed:', data.error?.message);
    return [];
  }
  const stars = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return (data.reviews || []).map(r => ({
    reviewId: r.reviewId,
    reviewName: r.name,
    reviewerName: r.reviewer?.displayName || 'Guest',
    starRating: stars[r.starRating] || 0,
    text: r.comment || '',
    createTime: r.createTime,
    updateTime: r.updateTime,
    sentiment: stars[r.starRating] >= 4 ? 'positive' : stars[r.starRating] <= 2 ? 'negative' : 'mixed',
    hasReply: !!r.reviewReply
  }));
}

async function getValidToken() {
  const s = store();
  const tokens = await s.get('gbpTokens', { type: 'json' }).catch(() => null);
  if (!tokens || !tokens.access_token) return null;
  // Refresh if expired
  if (tokens.refresh_token && tokens.expires_at && Date.now() > tokens.expires_at - 60000) {
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token'
      })
    });
    const refresh = await refreshRes.json();
    if (refresh.access_token) {
      const updated = {
        ...tokens,
        access_token: refresh.access_token,
        expires_at: Date.now() + (refresh.expires_in || 3600) * 1000
      };
      await s.setJSON('gbpTokens', updated);
      return refresh.access_token;
    }
    return null;
  }
  return tokens.access_token;
}

// ---- placeholder data ------------------------------------------------------

function getPlaceholderReviews(brand) {
  const now = Date.now();
  const day = 86400000;
  if (brand === 'pickl') {
    return [
      {
        reviewId: 'placeholder_pickl_1',
        reviewName: null,
        reviewerName: 'Aisha M.',
        starRating: 5,
        text: 'Best smash burger in Dubai Marina! The truffle sauce is unreal. Service was friendly even on a busy Friday night.',
        createTime: new Date(now - 2 * day).toISOString(),
        updateTime: new Date(now - 2 * day).toISOString(),
        sentiment: 'positive',
        hasReply: false
      },
      {
        reviewId: 'placeholder_pickl_2',
        reviewName: null,
        reviewerName: 'Karim H.',
        starRating: 2,
        text: 'Waited 40 minutes for delivery and burger was cold. Sauce had leaked everywhere. Disappointed.',
        createTime: new Date(now - 5 * day).toISOString(),
        updateTime: new Date(now - 5 * day).toISOString(),
        sentiment: 'negative',
        hasReply: false
      }
    ];
  }
  if (brand === 'bonbird') {
    return [
      {
        reviewId: 'placeholder_bonbird_1',
        reviewName: null,
        reviewerName: 'Sara K.',
        starRating: 4,
        text: 'Halal fried chicken done right. Crispy, juicy, perfectly seasoned. Loved the spicy variant. Only knock is the wait time at peak hours.',
        createTime: new Date(now - 1 * day).toISOString(),
        updateTime: new Date(now - 1 * day).toISOString(),
        sentiment: 'positive',
        hasReply: false
      }
    ];
  }
  return [];
}

// ---- response drafting -----------------------------------------------------

async function draftResponse(brand, review) {
  // We could call Claude directly, but the existing tool already has a
  // perfectly good review-reply prompt — we mirror its structure here for
  // consistency, and call Claude through the shared helper.
  const { callClaude } = require('./_lib/store');
  const cfg = BRANDS[brand];
  const prompt = `Write a professional Google review response for ${cfg.name} (UAE restaurant).
Sentiment: ${review.sentiment}.
Reviewer: ${review.reviewerName}
Star rating: ${review.starRating}/5
Review: "${review.text}"

Response should: naturally include the restaurant name and location (Dubai/UAE), thank the customer by name, address specific points raised, include a relevant SEO keyword naturally (e.g. "best smash burger Dubai" or "halal fried chicken UAE"), be warm and on-brand, stay under 120 words. For negative reviews, take ownership and offer a concrete next step. Output ONLY the response text — no quotes, no preamble.`;
  try {
    const { text } = await callClaude(prompt, { max_tokens: 400 });
    return text.trim();
  } catch (e) {
    console.warn('draft failed:', e.message);
    return ''; // queue with empty draft; user can write it
  }
}

// ---- seen-ids dedupe -------------------------------------------------------

async function getSeenIds(brand) {
  const arr = await store().get(`reviews:seen:${brand}`, { type: 'json' }).catch(() => []);
  return new Set(Array.isArray(arr) ? arr : []);
}
async function setSeenIds(brand, arr) {
  await store().setJSON(`reviews:seen:${brand}`, arr.slice(-500));
}

// ---- batch queue helper ----------------------------------------------------

async function batchQueue(items) {
  if (!items || !items.length) return 0;
  const base = SITE_URL.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/.netlify/functions/approvals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', actor: 'claude (reviews)', items })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return 0;
    return (data.items || []).length;
  } catch (_) {
    return 0;
  }
}
