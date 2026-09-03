// netlify/functions/scaffold-venues-background.js
// After a CITY HUB page exists, scaffold a draft venue page for every venue configured
// for that city — parented to the hub, page_type=venue, body written by the Nest — so the
// only thing left for a human is the NAP (ACF). Config-driven (venues from
// citiesForMarketAsync), deduped against venue pages a human already created under the hub.
//
// Runs in the background (loops generateDraftCore in-process, one generation per venue —
// past the sync gateway limit). NOT scheduled (HTTP-invocable, CLAUDE.md rule 7).
// Fired by approvals.js when a city_hub is approved, or callable directly for a backfill.
//
// It creates pending APPROVALS (one per missing venue), not live pages — the human still
// reviews/approves each, then adds NAP. Never publishes.

const { authorizeJob, internalHeaders } = require('./_lib/auth');
const { citiesForMarketAsync, getMarketsForBrandAsync } = require('./_lib/international-config');
const { getBrand, getVertical } = require('./_lib/brands-config');
const { generateDraftCore } = require('./generate-draft');

const SITE = process.env.URL || process.env.NETLIFY_URL || 'https://yolkseo.netlify.app';
const _norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// A human may name the venue PAGE differently from the config venue name (page "Cue
// Cinemas" vs config "Cue Cinemas, Gulberg"). Treat as the same venue if either
// normalized string contains the other (min 4 chars, so a stray short title can't match).
function _venueExists(venueName, existingTitles) {
  const vn = _norm(venueName);
  return existingTitles.some(ch => ch.length >= 4 && (vn.includes(ch) || ch.includes(vn)));
}

// Resolve the market KEY (e.g. bonbird_pakistan) from brand + a market slug (e.g. 'pk').
async function resolveMarketKey(brand, market, marketSlug) {
  if (market && market.includes('_')) return market;                 // already a key
  // getMarketsForBrandAsync returns an OBJECT keyed by market key ({bonbird_oman:{…}}),
  // NOT an array — calling .find() on it threw a TypeError that killed this background
  // handler after it had already 202'd, so a hub published via Approve/Publish (which pass
  // the market SLUG, not a key) silently scaffolded no venues. Use Object.values. (v7.9.65)
  const map = await getMarketsForBrandAsync(brand).catch(() => ({}));
  const hit = Object.values(map || {}).find(m => _norm(m.marketSlug) === _norm(marketSlug || market));
  return hit ? hit.key : null;
}

exports.handler = async (event) => {
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not authenticated' }) };

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  const { brand, hubPostId, city } = b;
  if (!brand || !hubPostId || !city) return { statusCode: 400, body: JSON.stringify({ error: 'brand, hubPostId and city are required' }) };

  const marketKey = await resolveMarketKey(brand, b.market, b.marketSlug);
  if (!marketKey) { console.warn(`[scaffold-venues] could not resolve market for ${brand}/${b.market || b.marketSlug}`); return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'no market' }) }; }

  // Venues configured for this city (config only — never invented).
  const cities = await citiesForMarketAsync(marketKey).catch(() => []);
  const hub = cities.find(c => _norm(c.slug) === _norm(city) || _norm(c.city) === _norm(city));
  const venues = (hub && hub.venues) || [];
  if (!venues.length) { console.log(`[scaffold-venues] no configured venues for ${brand}/${marketKey}/${city}`); return { statusCode: 200, body: JSON.stringify({ ok: true, venues: 0 }) }; }

  // Dedup against venue pages a human (or a prior run) already created under the hub.
  let existing = [];
  try {
    const r = await fetch(`${SITE}/.netlify/functions/wordpress`, {
      method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'list_children', brand, payload: { parentId: hubPostId } }),
    });
    const j = await r.json().catch(() => null);
    existing = ((j && j.children) || []).map(c => _norm(c.title));
  } catch (e) { console.warn('[scaffold-venues] child list failed (continuing, may duplicate):', e.message); }

  const cuisine = await getBrand(brand).then(bc => (bc && bc.cuisine) || getVertical(bc && bc.vertical).menuSummary || 'food').catch(() => 'food');

  const results = [];
  for (const v of venues) {
    if (_venueExists(v.name, existing)) { results.push({ venue: v.name, status: 'exists' }); continue; }
    try {
      const out = await generateDraftCore({
        brand, market: marketKey, pageKind: 'venue', actionType: 'page_creation',
        parentId: hubPostId, pageTitle: v.name,
        keyword: `${cuisine} ${v.city || hub.city}`,
      });
      if (out.item) { results.push({ venue: v.name, status: 'queued', itemId: out.item.id }); existing.push(_norm(v.name)); }  // within-run dedup
      else if (out.skipped) results.push({ venue: v.name, status: 'skipped', reason: out.reason });
      else results.push({ venue: v.name, status: 'error', reason: out.error || `HTTP ${out.statusCode}` });
    } catch (e) { results.push({ venue: v.name, status: 'error', reason: e.message }); }
  }

  console.log(`[scaffold-venues] ${brand}/${marketKey}/${city} hub#${hubPostId}: ${JSON.stringify(results)}`);
  // Slack: one summary for the auto-scaffolded venues (not per-venue). (v7.9.48)
  const queuedCount = results.filter(r => r.status === 'queued').length;
  if (queuedCount) {
    try {
      await fetch(`${SITE}/.netlify/functions/slack-notify`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ type: 'draft_queued', brand, count: queuedCount,
          context: `${queuedCount} venue page${queuedCount === 1 ? '' : 's'} for ${hub.city}`, siteUrl: SITE }),
      });
    } catch (e) { console.warn('[scaffold-venues] slack notify failed (non-critical):', e.message); }
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true, hubPostId, results }) };
};
