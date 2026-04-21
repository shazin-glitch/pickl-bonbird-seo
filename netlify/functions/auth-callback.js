const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const { code, error } = event.queryStringParameters || {};

  if (error) {
    return { statusCode: 302, headers: { Location: '/?gsc_error=' + encodeURIComponent(error) }, body: '' };
  }

  if (!code) {
    return { statusCode: 302, headers: { Location: '/?gsc_error=no_code' }, body: '' };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = 'https://yolkseo.netlify.app/api/auth/callback';

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenRes.json();

    if (tokens.error) {
      return { statusCode: 302, headers: { Location: '/?gsc_error=' + encodeURIComponent(tokens.error_description || tokens.error) }, body: '' };
    }

    // Save tokens to shared Blobs store — available to all users
    const store = getStore({ name: 'seo-tool', consistency: 'strong', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    await store.setJSON('gscTokens', {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expires_at: Date.now() + (tokens.expires_in || 3600) * 1000
    });

    // Redirect back with just a success flag — no tokens in URL
    return {
      statusCode: 302,
      headers: { Location: '/?gsc_connected=1' },
      body: ''
    };
  } catch (err) {
    return { statusCode: 302, headers: { Location: '/?gsc_error=' + encodeURIComponent(err.message) }, body: '' };
  }
};
