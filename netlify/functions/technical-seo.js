// netlify/functions/technical-seo.js
// GET  ?brand=pickl|bonbird  — returns cached audit results from Blobs
// POST {action:'run_audit', brand}  — triggers background audit, returns 202

const { getSetting, setSetting, ok, bad, preflight, parseBody } = require('./_lib/store');

const { authorize, denied, internalHeaders } = require('./_lib/auth');
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  { const _a = await authorize(event); if (!_a.ok) return denied(); }

  const isGet = event.httpMethod === 'GET';
  const brand = isGet
    ? event.queryStringParameters?.brand
    : (parseBody(event) || {}).brand;

  if (!brand || !['pickl', 'bonbird'].includes(brand)) {
    return bad(400, 'brand must be pickl or bonbird');
  }

  // ── GET: return cached results ───────────────────────────────────────────
  if (isGet) {
    const cached = await getSetting(`technicalSeo:${brand}`).catch(() => null);
    return ok(cached || { status: 'no_data', brand });
  }

  // ── POST: trigger background audit ──────────────────────────────────────
  const { action } = parseBody(event) || {};
  if (action !== 'run_audit') return bad(400, 'action must be run_audit');

  // Check not already running
  const existing = await getSetting(`technicalSeo:${brand}`).catch(() => null);
  if (existing?.status === 'running') {
    const ageMs = Date.now() - (existing.startedAt || 0);
    if (ageMs < 5 * 60 * 1000) {
      // Running and less than 5 min old — don't double-trigger
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
               body: JSON.stringify({ status: 'running', message: 'Audit already in progress', startedAt: existing.startedAt }) };
    }
  }

  // Write running state to Blobs so frontend can poll immediately
  await setSetting(`technicalSeo:${brand}`, {
    status:    'running',
    startedAt: Date.now(),
    brand,
    results:   [],
    technicalChecks: null,
    summary:   null,
  });

  // Fire background function (non-blocking — we don't await it)
  const siteUrl = process.env.URL || 'https://yolkseo.netlify.app';
  fetch(`${siteUrl}/.netlify/functions/technical-seo-background`, {
    method:  'POST',
    headers: internalHeaders({ 'Content-Type': 'application/json' }),
    body:    JSON.stringify({ brand }),
  }).catch(e => console.warn('[technical-seo] Background trigger failed:', e.message));

  return {
    statusCode: 202,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ status: 'running', message: 'Audit started. Poll GET /api/technical-seo?brand=' + brand + ' for results.' }),
  };
};
