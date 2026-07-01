// netlify/functions/content-outcomes.js
// Read endpoint for closed-loop ranking attribution (gap #4).
// GET ?brand=pickl|bonbird|all → { [brand]: { totals, outcomes, updatedAt } }
// Data is written by content-outcomes-background.js.

const { getStore } = require('@netlify/blobs');

const { authorize, denied } = require('./_lib/auth');
exports.handler = async (event) => {
  if (event.httpMethod !== 'OPTIONS') { const _a = await authorize(event); if (!_a.ok) return denied(); }
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const store = getStore({
    name:   'seo-tool',
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  const brandParam = event.queryStringParameters?.brand || 'all';
  const brands     = brandParam === 'all' ? ['pickl', 'bonbird'] : [brandParam];

  const result = {};
  for (const brand of brands) {
    try {
      const data = await store.get(`contentOutcomes:${brand}`, { type: 'json' });
      result[brand] = data || { brand, totals: null, outcomes: [], updatedAt: null };
    } catch {
      result[brand] = { brand, totals: null, outcomes: [], updatedAt: null };
    }
  }

  return { statusCode: 200, headers, body: JSON.stringify(result) };
};
