const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  try {
    const store = getStore({ name: 'seo-tool', consistency: 'strong' });
    const saves = [];

    if (body.keywords !== undefined) saves.push(store.setJSON('keywords', body.keywords));
    if (body.compRanks !== undefined) saves.push(store.setJSON('compRanks', body.compRanks));
    if (body.localChecks !== undefined) saves.push(store.setJSON('localChecks', body.localChecks));
    if (body.techChecks !== undefined) saves.push(store.setJSON('techChecks', body.techChecks));
    if (body.dirChecks !== undefined) saves.push(store.setJSON('dirChecks', body.dirChecks));
    if (body.gscTokens !== undefined) saves.push(store.setJSON('gscTokens', body.gscTokens));

    await Promise.all(saves);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
