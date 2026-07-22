// netlify/functions/gbp-menu.js  →  /api/gbp-menu
// ─────────────────────────────────────────────────────────────────────────────
// Google Business Profile food-menu tooling.
//
// STEP 1 (this file, now): CAPABILITY PROBE — `GET /api/gbp-menu?action=probe&brand=<slug>`
//   Lists every GBP venue for the brand and flags food-menu eligibility
//   (metadata.canHaveFoodMenus) so we can see the real per-venue picture before
//   building the bulk push. Read-only, no writes, no spend.
//
// STEP 2 (later): `POST {action:'push', brand, locationIds:[...], menu}` →
//   PATCH accounts/*/locations/*/updateFoodMenus per SELECTED eligible venue,
//   returning per-venue ✓/skip/fail. (Prices, if ever used, come from a GBP-only
//   source — NEVER brandContext.menu, which is intentionally price-free for SEO.)
//
// Gated (returns non-public location data): session or internal.

const { getStore } = require('@netlify/blobs');
const { getBrands } = require('./_lib/brands-config');
const { authorize, denied } = require('./_lib/auth');

const ACCOUNT_MGMT_BASE = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const BIZ_INFO_BASE     = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const FOOD_BASE         = 'https://mybusiness.googleapis.com/v4'; // food menus live on v4
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (s, b) => ({ statusCode: s, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

function gstore() { return getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN }); }

// Reuse the proven GBP token path (Blobs gbpTokens + refresh). Returns a Bearer
// access token or null if GBP isn't connected.
async function getAccessToken() {
  const store = gstore();
  let tokens; try { tokens = await store.get('gbpTokens', { type: 'json' }); } catch { tokens = null; }
  if (!tokens?.access_token) return null;
  let accessToken = tokens.access_token;
  if (tokens.refresh_token && tokens.expires_at && Date.now() > tokens.expires_at - 60000) {
    try {
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: tokens.refresh_token, grant_type: 'refresh_token' }),
      });
      const rd = await r.json();
      if (rd.access_token) { accessToken = rd.access_token; await store.set('gbpTokens', JSON.stringify({ ...tokens, access_token: accessToken, expires_at: Date.now() + (rd.expires_in || 3600) * 1000 })); }
    } catch (e) { console.warn('[gbp-menu] token refresh failed:', e.message); }
  }
  return accessToken;
}

// A location belongs to a brand if its listing title matches the brand's
// slug/name/brandTerms (same heuristic gbp-data uses — config-driven).
function titleMatchesBrand(title, b) {
  const t = String(title || '').toLowerCase();
  const terms = [b.slug, b.name, ...(b.brandTerms || []), ...(b.brandedTerms || [])].filter(Boolean);
  return terms.some(x => t.includes(String(x).toLowerCase()));
}

// Infer a venue's currency from its address country (menus are priced per currency).
// Keep it conservative + explicit; extend as brands enter new countries.
function currencyForAddress(addr) {
  const c = String(addr?.regionCode || '').toUpperCase();
  const txt = [addr?.administrativeArea, addr?.locality, (addr?.addressLines || []).join(' ')].join(' ').toLowerCase();
  const map = { AE: 'AED', JO: 'JOD', SA: 'SAR', QA: 'QAR', BH: 'BHD', EG: 'EGP', OM: 'OMR', PK: 'PKR', KW: 'KWD' };
  if (map[c]) return map[c];
  if (/jordan|amman/.test(txt)) return 'JOD';
  if (/saudi|riyadh|jeddah/.test(txt)) return 'SAR';
  if (/qatar|doha/.test(txt)) return 'QAR';
  if (/bahrain|manama/.test(txt)) return 'BHD';
  if (/egypt|cairo/.test(txt)) return 'EGP';
  if (/\boman\b|muscat/.test(txt)) return 'OMR';
  if (/pakistan|lahore|karachi/.test(txt)) return 'PKR';
  return 'AED'; // UAE default (16 of 17 Pickl venues)
}

