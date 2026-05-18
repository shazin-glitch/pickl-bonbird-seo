// netlify/functions/competitor-matrix-background.js
// Netlify Background Function — weekly SERP refresh for both brands.
//
// Schedule: Monday 4:00am UTC = Monday 8:00am Dubai time (UTC+4)
// Set in netlify.toml:
//   [functions."competitor-matrix-background"]
//     schedule = "0 4 * * 1"
//
// Can also be triggered manually:
//   GET /.netlify/functions/competitor-matrix-background

const { getStore } = require("@netlify/blobs");

const CACHE_KEY_PREFIX = "competitorMatrix:";

const BRAND_CONFIG = {
  pickl: {
    siteUrl: "https://eatpickl.com/",
    competitors: [
      { name: "Salt",        domain: "saltuae.com"    },
      { name: "High Joint",  domain: "highjoint.co"   },
      { name: "Shake Shack", domain: "shakeshack.com" },
      { name: "Five Guys",   domain: "fiveguys.ae"    },
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
    location_code: 21191,
    language_code: "en",
  },

  bonbird: {
    siteUrl: "https://bonbirdchicken.com/",
    competitors: [
      { name: "Salt",        domain: "saltuae.com"    },
      { name: "High Joint",  domain: "highjoint.co"   },
      { name: "Shake Shack", domain: "shakeshack.com" },
      { name: "Five Guys",   domain: "fiveguys.ae"    },
    ],
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
    location_code: 21191,
    language_code: "en",
  },
};

// ─── DataForSEO fetch — one keyword per request (plan limitation) ─────────────
async function fetchSerpRankings(brand, keywords) {
  const config   = BRAND_CONFIG[brand];
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error("DataForSEO credentials missing");

  const authHeader = "Basic " + Buffer.from(`${login}:${password}`).toString("base64");

  const rows = [];

  for (const kw of keywords) {
    const postRes = await fetch(
      "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
      {
        method:  "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify([{
          keyword:       kw,
          location_code: config.location_code,
          language_code: config.language_code,
          device:        "desktop",
          os:            "windows",
          depth:         30,
        }]),
      }
    );

    if (!postRes.ok) {
      throw new Error(`DataForSEO API error ${postRes.status}: ${await postRes.text()}`);
    }

    const data = await postRes.json();
    if (data.status_code !== 20000) {
      throw new Error(`DataForSEO status ${data.status_code}: ${data.status_message}`);
    }

    for (const task of data.tasks || []) {
      if (task.status_code !== 20000) {
        console.warn(`[competitor-matrix-background] Task skipped — keyword: "${task.data?.keyword}" status: ${task.status_code} message: ${task.status_message}`);
        continue;
      }

      const keyword = task.data?.keyword || "";
      const items   = task.result?.[0]?.items || [];
      const ourDomain = new URL(config.siteUrl).hostname.replace(/^www\./, "");

      let ourRank = null;
      for (const item of items) {
        if (item.type !== "organic") continue;
        const itemDomain = (item.domain || "").replace(/^www\./, "");
        if (itemDomain === ourDomain || itemDomain.includes(ourDomain)) {
          ourRank = item.rank_absolute;
          break;
        }
      }

      const competitorRanks = {};
      for (const comp of config.competitors) {
        const compDomain = comp.domain.replace(/^www\./, "");
        competitorRanks[comp.name] = null;
        for (const item of items) {
          if (item.type !== "organic") continue;
          const itemDomain = (item.domain || "").replace(/^www\./, "");
          if (itemDomain === compDomain || itemDomain.includes(compDomain)) {
            competitorRanks[comp.name] = item.rank_absolute;
            break;
          }
        }
      }

      rows.push({
        keyword,
        brand,
        ourRank,
        ourDomain,
        competitorRanks,
        fetchedAt: new Date().toISOString(),
      });
    }
  }

  return rows;
}

// ─── Movement detection vs previous snapshot ──────────────────────────────────
function detectMovement(currentRows, previousRows) {
  if (!previousRows || !previousRows.length) return currentRows;

  const prevMap = {};
  for (const row of previousRows) prevMap[row.keyword] = row.ourRank;

  return currentRows.map((row) => {
    const prev = prevMap[row.keyword];
    let movement = "new";
    let movementDelta = null;

    if (prev !== undefined) {
      if (row.ourRank === null && prev === null) {
        movement = "not_ranking";
      } else if (row.ourRank === null && prev !== null) {
        movement = "dropped_out";
      } else if (row.ourRank !== null && prev === null) {
        movement = "entered";
      } else {
        movementDelta = prev - row.ourRank; // positive = improved (lower rank number)
        movement = movementDelta > 0 ? "up" : movementDelta < 0 ? "down" : "stable";
      }
    }

    return { ...row, movement, movementDelta };
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────
exports.handler = async () => {
  console.log(
    `[competitor-matrix-background] Starting — ${new Date().toISOString()}`,
    "(Monday 4am UTC = 8am Dubai time)"
  );

  const store = getStore({
    name:   "seo-tool",
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  const results = {};
  const errors  = {};

  for (const brand of ["pickl", "bonbird"]) {
    try {
      console.log(`[competitor-matrix-background] Fetching ${brand}...`);

      // Load previous snapshot for movement detection
      let previousRows = [];
      try {
        const prev = await store.get(`${CACHE_KEY_PREFIX}${brand}`, { type: "json" });
        previousRows = prev?.rows || [];
      } catch {
        // no previous data — first run
      }

      const config  = BRAND_CONFIG[brand];
      const rawRows = await fetchSerpRankings(brand, config.targetKeywords);
      const rows    = detectMovement(rawRows, previousRows);

      const payload = {
        brand,
        rows,
        competitors:  config.competitors.map((c) => c.name),
        fetchedAt:    new Date().toISOString(),
        keywordCount: rows.length,
        schedule:     "Monday 04:00 UTC / 08:00 Dubai",
      };

      await store.set(`${CACHE_KEY_PREFIX}${brand}`, JSON.stringify(payload));
      results[brand] = { success: true, keywordCount: rows.length };
      console.log(`[competitor-matrix-background] ${brand} done — ${rows.length} keywords`);

    } catch (err) {
      console.error(`[competitor-matrix-background] ${brand} failed:`, err.message);
      errors[brand] = err.message;
    }
  }

  console.log("[competitor-matrix-background] Complete.", { results, errors });

  return {
    statusCode: 200,
    body: JSON.stringify({
      results,
      errors,
      completedAt: new Date().toISOString(),
    }),
  };
};
