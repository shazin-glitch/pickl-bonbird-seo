// Offline tests for the menu-accuracy fixes (v7.9.54): the planner must not invent
// product pages for things a brand doesn't sell (salads, catering), must fold wrong-name
// demand into the canonical menu page (chicken fingers → chicken tenders), and must fold
// a bare-country term ("best fried chicken oman") into the primary city hub instead of
// dropping it as a doorway. Mirrors the mocking pattern in review-fixes-test.js.
const path = require('path');
const FN = path.join(__dirname, '..', 'netlify', 'functions');

const KV = new Map();
const bp = require.resolve('@netlify/blobs', { paths: [FN] });
require.cache[bp] = { id: bp, filename: bp, loaded: true, exports: { getStore: () => ({
  get: async k => KV.has(k) ? JSON.parse(KV.get(k)) : null, setJSON: async (k,v)=>{KV.set(k,JSON.stringify(v));} }) } };

const st = require.resolve(path.join(FN, '_lib/store.js'));
const realStore = require(st);
require.cache[st].exports = { ...realStore, listApprovals: async () => [], callClaude: async () => ({ text: '{}' }) };

// Bonbird with the real menu-accuracy config (offMenu incl salad/catering + synonyms).
const bc = require.resolve(path.join(FN, '_lib/brands-config.js'));
const realBc = require(bc);
require.cache[bc].exports = { ...realBc, getBrand: async () => ({
  slug:'bonbird', name:'Bonbird', vertical:'restaurant', cuisine:'fried chicken',
  commodityTerms:['halal'],
  offMenu:['peri peri','salad','catering'],
  menuCategories:['bone-in','tenders','chicken burger','wraps'],
  menuSynonyms:{ 'chicken fingers':'chicken tenders','chicken strips':'chicken tenders' },
}) };

const icp = require.resolve(path.join(FN, '_lib/international-config.js'));
const realIcp = require(icp);
require.cache[icp].exports = { ...realIcp,
  citiesForMarketAsync: async (key) => key === 'bonbird_oman'
    ? [{ city:'Muscat', slug:'muscat', venues:[{name:'Souq Al Madina'}] },
       { city:'Seeb',   slug:'seeb',   venues:[{name:'Al Khoudh'}] }]
    : [] };

const MP = require(path.join(FN, '_lib/market-planner.js'));
const { buildMarketPlan } = MP;
let pass=0, fail=0;
const ok=(n,c,e)=>{c?(pass++,console.log('  ✅',n)):(fail++,console.log('  ❌',n,e!==undefined?JSON.stringify(e):''));};

// The LLM (stubbed) returns a plan that deliberately includes the off-menu / wrong-name /
// national-term items so we can assert the guards handle each one.
const STUB_PLAN = { plan: [
  { primaryKeyword:'fried chicken muscat', keywords:['fried chicken muscat'], assetType:'city_hub', city:'muscat', priority:1, rationale:'primary' },
  { primaryKeyword:'fried chicken seeb',   keywords:['fried chicken seeb'],   assetType:'city_hub', city:'seeb',   priority:2, rationale:'second' },
  { primaryKeyword:'crispy chicken',       keywords:['crispy chicken'],       assetType:'page_creation', priority:3, rationale:'core' },
  { primaryKeyword:'chicken fingers',      keywords:['chicken fingers'],      assetType:'page_creation', priority:4, rationale:'wrong name' },
  { primaryKeyword:'fried chicken salads oman', keywords:['fried chicken salads oman'], assetType:'page_creation', priority:5, rationale:'off menu' },
  { primaryKeyword:'chicken catering oman',     keywords:['chicken catering oman'],     assetType:'page_creation', priority:6, rationale:'off menu' },
  { primaryKeyword:'best fried chicken in oman', keywords:['best fried chicken in oman'], assetType:'blog_draft', priority:9, rationale:'national' },
], dropped: [] };
const llmFn = async () => ({ text: JSON.stringify(STUB_PLAN) });

(async () => {
  KV.set('keywordOpportunities:bonbird:bonbird_oman', JSON.stringify({
    marketLabel:'Oman',
    opportunities:[
      { keyword:'crispy chicken', volume:200 }, { keyword:'chicken fingers', volume:150 },
      { keyword:'fried chicken salads oman', volume:90 }, { keyword:'best fried chicken in oman', volume:300 },
    ],
  }));

  const plan = await buildMarketPlan({ brand:'bonbird', market:'bonbird_oman', useLLM:true, llmFn });
  const kws = plan.items.map(i => i.keyword.toLowerCase());
  const dropReasons = plan.dropped.map(d => `${d.keyword} :: ${d.reason}`);
  const muscat = plan.items.find(i => i.assetType==='city_hub' && i.city==='muscat');

  console.log('\n── menu accuracy ──');
  ok('salads dropped (off-menu, not a product page)', !kws.some(k=>k.includes('salad')), kws);
  ok('catering dropped (off-menu)',                   !kws.some(k=>k.includes('catering')), kws);
  ok('"chicken fingers" is gone from the plan',       !kws.includes('chicken fingers'), kws);
  ok('folded into "chicken tenders" (canonical page)', kws.includes('chicken tenders'), kws);
  ok('crispy chicken kept',                           kws.includes('crispy chicken'), kws);

  console.log('\n── national-term fold ──');
  ok('"best fried chicken in oman" not a standalone item', !kws.includes('best fried chicken in oman'), kws);
  ok('folded into the Muscat hub keywords',
     !!muscat && muscat.keywords.map(k=>k.toLowerCase()).includes('best fried chicken in oman'),
     muscat && muscat.keywords);
  ok('fold onto PRIMARY hub = Muscat, not Seeb',
     !!muscat && !(plan.items.find(i=>i.city==='seeb')||{keywords:[]}).keywords.map(k=>k.toLowerCase()).includes('best fried chicken in oman'));
  ok('drop log explains the fold', dropReasons.some(r=>/national term.*folded/i.test(r)), dropReasons);

  console.log(`\n${fail? '❌':'✅'} ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
