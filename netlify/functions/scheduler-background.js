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
const { getBrandContext, buildBrandPrompt, runBrandVoiceCheck, fixBrandVoice, getBrandExamples } = require('./_lib/brand');
const { getStore } = require('@netlify/blobs');

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

// ── Market detection — infers location tag from page URL ──────────────────────
// Checks URL path patterns for each brand's international markets.
// Falls back to UAE (home market) if no pattern matches.
function getLocationTag(url, brand) {
  if (!url) return '🇦🇪 UAE';
  const lower = url.toLowerCase();

  if (brand === 'pickl' || lower.includes('eatpickl')) {
    if (lower.includes('/bh/')  || lower.includes('/bh?')  || lower.endsWith('/bh')  || lower.includes('bh.eatpickl'))  return '🇧🇭 Bahrain';
    if (lower.includes('/ksa/') || lower.includes('/ksa?') || lower.endsWith('/ksa') || lower.includes('ksa.eatpickl')) return '🇸🇦 Saudi Arabia';
    if (lower.includes('/qatar/') || lower.endsWith('/qatar') || lower.includes('qatar.eatpickl'))                      return '🇶🇦 Qatar';
    if (lower.includes('/egypt/') || lower.endsWith('/egypt') || lower.includes('egypt.eatpickl'))                      return '🇪🇬 Egypt';
    if (lower.includes('/pickl-jordan') || lower.includes('jordan.eatpickl'))                                           return '🇯🇴 Jordan';
    if (lower.includes('/oman/') || lower.endsWith('/oman') || lower.includes('oman.eatpickl'))                         return '🇴🇲 Oman';
  }

  if (brand === 'bonbird' || lower.includes('bonbird')) {
    if (lower.includes('/oman/') || lower.endsWith('/oman') || lower.includes('oman.bonbird'))         return '🇴🇲 Oman';
    if (lower.includes('/pakistan/') || lower.endsWith('/pakistan') || lower.includes('pak.bonbird'))  return '🇵🇰 Pakistan';
    if (lower.includes('/qatar/') || lower.endsWith('/qatar') || lower.includes('qatar.bonbird'))      return '🇶🇦 Qatar';
  }

  return '🇦🇪 UAE';
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

// Pages already with a pending item of a given type — prevents duplicate meta updates
async function getQueuedPages(brand, type) {
  const pending = await listApprovals({ brand, limit: 200 });
  const pages = new Set();
  for (const item of pending) {
    if (item.type !== type) continue;
    const url = item.payload?.url;
    if (url) pages.add(url.toLowerCase().replace(/\/$/, ''));
  }
  return pages;
}

// Returns false if keyword mentions a dish that doesn't exist on the brand's menu
// Prevents hallucinated content like "butter chicken rice bowl" for Bonbird
function keywordMatchesMenu(keyword, brandCtx) {
  if (!brandCtx?.menu) return true;
  const kw       = keyword.toLowerCase();
  const menuText = JSON.stringify(brandCtx.menu).toLowerCase();
  // Specific dishes that must be in the menu if mentioned in the keyword
  const specificDishes = [
    'butter chicken', 'biryani', 'kebab', 'shawarma', 'pizza', 'pasta',
    'fish', 'shrimp', 'lamb', 'steak', 'hummus', 'falafel', 'sushi',
    'tacos', 'burritos', 'noodles', 'ramen', 'dumplings',
  ];
  for (const dish of specificDishes) {
    if (kw.includes(dish) && !menuText.includes(dish)) {
      console.log(`[keyword filter] SKIP "${keyword}" — mentions "${dish}" which is not on the menu`);
      return false;
    }
  }
  return true;
}

// Returns false if the keyword's location intent clearly doesn't match the page URL
// e.g. keyword "bonbird mirdif" should NOT be used to write meta for /dubai/ page
function keywordMatchesPageUrl(keyword, pageUrl) {
  const kw   = keyword.toLowerCase().replace(/-/g, ' ');
  const slug = pageUrl.replace(/^https?:\/\/[^\/]+/, '').replace(/^\/|\/$/g, '')
                      .replace(/-/g, ' ').toLowerCase();

  const locations = [
    'dubai', 'mirdif', 'motor city', 'city walk', 'aljada', 'sharjah',
    'abu dhabi', 'jlt', 'jumeirah', 'marina', 'deira', 'bur dubai',
    'bahrain', 'riyadh', 'jeddah', 'cairo', 'amman', 'muscat', 'doha',
    'lahore', 'karachi', 'london', 'manchester',
  ];

  for (const loc of locations) {
    if (kw.includes(loc) && slug.length > 0 && !slug.includes(loc)) {
      // Keyword mentions a location that doesn't appear in the page slug
      console.log(`[keyword filter] SKIP "${keyword}" for "${pageUrl}" — location "${loc}" doesn't match page slug`);
      return false;
    }
  }
  return true;
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
      const brandExamples = await getBrandExamples(brand).catch(() => null);
      const brandPrompt = buildBrandPrompt(brandCtx, brandExamples);
      const gscRows = await fetchGscRows(BRANDS[brand].gsc);
      summary.brands[brand].gscRows = gscRows.length;

      // Enrich GSC rows with real CPC data from DataForSEO (~$0.008/week for 150 keywords)
      // Runs silently — failure doesn't block content generation
      await enrichGscWithCpc(brand, gscRows, BRANDS[brand]).catch(e =>
        console.warn(`[scheduler] CPC enrichment failed for ${brand} (non-critical):`, e.message)
      );

      // Track published items — update position movement for everything published in last 8 weeks
      await trackPublishedItems(brand, gscRows).catch(e =>
        console.warn(`[scheduler] Tracking update failed for ${brand} (non-critical):`, e.message)
      );

      // Background mode: run ALL requested jobs, no timeout concern
      // Priority: keyword opportunities first, then GSC-based jobs
      for (const jobName of jobs) {
        try {
          let r;
          if (jobName === 'quick_wins')    r = await runQuickWins(brand, gscRows, dryRun, forceRun, brandCtx, brandPrompt);
          else if (jobName === 'meta_rewrites') r = await runMetaRewrites(brand, gscRows, dryRun, forceRun, brandCtx, brandPrompt);
          else if (jobName === 'content_gaps')  r = await runContentGapsWithOpportunities(brand, gscRows, dryRun, forceRun, brandCtx, brandPrompt);
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

  // Send Slack notification per brand with per-item detail
  if (summary.queued > 0) {
    const siteUrl = process.env.URL || 'https://yolkseo.netlify.app';
    for (const brand of brandsToRun) {
      try {
        const brandSummary = summary.brands[brand];
        if (!brandSummary) continue;

        // Collect item snapshots from each job
        const items = [];
        for (const [jobName, jobResult] of Object.entries(brandSummary.jobs || {})) {
          for (const item of (jobResult.items || [])) {
            items.push(item);
          }
        }

        const brandCount = Object.values(brandSummary.jobs || {}).reduce((s, j) => s + (j.queued || 0), 0);
        if (brandCount === 0) continue;

        await fetch(`${siteUrl}/.netlify/functions/slack-notify`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ type: 'queue_summary', brand, count: brandCount, items }),
        });
      } catch (e) {
        console.warn(`[scheduler] Slack notification failed for ${brand}:`, e.message);
      }
    }
  }

  // Background functions return nothing — client already got 202
};

