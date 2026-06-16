const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); } catch (e) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { site_url } = body;
  if (!site_url) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing site_url' }) };
  }

  try {
    // Load shared tokens from Blobs
    const store = getStore({ name: 'seo-tool', consistency: 'strong', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    const gscTokens = await store.get('gscTokens', { type: 'json' }).catch(() => null);

    if (!gscTokens || !gscTokens.access_token) {
      return { statusCode: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'GSC not connected. Please connect via the tool first.' }) };
    }

    let token = gscTokens.access_token;

    // Refresh token if expired or close to expiry
    if (gscTokens.refresh_token && gscTokens.expires_at && Date.now() > gscTokens.expires_at - 60000) {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: gscTokens.refresh_token,
          grant_type: 'refresh_token'
        })
      });
      const refreshData = await refreshRes.json();
      if (refreshData.access_token) {
        token = refreshData.access_token;
        // Save refreshed token back to shared store
        await store.setJSON('gscTokens', {
          ...gscTokens,
          access_token: token,
          expires_at: Date.now() + (refreshData.expires_in || 3600) * 1000
        });
      }
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);
    const fmt = d => d.toISOString().split('T')[0];

    const gscUrl = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site_url)}/searchAnalytics/query`;
    const commonHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    const dateBody = { startDate: fmt(startDate), endDate: fmt(endDate), dataState: 'final' };

    // Fetch keyword rows and page rows in parallel
    const [gscRes, pageRes] = await Promise.all([
      fetch(gscUrl, {
        method: 'POST',
        headers: commonHeaders,
        body: JSON.stringify({ ...dateBody, dimensions: ['query'], rowLimit: 500 })
      }),
      fetch(gscUrl, {
        method: 'POST',
        headers: commonHeaders,
        body: JSON.stringify({ ...dateBody, dimensions: ['page'], rowLimit: 500 })
      }),
    ]);

    const [gscData, pageData] = await Promise.all([gscRes.json(), pageRes.json()]);

    if (gscData.error) {
      return { statusCode: gscRes.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: gscData.error.message || 'GSC API error' }) };
    }

    const rows = (gscData.rows || []).map(row => ({
      keyword: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,  // decimal 0-1 as returned by GSC API — do NOT pre-multiply
      position: Math.round(row.position * 10) / 10
    }));

    const pages = (pageData.rows || []).map(row => ({
      url: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: Math.round(row.position * 10) / 10
    }));

    // Cache in Blobs so scheduler can read without re-fetching
    try {
      await store.setJSON('gscCache:' + site_url, { rows, pages, cachedAt: Date.now() });
    } catch (_) {}

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ rows, pages })
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) };
  }
};
