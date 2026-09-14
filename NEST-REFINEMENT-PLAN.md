# The Nest — Refinement Plan (Reporting + Coherence Overhaul)

**Author:** audit + plan, 2026-09-14 · **Status:** PLAN — awaiting approval, no code changed yet
**North star:** *On Monday I walk in and can confidently tell the CEO: here's what happened this week, and here's the proof it's working.*

This supersedes the reporting/visibility portion of `PLAN-FOR-OPUS.md` (its P3 "visibility" + P4 "CEO layer"). It is grounded in a full read-only audit of every tab, every generator, the data model, the crons, and the Perch/roadmap backlog (5 parallel audits, 2026-09-14).

---

## 0. The one root problem

**The Nest was built as feature-islands.** Each capability writes its own Blobs namespace and renders its own tab, and there is **no shared spine** for the three questions that actually matter:

1. **What is live?** (the site inventory)
2. **What happened?** (performance over time)
3. **What do we do next?** (the action list)

Every symptom below is a consequence of that missing spine.

---

## 1. Confirmed problems (with live evidence)

| # | Problem | Evidence (verified 2026-09-14) |
|---|---|---|
| P-A | **Reporting is anchored on the approval queue, not the site.** A page is only "tracked" if an approval record exists in `status:published`. | Store holds **9 items, all `pending`**; audit log shows only **8 items *ever* reached `published`** — while GSC shows **198 live pages**. ~190 live pages are invisible to the tool. |
| P-B | **The same question returns different numbers.** Three GSC methodologies (live query, weekly snapshot, per-item cron), two of them market-blind. | One keyword shows 3 positions (Rankings vs Rank Tracker vs Published & Tracking); "top-10 count" has 3 denominators. Query-only path "flooded every intl market with UAE keywords" (`SETUP.md:4151`). |
| P-C | **Opportunities has no relevance gate.** It optimizes for search volume, not brand fit. | 115 Bonbird "opportunities": 98 scraped from our own GSC impressions with no filter. "cafes near me" (vol 301k), "bowling near me", "bbq near me" all tagged top `quick_win`. Root cause: `near me`/`restaurant`/`delivery` are in the positive-match list, and GSC candidates skip the semantic filter. |
| P-D | **Three content generators, divergent metadata.** Only the newest (Planner→generate-draft) carries the full guard stack + `template` field. | Legacy `page_creation`s carry no `template` → structurally un-publishable (409). `generatedType`/`clusterMeta`/`marketTaxonomy` set by one path, absent in the other two. |
| P-E | **Perch has no inbound edges.** Every module notifies Slack; none creates a tracked task. | Only writers of `perchTask:` are manual CRUD + the one-time seeder. The "tie everything into Perch" hook was scoped and never built. |
| P-F | **Computed-but-invisible data.** Work is done, then never shown. | `contentOutcomes:<brand>` has a background job + read endpoint but **zero UI callers**. `gbpSnapshot`/`speedSnapshot`/`onpageSnapshot` are written weekly and **read by nobody** (orphan trend data). |
| P-G | **No single "what happened this week" view; no per-page trend.** | The CEO story is scattered across 3 tabs with 3 position sources. The only per-entity time-series is `rankHistory` (≤25 seeded keywords/market). No per-page weekly series exists. |
| P-H | **Redundant entrypoints.** Built where convenient, not where they belong. | 5 audit buttons, 3 review-reply surfaces, 3 keyword-opportunity surfaces. Dead PDF/print CSS (`#view-reports` no longer exists). |

