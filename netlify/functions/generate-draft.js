// netlify/functions/generate-draft.js
// ─────────────────────────────────────────────────────────────────────────────
// On-demand, HUMAN-DRIVEN content generation from the worklist (North Star, 19 Jul).
// This is THE content path now that autonomous scheduler generation is OFF. Given ONE
// triaged opportunity, it generates NOW and drops a DRAFT in the Approvals Queue —
// it never auto-publishes (human gate intact).
//
// Dispatches by actionType, config-driven (reads brand voice + vertical from config):
//   meta_update    → optimise an existing page's SEO title + description   (safest, done)
//   page_creation  → draft a NEW landing/location page (title, slug, HTML, meta)
//   blog_draft     → draft a NEW blog/journal post (title, slug, HTML, meta)
//
// CONFIDENCE GATE: high/med → Generate (AI). low → the caller should route to 📋 Perch
//   (human). If a low-confidence call reaches here it returns { routeToPerch:true } and
//   generates nothing (no wasted Claude spend / wrong-target noise).
//
// Every queued item is LABELLED with what it is (payload.generatedType + item.title
// prefix) so the queue reads clearly.
//
//   POST { brand, keyword, url?, market?, actionType?, confidence?, competitorPage? }
//     → { ok, skipped?, routeToPerch?, item }

