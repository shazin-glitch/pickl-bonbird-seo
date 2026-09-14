# The Nest — Reporting Refinement Plan

**Author:** 2026-09-14 · **Status:** PLAN — awaiting approval, no code changed
**Companion to** `NEST-REFINEMENT-PLAN.md` (this is the meticulous version of its Phase 7, expanded because reporting is the heart of the tool's value).
**The challenge (Shazin):** *"I can see trends, but I can't see the results of my actions/work. The CEO scorecard shows what was done, the results, and position movement — the State of SEO tab isn't at that level. Look at what we report where, refine it, and get data that helps us understand and do better."*

---

## 1. The core diagnosis

The tool reports three of the four reporting lenses, and is missing the one that matters most to an operator:

| Lens | Question it answers | Where it lives today | Verdict |
|---|---|---|---|
| **Inventory / State** | "What's live and how's each page doing *now*?" | State of SEO (new) | ✅ good |
| **Trends** | "How are we tracking *over time* overall?" | Report tab (impr/clicks/traffic-value/position-bands) + rank-tracker rollup | ✅ good — this is what you value, keep it |
| **Action** | "What do we do *next*?" | Opportunities + Perch | ✅ (just built) |
| **Outcomes** | "Did the work I *did* produce results?" | **nowhere in-tool** (only the manual CEO scorecard) | 🔴 **the gap** |

**Why the gap exists — it's a data problem, not just a UI one.** To show "results of my work" you need two things joined: (a) a record of *what work was done and when*, and (b) the *movement since*. Today (a) barely exists — `positionAtPublish` was stamped on approval items, and those are mostly gone; nothing logs "we published/edited page X" or "we completed task Y" as a durable event. So the outcome loop can't close. `content-outcomes` tries, but it matches keyword *strings* (fragile, market-blind) and is never surfaced.

**Design principle:** State of SEO should NOT try to become the scorecard — they're different jobs (inventory vs. results). The fix is to *add the Outcomes lens*, not overload an existing one.

---

## 2. What's reported where today (the audit)

From the frontend IA audit + direct read of `renderReports`:

| # | Surface | Shows | Source | Disposition |
|---|---|---|---|---|
| A | Rankings → Keyword Rankings | per-keyword current position/clicks | live GSC (query) | **retire** → duplicate of B/State |
| B | Rankings → Rank Tracker | per-keyword position + weekly Δ + sparkline | rank-tracker (weekly snapshots) | **keep** → the trend-accurate ranking source |
| C | Rankings → Organic Traffic by Market | clicks/impr/pos per market | market-traffic (page-dim) | **merge** into State/Trends (it's market rollup) |
| D | Report → metric cards | top-10, impr/clicks 90d, **traffic value AED**, position distribution | live GSC | **keep** (Trends) — traffic value is a great CEO metric |
| E | Report → Rank Tracker rollup | visibility, top3/10, improving/declining, movers | rank-tracker | **keep** (Trends) |
| F | Published & Tracking | per published item: posAtPublish→now, index | approval items | **replace** → superseded by the Outcomes view (approval items are unreliable) |
| G/H | Dashboard + Analytics overview cards | top-10 count | live GSC | **dedupe** to one definition |
| I | Markets tab | per-market status | mixed | **merge** into State of SEO market rollup |
| J | Report → AI Search | AIO + LLM mentions | ai-overview/llm-mentions | **keep** but give it a clear home (currently buried) |
| K | Report → GA4 | organic sessions | GA4 | **keep** (Trends) |

**The overlap tax:** "what position is keyword X?" has 3 answers (A live / B weekly / F cron); "top-10 count" has 3 sources (D/G/H) with different denominators. Consolidation kills these so one number = one place.

---

## 3. The target: four lenses, one home, no overlap

Reorganize the **Analytics & Reports** area into four sub-views, each with one job:

1. **Outcomes** *(NEW — "did our work pay off?")* — the in-tool, always-current version of the CEO scorecard.
2. **State of SEO** *(have it)* — inventory + current per-page performance + market rollup (absorbs C + I).
3. **Trends** *(rework of the Report tab)* — impr/clicks/traffic-value/position-distribution **over time** + rank-tracker movers (D + E + K) + AI Search (J).
4. **Opportunities** *(have it, now relevance-gated)* — the demand side, feeding Perch.

Retire A, F, G/H duplicates, and the standalone Markets tab; fold their unique value into the above.

---

## 4. The Outcomes lens — designed in detail (the gap-filler)

**What it shows** (per brand × market, always current):
- **Work shipped** in a period: pages we created/edited, meta changes, Perch tasks completed — each with date + target keyword.
- **Result per item:** position at ship → position now, clicks since, verdict (▲ improved / ● flat / ▼ declined / ⏳ too new).
- **Roll-up:** "This month: N pages shipped, X ranking (avg pos Y), driving Z clicks; N improved, M flat." ← this is the scorecard, live.
- **Win/loss learning:** which *page types / markets / actions* produce results (e.g. "venue pages in high-demand markets rank; product pages in low-demand markets don't yet") — so we double down on what works.

**The data it needs (what we must start capturing):**
- **`seoEvents:<brand>`** — a durable, append-only work log. One entry per action: `{type: published|edited|meta|task_done, url, keyword, market, at, actor, note}`. Written by: create-draft/publish path, Perch task completion, and (backfill) the registry's `nestCreated` + `firstSeen` as a proxy for pages already live. **This is the missing "work" side of the closed loop** and the single most important new thing to build.
- **Movement** comes from the page-attributed weekly `pageSnapshot` series we already ship — so attribution is *page-first* (reliable), replacing `content-outcomes`' keyword-string matching.

**Honest limitation:** on day one the event log is thin (we're starting to record now; approval history is gone). We backfill what the registry knows (`nestCreated` pages, `firstSeen`), and it strengthens every week as new work is logged — same "builds over weeks" as the snapshots. I won't fake a full history.

---

## 5. "Help us do better" — the analysis layer (once Outcomes exists)

- **CTR gap:** a page ranking well (pos ≤10) with low/zero CTR = a title/meta problem, not a ranking problem. Surface `expected CTR for position vs actual` → concrete title-rewrite tasks (auto-flows to Perch).
- **What's working, by segment:** outcome verdicts grouped by page type / market / action type → tells us where to invest (the win/loss view above).
- **Time-to-rank:** how long our pages take to reach page 1 by market → sets realistic expectations (Pakistan fast, Oman/Qatar slower) and flags pages that are overdue.

---

## 6. Phased build (additive, verify each; retire only after the replacement is proven)

- **7a — SEO event log** (`seoEvents:<brand>`): start recording work events now (publish/edit/task-done) + backfill from the registry. Pure addition; nothing changes visibly yet. *This is the keystone — history only accrues once it's running.*
- **7b — Outcomes view:** build the lens on `seoEvents` + `pageSnapshot` + registry; retire `content-outcomes`' keyword-matching in favour of page-attribution. Replaces Published & Tracking (F).
- **7c — Consolidation:** reorganize Analytics into the 4 lenses; retire the Rankings triple-stack (A/C) and the duplicate top-10 sources (G/H); fold Markets (I) into State. **Meticulous rule: migrate each valued piece (traffic value, position bands, movers, AI Search) into its new home and verify it renders before deleting the old surface.**
- **7d — Analysis layer:** CTR gap + win/loss-by-segment + time-to-rank, with CTR fixes auto-flowing to Perch.

Then finish the deferred Phase-2 retirement (kill the market-blind query-only position path) as part of 7b/7c, since Outcomes/Trends will read the page-attributed model.

---

## 7. Guardrails (consolidation must not break what you rely on)

- **Nothing retired until its replacement is live-verified** — especially the Report tab pieces you value (traffic value AED, position distribution, movers). They move, they don't disappear.
- One number, one place: after 7c, "position of keyword X" and "top-10 count" each resolve to a single source.
- `npm run check` before every commit; no `schedule` on HTTP-invoked fns; verify read-only / throwaway-draft only.
- Each phase ships and is verified independently; the board/tabs stay working throughout.

---

## 8. Recommended sequence & the one call for you

Recommended: **7a now** (start logging work events — the sooner it runs, the sooner Outcomes has real history), then **7b** (the Outcomes view — the thing you actually asked for), then **7c** consolidation, then **7d** analysis.

Two decisions that are yours:
1. **Scope of the Outcomes view first cut** — just Nest-created pages, or all work (incl. manual WP edits we log going forward)?
2. **Consolidation appetite** — reorganize into the 4-lens structure in one pass (cleaner, bigger change), or add Outcomes alongside the current tabs first and consolidate later (safer, temporary duplication)?
