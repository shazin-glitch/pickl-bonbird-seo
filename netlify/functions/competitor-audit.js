// netlify/functions/competitor-audit.js
// Competitor Analysis — full audit of any competitor domain.
//
// GET ?history=1                        — list of past audited domains (last 10)
// GET ?domain=xxx&brand=pickl           — cached audit result (24hr TTL)
// POST { domain, brand }               — run fresh full audit
// POST { action:'recommend', domain }  — run Action Engine on cached audit data

const { getStore } = require('@netlify/blobs');
const { callClaude, extractJson } = require('./_lib/store');
const { MARKET_LOCATION_CODES } = require('./_lib/international-config');

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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let res;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YolkSEOBot/1.0)' },
        redirect: 'follow',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
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
async function runKeywordAudit(domain, authHeader, locationCode = 2784) {
  const res = await fetch(`${DATAFORSEO_BASE}/dataforseo_labs/google/ranked_keywords/live`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify([{
      target:        domain,
      location_code: locationCode,
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

// ── Action Engine — generate recommended actions from audit data ──────────────
async function generateRecommendations(auditData) {
  const { domain, brand, keywords = [], pageData = {}, pageSpeed = {}, metrics = {} } = auditData;
  const ourBrands = brand === 'both' ? ['pickl','bonbird'] : [brand];

  // Build a concise summary for Claude
  const kgaps = keywords
    .filter(k => ourBrands.every(b => !k.ourPos?.[b] || k.ourPos[b] > 20))
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))
    .slice(0, 15)
    .map(k => `- "${k.keyword}" (${k.volume || 0}/mo, their pos #${k.position || '?'})`);

  const ourMobileScore   = null; // We'd need our own score for comparison — skip for now
  const theirMobileScore = pageSpeed?.mobile?.score  || null;
  const theirDesktopScore= pageSpeed?.desktop?.score || null;

  const techGaps = [];
  if (!pageData.hasSchema)  techGaps.push('no schema markup (competitor has it)');
  if (!pageData.hasMobile)  techGaps.push('no mobile viewport meta (competitor has it)');
  if (!pageData.isHttps)    techGaps.push('not on HTTPS (competitor is)');
  if (!pageData.canonical)  techGaps.push('no canonical tag (competitor has it)');
  if (theirMobileScore && theirMobileScore > 60) techGaps.push(`competitor mobile PageSpeed: ${theirMobileScore}/100 — worth benchmarking`);

  const prompt = `You are a marketing and SEO expert analysing a competitor audit for ${ourBrands.map(b => b.charAt(0).toUpperCase()+b.slice(1)).join(' and ')}, a UAE restaurant brand.

Competitor audited: ${domain}
Their metrics: ${metrics.totalKeywords || 0} ranking keywords, ${metrics.top10 || 0} in top 10

Keyword gaps (they rank, we don't appear in top 20):
${kgaps.length ? kgaps.join('\n') : 'None identified'}

Technical gaps vs competitor:
${techGaps.length ? techGaps.join('\n') : 'None identified'}

Generate 5-7 recommended actions for the marketing team. For each action, assign:
- route: "queue" (AI can write the content automatically), "perch" (needs human planning/creativity), or "dev" (technical implementation)
- impact: "high", "medium", or "low"
- effort: "low" (< 1 hour), "medium" (half day), or "high" (multiple days)

ROUTE RULES:
- "queue": blog posts, meta rewrites, landing pages, schema markup content — AI can draft these
- "perch": campaigns, social series, PR pitches, strategic decisions, YouTube video ideas
- "dev": page speed fixes, canonical tags, mobile viewport, HTTPS, schema implementation

Respond with a JSON array only. Each item:
{
  "title": "Short action title",
  "finding": "One sentence — what the data shows",
  "action": "Specific thing to do",
  "impact": "high|medium|low",
  "effort": "low|medium|high",
  "route": "queue|perch|dev",
  "keyword": "target keyword if applicable, else null",
  "department": "seo|social|design|content — most relevant for Perch tasks"
}`;

  try {
    const { text } = await callClaude(prompt, { max_tokens: 1200 });
    const recs = extractJson(text);
    if (!Array.isArray(recs)) return [];
    // Sort: high impact + low effort first
    const impactScore = { high: 3, medium: 2, low: 1 };
    const effortScore = { low: 3, medium: 2, high: 1 };
    return recs.sort((a, b) =>
      (impactScore[b.impact] + effortScore[b.effort]) -
      (impactScore[a.impact] + effortScore[a.effort])
    );
  } catch (e) {
    console.warn('[competitor-audit] Recommendations failed:', e.message);
    return [];
  }
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
      const domain    = cleanDomain(q.domain || '');
      const marketKey = q.market || 'uae_country';
      if (!domain) return { statusCode: 400, headers, body: JSON.stringify({ error: 'domain required' }) };

      const cacheKey = marketKey && marketKey !== 'uae_country'
        ? `competitorAuditCache:${domain}:${marketKey}`
        : `competitorAuditCache:${domain}`;
      const cached = await store.get(cacheKey, { type: 'json' }).catch(() => null);
      if (cached && (Date.now() - new Date(cached.fetchedAt).getTime()) < CACHE_TTL_MS) {
        return { statusCode: 200, headers, body: JSON.stringify(cached) };
      }
      return { statusCode: 404, headers, body: JSON.stringify({ notFound: true }) };
    }

    if (event.httpMethod === 'POST') {
      const body   = JSON.parse(event.body || '{}');

      // ── Recommendation engine — analyse cached audit ───────────────────────
      if (body.action === 'recommend') {
        const domain = cleanDomain(body.domain || '');
        if (!domain) return { statusCode: 400, headers, body: JSON.stringify({ error: 'domain required' }) };
        const cached = await store.get(`competitorAuditCache:${domain}`, { type: 'json' }).catch(() => null);
        if (!cached) return { statusCode: 404, headers, body: JSON.stringify({ error: 'No audit data found — run audit first' }) };
        const recommendations = await generateRecommendations(cached);
        return { statusCode: 200, headers, body: JSON.stringify({ recommendations }) };
      }

      const domain       = cleanDomain(body.domain || '');
      const brand        = ['pickl','bonbird','both'].includes(body.brand) ? body.brand : 'pickl';
      const marketKey    = body.market || 'uae_country'; // e.g. 'pickl_bahrain', 'uae_country'
      const locationCode = MARKET_LOCATION_CODES[marketKey] || 2784;

      if (!domain) return { statusCode: 400, headers, body: JSON.stringify({ error: 'domain required' }) };

      console.log(`[competitor-audit] Running full audit for ${domain} (brand: ${brand})`);

      // Run all three in parallel — don't let one failure block others
      const [kwResult, pageData, pageSpeed, gscPositions] = await Promise.all([
        runKeywordAudit(domain, getAuthHeader(), locationCode).catch(e => ({ keywords: [], metrics: null, error: e.message })),
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
        domain, brand, market: marketKey, locationCode, keywords,
        metrics:   kwResult.metrics || null,
        labsError: kwResult.error   || null,
        pageData,
        pageSpeed,
        fetchedAt: new Date().toISOString(),
      };

      // Cache per domain+market so UAE and Bahrain audits of same domain are separate
      const cacheKey = marketKey && marketKey !== 'uae_country'
        ? `competitorAuditCache:${domain}:${marketKey}`
        : `competitorAuditCache:${domain}`;
      await store.set(cacheKey, JSON.stringify(result));

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
