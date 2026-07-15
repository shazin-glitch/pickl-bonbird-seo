# The Nest — Build Roadmap & Cost

> Working scope doc, agreed v7.4.36 (June 2026). Companion to SETUP.md.
> Shareable with leadership. Status legend: ✅ done · 🔧 in progress · 📝 spec'd, not built · 🔴 not started.
> **⚠️ Statuses below reconciled to reality 11 Jul 2026 (was drifted). The current BUILD SEQUENCING lives in `/PLAN-FOR-OPUS.md` (P0→P6); this doc is the leadership/cost view. Verified bug/security audit: `/BUGS-AND-SECURITY.md`.**

## Status
Engine proven on the live site — The Nest generates SEO fixes and publishes them to the website. Verified: a page's RankMath SEO score rose **25 → 78** after an automated meta update; meta writes confirmed in live page source. Since v7.4.36 the platform has shipped: per-market traffic reporting + rank tracker + long-term targets (v7.4.63–65), a full security-audit fix sweep (v7.4.67–69: unauth-endpoint gating, Slack request signing, onclick-XSS sweep) and a backend-correctness sweep (v7.4.70–71: queue index-truncation, live-page-unpublish, +6 more). Remaining work is breadth, unification, and hardening — not "does it work."

## Strategy
We will **not** out-index Ahrefs/SEMrush — their keyword/backlink databases are years of crawling and hundreds of millions in infrastructure. We rent what we need per-query via DataForSEO (already integrated). We win on the one thing the paid tools **cannot** do: **close the loop — find the issue, write the fix in our brand voice, publish it to the site, and measure the result — across many sites and markets.** They stop at diagnosis; we execute.

## Workstreams

| # | Workstream | Delivers | State | Effort | Est. cost* |
|---|---|---|---|---|---|
| 1 | **Trust & correctness** | Meta-quality fixes, live-vs-draft tracking fix, decimal rounding, security+backend audit, + verify the untested v7.4.13–28 backlog | 🔧 Mostly done | ~2 wk | $300–700 |
| 2 | **Site scanner (crawler)** | Auto-crawls every page and flags issues (DataForSEO OnPage API) — the independent audit, automated & weekly | ✅ Built (v7.4.52) 🔧 needs cron cadence + crawl-diff view | ~1.5–2 wk | $400–800 |
| 3 | **Close the loop** | Scanner findings auto-route to generators → published fixes (schema, meta, content, location pages) | 🔧 Partial — content-outcomes measurement live; content-intelligence built (untested); scanner→generator routing not built (= P1) | ~1.5 wk | $300–650 |
| 4 | **Reporting engine** | Rankings + traffic value + site health in one view; monthly per-market reports; GBP/speed PDFs | 🔧 Started — per-market traffic + rank tracker + CEO rollup shipped (v7.4.63–65); monthly per-market PDF + Issues&Flags still to do (= P4) | ~2 wk | $400–800 |
| 5 | **Local SEO depth** | GBP Performance API metrics, location-health report, location-page populator | 🔴 Not started (= P5) | ~1.5 wk | $300–650 |
| 6 | **International hardening** | Group B/C data-quality + scoring + coverage fixes, verify all 9 markets, hreflang | 🔴 Not started; hreflang GENERATOR exists (hreflang.js), deployment-audit not built | ~2 wk | $400–800 |
| 7 | **Multi-site onboarding + config layer** | Add any new brand/website (Southpour, Yolk, Shadow) or MARKET without rebuilding; non-restaurant verticals; access controls (RBAC) | 🔴 Not started (= P2 in the plan — pulled EARLIER, right after pipeline unification) | ~2.5–3 wk | $550–1,100 |

