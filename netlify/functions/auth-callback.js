// netlify/functions/auth-callback.js
// Handles both login OAuth and GSC OAuth callbacks.
// Differentiates via ?state= param or scope in token response.
//
// Login flow:  /api/auth/login?type=login → callback → session cookie → /
// GSC flow:    /api/auth/login (existing) → callback → gscTokens blob → /

const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

const BOOTSTRAP_ADMINS = [
  'shazin@yolkbrands.com',
  'steve@yolkbrands.com',
];

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

exports.handler = async (event) => {
  const { code, error, state } = event.queryStringParameters || {};

  if (error) {
    return { statusCode: 302, headers: { Location: '/login.html?error=' + encodeURIComponent(error) }, body: '' };
  }
  if (!code) {
    return { statusCode: 302, headers: { Location: '/login.html?error=no_code' }, body: '' };
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri  = 'https://yolkseo.netlify.app/api/auth/callback';
  const isLoginFlow  = state === 'login';

  const store = getStore({
    name:   'seo-tool',
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (tokens.error) {
      const dest = isLoginFlow ? '/login.html' : '/';
      return { statusCode: 302, headers: { Location: `${dest}?error=${encodeURIComponent(tokens.error_description || tokens.error)}` }, body: '' };
    }

    if (isLoginFlow) {
      // ── LOGIN FLOW: get user info, check access, create session ───────────

      // Decode id_token to get user info (Google signs it — safe to decode payload)
      const idToken   = tokens.id_token;
      const payload   = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());
      const email     = (payload.email || '').toLowerCase();
      const name      = payload.name || email;
      const picture   = payload.picture || '';

      // Check if user has access
      const isBootstrap = BOOTSTRAP_ADMINS.includes(email);
      let hasAccess = isBootstrap;
      let role = 'admin';

      if (!isBootstrap) {
        try {
          const userRecord = await store.get(`userRole:${email}`, { type: 'json' });
          if (userRecord?.role) {
            hasAccess = true;
            role = userRecord.role;
          }
        } catch { /* no record */ }
      }

      if (!hasAccess) {
        return {
          statusCode: 302,
          headers: { Location: '/login.html?error=access_denied' },
          body: '',
        };
      }

      // Create session
      const sessionToken = generateToken();
      await store.set(`userSession:${sessionToken}`, JSON.stringify({
        email,
        name,
        picture,
        role,
        createdAt:  Date.now(),
        expiresAt:  Date.now() + SESSION_TTL_MS,
      }));

      // Update last login on user record
      try {
        let existing = {};
        try { existing = await store.get(`userRole:${email}`, { type: 'json' }) || {}; } catch { /* new user */ }
        await store.set(`userRole:${email}`, JSON.stringify({
          ...existing,
          email,
          name,
          picture,
          role: isBootstrap ? 'admin' : (existing.role || 'viewer'),
          lastLogin: new Date().toISOString(),
        }));

        // Add to user index if not present
        let index = [];
        try { const idx = await store.get('userIndex', { type: 'json' }); index = idx?.emails || []; } catch { /* empty */ }
        if (!index.includes(email)) {
          index.push(email);
          await store.set('userIndex', JSON.stringify({ emails: index }));
        }
      } catch { /* non-fatal */ }

      return {
        statusCode: 302,
        headers: {
          Location:     '/',
          'Set-Cookie': `yolk_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`,
        },
        body: '',
      };

    } else {
      // ── GSC FLOW: save tokens to Blobs (existing behaviour) ───────────────
      await store.set('gscTokens', JSON.stringify({
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expires_at:    Date.now() + (tokens.expires_in || 3600) * 1000,
      }));

      return {
        statusCode: 302,
        headers: { Location: '/?gsc_connected=1' },
        body: '',
      };
    }

  } catch (err) {
    const dest = isLoginFlow ? '/login.html' : '/';
    return { statusCode: 302, headers: { Location: `${dest}?error=${encodeURIComponent(err.message)}` }, body: '' };
  }
};
