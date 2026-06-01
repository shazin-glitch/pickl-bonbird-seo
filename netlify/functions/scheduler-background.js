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
  getSetting, setSetting, fetchGscDirect, fetchGscWithPages,
  ok, bad, preflight, parseBody,
} = require('./_lib/store');
const { getBrandContext, buildBrandPrompt, runBrandVoiceCheck } = require('./_lib/brand');

// ── Keyword tier classification ────────────────────────────────────────────────
// Quick Win:    pos 11-20  — already ranking, one update = page 1. Fastest ROI.
// Short Term:   pos 21-35  — ranking weakly, new focused post. 4-8 weeks.
// Long Term:    pos 36-100 — barely visible, new content from scratch. 3-6 months.
// Priority Gap: competitor ranks top 20, we have zero impressions (fed from matrix)

function getKeywordTier(position) {
  if (position >= 11 && position <= 20) return { tier: 'Quick Win',  color: '#059669', emoji: '⚡' };
  if (position >= 21 && position <= 35) return { tier: 'Short Term', color: '#d97706', emoji: '📈' };
  return { tier: 'Long Term', color: '#6366f1', emoji: '🎯' };
}

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

// ── Load seed keywords — curated non-branded terms not in GSC ─────────────────
async function loadSeedKeywords(brand) {
  try {
    const siteUrl = process.env.URL || 'https://yolkseo.netlify.app';
    const res  = await fetch(`${siteUrl}/.netlify/functions/seed-keywords?brand=${brand}`);
    const data = await res.json();
    return data[brand]?.keywords || [];
  } catch {
    return [];
  }
}

