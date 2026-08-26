// P3a offline verification — mocks Blobs + fetch. NO network, NO Claude, NO writes.
const path = require('path');
const FN = path.join(__dirname, '..', 'netlify', 'functions');

// ── mock @netlify/blobs ────────────────────────────────────────────────
const KV = new Map();
const blobsPath = require.resolve('@netlify/blobs', { paths: [FN] });
require.cache[blobsPath] = { id: blobsPath, filename: blobsPath, loaded: true, exports: {
  getStore: () => ({
    get: async (k) => KV.has(k) ? JSON.parse(KV.get(k)) : null,
    setJSON: async (k, v) => { KV.set(k, JSON.stringify(v)); },
  }),
}};

// ── mock auth (so we control the caller identity) ──────────────────────
const authPath = require.resolve(path.join(FN, '_lib/auth.js'));
let AUTH = { ok: true, via: 'session', user: { email: 'shazin@yolkbrands.com', role: 'admin' } };
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  authorize: async () => AUTH,
  authorizeJob: async () => ({ ok: true }),
  denied: () => ({ statusCode: 401, body: '{"error":"denied"}' }),
  internalHeaders: (e = {}) => ({ 'x-nest-internal': 'TESTTOKEN', ...e }),
}};

// ── mock fetch: record calls, never leave the machine ──────────────────
const SENT = [];
let fetchImpl = async (url, opts) => {
  const body = JSON.parse(opts.body);
  SENT.push({ url, body });
  if (url.includes('generate-draft')) {
    if (body.keyword === 'paused kw')   return { status: 200, json: async () => ({ ok: false, paused: true, reason: 'brand paused' }) };
    if (body.keyword === 'cannibal kw') return { status: 200, json: async () => ({ ok: true, skipped: true, cannibalization: true, reason: 'already ranks' }) };
    if (body.keyword === 'boom kw')     throw new Error('socket hang up');
    if (body.keyword === 'bad kw')      return { status: 500, json: async () => ({ error: 'generation failed' }) };
    return { status: 200, json: async () => ({ ok: true, item: { id: 'appr_' + body.keyword.replace(/\W/g, ''), title: `Draft: ${body.keyword}` } }) };
  }
  if (url.includes('/wordpress')) {
    const u = body.payload && body.payload.url;
    // Only /pk/* targets exist — the pre-rebuild /pakistan/* ones are gone (live truth).
    const p = String(u).replace(/^https?:\/\/[^/]+/, '');
    const alive = /^\/pk\//.test(p);
    return { status: 200, json: async () => alive ? { found: true, postId: 1170, wpTitle: 'Live page' } : { found: false } };
  }
  return { status: 202, json: async () => ({ ok: true }) };
};
global.fetch = (...a) => fetchImpl(...a);

const planner = require(path.join(FN, 'market-planner.js'));
const executor = require(path.join(FN, 'market-planner-execute-background.js'));
const { planItemToDraftCall, selectPlanItems, MAX_EXECUTE } = require(path.join(FN, '_lib/market-planner.js'));

const call = (body, ev = {}) => planner.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(body), ...ev });
const J = r => JSON.parse(r.body);
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? (pass++, console.log('  ✅', name)) : (fail++, console.log('  ❌', name, extra !== undefined ? JSON.stringify(extra) : '')); };

// A realistic stored plan (shape from the live Bonbird Pakistan run, v7.9.24).
const PLAN = {
  brand: 'bonbird', market: 'pakistan', status: 'ready', mode: 'llm', total: 6,
  items: [
    { keyword: 'fried chicken lahore',      assetType: 'page_creation', priority: 1, rationale: 'no page yet' },
    { keyword: 'chicken burger deals',      assetType: 'meta_update',   target: 'https://bonbirdchicken.com/pk/burgers/', priority: 2, rationale: 'ranks #8' },
    { keyword: 'how to reheat fried chicken', assetType: 'blog_draft',  priority: 3, rationale: 'informational' },
    { keyword: 'bonbird lahore',            assetType: 'city_hub',      city: 'lahore', priority: 4, rationale: 'venues configured' },
    { keyword: 'broken meta',               assetType: 'meta_update',   target: null, priority: 5, rationale: 'no target' },
    { keyword: 'dead target',               assetType: 'meta_update',   target: '/pakistan-menu/', priority: 7, rationale: 'stale pre-rebuild url' },
    { keyword: 'broken hub',                assetType: 'city_hub',      city: null,   priority: 6, rationale: 'no city' },
  ],
};

