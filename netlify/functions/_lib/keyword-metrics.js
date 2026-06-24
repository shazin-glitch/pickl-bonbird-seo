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

function langRejected(data) {
  const t = data?.tasks?.[0];
  return data?.status_code === 20000 && t && t.status_code !== 20000 && /language/i.test(t.status_message || '');
}

// enrichKeywords(keywords, locationCode, languageCode, authHeader)
//   -> { [keywordLower]: { volume, cpc, kd } }
async function enrichKeywords(keywords, locationCode, languageCode, authHeader) {
  const out = {};
  const kws = [...new Set((keywords || []).map(k => String(k).trim()).filter(Boolean))].slice(0, 700);
  if (!kws.length || !locationCode) return out;

  // ── Volume + CPC (Google Ads keyword data) ──────────────────────────────
  try {
    let data = await postOne(`${DFS}/keywords_data/google_ads/search_volume/live`,
      { keywords: kws, location_code: locationCode, language_code: languageCode }, authHeader);
    if (langRejected(data)) {
      data = await postOne(`${DFS}/keywords_data/google_ads/search_volume/live`,
        { keywords: kws, location_code: locationCode }, authHeader);
    }
    for (const it of (data?.tasks?.[0]?.result || [])) {
      const k = (it.keyword || '').toLowerCase();
      if (k) out[k] = { volume: it.search_volume ?? null, cpc: it.cpc ?? null, kd: null };
    }
  } catch { /* volume unavailable */ }

  // ── Keyword Difficulty (Labs) ───────────────────────────────────────────
  try {
    let data = await postOne(`${DFS}/dataforseo_labs/google/bulk_keyword_difficulty/live`,
      { keywords: kws, location_code: locationCode, language_code: languageCode }, authHeader);
    if (langRejected(data)) {
      data = await postOne(`${DFS}/dataforseo_labs/google/bulk_keyword_difficulty/live`,
        { keywords: kws, location_code: locationCode }, authHeader);
    }
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

// Split a mixed list and enrich each script with its language (Arabic ↔ ar).
async function enrichKeywordsMixed(keywords, locationCode, authHeader, enLang = 'en') {
  const ar = (keywords || []).filter(k => /[؀-ۿ]/.test(k));
  const en = (keywords || []).filter(k => !/[؀-ۿ]/.test(k));
  const out = {};
  if (en.length) Object.assign(out, await enrichKeywords(en, locationCode, enLang, authHeader));
  if (ar.length) Object.assign(out, await enrichKeywords(ar, locationCode, 'ar', authHeader));
  return out;
}

module.exports = { enrichKeywords, enrichKeywordsMixed };
