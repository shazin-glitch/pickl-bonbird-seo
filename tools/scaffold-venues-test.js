// Offline test: scaffold-venues-background (v7.9.45) — loops configured venues, dedups vs
// existing children, generates a venue draft per missing one. Mocks config/generate/WP.
const path = require('path');
const FN = path.join(__dirname, '..', 'netlify', 'functions');

const authPath = require.resolve(path.join(FN, '_lib/auth.js'));
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  authorizeJob: async () => ({ ok: true }), internalHeaders: (e={}) => ({ 'x-nest-internal':'T', ...e }) } };

const icp = require.resolve(path.join(FN, '_lib/international-config.js'));
const realIcp = require(icp);
require.cache[icp].exports = { ...realIcp,
  // Real shape: an OBJECT keyed by market key (acc[m.key]=m), NOT an array. Mocking it as
  // an array hid the .find()-on-object TypeError that broke venue scaffolding in prod (v7.9.65).
  getMarketsForBrandAsync: async () => ({ bonbird_pakistan:{ key:'bonbird_pakistan', marketSlug:'pk' }, bonbird_oman:{ key:'bonbird_oman', marketSlug:'om' } }),
  citiesForMarketAsync: async (key) => key==='bonbird_pakistan'
    ? [{ city:'Lahore', slug:'lahore', venues:[{name:'Cue Cinemas, Gulberg',city:'Lahore'},{name:'Dolmen Mall, DHA',city:'Lahore'},{name:'Johar Town',city:'Lahore'}] }]
    : [] };

const bc = require.resolve(path.join(FN, '_lib/brands-config.js'));
const realBc = require(bc);
require.cache[bc].exports = { ...realBc, getBrand: async () => ({ slug:'bonbird', cuisine:'fried chicken', vertical:'restaurant' }), getVertical: realBc.getVertical };

// mock store.listApprovals — the scaffolder now dedups against NEST venue drafts too (v7.9.68)
const st = require.resolve(path.join(FN, '_lib/store.js'));
const realSt = require(st);
let NEST_ITEMS = [];
require.cache[st].exports = { ...realSt, listApprovals: async () => NEST_ITEMS };

// mock generate-draft's generateDraftCore
const gd = require.resolve(path.join(FN, 'generate-draft.js'));
const GEN = [];
require.cache[gd] = { id: gd, filename: gd, loaded: true, exports: {
  generateDraftCore: async (p) => { GEN.push(p); return { statusCode:200, ok:true, item:{ id:'itm_'+p.pageTitle.replace(/\W/g,'') , title:'Venue page: '+p.pageTitle } }; } } };

// mock fetch → list_children returns ONE existing child (Cue Cinemas already made)
let CHILDREN = [{ id:47057, title:'Cue Cinemas', status:'publish' }];
global.fetch = async (url, opts) => {
  const b = JSON.parse(opts.body||'{}');
  if (b.action === 'list_children') return { json: async () => ({ children: CHILDREN }) };
  return { json: async () => ({}) };
};

const scaffolder = require(path.join(FN, 'scaffold-venues-background.js'));
let pass=0, fail=0; const ok=(n,c,e)=>{c?(pass++,console.log('  ✅',n)):(fail++,console.log('  ❌',n,e!==undefined?JSON.stringify(e):''));};
const run = (body) => scaffolder.handler({ httpMethod:'POST', headers:{}, body: JSON.stringify(body) });

(async () => {
  console.log('\n── Scaffolds missing venues, skips existing, dedups ──');
  GEN.length = 0;
  let r = JSON.parse((await run({ brand:'bonbird', hubPostId:47054, city:'lahore', marketSlug:'pk' })).body);
  const by = Object.fromEntries(r.results.map(x=>[x.venue, x.status]));
  console.log('    ', JSON.stringify(r.results));
  ok('Cue Cinemas (existing child) → skipped as exists', by['Cue Cinemas, Gulberg'] === 'exists');
  ok('Dolmen queued', by['Dolmen Mall, DHA'] === 'queued');
  ok('Johar Town queued', by['Johar Town'] === 'queued');
  ok('generated exactly the 2 missing venues (Cue Cinemas deduped)', GEN.length === 2, GEN.map(g=>g.pageTitle));
  ok('each gen is a venue create parented to the hub', GEN.every(g=>g.pageKind==='venue' && g.actionType==='page_creation' && g.parentId===47054));
  ok('each gen carries the venue name as pageTitle', GEN.some(g=>g.pageTitle==='Johar Town') && GEN.some(g=>g.pageTitle==='Dolmen Mall, DHA'));
  ok('market resolved from slug pk → bonbird_pakistan', GEN.every(g=>g.market==='bonbird_pakistan'));

  console.log('\n── Dedup vs pending NEST venue drafts (the double-scaffold bug, v7.9.68) ──');
  // No WP children yet (first run's venues are pending Nest drafts, not WP children), but a
  // Johar Town venue draft is already queued for this hub → a 2nd scaffold must NOT re-make it.
  CHILDREN = []; GEN.length = 0;
  NEST_ITEMS = [{ status:'pending', type:'page_creation', payload:{ parentId:47054, pageTitle:'Johar Town' } }];
  r = JSON.parse((await run({ brand:'bonbird', hubPostId:47054, city:'lahore', marketSlug:'pk' })).body);
  ok('Johar Town (pending Nest draft) → not regenerated', !GEN.some(g=>g.pageTitle==='Johar Town'), GEN.map(g=>g.pageTitle));
  ok('the other two still generate', GEN.length === 2);
  NEST_ITEMS = [];

  console.log('\n── Idempotent: all children exist → nothing generated ──');
  CHILDREN = [{title:'Cue Cinemas'},{title:'Dolmen Mall'},{title:'Johar Town'}]; GEN.length=0;
  r = JSON.parse((await run({ brand:'bonbird', hubPostId:47054, city:'lahore', marketSlug:'pk' })).body);
  ok('re-run generates nothing (all exist)', GEN.length === 0, GEN.length);

  console.log('\n── Guards ──');
  ok('missing args → 400', (await run({ brand:'bonbird' })).statusCode === 400);
  const noMkt = JSON.parse((await run({ brand:'bonbird', hubPostId:1, city:'x', marketSlug:'zz' })).body);
  ok('unresolvable market → skipped, no gen', noMkt.skipped === 'no market');
  CHILDREN = []; GEN.length=0;
  const noVen = JSON.parse((await run({ brand:'bonbird', hubPostId:1, city:'karachi', marketSlug:'pk' })).body);
  ok('city with no configured venues → 0 (never invents)', noVen.venues === 0 && GEN.length === 0);

  console.log(`\n${fail===0?'✅':'❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail?1:0);
})();
