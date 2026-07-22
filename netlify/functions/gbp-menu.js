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

async function probe(brand, auth) {
  const brands = await getBrands();
  const b = brands.find(x => x.slug === brand);
  if (!b) return { error: `Unknown brand: ${brand}` };

  const accRes = await fetch(`${ACCOUNT_MGMT_BASE}/accounts`, { headers: { Authorization: auth } });
  const accData = await accRes.json();
  if (!accRes.ok) return { error: accData.error?.message || `Accounts API failed (${accRes.status})`, scopeIssue: accRes.status === 401 || accRes.status === 403 };
  const accounts = accData.accounts || [];
  if (!accounts.length) return { brand, connected: true, venues: [], note: 'No GBP accounts returned for the connected Google account.' };

  // metadata carries canHaveFoodMenus (food-menu eligibility).
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
          // true / false / null(=unknown — metadata field absent on this location)
          canHaveFoodMenus: canHave === undefined ? null : !!canHave,
        });
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken);
  }
  if (!venues.length && listErr) return { error: listErr };

  const eligible = venues.filter(v => v.canHaveFoodMenus === true).length;
  const unknown  = venues.filter(v => v.canHaveFoodMenus === null).length;
  return {
    brand, connected: true, scopeOk: true,
    total: venues.length, eligible, unknown,
    venues,
    note: unknown ? `${unknown} venue(s) didn't report the food-menu flag — a live push attempt will confirm eligibility for those.` : undefined,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const authz = await authorize(event);
  if (!authz.ok) return denied();

  const q = event.queryStringParameters || {};
  const action = q.action || 'probe';
  const brand = q.brand;
  if (!brand) return json(400, { error: 'brand is required' });

  const token = await getAccessToken();
  if (!token) return json(200, { notConnected: true, note: 'Google Business Profile is not connected — connect it in Settings first.' });
  const auth = `Bearer ${token}`;

  if (action === 'probe') {
    try {
      const out = await probe(brand, auth);
      return json(out.error ? 502 : 200, out);
    } catch (e) {
      console.error('[gbp-menu] probe failed:', e.message);
      return json(500, { error: e.message });
    }
  }
  return json(400, { error: `Unknown action: ${action} (push comes after the probe is validated)` });
};