// ── GSC fetchll, no internal HTTP hop ───────────
async function fetchGscRows(siteUrl) {
  try {
    const rows = await fetchGscDirect(siteUrl);
    // Save weekly snapshot — enables week-on-week ranking movement tracking
    // Key: gscSnapshot:<brand>:<YYYY-MM-DD> — saved once per day, never overwritten
    try {
      const dateKey   = new Date().toISOString().split('T')[0];
      const brand     = siteUrl.includes('pickl') ? 'pickl' : 'bonbird';
      const snapKey   = `gscSnapshot:${brand}:${dateKey}`;
      const existing  = await getSetting(snapKey).catch(() => null);
      if (!existing) {
        await setSetting(snapKey, { rows, savedAt: Date.now(), brand, siteUrl });
        console.log(`[scheduler] GSC snapshot saved: ${snapKey} (${rows.length} keywords)`);
      }
    } catch (snapErr) {
      console.warn('[scheduler] Snapshot save failed (non-critical):', snapErr.message);
    }
    return rows;
  } catch (e) {
    console.error('GSC fetch failed for', siteUrl, ':', e.message);
    return [];
  }
}

// ── Track published items — update position movement ─────────────────────────
// Runs every Monday after GSC fetch. For each item published in last 8 weeks,
// finds current GSC position for the target keyword and updates the item with
// positionLatest + positionDelta so the Published & Tracking tab shows movement.
async function trackPublishedItems(brand, gscRows) {
  const s     = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
  const EIGHT_WEEKS = 8 * 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - EIGHT_WEEKS;

  // Build keyword → position map from current GSC data
  const kwPosMap = {};
  const kwClicksMap = {};
  for (const row of gscRows) {
    if (row.keyword) {
      kwPosMap[row.keyword.toLowerCase()]    = row.position;
      kwClicksMap[row.keyword.toLowerCase()] = row.clicks || 0;
    }
  }

  // Load GSC token for URL Inspection (fetchGscDirect already refreshed it earlier this run)
  const gscTokenData = await s.get('gscTokens', { type: 'json' }).catch(() => null);
  const gscToken     = gscTokenData?.access_token || null;
  const siteUrl      = brand === 'pickl' ? 'https://eatpickl.com/' : 'https://bonbirdchicken.com/';

  // Get all approval items for this brand with status pushed/published
  const indexRaw = await s.get('approvals:index', { type: 'json' }).catch(() => null);
  const index    = Array.isArray(indexRaw) ? indexRaw : [];

  let tracked = 0;
  for (const id of index) {
    try {
      const item = await s.get(`approvals:item:${id}`, { type: 'json' }).catch(() => null);
      if (!item) continue;
      if (item.brand !== brand) continue;
      if (!['pushed', 'published'].includes(item.status)) continue;
      if (!item.trackingKeyword) continue;
      if (item.publishedAt && item.publishedAt < cutoff) continue; // older than 8 weeks

      const kw     = item.trackingKeyword.toLowerCase();
      const posNow = kwPosMap[kw] ? Math.round(kwPosMap[kw] * 10) / 10 : null;
      const clicks = kwClicksMap[kw] || null;

      const patch = { ...item, lastTrackedAt: Date.now() };

      if (posNow) {
        const delta = item.positionAtPublish
          ? Math.round((item.positionAtPublish - posNow) * 10) / 10
          : null;
        patch.positionLatest = posNow;
        patch.positionDelta  = delta;
        patch.clicksLatest   = clicks;
        tracked++;
      }

      // URL Inspection — only for live published pages (not WP drafts)
      if (item.status === 'published' && gscToken) {
        const inspectUrl = item.publishResult?.ref || item.payload?.url || null;
        if (inspectUrl && inspectUrl.startsWith('http')) {
          try {
            const inspRes = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gscToken}` },
              body:    JSON.stringify({ inspectionUrl: inspectUrl, siteUrl }),
            });
            const inspData = await inspRes.json();
            const idx = inspData?.inspectionResult?.indexStatusResult;
            if (idx) {
              patch.indexStatus = {
                verdict:        idx.verdict        || null,
                coverageState:  idx.coverageState  || null,
                lastCrawlTime:  idx.lastCrawlTime  || null,
                pageFetchState: idx.pageFetchState || null,
                url:            inspectUrl,
                checkedAt:      Date.now(),
              };
            }
          } catch (e) {
            console.warn(`[scheduler] URL inspection failed for ${id}:`, e.message);
          }
        }
      }

      await s.set(`approvals:item:${id}`, JSON.stringify(patch));
    } catch { /* skip individual failures */ }
  }

  console.log(`[scheduler] Tracking updated for ${brand}: ${tracked} items`);
}
// Fetches real Google Ads CPC for the top non-branded GSC keywords.
// Cost: ~$0.05 per 1,000 keywords (≈ $0.008/week for 150 keywords).
// Results merged back into gscCache so the Reports tab picks them up automatically.
// Branded keywords are excluded — their CPC is near zero (no advertisers bid on brand terms).
async function enrichGscWithCpc(brand, rows, brandConfig) {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return; // no credentials — skip silently

  const BRAND_TERMS = brand === 'pickl' ? ['pickl'] : ['bonbird'];
  const AED_PER_USD = 3.67;

  // All non-branded keywords — DataForSEO Keywords Data API accepts up to 700 per task
  // Cost: ~$0.05 per 1,000 keywords. Enriching 500 keywords costs $0.025. Negligible.
  const toEnrich = rows
    .filter(r => r.keyword && !BRAND_TERMS.some(t => r.keyword.toLowerCase().includes(t)))
    .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
    .slice(0, 700) // DataForSEO hard limit per task — batch if ever exceeded
    .map(r => r.keyword);

  if (!toEnrich.length) return;

  const authHeader = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
  const KW_POST_URL = 'https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/task_post';

  // POST — one task for all keywords (DataForSEO supports up to 700 per task)
  const postRes = await fetch(KW_POST_URL, {
    method:  'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body:    JSON.stringify([{
      keywords:      toEnrich,
      location_code: 2784, // UAE
      language_code: 'en',
      tag:           `yolkseo_cpc_${brand}`,
    }]),
  });

  if (!postRes.ok) throw new Error(`CPC task_post HTTP ${postRes.status}`);
  const postData = await postRes.json();
  const taskId   = postData.tasks?.[0]?.id;
  if (!taskId) throw new Error('CPC task_post returned no task ID');

  console.log(`[scheduler] CPC enrichment task posted for ${brand}: ${taskId} (${toEnrich.length} keywords)`);

  // Poll — same pattern as competitor matrix
  const KW_GET_URL = `https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/task_get/${taskId}`;
  const cpcMap = {};

  for (let attempt = 0; attempt < 24; attempt++) { // max 2 minutes
    await new Promise(r => setTimeout(r, 5000));
    const getRes  = await fetch(KW_GET_URL, { headers: { Authorization: authHeader } });
    const getData = await getRes.json();
    const task    = getData.tasks?.[0];

    if (task?.status_code === 20000 && task.result) {
      for (const item of task.result) {
        if (item.keyword && item.cpc != null) {
          cpcMap[item.keyword.toLowerCase()] = item.cpc; // USD
        }
      }
      console.log(`[scheduler] CPC enrichment complete for ${brand}: ${Object.keys(cpcMap).length}/${toEnrich.length} keywords got CPC data`);
      break;
    }

    if (attempt === 23) console.warn(`[scheduler] CPC task timed out for ${brand}`);
  }

  if (!Object.keys(cpcMap).length) return;

  // Merge CPC into gscCache rows and re-save cache
  // The Reports tab reads from gscCache — this way CPC is available immediately
  const s = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });

  const cacheKey = 'gscCache:' + brandConfig.gsc;
  const existing = await s.get(cacheKey, { type: 'json' }).catch(() => null);
  if (!existing?.rows) return;

  const enrichedRows = existing.rows.map(r => ({
    ...r,
    cpc_usd: cpcMap[r.keyword?.toLowerCase()] ?? r.cpc_usd ?? null,
    cpc_aed: cpcMap[r.keyword?.toLowerCase()] != null
      ? Math.round(cpcMap[r.keyword.toLowerCase()] * AED_PER_USD * 100) / 100
      : r.cpc_aed ?? null,
  }));

  await s.setJSON(cacheKey, { ...existing, rows: enrichedRows, cpcEnrichedAt: Date.now() });
  console.log(`[scheduler] gscCache updated with CPC data for ${brand}`);
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
    // Skip keywords referencing dishes not on the menu (prevents hallucinated content)
    .filter(r => keywordMatchesMenu(r.keyword, brandCtx))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, forceRun ? 3 : 1);
  if (!candidates.length) return { queued: 0, candidates: 0, skipped: 'all candidates already queued' };

  if (dryRun) return { queued: 0, candidates: candidates.length, preview: candidates.map(r => r.keyword) };

  let queued = 0;
  const items = []; // item snapshots for Slack
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

    // Brand voice check — auto-fix if score is 5-7 before queuing
    let voiceCheck = await runBrandVoiceCheck(parsed.body, brandCtx, (p, o) => callClaude(p, o)).catch(() => ({ score: 6, verdict: 'PASS' }));
    if (voiceCheck.score >= 5 && voiceCheck.score < 8) {
      const fixed = await fixBrandVoice(parsed.body, voiceCheck, brandCtx, (p, o) => callClaude(p, o));
      if (fixed.improved) { parsed.body = fixed.content; voiceCheck = fixed.voiceCheck; }
    }
    console.log(`[quick_wins] ${r.keyword} — voice score: ${voiceCheck.score}/10 (${voiceCheck.verdict})`);
    if (voiceCheck.score < 5) { console.warn(`[quick_wins] Score too low after fix attempt — skipping`); continue; }

    if (dryRun) { queued++; continue; }

    const tier = getKeywordTier(r.position);
    await createApproval({
      type: 'page_update',
      brand,
      actor: 'claude (scheduler)',
      locationTag: getLocationTag(parsed.url || r.page, brand),
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
    items.push({ type: 'page_update', title: parsed.title || r.keyword, keyword: r.keyword, position: r.position, voiceScore: voiceCheck.score, tier: tier.tier });
    queued++;
  }
  return { queued, candidates: candidates.length, items };
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

  const expected     = pos => Math.max(0.005, 0.30 / pos);  // decimal: pos1=0.30, pos5=0.06, pos10=0.03
  const alreadyQueued      = await getQueuedKeywords(brand);
  const alreadyQueuedPages = await getQueuedPages(brand, 'meta_update');

  const candidates = Object.values(pageMap)
    .filter(r => r.position <= 20 && r.impressions >= 100)
    .map(r => ({ ...r, ctrGap: expected(r.position) - r.ctr }))
    .filter(r => r.ctrGap > 0.015)
    // ── Quality filters ────────────────────────────────────────────────────
    // 1. Don't re-queue keywords already pending
    .filter(r => forceRun || !alreadyQueued.has(r.keyword.toLowerCase().trim()))
    // 2. Don't re-queue pages that already have a pending meta_update
    .filter(r => forceRun || !alreadyQueuedPages.has(r.page.toLowerCase().replace(/\/$/, '')))
    // 3. Skip keywords that mention dishes not on the brand's menu
    .filter(r => keywordMatchesMenu(r.keyword, brandCtx))
    // 4. Skip keywords whose location doesn't match the page URL
    .filter(r => keywordMatchesPageUrl(r.keyword, r.page))
    .sort((a, b) => b.ctrGap - a.ctrGap)
    .slice(0, forceRun ? 6 : 4);

  if (!candidates.length) return { queued: 0, candidates: 0, skipped: 'no low-CTR candidates found' };
  if (dryRun) return { queued: 0, candidates: candidates.length, preview: candidates.map(r => r.keyword + ' → ' + r.page) };

  // Validate each page has actual content in WordPress before queuing
  const validCandidates    = [];
  const pageCreationNeeded = [];

  for (const r of candidates) {
    const hasContent = await wpPageHasContent(brand, r.page);
    if (hasContent) {
      validCandidates.push(r);
    } else {
      console.log(`[meta_rewrites] ${r.page} — empty/missing in WP. Impressions: ${r.impressions}`);
      // High impressions on a missing/empty page = Google wants to rank it but there's nothing there
      if (r.impressions >= 100) {
        pageCreationNeeded.push(r);
      }
    }
  }

  // Queue page_creation items for empty pages with real traffic potential
  for (const r of pageCreationNeeded) {
    try {
      const systemPrompt = brandPrompt || buildBrandPrompt(brandCtx);
      const brandName    = brandCtx?.name || cfg.name;
      const { text } = await callClaude(`
Create a full landing page for ${brandName} targeting the keyword "${r.keyword}".
This page gets ${r.impressions} impressions from Google but currently has no content — that's a missed opportunity.

Requirements:
- H1 leads naturally with "${r.keyword}"
- 3 H2 sections covering the keyword topic with specific ${brandName} context
- FAQ with 3 questions people actually search
- Internal links to /menu, /locations
- Image placeholder comments: <!-- IMAGE: [specific description] -->
- 500-700 words total
- CTA that sounds like ${brandName}

Return ONLY valid JSON:
{
  "title": "SEO title 55-60 chars",
  "description": "Meta description 150-158 chars",
  "targetKeyword": "${r.keyword}",
  "slug": "url-slug",
  "pageHeading": "H1 text",
  "excerpt": "short description",
  "body": "<full HTML content>",
  "rationale": "why this page will rank"
}`, { max_tokens: 1800, system: systemPrompt });

      const parsed = extractJson(text);
      if (!parsed?.body) continue;

      let voiceCheck = await runBrandVoiceCheck(parsed.body, brandCtx, (p, o) => callClaude(p, o)).catch(() => ({ score: 6, verdict: 'PASS', issues: [] }));
      if (voiceCheck.score >= 5 && voiceCheck.score < 8) {
        const fixed = await fixBrandVoice(parsed.body, voiceCheck, brandCtx, (p, o) => callClaude(p, o));
        if (fixed.improved) { parsed.body = fixed.content; voiceCheck = fixed.voiceCheck; }
      }
      if (voiceCheck.score < 5) continue;

      await createApproval({
        type:  'page_creation',
        brand,
        actor: 'claude (scheduler)',
        title: `New page opportunity: "${r.keyword}" — ${r.impressions} impressions, no content`,
        reason: `GSC shows ${r.impressions} impressions for "${r.keyword}" but the page doesn't exist or is empty. Creating it could capture significant traffic.`,
        payload: {
          url:           r.page,
          title:         parsed.title,
          description:   parsed.description,
          targetKeyword: parsed.targetKeyword || r.keyword,
          slug:          parsed.slug,
          pageHeading:   parsed.pageHeading,
          excerpt:       parsed.excerpt,
          body:          parsed.body,
          pageType:      'seo',
          wpAction:      'create_page',
          voiceScore:    voiceCheck.score,
          impressions:   r.impressions,
          currentPos:    r.position,
        },
      });
      console.log(`[meta_rewrites] Queued page_creation for ${r.page} (${r.impressions} impressions)`);
    } catch (e) {
      console.error('[meta_rewrites] page_creation error for', r.page, ':', e.message);
    }
  }

  if (!validCandidates.length) return { queued: 0, candidates: candidates.length, pageCreationQueued: pageCreationNeeded.length, skipped: 'all candidates failed WP content check' };

  const systemPrompt = brandPrompt || buildBrandPrompt(brandCtx);
  const brandName    = brandCtx?.name || cfg.name;
  const menuItems    = brandCtx?.menu ? [
    ...(brandCtx.menu.cheeseburgers || []).slice(0, 3),
    ...(brandCtx.menu.chickenSandos || brandCtx.menu.sandwiches || []).slice(0, 2),
    ...(brandCtx.menu.friesAndSides || brandCtx.menu.sides || []).slice(0, 2),
  ].join(' | ') : '';

  // Fetch current Yoast meta for every candidate BEFORE calling Claude
  // so Claude can evaluate whether a replacement is actually needed
  const base = process.env.NETLIFY_URL || 'https://yolkseo.netlify.app';
  const currentMetaMap = {};
  for (const r of validCandidates) {
    try {
      const cmRes = await fetch(`${base}/.netlify/functions/wordpress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_current_meta', brand, payload: { url: r.page } }),
      });
      const cmData = await cmRes.json().catch(() => null);
      if (cmData?.found) {
        currentMetaMap[r.page] = { title: cmData.currentTitle || null, description: cmData.currentDesc || null };
      }
    } catch (_) { /* non-critical — proceed without current meta for this page */ }
  }

  const userPrompt = `You are auditing ${brandName} pages that rank well on Google but have below-expected CTR.

YOUR JOB: For each page, decide if the current meta is already good enough OR if it genuinely needs improvement.
Only suggest a replacement if the current meta is vague, generic, or missing. If it's already specific and on-brand — skip it.

RULES for any replacement you write — non-negotiable:
- Title: 52-58 characters exactly — count them
- Description: 150-158 characters exactly — count them
- Only reference REAL menu items: ${menuItems || 'use items from brand context'}
- No generic phrases: "great food", "delicious", "best in Dubai", "quality ingredients"
- Lead with the keyword, end with a reason to click
- Write specifically about what the PAGE is about (the URL tells you the topic — /sharjah/ = Sharjah page, etc.)
- ONLY mention dishes that appear in YOUR MENU. If keyword implies an off-menu dish, pivot to the closest real one.

PAGES TO EVALUATE:
${validCandidates.map((r, i) => {
  const cur = currentMetaMap[r.page];
  const curBlock = cur
    ? `  Current title: "${cur.title || 'NOT SET'}"\n  Current desc:  "${cur.description || 'NOT SET'}"`
    : `  Current meta: unknown (couldn't fetch from WordPress)`;
  return `${i+1}. URL: "${r.page}"
  Keyword: "${r.keyword}" | Position: ${r.position} | CTR: ${(r.ctr * 100).toFixed(1)}% | ${r.impressions} impressions
${curBlock}`;
}).join('\n\n')}

Return ONLY a JSON array. For pages that don't need changing, set "skip": true.
[{
  "keyword": "...",
  "url": "exact URL from input — do not change",
  "skip": false,
  "skipReason": "only if skip=true — why the current meta is already good",
  "title": "52-58 chars — only if skip=false",
  "description": "150-158 chars — only if skip=false",
  "targetKeyword": "...",
  "rationale": "one sentence — why current meta underperforms AND why yours is better"
}]`;

  const { text } = await callClaude(userPrompt, { max_tokens: 2000, system: systemPrompt });
  const parsed = extractJson(text);
  if (!Array.isArray(parsed)) return { queued: 0, candidates: validCandidates.length, error: 'Claude did not return JSON array' };

  let queued = 0;
  let skipped = 0;
  const items = [];
  for (const p of parsed) {
    // Skip pages Claude determined don't need improving
    if (p.skip) {
      console.log(`[meta_rewrites] skipping ${p.url} — ${p.skipReason || 'already good'}`);
      skipped++;
      continue;
    }

    // Use matched real URL, fallback to Claude's URL only if it matches a known candidate
    const matched  = validCandidates.find(r => r.page === p.url || r.keyword === p.keyword);
    const finalUrl = matched ? matched.page : null;
    if (!finalUrl) { console.warn('[meta_rewrites] Claude returned unknown URL, skipping:', p.url); continue; }

    const currentMeta = currentMetaMap[finalUrl] || null;

    await createApproval({
      type:  'meta_update',
      brand,
      actor: 'claude (scheduler)',
      locationTag: getLocationTag(finalUrl, brand),
      reason: p.rationale || 'Low CTR vs expected for current ranking position',
      payload: {
        url:           finalUrl,
        title:         p.title,
        description:   p.description,
        targetKeyword: p.targetKeyword || p.keyword,
        currentPos:    matched?.position,
        impressions:   matched?.impressions,
        ctrGap:        matched?.ctrGap != null ? (matched.ctrGap * 100).toFixed(1) : null,
        wpAction:      'update_meta',
        currentMeta,
      },
    });
    items.push({ type: 'meta_update', title: p.title || finalUrl, keyword: p.keyword, position: matched?.position, impressions: matched?.impressions });
    queued++;
  }
  return { queued, skipped, candidates: validCandidates.length, items };
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
// Wrapper: inject keyword opportunities as high-priority seed keywords
async function runContentGapsWithOpportunities(brand, rows, dryRun, forceRun, brandCtx, brandPrompt) {
  const s = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
  try {
    const oppData = await s.get(`keywordOpportunities:${brand}`, { type: 'json' }).catch(() => null);
    if (oppData?.opportunities?.length) {
      // Top 10 content gap / push opportunities → inject into seed keywords so runContentGaps picks them up
      const topGaps = oppData.opportunities
        .filter(k => ['content_gap', 'push'].includes(k.tier))
        .slice(0, 10)
        .map(k => k.keyword);
      if (topGaps.length) {
        console.log(`[${brand}] Injecting ${topGaps.length} keyword opportunities into content gaps`);
        const existing = await loadSeedKeywords(brand);
        const merged   = [...new Set([...topGaps, ...existing])];
        await s.setJSON(`seedKeywords:${brand}`, merged);
      }
    }
  } catch (e) { console.warn(`[${brand}] opportunities inject failed: ${e.message}`); }
  return runContentGaps(brand, rows, dryRun, forceRun, brandCtx, brandPrompt);
}

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

  // Brand voice quality gate — auto-fix if in warning zone, then score
  let voiceCheck = await runBrandVoiceCheck(parsed.body, brandCtx, (p, o) => callClaude(p, o)).catch(() => ({ score: 6, verdict: 'PASS', issues: [] }));
  if (voiceCheck.score >= 5 && voiceCheck.score < 8) {
    const fixed = await fixBrandVoice(parsed.body, voiceCheck, brandCtx, (p, o) => callClaude(p, o));
    if (fixed.improved) { parsed.body = fixed.content; voiceCheck = fixed.voiceCheck; }
  }
  console.log(`[content_gaps] "${parsed.targetKeyword}" — voice score: ${voiceCheck.score}/10 (${voiceCheck.verdict})`);

  if (voiceCheck.score < 5) {
    console.warn(`[content_gaps] Score ${voiceCheck.score}/10 after fix attempt — too low to queue.`);
    return { queued: 0, candidates: candidates.length, error: `Brand voice score too low (${voiceCheck.score}/10) after auto-fix attempt — not queued.` };
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
    locationTag: '🇦🇪 UAE',
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
      currentPos:      pickedCandidate?.position    || null,
      impressions:     pickedCandidate?.impressions  || null,
      isSeedKeyword:   !pickedCandidate?.position, // true when from seed list — no GSC data yet
    },
  });
  return { queued: 1, candidates: candidates.length, items: [{ type: 'blog_draft', title: parsed.title, keyword: parsed.targetKeyword, position: pickedCandidate?.position, voiceScore: voiceCheck.score, tier: tier.tier }] };
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
  const items = [];
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

    const systemPrompt = brandPrompt || buildBrandPrompt(brandCtx);
    const { text } = await callClaude(prompt, { max_tokens: 1800, system: systemPrompt });
    const parsed = extractJson(text);
    if (!parsed || !parsed.body || !parsed.title) continue;
    if (dryRun) { queued++; continue; }

    // Voice quality gate — auto-fix if in warning zone
    let voiceCheck = await runBrandVoiceCheck(parsed.body, brandCtx, (p, o) => callClaude(p, o))
      .catch(() => ({ score: 6, verdict: 'PASS', issues: [], topFix: null }));
    if (voiceCheck.score >= 5 && voiceCheck.score < 8) {
      const fixed = await fixBrandVoice(parsed.body, voiceCheck, brandCtx, (p, o) => callClaude(p, o));
      if (fixed.improved) { parsed.body = fixed.content; voiceCheck = fixed.voiceCheck; }
    }
    console.log(`[page_creation] "${r.keyword}" — voice score: ${voiceCheck.score}/10 (${voiceCheck.verdict})`);
    if (voiceCheck.score < 5) {
      console.warn(`[page_creation] Score ${voiceCheck.score}/10 too low — not queued`);
      continue;
    }

    const tier = getKeywordTier(r.position);
    await createApproval({
      type:  'page_creation',
      brand,
      actor: 'claude (scheduler)',
      title: `New page: ${parsed.title}`,
      reason: parsed.rationale || `New landing page for "${r.keyword}" (${r.impressions} impressions, pos ${r.position})`,
      locationTag: getLocationTag(r.page, brand),
      payload: {
        title:         parsed.title,
        description:   parsed.description,
        targetKeyword: parsed.targetKeyword || r.keyword,
        slug:          parsed.slug,
        pageHeading:   parsed.pageHeading,
        excerpt:       parsed.excerpt,
        body:          parsed.body,
        pageType:      parsed.pageType || 'location',
        currentPos:    r.position,
        impressions:   r.impressions,
        wpAction:      'create_page',
        voiceScore:    voiceCheck.score,
        voiceIssues:   voiceCheck.issues,
        voiceTopFix:   voiceCheck.topFix,
        keywordTier:   tier.tier,
        tierColor:     tier.color,
        tierEmoji:     tier.emoji,
      },
    });
    items.push({ type: 'page_creation', title: parsed.title, keyword: r.keyword, position: r.position, voiceScore: voiceCheck.score });
    queued++;
  }
  return { queued, candidates: candidates.length, items };
}
