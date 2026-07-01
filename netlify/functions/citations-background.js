// netlify/functions/citations-background.js
// Automated Monday citation check — runs alongside other Monday crons.
// Monday 4:00am UTC = 8:00am Dubai time (UTC+4)
//
// Checks NAP consistency for both Pickl and Bonbird across 5 UAE food platforms
// via DataForSEO SERP Standard mode. Results stored in citationData:<brand> Blobs.

const { getStore } = require('@netlify/blobs');
const { checkBrand } = require('./citations');
const { authorizeJob } = require('./_lib/auth');

exports.handler = async (event) => {
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not authenticated' }) };
  // On-demand manual check passes ?brand=pickl|bonbird; the Monday cron passes
  // no query string and runs both brands.
  const only   = event?.queryStringParameters?.brand;
  const brands = only && ['pickl', 'bonbird'].includes(only) ? [only] : ['pickl', 'bonbird'];
  console.log(`[citations-bg] Starting citation check run for: ${brands.join(', ')}`);

  const store = getStore({
    name:   'seo-tool',
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  const authHeader = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');

  const results = {};

  for (const brand of brands) {
    try {
      console.log(`[citations-bg] Checking ${brand}…`);
      results[brand] = await checkBrand(brand, store, authHeader);
      console.log(`[citations-bg] ${brand} done — ${results[brand].length} platforms checked`);
    } catch (e) {
      console.error(`[citations-bg] Fatal error for ${brand}:`, e.message);
      results[brand] = { error: e.message };
    }
  }

  console.log('[citations-bg] Done');
  return { statusCode: 200, body: JSON.stringify({ ok: true, results }) };
};
