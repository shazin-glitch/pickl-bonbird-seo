// netlify/functions/scheduler.js
// Weekly autonomous SEO audit. Runs on a cron OR can be triggered manually
// from the UI. Pulls GSC data, finds opportunities, asks Claude to draft
// fixes, and queues them in the approval system.
//
// Cron is declared in netlify.toml (not inline) to avoid pulling in the
// @netlify/functions dependency. Schedule: weekly on Mondays at 06:00 UTC
// (10:00 Dubai time).
//
// Manual trigger: POST /api/scheduler with body { brand?, dryRun?, jobs?: [...] }
//   brand: 'pickl' | 'bonbird' | omitted (both)
//   dryRun: true to compute findings without queueing
//   jobs: subset of ['quick_wins', 'meta_rewrites', 'content_gaps', 'keyword_research']

const {
  callClaude, extractJson,
  getSetting, setSetting,
  ok, bad, preflight, parseBody
} = require('./_lib/store');

const SITE_URL = process.env.URL || 'https://yolkseo.netlify.app';

const BRANDS = {
  pickl:   { name: 'Pickl',   site: 'eatpickl.com',       gsc: 'sc-domain:eatpickl.com' },
  bonbird: { name: 'Bonbird', site: 'bonbirdchicken.com', gsc: 'sc-domain:bonbirdchicken.com' }
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  // Accept both scheduled invocations and manual POST/GET triggers
  const body = event.httpMethod === 'POST' ? (parseBody(event) || {}) : {};
  const isScheduled = !!event.headers?.['x-scheduled-function']
                   || !!body?.next_run
                   || event.httpMethod === undefined; // some scheduled invocations
  const dryRun = !!body.dryRun && !isScheduled;
  const brandsToRun = body.brand
    ? [body.brand].filter(b => BRANDS[b])
    : Object.keys(BRANDS);
  const jobs = Array.isArray(body.jobs) && body.jobs.length
    ? body.jobs
    : ['quick_wins', 'meta_rewrites', 'content_gaps'];

  const summary = { startedAt: Date.now(), brands: {}, queued: 0, errors: [] };

  for (const brand of brandsToRun) {
    summary.brands[brand] = { jobs: {} };
    try {
      const gscRows = await fetchGscRows(brand);
      summary.brands[brand].gscRows = gscRows.length;

      if (jobs.includes('quick_wins')) {
        const r = await runQuickWins(brand, gscRows, dryRun);
        summary.brands[brand].jobs.quick_wins = r;
        summary.queued += r.queued || 0;
      }
      if (jobs.includes('meta_rewrites')) {
        const r = await runMetaRewrites(brand, gscRows, dryRun);
        summary.brands[brand].jobs.meta_rewrites = r;
        summary.queued += r.queued || 0;
      }
      if (jobs.includes('content_gaps')) {
        const r = await runContentGaps(brand, gscRows, dryRun);
        summary.brands[brand].jobs.content_gaps = r;
        summary.queued += r.queued || 0;
      }
    } catch (err) {
      summary.errors.push({ brand, error: err.message });
    }
  }

  summary.finishedAt = Date.now();
  summary.durationMs = summary.finishedAt - summary.startedAt;
  await setSetting('scheduler:lastrun', summary);
  return ok(summary);
};

// ---- GSC fetch -------------------------------------------------------------
// Reuse the existing /api/gsc-data function rather than duplicating OAuth logic.

async function fetchGscRows(brand) {
  const cfg = BRANDS[brand];
  const base = SITE_URL.replace(/\/$/, '');
  const candidates = [
    `sc-domain:${cfg.site}`,
    `https://${cfg.site}/`,
    `https://www.${cfg.site}/`
  ];
  // Try each property format until one returns rows
  for (const site_url of candidates) {
    try {
      const res = await fetch(`${base}/.netlify/functions/gsc-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_url })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.rows) && data.rows.length) {
        return data.rows;
      }
    } catch (_) { /* try next candidate */ }
  }
  return [];
}

// ---- jobs ------------------------------------------------------------------

// Quick wins: keywords ranking 11-20 with decent impressions. Suggest on-page
// improvements + an internal-link plan to push them to page 1.
async function runQuickWins(brand, rows, dryRun) {
  const cfg = BRANDS[brand];
  const candidates = rows
    .filter(r => r.position >= 11 && r.position <= 20 && r.impressions >= 50)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5);

  if (!candidates.length) return { queued: 0, candidates: 0 };

  const prompt = `You are an SEO strategist for a UAE restaurant brand: ${cfg.name} (${cfg.site}).

The following keywords are ranking on Google positions 11-20 — close to page 1 but not there yet. For each one, draft a single concrete, on-page suggestion that the content team can act on this week to push it to the top 10. Be specific: H2 to add, internal link to insert, FAQ to write, schema field to enrich, etc.

KEYWORDS (with current 90-day GSC stats):
${candidates.map((r, i) => `${i+1}. "${r.keyword}" — pos ${r.position}, ${r.impressions} impr, ${r.clicks} clicks, ${r.ctr}% CTR`).join('\n')}

Return ONLY a JSON array, no prose, no fences:
[
  {
    "keyword": "...",
    "currentPosition": 14,
    "title": "Short label for the suggestion",
    "url": "best-guess URL on ${cfg.site} this should target (or empty if a new page)",
    "suggestion": "What to do, in 2-3 sentences, specific and actionable",
    "rationale": "Why this should move the rank",
    "effortMinutes": 30
  }
]`;

  const { text } = await callClaude(prompt, { max_tokens: 2500 });
  const parsed = extractJson(text);
  if (!Array.isArray(parsed)) {
    return { queued: 0, candidates: candidates.length, error: 'Claude did not return a JSON array' };
  }

  if (dryRun) return { queued: 0, candidates: candidates.length, preview: parsed };

  const items = parsed.map(p => ({
    type: 'onpage_suggestion',
    brand,
    title: `Quick win: "${p.keyword}" (pos ${p.currentPosition})`,
    reason: p.rationale || `Ranking #${p.currentPosition} — push to page 1`,
    payload: p
  }));

  const queuedCount = await batchQueue(items);
  return { queued: queuedCount, candidates: candidates.length };
}

