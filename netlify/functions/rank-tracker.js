// netlify/functions/rank-tracker.js
// Rank tracker — tracked keyword set per brand×market with position-over-time.
// Seeded from the data-driven worklist, curatable (add/remove/pin), aspirational
// terms pinnable. History is appended weekly by the scheduler cron (see _lib/rank-tracker
// updateRankHistory); this endpoint reads it and serves add/remove/pin mutations.
//
//   GET  ?brand=pickl&market=uae
//        → { brand, market, markets:[{key,label,flag}], keywords:[{...,current,delta,history}], summary, updatedAt }
//   POST { action:'add'|'remove'|'pin'|'unpin'|'reseed', brand, market, keyword? }
//        → { ok, keywords, summary }
//
// AUTH (#11): gated with authorize() — tracked-keyword sets + our ranking history are
// non-public, and POST mutates state. No external spend here (GSC pull happens in cron).

const { getStore } = require('@netlify/blobs');
const { authorize, denied } = require('./_lib/auth');
const { getBrandContext, isBrandedQuery } = require('./_lib/brand');
const {
  marketsForBrand, ensureTracked, getTracked, saveTracked,
  getHistory, seedFromWorklist, buildView,
} = require('./_lib/rank-tracker');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (statusCode, body) => ({ statusCode, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const store = () => getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const auth = await authorize(event);
  if (!auth.ok) return denied();

  try {
    const s = store();

    if (event.httpMethod === 'GET') {
      const q      = event.queryStringParameters || {};
      const brand  = q.brand  || 'pickl';
      const market = q.market || 'uae';
      const set      = await ensureTracked(s, brand, market);
      const history  = await getHistory(s, brand, market);
      const brandCtx = await getBrandContext(brand).catch(() => ({ brand }));
      const { keywords, summary } = buildView(set, history, kw => isBrandedQuery(kw, brandCtx));
      return json(200, {
        brand, market,
        markets: await marketsForBrand(brand),
        keywords, summary,
        seededAt: set.seededAt || null,
        updatedAt: set.updatedAt || null,
      });
    }

    if (event.httpMethod === 'POST') {
      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad JSON body' }); }
      const { action, brand, market } = body;
      const keyword = (body.keyword || '').trim();
      if (!brand || !market || !action) return json(400, { error: 'brand, market and action are required' });

      // Load (or lazily create) the set so mutations always have a base.
      let set = await getTracked(s, brand, market);
      if (!set || !Array.isArray(set.keywords)) set = await ensureTracked(s, brand, market);
      const lc = keyword.toLowerCase();
      const has = () => set.keywords.some(k => String(k.keyword).toLowerCase() === lc);

      switch (action) {
        case 'add': {
          if (!keyword) return json(400, { error: 'keyword required for add' });
          if (!has()) {
            set.keywords.push({
              keyword, vol: null, kd: null, targetPage: null, intent: null, tier: null,
              pinned: false, aspirational: true, source: 'manual', addedAt: Date.now(),
            });
          }
          break;
        }
        case 'remove': {
          if (!keyword) return json(400, { error: 'keyword required for remove' });
          set.keywords = set.keywords.filter(k => String(k.keyword).toLowerCase() !== lc);
          break;
        }
        case 'pin':
        case 'unpin': {
          if (!keyword) return json(400, { error: 'keyword required for pin/unpin' });
          set.keywords = set.keywords.map(k =>
            String(k.keyword).toLowerCase() === lc ? { ...k, pinned: action === 'pin' } : k);
          break;
        }
        case 'reseed': {
          // Refresh from the worklist WITHOUT losing manual adds or pinned terms.
          const fresh    = await seedFromWorklist(s, brand, market);
          const freshKeys = new Set(fresh.map(k => k.keyword.toLowerCase()));
          const keep      = set.keywords.filter(k => k.pinned || k.source === 'manual' || freshKeys.has(String(k.keyword).toLowerCase()));
          const keepKeys  = new Set(keep.map(k => String(k.keyword).toLowerCase()));
          const additions = fresh.filter(k => !keepKeys.has(k.keyword.toLowerCase()));
          set.keywords    = [...keep, ...additions];
          break;
        }
        default:
          return json(400, { error: 'unknown action: ' + action });
      }

      const saved    = await saveTracked(s, brand, market, set);
      const history  = await getHistory(s, brand, market);
      const brandCtx = await getBrandContext(brand).catch(() => ({ brand }));
      const { keywords, summary } = buildView(saved, history, kw => isBrandedQuery(kw, brandCtx));
      return json(200, { ok: true, brand, market, keywords, summary, updatedAt: saved.updatedAt });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
