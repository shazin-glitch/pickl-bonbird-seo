// netlify/functions/local-seo-pages-background.js
// Local SEO — populate location pages from real GBP data.
//
// Turns the empty/thin location-page problem into an asset: for each real GBP
// location we generate a UNIQUE, schema-rich location page (NOT a templated
// swap — real per-location address/area context so it isn't duplicate thin
// content) and QUEUE it to the approvals queue. A human reviews, then publishes
// (the push resolves WP creds from `brand`, like every other page_creation).
//
// Source of truth = gbpCache:<brand>:v9 (name, address, googleMapsUri, hasHours)
// — the same data the GBP reviews layer already caches.
//
// Manual trigger (no cron — run on demand to control cost):
//   GET /.netlify/functions/local-seo-pages-background?brand=pickl
//   &force=true  → ignore the already-queued dedup
//   &limit=6     → cap locations processed this run (default 6)

const { getStore } = require('@netlify/blobs');
const { authorizeJob } = require('./_lib/auth');
const { getBrandContext, getBrandExamples, buildBrandPrompt, runBrandVoiceCheck, fixBrandVoice, hardStripBannedTokens } = require('./_lib/brand');
const { callClaude, createApproval, listApprovals, extractJson } = require('./_lib/store');
const { getBrand } = require('./_lib/brands-config');

const GBP_CACHE_VERSION = 'v9'; // keep in sync with gbp-data.js cacheKey
const DEFAULT_LIMIT     = 6;

