// netlify/functions/gbp-reviews.js
// Google Business Profile Reviews API integration.
// STUB — returns pending state until Google approves API access.
//
// TO ACTIVATE once approved:
//   1. Remove the `reviewsApiPending` early return below
//   2. Implement fetchReviews() using mybusiness.googleapis.com/v4/
//   3. Implement generateReply() using brand voice via Claude
//
// GET  /api/gbp-reviews?brand=pickl&locationId=...  — fetch reviews needing replies
// POST /api/gbp-reviews  { action: 'publish_reply', reviewId, locationId, reply }

const { getStore } = require('@netlify/blobs');
const { getBrandContext, buildBrandPrompt } = require('./_lib/brand');

const REVIEW_BASE = 'https://mybusiness.googleapis.com/v4';

const CORS = {
  'Content-Type':                'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  const store = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });

  // ── PENDING: Reviews API access not yet approved ────────────────────────────
  // Remove this block once Google approves the API access application.
  // Application submitted: June 2026. Expected: 7-10 business days.
  // Check status at: https://developers.google.com/my-business/content/prereqs
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        reviewsApiPending: true,
        message: 'Reviews API access pending Google approval',
        reviews: [],
      }),
    };
  }

  if (event.httpMethod === 'POST') {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ reviewsApiPending: true, message: 'Reviews API access pending approval' }),
    };
  }

  return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  // ══════════════════════════════════════════════════════════════════════════
  // IMPLEMENTATION — activate when API approved
  // ══════════════════════════════════════════════════════════════════════════

  /* eslint-disable no-unreachable */

  // Get GBP tokens
  let tokens;
  try { tokens = await store.get('gbpTokens', { type: 'json' }); } catch { tokens = null; }
  if (!tokens?.access_token) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'GBP not connected' }) };
  }

  const authHeader = `Bearer ${tokens.access_token}`;
  const brand = event.queryStringParameters?.brand || 'pickl';

  // GET — fetch unanswered reviews + generate AI replies
  if (event.httpMethod === 'GET') {
    const locationId = event.queryStringParameters?.locationId;
    if (!locationId) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'locationId required' }) };

    const [accountId, locId] = locationId.split('/locations/');
    const url = `${REVIEW_BASE}/accounts/${accountId}/locations/${locId}/reviews?pageSize=20&orderBy=updateTime desc`;

    const res  = await fetch(url, { headers: { Authorization: authHeader } });
    const data = await res.json();

    if (!res.ok) return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: data.error?.message, reviews: [] }) };

    // Filter unanswered
    const unanswered = (data.reviews || []).filter(r => !r.reviewReply);

    // Generate AI replies for each
    const brandCtx    = await getBrandContext(brand);
    const brandPrompt = buildBrandPrompt(brandCtx);
    const reviews     = [];

    for (const review of unanswered.slice(0, 10)) {
      let draftReply = '';
      try {
        const { callClaude } = require('./_lib/store');
        const result = await callClaude(
          `Write a reply to this Google review for ${brandCtx.name}. Brand voice rules apply strictly.\n\nReview: "${review.comment || 'No comment — rating only'}"\nStars: ${review.starRating}\nRespond in 2-3 sentences max. Sound human. Never start with "Thank you for your review."`,
          { max_tokens: 150, system: brandPrompt }
        );
        draftReply = result.text || '';
      } catch { draftReply = ''; }

      reviews.push({
        id:           review.reviewId,
        locationId,
        rating:       { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[review.starRating] || 5,
        comment:      review.comment || '',
        reviewerName: review.reviewer?.displayName || 'Google User',
        relativeTime: review.updateTime ? timeAgo(review.updateTime) : '',
        draftReply,
        voiceScore:   null, // could run voice check here
      });
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ reviews, reviewsApiPending: false }) };
  }

  // POST — publish a reply
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    const { action, reviewId, locationId, reply } = body;

    if (action === 'publish_reply') {
      const [accountId, locId] = locationId.split('/locations/');
      const url = `${REVIEW_BASE}/accounts/${accountId}/locations/${locId}/reviews/${reviewId}/reply`;

      const res = await fetch(url, {
        method:  'PUT',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ comment: reply }),
      });
      const data = await res.json();
      if (!res.ok) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: data.error?.message }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ published: true }) };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Unknown action' }) };
  }
};

function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
}
