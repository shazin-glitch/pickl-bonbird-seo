// netlify/functions/generate-draft.js
// Stage 2c — on-demand generation from the worklist. Given ONE opportunity
// (keyword + target page + market), generates an optimised meta draft NOW and drops
// it in the Approvals Queue as a DRAFT — it never auto-publishes (human gate intact).
// Reuses the proven meta path: live-meta fetch → brand-grounded Claude rewrite (shared
// length rule) → voice check → createApproval. Meta-first by design: the safest,
// highest-ROI SEO action; page/blog content generation is a later 2c phase.
//
//   POST { brand, keyword, url, market, competitorPage }
//     → { ok, skipped?, item }   (item = the queued meta_update draft)

const { getBrandContext, getBrandExamples, buildBrandPrompt, runBrandVoiceCheck } = require('./_lib/brand');
const { callClaude, extractJson, createApproval } = require('./_lib/store');
const { metaLengthRule, metaLenIssues } = require('./_lib/seo-meta');
const { INTERNATIONAL_MARKETS } = require('./_lib/international-config');
const { authorize, denied, internalHeaders } = require('./_lib/auth');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SITE = process.env.NETLIFY_URL || process.env.URL || 'https://yolkseo.netlify.app';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const auth = await authorize(event);
  if (!auth.ok) return denied();
  // Generation spends Claude → session callers must be manager/admin (internal allowed).
  if (auth.via === 'session' && !['admin', 'manager'].includes(auth.user?.role)) {
    return { statusCode: 403, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Manager or admin only' }) };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  const { brand, keyword, url, market, competitorPage } = body;
  if (!brand || !keyword || !url) {
    return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'brand, keyword and url are required' }) };
  }

  try {
    const brandCtx  = await getBrandContext(brand);
    const examples  = await getBrandExamples(brand).catch(() => '');
    const systemPrompt = buildBrandPrompt(brandCtx, examples);
    const menuItems = Array.isArray(brandCtx?.menu)
      ? brandCtx.menu.map(m => m.name || m).filter(x => typeof x === 'string').slice(0, 20).join(', ')
      : (brandCtx?.menu ? Object.keys(brandCtx.menu).slice(0, 20).join(', ') : '');
    const isArabic = /[؀-ۿ]/.test(keyword);
    const mkt = market && market !== 'uae' ? INTERNATIONAL_MARKETS[market] : null;

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

    // 2) generate — single-candidate meta rewrite, brand-grounded, shared length rule
    const brandName = brand.charAt(0).toUpperCase() + brand.slice(1);
    const userPrompt = `You are auditing a ${brandName} page that ranks but under-performs on CTR. Write an improved SEO title + meta description for it.

RULES — non-negotiable:
${metaLengthRule}
- Only reference REAL menu items: ${menuItems || 'use items from the brand context'}
- Lead with the keyword; end with a reason to click. No generic phrases ("great food", "delicious", "best in Dubai").
- Write specifically about what the PAGE is about (the URL tells you the topic).${isArabic ? '\n- Write the title AND description in ARABIC (the keyword is Arabic).' : ''}${competitorPage ? `\n- A competitor ranks here with ${competitorPage} — make ours more specific and compelling than a generic competitor page.` : ''}

PAGE:
  URL: "${url}"
  Target keyword: "${keyword}"${mkt ? ` | Market: ${mkt.label}` : ''}
  Current title: "${currentTitle || 'NOT SET'}"
  Current description: "${currentDesc || 'NOT SET'}"

Return ONLY JSON:
{"skip": false, "skipReason": "only if the current meta is already excellent", "title": "...", "description": "...", "rationale": "one sentence — why current underperforms and why yours is better"}`;

    const { text } = await callClaude(userPrompt, { max_tokens: 1200, system: systemPrompt });
    const parsed = extractJson(text) || {};
    if (parsed.skip) {
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, skipped: true, reason: parsed.skipReason || 'current meta already good' }) };
    }
    const title = (parsed.title || '').trim();
    const description = (parsed.description || '').trim();
    if (!title || !description) {
      return { statusCode: 502, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'generation returned no title/description' }) };
    }

    // 3) quality signals (advisory — human reviews) : length + brand voice
    const lengthIssues = metaLenIssues(title, description);
    let voiceScore = null, voiceIssues = [];
    try {
      const v = await runBrandVoiceCheck(`${title}\n${description}`, brandCtx, callClaude);
      voiceScore = v?.score ?? null; voiceIssues = v?.issues || [];
    } catch { /* voice check non-critical */ }

    // 4) queue as a DRAFT (never auto-publish)
    const item = await createApproval({
      type:  'meta_update',
      brand,
      title: `Meta: ${keyword}`,
      reason: parsed.rationale || `Optimise meta for "${keyword}" on ${url}`,
      actor: auth.via === 'session' ? (auth.user?.email || 'user') : 'claude (worklist)',
      locationTag: mkt ? `${mkt.flag || '🌍'} ${mkt.label}` : '🇦🇪 UAE',
      languageTag: isArabic ? 'AR' : 'EN',
      payload: {
        url, title, description, targetKeyword: keyword,
        wpAction: 'update_meta',
        currentMeta: { title: currentTitle, description: currentDesc },
        voiceScore, voiceIssues,
        lengthWarning: lengthIssues,
        competitorPage: competitorPage || null,
        source: 'worklist-2c',
      },
    });

    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, item }) };
  } catch (e) {
    console.error('[generate-draft] failed:', e.message);
    return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e.message }) };
  }
};
