// netlify/functions/llm-mentions-background.js
// Weekly automated LLM brand mention tracker.
// Queries Claude, OpenAI GPT, Perplexity, and Google Gemini.
//
// Schedule: Monday 4:00am UTC
// Required env vars: ANTHROPIC_API_KEY (exists) · OPENAI_API_KEY · PERPLEXITY_API_KEY · GEMINI_API_KEY
//
// IMPORTANT: Adding env vars in Netlify dashboard requires a new DEPLOY to take effect.
// Trigger: Netlify dashboard → Deploys → Trigger deploy → Deploy site

const { getStore } = require("@netlify/blobs");
const { authorizeJob } = require("./_lib/auth");

const QUERIES = {
  pickl: [
    "What are the best burger restaurants in Dubai?",
    "Where can I get the best smash burger in Dubai?",
    "Best chicken burger in Dubai recommendation",
    "Top halal burger restaurants in Dubai",
    "Best fast food restaurants in Dubai for burgers",
    "Where to eat burgers in Abu Dhabi?",
  ],
  bonbird: [
    "What are the best fried chicken restaurants in Dubai?",
    "Where can I get crispy fried chicken in Dubai?",
    "Best chicken restaurant in Dubai recommendation",
    "Top halal fried chicken in Dubai",
    "Best fast food chicken in Dubai",
    "Nashville hot chicken Dubai — where to go?",
  ],
};

const BRAND_TERMS = {
  pickl:   ["pickl", "pick'l"],
  bonbird: ["bonbird", "bon bird"],
};

// ── Query helpers — return { text, error } ────────────────────────────────────
// text: response string on success, null on failure
// error: null on success, human-readable reason on failure

async function queryAnthropic(query) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { text: null, error: "key_missing" };
  try {
    const res  = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 400, messages: [{ role: "user", content: query }] }),
    });
    const data = await res.json();
    if (data.error) return { text: null, error: `api_error: ${data.error.message}` };
    return { text: data.content?.[0]?.text || null, error: null };
  } catch (e) { return { text: null, error: `network_error: ${e.message}` }; }
}

async function queryOpenAI(query) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { text: null, error: "key_missing" };
  // Try gpt-4o first, fall back to gpt-4o-mini
  for (const model of ["gpt-4o", "gpt-4o-mini"]) {
    try {
      const res  = await fetch("https://api.openai.com/v1/chat/completions", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ model, max_tokens: 400, messages: [{ role: "user", content: query }] }),
      });
      const data = await res.json();
      if (data.error) {
        console.warn(`[llm-mentions] OpenAI ${model} error: ${data.error.message}`);
        // If it's a model error, try the next model; if auth error, bail
        if (data.error.code === "invalid_api_key" || data.error.type === "invalid_request_error") {
          return { text: null, error: `api_error: ${data.error.message}` };
        }
        continue; // try next model
      }
      const text = data.choices?.[0]?.message?.content;
      if (text) return { text, error: null };
    } catch (e) {
      console.warn(`[llm-mentions] OpenAI ${model} network error: ${e.message}`);
    }
  }
  return { text: null, error: "api_error: all models failed" };
}

async function queryPerplexity(query) {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return { text: null, error: "key_missing" };
  // Try current models in order of preference. The old llama-3.1-sonar-*/-online
  // model IDs are deprecated by Perplexity and return model-not-found, which made
  // every call fall through to "all models failed" (0% mentions). sonar/sonar-pro
  // are the current online-search models.
  for (const model of ["sonar", "sonar-pro"]) {
    try {
      const res  = await fetch("https://api.perplexity.ai/chat/completions", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ model, max_tokens: 400, messages: [{ role: "user", content: query }] }),
      });
      const data = await res.json();
      if (data.error) {
        console.warn(`[llm-mentions] Perplexity ${model}: ${JSON.stringify(data.error)}`);
        if (data.error.type === "invalid_api_key" || res.status === 401) {
          return { text: null, error: "api_error: invalid key" };
        }
        continue;
      }
      const text = data.choices?.[0]?.message?.content;
      if (text) return { text, error: null };
    } catch (e) {
      console.warn(`[llm-mentions] Perplexity ${model} error: ${e.message}`);
    }
  }
  return { text: null, error: "api_error: all models failed" };
}

