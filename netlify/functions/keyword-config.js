// netlify/functions/keyword-config.js
// Manages keyword lists per brand, stored in Netlify Blobs.
// Falls back to hardcoded defaults if no blob config exists yet.
//
// GET  ?brand=pickl|bonbird|all   — returns keyword config
// POST { brand, keywords[] }      — overwrites keyword list for brand

const { getStore } = require("@netlify/blobs");

const CONFIG_KEY_PREFIX = "keywordConfig:";

const DEFAULT_KEYWORDS = {
  pickl: [
    // Product
    "hot dog", "french fries", "cheese burger", "hot dog sandwich", "chicken tender",
    "chicken sando", "chocolate shake", "hot dog dubai", "spicy fries", "strawberry shake",
    "chocolate milk shake", "plant based burger", "beef hot dog", "double cheese burger",
    "messy fries", "fries dubai", "spicy french fries", "parmesan fries", "vanilla shake",
    "crispy chicken tender", "cheese slice burger", "buffalo chicken sando",
    "american cheese burger", "hot dog in dubai", "caramel shake", "crispy chicken sando",
    "plant based burger dubai", "bbq cheese burger", "cheese melt burger",
    "messy fries near me", "ice cream sando", "bacon cheese burger", "melt burger dubai",
    // Long tail
    "smash burger dubai", "smash burger abu dhabi", "best burger in dubai",
    "best burger in abu dhabi", "best burger in sharjah", "best burger abu dhabi",
    "best burger in uae", "best burger in the world", "best burgers near me dubai",
    "best fries in dubai", "best chicken burger in dubai", "best fast food dubai",
    "burger restaurant near me", "burger places near me", "burger shop near me",
    "burger delivery dubai marina", "burger restaurant city walk dubai", "burgers jbr dubai",
    "loaded fries near me", "hot dog near me", "best hot dog in dubai",
    "chicken sandwich dubai", "plant based burger restaurants near me",
    // Franchise
    "franchise business", "franchise in uae", "franchise dubai", "franchise in dubai",
    "franchise business in dubai", "franchise opportunities dubai", "franchise business in uae",
    "restaurant franchise", "restaurant franchise opportunities", "restaurant franchise in dubai",
    "how to franchise a restaurant", "fast food franchise in dubai", "fast food franchise",
  ],
  bonbird: [
    // Product
    "crispy chicken", "broasted chicken", "fried chicken", "chicken strips", "chicken tenders",
    "chicken fingers", "chicken tender", "tender chicken", "strips chicken", "chicken strip",
    "chicken finger", "chicken wrap", "chicken tortilla wrap", "crispy chicken wrap",
    "buffalo chicken wrap", "tortilla wraps", "rice bowl", "chicken rice bowl",
    "chicken burger", "cheese burger", "crispy chicken burger", "breaded chicken burger",
    "fried chicken burger", "crunchy chicken burger", "crispy chicken menu",
    "crispy chicken dubai menu",
    // Long tail
    "best chicken abu dhabi", "best fried chicken in dubai", "best burger in dubai",
    "burger near me", "best burger in abu dhabi", "best burger dubai",
    "burger restaurant near me", "burger places near me", "best burger in sharjah",
    "burger shop near me", "best burger near me", "burger restaurant dubai",
    "best chicken burger dubai", "crispy chicken abu dhabi", "crispy chicken near me",
    "broasted chicken near me", "fried chicken near me", "crispy chicken dubai",
    "crispy chicken mussafah", "best chicken near me", "fried chicken dubai",
    "crispy chicken uae", "broasted chicken sharjah", "fried chicken abu dhabi",
    "best burger restaurants in dubai", "fried chicken delivery dubai",
    "korean chicken burger dubai",
    "chicken rice bowl dubai",
    // Franchise
    "franchise business", "franchise in uae", "franchise dubai", "franchise in dubai",
    "franchise business in dubai", "franchise opportunities dubai", "franchise business in uae",
    "restaurant franchise", "restaurant franchise in dubai", "fast food franchise in dubai",
    "fast food franchise", "fried chicken franchise",
  ],
};

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
    // ── GET: return keyword config ───────────────────────────────────────────
    if (event.httpMethod === "GET") {
      const brandParam = event.queryStringParameters?.brand || "all";
      const brands     = brandParam === "all" ? ["pickl", "bonbird"] : [brandParam];
      const result     = {};

      for (const brand of brands) {
        let keywords = null;
        try {
          const stored = await store.get(`${CONFIG_KEY_PREFIX}${brand}`, { type: "json" });
          keywords = stored?.keywords || null;
        } catch {
          // not saved yet — use defaults
        }
        result[brand] = { keywords: keywords || DEFAULT_KEYWORDS[brand] };
      }

      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    // ── POST: save keyword list for a brand ──────────────────────────────────
    if (event.httpMethod === "POST") {
      const body    = JSON.parse(event.body || "{}");
      const brand   = body.brand;
      const keywords = body.keywords;

      if (!brand || !DEFAULT_KEYWORDS[brand]) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid brand" }) };
      }
      if (!Array.isArray(keywords)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "keywords must be an array" }) };
      }

      // Normalise: lowercase, trim, dedupe, remove empties
      const cleaned = [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))];
      await store.set(`${CONFIG_KEY_PREFIX}${brand}`, JSON.stringify({ brand, keywords: cleaned, updatedAt: new Date().toISOString() }));

      return { statusCode: 200, headers, body: JSON.stringify({ brand, keywords: cleaned, count: cleaned.length }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  } catch (err) {
    console.error("[keyword-config] Error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
