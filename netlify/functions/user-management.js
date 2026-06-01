// netlify/functions/user-management.js
// Admin-only user management.
//
// GET  /api/users          — list all users
// POST /api/users          — add user { email, role, brands[], department }
// PUT  /api/users          — update { email, role?, brands[]?, brand?, department? }
// DELETE /api/users?email= — remove user
//
// brands: array of brand strings or ['all'] for full access
// Backward compat: single brand string in userProfile still supported

const { getStore } = require('@netlify/blobs');

const BOOTSTRAP_ADMINS  = ['shazin@yolkbrands.com', 'steve@yolkbrands.com'];
const VALID_ROLES       = ['viewer', 'manager', 'admin', 'developer'];
const VALID_BRANDS      = ['pickl', 'bonbird', 'southpour', 'shadowburg', 'shadowbird', 'all'];
const VALID_DEPARTMENTS = ['seo', 'social', 'design', 'content', 'all'];

async function getCallerRole(event, store) {
  const cookie = event.headers?.cookie || '';
  const match  = cookie.match(/yolk_session=([^;]+)/);
  const token  = match?.[1];
  if (!token) return null;
  try {
    const session = await store.get(`userSession:${token}`, { type: 'json' });
    if (!session || session.expiresAt < Date.now()) return null;
    if (BOOTSTRAP_ADMINS.includes(session.email)) return 'admin';
    const rec = await store.get(`userRole:${session.email}`, { type: 'json' });
    return rec?.role || 'viewer';
  } catch { return null; }
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Cookie',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const store = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });

  const callerRole = await getCallerRole(event, store);
  if (callerRole !== 'admin') {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin access required' }) };
  }

  try {
    // ── GET ───────────────────────────────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      let index = [];
      try { const idx = await store.get('userIndex', { type: 'json' }); index = idx?.emails || []; } catch {}
      for (const email of BOOTSTRAP_ADMINS) { if (!index.includes(email)) index.push(email); }

      const users = await Promise.all(index.map(async (email) => {
        let role = BOOTSTRAP_ADMINS.includes(email) ? 'admin' : 'viewer';
        let name = '', lastLogin = null, brands = null, department = null;
        try {
          const rec = await store.get(`userRole:${email}`, { type: 'json' });
          if (rec) { role = rec.role || role; name = rec.name || ''; lastLogin = rec.lastLogin || null; }
        } catch {}
        try {
          const profile = await store.get(`userProfile:${email}`, { type: 'json' });
          // Support both old single brand and new brands array
          if (profile?.brands) {
            brands = profile.brands;
          } else if (profile?.brand) {
            brands = [profile.brand];
          }
          department = profile?.department || null;
        } catch {}
        return { email, role, name, lastLogin, brands, department, isBootstrap: BOOTSTRAP_ADMINS.includes(email) };
      }));

      return { statusCode: 200, headers, body: JSON.stringify({ users }) };
    }

    // ── POST ──────────────────────────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { email, role, brands, department } = body;
      if (!email || !role) return { statusCode: 400, headers, body: JSON.stringify({ error: 'email and role required' }) };
      if (!VALID_ROLES.includes(role)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid role' }) };

      const normalised = email.trim().toLowerCase();
      await store.set(`userRole:${normalised}`, JSON.stringify({ email: normalised, role, addedAt: new Date().toISOString() }));

      // Save profile with brands array + department
      const brandsArr = normaliseBrands(brands);
      await store.set(`userProfile:${normalised}`, JSON.stringify({
        email: normalised,
        brands: brandsArr,
        brand: brandsArr[0] || null, // backward compat single
        department: (department && VALID_DEPARTMENTS.includes(department)) ? department : null,
        updatedAt: new Date().toISOString(),
      }));

      let index = [];
      try { const idx = await store.get('userIndex', { type: 'json' }); index = idx?.emails || []; } catch {}
      if (!index.includes(normalised)) { index.push(normalised); await store.set('userIndex', JSON.stringify({ emails: index })); }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, email: normalised, role }) };
    }

    // ── PUT ───────────────────────────────────────────────────────────────────
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { email, role, brands, brand, department } = body;
      if (!email) return { statusCode: 400, headers, body: JSON.stringify({ error: 'email required' }) };

      const normalised = email.trim().toLowerCase();

      if (role) {
        if (!VALID_ROLES.includes(role)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid role' }) };
        let existing = {};
        try { existing = await store.get(`userRole:${normalised}`, { type: 'json' }) || {}; } catch {}
        await store.set(`userRole:${normalised}`, JSON.stringify({ ...existing, email: normalised, role, updatedAt: new Date().toISOString() }));
      }

      if (brands !== undefined || brand !== undefined || department !== undefined) {
        let existing = {};
        try { existing = await store.get(`userProfile:${normalised}`, { type: 'json' }) || {}; } catch {}

        let brandsArr = existing.brands || (existing.brand ? [existing.brand] : []);
        if (brands !== undefined) brandsArr = normaliseBrands(brands);
        else if (brand !== undefined) brandsArr = normaliseBrands([brand]);

        if (department !== undefined && department && !VALID_DEPARTMENTS.includes(department)) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid department' }) };
        }

        await store.set(`userProfile:${normalised}`, JSON.stringify({
          ...existing,
          email: normalised,
          brands: brandsArr,
          brand: brandsArr[0] || null, // backward compat
          department: department ?? existing.department,
          updatedAt: new Date().toISOString(),
        }));
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (event.httpMethod === 'DELETE') {
      const email = event.queryStringParameters?.email?.trim().toLowerCase();
      if (!email) return { statusCode: 400, headers, body: JSON.stringify({ error: 'email required' }) };
      if (BOOTSTRAP_ADMINS.includes(email)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Cannot remove bootstrap admin' }) };

      await store.delete(`userRole:${email}`);
      let index = [];
      try { const idx = await store.get('userIndex', { type: 'json' }); index = idx?.emails || []; } catch {}
      index = index.filter(e => e !== email);
      await store.set('userIndex', JSON.stringify({ emails: index }));
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('[user-management] Error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

// Normalise brands input to clean array, validate each entry
function normaliseBrands(input) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : [input];
  return arr.map(b => b?.toString().trim().toLowerCase()).filter(b => VALID_BRANDS.includes(b));
}
