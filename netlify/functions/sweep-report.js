// netlify/functions/sweep-report.js
// Read endpoint for the international meta-sweep run report.
// GET ?brand=pickl|bonbird&market=bahrain → { brand, market, reports: { en, ar, ur } }
// Each report: { at, queued, skipped, skipReason, discovered[], excluded[], decisions[] }
// where decisions = [{ slug, action: 'queued'|'skipped', reason }].
// Written by international-seo-background.js (runMarketPageMetaSweep → processMarketLanguage).
// Gives per-page "why did/didn't this generate?" visibility without hunting Netlify logs.

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

  const brand  = event.queryStringParameters?.brand || 'pickl';
  const market = event.queryStringParameters?.market;
  if (!market) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'market required, e.g. ?brand=pickl&market=bahrain' }) };
  }

  const reports = {};
  for (const lang of ['en', 'ar', 'ur']) {
    try {
      const data = await store.get(`sweepReport:${brand}:${market}:${lang}`, { type: 'json' });
      if (data) reports[lang] = data;
    } catch { /* no report for this language — skip */ }
  }

  return { statusCode: 200, headers, body: JSON.stringify({ brand, market, reports }) };
};
