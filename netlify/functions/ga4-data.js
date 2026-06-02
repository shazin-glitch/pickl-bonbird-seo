// netlify/functions/ga4-data.js
// Google Analytics 4 Data API integration.
//
// Requires:
//   - GA4 OAuth tokens stored in Blobs as 'ga4Tokens'
//   - GA4 Property IDs in env: GA4_PROPERTY_ID_PICKL, GA4_PROPERTY_ID_BONBIRD
//   - GA4 tracking installed on both WordPress sites (developer prerequisite)
//
// GET /api/ga4-data?brand=pickl|bonbird     — sessions by month + market breakdown
// POST /api/ga4-data { action: 'disconnect' } — remove tokens

const { getStore } = require("@netlify/blobs");

const GA4_API_BASE = "https://analyticsdata.googleapis.com/v1beta/properties";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

// Market URL path prefixes
const MARKET_PATHS = {
  pickl: {
    "UAE":    ["/", ""],
    "Bahrain": ["/bh/"],
    "KSA":    ["/ksa/"],
    "Qatar":  ["/qatar/"],
    "Egypt":  ["/egypt/"],
    "Jordan": ["/pickl-jordan/"],
    "Oman":   ["/oman/"],
  },
  bonbird: {
    "UAE":      ["/", ""],
    "Oman":     ["/oman/"],
    "Pakistan": ["/pakistan/"],
    "Qatar":    ["/qatar/"],
  },
};

async function refreshTokenIfNeeded(tokens, store) {
  if (!tokens.refresh_token) return tokens.access_token;
  if (!tokens.expires_at || Date.now() < tokens.expires_at - 60000) return tokens.access_token;

  const res  = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type:    "refresh_token",
    }),
  });
  const data = await res.json();
  if (data.access_token) {
    const updated = { ...tokens, access_token: data.access_token, expires_at: Date.now() + (data.expires_in || 3600) * 1000 };
    await store.set("ga4Tokens", JSON.stringify(updated)).catch(() => {});
    return data.access_token;
  }
  return tokens.access_token;
}

async function runReport(propertyId, accessToken, reportBody) {
  const res = await fetch(`${GA4_API_BASE}/${propertyId}:runReport`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
    body: JSON.stringify(reportBody),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "GA4 API error");
  return data;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  const store = getStore({
    name:   "seo-tool",
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  // POST — disconnect action
  if (event.httpMethod === "POST") {
    try {
      const body = JSON.parse(event.body || "{}");
      if (body.action === "disconnect") {
        await store.delete("ga4Tokens").catch(() => {});
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ disconnected: true }) };
      }
    } catch {}
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Unknown action" }) };
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const brand = event.queryStringParameters?.brand || "pickl";

  // Check tokens
  let tokens;
  try { tokens = await store.get("ga4Tokens", { type: "json" }); } catch { tokens = null; }
  if (!tokens?.access_token) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ notConnected: true }) };
  }

  // Check property ID
  const propKey  = `GA4_PROPERTY_ID_${brand.toUpperCase()}`;
  const propId   = process.env[propKey];
  if (!propId) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ noPropertyId: true, envVar: propKey }) };
  }

  // Check cache
  const cacheKey = `ga4Cache:${brand}`;
  try {
    const cached = await store.get(cacheKey, { type: "json" });
    if (cached?.cachedAt && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify(cached) };
    }
  } catch {}

  try {
    const accessToken = await refreshTokenIfNeeded(tokens, store);
    const markets     = MARKET_PATHS[brand] || MARKET_PATHS.pickl;

    // ── Report 1: Monthly sessions (last 13 months, all organic) ─────────────
    const endDate   = new Date().toISOString().split("T")[0];
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 13);
    const startStr  = startDate.toISOString().split("T")[0];

    const monthlyReport = await runReport(propId, accessToken, {
      dateRanges: [{ startDate: startStr, endDate }],
      dimensions: [{ name: "yearMonth" }],
      metrics:    [{ name: "sessions" }, { name: "totalUsers" }],
      dimensionFilter: {
        filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Organic Search", matchType: "EXACT" } },
      },
      orderBys: [{ dimension: { dimensionName: "yearMonth" }, desc: false }],
    });

    // ── Report 2: Sessions by country (last 90 days) ──────────────────────────
    const ninetyDays = new Date();
    ninetyDays.setDate(ninetyDays.getDate() - 90);

    const countryReport = await runReport(propId, accessToken, {
      dateRanges: [{ startDate: ninetyDays.toISOString().split("T")[0], endDate }],
      dimensions: [{ name: "country" }, { name: "sessionDefaultChannelGroup" }],
      metrics:    [{ name: "sessions" }],
      limit: 50,
    });

    // ── Report 3: LLM referral traffic (last 90 days) ─────────────────────────
    const llmDomains = ["perplexity.ai","chatgpt.com","claude.ai","gemini.google.com","copilot.microsoft.com","bing.com"];
    const llmReport  = await runReport(propId, accessToken, {
      dateRanges: [{ startDate: ninetyDays.toISOString().split("T")[0], endDate }],
      dimensions: [{ name: "sessionSource" }, { name: "yearMonth" }],
      metrics:    [{ name: "sessions" }],
      dimensionFilter: {
        orGroup: { expressions: llmDomains.map(d => ({
          filter: { fieldName: "sessionSource", stringFilter: { value: d, matchType: "CONTAINS" } },
        })) },
      },
      orderBys: [{ dimension: { dimensionName: "yearMonth" } }],
    });

    // ── Parse results ─────────────────────────────────────────────────────────

    // Monthly sessions
    const monthlyData = (monthlyReport.rows || []).map(row => ({
      month:    row.dimensionValues[0].value, // "YYYYMM"
      sessions: parseInt(row.metricValues[0].value) || 0,
      users:    parseInt(row.metricValues[1].value) || 0,
    }));

    // Total 12-month organic sessions
    const totalOrganicSessions = monthlyData.reduce((s, r) => s + r.sessions, 0);

    // Country breakdown (90 days, all channels)
    const countryData = {};
    for (const row of (countryReport.rows || [])) {
      const country = row.dimensionValues[0].value;
      const channel = row.dimensionValues[1].value;
      const sessions = parseInt(row.metricValues[0].value) || 0;
      if (!countryData[country]) countryData[country] = { total: 0, organic: 0 };
      countryData[country].total += sessions;
      if (channel.toLowerCase().includes("organic")) countryData[country].organic += sessions;
    }

    // LLM referral traffic
    const llmMonthly = {};
    const llmTotal   = { sessions: 0 };
    for (const row of (llmReport.rows || [])) {
      const source   = row.dimensionValues[0].value;
      const month    = row.dimensionValues[1].value;
      const sessions = parseInt(row.metricValues[0].value) || 0;
      if (!llmMonthly[month]) llmMonthly[month] = 0;
      llmMonthly[month] += sessions;
      llmTotal.sessions += sessions;
    }

    const result = {
      brand,
      connected:           true,
      propertyId:          propId,
      monthly:             monthlyData,
      totalOrganicSessions,
      countryBreakdown:    countryData,
      llmReferralMonthly:  llmMonthly,
      llmReferralTotal:    llmTotal.sessions,
      marketPaths:         Object.keys(markets),
      cachedAt:            Date.now(),
    };

    await store.set(cacheKey, JSON.stringify(result)).catch(() => {});
    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };

  } catch (err) {
    console.error("[ga4-data] Error:", err.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: err.message, connected: true }) };
  }
};
