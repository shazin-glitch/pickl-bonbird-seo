// netlify/functions/auth-login.js
// Initiates Google OAuth.
// ?type=login  → login flow (openid + email scope, state=login)
// ?type=gsc    → GSC flow (webmasters scope, no state) — default for backwards compat

exports.handler = async (event) => {
  const type      = event.queryStringParameters?.type || 'gsc';
  const clientId  = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = 'https://yolkseo.netlify.app/api/auth/callback';

  const isLogin = type === 'login';

  const scope = isLogin
    ? ['openid', 'email', 'profile'].join(' ')
    : ['https://www.googleapis.com/auth/webmasters.readonly', 'openid', 'email'].join(' ');

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope,
    access_type:   'offline',
    prompt:        'consent',
    ...(isLogin ? { state: 'login' } : {}),
  });

  return {
    statusCode: 302,
    headers: { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` },
    body: '',
  };
};
