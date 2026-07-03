// netlify/functions/_lib/seo-meta.js
// SINGLE source of truth for SEO meta length rules. Every meta generator (UAE
// scheduler + international) imports these, so title/description targets stay
// consistent and scale to any new brand/market without duplicating the numbers.
// (CLAUDE.md #12 — scalability: derive from one source, never hardcode inline.)

const META_TARGETS = {
  titleMin: 52, titleMax: 58, titleFloor: 50,   // SERP renders ~60 chars — don't leave pixels unused
  descMin: 150, descMax: 158, descFloor: 148,   // SERP renders ~155-160 chars
};

// The instruction block to drop into any meta-generation prompt. Emphasises the
// floor + "expand if short" because models routinely under-run the target range.
const metaLengthRule =
`- Title: ${META_TARGETS.titleMin}-${META_TARGETS.titleMax} characters — count them. NEVER submit a title under ${META_TARGETS.titleFloor}; if your draft is short, EXPAND it with a real menu item or a location from the brand context (never pad with filler).
- Description: ${META_TARGETS.descMin}-${META_TARGETS.descMax} characters — count them. NEVER submit a description under ${META_TARGETS.descFloor}; if short, add a specific real dish or location.`;

// Post-generation check — returns [] if on-target, else human-readable issues.
// Generators use it to flag/reject out-of-range meta rather than silently queuing it.
function metaLenIssues(title, desc) {
  const out = [];
  const t = (title || '').length, d = (desc || '').length;
  if (t < META_TARGETS.titleFloor) out.push(`title too short (${t} chars, want ≥${META_TARGETS.titleFloor})`);
  if (t > META_TARGETS.titleMax)   out.push(`title too long (${t} chars, want ≤${META_TARGETS.titleMax})`);
  if (d < META_TARGETS.descFloor)  out.push(`description too short (${d} chars, want ≥${META_TARGETS.descFloor})`);
  if (d > META_TARGETS.descMax)    out.push(`description too long (${d} chars, want ≤${META_TARGETS.descMax})`);
  return out;
}

module.exports = { META_TARGETS, metaLengthRule, metaLenIssues };
