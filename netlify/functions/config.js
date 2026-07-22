// netlify/functions/config.js  →  /api/config
// ─────────────────────────────────────────────────────────────────────────────
// The ONE endpoint every UI dropdown/pill reads to learn which brands exist
// (CLAUDE.md #12). Kills the hardcoded Pickl/Bonbird <option> lists in index.html:
// the frontend fetches this once and renders brand selects/pills dynamically, so a
// brand onboarded via a Blobs record shows up everywhere with no code edit.
//
//   GET  /api/config              → { brands: [ {slug,name,vertical,color,flag,domain,active,...} ], verticals: [...] }
//   GET  /api/config?all=1        → include deactivated brands (admin views)
//   POST /api/config { action:'save_brand', brand:{...} }   (admin/manager) → onboard/edit ONE brand
//   POST /api/config { action:'delete_brand', slug }        (admin only)
//
// GET is gated (authorize) — the brand list + competitor domains are internal, not
// public (CLAUDE.md #11: reads that return non-public data get gated).

const { getBrands, getBrand, setBrand, deleteBrand, VERTICALS } = require('./_lib/brands-config');
const { getMarkets, setMarket, deleteMarket } = require('./_lib/markets-config');
const { authorize, denied } = require('./_lib/auth');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (status, body) => ({ statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const auth = await authorize(event);
  if (!auth.ok) return denied();

  // ── Read: env-var status for a brand (onboarding checklist) ─────────────────
  // Returns BOOLEANS ONLY — never the values. Reports whether the brand's WP + GBP
  // credentials are present in the environment (the wizard uses this for live ✓/⚠).
  if (event.httpMethod === 'GET' && event.queryStringParameters && event.queryStringParameters.envcheck) {
    const slug = String(event.queryStringParameters.envcheck).toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!slug) return json(400, { error: 'invalid slug' });
    const b = await getBrand(slug);
    const prefix = (b && b.wpEnvPrefix) || `WP_${slug.toUpperCase()}`;
    const has = k => !!process.env[k];
    const wpVars  = { base: has(`${prefix}_BASE`), user: has(`${prefix}_USER`), pass: has(`${prefix}_APP_PASS`) };
    const gbpVars = { account: has((b && b.gbpAccountEnv) || `GBP_${slug.toUpperCase()}_ACCOUNT_ID`), location: has((b && b.gbpLocationEnv) || `GBP_${slug.toUpperCase()}_LOCATION_ID`) };
    return json(200, {
      slug,
      wp:  wpVars.base && wpVars.user && wpVars.pass,
      gbp: gbpVars.account && gbpVars.location,
      wpVars, gbpVars,
      names: { wp: [`${prefix}_BASE`, `${prefix}_USER`, `${prefix}_APP_PASS`], gbp: [`GBP_${slug.toUpperCase()}_ACCOUNT_ID`, `GBP_${slug.toUpperCase()}_LOCATION_ID`] },
    });
  }

  // ── Read: brand list for dropdowns ──────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const includeInactive = /(?:^|[?&])all=1/.test(event.rawQuery || event.rawUrl || '') ||
                            (event.queryStringParameters && event.queryStringParameters.all === '1');
    const brands = await getBrands({ activeOnly: !includeInactive });
    const markets = await getMarkets({ activeOnly: !includeInactive });
    return json(200, {
      brands,
      markets,
      verticals: Object.keys(VERTICALS).map(k => ({ key: k, promptNoun: VERTICALS[k].promptNoun })),
    });
  }

  // ── Write: onboard / edit / remove a brand ──────────────────────────────────
  if (event.httpMethod === 'POST') {
    // Mutations spend/change state → session callers must be admin/manager.
    if (auth.via === 'session' && !['admin', 'manager'].includes(auth.user?.role)) {
      return json(403, { error: 'Manager or admin only' });
    }
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
    const action = body.action;

    if (action === 'save_brand') {
      const rec = body.brand;
      if (!rec || !rec.slug) return json(400, { error: 'brand.slug is required' });
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(rec.slug)) return json(400, { error: 'slug must be lowercase alphanumeric (dashes/underscores allowed)' });
      const saved = await setBrand(rec);
      return json(200, { ok: true, brand: saved });
    }

    if (action === 'delete_brand') {
      if (auth.via === 'session' && auth.user?.role !== 'admin') return json(403, { error: 'Admin only' });
      if (!body.slug) return json(400, { error: 'slug is required' });
      if (['pickl', 'bonbird'].includes(body.slug)) return json(400, { error: 'Cannot delete a seed brand — deactivate it instead (active:false)' });
      await deleteBrand(body.slug);
      return json(200, { ok: true });
    }

    // ── SEO markets (NOT the content calendar — that's a separate module) ──────
    if (action === 'save_market') {
      const rec = body.market;
      if (!rec || !rec.brand || !rec.marketKey) return json(400, { error: 'market.brand and market.marketKey are required' });
      rec.key = rec.key || `${rec.brand}_${rec.marketKey}`;
      if (!/^[a-z0-9]+_[a-z0-9_]+$/.test(rec.key)) return json(400, { error: 'market key must be <brand>_<marketKey>, lowercase' });
      const saved = await setMarket(rec);
      return json(200, { ok: true, market: saved });
    }

    if (action === 'delete_market') {
      if (auth.via === 'session' && auth.user?.role !== 'admin') return json(403, { error: 'Admin only' });
      if (!body.key) return json(400, { error: 'key is required' });
      await deleteMarket(body.key);
      return json(200, { ok: true });
    }

    return json(400, { error: 'Unknown action' });
  }

  return json(405, { error: 'Method Not Allowed' });
};
