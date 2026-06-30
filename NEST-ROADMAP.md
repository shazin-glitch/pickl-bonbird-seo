# The Nest — Build Roadmap & Cost

> Working scope doc, agreed v7.4.36 (June 2026). Companion to SETUP.md.
> Shareable with leadership. Status legend: ✅ done · 🔧 in progress · 📝 spec'd, not built · 🔴 not started.

## Status
Engine proven on the live site — The Nest generates SEO fixes and publishes them to the website. Verified: a page's RankMath SEO score rose **25 → 78** after an automated meta update; meta writes confirmed in live page source. Remaining work is breadth and hardening, not "does it work."

## Strategy
We will **not** out-index Ahrefs/SEMrush — their keyword/backlink databases are years of crawling and hundreds of millions in infrastructure. We rent what we need per-query via DataForSEO (already integrated). We win on the one thing the paid tools **cannot** do: **close the loop — find the issue, write the fix in our brand voice, publish it to the site, and measure the result — across many sites and markets.** They stop at diagnosis; we execute.

## Workstreams

| # | Workstream | Delivers | State | Effort | Est. cost* |
|---|---|---|---|---|---|
| 1 | **Trust & correctness** | Meta-quality fixes, live-vs-draft tracking fix, decimal rounding, + verify the untested v7.4.13–28 backlog | 🔧 In progress | ~2 wk | $300–700 |
| 2 | **Site scanner (crawler)** | Auto-crawls every page and flags issues (DataForSEO OnPage API) — the independent audit, automated & weekly | 📝 Spec'd, NOT built | ~1.5–2 wk | $400–800 |
| 3 | **Close the loop** | Scanner findings auto-route to generators → published fixes (schema, meta, content, location pages) | 🔴 Not started | ~1.5 wk | $300–650 |
| 4 | **Reporting engine** | Rankings + traffic value + site health in one view; monthly per-market reports; GBP/speed PDFs | 🔴 Not started | ~2 wk | $400–800 |
| 5 | **Local SEO depth** | GBP Performance API metrics, location-health report, location-page populator | 🔴 Not started | ~1.5 wk | $300–650 |
| 6 | **International hardening** | Group B/C data-quality + scoring + coverage fixes, verify all 9 markets, hreflang w/ dev | 🔴 Not started | ~2 wk | $400–800 |
| 7 | **Multi-site onboarding** | Add any new brand/website (Southpour, Yolk, Shadow brands) without rebuilding; non-restaurant verticals; access controls (RBAC) | 🔴 Not started | ~2.5–3 wk | $550–1,100 |
| — | **Cross-cutting** | Perch task-hub, auth follow-ups, voice-gate consistency — woven through | — | ~1.5 wk | $300–650 |

## Timeline
- **~5–6 weeks** → a tool that beats the paid options on execution (Workstreams 1–3).
- **~13–16 weeks** → the full platform (all workstreams). Value ships every couple of weeks, not at the end.

## Cost
\*Figures are the **gross ceiling** (every token paid fresh). The existing **Pro plan already includes weekly usage** that absorbs part of each build week, so real top-up spend is lower.
- **Full build:** ~$3,000–6,000 ceiling.
- **Core (WS1–3):** ~$1,000–2,150.
- Workstream 1 (underway) gives the **measured** burn rate to replace these estimates.
- **Funding:** stay on Pro annual + metered top-ups. **No 20x Max (~$200/mo) needed. No SEMrush/Ahrefs subscription, ever** (we build the scanner; rent only data we can't produce).

## Honest caveats
- A large body of work shipped v7.4.13–v7.4.28 was **never live-tested** (verification debt). The first real look at the meta sweep found 3/5 cards broken — so Workstream 1 may expand as we test the rest.
- The biggest cost variable is **debugging iteration**, not the plan tier.

## Progress log
- ✅ v7.4.36 — meta sweep quality hardening (markdown strip, smart truncation, min-length guard, page-type keyword in title). Workstream 1 started.
- ✅ v7.4.29–35 — international meta/on-page pipeline: live-content generators, publishing safety, dedup, full-page sweep + slug-token discovery, exclude list, truncation fix, cron disabled (manual trigger).
- ✅ Loop + meta verified live (RankMath 25→78).
