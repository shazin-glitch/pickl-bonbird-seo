// netlify/functions/brand-discover.js  →  /api/brand-discover
// ─────────────────────────────────────────────────────────────────────────────
// The "wow" of onboarding: give it a DOMAIN, it figures out the brand.
// Runs three discoveries in parallel and returns them for the wizard's review step:
//   1. Reads the homepage (+ a couple of key pages) → Claude infers IDENTITY:
//      name, vertical, positioning, what-it-sells, a brand-voice sample, tagline,
//      branded terms, locations.
//   2. DataForSEO Labs `ranked_keywords` on the domain → SEED KEYWORDS it already ranks for.
//   3. DataForSEO Labs `competitors_domain` → suggested COMPETITORS (SERP overlap).
// The human then reviews/edits and approves — no manual typing to start.
//
//   POST { domain, name?, locationCode? } → { ok, identity, seedKeywords[], competitors[], read[] }
//
// Gated (spends Claude + DataForSEO): session admin/manager, or internal.

const { callClaude, extractJson } = require('./_lib/store');
const { getVertical, VERTICALS } = require('./_lib/brands-config');
const { authorize, denied } = require('./_lib/auth');

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (s, b) => ({ statusCode: s, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const DFS = 'https://api.dataforseo.com/v3';

function bareDomain(input) {
  return String(input || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase();
}
function dfsAuth() {
  const l = process.env.DATAFORSEO_LOGIN, p = process.env.DATAFORSEO_PASSWORD;
  return (l && p) ? 'Basic ' + Buffer.from(`${l}:${p}`).toString('base64') : null;
}

// Fetch a page and reduce it to readable text (scripts/styles/tags stripped, capped).
async function fetchPageText(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 (NestBot; SEO onboarding)' } });
    if (!res.ok) return '';
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000);
  } catch { return ''; }
}

// 1) Identity via Claude reading the site.
async function discoverIdentity(domain, hintName, pages) {
  const siteText = pages.map(p => `[${p.path}]\n${p.text}`).join('\n\n').slice(0, 9000);
  const verticals = Object.keys(VERTICALS).join(' | ');
  const prompt = `You are onboarding a brand into an SEO platform by reading its website. Domain: ${domain}${hintName ? ` (name hint: "${hintName}")` : ''}.

WEBSITE TEXT (homepage + key pages):
${siteText || '(could not fetch site text — infer conservatively from the domain name only)'}

Infer the brand from the site. Choose vertical from EXACTLY one of: ${verticals} (pick the closest — 'restaurant' for food/QSR, 'cafe' for coffee/café/bakery, 'corporate' for a company/group/holding with no single product menu).

Return ONLY JSON:
{
  "name": "the brand's display name",
  "vertical": "one of ${verticals}",
  "positioning": "1-2 sentence description of what the brand is and what it sells",
  "sells": "short comma-separated list of what it offers (products/services/menu categories)",
  "voiceSample": "ONE sentence written in the brand's own voice/tone, as if the brand wrote it (study the site's tone)",
  "tagline": "the brand's tagline if present on the site, else empty string",
  "brandedTerms": ["name variants, common misspellings, non-Latin transliterations someone might search"],
  "locations": ["any city/area/branch names mentioned, else empty"]
}
Do NOT invent facts (awards, locations, menu items) not supported by the text. If unsure, leave a field empty.`;
  try {
    const { text } = await callClaude(prompt, { max_tokens: 900 });
    const p = extractJson(text) || {};
    const vertical = VERTICALS[p.vertical] ? p.vertical : 'restaurant';
    return {
      name: (p.name || hintName || domain.split('.')[0]).toString().trim(),
      vertical,
      positioning: p.positioning || '',
      sells: p.sells || getVertical(vertical).menuSummary,
      voiceSample: p.voiceSample || '',
      tagline: p.tagline || '',
      brandedTerms: Array.isArray(p.brandedTerms) ? p.brandedTerms.filter(Boolean).slice(0, 12) : [],
      locations: Array.isArray(p.locations) ? p.locations.filter(Boolean).slice(0, 20) : [],
    };
  } catch (e) {
    // Fail-open: at least return a vertical guess so the wizard proceeds.
    return { name: hintName || domain.split('.')[0], vertical: 'restaurant', positioning: '', sells: '', voiceSample: '', tagline: '', brandedTerms: [], locations: [], error: e.message };
  }
}

// 2) Seed keywords = the domain's own ranked keywords (non-branded), top by volume.
async function discoverSeeds(domain, locationCode, auth) {
  if (!auth) return [];
  try {
    const res = await fetch(`${DFS}/dataforseo_labs/google/ranked_keywords/live`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify([{ target: domain, location_code: locationCode, limit: 60, order_by: ['ranked_serp_element.serp_item.rank_absolute,asc'] }]),
    });
    const data = await res.json();
    const items = data.tasks?.[0]?.result?.[0]?.items || [];
    const brandRoot = domain.split('.')[0];
    const seen = new Set(), out = [];
    for (const it of items) {
      const kw = it.keyword_data?.keyword || it.keyword;
      if (!kw) continue;
      const k = kw.toLowerCase().trim();
      if (seen.has(k) || k.includes(brandRoot)) continue; // drop dupes + navigational brand terms
      seen.add(k); out.push(kw);
      if (out.length >= 20) break;
    }
    return out;
  } catch { return []; }
}

