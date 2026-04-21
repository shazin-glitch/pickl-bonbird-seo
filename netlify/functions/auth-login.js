exports.handler = async () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = 'https://yolkseo.netlify.app/api/auth/callback';

  const scope = [
    'https://www.googleapis.com/auth/webmasters.readonly',
    'openid',
    'email'
  ].join(' ');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    access_type: 'offline',
    prompt: 'consent'
  });

  return {
    statusCode: 302,
    headers: {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    },
    body: ''
  };
};
