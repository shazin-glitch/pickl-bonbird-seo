// netlify/functions/competitor-matrix.js
// READ-ONLY cache endpoint — returns whatever is in Blob store.
//
// GET ?brand=pickl|bonbird|all           — returns matrix + sovHistory + autoDetected
// GET ?type=sov&brand=pickl|bonbird|all  — returns only SoV history for charts
// GET ?discover=1&brand=pickl|bonbird    — live DataForSEO Labs competitors_domain discovery

const { getStore } = require("@netlify/blobs");

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
};

const DATAFORSEO_BASE = "https://api.dataforseo.com/v3";

const BRAND_DOMAINS = {
  pickl:   "eatpickl.com",
  bonbird: "bonbirdchicken.com",
};

// Domains to exclude from discovery — aggregators, social, delivery, directories
const EXCLUDE_DOMAINS = new Set([
  "zomato.com","tripadvisor.com","talabat.com","timeout.com","timeoutdubai.com",
  "whatson.ae","theentertainer.com","deliveroo.ae","noonfood.com","careem.com",
  "google.com","facebook.com","instagram.com","twitter.com","youtube.com","tiktok.com",
  "linkedin.com","yelp.com","foursquare.com","openrice.com","hungerstation.com",
  "noon.com","amazon.ae","wikipedia.org","dubizzle.com","yallarestaurants.com",
  "thenational.ae","gulfnews.com","khaleejtimes.com","visitdubai.com",
]);

function isDomainExcluded(domain) {
  const d = domain.replace(/^www\./, "").toLowerCase();
  return EXCLUDE_DOMAINS.has(d) || Array.from(EXCLUDE_DOMAINS).some(ex => d.endsWith("." + ex));
}

async function discoverCompetitors(brand) {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error("DataForSEO credentials missing");

  const auth   = "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
  const domain = BRAND_DOMAINS[brand];
  if (!domain) throw new Error(`Unknown brand: ${brand}`);

  const res = await fetch(`${DATAFORSEO_BASE}/dataforseo_labs/google/competitors_domain/live`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify([{
      target:        domain,
      location_code: 2784, // UAE country
      language_code: "en",
      limit:         20,
      filters:       [["intersections", ">", 5]], // at least 5 shared keywords
      order_by:      ["intersections,desc"],
    }]),
  });

  const data = await res.json();

  if (data.status_code !== 20000) {
    throw new Error(`DataForSEO error ${data.status_code}: ${data.status_message}`);
  }

  const items = data.tasks?.[0]?.result?.[0]?.items || [];

  return items
    .filter(item => item.domain && !isDomainExcluded(item.domain))
    .map(item => ({
      domain:        item.domain.replace(/^www\./, ""),
      intersections: item.intersections || 0,
      ownCount:      item.own_keywords  || 0,
      compCount:     item.competitor_keywords || 0,
      avgPosition:   item.avg_position  ? Math.round(item.avg_position) : null,
    }))
    .slice(0, 15);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "GET") return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };

  const q = event.queryStringParameters || {};

  // ── Competitor discovery — live DataForSEO call ──────────────────────────────
  if (q.discover === "1") {
    const brand = q.brand || "pickl";
    if (!BRAND_DOMAINS[brand]) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "brand must be pickl or bonbird" }) };
    try {
      const competitors = await discoverCompetitors(brand);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ brand, competitors }) };
    } catch (err) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── Cached matrix data ────────────────────────────────────────────────────────
  const store = getStore({
    name:   "seo-tool",
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  const brandParam = q.brand || "all";
  const brands     = brandParam === "all" ? ["pickl", "bonbird"] : [brandParam];

  try {
    const result = {};
    for (const brand of brands) {
      const [matrix, sovHistory, autoDetected, rankedKeywords] = await Promise.all([
        store.get(`competitorMatrix:${brand}`,            { type: "json" }).catch(() => null),
        store.get(`sovHistory:${brand}`,                  { type: "json" }).catch(() => []),
        store.get(`autoDetectedCompetitors:${brand}`,     { type: "json" }).catch(() => null),
        store.get(`competitorRankedKeywords:${brand}`,    { type: "json" }).catch(() => null),
      ]);
      result[brand] = {
        ...(matrix || {}),
        sovHistory:      Array.isArray(sovHistory) ? sovHistory : [],
        autoDetected:    autoDetected?.domains || [],
        rankedKeywords:  rankedKeywords?.competitors || {},
        labsError:       rankedKeywords?.labsError   || null,
      };
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