// List a brand's GBP venues (shared by probe + menus). Returns { venues, error? }.
async function listVenues(brand, auth) {
  const b = (await getBrands()).find(x => x.slug === brand);
  if (!b) return { error: `Unknown brand: ${brand}` };
  const accRes = await fetch(`${ACCOUNT_MGMT_BASE}/accounts`, { headers: { Authorization: auth } });
  const accData = await accRes.json();
  if (!accRes.ok) return { error: accData.error?.message || `Accounts API failed (${accRes.status})`, scopeIssue: accRes.status === 401 || accRes.status === 403 };
  const accounts = accData.accounts || [];
  if (!accounts.length) return { venues: [], note: 'No GBP accounts returned for the connected Google account.' };

  const readMask = encodeURIComponent('name,title,storefrontAddress,metadata');
  const venues = [];
  let listErr = null;
  for (const account of accounts.slice(0, 10)) {
    let pageToken = '';
    do {
      const url = `${BIZ_INFO_BASE}/${account.name}/locations?readMask=${readMask}&pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: auth } });
      const data = await res.json();
      if (!res.ok) { listErr = data.error?.message || `Locations API failed (${res.status})`; break; }
      for (const loc of data.locations || []) {
        if (!titleMatchesBrand(loc.title, b)) continue;
        const locId = (loc.name || '').split('/').pop();
        const addr = loc.storefrontAddress;
        const canHave = loc.metadata ? loc.metadata.canHaveFoodMenus : undefined;
        venues.push({
          title: loc.title || locId,
          locationId: `${account.name}/locations/${locId}`, // v4 resource name for updateFoodMenus
          address: addr ? [ (addr.addressLines || []).join(', '), addr.locality, addr.administrativeArea ].filter(Boolean).join(', ') : null,
          currency: currencyForAddress(addr),
          canHaveFoodMenus: canHave === undefined ? null : !!canHave,
        });
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken);
  }
  if (!venues.length && listErr) return { error: listErr };
  return { venues };
}

async function probe(brand, auth) {
  const r = await listVenues(brand, auth);
  if (r.error) return r;
  const venues = r.venues;
  const eligible = venues.filter(v => v.canHaveFoodMenus === true).length;
  const unknown  = venues.filter(v => v.canHaveFoodMenus === null).length;
  return { brand, connected: true, scopeOk: true, total: venues.length, eligible, unknown, venues, note: r.note };
}

// GET one venue's current food menu (for cloning + cross-reference).
async function getMenu(locationId, auth) {
  const res = await fetch(`${FOOD_BASE}/${locationId}/foodMenus`, { headers: { Authorization: auth } });
  const data = await res.json();
  if (!res.ok) return { error: data.error?.message || `getFoodMenus failed (${res.status})`, status: res.status };
  const menus = data.menus || [];
  // Summarise + detect currency from the first priced item.
  let itemCount = 0, currency = null;
  for (const m of menus) for (const sec of (m.sections || [])) for (const it of (sec.items || [])) {
    itemCount++;
    if (!currency && it.attributes?.price?.currencyCode) currency = it.attributes.price.currencyCode;
  }
  return { hasMenu: menus.length > 0 && itemCount > 0, menus, itemCount, currency };
}

// List venues + whether each already has a menu (to pick a clone master).
async function listMenus(brand, auth) {
  const r = await listVenues(brand, auth);
  if (r.error) return r;
  const out = await Promise.all(r.venues.map(async v => {
    const m = await getMenu(v.locationId, auth).catch(() => ({ hasMenu: false }));
    return { ...v, hasMenu: !!m.hasMenu, itemCount: m.itemCount || 0, menuCurrency: m.currency || null };
  }));
  return { brand, venues: out, mastersAvailable: out.filter(v => v.hasMenu).length };
}

// PATCH updateFoodMenus for ONE venue with a given `menus` array. dryRun returns
// the payload without writing.
async function pushToVenue(locationId, menus, auth, dryRun) {
  const body = { name: `${locationId}/foodMenus`, menus };
  if (dryRun) return { locationId, ok: true, dryRun: true };
  const res = await fetch(`${FOOD_BASE}/${locationId}/foodMenus?updateMask=menus`, {
    method: 'PATCH',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) return { locationId, ok: true };
  const err = await res.json().catch(() => ({}));
  return { locationId, ok: false, status: res.status, error: err.error?.message || `updateFoodMenus failed (${res.status})` };
}

function gbpMenuStore() { return gstore(); }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const authz = await authorize(event);
  if (!authz.ok) return denied();
  const q = event.queryStringParameters || {};
  const isPost = event.httpMethod === 'POST';
  let body = {};
  if (isPost) { try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); } }
  const action = (isPost ? body.action : q.action) || 'probe';
  const brand = (isPost ? body.brand : q.brand);
  if (!brand) return json(400, { error: 'brand is required' });

  // Writes (push) require manager/admin on a session; reads allow any valid session.
  if (isPost && authz.via === 'session' && !['admin', 'manager'].includes(authz.user?.role)) {
    return json(403, { error: 'Manager or admin only' });
  }

  // Stored GBP-only menu (NEVER brandContext — SEO stays price-free). Keyed per brand+currency.
  const menuKey = (cur) => `gbpMenu:${brand}:${(cur || 'AED').toUpperCase()}`;

  // loadmenu/savemenu don't need GBP auth.
  if (!isPost && action === 'loadmenu') {
    const cur = q.currency || 'AED';
    const rec = await gbpMenuStore().get(menuKey(cur), { type: 'json' }).catch(() => null);
    return json(200, { brand, currency: cur, menus: rec?.menus || null, savedAt: rec?.savedAt || null });
  }
  if (isPost && action === 'savemenu') {
    if (!Array.isArray(body.menus)) return json(400, { error: 'menus[] required' });
    const cur = body.currency || 'AED';
    await gbpMenuStore().setJSON(menuKey(cur), { menus: body.menus, savedAt: Date.now() });
    return json(200, { ok: true, brand, currency: cur });
  }

  const token = await getAccessToken();
  if (!token) return json(200, { notConnected: true, note: 'Google Business Profile is not connected — connect it in Settings first.' });
  const auth = `Bearer ${token}`;

  try {
    if (action === 'probe')   { const out = await probe(brand, auth);   return json(out.error ? 502 : 200, out); }
    if (action === 'menus')   { const out = await listMenus(brand, auth); return json(out.error ? 502 : 200, out); }
    if (action === 'getmenu') {
      const locationId = isPost ? body.locationId : q.locationId;
      if (!locationId) return json(400, { error: 'locationId required' });
      const out = await getMenu(locationId, auth);
      return json(out.error ? 502 : 200, { brand, locationId, ...out });
    }
    if (isPost && action === 'push') {
      const locationIds = Array.isArray(body.locationIds) ? body.locationIds : [];
      const menus = Array.isArray(body.menus) ? body.menus : null;
      if (!locationIds.length) return json(400, { error: 'locationIds[] required (which venues to push to)' });
      if (!menus) return json(400, { error: 'menus[] required (the FoodMenu to push)' });
      const dryRun = body.dryRun !== false; // SAFE DEFAULT: dry-run unless explicitly {dryRun:false}
      const results = [];
      for (const id of locationIds) { results.push(await pushToVenue(id, menus, auth, dryRun)); } // sequential — gentle on the API
      return json(200, { ok: true, dryRun, pushed: results.filter(r => r.ok && !r.dryRun).length, total: results.length, results });
    }
    return json(400, { error: `Unknown action: ${action}` });
  } catch (e) {
    console.error('[gbp-menu] action failed:', action, e.message);
    return json(500, { error: e.message });
  }
};
