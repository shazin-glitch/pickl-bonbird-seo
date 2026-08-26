// Offline test: the market-presence directive (v7.9.32). Mocks config — no network.
const path = require('path');
const FN = path.join(__dirname, '..', 'netlify', 'functions');

const icp = require.resolve(path.join(FN, '_lib/international-config.js'));
const real = require(icp);
require.cache[icp].exports = { ...real, citiesForMarketAsync: async (m) => {
  if (m === 'bonbird_pakistan') return [{ city: 'Lahore', slug: 'lahore', venues: [
    { name: 'Cue Cinemas, Gulberg' }, { name: 'Dolmen Mall, DHA' }, { name: 'Johar Town' }] }];
  if (m === 'bonbird_qatar') return [];   // onboarded market, venues not yet configured
  return [];
} };

const src = require('fs').readFileSync(path.join(FN, 'generate-draft.js'), 'utf8');
const body = src.match(/async function buildPresenceDirective[\s\S]*?\n}/)[0];
const { citiesForMarketAsync } = require(path.join(FN, '_lib/international-config.js'));
const buildPresenceDirective = new Function('citiesForMarketAsync', `return (${body})`)(citiesForMarketAsync);

let pass=0, fail=0;
const ok=(n,c,e)=>{c?(pass++,console.log('  ✅',n)):(fail++,console.log('  ❌',n,e!==undefined?JSON.stringify(e):''));};

(async () => {
  const PK = { label: 'Pakistan' }, QA = { label: 'Qatar' };

  const pk = await buildPresenceDirective('bonbird_pakistan', PK, 'Bonbird');
  console.log('\n  PAKISTAN →', pk.trim().split('\n').map(s=>s.trim()).join('\n     '));
  ok('states the brand IS trading there', /IS open and trading in Pakistan/.test(pk));
  ok('names every configured venue', ['Cue Cinemas, Gulberg','Dolmen Mall, DHA','Johar Town'].every(v => pk.includes(v)), pk);
  ok('forbids the false-absence claim that caused the live skips', /Never say or imply we have no presence/.test(pk));
  ok('still forbids inventing NAP', /Never invent an address/.test(pk));

  const qa = await buildPresenceDirective('bonbird_qatar', QA, 'Bonbird');
  console.log('\n  QATAR (no venues configured) →', qa.trim());
  ok('no-venue market says so explicitly', /has NO venues in Qatar/.test(qa));
  ok('no-venue market still blocks local framing (doorway guard intact)', /do NOT target city-level "local" intent/.test(qa));
  ok('no-venue market does NOT claim presence', !/IS open and trading/.test(qa));

  ok('home market unchanged (empty directive)', (await buildPresenceDirective('uae', null, 'Bonbird')) === '');
  ok('no mkt object → empty', (await buildPresenceDirective('bonbird_pakistan', null, 'Bonbird')) === '');

  console.log(`\n${fail===0?'✅':'❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail?1:0);
})();