async function queryGemini(query) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { text: null, error: "key_missing" };

  // Model list — free tier safe models first, newer ones as bonus
  // gemini-1.5-flash is the most reliable free-tier model
  const models = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.5-pro",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash",
  ];

  for (const model of models) {
    try {
      const res  = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: query }] }],
            generationConfig: { maxOutputTokens: 400 },
          }),
        }
      );

      const data = await res.json();

      // Auth error — bad key, bail immediately
      if (res.status === 400 && data.error?.message?.includes("API key")) {
        return { text: null, error: `api_error: invalid key — ${data.error.message}` };
      }
      if (res.status === 403) {
        return { text: null, error: `api_error: access denied — ${data.error?.message || "check key permissions"}` };
      }

      // Model not found or not available — try next
      if (res.status === 404 || (data.error?.code === 404)) {
        console.log(`[llm-mentions] Gemini ${model}: not available (404), trying next`);
        continue;
      }

      // Rate limit — log and continue (next model may work)
      if (res.status === 429) {
        console.warn(`[llm-mentions] Gemini ${model}: rate limited (429), trying next`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      // Any other API error
      if (data.error) {
        console.warn(`[llm-mentions] Gemini ${model}: ${res.status} — ${data.error.message}`);
        continue;
      }

      // Extract text — handle safety blocks (candidates exist but no content)
      const candidate = data.candidates?.[0];
      if (!candidate) {
        console.warn(`[llm-mentions] Gemini ${model}: no candidates in response`);
        continue;
      }
      if (candidate.finishReason === "SAFETY") {
        console.warn(`[llm-mentions] Gemini ${model}: safety block — returning empty`);
        return { text: "", error: null }; // key works, just blocked this query
      }

      const text = candidate.content?.parts?.[0]?.text;
      if (text) {
        console.log(`[llm-mentions] Gemini: using ${model} ✓`);
        return { text, error: null };
      }

      console.warn(`[llm-mentions] Gemini ${model}: empty text in response, raw:`, JSON.stringify(data).slice(0, 200));

    } catch (e) {
      console.warn(`[llm-mentions] Gemini ${model} network error: ${e.message}`);
    }
  }

  return { text: null, error: "api_error: no working model found — check Netlify logs for per-model details" };
}

// ── Check brand mention ───────────────────────────────────────────────────────
function checkMention(response, brandTerms) {
  if (!response) return { mentioned: false, context: null };
  const lower = response.toLowerCase();
  for (const term of brandTerms) {
    const idx = lower.indexOf(term);
    if (idx !== -1) {
      const start   = Math.max(0, idx - 30);
      const end     = Math.min(response.length, idx + term.length + 90);
      const context = "…" + response.slice(start, end).trim() + "…";
      return { mentioned: true, context };
    }
  }
  return { mentioned: false, context: null };
}

// ── Process one brand ─────────────────────────────────────────────────────────
async function processBrand(brand, store) {
  const queries    = QUERIES[brand];
  const brandTerms = BRAND_TERMS[brand];

  // Log which keys are present upfront — shows in Netlify function logs
  const keyStatus = {
    claude:     !!process.env.ANTHROPIC_API_KEY,
    openai:     !!process.env.OPENAI_API_KEY,
    perplexity: !!process.env.PERPLEXITY_API_KEY,
    gemini:     !!process.env.GEMINI_API_KEY,
  };
  console.log(`[llm-mentions] ${brand} — key status:`, JSON.stringify(keyStatus));

  const llms = [
    { name: "claude",     fn: queryAnthropic },
    { name: "openai",     fn: queryOpenAI    },
    { name: "perplexity", fn: queryPerplexity },
    { name: "gemini",     fn: queryGemini    },
  ];

  const results    = [];
  const llmErrors  = {}; // track first error per LLM
  let totalQueries = 0;

  for (const query of queries) {
    for (const llm of llms) {
      totalQueries++;
      const { text, error } = await llm.fn(query);
      const { mentioned, context } = checkMention(text, brandTerms);

      // Track first error per LLM for the summary
      if (error && !llmErrors[llm.name]) llmErrors[llm.name] = error;

      results.push({
        query,
        llm:       llm.name,
        mentioned,
        context,
        available: text !== null,
        error:     error || null,
      });

      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Build summary — now includes errorReason so UI can show useful message
  const summary = {};
  for (const llm of llms) {
    const llmResults   = results.filter(r => r.llm === llm.name && r.available);
    const llmMentioned = llmResults.filter(r => r.mentioned).length;
    summary[llm.name] = {
      mentioned:   llmMentioned,
      total:       llmResults.length,
      pct:         llmResults.length > 0 ? Math.round((llmMentioned / llmResults.length) * 100) : 0,
      available:   llmResults.length > 0,
      keySet:      keyStatus[llm.name],
      errorReason: llmErrors[llm.name] || null,
    };
  }

  console.log(`[llm-mentions] ${brand} summary:`, JSON.stringify(summary));

  const todayStr = new Date().toISOString().split("T")[0];
  const payload  = { brand, date: todayStr, results, summary, totalQueries };

  await store.set(`llmMentions:${brand}:${todayStr}`, JSON.stringify(payload)).catch(() => {});

  let history = [];
  try { history = await store.get(`llmMentionsHistory:${brand}`, { type: "json" }) || []; } catch {}
  history.push({ date: todayStr, summary });
  if (history.length > 12) history = history.slice(-12);
  await store.set(`llmMentionsHistory:${brand}`, JSON.stringify(history)).catch(() => {});

  return { brand, date: todayStr, summary, totalQueries };
}

exports.handler = async (event) => {
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not authenticated' }) };
  console.log(`[llm-mentions] Starting — ${new Date().toISOString()}`);
  const store = getStore({ name: "seo-tool", siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
  const results = {};
  for (const brand of ["pickl", "bonbird"]) {
    try { results[brand] = await processBrand(brand, store); }
    catch (err) { console.error(`[llm-mentions] ${brand} failed:`, err.message); results[brand] = { error: err.message }; }
  }
  console.log("[llm-mentions] Complete.");
  return { statusCode: 200, body: JSON.stringify({ results, completedAt: new Date().toISOString() }) };
};
