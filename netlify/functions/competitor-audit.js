// netlify/functions/competitor-audit.js
// Competitor Analysis — full audit of any competitor domain.
//
// GET ?history=1                 — list of past audited domains (last 10)
// GET ?domain=xxx&brand=pickl    — cached audit result (24hr TTL)
// POST { domain, brand }        — run fresh audit:
//   - Top 50 ranking keywords vs our GSC positions (DataForSEO Labs)
//   - On-page crawl: title, meta, H1/H2, schema, canonical, mobile, HTTPS
//   - PageSpeed: mobile + desktop scores, LCP, CLS
//   brand: 'pickl' | 'bonbird' | 'both'

const { getStore } = require('@netlify/blobs');

const DATAFORSEO_BASE  = 'https://api.dataforseo.com/v3';
const PAGESPEED_BASE   = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const CACHE_TTL_MS     = 24 * 60 * 60 * 1000;
const HISTORY_KEY      = 'auditHistory';
const MAX_HISTORY      = 10;

const GSC_SITES = {
  pickl:   'https://eatpickl.com/',
  bonbird: 'sc-domain:bonbirdchicken.com',
};

function getAuthHeader() {
  return 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
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

function stripTags(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

// ── Crawl competitor homepage ──────────────────────────────────────────────────
async function crawlPage(domain) {
  const url = `https://${domain}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YolkSEOBot/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    const isHttps = res.url.startsWith('https');
    const html    = await res.text();

    const get  = (rx)  => { const m = html.match(rx); return m ? stripTags(m[1] || m[0]) : null; };
    const getA = (rx)  => { const ms = [...html.matchAll(rx)]; return ms.slice(0, 6).map(m => stripTags(m[1])); };

    const title       = get(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = get(/<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']*)/i)
                     || get(/<meta\s[^>]*content=["']([^"']*)[^>]*name=["']description["']/i);
    const h1          = get(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const h2s         = getA(/<h2[^>]*>([\s\S]*?)<\/h2>/gi);
    const hasSchema   = /<script[^>]*type=["']application\/ld\+json["']/i.test(html);
    const canonical   = get(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)/i);
    const robotsMeta  = get(/<meta\s[^>]*name=["']robots["'][^>]*content=["']([^"']*)/i);
    const hasMobile   = /<meta\s[^>]*name=["']viewport["']/i.test(html);
    const wordCount   = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length;

    return { isHttps, title, description, h1, h2s, hasSchema, canonical, robotsMeta, hasMobile, wordCount, crawledUrl: res.url };
  } catch (e) {
    return { error: e.message };
  }
}

// ── PageSpeed ─────────────────────────────────────────────────────────────────
async function getPageSpeed(domain) {
  const key = process.env.GOOGLE_PAGESPEED_KEY;
  if (!key) return null;
  const url = `https://${domain}`;

  async function run(strategy) {
    try {
      const r = await fetch(`${PAGESPEED_BASE}?url=${encodeURIComponent(url)}&key=${key}&strategy=${strategy}&category=performance`);
      const d = await r.json();
      const cats = d.lighthouseResult?.categories || {};
      const aud  = d.lighthouseResult?.audits     || {};
      return {
        score:   Math.round((cats.performance?.score || 0) * 100),
        lcp:     aud['largest-contentful-paint']?.displayValue || null,
        cls:     aud['cumulative-layout-shift']?.displayValue  || null,
        fid:     aud['total-blocking-time']?.displayValue      || null,
      };
    } catch { return null; }
  }

  const [mobile, desktop] = await Promise.all([run('mobile'), run('desktop')]);
  return { mobile, desktop };
}

// ── DataForSEO ranked keywords ────────────────────────────────────────────────
async function runKeywordAudit(domain, authHeader) {
  const res = await fetch(`${DATAFORSEO_BASE}/dataforseo_labs/google/ranked_keywords/live`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify([{
      target:        domain,
      location_code: 2784,
      language_code: 'en',
      limit:         50,
      order_by:      ['keyword_data.keyword_info.search_volume,desc'],
      filters:       [['keyword_data.keyword_info.search_volume', '>', 0]],
    }]),
  });

  const data = await res.json();
  if (data.status_code !== 20000) throw new Error(`DataForSEO error ${data.status_code}: ${data.status_message}`);

  const result   = data.tasks?.[0]?.result?.[0];
  if (!result) return { keywords: [], metrics: null };

  const keywords = (result.items || []).map(item => {
    const kd   = item.keyword_data || {};
    const info = kd.keyword_info   || {};
    const se   = item.ranked_serp_element?.serp_item || {};
    return {
      keyword:     kd.keyword             || '',
      position:    se.rank_group          || null,
      volume:      info.search_volume     || 0,
      cpc:         info.cpc               || 0,
      competition: info.competition_level || '',
      trafficPct:  se.traffic_percent     || 0,
      url:         se.url                 || null,
    };
  });

  const org = result.metrics?.organic || {};
  const metrics = {
    totalKeywords: result.total_count || 0,
    top10:  (org.pos_1 || 0) + (org.pos_2_3 || 0) + (org.pos_4_10 || 0),
    top3:   (org.pos_1 || 0) + (org.pos_2_3 || 0),
    etv:    org.etv || 0,
    count:  org.count || 0,
  };

  return { keywords, metrics };
}

// ── GSC position lookup ───────────────────────────────────────────────────────
async function getGscPositions(brand, store) {
  const out = {};
  const brands = brand === 'both' ? ['pickl','bonbird'] : [brand];
  for (const b of brands) {
    try {
      const cache = await store.get(`gscCache:${GSC_SITES[b]}`, { type: 'json' });
      const map = {};
      for (const row of cache?.rows || []) {
        if (row.keyword) map[row.keyword.toLowerCase()] = row.position;
      }
      out[b] = map;
    } catch { out[b] = {}; }
  }
  return out;
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const store = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });

  try {
    if (event.httpMethod === 'GET') {
      const q = event.queryStringParameters || {};

      // Return audit history
      if (q.history === '1') {
        const history = await store.get(HISTORY_KEY, { type: 'json' }).catch(() => []);
        return { statusCode: 200, headers, body: JSON.stringify({ history: history || [] }) };
      }

      // Return cached audit
      const domain = cleanDomain(q.domain || '');
      if (!domain) return { statusCode: 400, headers, body: JSON.stringify({ error: 'domain required' }) };

      const cached = await store.get(`competitorAuditCache:${domain}`, { type: 'json' }).catch(() => null);
      if (cached && (Date.now() - new Date(cached.fetchedAt).getTime()) < CACHE_TTL_MS) {
        return { statusCode: 200, headers, body: JSON.stringify(cached) };
      }
      return { statusCode: 404, headers, body: JSON.stringify({ notFound: true }) };
    }

    if (event.httpMethod === 'POST') {
      const body   = JSON.parse(event.body || '{}');
      const domain = cleanDomain(body.domain || '');
      const brand  = ['pickl','bonbird','both'].includes(body.brand) ? body.brand : 'pickl';

      if (!domain) return { statusCode: 400, headers, body: JSON.stringify({ error: 'domain required' }) };

      console.log(`[competitor-audit] Running full audit for ${domain} (brand: ${brand})`);

      // Run all three in parallel — don't let one failure block others
      const [kwResult, pageData, pageSpeed, gscPositions] = await Promise.all([
        runKeywordAudit(domain, getAuthHeader()).catch(e => ({ keywords: [], metrics: null, error: e.message })),
        crawlPage(domain),
        getPageSpeed(domain),
        getGscPositions(brand, store),
      ]);

      // Enrich keywords with our GSC positions
      const keywords = (kwResult.keywords || []).map(k => {
        const kw = k.keyword.toLowerCase();
        const ourPos = {};
        for (const [b, map] of Object.entries(gscPositions)) {
          ourPos[b] = map[kw] || null;
        }
        return { ...k, ourPos };
      });

      const result = {
        domain, brand, keywords,
        metrics:   kwResult.metrics || null,
        labsError: kwResult.error   || null,
        pageData,
        pageSpeed,
        fetchedAt: new Date().toISOString(),
      };

      // Cache the result
      await store.set(`competitorAuditCache:${domain}`, JSON.stringify(result));

      // Update audit history
      try {
        let history = await store.get(HISTORY_KEY, { type: 'json' }).catch(() => []);
        history = (Array.isArray(history) ? history : []).filter(h => h.domain !== domain);
        history.unshift({ domain, brand, fetchedAt: result.fetchedAt });
        if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
        await store.set(HISTORY_KEY, JSON.stringify(history));
      } catch { /* history is non-critical */ }

      console.log(`[competitor-audit] Done — ${keywords.length} keywords, pageSpeed: ${pageSpeed?.mobile?.score || 'n/a'}`);
      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('[competitor-audit] Error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
