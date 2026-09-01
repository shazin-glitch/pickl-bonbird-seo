// Offline tests for the "Rewrite with AI" fix (v7.9.57): page_creation drafts (city hub /
// product / venue) were UNHANDLED by rewriteWithClaude → returned null → the draft was
// rejected with nothing requeued ("nothing queued back"). Now handled, routing fields are
// preserved, and the market-aware ownership guard (v7.9.56) is injected so a rewrite can't
// reintroduce "homegrown / not a franchise" in a franchised market.
const path = require('path');
const FN = path.join(__dirname, '..', 'netlify', 'functions');

process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.NETLIFY_SITE_ID = 'x'; process.env.NETLIFY_AUTH_TOKEN = 'y';

// Mock brand context/prompt.
const brand = require.resolve(path.join(FN, '_lib/brand.js'));
const realBrand = require(brand);
require.cache[brand].exports = { ...realBrand,
  getBrandContext:  async () => ({ name: 'Bonbird' }),
  getBrandExamples: async () => null,
  buildBrandPrompt: () => 'BRANDVOICE' };

// Mock brands-config (home slug) + markets (Oman = franchise).
const bc = require.resolve(path.join(FN, '_lib/brands-config.js'));
const realBc = require(bc);
require.cache[bc].exports = { ...realBc, getBrand: async () => ({ slug:'bonbird', name:'Bonbird', homeMarketSlug:'ae' }) };

const icp = require.resolve(path.join(FN, '_lib/international-config.js'));
const realIcp = require(icp);
require.cache[icp].exports = { ...realIcp,
  getMarketsForBrandAsync: async () => ([{ key:'bonbird_oman', marketSlug:'om', label:'Oman' }]) };  // no ownership → franchise

// Capture the system prompt sent to Anthropic; return a canned rewrite.
let lastSystem = '';
global.fetch = async (url, opts) => {
  const b = JSON.parse(opts.body || '{}');
  lastSystem = b.system || '';
  const canned = { title:'Crispy Chicken in Muscat | Bonbird',
    metaDescription:'Fresh crispy chicken at Bonbird Souq Al Madina, Muscat.',
    targetKeyword:'crispy chicken muscat',
    contentHtml:'<p>Bonbird brings its UAE-born crispy chicken to Muscat at Souq Al Madina.</p><h2>FAQs</h2><h3>Is it fresh?</h3><p>Always.</p>' };
  return { ok:true, json: async () => ({ content:[{ text: JSON.stringify(canned) }] }) };
};

// Mock the queue so handleReject's create/reject are observable (capture created items).
const CREATED = [];
let STORE_ITEM = null;
const q = require.resolve(path.join(FN, '_lib/queue.js'));
const realQ = require(q);
require.cache[q].exports = { ...realQ,
  get:    async () => STORE_ITEM,
  create: async (input) => { const it = { id:'itm_new', status:'pending', locationTag: input.locationTag || (input.payload&&input.payload.locationTag) || '🇦🇪 UAE', ...input }; CREATED.push(it); return it; },
  update: async () => ({}),
  addAudit: async () => ({}),
  appendBrandFeedback: async () => ({}) };
// Neutralize Blobs (notifyQueued → resolveSlackWebhook) so it no-ops offline.
const nb = require.resolve('@netlify/blobs', { paths: [FN] });
require.cache[nb] = { id:nb, filename:nb, loaded:true, exports: { getStore: () => ({ get: async()=>null, setJSON: async()=>{} }) } };

const A = require(path.join(FN, 'approvals.js'));
let pass=0, fail=0;
const ok=(n,c,e)=>{c?(pass++,console.log('  ✅',n)):(fail++,console.log('  ❌',n,e!==undefined?JSON.stringify(e):''));};

