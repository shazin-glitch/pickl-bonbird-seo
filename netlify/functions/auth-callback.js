exports.handler = async (event) => {
  const { code, error } = event.queryStringParameters || {};

  if (error) {
    return {
      statusCode: 302,
      headers: { Location: '/?gsc_error=' + encodeURIComponent(error) },
      body: ''
    };
  }

  if (!code) {
    return {
      statusCode: 302,
      headers: { Location: '/?gsc_error=no_code' },
      body: ''
    };
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
      return {
        statusCode: 302,
        headers: { Location: '/?gsc_error=' + encodeURIComponent(tokens.error_description || tokens.error) },
        body: ''
      };
    }

    const params = new URLSearchParams({
      gsc_access_token: tokens.access_token,
      gsc_refresh_token: tokens.refresh_token || '',
      gsc_expires_in: tokens.expires_in || 3600
    });

    return {
      statusCode: 302,
      headers: { Location: '/?' + params.toString() },
      body: ''
    };
  } catch (err) {
    return {
      statusCode: 302,
      headers: { Location: '/?gsc_error=' + encodeURIComponent(err.message) },
      body: ''
    };
  }
};
