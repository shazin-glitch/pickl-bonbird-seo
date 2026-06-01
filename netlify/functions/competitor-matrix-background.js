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

const CACHE_KEY_PREFIX      = "competitorMatrix:";
const COMPETITOR_KEY_PREFIX = "competitorConfig:";
const KEYWORD_KEY_PREFIX    = "keywordConfig:";

const DEFAULT_COMPETITORS = {
  pickl: [
    { name: "Salt",        domain: "saltuae.com"    },
    { name: "High Joint",  domain: "highjoint.co"   },
    { name: "Shake Shack", domain: "shakeshack.com" },
    { name: "Five Guys",   domain: "fiveguys.ae"    },
  ],
  bonbird: [
    { name: "Raising Cane's",     domain: "raisingcanes.com"      },
    { name: "Jailbird",           domain: "jailbirddubai.com"     },
    { name: "Dave's Hot Chicken", domain: "daveshotchicken.com"   },
    { name: "Toit",               domain: "toitchicken.com"       },
    { name: "Nash Hot Chicken",   domain: "nashhotchicken.com"    },
    { name: "Peppers",            domain: "peppersuae.com"        },
    { name: "Jollibee",           domain: "jollibee.com.ph"       },
    { name: "KFC",                domain: "kfc.com"               },
    { name: "Popeyes",            domain: "popeyes.com"           },
  ],
};

const DEFAULT_KEYWORDS = {
  pickl: [
    "hot dog", "french fries", "cheese burger", "hot dog sandwich", "chicken tender",
    "chicken sando", "chocolate shake", "hot dog dubai", "spicy fries", "strawberry shake",
    "chocolate milk shake", "plant based burger", "beef hot dog", "double cheese burger",
    "messy fries", "fries dubai", "spicy french fries", "parmesan fries", "vanilla shake",
    "crispy chicken tender", "cheese slice burger", "buffalo chicken sando",
    "american cheese burger", "hot dog in dubai", "caramel shake", "crispy chicken sando",
    "plant based burger dubai", "bbq cheese burger", "cheese melt burger",
    "messy fries near me", "ice cream sando", "bacon cheese burger", "melt burger dubai",
    "smash burger dubai", "smash burger abu dhabi", "best burger in dubai",
    "best burger in abu dhabi", "best burger in sharjah", "best burger abu dhabi",
    "best burger in uae", "best burgers near me dubai", "best fries in dubai",
    "best chicken burger in dubai", "best fast food dubai", "burger restaurant near me",
    "burger places near me", "burger shop near me", "burger delivery dubai marina",
    "burger restaurant city walk dubai", "burgers jbr dubai", "loaded fries near me",
    "hot dog near me", "best hot dog in dubai", "chicken sandwich dubai",
    "franchise business", "franchise in uae", "franchise dubai", "franchise in dubai",
    "franchise business in dubai", "franchise opportunities dubai", "franchise business in uae",
    "restaurant franchise", "restaurant franchise opportunities", "restaurant franchise in dubai",
    "how to franchise a restaurant", "fast food franchise in dubai", "fast food franchise",
  ],
  bonbird: [
    "crispy chicken", "broasted chicken", "fried chicken", "chicken strips", "chicken tenders",
    "chicken fingers", "chicken tender", "tender chicken", "strips chicken", "chicken strip",
    "chicken finger", "chicken wrap", "chicken tortilla wrap", "crispy chicken wrap",
    "buffalo chicken wrap", "tortilla wraps", "rice bowl", "chicken rice bowl",
    "chicken burger", "crispy chicken burger", "breaded chicken burger",
    "fried chicken burger", "crunchy chicken burger", "crispy chicken menu",
    "crispy chicken dubai menu", "best chicken abu dhabi", "best fried chicken in dubai",
    "best burger in dubai", "burger near me", "best burger in abu dhabi",
    "burger restaurant near me", "best chicken burger dubai", "crispy chicken abu dhabi",
    "crispy chicken near me", "broasted chicken near me", "fried chicken near me",
    "crispy chicken dubai", "best chicken near me", "fried chicken dubai",
    "crispy chicken uae", "broasted chicken sharjah", "fried chicken abu dhabi",
    "fried chicken delivery dubai", "korean chicken burger dubai", "chicken rice bowl dubai",
    "franchise business", "franchise in uae", "franchise dubai", "franchise in dubai",
    "franchise business in dubai", "franchise opportunities dubai",
    "restaurant franchise in dubai", "fast food franchise in dubai", "fried chicken franchise",
  ],
};

const BRAND_SITE = {
  pickl:   "https://eatpickl.com/",
  bonbird: "https://bonbirdchicken.com/",
};

// Load competitors and keywords from Blobs, fall back to defaults
async function loadBrandConfig(store, brand) {
  let competitors = DEFAULT_COMPETITORS[brand];
  let keywords    = DEFAULT_KEYWORDS[brand];

  try {
    const storedComp = await store.get(`${COMPETITOR_KEY_PREFIX}${brand}`, { type: "json" });
    if (storedComp?.competitors?.length) competitors = storedComp.competitors;
  } catch { /* use default */ }

  try {
    const storedKw = await store.get(`${KEYWORD_KEY_PREFIX}${brand}`, { type: "json" });
    if (storedKw?.keywords?.length) keywords = storedKw.keywords;
  } catch { /* use default */ }

  return {
    siteUrl:       BRAND_SITE[brand],
    competitors,
    targetKeywords: keywords,
    location_code:  21191,
    language_code:  "en",
  };
}

