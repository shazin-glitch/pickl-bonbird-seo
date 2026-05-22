// netlify/functions/international-seo-background.js
// Background function (15min timeout) — generates localised SEO content
// for all international markets and queues to the approvals system.
//
// Runs: Monday 4:00am UTC = 8:00am Dubai time (same as main scheduler)
// Manual trigger: GET /.netlify/functions/international-seo-background?market=all
// Single market:  GET /.netlify/functions/international-seo-background?market=pickl_ksa
//
// Per market, per language, generates:
//   1. blog_draft  — localised blog post targeting primary keyword
//   2. page_update — meta title + description for the market landing page
//   3. onpage_suggestion — content improvement for the market page

const { getStore } = require('@netlify/blobs');
const { INTERNATIONAL_MARKETS, getMarketsForBrand, buildMarketPrompt, getWpCredentials, buildPostUrl } = require('./_lib/international-config');
const { getBrandContext, buildBrandPrompt, runBrandVoiceCheck } = require('./_lib/brand');

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL         = 'claude-sonnet-4-20250514';
const CACHE_TTL_MS  = 7 * 24 * 60 * 60 * 1000; // 7 days — don't regenerate weekly content

// ── Claude content generation ─────────────────────────────────────────────────
async function callClaude(systemPrompt, userPrompt) {
  const res = await fetch(ANTHROPIC_API, {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 1500,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ── Parse Claude's structured output ─────────────────────────────────────────
function parseSection(text, section) {
  const regex = new RegExp(`###\\s*${section}[\\s\\S]*?\\n([\\s\\S]*?)(?=###|$)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

// ── Generate blog draft for a market+language ─────────────────────────────────
async function generateBlogDraft(market, brandCtx, language) {
  const keywords = market.seedKeywords[language] || market.seedKeywords['en'];
  const primaryKw = keywords[0];
  const isArabic  = language === 'ar';
  const marketCtx = buildMarketPrompt(market, buildBrandPrompt(brandCtx), language);

  const userPrompt = `Write a blog post for ${market.brand === 'pickl' ? 'Pickl' : 'Bonbird'} in ${market.label}.

This is NOT generic SEO content. Every sentence must sound unmistakably like the brand — specific, sharp, on-brand.

${market.isNew ? `ANGLE: NEW OPENING — ${market.brand === 'pickl' ? 'Pickl' : 'Bonbird'} just opened in ${market.label} in May 2026. Lead with the energy of a new opening. Make locals feel like they need to go NOW.` : `TARGET KEYWORD: "${primaryKw}"`}

Language: ${isArabic ? 'Arabic (local dialect — NOT Modern Standard Arabic)' : 'English'}

CONTENT REQUIREMENTS:
- 450-600 words — tight and specific, zero filler
- Opening line: make someone stop scrolling — not "Are you looking for..."
- 3 sections (use H2 or flowing paragraphs): each must reference a real menu item by name, a real location in ${market.label}, or a specific brand truth
- 3 questions locals actually search — answer them the way the brand talks, not a textbook
- End: a CTA that sounds like the brand — not "visit us today for a great experience"
- Reference: ${market.locations.length > 0 ? market.locations.join(', ') : `our ${market.label} location`}

BRAND VOICE SELF-CHECK — run before returning:
□ Could any sentence appear on a competitor's website? If yes — rewrite it
□ Is at least one specific menu item named by its actual name?
□ Does the opening make someone curious or hungry?
□ Does the CTA sound like the brand?

Return EXACTLY this structure:

### TITLE
[50-60 chars — sounds like the brand, not generic]

### META_DESCRIPTION
[120-155 chars — specific detail that makes people click]

### SLUG
[lowercase-hyphens-only]

### CONTENT
[Full post — paragraphs or minimal H2s. Brand voice throughout. Every sentence earns its place.]

### FOCUS_KEYWORD
[Single primary keyword]`;

  const raw = await callClaude(marketCtx, userPrompt);
  const result = {
    title:           parseSection(raw, 'TITLE'),
    metaDescription: parseSection(raw, 'META_DESCRIPTION'),
    slug:            parseSection(raw, 'SLUG'),
    content:         parseSection(raw, 'CONTENT'),
    focusKeyword:    parseSection(raw, 'FOCUS_KEYWORD'),
  };

  // Brand voice quality check
  if (result.content) {
    const voiceCheck = await runBrandVoiceCheck(result.content, brandCtx, callClaude).catch(() => ({ score: 6, verdict: 'PASS', issues: [] }));
    result.voiceScore  = voiceCheck.score;
    result.voiceIssues = voiceCheck.issues;
    result.voiceTopFix = voiceCheck.topFix;
    console.log(`[intl-blog] ${market.label}/${language} — voice score: ${voiceCheck.score}/10 (${voiceCheck.verdict})`);
  }

  return result;
}

// ── Generate meta update for the market landing page ─────────────────────────
async function generateMetaUpdate(market, brandCtx, language) {
  const keywords = market.seedKeywords[language] || market.seedKeywords['en'];
  const isArabic  = language === 'ar';
  const marketCtx = buildMarketPrompt(market, buildBrandPrompt(brandCtx), language);

  const userPrompt = `Write an optimised meta title and meta description for the ${market.brand === 'pickl' ? 'Pickl' : 'Bonbird'} ${market.label} landing page.

URL: ${market.siteUrl}
Language: ${isArabic ? 'Arabic (local dialect)' : 'English'}
Top keywords to target: ${keywords.slice(0, 5).join(', ')}

Return EXACTLY this structure:

### META_TITLE
[50-60 characters. Include brand name and primary location keyword.]

### META_DESCRIPTION
[120-155 characters. Include a call to action. Include primary keyword. On-brand tone.]

### FOCUS_KEYWORD
[Single primary keyword]`;

  const raw = await callClaude(marketCtx, userPrompt);

  return {
    metaTitle:       parseSection(raw, 'META_TITLE'),
    metaDescription: parseSection(raw, 'META_DESCRIPTION'),
    focusKeyword:    parseSection(raw, 'FOCUS_KEYWORD'),
  };
}

// ── Generate on-page suggestion for market landing page ───────────────────────
async function generateOnPageSuggestion(market, brandCtx, language) {
  const keywords = market.seedKeywords[language] || market.seedKeywords['en'];
  const isArabic  = language === 'ar';
  const marketCtx = buildMarketPrompt(market, buildBrandPrompt(brandCtx), language);

  const userPrompt = `Analyse the ${market.brand === 'pickl' ? 'Pickl' : 'Bonbird'} ${market.label} landing page at ${market.siteUrl} and provide one specific on-page SEO improvement.

Language: ${isArabic ? 'Arabic (local dialect)' : 'English'}
Target keywords: ${keywords.slice(0, 5).join(', ')}
${market.isNew ? 'Note: This is a brand new market page — focus on establishing keyword relevance for the market.' : ''}

Return EXACTLY this structure:

### SUGGESTION_TITLE
[Short title for this suggestion, e.g. "Add H1 with location keyword"]

### SUGGESTION_DETAIL
[2-3 sentences explaining what to change, why it matters for SEO, and the expected impact. Be specific.]

### SUGGESTED_COPY
[The actual copy/text they should add or update — ready to use, on-brand tone, in the correct language]`;

  const raw = await callClaude(marketCtx, userPrompt);

  return {
    suggestionTitle:  parseSection(raw, 'SUGGESTION_TITLE'),
    suggestionDetail: parseSection(raw, 'SUGGESTION_DETAIL'),
    suggestedCopy:    parseSection(raw, 'SUGGESTED_COPY'),
  };
}

// ── Save to approvals queue via the approvals API ─────────────────────────────
async function queueApprovalItem(item) {
  const siteUrl = process.env.URL || 'https://yolkseo.netlify.app';

  // Build location tag: flag + country name
  const MARKET_FLAGS = {
    bahrain: '🇧🇭', ksa: '🇸🇦', qatar: '🇶🇦', egypt: '🇪🇬',
    jordan: '🇯🇴', oman: '🇴🇲', pakistan: '🇵🇰',
  };
  const flag        = MARKET_FLAGS[item.market] || '🌍';
  const locationTag = `${flag} ${item.marketLabel}`;
  const languageTag = (item.language || 'en').toUpperCase();

  const res = await fetch(`${siteUrl}/.netlify/functions/approvals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create',
      actor:  'claude',
      type:    item.type,
      brand:   item.brand,
      title:   item.title,
      reason:  item.notes || `International SEO — ${item.marketLabel} ${languageTag}`,
      payload: {
        // Core content
        title:           item.title,
        body:            item.content || '',
        content:         item.content || '',
        metaTitle:       item.meta?.metaTitle || item.title,
        metaDescription: item.meta?.metaDescription || '',
        // meta_update renders p.description — map both so dashboard shows it
        description:     item.meta?.metaDescription || '',
        slug:            item.meta?.slug || '',
        targetKeyword:   item.meta?.focusKeyword || '',
        focusKeyword:    item.meta?.focusKeyword || '',
        // International metadata
        market:          item.market,
        marketLabel:     item.marketLabel,
        language:        item.language,
        locationTag,
        languageTag,
        targetUrl:       item.targetUrl,
        url:             item.targetUrl,
        wpBase:          item.wpBase,
        wpUser:          item.wpUser,
        wpPass:          item.wpPass,
        wpParent:        item.wpParent,
        // Suggestion fields
        suggestionTitle:  item.suggestionTitle,
        suggestionDetail: item.suggestionDetail,
        suggestedCopy:    item.suggestedCopy,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`approvals API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.items?.[0]?.id || data.item?.id || 'queued';
}

// ── Check if market+language was recently processed ───────────────────────────
async function wasRecentlyProcessed(store, marketKey, language) {
  try {
    const key  = `intlSeoRun:${marketKey}:${language}`;
    const data = await store.get(key, { type: 'json' });
    if (!data) return false;
    return Date.now() - new Date(data.runAt).getTime() < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

async function markProcessed(store, marketKey, language) {
  const key = `intlSeoRun:${marketKey}:${language}`;
  await store.set(key, JSON.stringify({ runAt: new Date().toISOString() }));
}

// ── Process a single market+language ─────────────────────────────────────────
async function processMarketLanguage(store, marketKey, market, language, force = false) {
  const tag = `[intl-seo] ${marketKey}/${language}`;

  if (!force && await wasRecentlyProcessed(store, marketKey, language)) {
    console.log(`${tag} — skipped (processed within 7 days)`);
    return { skipped: true };
  }

  console.log(`${tag} — starting`);

  const brandCtx = await getBrandContext(market.brand);
  const queued   = [];
  const errors   = [];

  // 1. Blog draft — with keyword deduplication
  try {
    const blog = await generateBlogDraft(market, brandCtx, language);
    if (blog.title && blog.content) {
      // Check for duplicate keyword already pending in queue
      const siteUrl = process.env.URL || 'https://yolkseo.netlify.app';
      const existing = await fetch(`${siteUrl}/.netlify/functions/approvals?status=pending&brand=${market.brand}&type=blog_draft&limit=200`)
        .then(r => r.json()).catch(() => ({ items: [] }));
      const isDuplicate = (existing.items || []).some(i =>
        i.payload?.targetKeyword === blog.focusKeyword &&
        i.payload?.market === market.marketKey &&
        i.payload?.language === language
      );
      if (isDuplicate) {
        console.log(`${tag} — blog draft skipped (duplicate keyword: "${blog.focusKeyword}")`);
      } else {
        const wp = getWpCredentials(market);
        const id = await queueApprovalItem({
          type:        'blog_draft',
          brand:       market.brand,
          market:      market.marketKey,
          marketLabel: market.label,
          language,
          title:       blog.title,
          content:     blog.content,
          meta: {
            metaTitle:       blog.title,
            metaDescription: blog.metaDescription,
            slug:            blog.slug,
            focusKeyword:    blog.focusKeyword,
            voiceScore:      blog.voiceScore,
            voiceIssues:     blog.voiceIssues,
            voiceTopFix:     blog.voiceTopFix,
          },
          targetUrl:   buildPostUrl(market, 'blog_draft', blog.slug || 'post', language),
          wpBase:      wp.base,
          wpUser:      wp.user,
          wpPass:      wp.pass,
          wpParent:    market.wpMarketParent,
          notes: `International SEO — ${market.label} ${language.toUpperCase()} blog post. Target keyword: ${blog.focusKeyword}`,
        });
        queued.push({ type: 'blog_draft', id });
        console.log(`${tag} — blog draft queued: ${id}`);
      } // end dedup check
    }
  } catch (e) {
    console.error(`${tag} — blog draft failed:`, e.message);
    errors.push({ type: 'blog_draft', error: e.message });
  }

  // 2. Meta update for market landing page
  try {
    const meta = await generateMetaUpdate(market, brandCtx, language);
    if (meta.metaTitle && meta.metaDescription) {
      const wp = getWpCredentials(market);
      const id = await queueApprovalItem({
        type:        'meta_update',
        brand:       market.brand,
        market:      market.marketKey,
        marketLabel: market.label,
        language,
        title:       `Meta update — ${market.label} ${language.toUpperCase()} landing page`,
        meta: {
          metaTitle:       meta.metaTitle,
          metaDescription: meta.metaDescription,
          focusKeyword:    meta.focusKeyword,
        },
        targetUrl:   buildPostUrl(market, 'page', market.marketSlug, language),
        wpBase:      wp.base,
        wpUser:      wp.user,
        wpPass:      wp.pass,
        wpParent:    market.wpMarketParent,
        notes: `International SEO — optimised meta for ${market.label} page. Keyword: ${meta.focusKeyword}`,
      });
      queued.push({ type: 'meta_update', id });
      console.log(`${tag} — meta update queued: ${id}`);
    }
  } catch (e) {
    console.error(`${tag} — meta update failed:`, e.message);
    errors.push({ type: 'meta_update', error: e.message });
  }

  // 3. On-page suggestion
  try {
    const onpage = await generateOnPageSuggestion(market, brandCtx, language);
    if (onpage.suggestionTitle && onpage.suggestedCopy) {
      const wp = getWpCredentials(market);
      const id = await queueApprovalItem({
        type:        'onpage_suggestion',
        brand:       market.brand,
        market:      market.marketKey,
        marketLabel: market.label,
        language,
        title:       `${market.label} — ${onpage.suggestionTitle}`,
        content:     `${onpage.suggestionDetail}\n\n---\n\n**Suggested copy:**\n\n${onpage.suggestedCopy}`,
        targetUrl:   buildPostUrl(market, 'page', market.marketSlug, language),
        wpBase:      wp.base,
        wpUser:      wp.user,
        wpPass:      wp.pass,
        wpParent:    market.wpMarketParent,
        notes: `International SEO on-page suggestion for ${market.label} ${language.toUpperCase()}`,
      });
      queued.push({ type: 'onpage_suggestion', id });
      console.log(`${tag} — on-page suggestion queued: ${id}`);
    }
  } catch (e) {
    console.error(`${tag} — on-page suggestion failed:`, e.message);
    errors.push({ type: 'onpage_suggestion', error: e.message });
  }

  // Mark as processed
  await markProcessed(store, marketKey, language);

  return { queued, errors };
}

// ── Main handler ──────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  console.log(`[intl-seo] Starting — ${new Date().toISOString()}`);

  const store = getStore({
    name:   'seo-tool',
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  // Query params
  const marketParam = event.queryStringParameters?.market || 'all';
  const langParam   = event.queryStringParameters?.language || 'all';
  const force       = event.queryStringParameters?.force === 'true';

  // Determine which markets to run
  let marketsToRun = {};
  if (marketParam === 'all') {
    marketsToRun = INTERNATIONAL_MARKETS;
  } else if (marketParam === 'pickl') {
    marketsToRun = getMarketsForBrand('pickl');
  } else if (marketParam === 'bonbird') {
    marketsToRun = getMarketsForBrand('bonbird');
  } else if (INTERNATIONAL_MARKETS[marketParam]) {
    marketsToRun = { [marketParam]: INTERNATIONAL_MARKETS[marketParam] };
  } else {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Unknown market: ${marketParam}` }),
    };
  }

  const results = {};
  const summary = { total: 0, queued: 0, skipped: 0, errors: 0 };

  // Process each market sequentially to avoid Claude rate limits
  for (const [marketKey, market] of Object.entries(marketsToRun)) {
    results[marketKey] = {};

    const languagesToRun = langParam === 'all'
      ? market.languages
      : market.languages.filter(l => l === langParam);

    for (const language of languagesToRun) {
      summary.total++;
      try {
        const result = await processMarketLanguage(store, marketKey, market, language, force);
        results[marketKey][language] = result;
        if (result.skipped) {
          summary.skipped++;
        } else {
          summary.queued  += result.queued?.length  || 0;
          summary.errors  += result.errors?.length  || 0;
        }
      } catch (e) {
        console.error(`[intl-seo] ${marketKey}/${language} fatal error:`, e.message);
        results[marketKey][language] = { error: e.message };
        summary.errors++;
      }
    }
  }

  console.log('[intl-seo] Complete.', summary);

  // Send Slack notification if items were queued
  if (summary.queued > 0) {
    try {
      const siteUrl = process.env.URL || 'https://yolkseo.netlify.app';
      await fetch(`${siteUrl}/.netlify/functions/slack-notify`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          type:  'international_queue',
          count: summary.queued,
          items: [],
          market: { label: marketParam === 'all' ? 'All Markets' : marketParam, flag: '🌍' },
        }),
      });
    } catch (e) {
      console.warn('[intl-seo] Slack notification failed:', e.message);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      summary,
      results,
      completedAt: new Date().toISOString(),
    }),
  };
};
