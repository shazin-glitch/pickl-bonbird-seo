// netlify/functions/scheduler-background.js
// Weekly autonomous SEO audit. Triggered by cron (netlify.toml) or manually.
//
// JOBS:
//   quick_wins      Keywords pos 11-20: Claude writes updated page content → queued as page_update
//   meta_rewrites   High impressions, low CTR: Claude rewrites title/desc → queued as meta_update
//   content_gaps    Keywords pos 30+: Claude writes a new blog post → queued as blog_draft
//   page_creation   Content gaps with local/location intent: Claude creates a full new WP page
//
// All items land as WP drafts. The push happens when user clicks Approve (draft)
// or Approve & Publish (goes live immediately).

const {
  createApproval, listApprovals, callClaude, extractJson,
  getSetting, setSetting, fetchGscDirect,
  ok, bad, preflight, parseBody,
} = require('./_lib/store');
const { getBrandContext, buildBrandPrompt } = require('./_lib/brand');

// Keywords already queued this week — don't re-queue the same ones
async function getQueuedKeywords(brand) {
  const pending = await listApprovals({ brand, limit: 200 });
  const keywords = new Set();
  for (const item of pending) {
    if (!item.payload) continue;
    const kw = item.payload.targetKeyword || item.payload.keyword;
    if (kw) keywords.add(kw.toLowerCase().trim());
  }
  return keywords;
}

const SITE_URL = process.env.URL || 'https://yolkseo.netlify.app';

const BRANDS = {
  pickl:   { name: 'Pickl',   site: 'eatpickl.com',       domain: 'https://eatpickl.com',       gsc: 'https://eatpickl.com/',       cuisine: 'smash burgers',        tone: 'bold, casual-premium, Dubai-cool' },
  bonbird: { name: 'Bonbird', site: 'bonbirdchicken.com', domain: 'https://bonbirdchicken.com', gsc: 'sc-domain:bonbirdchicken.com', cuisine: 'halal fried chicken',  tone: 'warm, family-friendly, UAE-local' },
};

exports.handler = async (event) => {
  // Background function: client gets immediate 202, we run up to 15 minutes
  const body = event.httpMethod === 'POST' ? (parseBody(event) || {}) : {};
  const dryRun      = !!body.dryRun;
  const forceRun    = !!body.forceRun;
  const brandsToRun = body.brand ? [body.brand].filter(b => BRANDS[b]) : Object.keys(BRANDS);
  const jobs        = Array.isArray(body.jobs) && body.jobs.length
    ? body.jobs
    : ['quick_wins', 'meta_rewrites', 'content_gaps', 'page_creation'];

  const summary = { startedAt: Date.now(), brands: {}, queued: 0, errors: [] };

  for (const brand of brandsToRun) {
    summary.brands[brand] = { jobs: {} };
    try {
      const brandCtx = await getBrandContext(brand);
      const brandPrompt = buildBrandPrompt(brandCtx);
      const gscRows = await fetchGscRows(BRANDS[brand].gsc);
      summary.brands[brand].gscRows = gscRows.length;

      // Background mode: run ALL requested jobs, no timeout concern
      for (const jobName of jobs) {
        try {
          let r;
          if (jobName === 'quick_wins')    r = await runQuickWins(brand, gscRows, dryRun, forceRun, brandCtx, brandPrompt);
          else if (jobName === 'meta_rewrites') r = await runMetaRewrites(brand, gscRows, dryRun, forceRun, brandCtx, brandPrompt);
          else if (jobName === 'content_gaps')  r = await runContentGaps(brand, gscRows, dryRun, forceRun, brandCtx, brandPrompt);
          else if (jobName === 'page_creation') r = await runPageCreation(brand, gscRows, dryRun, forceRun, brandCtx, brandPrompt);
          else r = { queued: 0, error: 'unknown job: ' + jobName };
          summary.brands[brand].jobs[jobName] = r;
          summary.queued += r.queued || 0;
          console.log(`[${brand}][${jobName}]`, JSON.stringify(r));
        } catch (jobErr) {
          summary.brands[brand].jobs[jobName] = { queued: 0, error: jobErr.message };
          console.error(`[${brand}][${jobName}] error:`, jobErr);
        }
      }
    } catch (e) {
      summary.errors.push({ brand, error: e.message });
      console.error('scheduler brand error:', brand, e);
    }
  }

  summary.finishedAt = Date.now();
  summary.durationMs = summary.finishedAt - summary.startedAt;
  await setSetting('scheduler:lastrun', summary);
  console.log('Scheduler done:', JSON.stringify(summary));

  // Send Slack notification if items were queued
  if (summary.queued > 0) {
    try {
      const siteUrl = process.env.URL || 'https://yolkseo.netlify.app';
      await fetch(`${siteUrl}/.netlify/functions/slack-notify`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          type:  'queue_summary',
          brand: brandsToRun.length === 1 ? brandsToRun[0] : null,
          count: summary.queued,
          items: [], // summary level — no per-item detail needed
        }),
      });
    } catch (e) {
      console.warn('[scheduler] Slack notification failed:', e.message);
    }
  }

  // Background functions return nothing — client already got 202
};