// 3) Competitors = SERP-overlap domains (reuses the proven competitors_domain call).
async function discoverCompetitors(domain, locationCode, auth) {
  if (!auth) return [];
  try {
    const res = await fetch(`${DFS}/dataforseo_labs/google/competitors_domain/live`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify([{ target: domain, location_code: locationCode, language_code: 'en', limit: 20, filters: [['intersections', '>', 5]], order_by: ['intersections,desc'] }]),
    });
    const data = await res.json();
    const items = data.tasks?.[0]?.result?.[0]?.items || [];
    const SOCIAL = /(facebook|instagram|youtube|tiktok|twitter|x\.com|linkedin|pinterest|wikipedia|tripadvisor|zomato|talabat|deliveroo|noon|careem|google|yelp|reddit|amazon)\./i;
    return items
      .map(it => (it.domain || '').replace(/^www\./, ''))
      .filter(d => d && d !== domain && !SOCIAL.test(d))
      .slice(0, 10)
      .map(d => ({ name: d.split('.')[0].replace(/\b\w/g, c => c.toUpperCase()), domain: d }));
  } catch { return []; }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const auth = await authorize(event);
  if (!auth.ok) return denied();
  if (auth.via === 'session' && !['admin', 'manager'].includes(auth.user?.role)) return json(403, { error: 'Manager or admin only' });
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const domain = bareDomain(body.domain);
  if (!domain || !domain.includes('.')) return json(400, { error: 'A valid website domain is required' });
  const locationCode = parseInt(body.locationCode, 10) || 2784; // UAE country default
  const dAuth = dfsAuth();

  try {
    // Read a few key pages (best-effort, parallel).
    const paths = ['', '/menu', '/about', '/about-us'];
    const pageResults = await Promise.all(paths.map(async p => ({ path: p || '/', text: await fetchPageText(`https://${domain}${p}`) })));
    const read = pageResults.filter(p => p.text);

    const [identity, rawSeeds, competitors] = await Promise.all([
      discoverIdentity(domain, body.name, read.length ? read : [{ path: '/', text: '' }]),
      discoverSeeds(domain, locationCode, dAuth),
      discoverCompetitors(domain, locationCode, dAuth),
    ]);

    // Post-filter seeds against the discovered identity: drop brand-navigational terms
    // (the seed pass runs before identity resolves, so it can't do this itself).
    const brandTokens = [
      domain.split('.')[0],
      ...String(identity.name || '').toLowerCase().split(/\s+/),
      ...(identity.brandedTerms || []).map(t => String(t).toLowerCase()),
    ].filter(t => t && t.length > 2);
    const seedKeywords = rawSeeds.filter(kw => {
      const k = kw.toLowerCase();
      return !brandTokens.some(t => k.includes(t));
    });

    return json(200, {
      ok: true,
      domain,
      identity,
      seedKeywords,
      competitors,
      read: read.map(p => p.path),
      notes: {
        dataforseo: dAuth ? 'ok' : 'DataForSEO credentials missing — seeds/competitors skipped',
        pagesRead: read.length,
      },
    });
  } catch (e) {
    console.error('[brand-discover] failed:', e.message);
    return json(500, { error: e.message });
  }
};
