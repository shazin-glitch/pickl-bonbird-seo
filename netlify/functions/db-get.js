const { getStore } = require('@netlify/blobs');
const { authorize, denied } = require('./_lib/auth');

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
    const [keywords, compRanks, localChecks, techChecks, dirChecks, gscTokens, brandCtxPickl, brandCtxBonbird, slackWebhookUrl, perfSummPickl, perfSummBonbird] = await Promise.all([
      store.get('keywords', { type: 'json' }).catch(() => []),
      store.get('compRanks', { type: 'json' }).catch(() => []),
      store.get('localChecks', { type: 'json' }).catch(() => ({ 1: {}, 2: {} })),
      store.get('techChecks', { type: 'json' }).catch(() => ({})),
      store.get('dirChecks', { type: 'json' }).catch(() => ({ 1: {}, 2: {} })),
      store.get('gscTokens', { type: 'json' }).catch(() => null),
      store.get('brandContext:pickl', { type: 'json' }).catch(() => null),
      store.get('brandContext:bonbird', { type: 'json' }).catch(() => null),
      store.get('slackWebhookUrl', { type: 'json' }).catch(() => null),
      store.get('performanceSummary:pickl', { type: 'json' }).catch(() => null),
      store.get('performanceSummary:bonbird', { type: 'json' }).catch(() => null),
    ]);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        keywords: keywords || [],
        compRanks: compRanks || [],
        localChecks: localChecks || { 1: {}, 2: {} },
        techChecks: techChecks || {},
        dirChecks: dirChecks || { 1: {}, 2: {} },
        gscTokens: gscTokens || null,
        brandContext_pickl: brandCtxPickl || null,
        brandContext_bonbird: brandCtxBonbird || null,
        slackWebhookUrl: slackWebhookUrl || null,
        performanceSummary_pickl: perfSummPickl || null,
        performanceSummary_bonbird: perfSummBonbird || null,
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
