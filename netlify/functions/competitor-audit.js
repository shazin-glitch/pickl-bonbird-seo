// netlify/functions/competitor-audit.js
// Deep Competitor Audit — enter any domain, get top 50 keywords + traffic estimate.
//
// GET ?domain=xxx      — returns cached audit result (24hr TTL)
// POST { domain }      — runs fresh audit via DataForSEO Labs ranked_keywords/live
//
// DataForSEO Labs: ranked_keywords/live (one call per domain)
// Returns: top 50 keywords by search volume, domain traffic metrics, ETV.
// Cost: ~$0.005/domain audit.
// Requires Labs product enabled on DataForSEO account (separate from SERP Standard).

const { getStore } = require('@netlify/blobs');

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';
const CACHE_TTL_MS   = 24 * 60 * 60 * 1000; // 24 hours

function getAuthHeader() {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

function cleanDomain(input) {
  if (!input) return '';
  try {
    const url = input.includes('://') ? new URL(input) : new URL('https://' + input);
    return url.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return input.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase().trim();
  }
}

async function runAudit(domain, authHeader) {
  const res = await fetch(`${DATAFORSEO_BASE}/dataforseo_labs/google/ranked_keywords/live`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify([{
      target:        domain,
      location_code: 21191, // Dubai
      language_code: 'en',
      limit:         50,
      order_by:      ['keyword_data.keyword_info.search_volume,desc'],
      filters:       [['keyword_data.keyword_info.search_volume', '>', 0]],
    }]),
  });

  const data = await res.json();

  if (data.status_code === 40300 || res.status === 403) {
    throw new Error('DataForSEO Labs access not enabled on your account. Enable at app.dataforseo.com → API Access.');
  }
  if (data.status_code !== 20000) {
    throw new Error(`Labs API error ${data.status_code}: ${data.status_message}`);
  }

  const result = data.tasks?.[0]?.result?.[0];
  if (!result) return { keywords: [], metrics: null };

  const keywords = (result.items || []).map(item => {
    const kd   = item.keyword_data || {};
    const info = kd.keyword_info   || {};
    const se   = item.ranked_serp_element?.serp_item || {};
    return {
      keyword:       kd.keyword      || '',
      position:      se.rank_group   || null,
      volume:        info.search_volume     || 0,
      cpc:           info.cpc               || 0,
      competition:   info.competition_level || '',
      trafficPct:    se.traffic_percent     || 0,
      url:           se.url                 || null,
    };
  });

  const org = result.metrics?.organic || {};
  const metrics = {
    totalKeywords: result.total_count       || 0,
    top10:         org.pos_1_10             || (org.pos_1 || 0) + (org.pos_2_3 || 0) + (org.pos_4_10 || 0),
    top3:          (org.pos_1 || 0) + (org.pos_2_3 || 0),
    etv:           org.etv                  || 0, // estimated monthly traffic value $
    count:         org.count                || 0,
  };

  return { keywords, metrics };
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const store = getStore({
    name:   'seo-tool',
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  try {
    // ── GET: return cached result ────────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      const domain = cleanDomain(event.queryStringParameters?.domain || '');
      if (!domain) return { statusCode: 400, headers, body: JSON.stringify({ error: 'domain required' }) };

      const cached = await store.get(`competitorAuditCache:${domain}`, { type: 'json' }).catch(() => null);
      if (cached && (Date.now() - new Date(cached.fetchedAt).getTime()) < CACHE_TTL_MS) {
        return { statusCode: 200, headers, body: JSON.stringify(cached) };
      }
      return { statusCode: 404, headers, body: JSON.stringify({ notFound: true }) };
    }

    // ── POST: run audit ──────────────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
      const body   = JSON.parse(event.body || '{}');
      const domain = cleanDomain(body.domain || '');

      if (!domain) return { statusCode: 400, headers, body: JSON.stringify({ error: 'domain required' }) };

      const authHeader = getAuthHeader();
      let keywords = [], metrics = null, labsError = null;

      try {
        ({ keywords, metrics } = await runAudit(domain, authHeader));
      } catch (e) {
        labsError = e.message;
        console.error(`[competitor-audit] Labs error for ${domain}:`, e.message);
      }

      const result = { domain, keywords, metrics, labsError, fetchedAt: new Date().toISOString() };
      if (!labsError) {
        await store.set(`competitorAuditCache:${domain}`, JSON.stringify(result));
      }

      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('[competitor-audit] Error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
