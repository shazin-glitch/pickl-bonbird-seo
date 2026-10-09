// netlify/functions/keyword-metrics.js
// On-demand keyword metrics: monthly search volume, CPC and Keyword Difficulty (0–100)
// for a short list of keywords in ONE market. Used to justify focus keywords (title
// rewrites, Q4 targets, the scorecard) with real numbers instead of guesses.
//
//   POST /api/keyword-metrics { brand, market, keywords: [..], locationCode? }   (max 50 keywords)
//     → { brand, market, locationCode, metrics: { [keywordLower]: { volume, cpc, kd } } }
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
  if (!keywords.length) return json(400, { error: 'keywords required' });
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
  const metrics = await enrichKeywordsMixed(keywords, locationCode, authHeader, langs);
  return json(200, { brand, market, locationCode, metrics });
};