// ── GSC fetchll, no internal HTTP hop ───────────
async function fetchGscRows(siteUrl) {
  try {
    return await fetchGscDirect(siteUrl);
  } catch (e) {
    console.error('GSC fetch failed for', siteUrl, ':', e.message);
    return [];
  }
}

// ════════════════════════════════════════════════════════════════
// JOB 1: QUICK WINS
// Keywords ranking 11-20. Claude writes the ACTUAL updated page
// content (full HTML) for the existing page, not just a suggestion.
// Queued as page_update → pushes via wordpress.js update_content.
// ════════════════════════════════════════════════════════════════
async function runQuickWins(brand, rows, dryRun, forceRun, brandCtx, brandPrompt) {
  const cfg = BRANDS[brand];
  const alreadyQueued = await getQueuedKeywords(brand);
  const candidates = rows
    .filter(r => r.position >= 11 && r.position <= 20 && r.impressions >= 50)
    .filter(r => forceRun || !alreadyQueued.has(r.keyword.toLowerCase().trim()))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, forceRun ? 3 : 1); // 1 per run to stay within function timeout
  if (!candidates.length) return { queued: 0, candidates: 0, skipped: 'all candidates already queued' };

  if (dryRun) return { queued: 0, candidates: candidates.length, preview: candidates.map(r => r.keyword) };

  let queued = 0;
  for (const r of candidates) {
    const prompt = `You are a senior SEO content writer for ${cfg.name}, a UAE restaurant brand known for ${cfg.cuisine}. Tone: ${cfg.tone}.

The page targeting keyword "${r.keyword}" currently ranks position ${r.position} on Google. We need to push it into the top 10.

Write COMPLETE, READY-TO-PUBLISH page content that:
- Opens with an engaging H1 that leads with "${r.keyword}" naturally
- Includes 3-4 H2 sections targeting semantic variants of "${r.keyword}"
- Has a FAQ section (4 questions people actually search) 
- Includes an internal link to at least one other ${cfg.site} page (use placeholder href like /menu or /locations)
- Leaves image placeholders as HTML comments: <!-- IMAGE: [description of ideal image] -->
- Is 600-900 words total
- Ends with a clear CTA to order, visit, or find a location
- Naturally includes Dubai/UAE location context throughout

Return ONLY a JSON object, no prose:
{
  "keyword": "${r.keyword}",
  "currentPosition": ${r.position},
  "url": "most likely URL path e.g. /menu or /locations",
  "title": "SEO title (55-60 chars)",
  "description": "Meta description (150-160 chars)",
  "targetKeyword": "${r.keyword}",
  "pageTitle": "H1 for the page",
  "body": "<HTML: 1 intro p, 3 h2 sections each with 2-3 p tags, 1 FAQ section with 3 questions, 1 CTA p — keep under 500 words total — image placeholders as HTML comments>",
  "changeRationale": "1 sentence: why this will improve ranking"
}`;

    const { text } = await callClaude(prompt, { max_tokens: 1800 });
    const parsed = extractJson(text);
    if (!parsed || !parsed.body) continue;

    if (dryRun) { queued++; continue; }

    await createApproval({
      type: 'page_update',
      brand,
      actor: 'claude (scheduler)',
      title: `Quick win: "${r.keyword}" — page content update (pos ${r.position})`,
      reason: parsed.changeRationale || `Rewriting page content to push "${r.keyword}" from pos ${r.position} to top 10`,
      payload: {
        url:           parsed.url,
        title:         parsed.title,
        description:   parsed.description,
        targetKeyword: parsed.targetKeyword || r.keyword,
        pageTitle:     parsed.pageTitle,
        body:          parsed.body,
        // These map to wordpress.js update_content
        wpAction:      'update_content',
      },
    });
    queued++;
  }
  return { queued, candidates: candidates.length };
}

