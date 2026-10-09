// netlify/functions/keyword-metrics.js
// On-demand keyword metrics: monthly search volume, CPC and Keyword Difficulty (0–100)
// for a short list of keywords in ONE market. Used to justify focus keywords (title
// rewrites, Q4 targets, the scorecard) with real numbers instead of guesses.
//
//   POST /api/keyword-metrics { brand, market, keywords: [..], locationCode? }   (max 50 keywords)
//     → { brand, market, locationCode, metrics: { [keywordLower]: { volume, cpc, kd } } }
//   POST { brand, market, mode:'ideas', keywords:[seeds ≤20], limit?≤300, minVolume? }
//     → { ..., ideas: [{ keyword, volume, cpc, kd, intent }] }  — the related keyword UNIVERSE
//       for the market (incl. terms we don't rank for), sorted by volume. Labs keyword_ideas
//       (live, allowed under rule #5's Labs exception) — same call as weekly discovery.
//   POST { brand, market, mode:'serp_submit', keywords:[≤20], device?:'mobile'|'desktop' }
//     → { tasks:[{ id, keyword }] }   — Google SERP via STANDARD mode task_post (rule #5)
//   POST { brand, market, mode:'serp_get', ids:[≤20] }
//     → { results:[{ id, keyword, ready, features, items:[{ type, rank, domain, title, url }] }] }
//       Caller polls serp_get until every task is ready (standard queue: ~1–5 min).
//   POST { brand, market, mode:'ranked', target:'domain.com', limit?≤1000, minVolume? }
//     → { ranked:[{ keyword, volume, kd, intent, position, url }] } — every keyword a domain
//       ranks for in the market (Labs ranked_keywords/live; rule #5 Labs exception). Used for
//       competitor keyword research.
//
// Gated (rule #11): it spends DataForSEO credit (~$0.05–0.10 per call). Location comes
// from the markets config (rule #2): UAE uses the country code, every other market its
// configured location_code. Reuses _lib/keyword-metrics (search_volume + bulk KD, live).

const { authorize, denied } = require('./_lib/auth');
const { enrichKeywordsMixed } = require('./_lib/keyword-metrics');
const { getLocationCodes, getMarket } = require('./_lib/markets-config');
const { getBrand } = require('./_lib/brands-config');

