// netlify/functions/llm-mentions.js
// Read-only endpoint for LLM mention tracking data.
//
// GET /api/llm-mentions?brand=pickl|bonbird  — latest snapshot + history
// POST /api/llm-mentions                     — trigger manual run (calls background)

const { getStore } = require("@netlify/blobs");

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

const { authorize, denied } = require("./_lib/auth");
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  { const _a = await authorize(event); if (!_a.ok) return denied(); }

  const store = getStore({
    name:   "seo-tool",
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  if (event.httpMethod === "GET") {
    const brand  = event.queryStringParameters?.brand || "pickl";
    const brands = brand === "all" ? ["pickl", "bonbird"] : [brand];
    const result = {};

    for (const b of brands) {
      const todayStr = new Date().toISOString().split("T")[0];

      // Try today first, then scan last 7 days for most recent data
      let latest = null;
      for (let daysBack = 0; daysBack < 8; daysBack++) {
        const d = new Date();
        d.setDate(d.getDate() - daysBack);
        const dateStr = d.toISOString().split("T")[0];
        try {
          latest = await store.get(`llmMentions:${b}:${dateStr}`, { type: "json" });
          if (latest) break;
        } catch { /* no data for that day */ }
      }

      let history = [];
      try { history = await store.get(`llmMentionsHistory:${b}`, { type: "json" }) || []; } catch {}

      result[b] = { latest, history };
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };
  }

  return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
};
