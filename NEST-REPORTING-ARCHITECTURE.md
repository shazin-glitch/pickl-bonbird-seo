# The Nest — Reporting Architecture (the designed system)

**Author:** 2026-09-15 · **Status:** PLAN — for approval. Supersedes the incremental approach in `NEST-REPORTING-PLAN.md`.
**Why this exists:** the reporting was being fixed tab-by-tab, and each review surfaced another missing capability (date range, branded/non-branded, keyword management…). That's patchwork. This plans the whole layer around the *complete* capability set (from a full inventory of all 13 current surfaces) so it's built as one coherent system, with **every capability given exactly one home** and a **shared foundation** so nothing is re-implemented per tab.

---

## 1. The goal

One coherent reporting system where Shazin — and the CEO — can see, at a glance and over time, that **SEO is working**:
- **Organic growth month-on-month**, especially **non-branded** (SEO creating new demand, vs branded = awareness),
- **overall and per market/country**, **sliceable by any date range**,
- plus **what's live now**, **what our work produced**, and **what to do next**,
- presentation-grade, **scalable across brands × markets** (a new market = config only), with **no overlapping or contradictory surfaces**.

---

## 2. Design principles (what stops the patchwork)

1. **One capability, one home.** Every metric/control/chart lives in exactly one lens. The coverage matrix (§4) is the contract.
2. **Shared foundation, not per-tab reinvention.** A single control bar (brand · market · date range · branded/non-branded), one data model, one visual system, one refresh pattern — reused by every lens.
3. **Data computed once, consumed many times.** Each data layer is built by one job and read by whichever lenses need it.
4. **Additive → migrate → retire, in that order.** Build the new home, verify coverage, then retire the old surface. Nothing retires before its replacement is proven.
5. **Config-driven / scalable.** Markets and brands come from config; charts default to overall with drill/toggle so they never clutter at high market counts.

---

## 3. Target structure — 5 lenses + the action spine

Collapses 13 surfaces into 5 coherent lenses (+ Perch). Each owns a clear question:

| Lens | Question | Absorbs (today) |
|---|---|---|
| **Performance** (Trends) | "Is organic growing — over time, per market, branded vs non-branded?" | Rankings→Traffic-by-Market, most of Report (distribution, traffic value, AI presence, GA4, rank rollup/movers, goals, PDF), Markets tab |
| **State of SEO** | "What's live right now and how healthy is it?" | State (have it) + Technical SEO + Backlinks/authority + Markets per-market rollup |
| **Outcomes** | "What did the work we shipped produce?" | Outcomes (have it) |
| **Keywords** | "What are we tracking / what should we target?" | Rankings→Rank Tracker (management), Opportunities tab |
| **Competitors** | "Where do we stand vs competitors?" | Competitor Matrix + SoV + Gaps + domain Audit + discovery (keep) |
| **→ Perch** (action spine) | "What do we do next?" | already built — findings auto-become tasks |

Retired/absorbed: the Rankings triple-stack, the Report tab (becomes an *export* of Performance), the Markets tab, the duplicate Dashboard/overview top-10 cards.

---

## 4. Coverage matrix — every capability → its one home

*(the anti-gap contract; sourced from the full inventory)*

**Performance (Trends)**
- Impressions / clicks / CTR / avg position — **MoM trend + custom date range**, overall + per market
- **Branded vs non-branded** toggle (the key SEO signal) — on every metric
- Position distribution (1–3 / 4–10 / … bands)
- Rank movers (▲/▼ weekly, from rank-tracker)
- Traffic value (AED, non-branded × CPC)
- AI presence — AI Overview % + LLM mentions (summary + trend)
- GA4 organic sessions + AI-referral traffic
- Share-of-Voice trend (from competitor data)
- Goals & Progress (targets vs actual)
- **PDF export** (this lens *is* the CEO report)

**State of SEO**
- Live pages count, % indexed, noindex flags, per-page table
- Per-market rollup (pages / impressions / clicks / avg pos)
- Site health: PageSpeed / Core Web Vitals / technical checks / site-audit issues
- Authority: backlinks / referring domains / dofollow % / domain score / new-lost

**Outcomes**
- Shipped work → position-at-ship vs now, clicks since, verdict
- "What's working" by market / page type
- Needs-attention (noindex, drops, indexed-no-clicks) → Perch

