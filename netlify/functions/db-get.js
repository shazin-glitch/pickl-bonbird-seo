const { getStore } = require('@netlify/blobs');
const { authorize, denied } = require('./_lib/auth');
const { getBrandSlugs } = require('./_lib/brands-config');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Nest-Internal', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }, body: '' };
  }

  // SECURITY: this returns gscTokens (Google OAuth) + slackWebhookUrl + brand context.
  // MUST require a valid session or internal header — never expose these anonymously.
  const auth = await authorize(event);
  if (!auth.ok) return denied('Not authenticated — sign in to The Nest.');

  try {
    const store = getStore({ name: 'seo-tool', consistency: 'strong', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    const slugs = await getBrandSlugs();
    const [keywords, compRanks, localChecks, techChecks, dirChecks, gscTokens, slackWebhookUrl] = await Promise.all([
      store.get('keywords', { type: 'json' }).catch(() => []),
      store.get('compRanks', { type: 'json' }).catch(() => []),
      store.get('localChecks', { type: 'json' }).catch(() => ({ 1: {}, 2: {} })),
      store.get('techChecks', { type: 'json' }).catch(() => ({})),
      store.get('dirChecks', { type: 'json' }).catch(() => ({ 1: {}, 2: {} })),
      store.get('gscTokens', { type: 'json' }).catch(() => null),
      store.get('slackWebhookUrl', { type: 'json' }).catch(() => null),
    ]);

    // Per-brand context + performance summaries — config-driven so a newly
    // onboarded brand's records are included (still emits brandContext_<slug> /
    // performanceSummary_<slug> keys the frontend already reads for pickl/bonbird).
    const brandCtx = await Promise.all(slugs.map(s => store.get(`brandContext:${s}`, { type: 'json' }).catch(() => null)));
    const perfSumm = await Promise.all(slugs.map(s => store.get(`performanceSummary:${s}`, { type: 'json' }).catch(() => null)));

    const payload = {
      keywords: keywords || [],
      compRanks: compRanks || [],
      localChecks: localChecks || { 1: {}, 2: {} },
      techChecks: techChecks || {},
      dirChecks: dirChecks || { 1: {}, 2: {} },
      gscTokens: gscTokens || null,
      slackWebhookUrl: slackWebhookUrl || null,
    };
    slugs.forEach((s, i) => {
      payload[`brandContext_${s}`] = brandCtx[i] || null;
      payload[`performanceSummary_${s}`] = perfSumm[i] || null;
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(payload)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