// Meta rewrites: pages with high impressions but low CTR — meta is selling poorly.
async function runMetaRewrites(brand, rows, dryRun) {
  const cfg = BRANDS[brand];
  // Heuristic: position is reasonable (top 20), impressions are decent,
  // but CTR is below the rough expected curve.
  const expectedCtr = pos => Math.max(0.5, 30 / pos); // very rough proxy
  const candidates = rows
    .filter(r => r.position <= 20 && r.impressions >= 100)
    .map(r => ({ ...r, ctrGap: expectedCtr(r.position) - r.ctr }))
    .filter(r => r.ctrGap > 1.5)
    .sort((a, b) => b.ctrGap - a.ctrGap)
    .slice(0, 4);

  if (!candidates.length) return { queued: 0, candidates: 0 };

  const prompt = `You are a UAE restaurant SEO copywriter for ${cfg.name} (${cfg.site}).

These pages rank well but their CTR is below what we'd expect — the meta title/description is underselling. Rewrite each one. UAE-local, appetising, keyword-led, includes a soft CTA. Title 50-60 chars, description 150-160 chars.

PAGES:
${candidates.map((r, i) => `${i+1}. Keyword "${r.keyword}", current pos ${r.position}, CTR ${r.ctr}%, ${r.impressions} impressions over 90 days`).join('\n')}

Return ONLY a JSON array:
[
  {
    "keyword": "...",
    "url": "best-guess URL on ${cfg.site} (use slug from keyword if unsure)",
    "title": "...",
    "description": "...",
    "targetKeyword": "...",
    "rationale": "Why this version will improve CTR"
  }
]`;

  const { text } = await callClaude(prompt, { max_tokens: 2500 });
  const parsed = extractJson(text);
  if (!Array.isArray(parsed)) {
    return { queued: 0, candidates: candidates.length, error: 'Claude did not return JSON' };
  }

  if (dryRun) return { queued: 0, candidates: candidates.length, preview: parsed };

  const items = parsed.map(p => ({
    type: 'meta_update',
    brand,
    title: `Meta rewrite: ${p.url || p.keyword}`,
    reason: p.rationale || 'Low CTR vs expected for current position',
    payload: {
      url: p.url,
      title: p.title,
      description: p.description,
      targetKeyword: p.targetKeyword || p.keyword
    }
  }));

  const queuedCount = await batchQueue(items);
  return { queued: queuedCount, candidates: candidates.length };
}

// Content gaps: keywords with high impressions but no top-30 ranking — we're
// missing pages entirely. Propose new blog drafts.
async function runContentGaps(brand, rows, dryRun) {
  const cfg = BRANDS[brand];
  // Keywords appearing in GSC at all means we have *some* presence. To find
  // genuine gaps we look at keywords ranking 30+ with meaningful impressions.
  const candidates = rows
    .filter(r => r.position > 30 && r.impressions >= 80)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 3);

  if (!candidates.length) return { queued: 0, candidates: 0 };

  const prompt = `You are a UAE restaurant content strategist for ${cfg.name} (${cfg.site}).

These queries appear in Google Search Console with meaningful impressions but ${cfg.name} ranks below position 30 — meaning the brand is showing up but on page 4+, almost certainly because there's no dedicated page for the topic. Draft a full blog post for the highest-impact one only. UAE/Dubai context, halal where relevant, internal linking to ${cfg.site}, 800-1200 words, includes intro, 4-6 H2 sections, FAQ section with 4 questions, and a CTA to order or visit.

KEYWORDS (sorted by impressions):
${candidates.map((r, i) => `${i+1}. "${r.keyword}" — ${r.impressions} impressions, currently pos ~${r.position}`).join('\n')}

Pick the BEST one (highest commercial intent + volume). Return ONLY a JSON object, no fences:
{
  "title": "...",
  "metaDescription": "... (150-160 chars)",
  "targetKeyword": "...",
  "slug": "lowercase-hyphenated",
  "excerpt": "1-2 sentence excerpt",
  "body": "<full HTML body with h2/h3/p/ul/ol tags — no <html>, no <body>, no inline styles>",
  "rationale": "Why this keyword + this angle"
}`;

  const { text } = await callClaude(prompt, { max_tokens: 4000 });
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== 'object' || !parsed.title) {
    return { queued: 0, candidates: candidates.length, error: 'Claude did not return a usable JSON object' };
  }

  if (dryRun) return { queued: 0, candidates: candidates.length, preview: parsed };

  const queuedCount = await batchQueue([{
    type: 'blog_draft',
    brand,
    title: `Blog draft: ${parsed.title}`,
    reason: parsed.rationale || `Content gap for keyword "${parsed.targetKeyword}"`,
    payload: parsed
  }]);
  return { queued: queuedCount, candidates: candidates.length };
}

// ---- batch queue helper ----------------------------------------------------

async function batchQueue(items) {
  if (!items || !items.length) return 0;
  const base = SITE_URL.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/.netlify/functions/approvals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', actor: 'claude (scheduler)', items })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('batchQueue failed:', data.error);
      return 0;
    }
    return (data.items || []).length;
  } catch (e) {
    console.warn('batchQueue error:', e.message);
    return 0;
  }
}