// Convert seed keywords into GSC-like row objects for content gap processing
function seedKeywordsToRows(keywords) {
  return keywords.map(kw => ({
    keyword:     kw,
    position:    50,    // treat as Long Term tier
    impressions: 100,   // assume high value — manually curated
    clicks:      0,
    ctr:         0,
    source:      'seed', // flag so we know it came from seed list not GSC
  }));
}
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
    const systemPrompt = brandPrompt || buildBrandPrompt(brandCtx);
    const userPrompt = `The page targeting "${r.keyword}" ranks position ${r.position}. Rewrite it to push into the top 10.

TASK: Write complete, ready-to-publish page content. Every word must sound like ${brandCtx.name || cfg.name} — not a generic SEO agency.

CONTENT REQUIREMENTS:
- H1 leads naturally with "${r.keyword}" — make it a line someone would actually say, not an SEO title
- 3 H2 sections: each must reference a specific menu item, location, or brand truth by name
- FAQ section: 4 questions people actually search — answer them the way ${brandCtx.name || cfg.name} would talk, not how a textbook would
- Internal link to one other page (use /menu, /locations, /order as placeholder href)
- Image placeholder: <!-- IMAGE: [very specific food photo description] -->
- 600-900 words total
- CTA at end: make it sound like the brand, not like a billboard

VOICE CHECK — before returning, verify:
□ Could any sentence appear on a competitor's website? If yes — rewrite it
□ Is at least one specific menu item named (not "our burgers" but the actual name)?
□ Does the opening line make someone hungry or curious?

Return ONLY valid JSON:
{
  "keyword": "${r.keyword}",
  "currentPosition": ${r.position},
  "url": "page URL path e.g. /menu",
  "title": "SEO title 55-60 chars — brand voice, not generic",
  "description": "Meta description 150-160 chars — specific, not generic",
  "targetKeyword": "${r.keyword}",
  "pageTitle": "H1 for the page",
  "body": "Full HTML content — h2 sections, FAQ, CTA. Image placeholders as HTML comments.",
  "changeRationale": "One sentence: what specifically makes this version better for ranking"
}`;

    const { text } = await callClaude(userPrompt, { max_tokens: 1800, system: systemPrompt });
    const parsed = extractJson(text);
    if (!parsed || !parsed.body) continue;

    // Brand voice check
    const voiceCheck = await runBrandVoiceCheck(parsed.body, brandCtx, (p, o) => callClaude(p, o)).catch(() => ({ score: 6, verdict: 'PASS' }));
    console.log(`[quick_wins] ${r.keyword} — voice score: ${voiceCheck.score}/10 (${voiceCheck.verdict})`);

    if (dryRun) { queued++; continue; }

    const tier = getKeywordTier(r.position);
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
        wpAction:      'update_content',
        voiceScore:    voiceCheck.score,
        voiceIssues:   voiceCheck.issues,
        keywordTier:   tier.tier,
        tierColor:     tier.color,
        tierEmoji:     tier.emoji,
        currentPos:    r.position,
        impressions:   r.impressions,
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
//
// FIX: Uses fetchGscWithPages so every candidate has a REAL page URL
// from GSC instead of asking Claude to guess it. Also validates the
// page has content in WordPress before queuing, which stops meta
// updates being generated for empty or non-existent pages.
// ════════════════════════════════════════════════════════════════
async function runMetaRewrites(brand, _rows, dryRun, forceRun, brandCtx, brandPrompt) {
  const cfg = BRANDS[brand];

  // Fetch keyword+page rows — real URLs from GSC
  let rowsWithPages = [];
  try {
    rowsWithPages = await fetchGscWithPages(cfg.gsc);
  } catch (e) {
    console.warn('[meta_rewrites] fetchGscWithPages failed:', e.message);
    return { queued: 0, candidates: 0, skipped: 'GSC page fetch failed: ' + e.message };
  }

  // Group by page URL — pick best keyword per page (highest impressions)
  const pageMap = {};
  for (const r of rowsWithPages) {
    if (!r.page) continue;
    const pageUrl = r.page.split('?')[0].split('#')[0];
    if (!pageMap[pageUrl] || r.impressions > pageMap[pageUrl].impressions) {
      pageMap[pageUrl] = { ...r, page: pageUrl };
    }
  }

  const expected     = pos => Math.max(0.5, 30 / pos);
  const alreadyQueued = await getQueuedKeywords(brand);

  const candidates = Object.values(pageMap)
    .filter(r => r.position <= 20 && r.impressions >= 100)
    .map(r => ({ ...r, ctrGap: expected(r.position) - r.ctr }))
    .filter(r => r.ctrGap > 1.5)
    .filter(r => forceRun || !alreadyQueued.has(r.keyword.toLowerCase().trim()))
    .sort((a, b) => b.ctrGap - a.ctrGap)
    .slice(0, forceRun ? 6 : 4);

  if (!candidates.length) return { queued: 0, candidates: 0, skipped: 'no low-CTR candidates found' };
  if (dryRun) return { queued: 0, candidates: candidates.length, preview: candidates.map(r => r.keyword + ' → ' + r.page) };

  // Validate each page has actual content in WordPress before queuing
  const validCandidates = [];
  for (const r of candidates) {
    const hasContent = await wpPageHasContent(brand, r.page);
    if (hasContent) {
      validCandidates.push(r);
    } else {
      console.log(`[meta_rewrites] Skipping ${r.page} — empty or not in WP`);
    }
  }

  if (!validCandidates.length) return { queued: 0, candidates: candidates.length, skipped: 'all candidates failed WP content check' };

  const systemPrompt = brandPrompt || buildBrandPrompt(brandCtx);
  const brandName    = brandCtx?.name || cfg.name;
  const menuItems    = brandCtx?.menu ? [
    ...(brandCtx.menu.cheeseburgers || []).slice(0, 3),
    ...(brandCtx.menu.chickenSandos || brandCtx.menu.sandwiches || []).slice(0, 2),
    ...(brandCtx.menu.friesAndSides || brandCtx.menu.sides || []).slice(0, 2),
  ].join(' | ') : '';

  const userPrompt = `These ${brandName} pages rank well but CTR is poor — the meta is bland. Rewrite each one.

TASK: Make the meta title and description so specific and on-brand that someone scrolling past stops.

RULES — non-negotiable:
- Title: 52-58 characters exactly — count them
- Description: 150-158 characters exactly — count them
- Only reference REAL menu items: ${menuItems || 'use items from brand context'}
- No generic phrases: "great food", "delicious", "best in Dubai", "quality ingredients"
- Each title must make ${brandName} sound like ${brandName} — not a generic restaurant
- Lead with the keyword, end with a reason to click
- Do NOT invent or change the URL — use the exact URL provided for each page

PAGES TO REWRITE:
${validCandidates.map((r, i) => `${i+1}. URL: "${r.page}" | Keyword: "${r.keyword}" | Position: ${r.position} | CTR: ${r.ctr}% | ${r.impressions} impressions`).join('\n')}

VOICE CHECK before returning:
□ Does each title sound like it could only be ${brandName}?
□ Is there at least one specific detail (menu item, location, brand term)?
□ Would you click this if you saw it on Google?

Return ONLY a JSON array, no prose:
[{"keyword":"...","url":"exact URL from input above — do not change","title":"52-58 chars","description":"150-158 chars","targetKeyword":"...","rationale":"one sentence why this will improve CTR"}]`;

  const { text } = await callClaude(userPrompt, { max_tokens: 2000, system: systemPrompt });
  const parsed = extractJson(text);
  if (!Array.isArray(parsed)) return { queued: 0, candidates: validCandidates.length, error: 'Claude did not return JSON array' };

  let queued = 0;
  for (const p of parsed) {
    // Use matched real URL, fallback to Claude's URL only if it matches a known candidate
    const matched  = validCandidates.find(r => r.page === p.url || r.keyword === p.keyword);
    const finalUrl = matched ? matched.page : null;
    if (!finalUrl) { console.warn('[meta_rewrites] Claude returned unknown URL, skipping:', p.url); continue; }

    await createApproval({
      type:  'meta_update',
      brand,
      actor: 'claude (scheduler)',
      title: `Meta rewrite: ${finalUrl}`,
      reason: p.rationale || 'Low CTR vs expected for current ranking position',
      payload: {
        url:           finalUrl,
        title:         p.title,
        description:   p.description,
        targetKeyword: p.targetKeyword || p.keyword,
        currentPos:    matched?.position,
        impressions:   matched?.impressions,
        ctrGap:        matched?.ctrGap?.toFixed(1),
        wpAction:      'update_meta',
      },
    });
    queued++;
  }
  return { queued, candidates: validCandidates.length };
}