async function getBrandFeedback(brand) {
  try {
    const s = getStore({ name: 'seo-tool', consistency: 'strong', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    const raw = await s.get(`brandFeedback:${brand}`, { type: 'text' });
    const notes = JSON.parse(raw || '[]');
    return Array.isArray(notes) ? notes : [];
  } catch { return []; }
}

function sanitizeSlug(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// Deterministic, accurate LocalBusiness/Restaurant JSON-LD from real GBP data.
// Built in code (not by Claude) so the structured data never fabricates fields.
function buildLocationSchema(loc, brandCtx, brandRec) {
  const schema = {
    '@context': 'https://schema.org',
    '@type':    'Restaurant',
    name:       loc.name,
    servesCuisine: brandCtx?.cuisine || brandRec?.cuisine || 'Food',
  };
  if (loc.address)       schema.address = { '@type': 'PostalAddress', streetAddress: loc.address, addressCountry: 'AE' };
  if (loc.googleMapsUri) schema.hasMap = loc.googleMapsUri;
  if (brandCtx?.website) schema.servesCuisine && (schema.url = brandCtx.website);
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

// Locations already represented by a pending/pushed page_creation (dedup).
async function getQueuedLocationIds(brand) {
  const ids = new Set();
  try {
    const items = await listApprovals({ brand }).catch(() => []);
    for (const it of (Array.isArray(items) ? items : (items?.items || []))) {
      if (it.type === 'page_creation' && it.payload?.locationId && ['pending', 'pushed', 'published'].includes(it.status)) {
        ids.add(it.payload.locationId);
      }
    }
  } catch { /* best effort */ }
  return ids;
}

async function generateLocationPage(loc, brand, brandCtx, brandPrompt, brandExamples, feedbackNotes, brandRec) {
  const brandName = brandCtx?.name || brandRec?.name || brand;
  const userPrompt = `Write a complete, conversion-focused LOCATION PAGE for the ${brandName} branch below. This is a standalone page (not a blog post).

LOCATION (use these real details — do NOT invent addresses or areas):
- Name: ${loc.name}
- Address: ${loc.address || '(address on file)'}
- Google Maps: ${loc.googleMapsUri || '(linked on publish)'}

REQUIREMENTS:
- H1 leads with the brand + this specific area (a line a local would actually say)
- 3-4 H2 sections: why ${brandName} at this location, the local area/neighbourhood context (reference the real area from the address), menu highlights, how to find/order
- Reference the REAL area only — never fabricate landmarks or a different city
- Local keywords naturally (e.g. "${brandName} {area}", "burger near {area}")
- Internal links to /menu, /locations
- Image placeholder comments: <!-- IMAGE: [specific description] -->
- CTA at the bottom (Order Now / Find Us / View Menu)
- 450-700 words — specific, no filler. Every sentence in brand voice.${feedbackNotes.length ? `\n\nHUMAN FEEDBACK — never do any of these:\n${feedbackNotes.map(n => `- ${n}`).join('\n')}` : ''}

Return ONLY JSON:
{"title":"SEO title 55-60 chars","description":"meta description 150-158 chars","slug":"area-based-slug e.g pickl-jbr","pageHeading":"H1","excerpt":"short list description","body":"<full page HTML — h2,p,ul,strong,image comments — no outer html/body tags>"}`;

  const { text } = await callClaude(userPrompt, { max_tokens: 1800, system: brandPrompt });
  const parsed = extractJson(text);
  if (!parsed?.body || !parsed?.title) return null;

  // Voice gate — hard-strip dashes, then require >=8 (loops up to 3x), reject <8.
  parsed.body = hardStripBannedTokens(parsed.body);
  let voiceCheck = await runBrandVoiceCheck(parsed.body, brandCtx, (p, o) => callClaude(p, o))
    .catch(() => ({ score: 6, verdict: 'PASS', issues: [], topFix: null }));
  if (voiceCheck.score < 8) {
    const fixed = await fixBrandVoice(parsed.body, voiceCheck, brandCtx, (p, o) => callClaude(p, o), brandExamples, feedbackNotes);
    if (fixed.improved) { parsed.body = fixed.content; voiceCheck = fixed.voiceCheck; }
  }
  if (voiceCheck.score < 8) return { rejected: true, score: voiceCheck.score };

  // Append deterministic schema to the page body.
  parsed.body += '\n' + buildLocationSchema(loc, brandCtx, brandRec);
  parsed.voiceScore = voiceCheck.score;
  parsed.voiceIssues = voiceCheck.issues;
  return parsed;
}

exports.handler = async (event) => {
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not authenticated' }) };
  console.log(`[local-seo-pages] Starting — ${new Date().toISOString()}`);
  const qs    = event.queryStringParameters || {};
  const brand = qs.brand || 'pickl';
  const brandRec = await getBrand(brand);
  if (!brandRec) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: `Unknown brand: ${brand}` }) };
  }
  const force = qs.force === 'true';
  const limit = Math.max(1, Math.min(20, parseInt(qs.limit, 10) || DEFAULT_LIMIT));

  const store = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });

  // GBP locations from the reviews-layer cache.
  let locations = [];
  try {
    const cached = await store.get(`gbpCache:${brand}:${GBP_CACHE_VERSION}`, { type: 'json' });
    locations = (cached?.locations || []).filter(l => l.name);
  } catch { /* none */ }

  if (!locations.length) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, brand, queued: 0, reason: `No cached GBP locations for ${brand}. Open the Local SEO tab once to warm gbpCache:${brand}:${GBP_CACHE_VERSION}, then retry.` }) };
  }

  const brandCtx      = await getBrandContext(brand);
  const brandExamples = await getBrandExamples(brand).catch(() => null);
  const brandPrompt   = buildBrandPrompt(brandCtx, brandExamples);
  const feedbackNotes = await getBrandFeedback(brand).catch(() => []);
  const alreadyQueued = force ? new Set() : await getQueuedLocationIds(brand);

  const flag = brandRec.flag || '📍';
  const targets = locations.filter(l => !alreadyQueued.has(l.id)).slice(0, limit);

  let queued = 0, rejected = 0, skipped = locations.length - targets.length;
  const results = [];

  for (const loc of targets) {
    try {
      const page = await generateLocationPage(loc, brand, brandCtx, brandPrompt, brandExamples, feedbackNotes, brandRec);
      if (!page) { results.push({ location: loc.name, status: 'parse_error' }); continue; }
      if (page.rejected) { rejected++; results.push({ location: loc.name, status: `voice_reject_${page.score}` }); continue; }

      await createApproval({
        type:   'page_creation',
        brand,
        actor:  'claude (local-seo)',
        title:  `Location page: ${page.title}`,
        reason: `Populate location page for ${loc.name}${loc.address ? ` (${loc.address})` : ''} — unique GBP-sourced content + LocalBusiness schema`,
        locationTag: `${flag} ${brandRec.name} · Local`,
        payload: {
          title:         page.title,
          description:   page.description,
          slug:          sanitizeSlug(page.slug),
          pageHeading:   page.pageHeading,
          excerpt:       page.excerpt,
          body:          page.body,
          pageType:      'location',
          wpAction:      'create_page',
          localSeo:      true,
          locationId:    loc.id,
          locationName:  loc.name,
          locationAddr:  loc.address || '',
          googleMapsUri: loc.googleMapsUri || null,
          voiceScore:    page.voiceScore,
          voiceIssues:   page.voiceIssues,
        },
      });
      queued++;
      results.push({ location: loc.name, status: 'queued' });
      console.log(`[local-seo-pages] queued location page: ${loc.name} (voice ${page.voiceScore}/10)`);
    } catch (e) {
      console.error(`[local-seo-pages] failed for ${loc.name}: ${e.message}`);
      results.push({ location: loc.name, status: `error: ${e.message}` });
    }
  }

  console.log(`[local-seo-pages] Done — ${queued} queued, ${rejected} voice-rejected, ${skipped} skipped (already queued)`);
  return { statusCode: 200, body: JSON.stringify({ ok: true, brand, totalLocations: locations.length, queued, rejected, skippedAlreadyQueued: skipped, results }) };
};
