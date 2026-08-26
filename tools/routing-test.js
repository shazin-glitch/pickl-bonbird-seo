// Offline test: page_creation routing (v7.9.34) — scaffold fill vs templated create vs
// blocked venue page. Uses the REAL live Bonbird Pakistan data. No network.
const path = require('path');
const FN = path.join(__dirname, '..', 'netlify', 'functions');

const icp = require.resolve(path.join(FN, '_lib/international-config.js'));
const real = require(icp);
require.cache[icp].exports = { ...real,
  INTERNATIONAL_MARKETS: { ...real.INTERNATIONAL_MARKETS, bonbird_pakistan: { label: 'Pakistan', marketSlug: 'pk' } },
  citiesForMarketAsync: async () => ([{ city: 'Lahore', slug: 'lahore', venues: [
    { name: 'Cue Cinemas, Gulberg' }, { name: 'Dolmen Mall, DHA' }, { name: 'Johar Town' }] }]),
};

// Live scaffold set: 4 real product scaffolds under /pk/ (parent 517) + the cruft drafts
// that share the endpoint (parent 0, no template) and must NEVER be matched.
const WP = [];
global.fetch = async (url, opts) => {
  const b = JSON.parse(opts.body); WP.push(b.action);
  if (b.action === 'get_current_meta') return { json: async () => ({ found: true, postId: 517 }) };
  if (b.action === 'list_scaffolds') return { json: async () => ({ scaffolds: [
    { id: 47016, slug: 'chicken-tenders', link: '/?page_id=47016', template: 'template-product.php', parent: 517, words: 0 },
    { id: 47015, slug: 'chicken-burger',  link: '/?page_id=47015', template: 'template-product.php', parent: 517, words: 0 },
    { id: 47014, slug: 'wraps',           link: '/?page_id=47014', template: 'template-product.php', parent: 517, words: 0 },
    { id: 47013, slug: 'chicken',         link: '/?page_id=47013', template: 'template-product.php', parent: 517, words: 0 },
    { id: 47012, slug: 'chicken-tenders', link: '/?page_id=47012', template: 'template-product.php', parent: 542, words: 0 }, // QATAR
    { id: 90001, slug: 'qatar-games',     link: '/?page_id=90001', template: '',                     parent: 0,   words: 0 }, // cruft
    { id: 90002, slug: 'thank-you',       link: '/?page_id=90002', template: 'elementor_canvas',     parent: 0,   words: 0 }, // cruft
  ] }) };
  return { json: async () => ({}) };
};

const { preflightPageCreations } = require(path.join(FN, '_lib/market-planner.js'));
let pass=0, fail=0;
const ok=(n,c,e)=>{c?(pass++,console.log('  ✅',n)):(fail++,console.log('  ❌',n,e!==undefined?JSON.stringify(e):''));};

const mk = (kw, extra = {}) => ({ keyword: kw, assetType: 'page_creation',
  call: { brand: 'bonbird', keyword: kw, market: 'bonbird_pakistan', actionType: 'page_creation', ...extra }, error: null });

(async () => {
  // The 6 page_creation items the first batch run had to hold back, plus the city hub.
  const mapped = [
    mk('chicken tenders'), mk('chicken sandwich'), mk('chicken fries'),
    mk('best burger in lahore'), mk('bonbird johar town lahore'), mk('bonbird gulberg lahore'),
    mk('fast food in lahore', { pageKind: 'city_hub', city: 'lahore' }),
  ];
  await preflightPageCreations(mapped, { brand: 'bonbird', market: 'bonbird_pakistan', site: 'https://x', headers: {} });
  const by = Object.fromEntries(mapped.map(m => [m.keyword, m]));
  mapped.forEach(m => console.log(`     ${m.keyword.padEnd(28)} → ${m.call ? (m.routedTo || 'unchanged') : 'BLOCKED: ' + String(m.error).slice(0, 70)}`));

  console.log('\n── Scaffold fill (the cheapest, safest win) ──');
  const ct = by['chicken tenders'];
  ok('matched the PK scaffold', ct.call.postId === 47016 && ct.call.pageKind === 'template_product', ct.call);
  ok('did NOT match the Qatar scaffold with the same slug', ct.call.postId !== 47012);
  ok('carries no template/parent (filling, not creating)', !ct.call.template && !ct.call.wpParent);

  console.log('\n── Conservative matching (no wrong-scaffold fills) ──');
  ok('"chicken sandwich" does NOT fill the generic "chicken" page', !by['chicken sandwich'].call.postId);
  ok('"chicken fries" does NOT fill the generic "chicken" page', !by['chicken fries'].call.postId);
  ok('"best burger in lahore" does NOT fill chicken-burger (needs BOTH tokens)', !by['best burger in lahore'].call.postId);
  ok('cruft drafts (parent 0 / no template) never matched', !mapped.some(m => m.call && [90001, 90002].includes(m.call.postId)));

  console.log('\n── Templated create (was a guaranteed 409 before) ──');
  for (const k of ['chicken sandwich', 'chicken fries', 'best burger in lahore']) {
    ok(`"${k}" → product template under /pk/`,
       by[k].call.pageKind === 'template_product' && by[k].call.wpParent === 'pk', by[k].call);
  }

  console.log('\n── Venue pages blocked, with an actionable reason ──');
  for (const k of ['bonbird johar town lahore', 'bonbird gulberg lahore']) {
    ok(`"${k}" blocked`, !by[k].call && /CHILD of that city's hub/.test(by[k].error), by[k].error);
  }
  ok('a city keyword alone is NOT treated as a venue', by['best burger in lahore'].call !== null);

  console.log('\n── Untouched paths ──');
  ok('city_hub item left alone', by['fast food in lahore'].call.pageKind === 'city_hub' && !by['fast food in lahore'].routedTo);
  const metaOnly = [{ keyword: 'x', assetType: 'meta_update', call: { actionType: 'meta_update' } }];
  WP.length = 0;
  await preflightPageCreations(metaOnly, { brand: 'bonbird', market: 'bonbird_pakistan', site: 'https://x', headers: {} });
  ok('no page_creation → no WP calls at all', WP.length === 0);
  const home = [mk('anything')];
  await preflightPageCreations(home, { brand: 'bonbird', market: 'uae', site: 'https://x', headers: {} });
  ok('home market unchanged (no marketSlug)', !home[0].routedTo && !home[0].call.pageKind);

  console.log(`\n${fail===0?'✅':'❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail?1:0);
})();