// ── WordPress content validation ──────────────────────────────────────────────
// Returns true only if the page exists in WP and has ≥100 words of content.
// Prevents meta updates being queued for empty or non-existent pages.
async function wpPageHasContent(brand, pageUrl) {
  try {
    const wpBase = brand === 'pickl' ? process.env.WP_PICKL_BASE : process.env.WP_BONBIRD_BASE;
    const wpUser = brand === 'pickl' ? process.env.WP_PICKL_USER : process.env.WP_BONBIRD_USER;
    const wpPass = brand === 'pickl' ? process.env.WP_PICKL_APP_PASS : process.env.WP_BONBIRD_APP_PASS;

    if (!wpBase) return true; // Can't validate without WP config — allow through

    // Homepage always has content
    const path = pageUrl.replace(/^https?:\/\/[^\/]+/, '').replace(/^\/|\/$/g, '');
    if (!path) return true;

    const slug    = path.split('/').filter(Boolean).pop() || '';
    if (!slug) return true;

    const auth    = Buffer.from(`${wpUser}:${wpPass}`).toString('base64');
    const headers = { Authorization: `Basic ${auth}` };

    for (const type of ['pages', 'posts']) {
      try {
        const res  = await fetch(`${wpBase}/wp-json/wp/v2/${type}?slug=${encodeURIComponent(slug)}&_fields=id,content,status`, { headers });
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0 && data[0].status === 'publish') {
          const text      = (data[0].content?.rendered || '').replace(/<[^>]+>/g, ' ');
          const wordCount = text.split(/\s+/).filter(Boolean).length;
          if (wordCount >= 100) { console.log(`[wpCheck] ${pageUrl} → ${wordCount} words ✓`); return true; }
          console.log(`[wpCheck] ${pageUrl} → only ${wordCount} words — skipping`);
          return false;
        }
      } catch (_) {}
    }

    console.log(`[wpCheck] ${pageUrl} → not found in WP, skipping`);
    return false;
  } catch (e) {
    console.warn('[wpCheck] Error for', pageUrl, ':', e.message);
    return true; // On unexpected error, allow through
  }
}