const cityHub = { id:'itm1', status:'pending', type:'page_creation', brand:'bonbird', title:'City hub: Muscat',
  payload:{ pageType:'city_hub', wpParent:'om', template:'template-location.php', slug:'muscat',
    title:'Crispy Chicken Muscat', metaTitle:'Crispy Chicken Muscat | Bonbird', description:'old desc',
    content:"<p>This isn't a franchise flown in from somewhere else. Bonbird is a homegrown brand built in the UAE.</p>",
    targetKeyword:'crispy chicken muscat', marketTaxonomy:'markets' } };

(async () => {
  console.log('\n── page_creation rewrite (was unhandled → null) ──');
  const np = await A.rewriteWithClaude(cityHub, 'Remove the homegrown/not-a-franchise line — Oman is a franchise market.');
  ok('rewrite returns a payload (not null)', !!np, np);
  ok('routing preserved: pageType', np && np.pageType === 'city_hub', np && np.pageType);
  ok('routing preserved: wpParent',  np && np.wpParent === 'om', np && np.wpParent);
  ok('routing preserved: template',  np && np.template === 'template-location.php');
  ok('routing preserved: marketTaxonomy', np && np.marketTaxonomy === 'markets');
  ok('content replaced with rewrite', np && /UAE-born crispy chicken to Muscat/.test(np.content) && !/homegrown/.test(np.content), np && np.content);
  ok('title cleaned (H1, no brand suffix)', np && np.title === 'Crispy Chicken in Muscat', np && np.title);
  ok('metaTitle keeps full SEO title', np && np.metaTitle === 'Crispy Chicken in Muscat | Bonbird', np && np.metaTitle);
  ok('targetKeyword preserved', np && np.targetKeyword === 'crispy chicken muscat');

  console.log('\n── ownership guard reaches the prompt (franchise market) ──');
  ok('system carries brand voice', /BRANDVOICE/.test(lastSystem));
  ok('franchise guard present ("NEVER describe … homegrown")', /NEVER describe .*homegrown/i.test(lastSystem), lastSystem.slice(-260));
  ok('names the franchised market (Oman)', /Oman/.test(lastSystem));

  console.log('\n── home market keeps homegrown pride ──');
  const homeItem = { ...cityHub, payload:{ ...cityHub.payload, wpParent:'ae' } };
  await A.rewriteWithClaude(homeItem, 'tighten intro');
  ok('home directive present (UAE home market)', /homegrown in its UAE home market/i.test(lastSystem), lastSystem.slice(-260));
  ok('no franchise guard on home copy', !/NEVER describe/i.test(lastSystem));

  console.log('\n── handleReject: revised item keeps the market tag (v7.9.58) ──');
  STORE_ITEM = { id:'itm_seeb', status:'pending', type:'page_creation', brand:'bonbird',
    title:'City hub: Seeb', locationTag:'🇴🇲 Oman',
    payload:{ pageType:'city_hub', wpParent:'om', template:'template-location.php', slug:'seeb',
      title:'Fried Chicken Seeb', metaTitle:'Fried Chicken Seeb | Bonbird', description:'d',
      content:'<p>old copy</p><h2>FAQs</h2><h3>Q?</h3><p>A.</p>', targetKeyword:'fried chicken seeb' } };
  CREATED.length = 0;
  const res = await A.handleReject({ id:'itm_seeb', feedback:'make the copy more exciting', actor:'shazin' }, 'shazin');
  const created = CREATED[0];
  ok('handleReject returned 200', res && res.statusCode === 200, res && res.statusCode);
  ok('a revised item was created', !!created, created);
  ok('revised inherits 🇴🇲 Oman tag (not defaulted to UAE)', created && created.locationTag === '🇴🇲 Oman', created && created.locationTag);
  ok('revised title marked (revised)', created && /\(revised\)$/.test(created.title), created && created.title);
  ok('revised keeps city_hub routing', created && created.payload && created.payload.pageType === 'city_hub' && created.payload.wpParent === 'om');

  console.log(`\n${fail? '❌':'✅'} ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
