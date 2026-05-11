// netlify/functions/scheduler.js
// Weekly autonomous SEO audit. Triggered by cron (see netlify.toml) OR
// manually from the UI via POST /api/scheduler.
//
// Cron: Mondays 06:00 UTC = 10:00 Dubai time (set in netlify.toml)
//
// Manual: POST /api/scheduler { brand?, dryRun?, jobs?: [...] }
//   brand:  'pickl' | 'bonbird' | omit for both
//   dryRun: true = compute findings but don't queue anything
//   jobs:   subset of ['quick_wins','meta_rewrites','content_gaps']

const { createApproval, callClaude, extractJson, setSetting, ok, bad, preflight, parseBody } = require('./_lib/store');

const SITE_URL = process.env.URL || 'https://yolkseo.netlify.app';

const BRANDS = {
  pickl:   { name: 'Pickl',   site: 'eatpickl.com',       gsc: 'sc-domain:eatpickl.com' },
  bonbird: { name: 'Bonbird', site: 'bonbirdchicken.com', gsc: 'sc-domain:bonbirdchicken.com' },
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  const body = event.httpMethod === 'POST' ? (parseBody(event) || {}) : {};
  const dryRun       = !!body.dryRun;
  const brandsToRun  = body.brand ? [body.brand].filter(b => BRANDS[b]) : Object.keys(BRANDS);
  const jobs         = Array.isArray(body.jobs) && body.jobs.length ? body.jobs : ['quick_wins', 'meta_rewrites', 'content_gaps'];

  const summary = { startedAt: Date.now(), brands: {}, queued: 0, errors: [] };

  for (const brand of brandsToRun) {
    summary.brands[brand] = { jobs: {} };
    try {
      const gscRows = await fetchGscRows(BRANDS[brand].gsc);
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
    } catch (e) {
      summary.errors.push({ brand, error: e.message });
      console.error(`scheduler error for ${brand}:`, e);
    }
  }

  summary.finishedAt  = Date.now();
  summary.durationMs  = summary.finishedAt - summary.startedAt;
  await setSetting('scheduler:lastrun', summary);
  return ok(summary);
};

// ── GSC fetch ────────────────────────────────────────────────────
async function fetchGscRows(siteUrl) {
  const base = SITE_URL.replace(/\/$/, '');
  const res = await fetch(`${base}/.netlify/functions/gsc-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ site_url: siteUrl }),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok ? (data.rows || []) : [];
}

// ── Quick wins: positions 11-20, decent impressions ─────────────
async function runQuickWins(brand, rows, dryRun) {
  const cfg = BRANDS[brand];
  const candidates = rows
    .filter(r => r.position >= 11 && r.position <= 20 && r.impressions >= 50)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5);
  if (!candidates.length) return { queued: 0, candidates: 0 };

  const prompt = `You are an SEO strategist for ${cfg.name} (${cfg.site}), a UAE restaurant brand.

These keywords rank positions 11-20 on Google — close to page 1. For each, draft one specific, actionable on-page suggestion to push it into the top 10 this week (H2 to add, FAQ to write, internal link to insert, schema to enrich, etc).

KEYWORDS:
${candidates.map((r, i) => `${i+1}. "${r.keyword}" — pos ${r.position}, ${r.impressions} impressions, ${r.clicks} clicks`).join('\n')}

Return ONLY a JSON array, no prose:
[{"keyword":"...","currentPosition":14,"title":"Short label","url":"best-guess URL on ${cfg.site}","suggestion":"2-3 sentence specific action","rationale":"Why this moves the rank","effortMinutes":30}]`;

  const { text } = await callClaude(prompt, { max_tokens: 2500 });
  const parsed = extractJson(text);
  if (!Array.isArray(parsed)) return { queued: 0, candidates: candidates.length, error: 'Claude did not return JSON array' };
  if (dryRun) return { queued: 0, candidates: candidates.length, preview: parsed };

  let queued = 0;
  for (const p of parsed) {
    await createApproval({ type: 'onpage_suggestion', brand, actor: 'claude (scheduler)', title: `Quick win: "${p.keyword}" (pos ${p.currentPosition})`, reason: p.rationale || `Ranking #${p.currentPosition} — push to page 1`, payload: p });
    queued++;
  }
  return { queued, candidates: candidates.length };
}