// ─── DataForSEO Standard mode — batch task_post → poll task_get ──────────────
// Standard mode: $0.0006/keyword vs Live $0.002/keyword — 3x cheaper
// Batches up to 100 keywords per POST, polls until all tasks complete.
// No per-keyword timeouts — DataForSEO handles queuing server-side.

const DATAFORSEO_POST_URL    = "https://api.dataforseo.com/v3/serp/google/organic/task_post";
const DATAFORSEO_GET_URL     = "https://api.dataforseo.com/v3/serp/google/organic/task_get/advanced";
const BATCH_SIZE             = 100;   // max tasks per POST call
const POLL_INTERVAL_MS       = 5000;  // check task status every 5 seconds
const POLL_MAX_ATTEMPTS      = 120;   // up to 10 minutes of polling
const TASK_TAG_PREFIX        = "yolkseo_"; // helps identify our tasks

async function fetchSerpRankings(brand, config) {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error("DataForSEO credentials missing");

  const authHeader = "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
  const keywords   = config.targetKeywords;
  const ourDomain  = new URL(config.siteUrl).hostname.replace(/^www\./, "");

  console.log(`[competitor-matrix-background] ${brand} — posting ${keywords.length} keywords in Standard mode`);

  // ── Step 1: POST all keywords in batches ──────────────────────────────────
  const taskIds = [];

  for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
    const batch = keywords.slice(i, i + BATCH_SIZE);

    const tasks = batch.map(kw => ({
      keyword:       kw,
      location_code: config.location_code,
      language_code: config.language_code,
      device:        "desktop",
      os:            "windows",
      depth:         100,
      tag:           `${TASK_TAG_PREFIX}${brand}`,
    }));

    const res = await fetch(DATAFORSEO_POST_URL, {
      method:  "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body:    JSON.stringify(tasks),
    });

    if (!res.ok) throw new Error(`task_post HTTP ${res.status}`);

    const data = await res.json();
    if (data.status_code !== 20000) {
      throw new Error(`task_post API error ${data.status_code}: ${data.status_message}`);
    }

    for (const task of data.tasks || []) {
      if (task.id) {
        taskIds.push(task.id);
      } else {
        console.warn(`[competitor-matrix-background] ${brand} — task without ID: ${JSON.stringify(task).slice(0, 100)}`);
      }
    }

    console.log(`[competitor-matrix-background] ${brand} — batch ${Math.floor(i / BATCH_SIZE) + 1} posted, ${taskIds.length} tasks queued so far`);
  }

  console.log(`[competitor-matrix-background] ${brand} — all ${taskIds.length} tasks posted, polling for results…`);

  // ── Step 2: Poll until all tasks complete ─────────────────────────────────
  const results    = {}; // taskId → result items
  let   pending    = new Set(taskIds);
  let   attempts   = 0;

  while (pending.size > 0 && attempts < POLL_MAX_ATTEMPTS) {
    attempts++;
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    // Check pending tasks in batches of 50
    const toCheck = [...pending].slice(0, 50);

    for (const taskId of toCheck) {
      try {
        const res = await fetch(`${DATAFORSEO_GET_URL}/${taskId}`, {
          headers: { Authorization: authHeader },
        });

        if (!res.ok) continue;

        const data = await res.json();
        if (data.status_code !== 20000) continue;

        for (const task of data.tasks || []) {
          if (task.status_code === 20000 && task.result) {
            results[taskId] = {
              keyword:     task.data?.keyword || "",
              items:       task.result?.[0]?.items || [],
              keywordInfo: task.result?.[0]?.keyword_info || null, // CPC, search volume from DataForSEO
            };
            pending.delete(taskId);
          } else if (task.status_code === 40501 || task.status_code === 40601) {
            // Task failed permanently — skip it
            console.warn(`[competitor-matrix-background] ${brand} — task ${taskId} failed: ${task.status_message}`);
            pending.delete(taskId);
          }
          // status 20100 = task in queue — keep polling
        }
      } catch (e) {
        console.warn(`[competitor-matrix-background] ${brand} — poll error for ${taskId}: ${e.message}`);
      }
    }

    if (attempts % 6 === 0) { // log every 30s
      console.log(`[competitor-matrix-background] ${brand} — polling… ${pending.size} tasks remaining (attempt ${attempts})`);
    }
  }

  if (pending.size > 0) {
    console.warn(`[competitor-matrix-background] ${brand} — ${pending.size} tasks still pending after max polls, proceeding with partial results`);
  }

  console.log(`[competitor-matrix-background] ${brand} — got results for ${Object.keys(results).length}/${taskIds.length} tasks`);

  // ── Step 3: Parse results into rows ──────────────────────────────────────
  const rows = [];

  for (const { keyword, items, keywordInfo } of Object.values(results)) {
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
      cpc_usd:      keywordInfo?.cpc      ?? null, // real Google Ads CPC (USD) from DataForSEO SERP result
      searchVolume: keywordInfo?.search_volume ?? null,
      fetchedAt: new Date().toISOString(),
    });
  }

  return rows;
}

// ─── Load keywords — blob config first, hardcoded fallback ───────────────────

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

  // Process both brands in parallel — halves total runtime from ~18min to ~9min
  async function processBrand(brand) {
    try {
      console.log(`[competitor-matrix-background] Fetching ${brand}...`);

      let previousRows = [];
      try {
        const prev = await store.get(`${CACHE_KEY_PREFIX}${brand}`, { type: "json" });
        previousRows = prev?.rows || [];
      } catch {
        // no previous data — first run
      }

      const config  = await loadBrandConfig(store, brand);
      const rawRows = await fetchSerpRankings(brand, config);
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

  await Promise.all(["pickl", "bonbird"].map(processBrand));

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
