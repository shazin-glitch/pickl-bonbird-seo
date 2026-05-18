// netlify/functions/competitor-matrix.js
// READ-ONLY cache endpoint — always returns cached data, never calls DataForSEO.
// All DataForSEO fetches are handled by competitor-matrix-background.js
// which runs on a schedule (Monday 4am UTC) and has a 26s timeout.
//
// GET  ?brand=pickl|bonbird|all          — returns cached matrix data
//
// Cache TTL: 7 days (written by competitor-matrix-background)
// Blob keys: competitorMatrix:pickl / competitorMatrix:bonbird

const { getStore } = require("@netlify/blobs");

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_KEY_PREFIX = "competitorMatrix:";

// ─── Brand config — strictly separated, never mixed ───────────────────────────
const BRAND_CONFIG = {
  pickl: {
    siteUrl: "https://eatpickl.com/",
    competitors: [
      { name: "Salt",        domain: "saltuae.com"   },
      { name: "High Joint",  domain: "highjoint.co"  },
      { name: "Shake Shack", domain: "shakeshack.com" },
      { name: "Five Guys",   domain: "fiveguys.ae"   },
    ],
    targetKeywords: [
      "smash burger dubai",
      "best burgers near me dubai",
      "halal fried chicken uae",
      "burger delivery dubai marina",
      "chicken sandwich dubai",
      "best chicken sandwich uae",
      "smash burger abu dhabi",
      "burgers jbr dubai",
      "burger restaurant city walk dubai",
      "best fast food dubai",
    ],
    location_code: 21191, // UAE
    language_code: "en",
  },

  bonbird: {
    siteUrl: "https://bonbirdchicken.com/",
    competitors: [
      { name: "Salt",        domain: "saltuae.com"   },
      { name: "High Joint",  domain: "highjoint.co"  },
      { name: "Shake Shack", domain: "shakeshack.com" },
      { name: "Five Guys",   domain: "fiveguys.ae"   },
    ],
    // Keywords reflect actual Bonbird menu: bone-in, tenders, sandwiches, wraps, rice bowls
    // International markets: Oman, Pakistan, Qatar (NOT Jordan/Egypt/Saudi — those are Pickl)
    targetKeywords: [
      "fried chicken dubai",
      "best fried chicken uae",
      "crispy fried chicken dubai",
      "chicken tenders dubai",
      "bone in fried chicken dubai",
      "chicken sandwich dubai",
      "fried chicken delivery dubai",
      "halal fried chicken restaurant dubai",
      "korean chicken burger dubai",
      "chicken rice bowl dubai",
    ],
    location_code: 21191, // UAE
    language_code: "en",
  },
};

// ─── Main handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  const store = getStore({
    name:   "seo-tool",
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  try {
    // ── GET: return cached data only — never triggers a live DataForSEO fetch ──
    // All writes are handled by competitor-matrix-background.js
    if (event.httpMethod === "GET") {
      const brandParam = event.queryStringParameters?.brand || "all";
      const brands     = brandParam === "all" ? ["pickl", "bonbird"] : [brandParam];

      const result = {};

      for (const brand of brands) {
        const cacheKey = `${CACHE_KEY_PREFIX}${brand}`;
        let cached = null;

        try {
          cached = await store.get(cacheKey, { type: "json" });
        } catch {
          // key doesn't exist yet — background function hasn't run yet
        }

        result[brand] = cached || null;
      }

      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };

  } catch (err) {
    console.error("[competitor-matrix] Error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
