// netlify/functions/reviews.js
// Google Business Profile integration for Pickl + Bonbird.
//
// MODES:
//   placeholder  Default. Returns sample reviews so the queue/UI work end-to-end.
//                Approved replies are marked "pushed" with a [placeholder] note.
//   live         Activates when GBP env vars AND OAuth tokens are present.
//
// ENV VARS (for live mode):
//   GBP_PICKL_ACCOUNT_ID    GBP_PICKL_LOCATION_ID
//   GBP_BONBIRD_ACCOUNT_ID  GBP_BONBIRD_LOCATION_ID
//   (OAuth tokens stored under blob key 'gbpTokens' — same pattern as GSC)
//
// ACTIONS (POST /api/reviews):
//   mode          -> report current mode + readiness
//   pull          -> fetch new reviews, draft Claude replies, queue them
//   list          -> return cached reviews
//   post_response -> push approved reply to GBP (or placeholder success)

const { store, createApproval, callClaude, ok, bad, preflight, parseBody } = require('./_lib/store');
const { getBrandContext, buildBrandPrompt } = require('./_lib/brand');

const SITE_URL = process.env.URL || 'https://yolkseo.netlify.app';
const BRANDS = {
  pickl:   { name: 'Pickl',   accountEnv: 'GBP_PICKL_ACCOUNT_ID',   locationEnv: 'GBP_PICKL_LOCATION_ID' },
  bonbird: { name: 'Bonbird', accountEnv: 'GBP_BONBIRD_ACCOUNT_ID', locationEnv: 'GBP_BONBIRD_LOCATION_ID' },
};

function getBrandIds(brand) {
  const cfg = BRANDS[brand];
  if (!cfg) return null;
  const acc = process.env[cfg.accountEnv];
  const loc = process.env[cfg.locationEnv];
  return (acc && loc) ? { accountId: acc, locationId: loc } : null;
}

async function getMode() {
  const tokens = await store().get('gbpTokens', { type: 'json' }).catch(() => null);
  const tokensReady = !!(tokens && tokens.access_token);
  return {
    mode: tokensReady && (getBrandIds('pickl') || getBrandIds('bonbird')) ? 'live' : 'placeholder',
    pickl:   { configured: !!getBrandIds('pickl'),   tokensReady },
    bonbird: { configured: !!getBrandIds('bonbird'), tokensReady },
    setup: tokensReady ? null : 'Set GBP_<BRAND>_ACCOUNT_ID / LOCATION_ID env vars and re-run GSC OAuth with business.manage scope',
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
  } catch (e) {
    console.error('reviews error', e);
    return bad(500, e.message || 'reviews error');
  }
};

async function handlePull(body) {
  const mode = await getMode();
  const brandsToRun = body.brand ? [body.brand].filter(b => BRANDS[b]) : Object.keys(BRANDS);
  const summary = { mode: mode.mode, brands: {}, queued: 0 };

  for (const brand of brandsToRun) {
    const reviews = mode.mode === 'live' ? await fetchLiveReviews(brand) : getPlaceholderReviews(brand);
    const seen = await getSeenIds(brand);
    const fresh = reviews.filter(r => !seen.has(r.reviewId));
    summary.brands[brand] = { fetched: reviews.length, fresh: fresh.length };
    if (!fresh.length) continue;

    const items = [];
    for (const review of fresh) {
      const draft = await draftResponse(brand, review);
      items.push({ type: 'review_response', brand, actor: 'claude (reviews)', title: `Reply to ${review.reviewerName} (${review.starRating}★)`, reason: `New ${review.sentiment} review needs a response`, payload: { reviewId: review.reviewId, reviewName: review.reviewName, reviewerName: review.reviewerName, starRating: review.starRating, sentiment: review.sentiment, reviewText: review.text, reviewedAt: review.createTime, responseText: draft } });
    }
    for (const inp of items) { await createApproval(inp); summary.queued++; }
    for (const r of fresh) seen.add(r.reviewId);
    await setSeenIds(brand, Array.from(seen));
    await store().setJSON(`reviews:cache:${brand}`, { fetchedAt: Date.now(), reviews });
    summary.brands[brand].queued = fresh.length;
  }
  return ok(summary);
}

async function handleList(body) {
  const brandsToRun = body.brand ? [body.brand].filter(b => BRANDS[b]) : Object.keys(BRANDS);
  const out = {};
  for (const brand of brandsToRun) {
    out[brand] = (await store().get(`reviews:cache:${brand}`, { type: 'json' }).catch(() => null)) || { fetchedAt: null, reviews: [] };
  }
  return ok(out);
}

