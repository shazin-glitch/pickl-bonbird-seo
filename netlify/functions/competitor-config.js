// netlify/functions/competitor-config.js
// Manages competitor lists per brand, stored in Netlify Blobs.
// Falls back to hardcoded defaults if no blob config exists yet.
//
// GET  ?brand=pickl|bonbird|all          — returns competitor config
// POST { brand, competitors: [{name, domain}] } — overwrites competitor list

const { getStore } = require("@netlify/blobs");

const CONFIG_KEY_PREFIX = "competitorConfig:";

const DEFAULT_COMPETITORS = {
  pickl: [
    { name: "Salt",        domain: "saltuae.com"    },
    { name: "High Joint",  domain: "highjoint.co"   },
    { name: "Shake Shack", domain: "shakeshack.com" },
    { name: "Five Guys",   domain: "fiveguys.ae"    },
  ],
  bonbird: [
    { name: "Raising Cane's", domain: "raisingcanes.com"   },
    { name: "Jailbird",       domain: "jailbirddubai.com"  },
    { name: "Dave's Hot Chicken", domain: "daveshotchicken.com" },
    { name: "Toit",           domain: "toitchicken.com"    },
    { name: "Nash Hot Chicken", domain: "nashhotchicken.com" },
    { name: "Peppers",        domain: "peppersuae.com"     },
    { name: "Jollibee",       domain: "jollibee.com.ph"    },
    { name: "KFC",            domain: "kfc.com"            },
    { name: "Popeyes",        domain: "popeyes.com"        },
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
    // ── GET ──────────────────────────────────────────────────────────────────
    if (event.httpMethod === "GET") {
      const brandParam = event.queryStringParameters?.brand || "all";
      const brands     = brandParam === "all" ? ["pickl", "bonbird"] : [brandParam];
      const result     = {};

      for (const brand of brands) {
        let competitors = null;
        try {
          const stored = await store.get(`${CONFIG_KEY_PREFIX}${brand}`, { type: "json" });
          competitors = stored?.competitors || null;
        } catch {
          // not saved yet — use defaults
        }
        result[brand] = {
          competitors: competitors || DEFAULT_COMPETITORS[brand],
          isDefault:   !competitors,
        };
      }

      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (event.httpMethod === "POST") {
      const body        = JSON.parse(event.body || "{}");
      const brand       = body.brand;
      const competitors = body.competitors;

      if (!brand || !DEFAULT_COMPETITORS[brand]) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid brand" }) };
      }
      if (!Array.isArray(competitors)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "competitors must be an array of {name, domain}" }) };
      }

      // Validate and clean
      const cleaned = competitors
        .map(c => ({
          name:   (c.name   || "").trim(),
          domain: (c.domain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, ""),
        }))
        .filter(c => c.name && c.domain);

      if (cleaned.length === 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "No valid competitors provided" }) };
      }

      await store.set(
        `${CONFIG_KEY_PREFIX}${brand}`,
        JSON.stringify({ brand, competitors: cleaned, updatedAt: new Date().toISOString() })
      );

      return { statusCode: 200, headers, body: JSON.stringify({ brand, competitors: cleaned, count: cleaned.length }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  } catch (err) {
    console.error("[competitor-config] Error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