// ── Meta rewrites: high impressions, low CTR ─────────────────────
async function runMetaRewrites(brand, rows, dryRun) {
  const cfg = BRANDS[brand];
  const expected = pos => Math.max(0.5, 30 / pos);
  const candidates = rows
    .filter(r => r.position <= 20 && r.impressions >= 100)
    .map(r => ({ ...r, ctrGap: expected(r.position) - r.ctr }))
    .filter(r => r.ctrGap > 1.5)
    .sort((a, b) => b.ctrGap - a.ctrGap)
    .slice(0, 4);
  if (!candidates.length) return { queued: 0, candidates: 0 };

  const prompt = `You are a UAE restaurant SEO copywriter for ${cfg.name} (${cfg.site}).

These pages rank well but CTR is below expected — the meta is underselling. Rewrite title + description for each. UAE-local, appetising, keyword-led, soft CTA. Title 50-60 chars, description 150-160 chars.

PAGES:
${candidates.map((r, i) => `${i+1}. Keyword "${r.keyword}", pos ${r.position}, CTR ${r.ctr}%, ${r.impressions} impressions`).join('\n')}

Return ONLY a JSON array:
[{"keyword":"...","url":"best-guess URL on ${cfg.site}","title":"...","description":"...","targetKeyword":"...","rationale":"Why this improves CTR"}]`;

  const { text } = await callClaude(prompt, { max_tokens: 2500 });
  const parsed = extractJson(text);
  if (!Array.isArray(parsed)) return { queued: 0, candidates: candidates.length, error: 'Claude did not return JSON' };
  if (dryRun) return { queued: 0, candidates: candidates.length, preview: parsed };

  let queued = 0;
  for (const p of parsed) {
    await createApproval({ type: 'meta_update', brand, actor: 'claude (scheduler)', title: `Meta rewrite: ${p.url || p.keyword}`, reason: p.rationale || 'Low CTR vs expected for current position', payload: { url: p.url, title: p.title, description: p.description, targetKeyword: p.targetKeyword || p.keyword } });
    queued++;
  }
  return { queued, candidates: candidates.length };
}

// ── Content gaps: pos 30+, decent impressions ────────────────────
async function runContentGaps(brand, rows, dryRun) {
  const cfg = BRANDS[brand];
  const candidates = rows
    .filter(r => r.position > 30 && r.impressions >= 80)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 3);
  if (!candidates.length) return { queued: 0, candidates: 0 };

  const prompt = `You are a UAE restaurant content strategist for ${cfg.name} (${cfg.site}).

These queries appear in GSC but ${cfg.name} ranks below position 30 — no dedicated page exists. Draft a full blog post for the highest-impact keyword. UAE/Dubai context, halal where relevant, 800-1200 words, H2 sections, FAQ (4 questions), CTA.

KEYWORDS:
${candidates.map((r, i) => `${i+1}. "${r.keyword}" — ${r.impressions} impressions, pos ~${r.position}`).join('\n')}

Pick the best one (highest commercial intent). Return ONLY a JSON object:
{"title":"...","metaDescription":"(150-160 chars)","targetKeyword":"...","slug":"lowercase-hyphenated","excerpt":"1-2 sentences","body":"<full HTML body, no outer html/body tags>","rationale":"Why this keyword"}`;

  const { text } = await callClaude(prompt, { max_tokens: 4000 });
  const parsed = extractJson(text);
  if (!parsed || !parsed.title) return { queued: 0, candidates: candidates.length, error: 'Claude did not return usable JSON' };
  if (dryRun) return { queued: 0, candidates: candidates.length, preview: parsed };

  await createApproval({ type: 'blog_draft', brand, actor: 'claude (scheduler)', title: `Blog draft: ${parsed.title}`, reason: parsed.rationale || `Content gap for "${parsed.targetKeyword}"`, payload: parsed });
  return { queued: 1, candidates: candidates.length };
}
