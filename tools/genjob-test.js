// Offline test: generate-draft async job contract (v7.9.40) — handler fires a background
// job + returns jobId, poll reads it, guards hold. Mocks blobs/auth/fetch. No Claude/WP.
const path = require('path');
const FN = path.join(__dirname, '..', 'netlify', 'functions');

const KV = new Map();
const bp = require.resolve('@netlify/blobs', { paths: [FN] });
require.cache[bp] = { id: bp, filename: bp, loaded: true, exports: { getStore: () => ({
  get: async k => KV.has(k) ? JSON.parse(KV.get(k)) : null,
  setJSON: async (k, v) => { KV.set(k, JSON.stringify(v)); } }) } };

const authPath = require.resolve(path.join(FN, '_lib/auth.js'));
let AUTH = { ok: true, via: 'session', user: { email: 'shazin@yolkbrands.com', role: 'admin' } };
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  authorize: async () => AUTH, authorizeJob: async () => ({ ok: true }),
  denied: () => ({ statusCode: 401, body: '{"error":"denied"}' }),
  internalHeaders: (e = {}) => ({ 'x-nest-internal': 'T', ...e }) } };

const SENT = [];
global.fetch = async (url, opts) => { SENT.push({ url, body: JSON.parse(opts.body || '{}') }); return { status: 202, json: async () => ({ ok: true }) }; };

const gd = require(path.join(FN, 'generate-draft.js'));
const call = (body) => gd.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(body) });
const J = r => JSON.parse(r.body);
let pass = 0, fail = 0;
const ok = (n, c, e) => { c ? (pass++, console.log('  ✅', n)) : (fail++, console.log('  ❌', n, e !== undefined ? JSON.stringify(e) : '')); };

(async () => {
  console.log('\n── Fire returns a jobId + stores running + fires the bg worker ──');
  SENT.length = 0;
  let r = await call({ brand: 'bonbird', keyword: 'fried chicken lahore', market: 'bonbird_pakistan', actionType: 'blog_draft' });
  let d = J(r);
  ok('202 running', r.statusCode === 202 && d.status === 'running', d);
  ok('returns a jobId', typeof d.jobId === 'string' && d.jobId.length > 10);
  ok('stored a running record', JSON.parse(KV.get(`genDraftJob:${d.jobId}`)).status === 'running');
  ok('fired generate-draft-background exactly once', SENT.filter(x => x.url.endsWith('/generate-draft-background')).length === 1, SENT.map(x=>x.url));
  ok('bg call carries the jobId + params', SENT[0].body.jobId === d.jobId && SENT[0].body.keyword === 'fried chicken lahore');
  const jobId = d.jobId;

  console.log('\n── Poll ──');
  ok('poll running job → running', J(await call({ action: 'job', jobId })).status === 'running');
  // simulate the bg worker finishing
  KV.set(`genDraftJob:${jobId}`, JSON.stringify({ status: 'done', statusCode: 200, ok: true, item: { id: 'appr_x', title: 'Blog: x' } }));
  const done = J(await call({ action: 'job', jobId }));
  ok('poll done → carries the item', done.status === 'done' && done.item.id === 'appr_x', done);
  ok('poll unknown jobId → none', J(await call({ action: 'job', jobId: 'nope' })).status === 'none');
  ok('poll without jobId → 400', (await call({ action: 'job' })).statusCode === 400);

  console.log('\n── Guards ──');
  ok('missing brand/keyword → 400', (await call({ actionType: 'blog_draft' })).statusCode === 400);
  AUTH = { ok: true, via: 'session', user: { email: 'v@x.com', role: 'viewer' } };
  ok('viewer blocked from generating → 403', (await call({ brand: 'bonbird', keyword: 'x' })).statusCode === 403);
  ok('viewer CAN still poll a job', (await call({ action: 'job', jobId })).statusCode === 200);
  AUTH = { ok: false, via: null, user: null };
  ok('unauthenticated → denied', (await call({ brand: 'bonbird', keyword: 'x' })).statusCode === 401);
  AUTH = { ok: true, via: 'session', user: { email: 'shazin@yolkbrands.com', role: 'admin' } };

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
