// netlify/functions/_lib/aggregator-domains.js
// Single source of truth for "this domain is an aggregator/social/directory, not a
// competitor." Matches by BARE BRAND TERM so every regional/ccTLD variant is caught
// (timeout.com, timeoutbahrain.com, timeoutdoha.com, zomato.qa, deliveroo.ae, …) —
// the old per-file exact-domain Sets missed all of those.

const AGGREGATOR_TERMS = [
  // Food directories / delivery / review
  'timeout', 'zomato', 'tripadvisor', 'talabat', 'deliveroo', 'careem', 'hungerstation',
  'mrsool', 'jahez', 'thechefz', 'ubereats', 'theentertainer', 'entertainer', 'whatson',
  'whats-on', 'yallarestaurants', 'openrice', 'foursquare', 'yelp', 'zomato',
  // Social / forum / UGC
  'reddit', 'quora', 'medium', 'pinterest', 'threads', 'snapchat', 'facebook', 'instagram',
  'youtube', 'tiktok', 'twitter', 'linkedin',
  // Travel / booking / stores / jobs / general
  'booking', 'agoda', 'trustpilot', 'wikipedia', 'wikiwand', 'fandango', 'indeed',
  'glassdoor', 'bayt', 'dubizzle', '2gis', 'yellowpages', 'amazon', 'wanderlog', 'wingie',
  // News / tourism portals
  'thenational', 'gulfnews', 'khaleejtimes', 'visitdubai', 'visitqatar', 'arabnews',
];
// Full-domain matches for terms too short/generic to stem-match safely.
const AGGREGATOR_EXACT = new Set([
  'x.com', 'noon.com', 'noonfood.com', 'google.com', 'maps.google.com', 'play.google.com',
  'apple.com', 'apps.apple.com',
]);

function isAggregatorDomain(domain) {
  const d = String(domain || '').replace(/^www\./, '').toLowerCase();
  if (!d) return false;
  if (AGGREGATOR_EXACT.has(d)) return true;
  const labels = d.split('.');
  // label match for google/apple-style.
  if (labels.includes('google') || labels.includes('apple') || labels.includes('noon')) return true;
  // Prefix-match EVERY non-TLD label (not just the first) so country/language-
  // prefixed aggregators are caught too: ar.timeoutriyadh.com, ar.tripadvisor.com,
  // sa.wingie.com — the old first-label-only check saw "ar"/"sa" and missed them.
  return labels.slice(0, -1).some(lab => AGGREGATOR_TERMS.some(t => lab === t || lab.startsWith(t)));
}

// Boundary-aware domain equality — avoids substring false positives (e.g. a domain
// merely CONTAINING a competitor's domain shouldn't count as that competitor).
function domainMatches(itemDomain, target) {
  const a = String(itemDomain || '').replace(/^www\./, '').toLowerCase();
  const b = String(target || '').replace(/^www\./, '').toLowerCase();
  if (!a || !b) return false;
  return a === b || a.endsWith('.' + b) || b.endsWith('.' + a);
}

module.exports = { AGGREGATOR_TERMS, isAggregatorDomain, domainMatches };
