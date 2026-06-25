// netlify/functions/_lib/keyword-metrics.js
// Enrich a keyword list with search volume + CPC + Keyword Difficulty from
// DataForSEO. SERP results don't carry volume, so the matrix needs this; and it
// gives us KD (Ahrefs/SEMrush-style 0–100) for opportunities + matrix.
//
//   volume + cpc → keywords_data/google_ads/search_volume/live
//   kd           → dataforseo_labs/google/bulk_keyword_difficulty/live
//
// SAFE: returns {} (or partial) on any failure — never throws. Language-aware;
// drops language_code and retries if a location rejects it (40501 gotcha).

const DFS = 'https://api.dataforseo.com/v3';

async function postOne(url, payload, authHeader) {
  const res = await fetch(url, {
    method:  'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body:    JSON.stringify([payload]),
  });
  return res.json();
}

function taskOk(data)     { return data?.tasks?.[0]?.status_code === 20000; }
function langRejected(data) {
  // The language error can surface at the task level (most common) OR top level,
  // and DataForSEO Labs rejects BOTH a bad `language_code` AND an omitted one
  // (it then demands `language_name`). Catch either.
  const t = data?.tasks?.[0];
  const msg = `${data?.status_message || ''} ${t?.status_message || ''}`;
  return !taskOk(data) && /language_code|language_name/i.test(msg);
}

// POST once per candidate language until the task succeeds. Labs endpoints are
// strict: KSA (2682) accepts ONLY 'ar', Jordan ONLY 'en', etc. — sending the
// wrong code (or none) returns 40501 and an empty result. We try the keyword's
// natural-script language first, then the location's authoritative languages,
// and only drop language as a last resort.
async function postWithLang(url, basePayload, langs, authHeader) {
  const cands = [...new Set((langs || []).filter(Boolean))];
  let last = null;
  for (const lang of cands) {
    const data = await postOne(url, { ...basePayload, language_code: lang }, authHeader);
    if (taskOk(data)) return data;        // success
    last = data;
    if (!langRejected(data)) return data; // failed for a NON-language reason — other langs won't help
  }
  // Last resort: no language at all (some location/endpoint combos accept this).
  const dropped = await postOne(url, basePayload, authHeader);
  return taskOk(dropped) ? dropped : (last || dropped);
}

// enrichKeywords(keywords, locationCode, languageCode, authHeader, fallbackLangs)
//   -> { [keywordLower]: { volume, cpc, kd } }
// languageCode = preferred (keyword's natural script); fallbackLangs = the
// location's authoritative Labs languages, tried in order if the preferred fails.
async function enrichKeywords(keywords, locationCode, languageCode, authHeader, fallbackLangs = []) {
  const out = {};
  const kws = [...new Set((keywords || []).map(k => String(k).trim()).filter(Boolean))].slice(0, 700);
  if (!kws.length || !locationCode) return out;
  const langs = [languageCode, ...fallbackLangs];

  // ── Volume + CPC (Google Ads keyword data) ──────────────────────────────
  try {
    const data = await postWithLang(`${DFS}/keywords_data/google_ads/search_volume/live`,
      { keywords: kws, location_code: locationCode }, langs, authHeader);
    for (const it of (data?.tasks?.[0]?.result || [])) {
      const k = (it.keyword || '').toLowerCase();
      if (k) out[k] = { volume: it.search_volume ?? null, cpc: it.cpc ?? null, kd: null };
    }
  } catch { /* volume unavailable */ }

  // ── Keyword Difficulty (Labs) ───────────────────────────────────────────
  try {
    const data = await postWithLang(`${DFS}/dataforseo_labs/google/bulk_keyword_difficulty/live`,
      { keywords: kws, location_code: locationCode }, langs, authHeader);
    const t = data?.tasks?.[0];
    const items = t?.result?.[0]?.items || t?.result || [];
    for (const it of items) {
      const k = (it.keyword || '').toLowerCase();
      if (!k) continue;
      if (!out[k]) out[k] = { volume: null, cpc: null, kd: null };
      out[k].kd = (it.keyword_difficulty != null) ? it.keyword_difficulty : null;
    }
  } catch { /* KD unavailable */ }

  return out;
}

// Split a mixed list and enrich each script with its natural language, falling
// back to the location's authoritative Labs languages on rejection. Pass
// supportedLangs from resolveLocation().languages — e.g. KSA = ['ar'], so the
// English-text keywords (which 'en' would reject for KD) still resolve via 'ar'.
async function enrichKeywordsMixed(keywords, locationCode, authHeader, supportedLangs = []) {
  const ar = (keywords || []).filter(k => /[؀-ۿ]/.test(k));
  const en = (keywords || []).filter(k => !/[؀-ۿ]/.test(k));
  const out = {};
  if (en.length) Object.assign(out, await enrichKeywords(en, locationCode, 'en', authHeader, supportedLangs));
  if (ar.length) Object.assign(out, await enrichKeywords(ar, locationCode, 'ar', authHeader, supportedLangs));
  return out;
}

module.exports = { enrichKeywords, enrichKeywordsMixed };