**The good news the CEO should hear anyway (GSC, last 90d, verified):** the intl build works. Pakistan `/pk/` **1,422 clicks, avg pos 4.9** (home #4.7, Cue Cinemas venue #4.2); Oman & Qatar indexed and ranking pos 6–7. The tool just can't currently *show* it.

---

## 2. The target architecture — one spine

```
                    ┌─────────────────────────────────────────┐
                    │   PAGE INVENTORY  (source of truth)       │
                    │   pageInventory:<brand> — every LIVE url   │
                    │   url → market → pageType → indexed?       │
                    │   firstSeen/lastSeen · nestCreated?        │
                    └───────────────┬───────────────────────────┘
                                    │ everything joins on URL
       ┌───────────────┬───────────┼───────────────┬───────────────┐
       ▼               ▼           ▼               ▼               ▼
  PERFORMANCE     INDEXATION    OUTCOMES        AI PRESENCE     WHAT-TO-DO
  per-page wk     URL inspect   Δ vs publish    AIO/LLM         Opportunities
  snapshots       (registry)    (registry)      (registry)      (relevance-gated)
       └───────────────┴───────────┬───────────────┴───────────────┘
                                    ▼
                    ┌─────────────────────────────────────────┐
                    │  ONE REPORT  ·  "State of SEO"            │
                    │  per brand × market · fixed metric source │
                    │  = the Monday CEO view + export           │
                    └───────────────┬───────────────────────────┘
                                    ▼
                    ┌─────────────────────────────────────────┐
                    │  PERCH  (action spine)                    │
                    │  opportunities · GBP health · speed regr. │
                    │  · rejected approvals · audit findings    │
                    │  → auto-spawned, tracked tasks            │
                    └───────────────────────────────────────────┘
```

Most of the hard compute already exists (page-attributed GSC in `_lib/gsc.js`, `marketForUrlAsync`, `pageInventory`, `rankHistory`, `contentOutcomes`, the orphan snapshots). **The overhaul is mostly wiring the disconnected pieces onto one spine — not building new engines.**

---

## 3. Phased plan (additive first, retire last, verify each phase live)

Each phase is independently shippable and leaves the tool working. We do **one phase at a time**, live-verify, commit, then start the next. Nothing is deleted until its replacement is proven.

### Phase 0 — CEO unblock + cheap wins (risk: LOW · effort: S)
*Goal: a truthful Bonbird story you can present this week, and stop the bleeding.*
- 0.1 **Fix the URL-inspection `siteUrl` mismatch.** VERIFIED 2026-09-14: `scheduler-background.js:388` builds the inspection `siteUrl` from `BRANDS[brand].domain + '/'` (= `https://bonbirdchicken.com/`), but Bonbird's verified property (the one the working GSC pulls use) is `sc-domain:bonbirdchicken.com`. Mismatch → the URL Inspection API rejects every Bonbird call → `indexStatus` never populates. Pickl is unaffected (its property IS the URL-prefix form). **Fix:** use the brand's canonical `gscProperty` (`BRANDS[brand].gsc`) as the inspection `siteUrl`, falling back to the domain form only if absent — one line, config-driven, correct for both brands. NB: payoff is only visible once Phase 1 gives the tracker live pages to inspect (the approval store is near-empty today).
- 0.2 ~~Schedule `onpage-audit-background` weekly~~ **DROPPED — wrong call.** `onpage-audit-background` hits the metered DataForSEO OnPage API and its own header says *"Manual trigger or monthly cron — NEVER weekly"* (cost; CLAUDE.md rule #5). The registry does not need a weekly paid crawl. **Instead:** Phase 1 seeds the live-page list from the **sitemap** (`/page-sitemap.xml` + `/post-sitemap.xml`, free, always current) and the GSC page list; the paid OnPage crawl stays **monthly** for audit depth only.
- 0.3 ✅ **DONE — CEO scorecard delivered** (`BONBIRD-CEO-REPORT-2026-09-14.md` + shareable page) with per-page URLs, impressions/clicks/positions, verified live.
- **Done when:** index-inspection fix is deployed and verified against a known-indexed page (e.g. `/pk/lahore/cue-cinemas/`); CEO has the numbers (done).
- ✅ **STATUS: DONE (v7.9.73/74, live-verified 2026-09-14).** Index-inspection siteUrl fix shipped.

### Phase 1 — The spine: Page Inventory as source of truth (risk: LOW, additive · effort: M)
*Goal: the tool knows what's actually live.*
- **Seed the registry from the free sources**, not the paid crawl: the Yoast **sitemaps** (`/page-sitemap.xml` + `/post-sitemap.xml`) give the authoritative live-URL list at zero cost and always current; the **GSC page list** adds performance. (The monthly OnPage crawl enriches audit fields when it runs, but the registry never depends on it.)
- Enrich each page: `market` (via `marketForUrlAsync`), `pageType`, `indexed`/`robots` (a stray `noindex` like `/om/chicken-tenders/` should surface here the day it happens), `firstSeen`/`lastSeen`, and `nestCreated` (join approval records by URL).
- Expose a read endpoint; nothing else changes yet.
- **Done when:** the registry lists all ~198 live Bonbird pages with market + indexed status, including the ~190 the queue never knew about, and flags the noindex page automatically.
- ✅ **STATUS: DONE (v7.9.73/74, live-verified 2026-09-14).** `pageRegistry:<brand>` built for both brands from sitemaps + GSC + approvals: **Bonbird 205 live pages**, **Pickl 224 across 7 markets**, correct market attribution + pageType, and `/om/chicken-tenders/` auto-flagged `noindex`. Endpoints: `page-registry-background` (builder, weekly via `cron-weekly-background`) + `/api/page-registry` (read/rebuild). KNOWN LIMITATION: only flags a noindex page the registry can *see* (in sitemap ∪ GSC ∪ approvals); a noindex page with no trace is invisible — a future config-vs-live cross-check (configured venues/products missing from the registry) would close that gap.

### Phase 2 — One attribution model + real trend (risk: MED · effort: M)
*Goal: one number per question, and a per-page time-series.*
- Route all position/traffic reads through the page-attributed `_lib/gsc` + `marketForUrlAsync` (already used by `market-traffic.js` and `rank-tracker.js`). **Retire the query-only, market-blind path** (`fetchGscDirect` consumers in `scheduler-background.js` + `content-outcomes-background.js`).
- Add `pageSnapshot:<brand>:<url>:<week>` weekly series (totals + branded/non-branded split).
- Give the orphan `gbpSnapshot`/`speedSnapshot`/`onpageSnapshot` a reader.
- Fix the `gscCache` dual-writer (25000-row `{rows,pages}` vs 500-row `{rows}` clobber).
- **Done when:** a keyword shows ONE position everywhere; "how is Bonbird trending since we linked it" is answerable per page/market.
- 🟡 **STATUS: additive slice DONE (v7.9.75, live-verified 2026-09-14).** Per-page weekly snapshot `pageSnapshot:<brand>:<YYYY-Www>` written by the registry builder (205 Bonbird rows, market-attributed) + read via `/api/page-registry?snapshot=<week>`. DEFERRED (the risky part): retiring the market-blind query-only path in `scheduler-background`/`content-outcomes` — do it when Phase 3 consumes the page-attributed model, so no surface breaks mid-flight.

### Phase 3 — The Monday view (risk: MED · effort: M) ← the headline deliverable
*Goal: the single screen that answers "what happened + is it working," per brand × market, exportable.*
- One **"State of SEO"** view: rank movement + non-branded traffic + indexation + AI presence + content outcomes, all off the registry, one fixed position source (weekly snapshots).
- **Surface `contentOutcomes`** (endpoint already exists) — close the loop.
- Collapse the triple-stacked Rankings tab into this; fix/replace the dead PDF export.
- **Done when:** you open one tab, pick Bonbird, and screenshot the CEO story.
- ✅ **STATUS: DONE (v7.9.76, live-verified 2026-09-14).** New Analytics → **State of SEO** sub-tab (first tab), reads `pageRegistry` + `content-outcomes`. Bonbird view live-verified: tiles (205 pages / 46% indexable / 9,680 clicks / 8.7 avg pos / 1 noindex flag), by-market rollup, filtered page table. content-outcomes now surfaced in the UI (first time ever). Weekly trend deltas fill in from week 2 of snapshots.

### Phase 4 — Opportunities relevance gate (risk: LOW, isolated · effort: S–M)
*Goal: the Opportunities tab stops lying.*
- Config-driven relevance: positive anchor from `cuisine`/`menuCategories`; merged vertical + brand `offMenu` negatives; treat `near me`/intent/location as **modifiers, not qualifiers**; run GSC candidates through the same gate; change the Claude gate from fail-open to fail-safe on obvious-noise batches.
- **Done when:** "bowling near me" / "cafes near me" no longer appear for Bonbird, and the list reads like a fried-chicken growth list.
- ✅ **STATUS: DONE (v7.9.77 + v7.9.78, live-verified 2026-09-14).** Removed intent/location tokens from `VERTICALS.restaurant`/`.cafe` roots + merged brand `offMenu` in `relevanceConfigFor`. Also un-trapped `keyword-discovery-background` (it had its own `schedule` → the on-demand regenerate was silently 403'd; now fired via the dispatcher, HTTP-invocable). Live regen: bad keywords 11→3, count 115→101, "bowling/cafes/cafeteria/breakfast/bbq near me" + "chicken salad near me" all gone; top opps now chicken-fry/burger-near-me/best-burger-dubai. Residual: one Arabic "diet restaurant near me" slipped the ARABIC path in competitor-matrix (accepts مطعم) — minor follow-up, same treatment as the EN gate.

### Phase 5 — Pipeline unification (risk: MED-HIGH · effort: M-L) — the existing P4
*Goal: one brand×market pipeline.*
- Retire legacy generators A (`scheduler-background` content jobs — already inert) and B (`international-seo-background`); express their unique value (per-market meta sweep) as Planner plan-items through `generate-draft`.
- Consolidate the two drifted queue modules (`store.js createApproval` vs `approvals.js createItem`) into one so metadata is written uniformly.
- Remove the `MARKET_KEYWORD_TERMS` hardcode + the `getLocationTag` Pickl branch.
- **Done when:** adding a brand/market needs zero code edits across the *whole* pipeline, and every queue item carries uniform metadata.

### Phase 6 — Perch as the action spine (risk: LOW, additive · effort: M)
*Goal: findings become tracked work automatically.*
- Cross-module → Perch hook: relevance-gated opportunities, GBP health flags, speed regressions, rejected approvals, and audit findings spawn tracked Perch tasks (impact×effort ranked; high-touch → Perch, low-touch → content queue).
- **Done when:** nothing important lives only in a dashboard you have to remember to check.
- ✅ **STATUS: DONE (v7.9.79/79c/79d, live-verified 2026-09-14).** `perch-sync-background` turns registry findings into tracked Perch tasks (noindex, missing-sitemap[0-impr], indexed-but-0-clicks[top-5, assets excluded], GBP gaps per non-UAE venue market, ranking drops[activate at 2+ snapshots]). Guardrails: dedup by `sourceId` (all statuses), 30/run cap, severity→priority. Chained off the registry build + fired weekly by `cron-weekly-background`. Slack `perch_autosync` ping per run **lists every task** (fires only on new work; verified `{sent:true}`). Board cleared + requeued clean (4 high + 10 medium). DEFERRED: curated top-keyword-target promotion. NOTE: dedup spans done tasks, so a fixed-then-regressed issue won't re-alert — switch to open-only dedup if regression alerts are wanted.

### Phase 7 — Consolidate & tidy (risk: LOW · effort: S)
- Collapse 5 audit buttons → 1, 3 review surfaces → 1, 3 opportunity surfaces → 1 canonical each.
- Retire legacy `reports`/`international`/`#view-reports` remnants; refresh the stale `SETUP.md` Blobs table.

---

## 4. Guardrails — how we do NOT repeat the plug-n-play breakage

The last big refactor (making the tool "plug-n-play") broke most functions. Non-negotiable rules for this overhaul:

1. **One phase at a time.** Ship, live-verify, commit, *then* start the next. No multi-phase mega-commits.
2. **Additive before subtractive.** Build and prove the replacement before deleting the old path (esp. Phases 2 & 5). Every retirement is its own verified step.
3. **`npm run check` before every commit** — not just `node --check`. Three real bugs shipped because `node --check` can't see an out-of-scope var swallowed by try/catch.
4. **Never re-add a `schedule` to an HTTP-invoked function.** `scheduler-background`/`international-seo`/`technical-seo` are fired via the dispatcher precisely because a `schedule` 403s their on-demand buttons.
5. **Verify read-only or against throwaway drafts** — never a live page as a test fixture (this rule exists because a "control" write overwrote the live Bonbird homepage).
6. **Config-driven or it's not done** (rule #2) — every relevance/market/brand assumption derives from config, no new hardcoded lists.

---

## 5. What folds in from the roadmap / Perch (already-planned, never built)

These stop being separate backlog items and become part of the spine:
- "Automated monthly SEO report per website + market" → **Phase 3**.
- "Reports: add per-market awareness (UAE-only today)" → **Phases 2–3**.
- "Tie everything into Perch (cross-module task creation)" → **Phase 6**.
- "Add traffic estimation (surface `etv`)" → **Phase 3**.
- "Deep-audit → prioritised action plan" → **Phase 6**.
- Surface `contentOutcomes` → **Phase 3**.

Separately tracked (data-integrity, feed reporting but not part of this spine): the local-SEO hardcodes (`addressCountry:'AE'`, `@type:'Restaurant'`), Arabic-Opportunities-fails-closed, and P0 verify debt. Flag before any intl regenerate.

---

## 6. Recommended first milestone

**Phase 0 + Phase 1** in one working session: you get a truthful Monday story immediately (0.3), index badges start working (0.1), and the tool gains an honest picture of what's live (Phase 1) — all low-risk and additive, nothing retired. That de-risks everything after it, because Phases 2–3 build the real reporting on a registry we've already proven.

---

## Decisions (confirmed 2026-09-14)
1. **Sequence:** ✅ Start with **Phase 0 + Phase 1** (Shazin approved). Phase 0.3 (CEO report) delivered first — see `BONBIRD-CEO-REPORT-2026-09-14.md`.
2. **Scope:** ✅ **The spine is brand-agnostic tool architecture — build it once for BOTH brands** (Shazin's correction: the registry, one attribution model, and one report are read-only and don't depend on brand). The "Bonbird-first" caution applies ONLY to the phases that *write/publish* content (Phase 5), where touching Pickl's in-flux site is risky. Reporting/registry/attribution (Phases 1–3, 6) cover Pickl + Bonbird together.
3. **CEO output:** ✅ **All three** — live in-tool view (Phase 3 core) + weekly Slack digest + monthly PDF export.