// ════════════════════════════════════════════════════════════════
// JOB 2: META REWRITES
// High impressions, low CTR. Rewrites title + description only.
// Queued as meta_update → pushes via wordpress.js update_meta.
// ════════════════════════════════════════════════════════════════
async function runMetaRewrites(brand, rows, dryRun, forceRun, brandCtx, brandPrompt) {
  const cfg = BRANDS[brand];
  const expected = pos => Math.max(0.5, 30 / pos);
  const alreadyQueued = await getQueuedKeywords(brand);
  const candidates = rows
    .filter(r => r.position <= 20 && r.impressions >= 100)
    .map(r => ({ ...r, ctrGap: expected(r.position) - r.ctr }))
    .filter(r => r.ctrGap > 1.5)
    .filter(r => forceRun || !alreadyQueued.has(r.keyword.toLowerCase().trim()))
    .sort((a, b) => b.ctrGap - a.ctrGap)
    .slice(0, forceRun ? 6 : 4);
  if (!candidates.length) return { queued: 0, candidates: 0, skipped: 'all candidates already queued' };

  const menuItems = brandCtx && brandCtx.menu ? [
    ...(brandCtx.menu.cheeseburgers || []).slice(0, 3),
    ...(brandCtx.menu.chickenSandos || []).slice(0, 2),
    ...(brandCtx.menu.friesAndSides || []).slice(0, 2),
  ].join(' | ') : 'smash burgers, chicken sandos, fries';

  const prompt = `${brandPrompt || ''}

You are rewriting SEO meta titles and descriptions for ${brandCtx ? brandCtx.name : cfg.name}.

TASK: These pages rank well but CTR is below expected — the meta is underselling. Rewrite each one.

STRICT RULES:
- Title: 52-58 characters exactly
- Description: 150-158 characters exactly  
- Only mention REAL menu items from the brand context above — do NOT invent items
- Real items you can reference: ${menuItems}
- UAE-local language, keyword-led, ends with a soft CTA
- Sound like the brand — use the tone rules above

PAGES TO REWRITE:
${candidates.map((r, i) => `${i+1}. Keyword: "${r.keyword}" | Pos: ${r.position} | CTR: ${r.ctr}% | ${r.impressions} impressions/90d`).join('\n')}

Return ONLY a JSON array, no prose, no fences:
[{"keyword":"...","url":"URL path e.g. /menu or /location","title":"52-58 chars","description":"150-158 chars","targetKeyword":"...","rationale":"one sentence"}]`;

  if (dryRun) return { queued: 0, candidates: candidates.length, preview: candidates.map(r => r.keyword) };

  const { text } = await callClaude(prompt, { max_tokens: 2000 });
  const parsed = extractJson(text);
  if (!Array.isArray(parsed)) return { queued: 0, candidates: candidates.length, error: 'Claude did not return JSON array' };

  let queued = 0;
  for (const p of parsed) {
    await createApproval({
      type: 'meta_update',
      brand,
      actor: 'claude (scheduler)',
      title: `Meta rewrite: ${p.url || p.keyword}`,
      reason: p.rationale || 'Low CTR vs expected for current ranking position',
      payload: {
        url: p.url ? `${cfg.domain}${p.url.startsWith('/') ? '' : '/'}${p.url}` : '',
        title: p.title,
        description: p.description,
        targetKeyword: p.targetKeyword || p.keyword,
        wpAction: 'update_meta',
      },
    });
    queued++;
  }
  return { queued, candidates: candidates.length };
}