> **WS7 end-game (scalability) — noted 2 Jul 2026 (Shazin).** Today market config is HARDCODED as a JS literal (`INTERNATIONAL_MARKETS` in `_lib/international-config.js`, ~15 fields/market) and DUPLICATED across ~10 code locations (CLAUDE.md add-a-market checklist: `MARKET_LOCATIONS`, `MARKET_KEYWORD_TERMS`, `calendar.js` timezones + `SP_ACCOUNTS`, `index.html` mirrors `CAL_MARKETS`/`CAL_MARKET_TIMEZONES`/`SP_ACCOUNTS_FLAT`/`SP_HAS_ACCOUNT`). Adding a market = multi-file edit + deploy, constants can drift. TARGET: single source of truth in Blobs (`marketsConfig`/`brandsConfig`) + Settings→Markets/Brands admin form + shared accessor both BE & FE read from (extend `getMarketsForBrand` to read blob, code literal = seed/fallback). Auto-derive hard fields (location_code via `resolveLocation(country)`, timezone via IANA lookup) so the form only needs country+brand+slug. Migration: seed blob from current literal, switch reads, keep literal fallback. Do AFTER core loop (WS1-3). PRINCIPLE NOW: build all new code (crawler, Stage 2) config-driven — iterate `getMarketsForBrand`/config, attribute via `getMarketPageTokens`, never hardcode market lists inline → zero rework when the config layer lands.
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
- A large body of work shipped v7.4.13–v7.4.28 was **never live-tested** (verification debt). The first real look at the meta sweep found 3/5 cards broken. This is now the explicit **P0 gate** in `/PLAN-FOR-OPUS.md` — the reporting/tracker/long-term features + the Arabic Opportunities fail-open fix must pass a signed-in live-verify pass before P1 starts. Do NOT run an international content regenerate until the Arabic fix is confirmed live.
- The biggest cost variable is **debugging iteration**, not the plan tier.
- Verified bug/security register: `/BUGS-AND-SECURITY.md`. Full build sequencing (P0–P6): `/PLAN-FOR-OPUS.md`.

## Progress log
- ✅ v7.4.70–71 — backend-correctness sweep: fixed `approvals:index` 500-truncation (was orphaning items → dedup re-spend), `update_content` unpublishing live pages, findPostByUrl wrong-page, voice-check JSON parse, tracking clobber, gsc-data rowLimit, GBP orderBy encode. (BC3/BC5/BC6/BC9 deferred into P1/P2 where the surrounding code is rewritten once — see BUGS-AND-SECURITY.md.)
- ✅ v7.4.67–69 — security audit fixes: gated unauthenticated GET leaks (keyword-opportunities, approvals, calendar), added Slack request-signing verification, swept onclick-XSS class (`escJs`), fixed a review-queue crash.
- ✅ v7.4.63–65 — SEO reporting: per-market GSC traffic (dated, branded/non-branded), rank tracker (weekly position history + CEO rollup), long-term-target worklist group. (WS4 started.)
- ✅ v7.4.52 — site crawler BUILT (`onpage-audit-background` DataForSEO OnPage, sitemap crawl, per-market rollup, Technical-SEO tab). (WS2 delivered.)
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
- ✅ **v7.4.48–51 — Phase 1 COMPLETE + live-validated (2 Jul 2026).** (48) own-domain ranked_keywords URL-attributed by market fixed cross-market contamination; (49) first-party **GSC page+query** (`_lib/gsc.js`) as primary "what we rank for", covers non-Labs markets (Qatar/Oman/Pakistan); (50) rowLimit→25000; (51) **SEMrush/Ahrefs-grade opportunity scoring** = `relevance × (0.30·vol[capped] + 0.30·positionOpportunity + 0.20·intent + 0.20·winnability[KD-only])` — position-opportunity is the primary lever (quick-win 11-20=1.0, gap=0.9, push=0.55, already-top-10=0.15), GSC organic now gated by `passesStaticRelevance`, vol-0 top-10 noise dropped. Live PASS: KSA/Bahrain/Qatar clean, quick-wins/gaps on top, no junk. Oman=0 (0 indexed pages — reality; seeded the "Issues & Flags" backlog).

