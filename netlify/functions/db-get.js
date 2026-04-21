const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }, body: '' };
  }

  try {
    const store = getStore({ name: 'seo-tool', consistency: 'strong' });
    const [keywords, compRanks, localChecks, techChecks, dirChecks, gscTokens] = await Promise.all([
      store.get('keywords', { type: 'json' }).catch(() => []),
      store.get('compRanks', { type: 'json' }).catch(() => []),
      store.get('localChecks', { type: 'json' }).catch(() => ({ 1: {}, 2: {} })),
      store.get('techChecks', { type: 'json' }).catch(() => ({})),
      store.get('dirChecks', { type: 'json' }).catch(() => ({ 1: {}, 2: {} })),
      store.get('gscTokens', { type: 'json' }).catch(() => null),
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
        gscTokens: gscTokens || null
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