const { getBrandContext, getBrandExamples, getBrandFeedback, buildBrandPrompt, runBrandVoiceCheck, hardStripBannedTokens } = require('./_lib/brand');
const { callClaude, extractJson, createApproval, fetchGscWithPages } = require('./_lib/store');
const { getBrand, getVertical, gscPropertyFor } = require('./_lib/brands-config');
const { gatherIntelligence, routeAction } = require('./_lib/content-pipeline');
const { metaLengthRule, metaLenIssues } = require('./_lib/seo-meta');
const { INTERNATIONAL_MARKETS } = require('./_lib/international-config');
const { authorize, denied, internalHeaders } = require('./_lib/auth');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SITE = process.env.NETLIFY_URL || process.env.URL || 'https://yolkseo.netlify.app';
const json = (status, body) => ({ statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const VALID_ACTIONS = ['meta_update', 'page_creation', 'blog_draft'];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const auth = await authorize(event);
  if (!auth.ok) return denied();
  // Generation spends Claude → session callers must be manager/admin (internal allowed).
  if (auth.via === 'session' && !['admin', 'manager'].includes(auth.user?.role)) {
    return json(403, { error: 'Manager or admin only' });
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const { brand, keyword, url, market, competitorPage } = body;
  const actionType = VALID_ACTIONS.includes(body.actionType) ? body.actionType : 'meta_update';
  const confidence = (body.confidence || '').toLowerCase();

  if (!brand || !keyword) return json(400, { error: 'brand and keyword are required' });

  // CONFIDENCE GATE — low-confidence opportunities go to a human (Perch), not AI.
  // Checked BEFORE the url requirement: a low-confidence item is deferred to Perch
  // regardless of whether it has a target url yet.
  if (confidence === 'low') {
    return json(200, { ok: true, routeToPerch: true, reason: 'Low confidence — route to Perch for human handling (no AI draft generated).' });
  }

  if (actionType === 'meta_update' && !url) return json(400, { error: 'url is required for a meta_update' });

  try {
    const brandCtx  = await getBrandContext(brand);
    const brandCfg  = await getBrand(brand);
    const vertical  = getVertical(brandCfg?.vertical);
    const examples  = await getBrandExamples(brand).catch(() => '');
    const feedback  = await getBrandFeedback(brand).catch(() => []); // past human rejections — never repeat
    const systemPrompt = buildBrandPrompt(brandCtx, examples);
    const menuItems = Array.isArray(brandCtx?.menu)
      ? brandCtx.menu.map(m => m.name || m).filter(x => typeof x === 'string').slice(0, 20).join(', ')
      : (brandCtx?.menu ? Object.keys(brandCtx.menu).slice(0, 20).join(', ') : '');
    const isArabic = /[؀-ۿ]/.test(keyword);
    const mkt = market && market !== 'uae' ? INTERNATIONAL_MARKETS[market] : null;
    const brandName = brandCfg?.name || (brand.charAt(0).toUpperCase() + brand.slice(1));

    // ── Intelligence (WS6, shared _lib/content-pipeline) — for ALL brands/markets ──
    // For page/blog creation we also pull the brand's GSC page+query rows to run the
    // cannibalization guard (cached, cheap). Meta updates target an existing page, so
    // no cannibalization risk — skip the GSC pull there.
    let intel = { promptDirective: '', competitors: null, cannibalPage: null, isLocal: false, serpTag: null };
    let effectiveAction = actionType;
    try {
      let rowsWithPages = null;
      if (actionType !== 'meta_update') {
        rowsWithPages = await fetchGscWithPages(await gscPropertyFor(brand)).catch(() => null);
      }
      intel = await gatherIntelligence({ brand, market: market || 'uae', keyword, currentPage: url, marketSlug: mkt?.marketSlug, rowsWithPages });
      // SERP-feature routing: a local-pack keyword must be a location page, not a blog.
      const routed = routeAction(actionType, intel.serpFeatures);
      effectiveAction = routed.actionType;
      if (routed.changed) intel.routeNote = routed.reason;
    } catch (e) { console.warn('[generate-draft] intelligence load failed (non-critical):', e.message); }

    // CANNIBALIZATION GUARD — don't create a new page/blog if a dedicated page already
    // ranks for this keyword; point the human at optimising that page's meta instead.
    if ((effectiveAction === 'page_creation' || effectiveAction === 'blog_draft') && intel.cannibalPage) {
      return json(200, { ok: true, skipped: true, cannibalization: true, existingPage: intel.cannibalPage,
        reason: `A dedicated page already ranks for "${keyword}" (${intel.cannibalPage}). Creating another would split authority — optimise that page's meta instead.` });
    }

    const ctx = { brand, keyword, url, market, competitorPage, brandCtx, brandCfg, vertical, examples, feedback, systemPrompt, menuItems, isArabic, mkt, brandName, auth, intel };

    if (effectiveAction === 'meta_update')   return await generateMeta(ctx);
    if (effectiveAction === 'page_creation') return await generatePage(ctx);
    if (effectiveAction === 'blog_draft')    return await generateBlog(ctx);
    return json(400, { error: `Unknown actionType: ${actionType}` });
  } catch (e) {
    console.error(`[generate-draft/${actionType}] failed:`, e.message);
    return json(500, { error: e.message });
  }
};

// Shared: labelled locationTag / languageTag for a queued item.
function tags(ctx) {
  return {
    locationTag: ctx.mkt ? `${ctx.mkt.flag || '🌍'} ${ctx.mkt.label}` : '🇦🇪 UAE',
    languageTag: ctx.isArabic ? 'AR' : 'EN',
    actor: ctx.auth.via === 'session' ? (ctx.auth.user?.email || 'user') : 'claude (worklist)',
  };
}

// ── meta_update ────────────────────────────────────────────────────────────────
async function generateMeta(ctx) {
  const { brand, keyword, url, competitorPage, brandCtx, feedback, systemPrompt, menuItems, isArabic, mkt, brandName, intel } = ctx;
  const intelDirective = intel?.promptDirective || '';

  // 1) current live meta (proven path — reuse the wordpress function)
  let currentTitle = null, currentDesc = null;
  try {
    const cmRes = await fetch(`${SITE}/.netlify/functions/wordpress`, {
      method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'get_current_meta', brand, payload: { url } }),
    });
    const cm = await cmRes.json().catch(() => null);
    if (cm?.found) { currentTitle = cm.currentTitle || null; currentDesc = cm.currentDesc || null; }
  } catch { /* proceed without current meta */ }

  const userPrompt = `You are auditing a ${brandName} page that ranks but under-performs on CTR. Write an improved SEO title + meta description for it.

RULES — non-negotiable:
${metaLengthRule}
- Only reference REAL menu items: ${menuItems || 'use items from the brand context'}
- Lead with the keyword; end with a reason to click. No generic phrases ("great food", "delicious", "best in Dubai").
- Write specifically about what the PAGE is about (the URL tells you the topic).${isArabic ? '\n- Write the title AND description in ARABIC (the keyword is Arabic).' : ''}${competitorPage ? `\n- A competitor ranks here with ${competitorPage} — make ours more specific and compelling than a generic competitor page.` : ''}${intelDirective}${feedback.length ? `\n\nHUMAN FEEDBACK — past rejections, never repeat these:\n${feedback.slice(0, 10).map(n => `- ${n}`).join('\n')}` : ''}

PAGE:
  URL: "${url}"
  Target keyword: "${keyword}"${mkt ? ` | Market: ${mkt.label}` : ''}
  Current title: "${currentTitle || 'NOT SET'}"
  Current description: "${currentDesc || 'NOT SET'}"

Return ONLY JSON:
{"skip": false, "skipReason": "only if the current meta is already excellent", "title": "...", "description": "...", "rationale": "one sentence — why current underperforms and why yours is better"}`;

  const { text } = await callClaude(userPrompt, { max_tokens: 1200, system: systemPrompt });
  const parsed = extractJson(text) || {};
  if (parsed.skip) return json(200, { ok: true, skipped: true, reason: parsed.skipReason || 'current meta already good' });
  const title = (parsed.title || '').trim();
  const description = (parsed.description || '').trim();
  if (!title || !description) return json(502, { error: 'generation returned no title/description' });

  const lengthIssues = metaLenIssues(title, description);
  let voiceScore = null, voiceIssues = [];
  try { const v = await runBrandVoiceCheck(`${title}\n${description}`, brandCtx, callClaude); voiceScore = v?.score ?? null; voiceIssues = v?.issues || []; } catch {}

  const t = tags(ctx);
  const item = await createApproval({
    type: 'meta_update', brand,
    title: `Meta: ${keyword}`,
    reason: parsed.rationale || `Optimise meta for "${keyword}" on ${url}`,
    ...t,
    payload: {
      url, title, description, targetKeyword: keyword, wpAction: 'update_meta',
      currentMeta: { title: currentTitle, description: currentDesc },
      voiceScore, voiceIssues, lengthWarning: lengthIssues,
      competitorPage: competitorPage || null,
      serpFeatureTag: intel?.serpTag || null, competitors: intel?.competitors || null,
      generatedType: 'meta', label: 'Meta rewrite', source: 'worklist-generate',
    },
  });
  return json(200, { ok: true, item });
}

