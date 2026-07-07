// netlify/functions/_lib/gsc.js
// Shared Google Search Console helpers. GSC is our OWN-domain, first-party ranking
// data (Google's own numbers) — more accurate and free vs renting Labs data, and it
// covers every market (unlike DataForSEO Labs, which lacks Qatar/Oman/Pakistan).
//
//   getGscAccessToken(store)              → valid access token (refreshes if expiring) or null
//   fetchGscPageQuery(site, token, opts)  → [{ page, keyword, position, impressions, clicks }]
//   fetchGscPageOnly(site, token, opts)   → [{ page, position, impressions, clicks }]
//
// The page+query dimension tells us WHICH PAGE each keyword ranks on, so keywords
// can be attributed to the right market by URL (the whole-property query-only cache
// could not — it flooded every intl market with UAE keywords).
//
// METHODOLOGY (locked): page+query UNDERCOUNTS totals because GSC drops anonymized
// (rare-query) rows for privacy. For an ACCURATE per-page total, use the page-only
// dimension (fetchGscPageOnly). Rule: Totals = page-only; branded/non-branded split
// = page+query (the only way to see the query, accepting the undercount on the split).

const REFRESH_URL = 'https://oauth2.googleapis.com/token';

// Returns a valid GSC access token, refreshing via the stored refresh_token if the
// current one is within 60s of expiry. Persists the refreshed token back to Blobs.
// Returns null if GSC isn't connected. SAFE: never throws.
async function getGscAccessToken(store) {
  const t = await store.get('gscTokens', { type: 'json' }).catch(() => null);
  if (!t || !t.access_token) return null;
  let token = t.access_token;
  if (t.refresh_token && t.expires_at && Date.now() > t.expires_at - 60000) {
    try {
      const res = await fetch(REFRESH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: t.refresh_token,
          grant_type:    'refresh_token',
        }),
      });
      const d = await res.json();
      if (d.access_token) {
        token = d.access_token;
        await store.setJSON('gscTokens', { ...t, access_token: token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 });
      }
    } catch { /* keep the existing token; the call below will surface any auth error */ }
  }
  return token;
}

// Resolve a {startDate,endDate} window. Accepts explicit YYYY-MM-DD dates, or falls
// back to the last `days` ending today. Explicit dates win (the date-range picker).
function resolveWindow({ days = 90, startDate, endDate } = {}) {
  const fmt = d => d.toISOString().split('T')[0];
  if (startDate && endDate) return { startDate, endDate };
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { startDate: startDate || fmt(start), endDate: endDate || fmt(end) };
}

// Core query runner shared by both dimension shapes. Returns { data, error }.
async function runGscQuery(siteUrl, token, dimensions, window, rowLimit) {
  const { startDate, endDate } = resolveWindow(window);
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ startDate, endDate, dataState: 'final', dimensions, rowLimit }),
    });
    const data = await res.json();
    if (data.error) return { error: data.error.message || 'GSC API error' };
    return { data };
  } catch (e) {
    return { error: e.message };
  }
}

// Pull the page+query breakdown. opts: { days?, startDate?, endDate?, rowLimit? }.
// Back-compat: called with no opts it defaults to the last 90 days.
// rowLimit defaults to GSC's max (25000): the low-traffic INTL page+query rows sit
// in the long tail of a busy property, so a small cap silently clips them.
async function fetchGscPageQuery(siteUrl, token, opts = {}) {
  const { rowLimit = 25000 } = opts;
  const { data, error } = await runGscQuery(siteUrl, token, ['page', 'query'], opts, rowLimit);
  if (error) return { rows: [], error };
  const rows = (data.rows || []).map(r => ({
    page:        r.keys[0],
    keyword:     r.keys[1],
    position:    Math.round(r.position * 10) / 10,
    impressions: r.impressions,
    clicks:      r.clicks,
  }));
  return { rows };
}

// Pull the page-only breakdown — the ACCURATE per-page total (no anonymized-query
// drop). Use this for Totals; split branded/non-branded from fetchGscPageQuery.
async function fetchGscPageOnly(siteUrl, token, opts = {}) {
  const { rowLimit = 25000 } = opts;
  const { data, error } = await runGscQuery(siteUrl, token, ['page'], opts, rowLimit);
  if (error) return { rows: [], error };
  const rows = (data.rows || []).map(r => ({
    page:        r.keys[0],
    position:    Math.round(r.position * 10) / 10,
    impressions: r.impressions,
    clicks:      r.clicks,
  }));
  return { rows };
}

module.exports = { getGscAccessToken, fetchGscPageQuery, fetchGscPageOnly };
