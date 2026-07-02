// netlify/functions/_lib/gsc.js
// Shared Google Search Console helpers. GSC is our OWN-domain, first-party ranking
// data (Google's own numbers) — more accurate and free vs renting Labs data, and it
// covers every market (unlike DataForSEO Labs, which lacks Qatar/Oman/Pakistan).
//
//   getGscAccessToken(store)              → valid access token (refreshes if expiring) or null
//   fetchGscPageQuery(site, token, ...)   → [{ page, keyword, position, impressions, clicks }]
//
// The page+query dimension is the key: it tells us WHICH PAGE each keyword ranks on,
// so keywords can be attributed to the right market by URL (the whole-property
// query-only cache could not — it flooded every intl market with UAE keywords).

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

// Pull the page+query breakdown for a property over the last `days`.
// Returns { rows: [{page, keyword, position, impressions, clicks}], error? }.
// rowLimit defaults to GSC's max (25000): the low-traffic INTL page+query rows sit
// in the long tail of a busy property, so a small cap silently clips them.
async function fetchGscPageQuery(siteUrl, token, days = 90, rowLimit = 25000) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const fmt = d => d.toISOString().split('T')[0];
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ startDate: fmt(start), endDate: fmt(end), dataState: 'final', dimensions: ['page', 'query'], rowLimit }),
    });
    const data = await res.json();
    if (data.error) return { rows: [], error: data.error.message || 'GSC API error' };
    const rows = (data.rows || []).map(r => ({
      page:        r.keys[0],
      keyword:     r.keys[1],
      position:    Math.round(r.position * 10) / 10,
      impressions: r.impressions,
      clicks:      r.clicks,
    }));
    return { rows };
  } catch (e) {
    return { rows: [], error: e.message };
  }
}

module.exports = { getGscAccessToken, fetchGscPageQuery };
