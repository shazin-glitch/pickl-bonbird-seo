exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON' })
    };
  }

  const { access_token, refresh_token, site_url } = body;

  if (!access_token || !site_url) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing access_token or site_url' })
    };
  }

  // Try to refresh token if needed
  let token = access_token;
  if (refresh_token) {
    try {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token,
          grant_type: 'refresh_token'
        })
      });
      const refreshData = await refreshRes.json();
      if (refreshData.access_token) token = refreshData.access_token;
    } catch (e) {
      // continue with original token
    }
  }

  // Get date range - last 90 days
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);
  const fmt = d => d.toISOString().split('T')[0];

  try {
    const gscRes = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site_url)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ['query'],
          rowLimit: 500,
          dataState: 'final'
        })
      }
    );

    const gscData = await gscRes.json();

    if (gscData.error) {
      return {
        statusCode: gscRes.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: gscData.error.message || 'GSC API error' })
      };
    }

    const rows = (gscData.rows || []).map(row => ({
      keyword: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: Math.round(row.ctr * 1000) / 10,
      position: Math.round(row.position * 10) / 10
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ rows, refreshed_token: token !== access_token ? token : null })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
