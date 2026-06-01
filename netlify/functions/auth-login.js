// netlify/functions/auth-login.js
// Initiates Google OAuth.
// ?type=login  → login flow (openid + email scope, state=login)
// ?type=gsc    → GSC flow (webmasters scope) — default
// ?type=gbp    → Google Business Profile flow (business.manage scope, state=gbp)

exports.handler = async (event) => {
  const type       = event.queryStringParameters?.type || 'gsc';
  const clientId   = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = 'https://yolkseo.netlify.app/api/auth/callback';

  const isLogin = type === 'login';
  const isGbp   = type === 'gbp';

  let scope;
  if (isLogin) {
    scope = ['openid', 'email', 'profile'].join(' ');
  } else if (isGbp) {
    scope = [
      'https://www.googleapis.com/auth/business.manage',
      'openid',
      'email',
    ].join(' ');
  } else {
    // GSC (default)
    scope = ['https://www.googleapis.com/auth/webmasters.readonly', 'openid', 'email'].join(' ');
  }

  const state = isLogin ? 'login' : isGbp ? 'gbp' : undefined;

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope,
    access_type:   'offline',
    prompt:        'consent',
    ...(state ? { state } : {}),
  });

  return {
    statusCode: 302,
    headers: { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` },
    body: '',
  };
};
