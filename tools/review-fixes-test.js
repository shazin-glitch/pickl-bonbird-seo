// Offline tests for the CTO/SEO review fixes (v7.9.35): commodity terms, scaffold-family
// awareness, same-URL meta conflicts, intra-batch cannibalization, internal linking.
const path = require('path');
const FN = path.join(__dirname, '..', 'netlify', 'functions');

const KV = new Map();
const bp = require.resolve('@netlify/blobs', { paths: [FN] });
require.cache[bp] = { id: bp, filename: bp, loaded: true, exports: { getStore: () => ({
  get: async k => KV.has(k) ? JSON.parse(KV.get(k)) : null, setJSON: async (k,v)=>{KV.set(k,JSON.stringify(v));} }) } };

let PENDING = [];
const st = require.resolve(path.join(FN, '_lib/store.js'));
const realStore = require(st);
require.cache[st].exports = { ...realStore, listApprovals: async () => PENDING, callClaude: async () => ({ text: '{}' }) };

const bc = require.resolve(path.join(FN, '_lib/brands-config.js'));
const realBc = require(bc);
require.cache[bc].exports = { ...realBc, getBrand: async (slug) => (slug === 'southpour')
  ? { slug:'southpour', name:'Southpour', vertical:'cafe', cuisine:'specialty coffee' }   // UAE-native, no legacyHomeMarket
  : { slug:'bonbird', name:'Bonbird', vertical:'restaurant', cuisine:'fried chicken',
      commodityTerms:['halal'], commodityTermsByMarket:{ bonbird_uk: [] },
      offMenu:['peri peri','peri-peri','periperi'], legacyHomeMarket:true } };

const icp = require.resolve(path.join(FN, '_lib/international-config.js'));
const realIcp = require(icp);
require.cache[icp].exports = { ...realIcp,
  INTERNATIONAL_MARKETS: { ...realIcp.INTERNATIONAL_MARKETS, bonbird_pakistan: { label:'Pakistan', marketSlug:'pk' } },
  citiesForMarketAsync: async (key) => {
    if (key === 'bonbird_pakistan') return [{ city:'Lahore', slug:'lahore', venues:[{name:'Cue Cinemas, Gulberg'},{name:'Johar Town'}] }];
    if (key === 'southpour_uae')    return [{ city:'Dubai',  slug:'dubai',  venues:[{name:'Southpour JLT'}] }];
    return [];   // bonbird_uae etc. → none
  } };

global.fetch = async (url, opts) => {
  const b = JSON.parse(opts.body || '{}');
  if (b.action === 'get_current_meta') {
    // The MARKET HOME resolves to 517 — that id is what scaffolds are parented to.
    const isHome = String(b.payload && b.payload.url) === '/pk/';
    return { json: async () => ({ found: true, postId: isHome ? 517 : 1170, wpTitle: 'Live' }) };
  }
  if (b.action === 'list_scaffolds') return { json: async () => ({ scaffolds: [
    { id:47016, slug:'chicken-tenders', link:'/?page_id=47016', template:'template-product.php', parent:517, words:0 },
    { id:47015, slug:'chicken-burger',  link:'/?page_id=47015', template:'template-product.php', parent:517, words:0 },
    { id:47014, slug:'wraps',           link:'/?page_id=47014', template:'template-product.php', parent:517, words:0 },
  ] }) };
  return { json: async () => ({}) };
};

const MP = require(path.join(FN, '_lib/market-planner.js'));
const { buildMarketPlan, preflightTargets, preflightPageCreations, commodityTermsFor, stripCommodityTerms } = MP;
let pass=0, fail=0;
const ok=(n,c,e)=>{c?(pass++,console.log('  ✅',n)):(fail++,console.log('  ❌',n,e!==undefined?JSON.stringify(e):''));};

const mk = (kw, extra={}) => ({ keyword: kw, assetType:'page_creation',
  call:{ brand:'bonbird', keyword:kw, market:'bonbird_pakistan', actionType:'page_creation', ...extra }, error:null });
const mkMeta = (kw, url) => ({ keyword: kw, assetType:'meta_update',
  call:{ brand:'bonbird', keyword:kw, market:'bonbird_pakistan', actionType:'meta_update', url }, error:null });

