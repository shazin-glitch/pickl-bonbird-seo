// Offline test: matchTrackedPosition (v7.9.52) — accurate keyword→position, no fabricated
// rankings for brand-new pages. Extracts the fn from scheduler-background.js.
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','netlify','functions','scheduler-background.js'),'utf8');
const body=src.match(/function matchTrackedPosition[\s\S]*?\n}/)[0];
const matchTrackedPosition=new Function('return '+body)();

// A realistic GSC map: branded/broad terms rank high; the specific new-page phrases are ABSENT.
const pos = {
  'bonbird lahore': 1, 'bonbird': 1.3, 'fried chicken dubai': 8.3, 'bonbird sharjah': 1,
  'chicken tenders': 14.7, 'best chicken tenders lahore': 9, 'chicken wraps lahore': 12, 'fried chicken': 2, 'chickens': 40,
};
const clk = {};
let pass=0, fail=0; const ok=(n,c,e)=>{c?(pass++,console.log('  ✅',n)):(fail++,console.log('  ❌',n,e!==undefined?JSON.stringify(e):''));};
const m = kw => matchTrackedPosition(kw, pos, clk).pos;

console.log('\n── No fabricated rankings for brand-new specific pages ──');
ok('"fried chicken gulberg lahore" → null (not in GSC; must NOT inherit "bonbird lahore" #1)', m('fried chicken gulberg lahore') === null, m('fried chicken gulberg lahore'));
ok('"fried chicken dha lahore" → null', m('fried chicken dha lahore') === null, m('fried chicken dha lahore'));
ok('"fried chicken johar town lahore" → null', m('fried chicken johar town lahore') === null);
ok('"best burger in lahore" → null (no burger query present)', m('best burger in lahore') === null, m('best burger in lahore'));

console.log('\n── Genuine matches still work ──');
ok('exact match: "fried chicken dubai" → 8.3', m('fried chicken dubai') === 8.3);
ok('exact match: "bonbird sharjah" → 1', m('bonbird sharjah') === 1);
ok('"chicken tenders" → 14.7 (exact match wins — the truest signal, not a different long-tail)', m('chicken tenders') === 14.7, m('chicken tenders'));
  ok('longer-tail used only when NO exact: "chicken wraps" → 12 via "chicken wraps lahore"', m('chicken wraps') === 12, m('chicken wraps'));

console.log('\n── Word boundaries (no substring over-match) ──');
ok('"chicken" does NOT match "chickens" (40); matches real chicken phrases', m('chicken') !== 40 && m('chicken') != null, m('chicken'));
ok('a broader query is never inherited by a more-specific tracked kw', m('fried chicken gulberg lahore') === null);

console.log(`\n${fail===0?'✅':'❌'} ${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