(async () => {
  console.log('\n── 1. Mapping: plan item → generate-draft call ──');
  ok('page_creation', JSON.stringify(planItemToDraftCall(PLAN.items[0], { brand: 'bonbird', market: 'pakistan' }).call) ===
     JSON.stringify({ brand: 'bonbird', keyword: 'fried chicken lahore', market: 'pakistan', actionType: 'page_creation' }));
  ok('meta_update carries url', planItemToDraftCall(PLAN.items[1], { brand: 'bonbird', market: 'pakistan' }).call.url === 'https://bonbirdchicken.com/pk/burgers/');
  ok('blog_draft', planItemToDraftCall(PLAN.items[2], { brand: 'bonbird', market: 'pakistan' }).call.actionType === 'blog_draft');
  const hub = planItemToDraftCall(PLAN.items[3], { brand: 'bonbird', market: 'pakistan' }).call;
  ok('city_hub → page_creation + pageKind + city', hub.actionType === 'page_creation' && hub.pageKind === 'city_hub' && hub.city === 'lahore', hub);
  ok('meta_update w/o target → error, no call', planItemToDraftCall(PLAN.items[4], { brand: 'bonbird' }).error && !planItemToDraftCall(PLAN.items[4], { brand: 'bonbird' }).call);
  ok('city_hub w/o city → error, no call', !!planItemToDraftCall(PLAN.items[6], { brand: 'bonbird' }).error);
  ok('unknown assetType → error', !!planItemToDraftCall({ keyword: 'x', assetType: 'page_update' }, { brand: 'b' }).error);
  ok('uae market defaults', planItemToDraftCall(PLAN.items[0], { brand: 'bonbird' }).call.market === 'uae');

  console.log('\n── 2. Selection ──');
  ok('by keyword', selectPlanItems(PLAN.items, { select: ['Fried Chicken Lahore'] }).length === 1);
  ok('by index', selectPlanItems(PLAN.items, { select: [2] })[0].keyword === 'how to reheat fried chicken');
  ok('topN takes top of sorted plan', selectPlanItems(PLAN.items, { topN: 3 }).length === 3);
  ok('nothing selected → empty (no accidental full run)', selectPlanItems(PLAN.items, {}).length === 0);
  ok('capped at MAX_EXECUTE', selectPlanItems(Array(100).fill(PLAN.items[0]), { topN: 100 }).length === MAX_EXECUTE);
  ok('max cannot exceed the hard cap', selectPlanItems(Array(100).fill(PLAN.items[0]), { topN: 100, max: 999 }).length === MAX_EXECUTE);

  console.log('\n── 3. execute — DRY RUN (default; must not spend or write) ──');
  KV.set('marketPlan:bonbird:pakistan', JSON.stringify(PLAN));
  SENT.length = 0;
  let r = await call({ action: 'execute', brand: 'bonbird', market: 'pakistan', topN: 7 });
  let d = J(r);
  ok('200', r.statusCode === 200, r.statusCode);
  ok('dryRun flagged by default', d.dryRun === true);
  ok('no generate-draft call made (pre-flight reads only)', !SENT.some(x => x.url.includes('generate-draft')), SENT.map(x=>x.url));
  ok('no run record written', !KV.has('marketPlanRun:bonbird:pakistan'));
  ok('4 runnable, 3 skipped (incl. dead meta target)', d.runnable === 4 && d.skipped.length === 3, { runnable: d.runnable, skipped: d.skipped.length });
  ok('dead meta target skipped by pre-flight, not generated', d.skipped.some(s => s.keyword === 'dead target' && /not found/.test(s.error)) && !d.calls.some(c => c.call && c.call.url === '/pakistan-menu/'));
  ok('live meta target survives pre-flight + records postId',
     (d.calls.find(c => c.keyword === 'chicken burger deals') || {}).targetPostId === 1170,
     d.calls.find(c => c.keyword === 'chicken burger deals'));
  ok('exposes the exact calls', d.calls[0].call.actionType === 'page_creation');
  console.log('     calls preview:', JSON.stringify(d.calls.filter(c => c.call).map(c => c.call), null, 0));
  console.log('     skipped:', JSON.stringify(d.skipped.map(s => `${s.keyword}: ${s.error}`)));

  console.log('\n── 4. execute guards ──');
  r = await call({ action: 'execute', brand: 'bonbird', market: 'oman', topN: 3 });
  ok('no ready plan → 409', r.statusCode === 409, J(r));
  KV.set('marketPlan:bonbird:oman', JSON.stringify({ ...PLAN, market: 'oman', status: 'building' }));
  r = await call({ action: 'execute', brand: 'bonbird', market: 'oman', topN: 3 });
  ok('plan still building → 409', r.statusCode === 409);
  r = await call({ action: 'execute', brand: 'bonbird', market: 'pakistan' });
  ok('no selection → 400', r.statusCode === 400, J(r));
  AUTH = { ok: true, via: 'session', user: { email: 'v@yolkbrands.com', role: 'viewer' } };
  r = await call({ action: 'execute', brand: 'bonbird', market: 'pakistan', topN: 3 });
  ok('viewer blocked from execute → 403', r.statusCode === 403, J(r));
  r = await call({ action: 'execute', brand: 'bonbird', market: 'pakistan', topN: 3, dryRun: false });
  ok('viewer blocked from REAL run too → 403', r.statusCode === 403);
  AUTH = { ok: false, via: null, user: null };
  r = await call({ action: 'execute', brand: 'bonbird', market: 'pakistan', topN: 3, dryRun: false });
  ok('unauthenticated → denied', r.statusCode === 401);
  AUTH = { ok: true, via: 'session', user: { email: 'shazin@yolkbrands.com', role: 'admin' } };
  r = await call({ action: 'execute', brand: 'bonbird', market: 'pakistan', select: ['broken meta', 'broken hub'], dryRun: false });
  ok('only un-executable selected → 400, no generation fired', r.statusCode === 400 && !SENT.some(x => x.url.includes('generate-draft')));

  console.log('\n── 5. execute REAL (dryRun:false) → fires background, returns 202 ──');
  SENT.length = 0;
  r = await call({ action: 'execute', brand: 'bonbird', market: 'pakistan', topN: 7, dryRun: false });
  d = J(r);
  ok('202 running', r.statusCode === 202 && d.status === 'running', d);
  ok('total = runnable only (4)', d.total === 4, d.total);
  const bgFire = SENT.filter(x => x.url.endsWith('/.netlify/functions/market-planner-execute-background'));
  ok('fired the execute background fn exactly once', bgFire.length === 1, SENT.map(x => x.url));
  ok('run record seeded', JSON.parse(KV.get('marketPlanRun:bonbird:pakistan')).status === 'running');
  const dbl = J(await call({ action: 'execute', brand: 'bonbird', market: 'pakistan', topN: 7, dryRun: false }));
  ok('double-fire guarded', dbl.status === 'running' &&
     SENT.filter(x => x.url.endsWith('market-planner-execute-background')).length === 1);

  console.log('\n── 6. background executor loop ──');
  const bgBody = bgFire[0].body;
  SENT.length = 0;
  let bg = await executor.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(bgBody) });
  ok('bg 200', bg.statusCode === 200, bg.statusCode);
  const gd = SENT.filter(s => s.url.endsWith('/generate-draft'));
  ok('posted 4 generate-draft calls', gd.length === 4, gd.length);
  ok('city_hub call kept pageKind', gd.some(s => s.body.pageKind === 'city_hub' && s.body.city === 'lahore'));
  let run = JSON.parse(KV.get('marketPlanRun:bonbird:pakistan'));
  ok('run done', run.status === 'done' && run.done === 4, run.status);
  ok('all queued', run.counts.queued === 4, run.counts);
  ok('startedBy preserved from the sync starter', run.startedBy === 'shazin@yolkbrands.com', run.startedBy);
  ok('un-executable items still reported on the run', run.skipped.length === 3, run.skipped.length);

  console.log('\n── 7. background: outcome classification ──');
  KV.delete('marketPlanRun:bonbird:pakistan');
  SENT.length = 0;
  const mk = (kw, at = 'page_creation') => ({ keyword: kw, assetType: at, call: { brand: 'bonbird', keyword: kw, market: 'pakistan', actionType: 'page_creation' } });
  bg = await executor.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ brand: 'bonbird', market: 'pakistan',
    calls: [mk('good kw'), mk('paused kw'), mk('cannibal kw'), mk('bad kw'), mk('boom kw'),
            { keyword: 'evil', assetType: 'x', call: { brand: 'bonbird', actionType: 'delete_everything' } },
            { keyword: 'wrongbrand', assetType: 'page_creation', call: { brand: 'pickl', keyword: 'x', actionType: 'page_creation' } }] }) });
  run = JSON.parse(KV.get('marketPlanRun:bonbird:pakistan'));
  const byKw = Object.fromEntries(run.results.map(r => [r.keyword, r.status]));
  ok('queued', byKw['good kw'] === 'queued');
  ok('paused brand → skipped', byKw['paused kw'] === 'skipped');
  ok('cannibalization → skipped', byKw['cannibal kw'] === 'skipped');
  ok('HTTP 500 → error', byKw['bad kw'] === 'error');
  ok('throw → error (warns credit may be spent)', byKw['boom kw'] === 'error' && /may still have completed/.test(run.results.find(r => r.keyword === 'boom kw').reason));
  ok('invalid actionType refused, never sent', byKw['evil'] === 'error' && !SENT.some(s => s.body.actionType === 'delete_everything'));
  ok('brand mismatch refused, never sent', byKw['wrongbrand'] === 'error' && !SENT.some(s => s.body.brand === 'pickl'));
  ok('run closed as done', run.status === 'done' && run.done === 7, run.done);

  console.log('\n── 8. action:\'run\' polling ──');
  const pr = J(await call({ action: 'run', brand: 'bonbird', market: 'pakistan' }));
  ok('returns the run record', pr.status === 'done' && pr.counts.queued === 1, pr.counts);
  ok('unknown market → status none', J(await call({ action: 'run', brand: 'bonbird', market: 'qatar' })).status === 'none');
  ok('unknown action → 400', (await call({ action: 'nope', brand: 'bonbird' })).statusCode === 400);

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
