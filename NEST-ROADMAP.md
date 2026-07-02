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

---

## ⭐ INTERNATIONAL REBUILD — keyword-first (supersedes the blind meta sweep)

**Root cause (evidenced, not assumed):** the intl meta sweep was **meta-first** — it wrote titles/descriptions with NO target keyword, position, KD, or impressions feeding it. And the keyword research underneath is **garbage**: pulled real data — KSA ~50% junk, Bahrain ~80% junk (Saudi Ministry of Foreign Affairs, National Museum, Zain telecom, prayer times, competitor *restaurant brand names*, generic "مطعم") all scored as *top* opportunities. Cause: discovery leans on broad idea-expansion + a **negative-only, English-substring filter** that fails open on Arabic. KD is null almost everywhere.

**Why UAE looked better:** ~75% relevant — but ONLY because the English filter works on an English-primary market + rich home GSC. UAE still has competitor-brand noise, null KD, and no crawler. **UAE is the right EXECUTION pattern, not a clean foundation.**

**Why SEMrush is genuinely good (the model):** it sources keywords from YOUR domain's rankings + YOUR COMPETITORS' rankings — relevant *by construction*, not by a filter bolted on after. The Nest has the same ingredients (GSC + competitor-ranked-keywords) but under-uses them, leaning on contaminated idea-expansion instead.

**Principle:** keyword-first · relevance-by-source · validate top-20-per-market before building anything on top.

### Phases
1. **Trustworthy keyword targets** — PRIMARY sources = GSC (what we rank for) + competitor-ranked-keywords (relevant by construction). Idea-expansion demoted to a supplement behind a **positive multilingual allowlist** (`RELEVANT_ROOTS` — must carry a product/food root; generic "restaurant"/"مطعم" alone is NOT enough → kills competitor names). Fix null KD. Score by relevance×volume×winnability×intent (not volume-only). Allowlist gates ideas+competitor, NOT GSC. Acceptance gate: eyeball top-20/market. **STATUS: positive allowlist BUILT + offline-validated (KSA 100→28, BH 100→12, UAE 100→59 — garbage removed). REMAINING: competitor-source enrichment, KD fix, scoring redesign.**
2. **Crawler / page + GSC inventory** — net-new for UAE too. Where the crawler earns its place (Phase 2, NOT first).
3. **Keyword→page mapping + prioritization** — the opportunity list (keyword, position, KD, volume, target page) that must exist *before* any meta.
4. **Execution, keyword-first** — KEEP UAE's `runMarketDataDrivenSEO` (GSC-driven) pattern; DISCARD the blind `runMarketPageMetaSweep`.
5. **Measurement** — closed-loop attribution.

**Keep:** GSC-driven path, competitor matrix, guards (fact/length/voice). **Discard:** blind meta sweep, idea-expansion-as-primary, volume-only scoring, English-only filter. Effort ~5–6 wks. This upgrades UAE too, not just international.

### Progress
- ✅ v7.4.40 (Phase 1, step 1): positive multilingual relevance allowlist (`RELEVANT_ROOTS` + `isRelevantKeyword`) added to `applyStaticFilter` in keyword-discovery-background.js. Offline-validated against live garbage. Kills ministries/museums/telecoms/prayer-times/competitor-brand-names.
- ✅ v7.4.47 (Phase 1, steps 2+3 — DEPLOYED; live top-20 validation still owed): keyword-first rebuild of `discoverKeywords`.
  - **GSC + competitor are now PRIMARY sources.** GSC-ranked keywords become opportunity candidates directly (not just position annotation) — captures quick-wins we currently miss; GSC bypasses the allowlist (relevant by construction). Competitor keywords stay filtered. Idea-expansion demoted to supplement.
  - **Scoring redesign** (`scoreOpportunity`): `relevance × (0.35·volume + 0.25·winnability + 0.25·intent + 0.15·gap)`. Relevance-by-source is a MULTIPLIER (gsc 1.0 / competitor 0.9 / idea 0.75) so weak-source keywords can't out-score primary ones on raw volume. New `intentScore` (transactional>informational, EN+AR) and `winnabilityScore` (KD-driven, softened by our proximity) replace the old CPC/reachability heuristic.
  - **KD=0 = UNKNOWN, not easy.** `winnabilityScore` maps null/≤0 KD to neutral 0.5; enrichment stores KD=0/null as `null`. No-data long-tail can no longer masquerade as a slam-dunk.
  - **Enrich-before-score.** Volume/CPC/KD now enriched for ALL candidates BEFORE scoring (batched → ~2 calls/lang, cheap), fixing the old enrich-after-slice bug that dropped 0-volume GSC/competitor keywords before backfill.
  - Offline sanity-checked: GSC quick-win (#14) 0.810 > competitor (900 vol) 0.626 > high-vol idea (5000 vol, KD=0) 0.544 > informational recipe 0.203. Acceptance gate (eyeball top-20/market live) STILL PENDING — needs deploy after rotations.