// ── page_creation ───────────────────────────────────────────────────────────────
async function generatePage(ctx) {
  const { brand, keyword, url, brandCtx, feedback, systemPrompt, menuItems, isArabic, mkt, brandName, vertical, intel } = ctx;
  const intelDirective = intel?.promptDirective || '';

  const userPrompt = `You are creating a NEW ${vertical.promptNoun} landing/location page for ${brandName} to rank for a keyword it currently has no dedicated page for. Write the full page.

TARGET: "${keyword}"${mkt ? ` | Market: ${mkt.label}` : ' | Market: UAE'}
WHAT ${brandName.toUpperCase()} IS ABOUT: ${menuItems || vertical.menuSummary}

RULES — non-negotiable:
- This is a real, publishable page — write substantive, on-brand body copy (350–600 words) in ${brandName}'s voice.
- Structure with clear H2/H3 headings. Lead with the search intent behind "${keyword}".
- Only reference REAL offerings: ${menuItems || vertical.menuSummary}. Invent nothing (no fake locations, awards, or menu items).
- ${metaLengthRule}${isArabic ? '\n- Write EVERYTHING (title, headings, body, meta) in ARABIC.' : ''}${intelDirective}${feedback.length ? `\n\nHUMAN FEEDBACK — never repeat these past rejections:\n${feedback.slice(0, 10).map(n => `- ${n}`).join('\n')}` : ''}

Return ONLY JSON:
{"skip": false, "skipReason": "only if this keyword should NOT get a dedicated page", "slug": "url-slug-no-domain", "title": "SEO title", "metaDescription": "...", "h1": "page H1", "contentHtml": "<h2>...</h2><p>...</p> full page body as HTML", "rationale": "one sentence — why this page wins the keyword"}`;

  const { text } = await callClaude(userPrompt, { max_tokens: 3000, system: systemPrompt });
  const parsed = extractJson(text) || {};
  if (parsed.skip) return json(200, { ok: true, skipped: true, reason: parsed.skipReason || 'not a good page-creation candidate' });
  const title = (parsed.title || '').trim();
  let contentHtml = (parsed.contentHtml || '').trim();
  if (!title || !contentHtml) return json(502, { error: 'generation returned no title/content' });
  contentHtml = hardStripBannedTokens(contentHtml);

  let voiceScore = null, voiceIssues = [];
  try { const v = await runBrandVoiceCheck(contentHtml.replace(/<[^>]+>/g, ' '), brandCtx, callClaude); voiceScore = v?.score ?? null; voiceIssues = v?.issues || []; } catch {}

  const t = tags(ctx);
  const item = await createApproval({
    type: 'page_creation', brand,
    title: `Page: ${keyword}`,
    reason: parsed.rationale || `Create a dedicated page targeting "${keyword}"`,
    ...t,
    payload: {
      url: url || null, slug: parsed.slug || '', title,
      description: parsed.metaDescription || '', h1: parsed.h1 || title,
      content: contentHtml, targetKeyword: keyword, wpAction: 'create_page',
      voiceScore, voiceIssues,
      serpFeatureTag: intel?.serpTag || null, competitors: intel?.competitors || null,
      routedFrom: intel?.routeNote || null,
      generatedType: 'page', label: 'New page', source: 'worklist-generate',
    },
  });
  return json(200, { ok: true, item, routeNote: intel?.routeNote || null });
}

