// netlify/functions/competitor-config.js
// Manages competitor lists per brand, stored in Netlify Blobs.
// Falls back to hardcoded defaults if no blob config exists yet.
//
// GET  ?brand=pickl|bonbird|all          — returns competitor config
// POST { brand, competitors: [{name, domain}] } — overwrites competitor list

const { getStore } = require("@netlify/blobs");
const { INTERNATIONAL_MARKETS } = require("./_lib/international-config");

const CONFIG_KEY_PREFIX = "competitorConfig:";

// Correct UAE competitor domains (updated June 2026)
const DEFAULT_COMPETITORS = {
  pickl: [
    { name: "Shake Shack",  domain: "shakeshackme.com" },
    { name: "Five Guys",    domain: "fiveguys.ae"      },
  ],
  bonbird: [
    { name: "Raising Cane's",     domain: "raisingcanesme.com"    },
    { name: "Jailbird",           domain: "jailbird.co"           },
    { name: "Dave's Hot Chicken", domain: "daveshotchicken.com"   },
    { name: "Toit",               domain: "toit.vercel.app"       },
    { name: "Jollibee",           domain: "jollibeeuae.com"       },
    { name: "KFC",                domain: "uae.kfc.me"            },
    { name: "Popeyes",            domain: "popeyesuae.com"        },
    { name: "Texas Chicken",      domain: "uae.texaschicken.com"  },
  ],
};

// Domains that are wrong and need to be corrected in stored configs.
// null = remove entirely (no website / inactive), string = replace with this domain.
const DOMAIN_MIGRATIONS = {
  "saltuae.com":        null,
  "highjoint.co":       null,
  "shakeshack.com":     "shakeshackme.com",
  "raisingcanes.com":   "raisingcanesme.com",
  "jailbirddubai.com":  "jailbird.co",
  "toitchicken.com":    "toit.vercel.app",
  "nashhotchicken.com": null,
  "peppersuae.com":     null,
  "jollibee.com.ph":    "jollibeeuae.com",
  "kfc.com":            "uae.kfc.me",
  "popeyes.com":        "popeyesuae.com",
};

// Name corrections for migrated domains
const NAME_CORRECTIONS = {
  "shakeshackme.com":   "Shake Shack",
  "raisingcanesme.com": "Raising Cane's",
  "jailbird.co":        "Jailbird",
  "toit.vercel.app":    "Toit",
  "jollibeeuae.com":    "Jollibee",
  "uae.kfc.me":         "KFC",
  "popeyesuae.com":     "Popeyes",
};

// Migrate a stored competitor list — fix wrong domains, preserve user additions
function migrateCompetitors(stored, brand) {
  let changed = false;
  let result = [];

  for (const c of stored) {
    const newDomain = DOMAIN_MIGRATIONS[c.domain];
    if (newDomain === undefined) {
      // Not in migration map — keep as-is (user addition like Black Tap)
      result.push(c);
    } else if (newDomain === null) {
      // Remove — no website
      changed = true;
    } else {
      // Replace with correct domain
      result.push({ name: NAME_CORRECTIONS[newDomain] || c.name, domain: newDomain });
      changed = true;
    }
  }

  // Add any default competitors that aren't in the stored list at all
  for (const def of DEFAULT_COMPETITORS[brand] || []) {
    if (!result.some(c => c.domain === def.domain)) {
      result.push(def);
      changed = true;
    }
  }

  return { competitors: result, changed };
}

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
      const brandParam  = event.queryStringParameters?.brand  || "all";
      const marketParam = event.queryStringParameters?.market || null;
      const isIntl      = marketParam && marketParam !== "uae";
      const brands      = brandParam === "all" ? ["pickl", "bonbird"] : [brandParam];

      // International markets: per-market manual overrides only. No curated
      // defaults and no domain migration — auto-detection fills the rest at
      // matrix-run time (hybrid). Empty list is valid (= pure auto-detect).
      if (isIntl) {
        const result = {};
        for (const brand of brands) {
          let competitors = [];
          try {
            const stored = await store.get(`${CONFIG_KEY_PREFIX}${brand}:${marketParam}`, { type: "json" });
            if (stored?.competitors?.length) competitors = stored.competitors;
          } catch { /* none yet */ }
          result[brand] = { competitors, isDefault: false, market: marketParam };
        }
        return { statusCode: 200, headers, body: JSON.stringify(result) };
      }

      const result = {};

      for (const brand of brands) {
        let competitors = null;
        let isDefault   = false;
        try {
          const stored = await store.get(`${CONFIG_KEY_PREFIX}${brand}`, { type: "json" });
          if (stored?.competitors?.length) {
            // Auto-migrate any wrong/old domains on the way out
            const { competitors: migrated, changed } = migrateCompetitors(stored.competitors, brand);
            competitors = migrated;
            if (changed) {
              // Silently persist the corrected config so it's right for the next matrix run
              await store.set(`${CONFIG_KEY_PREFIX}${brand}`,
                JSON.stringify({ brand, competitors: migrated, updatedAt: new Date().toISOString() })
              ).catch(() => {});
            }
          } else {
            competitors = DEFAULT_COMPETITORS[brand];
            isDefault   = true;
          }
        } catch {
          competitors = DEFAULT_COMPETITORS[brand];
          isDefault   = true;
        }
        result[brand] = { competitors, isDefault };
      }

      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (event.httpMethod === "POST") {
      const body        = JSON.parse(event.body || "{}");
      const brand       = body.brand;
      const market      = body.market || null;
      const competitors = body.competitors;
      const isIntl      = market && market !== "uae";

      if (!brand || !DEFAULT_COMPETITORS[brand]) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid brand" }) };
      }
      if (isIntl && !INTERNATIONAL_MARKETS[market]) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown market: ${market}` }) };
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

      // UAE requires at least one competitor (it has no auto-detect fallback in
      // the consumer). International allows an empty list = rely purely on
      // auto-detected domains.
      if (!isIntl && cleaned.length === 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "No valid competitors provided" }) };
      }

      const key = isIntl ? `${CONFIG_KEY_PREFIX}${brand}:${market}` : `${CONFIG_KEY_PREFIX}${brand}`;
      await store.set(
        key,
        JSON.stringify({ brand, market: market || "uae", competitors: cleaned, updatedAt: new Date().toISOString() })
      );

      return { statusCode: 200, headers, body: JSON.stringify({ brand, market: market || "uae", competitors: cleaned, count: cleaned.length }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  } catch (err) {
    console.error("[competitor-config] Error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