**Keywords**
- Rank Tracker: tracked set, current/Δ/sparkline, **add / pin / remove / reseed** (management)
- Keyword Opportunities: scored gaps, tier, vol/KD/CPC, recommended action → **Generate / Queue / Perch**

**Competitors**
- Matrix (our rank vs each competitor, SERP features, movement)
- Share of Voice (bars + trend + SERP landscape)
- Gaps (competitor keywords we miss) → Queue
- Domain Audit (their keywords / PageSpeed / on-page / Action Engine → Queue/Perch/Dev)
- Auto-discovery of unknown competitors + alerts
- CSV export

**Shared foundation (used by all)**
- Brand selector · Market selector · **Date-range picker + presets (28/90d/6mo/12mo/custom)** · Branded/Non-branded toggle · refresh
- Visual system: Archivo/Hanken typography, framed cards, theme-aware, one chart style

Nothing from the inventory is unhomed. Overlaps (top-10 count ×8, rank-tracker ×3, traffic value ×3, opportunities ×5, position distribution ×2, brand/market selectors everywhere) each resolve to a single owner above.

---

## 5. The unified data model (built once)

Most already exists; the redesign is mainly a coherent UI + a shared control layer + a few data enhancements.

| Layer | Status | Change needed |
|---|---|---|
| `pageRegistry:<brand>` (live pages, market, index) | ✅ built | — |
| `pageSnapshot:<brand>:<week>` (per-page weekly) | ✅ built | — |
| `seoEvents:<brand>` (work log) | ✅ built | — |
| `monthlyTrend:<brand>` (per-month, per-market impressions/clicks/pos) | ✅ built | **ADD branded/non-branded split** (page+query + `isBrandedQuery`) — the one real data gap |
| `market-traffic` (per-market, **date-range**, branded/non-branded) | ✅ exists | reuse behind the shared date control |
| rank-tracker, competitorMatrix, backlinks, ga4-data, ai-overview, llm-mentions, technical-seo, keyword-opportunities, seoGoals | ✅ exist | reuse — no rebuild |

So new data work = **one thing**: branded/non-branded in the monthly layer. Everything else is wiring existing data into the lenses behind the shared control bar.

---

## 6. Build sequence (as a unit, not patches)

1. **Shared foundation first** — the reusable control bar (brand · market · date-range+presets · branded/non-branded) + the visual system (fonts, framed cards, theme-aware) + one chart component. Every lens is built on this, so date-range/branded-toggle exist everywhere by construction.
2. **Data gap** — branded/non-branded in `monthlyTrend` (backfilled from GSC page+query).
3. **Performance lens** — the full CEO view on the shared foundation (MoM + date-range, branded/non-branded, distribution, movers, traffic value, AI, GA4, SoV trend, goals, PDF).
4. **State of SEO** — absorb technical health + backlinks + per-market rollup, on the shared foundation.
5. **Keywords** — rank-tracker management + opportunities, unified.
6. **Competitors** — restyle onto the visual system (functionally keep).
7. **Outcomes** — restyle onto the shared foundation/visual system.
8. **Migrate + retire** — only now: retire the Rankings triple-stack, the Report tab (→ Performance PDF), the Markets tab, duplicate top-10 cards. Each verified before deletion.

---

## 7. Decisions (confirmed 2026-09-16)

1. **Technical SEO stays its own tab; Backlinks stays its own tab.** State of SEO gets a **backlink *summary*** (referring domains + score + Δ) linking out to the full Backlinks tab. Lenses = Performance · State of SEO (incl. backlink summary) · Outcomes · Keywords · Competitors — plus standalone **Technical SEO** + **Backlinks** tabs and **Perch**.
2. ✅ **Report tab → PDF export of the Performance lens** (separate Report tab retires).
3. ✅ **Retire the Markets tab.**
4. ✅ **Shared foundation first.**

**Build order (as a unit):** (A) branded/non-branded in `monthlyTrend` [data gap] → (B) shared control bar + visual system [foundation] → (C) Performance lens on it (incl. PDF export) → (D) State of SEO (+ backlink summary) → (E) Keywords → (F) restyle Outcomes + Competitors to the visual system → (G) migrate + retire (Report, Markets, Rankings triple-stack, dup top-10 cards), verifying each.