// ── blog_draft ────────────────────────────────────────────────────────────────
async function generateBlog(ctx) {
  const { brand, keyword, brandCtx, feedback, systemPrompt, menuItems, isArabic, mkt, brandName, vertical, intel } = ctx;
  const intelDirective = intel?.promptDirective || '';

  const userPrompt = `You are writing a NEW blog/journal post for ${brandName} to build topical authority and rank for an informational keyword. Write the full post.

TARGET: "${keyword}"${mkt ? ` | Market: ${mkt.label}` : ' | Market: UAE'}
WHAT ${brandName.toUpperCase()} IS ABOUT: ${menuItems || vertical.menuSummary}

RULES — non-negotiable:
- Write a genuinely useful, on-brand post (500–800 words) in ${brandName}'s voice — not SEO filler.
- Structure with H2/H3 headings. Answer the intent behind "${keyword}" first.
- Reference only REAL offerings: ${menuItems || vertical.menuSummary}. Invent nothing.
- ${metaLengthRule}${isArabic ? '\n- Write EVERYTHING in ARABIC.' : ''}${intelDirective}${feedback.length ? `\n\nHUMAN FEEDBACK — never repeat these past rejections:\n${feedback.slice(0, 10).map(n => `- ${n}`).join('\n')}` : ''}

Return ONLY JSON:
{"skip": false, "skipReason": "only if this keyword shouldn't be a blog", "slug": "post-slug", "title": "post title", "metaDescription": "...", "contentHtml": "<h2>...</h2><p>...</p> full post body as HTML", "rationale": "one sentence — the angle and why it ranks"}`;

  const { text } = await callClaude(userPrompt, { max_tokens: 3500, system: systemPrompt });
  const parsed = extractJson(text) || {};
  if (parsed.skip) return json(200, { ok: true, skipped: true, reason: parsed.skipReason || 'not a good blog candidate' });
  const title = (parsed.title || '').trim();
  let contentHtml = (parsed.contentHtml || '').trim();
  if (!title || !contentHtml) return json(502, { error: 'generation returned no title/content' });
  contentHtml = hardStripBannedTokens(contentHtml);

  let voiceScore = null, voiceIssues = [];
  try { const v = await runBrandVoiceCheck(contentHtml.replace(/<[^>]+>/g, ' '), brandCtx, callClaude); voiceScore = v?.score ?? null; voiceIssues = v?.issues || []; } catch {}

  const t = tags(ctx);
  const item = await createApproval({
    type: 'blog_draft', brand,
    title: `Blog: ${keyword}`,
    reason: parsed.rationale || `Write a blog post targeting "${keyword}"`,
    ...t,
    payload: {
      slug: parsed.slug || '', title, description: parsed.metaDescription || '',
      content: contentHtml, targetKeyword: keyword, wpAction: 'create_draft',
      voiceScore, voiceIssues,
      serpFeatureTag: intel?.serpTag || null, competitors: intel?.competitors || null,
      generatedType: 'blog', label: 'New blog post', source: 'worklist-generate',
    },
  });
  return json(200, { ok: true, item });
}
