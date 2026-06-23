// netlify/functions/auth-user.js
// Returns current user info and role from session cookie.
// Called on every page load to check if user is authenticated.
//
// GET /api/auth/user
// Returns: { authenticated, email, name, picture, role } or { authenticated: false }

const { getStore } = require('@netlify/blobs');

const BOOTSTRAP_ADMINS = [
  'shazin@yolkbrands.com',
  'steve@yolkbrands.com',
];

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Cookie',
  };

  // Get session token from cookie
  const cookie  = event.headers?.cookie || '';
  const match   = cookie.match(/yolk_session=([^;]+)/);
  const token   = match?.[1];

  if (!token) {
    return { statusCode: 200, headers, body: JSON.stringify({ authenticated: false }) };
  }

  const store = getStore({
    name:   'seo-tool',
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  try {
    const session = await store.get(`userSession:${token}`, { type: 'json' });
    // Reject missing/expired AND legacy sessions that lack `expiresAt` (pre-v7.3.9
    // format). Must match the stricter guard in _lib/auth.js — otherwise such a
    // session reads as "authenticated" here (so the SPA never bounces to login)
    // but every mutation is rejected by _lib/auth, stranding the user "logged in
    // but unable to do anything." Clear the cookie so the next load re-logs in clean.
    if (!session || !session.expiresAt || session.expiresAt < Date.now()) {
      return {
        statusCode: 200,
        headers: { ...headers, 'Set-Cookie': 'yolk_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' },
        body: JSON.stringify({ authenticated: false }),
      };
    }

    // Get role — bootstrap admins always admin
    let role = 'viewer';
    if (BOOTSTRAP_ADMINS.includes(session.email)) {
      role = 'admin';
    } else {
      try {
        const userRecord = await store.get(`userRole:${session.email}`, { type: 'json' });
        role = userRecord?.role || 'viewer';
      } catch {
        role = 'viewer';
      }
    }

    // Get brand + department + markets from userProfile
    let brand = null, department = null, brands = null, markets = null;
    try {
      const profile = await store.get(`userProfile:${session.email}`, { type: 'json' });
      brand      = profile?.brand      || null;
      department = profile?.department || null;
      brands     = profile?.brands     || null;
      markets    = profile?.markets    || null; // null = no restriction; array = allowed market keys
    } catch { /* use null defaults */ }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        authenticated: true,
        email:   session.email,
        name:    session.name,
        picture: session.picture,
        role, brand, department, brands,
        markets, // null = all markets; ['pickl_bahrain','bonbird_qatar',...] = restricted
      }),
    };
  } catch (err) {
    return { statusCode: 200, headers, body: JSON.stringify({ authenticated: false }) };
  }
};
