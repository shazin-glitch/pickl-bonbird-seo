// netlify/functions/market-planner.js
// /api/market-planner — the Market Planner API (see /MARKET-PLANNER-PLAN.md).
// P2: action:'plan' — returns the ranked, deduped content plan for one brand × market
//     (read-only, cheap, no Claude, no writes).
// P3 (later): action:'execute' — loops generate-draft for selected items.
// Gated: returns non-public strategy data, so require a valid session/internal call.

const { authorize, denied } = require('./_lib/auth');
const { buildMarketPlan } = require('./_lib/market-planner');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status, body) => ({ statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const a = await authorize(event);
  if (!a.ok) return denied();

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const action = body.action || 'plan';

  if (action === 'plan') {
    if (!body.brand) return json(400, { error: 'brand is required' });
    try {
      const plan = await buildMarketPlan({ brand: body.brand, market: body.market });
      return json(200, plan);
    } catch (e) {
      console.error('[market-planner] plan failed:', e.message);
      return json(500, { error: e.message });
    }
  }

  // action:'execute' arrives in P3.
  return json(400, { error: `unknown or not-yet-implemented action: ${action}` });
};