(async () => {
  console.log('\n── 1. Commodity terms: halal is table stakes, not an angle ──');
  const cfg = { commodityTerms:['halal'], commodityTermsByMarket:{ bonbird_uk: [] } };
  ok('brand default applies to its markets', commodityTermsFor(cfg,'bonbird_pakistan').includes('halal'));
  ok('a non-Muslim-majority market can re-enable it (UK override)', commodityTermsFor(cfg,'bonbird_uk').length === 0);
  ok('strips the term', stripCommodityTerms('halal fried chicken lahore', ['halal']) === 'fried chicken lahore');
  ok('strips mid-phrase', stripCommodityTerms('best halal chicken lahore', ['halal']) === 'best chicken lahore');
  ok('case-insensitive', stripCommodityTerms('Halal Fried Chicken', ['halal']) === 'Fried Chicken');
  ok('never strips down to nothing', stripCommodityTerms('halal', ['halal']) === 'halal');
  ok('no terms configured → untouched', stripCommodityTerms('halal fried chicken', []) === 'halal fried chicken');

  console.log('\n── 2. Plan build folds halal variants into the base keyword ──');
  KV.set('keywordOpportunities:bonbird:bonbird_pakistan', JSON.stringify({ marketLabel:'Pakistan', opportunities:[
    { keyword:'fried chicken lahore', volume:900, tier:'opportunity' },
    { keyword:'halal fried chicken lahore', volume:400, tier:'opportunity' },
    { keyword:'halal chicken restaurant lahore', volume:200, tier:'opportunity' },
  ] }));
  const llmFn = async () => ({ text: JSON.stringify({ plan:[
    { primaryKeyword:'fried chicken lahore', assetType:'page_creation', priority:1 },
    { primaryKeyword:'halal fried chicken lahore', assetType:'blog_draft', priority:2 },
    { primaryKeyword:'halal chicken restaurant lahore', assetType:'blog_draft', priority:3 },
  ], dropped:[] }) });
  const plan = await buildMarketPlan({ brand:'bonbird', market:'bonbird_pakistan', llmFn });
  const kws = plan.items.map(i => i.keyword);
  console.log('     KEPT:', JSON.stringify(kws));
  plan.dropped.forEach(d => console.log('     DROP:', d.keyword, '→', String(d.reason).slice(0,80)));
  ok('no kept keyword still contains "halal"', !kws.some(k => /halal/i.test(k)), kws);
  ok('the halal duplicate folded into the base item', !kws.includes('halal fried chicken lahore') &&
     plan.dropped.some(d => /table stakes/i.test(d.reason)));
  ok('the non-duplicate halal keyword survives, stripped', kws.includes('chicken restaurant lahore'), kws);
  ok('base keyword kept', kws.includes('fried chicken lahore'));

  console.log('\n── 3. Scaffold-family: fill the empty sibling, never create beside it ──');
  const m1 = [mk('best burger in lahore')];
  await preflightPageCreations(m1, { brand:'bonbird', market:'bonbird_pakistan', site:'https://x', headers:{} });
  ok('"best burger in lahore" now FILLS the empty chicken-burger scaffold',
     m1[0].call.postId === 47015 && /same product family/.test(m1[0].routedTo||''), m1[0]);
  const m2 = [mk('chicken sandwich')];
  await preflightPageCreations(m2, { brand:'bonbird', market:'bonbird_pakistan', site:'https://x', headers:{} });
  ok('ambiguous keyword (3 chicken scaffolds) still creates, never guesses', !m2[0].call.postId && m2[0].call.pageKind === 'template_product');
  const m3 = [mk('chicken tenders')];
  await preflightPageCreations(m3, { brand:'bonbird', market:'bonbird_pakistan', site:'https://x', headers:{} });
  ok('exact match still wins via the strict matcher', m3[0].call.postId === 47016);

  console.log('\n── 4. Same-URL meta conflicts ──');
  PENDING = [];
  const two = [mkMeta('fried chicken lahore','/pk/journal/x/'), mkMeta('fried chicken near me','https://bonbirdchicken.com/pk/journal/x/')];
  await preflightTargets(two, { brand:'bonbird', site:'https://x', headers:{} });
  ok('two selections on one page → only one runs', two.filter(m=>m.call).length === 1, two.map(m=>m.error));
  ok('the blocked one explains why', /only one meta rewrite per page/i.test(two.find(m=>!m.call).error));
  ok('relative and absolute forms recognised as the SAME page', two.filter(m=>m.call).length === 1);
  PENDING = [{ id:'x', payload:{ wpAction:'update_meta', url:'/pk/journal/x/' } }];
  const one = [mkMeta('another angle','/pk/journal/x/')];
  await preflightTargets(one, { brand:'bonbird', site:'https://x', headers:{} });
  ok('a rewrite already awaiting review blocks a new one', !one[0].call && /already awaiting review/.test(one[0].error), one[0].error);
  PENDING = [];
  const okMeta = [mkMeta('a','/pk/one/'), mkMeta('b','/pk/two/')];
  await preflightTargets(okMeta, { brand:'bonbird', site:'https://x', headers:{} });
  ok('different pages are unaffected', okMeta.every(m=>m.call));

  console.log('\n── 5. Intra-batch cannibalization backstop ──');
  KV.set('keywordOpportunities:bonbird:bonbird_pakistan', JSON.stringify({ marketLabel:'Pakistan', opportunities:[
    { keyword:'chicken tenders lahore', volume:500, tier:'opportunity' }] }));
  const llm2 = async () => ({ text: JSON.stringify({ plan:[
    { primaryKeyword:'chicken tenders lahore', assetType:'page_creation', priority:1 },
    { primaryKeyword:'best chicken tenders in lahore', assetType:'page_creation', priority:2 },
  ], dropped:[] }) });
  const p2 = await buildMarketPlan({ brand:'bonbird', market:'bonbird_pakistan', llmFn: llm2 });
  ok('same target once modifiers are stripped → one item', p2.items.length === 1, p2.items.map(i=>i.keyword));
  ok('the duplicate is reported with a reason', p2.dropped.some(d => /split authority/.test(d.reason)));

  console.log('\n── 5b. A queued city hub must NOT erase the city from presence (v7.9.36) ──');
  // Regression: `cities` is filtered to hubs still NEEDED, but it was also used as the
  // "cities we have venues in" truth. Once the Lahore hub was queued, Lahore stopped
  // counting as a venue city and every legitimate Lahore keyword was dropped as a
  // doorway page — and with all hubs queued Claude would be told we have no venues.
  PENDING = [{ id:'hub', payload:{ pageType:'city_hub', slug:'lahore', targetKeyword:'fast food in lahore' } }];
  KV.set('keywordOpportunities:bonbird:bonbird_pakistan', JSON.stringify({ marketLabel:'Pakistan', opportunities:[
    { keyword:'fast food restaurants in lahore', volume:800, tier:'opportunity' }] }));
  let seenPrompt = '';
  const llm3 = async (prompt) => { seenPrompt = prompt; return { text: JSON.stringify({ plan:[
    { primaryKeyword:'fast food restaurants in lahore', assetType:'page_creation', priority:1 }], dropped:[] }) }; };
  const p3 = await buildMarketPlan({ brand:'bonbird', market:'bonbird_pakistan', llmFn: llm3 });
  ok('a Lahore keyword survives even though the Lahore hub is already queued',
     p3.items.some(i => /lahore/i.test(i.keyword)),
     { kept: p3.items.map(i=>i.keyword), dropped: p3.dropped.map(d=>d.reason) });
  ok('it is NOT dropped as a no-venue/doorway city',
     !p3.dropped.some(d => /no configured venue/.test(d.reason)), p3.dropped);
  ok('the prompt still tells Claude we have venues in Lahore', /VENUES ONLY IN: .*Lahore/.test(seenPrompt));
  PENDING = [];

  console.log('\n── 5c. Cross-run dedup: a variant of an ALREADY-QUEUED page is caught (v7.9.37) ──');
  PENDING = [{ id:'q', payload:{ targetKeyword:'fried chicken lahore', wpAction:'create_page' } }];
  KV.set('keywordOpportunities:bonbird:bonbird_pakistan', JSON.stringify({ marketLabel:'Pakistan', opportunities:[
    { keyword:'halal fried chicken lahore', volume:400, tier:'opportunity' },
    { keyword:'best fried chicken in lahore', volume:300, tier:'opportunity' },
  ] }));
  const llmX = async () => ({ text: JSON.stringify({ plan:[
    { primaryKeyword:'halal fried chicken lahore', assetType:'page_creation', priority:1 },
    { primaryKeyword:'best fried chicken in lahore', assetType:'page_creation', priority:2 },
  ], dropped:[] }) });
  const px = await buildMarketPlan({ brand:'bonbird', market:'bonbird_pakistan', llmFn: llmX });
  ok('commodity-variant of a queued page is dropped', !px.items.some(i=>i.keyword==='fried chicken lahore'), px.items.map(i=>i.keyword));
  ok('near-duplicate of a queued page is dropped', !px.items.some(i=>/fried chicken.*lahore/i.test(i.keyword)), px.items.map(i=>i.keyword));
  ok('the drop reason points at the existing queue draft', px.dropped.some(d=>/already in the Approvals queue|Folded into the existing/i.test(d.reason)), px.dropped.map(d=>d.reason));
  PENDING = [];

  console.log('\n── 5d. Peri-peri off-menu (brand-level, merged with vertical) (v7.9.38) ──');
  KV.set('keywordOpportunities:bonbird:bonbird_pakistan', JSON.stringify({ marketLabel:'Pakistan', opportunities:[
    { keyword:'peri peri chicken oman', volume:200, tier:'opportunity' },
    { keyword:'crispy fried chicken lahore', volume:300, tier:'opportunity' },
  ] }));
  const llmP = async () => ({ text: JSON.stringify({ plan:[
    { primaryKeyword:'peri peri chicken oman', assetType:'page_creation', priority:1 },
    { primaryKeyword:'crispy fried chicken lahore', assetType:'page_creation', priority:2 },
  ], dropped:[] }) });
  const pp = await buildMarketPlan({ brand:'bonbird', market:'bonbird_pakistan', llmFn: llmP });
  ok('peri-peri keyword never reaches the plan (off-brand for Bonbird)', !pp.items.some(i=>/peri/i.test(i.keyword)), pp.items.map(i=>i.keyword));
  ok('real fried-chicken keyword survives', pp.items.some(i=>/crispy fried chicken/i.test(i.keyword)));

  console.log('\n── 5e. Home-market city hubs: Southpour yes, Bonbird no (v7.9.38) ──');
  // Southpour (UAE-native cafe, no legacyHomeMarket): home hubs come from southpour_uae.
  KV.set('keywordOpportunities:southpour', JSON.stringify({ marketLabel:'UAE', opportunities:[] }));
  const spPlan = await buildMarketPlan({ brand:'southpour', market:'uae', useLLM:false });   // rules path exercises cityItems
  ok('Southpour gets a Dubai city hub for its home market', spPlan.items.some(i=>i.assetType==='city_hub' && i.city==='dubai'), spPlan.items);
  // Bonbird (legacyHomeMarket): even the rules path must produce NO UAE hubs.
  KV.set('keywordOpportunities:bonbird', JSON.stringify({ marketLabel:'UAE', opportunities:[] }));
  const bbHome = await buildMarketPlan({ brand:'bonbird', market:'uae', useLLM:false });
  ok('Bonbird gets NO UAE city hubs (legacy static pages)', !bbHome.items.some(i=>i.assetType==='city_hub'), bbHome.items);

  console.log('\n── 6. Internal linking directive ──');
  const src = require('fs').readFileSync(path.join(FN,'generate-draft.js'),'utf8');
  const body = src.match(/function buildLinkingDirective[\s\S]*?\n}/)[0];
  const buildLinkingDirective = new Function(`return (${body})`)();
  const d = buildLinkingDirective({ marketSlug:'pk', label:'Pakistan' }, [{slug:'lahore',city:'Lahore'}], 'Bonbird');
  console.log('    ', d.trim().split('\n').map(x=>x.trim()).join('\n     '));
  ok('offers the market home', d.includes('/pk/ —'));
  ok('offers the city hub', d.includes('/pk/lahore/'));
  ok('forbids inventing paths', /do NOT invent any other path/.test(d));
  ok('requires descriptive anchors', /never "click here"/.test(d));
  ok('no known targets → no directive (never invents)', buildLinkingDirective(null, [], 'X') === '');

  console.log(`\n${fail===0?'✅':'❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail?1:0);
})();