## Competitive read — is "the rest" (research/audit/tracking, i.e. everything except publish) at SEMrush/Ahrefs par? (2 Jul 2026)
| Capability | SEMrush/Ahrefs | The Nest | Verdict |
|---|---|---|---|
| Keyword research (vol, KD, intent, ideas) | deep | rebuilt, market-correct | ~85% at par |
| Competitor keyword gap | ✅ | competitor ranked-keywords + gap | ~80% at par |
| **Keyword → page → action** ("Opportunities"/"Organic Pages") | ✅ | UAE only, not surfaced | **Stage 2 — building** |
| **Site audit / crawler** (on-page issues, health) | ✅ crown jewel | PageSpeed only | **biggest gap (Phase 2)** |
| Rank tracking (visibility %, trend, tags) | ✅ | raw GSC pos + weekly snapshots | ~60% needs tracker view |
| Traffic value/estimation per kw & domain | ✅ | receive etv/CPC, barely surfaced | cheap win — surface it |
| Backlinks (ref domains, anchors, toxic) | ✅ deep | ref-domains + compare (now unpaywalled) | ~50% |
| Keyword clustering / topical maps | ✅ | ❌ | missing |
| On-page recs + writing + PUBLISH | recommend only | recommend + write + **publish** | **we exceed** |
Bottom line: research ~at par; the two real "they have, we need" gaps are **(1) site audit/crawler** and **(2) keyword→page→action layer (Stage 2)**. Rest is polish (surface traffic value, rank-tracker view, clustering). We already beat them on execution (the loop).

## ⭐ STAGE 2 (= rebuild Phase 3) — "Action Plan": keyword → page → recommended action (NEXT BUILD, planned 2 Jul 2026)
**Why:** turns the (now trustworthy) opportunity list into a concrete worklist so we can actually start shipping changes and growing traffic. Highest-value research gap + the on-ramp to execution. Crawler (Phase 2) mostly *feeds* this, so it comes after.
**De-risked by reuse:** every ingredient exists. UAE already maps keyword→page→action: `fetchGscWithPages`→`gscPageCache` (store.js:277, dims query+page) + 4 action types in scheduler-background.js (quick_wins pos11-20→rewrite page; meta_rewrites pos≤20+CTR gap→fetch current meta+rewrite; content_gaps pos21+/seed→blog; page_creation location-intent→landing). Approval payload schema known (store.js `createApproval`: type/brand/title/payload{url,title,description,targetKeyword,wpAction,voiceScore,currentPos,...}). Competitor page-to-beat already stored (matrix `topDomains.url` + `competitorRankedKeywords` items carry `url`, v7.4.27). UI: `renderOpportunitiesTable` (index.html:8402) is the template; new Analytics sub-tab after "Opportunities"; `queueOppKeyword` (8315) already turns an opp into an approval.
**Phases (value each step; NO Claude spend until 2c):**
- **2a (backend, free):** enrich each opportunity in keyword-discovery-background.js with `targetPage` (URL we rank on — kept from GSC page+query, currently discarded; null=no page), `competitorPage` (top competitor URL from matrix), `recommendedAction {actionType,label,rationale}` via new `recommendAction()` reusing UAE tier→action rules + location-intent routing (blog vs landing). Acceptance: re-run KSA/Bahrain, eyeball sensible page+action per row.
- **2b (frontend, free):** "Action Plan" sub-tab. Table: Keyword · Target page(link/"＋create") · Pos · KD · Vol · Recommended action · Competitor to beat · [Generate]. Quick-wins first. Filters market/action. This is the visible worklist.
- **2c (needs Claude credits):** [Generate] → approval item carrying actionType+targetPage+competitorPage → existing generators (fetch live meta, inject competitor ctx, voice+fact guards) → Approvals Queue → publish. Loop closed for all markets.
**Fold-in:** consolidate GSC page logic (`fetchGscWithPages` store.js vs my `_lib/gsc.js`) to one path; surface traffic value (CPC/etv) in the same table.
**Risks:** thin competitor data for small markets → competitorPage often null (degrade gracefully); content-gap keywords have no page (correct → "create"). **Cost:** 2a/2b free; only 2c generation spends Claude.
**Acceptance gate:** KSA+Bahrain Action Plan shows prioritised worklist; quick-wins→correct existing pages; gaps→"create"; Generate produces correctly-targeted approval item.
