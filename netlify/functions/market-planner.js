// netlify/functions/market-planner.js
// /api/market-planner — Market Planner API (see /MARKET-PLANNER-PLAN.md).
// The plan build runs a Claude clustering call too slow for the synchronous function
// limit, so it's async: 'plan' fires the background worker + returns 202; 'get' polls
// the stored plan. Gated (returns non-public strategy data). P3 adds 'execute'.

const { authorize, denied, internalHeaders } = require('./_lib/auth');
const { getStore } = require('@netlify/blobs');
const { planItemToDraftCall, selectPlanItems, MAX_EXECUTE } = require('./_lib/market-planner');

function store() {
  return getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
}
const KEY     = (b, m) => `marketPlan:${b}:${m || 'uae'}`;
const RUN_KEY = (b, m) => `marketPlanRun:${b}:${m || 'uae'}`;
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
  const action = body.action || 'get';
  const brand  = body.brand;
  const market = body.market;
  if (!brand) return json(400, { error: 'brand is required' });
  const key = KEY(brand, market);

  // ── Kick off a build (background — the Claude call is too slow for sync). ──
  if (action === 'plan') {
    // Don't double-fire: if a build started < 3 min ago, just report building.
    const existing = await store().get(key, { type: 'json' }).catch(() => null);
    if (existing && existing.status === 'building' && (Date.now() - (existing.startedAt || 0) < 3 * 60 * 1000)) {
      return json(200, { status: 'building', startedAt: existing.startedAt });
    }
    await store().setJSON(key, { brand, market: market || 'uae', status: 'building', startedAt: Date.now() });
    const base = process.env.URL || 'https://yolkseo.netlify.app';
    try {
      await fetch(`${base}/.netlify/functions/market-planner-background`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ brand, market }),
      });
    } catch (e) { console.warn('[market-planner] bg trigger failed:', e.message); }
    return json(202, { status: 'building' });
  }

  // ── Poll the stored plan. ──
  if (action === 'get') {
    const p = await store().get(key, { type: 'json' }).catch(() => null);
    return json(200, p || { status: 'none' });
  }

  // ── P3a EXECUTE — generate the selected plan items via generate-draft. ──
  // dryRun (DEFAULT true) returns the exact calls it WOULD make: no Claude spend, no
  // writes, synchronous. dryRun:false hands the loop to a background function (N
  // generations at ~15–20s each blow past the sync limit) and returns 202 to poll.
  if (action === 'execute') {
    // Generation spends Claude → same bar as generate-draft itself.
    if (a.via === 'session' && !['admin', 'manager'].includes(a.user?.role)) {
      return json(403, { error: 'Manager or admin only' });
    }
    const plan = await store().get(key, { type: 'json' }).catch(() => null);
    if (!plan || plan.status !== 'ready') {
      return json(409, { error: `No ready plan for ${brand}/${market || 'uae'} — build one first (action:'plan').`, status: plan?.status || 'none' });
    }

    const selected = selectPlanItems(plan.items, { select: body.items, topN: body.topN, max: body.max });
    if (!selected.length) {
      return json(400, { error: "Nothing selected — pass items:[keyword|index,…] or topN.", planTotal: (plan.items || []).length });
    }

    // Translate every selection up-front so un-executable items surface BEFORE any spend.
    const mapped = selected.map(it => {
      const r = planItemToDraftCall(it, { brand, market: plan.market });
      return { keyword: it.keyword, assetType: it.assetType, priority: it.priority ?? null,
        rationale: it.rationale || '', call: r.call || null, error: r.error || null };
    });
    const runnable = mapped.filter(m => m.call);

    const dryRun = body.dryRun !== false;   // default true — must opt IN to spending
    if (dryRun) {
      return json(200, { ok: true, dryRun: true, brand, market: plan.market,
        selected: mapped.length, runnable: runnable.length,
        skipped: mapped.filter(m => m.error), calls: mapped, cap: MAX_EXECUTE });
    }
    if (!runnable.length) return json(400, { error: 'No executable items in the selection.', calls: mapped });

    // Don't double-fire a run that's still going (15-min background budget).
    const runKey = RUN_KEY(brand, plan.market);
    const prev = await store().get(runKey, { type: 'json' }).catch(() => null);
    if (prev && prev.status === 'running' && (Date.now() - (prev.startedAt || 0) < 15 * 60 * 1000)) {
      return json(200, { status: 'running', startedAt: prev.startedAt, done: prev.done || 0, total: prev.total || 0 });
    }

    const startedAt = Date.now();
    await store().setJSON(runKey, {
      brand, market: plan.market, status: 'running', startedAt, done: 0, total: runnable.length,
      startedBy: a.via === 'session' ? (a.user?.email || 'user') : 'internal',
      results: [], skipped: mapped.filter(m => m.error),
    });
    const base = process.env.URL || 'https://yolkseo.netlify.app';
    try {
      await fetch(`${base}/.netlify/functions/market-planner-execute-background`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ brand, market: plan.market, calls: runnable }),
      });
    } catch (e) { console.warn('[market-planner] execute bg trigger failed:', e.message); }
    return json(202, { status: 'running', total: runnable.length, startedAt });
  }

  // ── Poll an execute run. ──
  if (action === 'run') {
    const r = await store().get(RUN_KEY(brand, market), { type: 'json' }).catch(() => null);
    return json(200, r || { status: 'none' });
  }

  return json(400, { error: `unknown action: ${action}` });
};
