// Offline test of the 4 planner-quality fixes, using the REAL keywords from the live
// Bonbird Pakistan plan that exposed them. Mocks Blobs/Claude/WP — no network.
const path = require('path');
const FN = path.join(__dirname, '..', 'netlify', 'functions');

const KV = new Map();
const bp = require.resolve('@netlify/blobs', { paths: [FN] });
require.cache[bp] = { id: bp, filename: bp, loaded: true, exports: { getStore: () => ({
  get: async k => KV.has(k) ? JSON.parse(KV.get(k)) : null, setJSON: async (k,v) => { KV.set(k, JSON.stringify(v)); } }) } };

// Only /pk/* pages exist (live truth: /pakistan/* are dead pre-rebuild slugs).
const WP = [];
global.fetch = async (url, opts) => {
  const b = JSON.parse(opts.body); WP.push(b.payload && b.payload.url);
  const p = String(b.payload.url).replace(/^https?:\/\/[^/]+/, '');
  return { status: 200, json: async () => /^\/pk\//.test(p) ? { found: true, postId: 1170, wpTitle: 'Live' } : { found: false } };
};

const icp = require.resolve(path.join(FN, '_lib/international-config.js'));
const realIcp = require(icp);
require.cache[icp].exports = { ...realIcp, citiesForMarketAsync: async () => ([
  { city: 'Lahore', slug: 'lahore', marketKey: 'bonbird_pakistan', marketSlug: 'pk', venues: [{ name: 'Bonbird Cue Cinemas', city: 'Lahore', type: 'restaurant' }] },
]) };

const { buildMarketPlan } = require(path.join(FN, '_lib/market-planner.js'));
let pass=0, fail=0;
const ok=(n,c,e)=>{c?(pass++,console.log('  ✅',n)):(fail++,console.log('  ❌',n,e!==undefined?JSON.stringify(e):''));};

// The EXACT plan Claude returned live (v7.9.24) — the one with all four problems.
const LIVE_LLM_PLAN = { plan: [
  { primaryKeyword:'halal fried chicken lahore', assetType:'blog_draft', priority:1 },
  { primaryKeyword:'best fast food deals near me', assetType:'blog_draft', priority:2 },
  { primaryKeyword:'bonbird pakistan menu', assetType:'meta_update', target:'/pakistan-menu/', priority:3 },
  { primaryKeyword:'restaurants near me', assetType:'page_creation', priority:4 },
  { primaryKeyword:'dolmen mall lahore restaurants', assetType:'meta_update', target:'/pakistan/bonbird-has-landed-in-dolmen-mall-lahore/', priority:5 },
  { primaryKeyword:'chicken sandwich', assetType:'page_creation', priority:6 },
  { primaryKeyword:'chicken tenders', assetType:'page_creation', priority:7 },
  { primaryKeyword:'fried chicken near me', assetType:'meta_update', target:'/pk/journal/best-fried-chicken-in-lahore-pakistan-launch/', priority:8 },
  { primaryKeyword:'nearest chicken shop to me', assetType:'page_creation', priority:9 },
  { primaryKeyword:'best burger in karachi', assetType:'page_creation', priority:10 },
  { primaryKeyword:'best burger in lahore', assetType:'page_creation', priority:11 },
  { primaryKeyword:'fast food in lahore', assetType:'city_hub', city:'lahore', priority:12 },
], dropped: [] };

let captured = null;
const llmFn = async (prompt, opts) => { captured = { prompt, system: opts.system }; return { text: JSON.stringify(LIVE_LLM_PLAN) }; };

(async () => {
  KV.set('keywordOpportunities:bonbird:bonbird_pakistan', JSON.stringify({ marketLabel:'Pakistan',
    opportunities: LIVE_LLM_PLAN.plan.map(p => ({ keyword: p.primaryKeyword, volume: 100, tier: 'opportunity' })) }));

  const plan = await buildMarketPlan({ brand:'bonbird', market:'bonbird_pakistan', llmFn,
    verifyTargets:true, site:'https://yolkseo.netlify.app', headers:{} });

  const kws = plan.items.map(i => i.keyword);
  const drops = Object.fromEntries(plan.dropped.map(d => [d.keyword, d.reason]));
  console.log('\n  KEPT   :', JSON.stringify(kws));
  console.log('  DROPPED:'); plan.dropped.forEach(d => console.log('     -', d.keyword, '→', d.reason));

  console.log('\n── Fix 1: "near me" never becomes a page/blog ──');
  for (const k of ['restaurants near me','nearest chicken shop to me','best fast food deals near me','fried chicken near me'])
    ok(`dropped "${k}"`, !kws.includes(k) && /local pack|Business Profile/i.test(drops[k]||''), drops[k]);
  ok('city_hub still allowed to carry local demand', kws.includes('fast food in lahore'));

  console.log('\n── Fix 2: no-venue city ──');
  ok('dropped "best burger in karachi" (no Karachi venue)', !kws.includes('best burger in karachi') && /no configured venue|doorway/i.test(drops['best burger in karachi']||''), drops['best burger in karachi']);
  ok('KEPT "best burger in lahore" (venue configured)', kws.includes('best burger in lahore'));

  console.log('\n── Fix 3: stale GSC targets dropped at plan build ──');
  ok('dropped dead /pakistan-menu/', !kws.includes('bonbird pakistan menu') && /no longer exists/i.test(drops['bonbird pakistan menu']||''));
  ok('dropped dead /pakistan/dolmen…', !kws.includes('dolmen mall lahore restaurants') && /no longer exists/i.test(drops['dolmen mall lahore restaurants']||''));
  ok('WP checked only surviving meta targets (near-me guard ran first, saving a lookup)', WP.length === 2, WP);

  console.log('\n── Fix 4: vertical-aware + venue-scoped prompt ──');
  ok('system names the vertical noun', /restaurant/.test(captured.system), captured.system);
  ok('prompt carries the vertical asset hint', /city\/area hubs where we have venues/i.test(captured.prompt));
  ok('prompt names the ONLY venue cities', /WE HAVE VENUES ONLY IN: Lahore/.test(captured.prompt));
  ok('prompt explains the near-me/local-pack rule', /LOCAL PACK/.test(captured.prompt));

  console.log('\n── Non-vertical brands adapt (rule #2) ──');
  const { getVertical } = require(path.join(FN, '_lib/brands-config.js'));
  ok('corporate hint forbids local/product', /Do NOT propose local/.test(getVertical('corporate').assetHint));
  ok('cafe hint is coffee-shaped', /coffee/i.test(getVertical('cafe').assetHint));

  console.log('\n── Survivors are the genuinely rankable set ──');
  // CHANGED v7.9.35: 'halal' is a commodity term for Bonbird (every market is
  // Muslim-majority), so it is stripped from the keyword — the opportunity survives as
  // 'fried chicken lahore', it is not lost.
  ok('kept the real opportunities', ['fried chicken lahore','chicken sandwich','chicken tenders','best burger in lahore','fast food in lahore'].every(k => kws.includes(k)), kws);
  ok('no surviving keyword optimises for the commodity term', !kws.some(k => /halal/i.test(k)), kws);
  ok('12 planned → 5 clean, 7 dropped with reasons', plan.items.length === 5 && plan.dropped.length === 7, {kept:plan.items.length, dropped:plan.dropped.length});

  console.log(`\n${fail===0?'✅':'❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail?1:0);
})();
