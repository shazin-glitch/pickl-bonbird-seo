// netlify/functions/competitor-matrix.js
// READ-ONLY cache endpoint — returns whatever is in Blob store.
//
// GET ?brand=pickl|bonbird|all           — returns matrix + sovHistory + autoDetected
// GET ?type=sov&brand=pickl|bonbird|all  — returns only SoV history for charts

const { getStore } = require("@netlify/blobs");

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "GET") return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };

  const store = getStore({
    name:   "seo-tool",
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  const brandParam = event.queryStringParameters?.brand || "all";
  const brands     = brandParam === "all" ? ["pickl", "bonbird"] : [brandParam];

  try {
    const result = {};
    for (const brand of brands) {
      const [matrix, sovHistory, autoDetected] = await Promise.all([
        store.get(`competitorMatrix:${brand}`, { type: "json" }).catch(() => null),
        store.get(`sovHistory:${brand}`,        { type: "json" }).catch(() => []),
        store.get(`autoDetectedCompetitors:${brand}`, { type: "json" }).catch(() => null),
      ]);
      result[brand] = {
        ...(matrix || {}),
        sovHistory:    Array.isArray(sovHistory) ? sovHistory : [],
        autoDetected:  autoDetected?.domains || [],
      };
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