async function handlePostResponse(body) {
  const { brand, payload } = body;
  if (!brand || !payload) return bad(400, 'brand and payload required');
  const mode = await getMode();
  if (mode.mode !== 'live') {
    return ok({ ok: true, ref: `placeholder:${payload.reviewId}`, message: '[placeholder mode] would post reply to GBP — connect API to push for real' });
  }
  const ids = getBrandIds(brand);
  if (!ids) return bad(503, `GBP IDs not set for ${brand}`);
  const token = await getValidToken();
  if (!token) return bad(401, 'GBP not connected — re-run OAuth with business.manage scope');
  const name = payload.reviewName || `accounts/${ids.accountId}/locations/${ids.locationId}/reviews/${payload.reviewId}`;
  const res = await fetch(`https://mybusiness.googleapis.com/v4/${name}/reply`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ comment: payload.responseText }),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok ? ok({ ok: true, ref: name, message: 'Reply posted to Google Business Profile' }) : bad(res.status, `GBP reply failed: ${data.error?.message || res.status}`);
}

// ── Placeholder reviews ──────────────────────────────────────────
function getPlaceholderReviews(brand) {
  const now = Date.now(), day = 86400000;
  if (brand === 'pickl') return [
    { reviewId: 'placeholder_pickl_1', reviewName: null, reviewerName: 'Aisha M.', starRating: 5, text: 'Best smash burger in Dubai Marina! The truffle sauce is unreal. Service was friendly even on a busy Friday night.', createTime: new Date(now - 2 * day).toISOString(), updateTime: new Date(now - 2 * day).toISOString(), sentiment: 'positive', hasReply: false },
    { reviewId: 'placeholder_pickl_2', reviewName: null, reviewerName: 'Karim H.', starRating: 2, text: 'Waited 40 minutes for delivery and burger was cold. Sauce had leaked everywhere. Disappointed.', createTime: new Date(now - 5 * day).toISOString(), updateTime: new Date(now - 5 * day).toISOString(), sentiment: 'negative', hasReply: false },
  ];
  if (brand === 'bonbird') return [
    { reviewId: 'placeholder_bonbird_1', reviewName: null, reviewerName: 'Sara K.', starRating: 4, text: 'Halal fried chicken done right. Crispy, juicy, perfectly seasoned. Only knock is the wait time at peak hours.', createTime: new Date(now - 1 * day).toISOString(), updateTime: new Date(now - 1 * day).toISOString(), sentiment: 'positive', hasReply: false },
  ];
  return [];
}

// ── Live GBP token ───────────────────────────────────────────────
async function getValidToken() {
  const tokens = await store().get('gbpTokens', { type: 'json' }).catch(() => null);
  if (!tokens || !tokens.access_token) return null;
  if (tokens.refresh_token && tokens.expires_at && Date.now() > tokens.expires_at - 60000) {
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: tokens.refresh_token, grant_type: 'refresh_token' }) });
    const refresh = await r.json();
    if (refresh.access_token) {
      await store().setJSON('gbpTokens', { ...tokens, access_token: refresh.access_token, expires_at: Date.now() + (refresh.expires_in || 3600) * 1000 });
      return refresh.access_token;
    }
    return null;
  }
  return tokens.access_token;
}

async function fetchLiveReviews(brand) {
  const ids = getBrandIds(brand); if (!ids) return [];
  const token = await getValidToken(); if (!token) return [];
  const res = await fetch(`https://mybusiness.googleapis.com/v4/accounts/${ids.accountId}/locations/${ids.locationId}/reviews?pageSize=20&orderBy=updateTime desc`, { headers: { 'Authorization': `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { console.warn('GBP fetch failed:', data.error?.message); return []; }
  const stars = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return (data.reviews || []).map(r => ({ reviewId: r.reviewId, reviewName: r.name, reviewerName: r.reviewer?.displayName || 'Guest', starRating: stars[r.starRating] || 0, text: r.comment || '', createTime: r.createTime, updateTime: r.updateTime, sentiment: (stars[r.starRating] || 0) >= 4 ? 'positive' : (stars[r.starRating] || 0) <= 2 ? 'negative' : 'mixed', hasReply: !!r.reviewReply }));
}

// ── Draft response via Claude ────────────────────────────────────
async function draftResponse(brand, review) {
  const cfg = BRANDS[brand];
  const brandCtx = await getBrandContext(brand).catch(() => null);
  const system   = buildBrandPrompt(brandCtx) || `You are a customer service rep for ${cfg.name}, a UAE restaurant.`;
  const prompt = `Write a Google review response. Sentiment: ${review.sentiment}. Reviewer: ${review.reviewerName}. Stars: ${review.starRating}/5. Review: "${review.text}"\n\nRules: warm and on-brand, mention the restaurant name naturally, address specific points raised, under 120 words, include a UAE/Dubai keyword naturally. For negative reviews: take ownership, apologise, offer a next step. Output ONLY the response text — no labels, no quotes.`;
  try { const { text } = await callClaude(prompt, { max_tokens: 400, system }); return text.trim(); } catch (_) { return ''; }
}

// ── Seen-IDs dedupe ──────────────────────────────────────────────
async function getSeenIds(brand) {
  const arr = await store().get(`reviews:seen:${brand}`, { type: 'json' }).catch(() => []);
  return new Set(Array.isArray(arr) ? arr : []);
}
async function setSeenIds(brand, arr) { await store().setJSON(`reviews:seen:${brand}`, arr.slice(-500)); }
