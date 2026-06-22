// netlify/functions/gbp-reviews.js
// Google Business Profile Reviews — AI draft + publish reply.
//
// POST { action: 'draft',         brand, stars, comment }        → { draft }
// POST { action: 'publish_reply', reviewId, locationId, reply }  → { published }

const { getStore } = require('@netlify/blobs');
const { getBrandContext, buildBrandPrompt } = require('./_lib/brand');
const { callClaude } = require('./_lib/store');

const REVIEW_BASE = 'https://mybusiness.googleapis.com/v4';

const CORS = {
  'Content-Type':                'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  // GET — not used by the main flow (reviews are bundled in gbp-data response)
  if (event.httpMethod === 'GET') {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ reviews: [], reviewsApiPending: false }) };
  }

  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    const { action } = body;

    // ── Draft reply via Claude ────────────────────────────────────────────────
    // No GBP tokens needed — pure Claude call with brand voice.
    if (action === 'draft') {
      const { brand = 'pickl', stars = 5, comment = '' } = body;
      try {
        const brandCtx    = await getBrandContext(brand).catch(() => null);
        const brandPrompt = brandCtx ? buildBrandPrompt(brandCtx) : '';
        const result = await callClaude(
          `Write a reply to this Google review for ${brandCtx?.name || brand}.\n\nReview (${stars} stars): "${comment || 'Rating only'}"\n\nRules:\n- 2–3 sentences max\n- Sound human, warm but not sycophantic\n- Never start with "Thank you for your review" or "We appreciate your feedback"\n- Match brand voice exactly\n- If 1–2 stars: acknowledge the issue genuinely, invite them back`,
          { max_tokens: 200, system: brandPrompt }
        );
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ draft: result.text || '' }) };
      } catch (e) {
        console.error('[gbp-reviews] Draft failed:', e.message);
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
      }
    }

    // ── Publish reply to Google ───────────────────────────────────────────────
    if (action === 'publish_reply') {
      const { reviewId, locationId, reply } = body;
      if (!reply?.trim()) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'reply text required' }) };
      }
      if (!reviewId || !locationId) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'reviewId and locationId required' }) };
      }

      const store = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });

      let tokens;
      try { tokens = await store.get('gbpTokens', { type: 'json' }); } catch { tokens = null; }
      if (!tokens?.access_token) {
        return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'GBP not connected — reconnect in Local SEO tab' }) };
      }

      // Refresh token if near expiry
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
        } catch (e) { console.warn('[gbp-reviews] Token refresh failed:', e.message); }
      }

      // locationId = "accounts/{a}/locations/{l}" — reviewId = bare ID string
      // v4 reply endpoint: PUT /v4/{locationId}/reviews/{reviewId}/reply
      const url = `${REVIEW_BASE}/${locationId}/reviews/${reviewId}/reply`;
      console.log('[gbp-reviews] PUT reply to:', url);

      const res  = await fetch(url, {
        method:  'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ comment: reply.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        console.error('[gbp-reviews] Publish failed:', res.status, JSON.stringify(data).slice(0, 300));
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: data.error?.message || `Reply failed (${res.status})` }) };
      }

      return { statusCode: 200, headers: CORS, body: JSON.stringify({ published: true }) };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Unknown action' }) };
  }

  return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
};
