// netlify/functions/competitor-matrix.js
// READ-ONLY cache endpoint — returns whatever is in Blob store.
// All DataForSEO fetching is handled by competitor-matrix-background.js
// (background function with 15min timeout, one keyword per request).
//
// GET ?brand=pickl|bonbird|all   — returns cached matrix data
// Blob keys: competitorMatrix:pickl / competitorMatrix:bonbird

const { getStore } = require("@netlify/blobs");

const CACHE_KEY_PREFIX = "competitorMatrix:";

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const store = getStore({
    name:   "seo-tool",
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  try {
    const brandParam = event.queryStringParameters?.brand || "all";
    const brands     = brandParam === "all" ? ["pickl", "bonbird"] : [brandParam];
    const result     = {};

    for (const brand of brands) {
      try {
        const cached = await store.get(`${CACHE_KEY_PREFIX}${brand}`, { type: "json" });
        result[brand] = cached || null;
      } catch {
        result[brand] = null;
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    console.error("[competitor-matrix] Error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