const MAX_KEYWORDS = 50;
const json = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  const auth = await authorize(event);
  if (!auth.ok) return denied();
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) return json(500, { error: 'DataForSEO credentials missing' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const { brand, market } = body;
  const keywords = Array.isArray(body.keywords) ? body.keywords.map(k => String(k || '').trim()).filter(Boolean) : [];
  if (!brand || !(await getBrand(brand))) return json(400, { error: 'Unknown brand' });
  if (!market) return json(400, { error: 'market required' });
  if (!keywords.length && body.mode !== 'serp_get' && body.mode !== 'ranked') return json(400, { error: 'keywords required' });
  if (keywords.length > MAX_KEYWORDS) return json(400, { error: `max ${MAX_KEYWORDS} keywords per call` });

  // Market records are keyed by their record key (e.g. 'bonbird_oman'); getLocationCodes()
  // is keyed by the shared marketKey ('oman'), so resolve the record directly.
  const locs = await getLocationCodes();
  const m = market === 'uae' ? null : await getMarket(market).catch(() => null);
  if (market !== 'uae' && !m) return json(400, { error: `Unknown market ${market}` });
  if (m && m.brand && m.brand !== brand) return json(400, { error: `Market ${market} belongs to ${m.brand}` });
  // Optional explicit override (integer) — used to verify a market's configured code.
  const override = Number.isInteger(body.locationCode) ? body.locationCode : null;
  const locationCode = override || (market === 'uae' ? (locs.uae_country || locs.uae) : m.location_code);
  if (!locationCode) return json(400, { error: `No location configured for market ${market}` });

  const authHeader = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
  const langs = (m && Array.isArray(m.languages) && m.languages.length) ? m.languages : ['en'];

  // ── SERP snapshot (standard mode: task_post now, task_get later) ───────────
  if (body.mode === 'serp_submit') {
    const kws = keywords.slice(0, 20);
    const device = body.device === 'desktop' ? 'desktop' : 'mobile';
    const tasks = kws.map(k => ({ keyword: k, location_code: locationCode, language_code: /[\u0600-\u06FF]/.test(k) ? 'ar' : (langs[0] || 'en'),
      device, depth: 10, load_async_ai_overview: true }));
    const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/task_post', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authHeader }, body: JSON.stringify(tasks) });
    const d = await r.json().catch(() => ({}));
    if (d.status_code !== 20000) return json(502, { error: `DataForSEO: ${d.status_message || r.status}` });
    return json(200, { brand, market, locationCode, mode: 'serp_submit', device,
      tasks: (d.tasks || []).map((t, i) => ({ id: t.id, keyword: kws[i], ok: t.status_code === 20100 || t.status_code === 20000, msg: t.status_message })) });
  }
  if (body.mode === 'serp_get') {
    const ids = (Array.isArray(body.ids) ? body.ids : []).filter(x => /^[0-9a-f-]{20,}$/i.test(String(x))).slice(0, 20);
    if (!ids.length) return json(400, { error: 'ids required' });
    const results = await Promise.all(ids.map(async id => {
      const r = await fetch(`https://api.dataforseo.com/v3/serp/google/organic/task_get/advanced/${id}`, { headers: { Authorization: authHeader } });
      const d = await r.json().catch(() => ({}));
      const t = d.tasks?.[0];
      if (!t || t.status_code !== 20000) return { id, ready: false, msg: t?.status_message || null };
      const res = t.result?.[0] || {};
      const items = (res.items || []).slice(0, 25).map(it => ({
        type: it.type, rank: it.rank_group ?? null, domain: it.domain || null,
        title: (it.title || '').slice(0, 90) || null, url: it.url || null,
        sub: it.type === 'local_pack' ? (it.title || null) : undefined,
      }));
      return { id, ready: true, keyword: res.keyword, features: res.item_types || [], items };
    }));
    return json(200, { brand, market, mode: 'serp_get', results });
  }

  // ── Competitor (or own) ranked keywords ────────────────────────────────────
  if (body.mode === 'ranked') {
    const target = String(body.target || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(target)) return json(400, { error: 'target domain required' });
    const limit = Math.min(Math.max(parseInt(body.limit, 10) || 500, 10), 1000);
    const minVolume = Math.max(parseInt(body.minVolume, 10) || 10, 0);
    const post = async (withLang) => {
      const payload = { target, location_code: locationCode, limit, load_rank_absolute: true,
        order_by: ['keyword_data.keyword_info.search_volume,desc'],
        filters: [['keyword_data.keyword_info.search_volume', '>', minVolume]] };
      if (withLang) payload.language_code = langs[0] || 'en';
      const r = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authHeader }, body: JSON.stringify([payload]) });
      return r.json().catch(() => ({}));
    };
    let data = await post(true), task = data.tasks?.[0];
    if (data.status_code === 20000 && task && task.status_code !== 20000 && /language_code/i.test(task.status_message || '')) { data = await post(false); task = data.tasks?.[0]; }
    if (data.status_code !== 20000 || !task || task.status_code !== 20000) return json(502, { error: `DataForSEO: ${task?.status_message || data.status_message || 'failed'}` });
    const res = task.result?.[0] || {};
    const ranked = (res.items || []).map(i => ({
      keyword: i.keyword_data?.keyword,
      volume: i.keyword_data?.keyword_info?.search_volume ?? null,
      kd: i.keyword_data?.keyword_properties?.keyword_difficulty ?? null,
      intent: i.keyword_data?.search_intent_info?.main_intent || null,
      position: i.ranked_serp_element?.serp_item?.rank_group ?? null,
      type: i.ranked_serp_element?.serp_item?.type || null,
      url: i.ranked_serp_element?.serp_item?.url || null,
    })).filter(x => x.keyword);
    return json(200, { brand, market, locationCode, mode: 'ranked', target, totalCount: res.total_count ?? null, ranked });
  }

  if (body.mode === 'ideas') {
    const seeds = keywords.slice(0, 20);
    const limit = Math.min(Math.max(parseInt(body.limit, 10) || 200, 10), 300);
    const minVolume = Math.max(parseInt(body.minVolume, 10) || 10, 0);
    const post = async (withLang) => {
      const payload = { keywords: seeds, location_code: locationCode, limit, include_serp_info: false,
        order_by: ['keyword_info.search_volume,desc'], filters: [['keyword_info.search_volume', '>', minVolume]] };
      if (withLang) payload.language_code = langs[0] || 'en';
      const r = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authHeader }, body: JSON.stringify([payload]) });
      return r.json().catch(() => ({}));
    };
    let data = await post(true), task = data.tasks?.[0];
    if (data.status_code === 20000 && task && task.status_code !== 20000 && /language_code/i.test(task.status_message || '')) { data = await post(false); task = data.tasks?.[0]; }
    if (data.status_code !== 20000 || !task || task.status_code !== 20000) return json(502, { error: `DataForSEO: ${task?.status_message || data.status_message || 'failed'}` });
    const ideas = (task.result?.[0]?.items || []).map(i => ({
      keyword: i.keyword,
      volume: i.keyword_info?.search_volume ?? null,
      cpc: i.keyword_info?.cpc ?? null,
      kd: i.keyword_properties?.keyword_difficulty ?? null,
      intent: i.search_intent_info?.main_intent || null,
    }));
    return json(200, { brand, market, locationCode, mode: 'ideas', seeds, ideas });
  }
  const metrics = await enrichKeywordsMixed(keywords, locationCode, authHeader, langs);
  return json(200, { brand, market, locationCode, metrics });
};
