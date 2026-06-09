// netlify/functions/keyword-opportunities.js
// Serves keyword opportunity data and triggers fresh discovery.
//
// GET  ?brand=pickl              — returns stored keywordOpportunities:<brand>
// GET  ?brand=pickl&audit=xxx    — returns audit data cross-referenced with our GSC positions
// POST { brand }                 — triggers fresh keyword discovery (background)

const { getStore } = require('@netlify/blobs');
const { handler: runDiscovery } = require('./keyword-discovery-background');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const store = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
  const q     = event.queryStringParameters || {};

  // ── GET: serve stored opportunities ─────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const brand = q.brand || 'pickl';

    // ?audit=domain.com → cross-reference audit data with our GSC positions
    if (q.audit) {
      const domain  = q.audit;
      const audit   = await store.get(`competitorAuditCache:${domain}`, { type: 'json' }).catch(() => null);
      const GSC_URL = brand === 'pickl' ? 'https://eatpickl.com/' : 'https://bonbirdchicken.com/';
      const gscCache = await store.get(`gscCache:${GSC_URL}`, { type: 'json' }).catch(() => null);

      const gscMap = {};
      if (gscCache?.rows) {
        for (const row of gscCache.rows) {
          if (row.keyword) gscMap[row.keyword.toLowerCase()] = { position: row.position, impressions: row.impressions, ctr: row.ctr };
        }
      }

      if (!audit?.keywords?.length) {
        return { statusCode: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'No audit data for that domain' }) };
      }

      // Enrich audit keywords with our GSC data
      const enriched = audit.keywords.map(k => {
        const kw     = k.keyword.toLowerCase();
        const ourGsc = gscMap[kw];
        const ourPos = ourGsc?.position || null;
        let tier;
        if (ourPos && ourPos <= 3)       tier = 'top3';
        else if (ourPos && ourPos <= 10) tier = 'top10';
        else if (ourPos && ourPos <= 20) tier = 'quick_win';
        else if (ourPos && ourPos <= 50) tier = 'push';
        else                             tier = 'content_gap';

        return {
          ...k,
          ourPosition:  ourPos,
          ourImpressions: ourGsc?.impressions || 0,
          tier,
          isOpportunity: !ourPos || ourPos > 10,
        };
      });

      const opportunities = enriched.filter(k => k.tier !== 'top3').sort((a, b) => {
        // Sort: content gaps first (we're missing), then quick wins, then push
        const tierOrder = { content_gap: 0, push: 1, quick_win: 2, top10: 3, top3: 4 };
        return (tierOrder[a.tier] || 5) - (tierOrder[b.tier] || 5);
      });

      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ audit: enriched, opportunities, gscKeywords: Object.keys(gscMap).length }) };
    }

    // Standard: return stored opportunities
    const data = await store.get(`keywordOpportunities:${brand}`, { type: 'json' }).catch(() => null);
    if (!data) {
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunities: [], summary: {}, updatedAt: null, brand }) };
    }
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify(data) };
  }

  // ── POST: trigger fresh discovery ───────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    const body  = JSON.parse(event.body || '{}');
    const brand = body.brand || 'pickl';
    try {
      const fakeEvent = { queryStringParameters: { brand, force: 'true' } };
      const result = await runDiscovery(fakeEvent);
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        body: result.body };
    } catch (e) {
      return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Method not allowed' }) };
};