// ════════════════════════════════════════════════════════════════
// JOB 3: CONTENT GAPS — BLOG POSTS
// Keywords ranking 30+ where no page exists. Writes full blog post.
// Queued as blog_draft → pushes via wordpress.js create_draft.
// ════════════════════════════════════════════════════════════════
async function runContentGaps(brand, rows, dryRun, forceRun, brandCtx, brandPrompt) {
  const cfg = BRANDS[brand];
  const alreadyQueued = await getQueuedKeywords(brand);
  const candidates = rows
    .filter(r => r.position > 8 && r.impressions >= 20)
    .filter(r => forceRun || !alreadyQueued.has(r.keyword.toLowerCase().trim()))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, forceRun ? 5 : 3);
  if (!candidates.length) return { queued: 0, candidates: 0, skipped: 'no content gap candidates found' };

  const siteName = brandCtx ? brandCtx.name : cfg.name;
  const siteDomain = brandCtx ? brandCtx.website : cfg.domain;

  const prompt = `${brandPrompt || ''}

You are writing an SEO blog post for ${siteName}.

TARGET: Write a focused, on-brand blog post for the keyword with the highest commercial intent from this list.

KEYWORDS (pick the best one):
${candidates.map((r, i) => `${i+1}. "${r.keyword}" — ${r.impressions} impressions, ranking ~pos ${r.position}`).join('\n')}

CONTENT REQUIREMENTS:
- 400-600 words — punchy and specific, not padded
- H1 leads naturally with the target keyword
- 3 H2 sections: each with actual useful content about ${siteName} (reference real menu items by name)
- 3 FAQ questions people actually search about this topic in UAE/Dubai
- One internal link to a ${siteDomain} page (e.g. /menu or /locations) 
- One image placeholder: <!-- IMAGE: [very specific description of ideal food photo] -->
- UAE/Dubai local context throughout — mention specific areas, local culture naturally
- End with a CTA that sounds like ${siteName} — not generic, not salesy

CRITICAL — TONE: Sound exactly like the brand described above. Use the brand language naturally. Mention specific menu items by their actual names. Do not write generic food content.

CRITICAL — FORMAT: Return ONLY valid JSON, no markdown, no fences, nothing else:
{"title":"...","metaDescription":"exactly 150-160 chars","targetKeyword":"...","slug":"lowercase-hyphens-no-spaces","excerpt":"1-2 sentences","body":"<h2>...</h2><p>...</p> full HTML content","rationale":"one sentence: why this keyword, why this angle"}`;

  if (dryRun) return { queued: 0, candidates: candidates.length, preview: candidates.map(r => r.keyword) };

  const { text } = await callClaude(prompt, { max_tokens: 3000 });

  // Log what Claude returned for debugging
  console.log('[content_gaps] Claude response length:', text && text.length);
  console.log('[content_gaps] Claude response preview:', text && text.slice(0, 200));

  const parsed = extractJson(text);
  if (!parsed || !parsed.title || !parsed.body) {
    console.error('[content_gaps] JSON parse failed. Raw:', text && text.slice(0, 500));
    return { queued: 0, candidates: candidates.length, error: 'Claude response could not be parsed — check function logs' };
  }

  await createApproval({
    type: 'blog_draft',
    brand,
    actor: 'claude (scheduler)',
    title: `Blog draft: ${parsed.title}`,
    reason: parsed.rationale || `Content gap for "${parsed.targetKeyword}"`,
    payload: {
      title: parsed.title,
      metaDescription: parsed.metaDescription,
      description: parsed.metaDescription,
      targetKeyword: parsed.targetKeyword,
      slug: parsed.slug,
      excerpt: parsed.excerpt,
      body: parsed.body,
      wpAction: 'create_draft',
    },
  });
  return { queued: 1, candidates: candidates.length };
}

