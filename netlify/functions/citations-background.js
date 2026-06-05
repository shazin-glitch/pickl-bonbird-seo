// netlify/functions/citations-background.js
// Automated Monday citation check — runs alongside other Monday crons.
// Monday 4:00am UTC = 8:00am Dubai time (UTC+4)
//
// Checks NAP consistency for both Pickl and Bonbird across 5 UAE food platforms
// via DataForSEO SERP Standard mode. Results stored in citationData:<brand> Blobs.

const { getStore } = require('@netlify/blobs');
const { checkBrand } = require('./citations');

exports.handler = async () => {
  console.log('[citations-bg] Starting Monday citation check run');

  const store = getStore({
    name:   'seo-tool',
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  const authHeader = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');

  const results = {};

  for (const brand of ['pickl', 'bonbird']) {
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