// ════════════════════════════════════════════════════════════════
// JOB 3: CONTENT GAPS — BLOG POSTS
// Short Term: pos 21-35 — ranking weakly, new focused post needed
// Long Term:  pos 36-100 — barely visible, build from scratch
// Queued as blog_draft → pushes via wordpress.js create_draft.
// ════════════════════════════════════════════════════════════════
async function runContentGaps(brand, rows, dryRun, forceRun, brandCtx, brandPrompt) {
  const cfg = BRANDS[brand];
  const alreadyQueued = await getQueuedKeywords(brand);

  // Merge GSC rows with seed keywords (seed = keywords we want to rank for but don't yet)
  const seedKws   = await loadSeedKeywords(brand);
  const seedRows  = seedKeywordsToRows(seedKws).filter(
    r => forceRun || !alreadyQueued.has(r.keyword.toLowerCase().trim())
  );

  // Short Term: pos 21-35, min 30 impressions — closer to ranking, faster win
  const shortTerm = rows
    .filter(r => r.position >= 21 && r.position <= 35 && r.impressions >= 30)
    .filter(r => forceRun || !alreadyQueued.has(r.keyword.toLowerCase().trim()))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, forceRun ? 3 : 2);

  // Long Term: pos 36-100, min 20 impressions — lower position but high search volume
  const longTermGsc = rows
    .filter(r => r.position > 35 && r.impressions >= 20)
    .filter(r => forceRun || !alreadyQueued.has(r.keyword.toLowerCase().trim()))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, forceRun ? 2 : 1);

  // Seed keywords — Priority Gap (manually curated, not in GSC)
  const priorityGap = seedRows.slice(0, forceRun ? 3 : 1);

  const candidates = [...shortTerm, ...longTermGsc, ...priorityGap];
  if (!candidates.length) return { queued: 0, candidates: 0, skipped: 'no content gap candidates found' };

  const siteName   = brandCtx?.name || cfg.name;
  const siteDomain = brandCtx?.website || cfg.domain;
  const systemPrompt = brandPrompt || buildBrandPrompt(brandCtx);

  const userPrompt = `Write a blog post for ${siteName}. This is NOT generic SEO content — it must sound unmistakably like ${siteName}.

TARGET KEYWORD: Pick the best one from this list (highest intent + volume):
${candidates.map((r, i) => `${i+1}. "${r.keyword}" — ${r.impressions} impressions, ranking pos ${r.position}`).join('\n')}

WHAT MAKES THIS POST WIN:
- 450-600 words — tight and specific, not padded with filler
- H1 leads with the keyword but sounds like something a human would say, not an SEO robot
- 3 H2 sections: each must mention a specific menu item, real location, or brand truth by name — no vague references
- 3 FAQ questions people actually type into Google about this in Dubai/UAE — answer them like ${siteName} talks, not like a Wikipedia article
- One internal link (use /menu or /locations as href)
- One image placeholder: <!-- IMAGE: [very specific description of what the ideal photo shows] -->
- End with a CTA that sounds like ${siteName} would say it — not "visit us today for a great experience"

BRAND VOICE SELF-CHECK — run this before returning:
□ Does the opening line make someone hungry or curious? If not — rewrite it.
□ Is at least one specific menu item named (actual name, not "our burgers")?
□ Could any sentence appear on a competitor's website? If yes — rewrite that sentence.
□ Does the CTA sound like the brand or like a template? If template — rewrite it.

Return ONLY valid JSON, no markdown, no fences:
{
  "title": "Blog post title — 50-60 chars, sounds like ${siteName} not generic SEO",
  "metaDescription": "150-160 chars — specific detail that makes people click, not generic",
  "targetKeyword": "the keyword you chose",
  "slug": "lowercase-hyphens-no-spaces",
  "excerpt": "1-2 sentence teaser that sounds like ${siteName}",
  "body": "Full HTML — h2 sections, FAQ, CTA. Every sentence earns its place.",
  "rationale": "One sentence: what specific angle makes this post win this keyword"
}`;

  if (dryRun) return { queued: 0, candidates: candidates.length, preview: candidates.map(r => r.keyword) };

  const { text } = await callClaude(userPrompt, { max_tokens: 3000, system: systemPrompt });

  console.log('[content_gaps] Claude response length:', text && text.length);
  console.log('[content_gaps] Claude response preview:', text && text.slice(0, 200));

  const parsed = extractJson(text);
  if (!parsed || !parsed.title || !parsed.body) {
    console.error('[content_gaps] JSON parse failed. Raw:', text && text.slice(0, 500));
    return { queued: 0, candidates: candidates.length, error: 'Claude response could not be parsed — check function logs' };
  }

  // Brand voice quality gate — score content before queuing
  const voiceCheck = await runBrandVoiceCheck(parsed.body, brandCtx, (p, o) => callClaude(p, o)).catch(() => ({ score: 6, verdict: 'PASS', issues: [] }));
  console.log(`[content_gaps] "${parsed.targetKeyword}" — voice score: ${voiceCheck.score}/10 (${voiceCheck.verdict})`);

  if (voiceCheck.score < 5) {
    console.warn(`[content_gaps] Score ${voiceCheck.score}/10 — too low to queue. Issues: ${voiceCheck.issues.join(', ')}`);
    return { queued: 0, candidates: candidates.length, error: `Brand voice score too low (${voiceCheck.score}/10) — content not queued. Issues: ${voiceCheck.issues.join('; ')}` };
  }

  // Find which tier this keyword belongs to
  const pickedCandidate = candidates.find(c => c.keyword === parsed.targetKeyword) || candidates[0];
  const isPriorityGap   = pickedCandidate?.source === 'seed';
  const tier = isPriorityGap
    ? { tier: 'Priority Gap', color: '#dc2626', emoji: '🚨' }
    : getKeywordTier(pickedCandidate?.position || 50);

  await createApproval({
    type: 'blog_draft',
    brand,
    actor: 'claude (scheduler)',
    title: `Blog draft: ${parsed.title}`,
    reason: parsed.rationale || `Content gap for "${parsed.targetKeyword}"`,
    payload: {
      title:           parsed.title,
      metaDescription: parsed.metaDescription,
      description:     parsed.metaDescription,
      targetKeyword:   parsed.targetKeyword,
      slug:            parsed.slug,
      excerpt:         parsed.excerpt,
      body:            parsed.body,
      wpAction:        'create_draft',
      voiceScore:      voiceCheck.score,
      voiceIssues:     voiceCheck.issues,
      voiceTopFix:     voiceCheck.topFix,
      keywordTier:     tier.tier,
      tierColor:       tier.color,
      tierEmoji:       tier.emoji,
      currentPos:      pickedCandidate?.position,
      impressions:     pickedCandidate?.impressions,
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
