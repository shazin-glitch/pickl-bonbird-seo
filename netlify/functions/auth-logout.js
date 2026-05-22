// netlify/functions/auth-logout.js
// Clears session cookie and removes session from Blobs.
//
// GET /api/auth/logout

const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const cookie = event.headers?.cookie || '';
  const match  = cookie.match(/yolk_session=([^;]+)/);
  const token  = match?.[1];

  if (token) {
    try {
      const store = getStore({
        name:   'seo-tool',
        siteID: process.env.NETLIFY_SITE_ID,
        token:  process.env.NETLIFY_AUTH_TOKEN,
      });
      await store.delete(`userSession:${token}`);
    } catch { /* non-fatal */ }
  }

  return {
    statusCode: 302,
    headers: {
      Location:   '/login.html',
      'Set-Cookie': 'yolk_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    },
    body: '',
  };
};
