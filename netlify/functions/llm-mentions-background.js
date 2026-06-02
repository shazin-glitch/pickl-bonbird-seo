// netlify/functions/llm-mentions-background.js
// Weekly automated LLM brand mention tracker.
// Queries Claude, OpenAI GPT, Perplexity, and Google Gemini with
// restaurant recommendation queries and records whether Pickl/Bonbird are mentioned.
//
// Schedule: Monday 4:00am UTC (alongside scheduler-background)
// Blobs key: llmMentions:<brand>:<YYYY-MM-DD>
// History: llmMentionsHistory:<brand> (rolling 12 weeks)
//
// Required env vars:
//   ANTHROPIC_API_KEY  — already exists
//   OPENAI_API_KEY     — new
//   PERPLEXITY_API_KEY — new
//   GEMINI_API_KEY     — new (Google AI Studio)

const { getStore } = require("@netlify/blobs");

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

// ── Query each LLM ────────────────────────────────────────────────────────────
async function queryAnthropic(query) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res  = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model:      "claude-sonnet-4-6",
        max_tokens: 400,
        messages:   [{ role: "user", content: query }],
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text || null;
  } catch (e) { console.warn("[llm-mentions] Anthropic error:", e.message); return null; }
}

async function queryOpenAI(query) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res  = await fetch("https://api.openai.com/v1/chat/completions", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model:      "gpt-4o",
        max_tokens: 400,
        messages:   [{ role: "user", content: query }],
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (e) { console.warn("[llm-mentions] OpenAI error:", e.message); return null; }
}

async function queryPerplexity(query) {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return null;
  try {
    const res  = await fetch("https://api.perplexity.ai/chat/completions", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model:    "llama-3.1-sonar-small-128k-online",
        messages: [{ role: "user", content: query }],
        max_tokens: 400,
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (e) { console.warn("[llm-mentions] Perplexity error:", e.message); return null; }
}

async function queryGemini(query) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const res  = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: query }] }],
        generationConfig: { maxOutputTokens: 400 },
      }),
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) { console.warn("[llm-mentions] Gemini error:", e.message); return null; }
}

// ── Check if brand is mentioned in response ────────────────────────────────
function checkMention(response, brandTerms) {
  if (!response) return { mentioned: false, context: null };
  const lower = response.toLowerCase();
  for (const term of brandTerms) {
    const idx = lower.indexOf(term);
    if (idx !== -1) {
      // Extract surrounding context (up to 120 chars)
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

  const llms = [
    { name: "claude",     fn: queryAnthropic },
    { name: "openai",     fn: queryOpenAI    },
    { name: "perplexity", fn: queryPerplexity },
    { name: "gemini",     fn: queryGemini    },
  ];

  const results = [];
  let totalQueries = 0;

  for (const query of queries) {
    for (const llm of llms) {
      totalQueries++;
      console.log(`[llm-mentions] ${brand} — ${llm.name} — "${query.slice(0,40)}…"`);
      const response = await llm.fn(query);
      const { mentioned, context } = checkMention(response, brandTerms);
      results.push({
        query,
        llm:      llm.name,
        mentioned,
        context,
        available: response !== null,
      });
      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Build per-LLM summary
  const summary = {};
  for (const llm of llms) {
    const llmResults   = results.filter(r => r.llm === llm.name && r.available);
    const llmMentioned = llmResults.filter(r => r.mentioned).length;
    summary[llm.name] = {
      mentioned: llmMentioned,
      total:     llmResults.length,
      pct:       llmResults.length > 0 ? Math.round((llmMentioned / llmResults.length) * 100) : 0,
      available: llmResults.length > 0,
    };
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const payload  = { brand, date: todayStr, results, summary, totalQueries };

  // Store weekly snapshot
  await store.set(`llmMentions:${brand}:${todayStr}`, JSON.stringify(payload)).catch(() => {});

  // Update rolling history (12 weeks)
  let history = [];
  try { history = await store.get(`llmMentionsHistory:${brand}`, { type: "json" }) || []; } catch {}
  history.push({ date: todayStr, summary });
  if (history.length > 12) history = history.slice(-12);
  await store.set(`llmMentionsHistory:${brand}`, JSON.stringify(history)).catch(() => {});

  return { brand, date: todayStr, summary, totalQueries };
}

// ── Main ───────────────────────────────────────────────────────────────────────
exports.handler = async () => {
  console.log(`[llm-mentions] Starting — ${new Date().toISOString()}`);

  const store = getStore({
    name:   "seo-tool",
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  const results = {};

  for (const brand of ["pickl", "bonbird"]) {
    try {
      results[brand] = await processBrand(brand, store);
    } catch (err) {
      console.error(`[llm-mentions] ${brand} failed:`, err.message);
      results[brand] = { error: err.message };
    }
  }

  console.log("[llm-mentions] Complete.", JSON.stringify(results, null, 2));
  return { statusCode: 200, body: JSON.stringify({ results, completedAt: new Date().toISOString() }) };
};