// ════════════════════════════════════════════════════════════════
// JOB 4: PAGE CREATION
// Keywords with local/location/service intent (e.g. "burger delivery
// dubai marina") where a dedicated LANDING PAGE would outperform a
// blog post. Claude builds the full page. Queued as page_creation
// → pushes via wordpress.js create_page.
// ════════════════════════════════════════════════════════════════
async function runPageCreation(brand, rows, dryRun, forceRun, brandCtx, brandPrompt) {
  const cfg = BRANDS[brand];

  // Filter for location/service intent keywords — these deserve pages not posts
  const locationSignals = ['dubai', 'abu dhabi', 'sharjah', 'uae', 'delivery', 'near me', 'marina', 'jlt', 'downtown', 'deira', 'jbr', 'mall', 'city walk', 'difc'];
  const alreadyQueued = await getQueuedKeywords(brand);
  const candidates = rows
    .filter(r => {
      const kw = r.keyword.toLowerCase();
      return r.position > 15
        && r.impressions >= 60
        && locationSignals.some(s => kw.includes(s))
        && (forceRun || !alreadyQueued.has(kw.trim()));
    })
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, forceRun ? 3 : 2);

  if (!candidates.length) return { queued: 0, candidates: 0, skipped: 'no location-intent candidates or all already queued' };
  if (dryRun) return { queued: 0, candidates: candidates.length, preview: candidates.map(r => r.keyword) };

  let queued = 0;
  for (const r of candidates) {
    const prompt = `You are a senior SEO strategist and copywriter for ${cfg.name} (${cfg.site}), a UAE ${cfg.cuisine} restaurant brand. Tone: ${cfg.tone}.

Create a complete, conversion-focused landing page for the keyword "${r.keyword}".

This should be a STANDALONE PAGE (not a blog post) — think of it as a location or service page. It needs to:
- Have an H1 that leads naturally with "${r.keyword}"  
- 3-4 H2 sections covering: what makes ${cfg.name} the best option, the specific location/area context, menu highlights relevant to this keyword, how to order/visit
- Rich with UAE-specific local context (mention nearby landmarks, areas if relevant)
- Include the brand's USPs naturally (${cfg.cuisine}, quality, UAE-based)
- Internal links to /menu, /locations, /order (or equivalent)
- Leave image placeholders as HTML comments with specific descriptions: <!-- IMAGE: [e.g. "Pickl smash burger close-up, golden bun, melted cheese"] -->
- CTA section at the bottom ("Order Now", "Find Us", "View Menu")
- Total 500-800 words — punchy, not padded

Return ONLY a JSON object:
{
  "keyword": "${r.keyword}",
  "title": "SEO page title (55-60 chars)",
  "description": "Meta description (150-158 chars)",
  "targetKeyword": "${r.keyword}",
  "slug": "url-slug-e.g-smash-burger-dubai-marina",
  "pageHeading": "H1 for the page",
  "excerpt": "Short description for page lists",
  "body": "<full page HTML — h2, p, ul, strong, image placeholder comments — no outer html/body tags>",
  "pageType": "location|service|category",
  "rationale": "Why a dedicated page for this keyword will outrank blog content"
}`;

    const { text } = await callClaude(prompt, { max_tokens: 1800 });
    const parsed = extractJson(text);
    if (!parsed || !parsed.body || !parsed.title) continue;
    if (dryRun) { queued++; continue; }

    await createApproval({
      type: 'page_creation',
      brand,
      actor: 'claude (scheduler)',
      title: `New page: ${parsed.title}`,
      reason: parsed.rationale || `New landing page for "${r.keyword}" (${r.impressions} impressions, pos ${r.position})`,
      payload: {
        title:         parsed.title,
        description:   parsed.description,
        targetKeyword: parsed.targetKeyword || r.keyword,
        slug:          parsed.slug,
        pageHeading:   parsed.pageHeading,
        excerpt:       parsed.excerpt,
        body:          parsed.body,
        pageType:      parsed.pageType || 'location',
        // These map to wordpress.js create_page
        wpAction:      'create_page',
      },
    });
    queued++;
  }
  return { queued, candidates: candidates.length };
}
