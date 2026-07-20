# The Nest — SEO Platform Analysis & Action Plan
> Full-platform planning session, 9 Jul 2026 (Fable). Hand-off doc for Opus build sessions.
> Sources: 3 parallel code-mapping passes (analytics data flows · content loop · research/audit depth), NEST-ROADMAP.md, SETUP.md, memory. Claims verified against code where they drive decisions.
> Companion to NEST-ROADMAP.md (which has drifted — see §5). CLAUDE.md #11 (auth) and #12 (config-driven) apply to every item below.

---

## 1. Executive verdict

The Nest today is **two good tools wearing one UI**:

1. A genuinely differentiated **execution loop** (find → write in brand voice → approve → publish to WP → measure) that SEMrush/Ahrefs cannot do. Proven live (RankMath 25→78). This is the moat.
2. A **research/visibility layer** (worklist, matrix, tracker, audit, traffic report) that is ~70–80% of the paid-tool class on the axes that matter for this business.

The core problem is no longer missing features. It is **incoherence between the two halves and between UAE and international**: the smartest generation logic only runs where the least traffic is, four different code paths fetch GSC, several data streams dead-end without a consumer, and the CEO surface is still largely UAE-only. The highest-ROI work is **unification, not addition**.

**What we already beat SEMrush/Ahrefs on** (don't dilute): publish loop with voice gates + fact guards; per-market restaurant focus; GBP reviews integration; approvals + Perch human layer; closed-loop outcome measurement (v7.4.25–28 + content-outcomes).

---

## 1b. NORTH STAR — the operating model (agreed w/ Shazin 19 Jul; this governs all phases)
The Nest is the team's **SEO operating system**, NOT an autopilot. Four loops: **research** (tool finds+prioritizes) → **triage** (human decides, PM-style) → **execute** (tool writes in brand voice + publishes) → **measure** (tool proves what moved). It wins on the one thing SEMrush/Ahrefs can't: insight → published fix → measured outcome, in brand voice, across markets.

**DECISIONS LOCKED THIS SESSION (do not re-litigate):**
- ❌ **KILL autonomous content-generation.** The scheduler's 4 auto-write jobs (quick_wins/meta_rewrites/content_gaps/page_creation) burn Claude + produce noise/wrong-targets. Turn them OFF. (Intl auto-gen already disabled by Shazin for this reason.)
- ✅ **KEEP the scheduler's DATA/measurement jobs** (GSC snapshots, rank history, trackPublishedItems, CPC, pruneApprovals) — reporting/tracker need them.
- ✅ **KEEP research jobs** (keyword-discovery → the worklist [already GSC + DataForSEO hybrid], competitor-matrix) — cadence = monthly cron + on-demand "Refresh Now" (keep DataForSEO spend low).
- ✅ **Content is HUMAN-DRIVEN on-demand:** worklist → human triages → ⚡Generate (AI, when confident) or 📋 Perch (human, when not) → approve → publish. Confidence-gated (high/med → Generate; low → Perch). Generate LABELS what it makes (meta/page/blog/rewrite) and can CREATE pages & blogs, not just meta.
- The tool = **"a PM tool that can also generate and publish."**

**RESTAURANT-SPECIFIC PRIORITY ORDER (F&B SEO truth — bake into scoring + routing):**
1. **Local pack + GBP FIRST.** near-me / "best burger [city]" / open-now = local intent → won by **GBP + reviews + location pages**, NOT blogs/homepage. Often 50%+ of the opportunity. Route these to GBP actions + per-location pages; track **local-pack position**.
2. **Menu/category pages** (transactional, the money pages) — product terms → dedicated menu/category page.
3. **Non-branded visibility = THE KPI** (~93% of clicks are branded → growth is non-branded). Point the system + CEO report at closing the non-branded gap.
4. **Blogs LAST** — only real informational demand / topical authority for the money pages.
5. Multi-market parameterized; native Arabic; delivery aggregators (Talabat/Deliveroo/Noon) a later parallel surface.

**GAPS between "good" and "best" (priority order — fold into phases):**
(a) **page-architecture intelligence** (guardrails done fully: right keyword → right page); (b) **clustering** (worklist by topic, not keyword-by-keyword); (c) **local/GBP as a first-class action type** + local-pack tracking; (d) **business-value weighting** (lean on `businessPriority`); (e) **closed-loop attribution surfaced** ("moved #14→#7").

**STOP doing:** autonomous churn · every-keyword-a-blog · keyword-by-keyword targeting · letting GSC's accidental homepage rankings pick targets.

### ⚡ THIS-WEEK PRIORITY (19 Jul, Shazin): SCALABILITY + one-click brand onboarding — Southpour + Yolk live before EOW
P2 (config layer + brand/market onboarding) is **pulled to THIS WEEK**, not later. Target: onboard **Southpour** (coffee/café) and **Yolk Brands** (corporate parent) as fully-working brands **via a Settings form / config record — ZERO code edits.** Two hard rules from now on:
1. **Every new line of code MUST be config-driven (CLAUDE.md #12).** Do NOT add another `brand === 'pickl' ? … : …` ternary, hardcoded brand list, or `<option>`. Read brands from ONE source. The on-demand Generate + everything else built this week must already read brand config, so onboarding is truly one-record.
2. **Build the `brandsConfig` layer as the near-term backbone.** One Blobs record per brand: `{ slug, name, vertical('restaurant'|'cafe'|'corporate'), domain, gscProperty (e.g. 'https://eatpickl.com/' | 'sc-domain:...'), wpEnvPrefix (WP_PICKL/WP_BONBIRD/WP_SOUTHPOUR/WP_YOLK), gbpAccount, brandContext/voice, brandedTerms, competitors[], businessPriority, color, flag }`. Shared accessors `getBrands()`/`getBrand(slug)` (Blobs-first, code literal = seed/fallback) that BE + FE both read; ONE `/api/config` feeds every UI dropdown.

**HARDCODE INVENTORY to kill before/at onboarding (all confirmed in audit):** `brand==='pickl'?eatpickl:bonbird` GSC-site ternary duplicated across market-traffic/rank-tracker/gsc-data/loadReports/competitor-audit/technical-seo/ai-overview (BC9); `getBrandContext` fallback `pickl?PICKL_DEFAULT:BONBIRD_DEFAULT` (⚠️ a NEW brand silently inherits Bonbird's identity — MUST fix); `BRANDS` literal in scheduler; `BRAND_CONFIG` in email-digest/ai-overview; hardcoded Pickl/Bonbird `<option>` lists in index.html; per-brand competitor/seed lists; `WP_PICKL_*`/`WP_BONBIRD_*` env pattern (env vars stay, NAMES come from config).

**VERTICAL ADAPTATION (Southpour=coffee, Yolk=corporate):** menu/keyword/relevance logic is currently burger/chicken-specific (OFF_MENU_DISHES, brandGenericSeeds, keywordMatchesMenu). It must key off `vertical`/brandContext.menu, not hardcoded food terms — else Southpour/Yolk get restaurant keywords. Onboarding a café/corporate brand must NOT require touching discovery/filter code.

**ACCEPTANCE (the gate): add Southpour AND Yolk entirely through Settings → each appears in every dropdown + every cron loop, runs discovery/crawler/traffic/rank-tracker, generates on-demand content in its own voice/vertical — with ZERO code edits.** If any step needs a code change, onboarding isn't done.

## 2. Cohesion map — how the tabs tie together, and where they don't

### How data flows today (verified)
- **Crons (Mon 4am UTC)** write Blobs: `gscCache` (scheduler), `competitorMatrix`/`sovHistory`/`competitorRankedKeywords` (matrix job), `keywordOpportunities[:market]` (discovery), `backlinkData`, `aiOverview`, `llmMentions`; Mon 6am: `gbpSnapshot`/`speedSnapshot` (snapshots), `contentOutcomes` (outcomes).
- **Analytics tabs** read those + live GSC. **Opportunities → action** via Generate (meta draft), Queue (blog), Perch (task). **Approvals → WordPress → weekly tracking** (`trackPublishedItems`, content-outcomes).
- Rankings tab now carries: raw GSC keywords + per-market traffic (v7.4.63) + rank tracker (v7.4.64). Opportunities carries the worklist incl. long-term targets (v7.4.65). Reports has a cross-market rank-tracker rollup (v7.4.64).

### The incoherences that matter (verified, ranked)

**C1. Two parallel content pipelines; the intelligence lives in the wrong one.** ⭐ THE structural issue
`scheduler-background.js` (UAE, high volume) vs `international-seo-background.js` (9 markets, cron disabled). SERP-feature routing, page-level competitor context, and the cannibalization guard exist **only in the intl pipeline** (intl-seo lines ~330–430: `loadSerpFeatureMap`, `loadCompetitorContext`, `existingDedicatedPageFor`). UAE `content_gaps`/`page_creation` select purely by position/impressions — a local-pack keyword gets a blog post; nothing checks whether we'd cannibalize an existing page. This is the same disease the roadmap already names (WS7-T3 "consolidate into ONE brand×market-parameterised pipeline"). **UAE must become just `market='uae'`.**

**C2. Voice gate asymmetry.** UAE gates ≥5 (5 sites in scheduler), intl gates ≥8 (9 sites). Same brand voice, two standards; identical content passes in UAE and fails intl. Known issue ([[voice-gate-too-soft]]), still open.

**C3. Four+ GSC fetch implementations.** `gsc-data.js` (['query']+['page'], **rowLimit 500**, live, no cache) · `_lib/gsc.js` (`fetchGscPageQuery`/`fetchGscPageOnly`, dated, 25k rows) · `_lib/store.js` (`fetchGscDirect` 500-row query-only cached, `fetchGscWithPages` 1000-row cached). The UI burns live GSC calls while the scheduler's cache goes unread; the 500-row paths clip the intl long tail. Roadmap already flags the fold-in; still open.

**C4. Measurement holes.** `onpage_suggestion` (queued weekly per market), `schema_update`, `review_response` are **never measured** — no trackingKeyword, no outcome. Seed-keyword blogs sit "awaiting signal" forever (no 60-day verdict). Rejection feedback (`brandFeedback`) is injected into scheduler + parts of intl but **not** `generate-draft.js`.

**C5. Reports (CEO surface) is still mostly UAE/brand-level.** Traffic value, technical, GBP, AI-performance are brand-level; the new rank rollup pools all markets into one set of chips (market tags only on movers). No per-market report, no monthly cadence, no PDF per market. (WS4 — CEO explicitly asked.)

**C6. Dead-end data.** Backlinks tab is display-only (no actions, no new/lost surfacing though history blobs exist); SoV history stored but no trend UI; `sovHistory`/crawl snapshots/`speedSnapshot` accumulate with thin consumers; approvals use free-form `locationTag` ("🇧🇭 Bahrain") instead of the structured market key — brittle filtering.

**C7. Intl blog cache TTL (7-day `wasRecentlyProcessed`)** skips newly-discovered opportunities for up to a week after a market run.

---

## 3. Gap analysis vs SEMrush/Ahrefs — for THIS business

Frame: multi-market **restaurant** brands. Local intent, local pack, branded-vs-non-branded, Arabic. Parity is only worth building where it feeds the loop or the CEO story.

| # | Gap | Why it matters here | Have today | Effort | Verdict |
|---|---|---|---|---|---|
| G1 | **SERP-feature & local-pack tracking over time per keyword** | Restaurants live in the local pack; we don't know when we gain/lose a snippet/pack slot | Matrix captures features weekly (point-in-time); rank tracker ignores them | S–M (data already flows; add history + surface in tracker) | **Build first** |
| G2 | **Competitor movement** (new/lost keywords, SoV trend, "who's growing") | The strategist question; snapshots already exist | `sovHistory` + weekly `competitorRankedKeywords` stored, no delta computed/surfaced | S–M | **Build** |
| G3 | **Traffic estimation** (per keyword + per competitor domain) | Prioritisation + CEO story ("this gap ≈ X visits/mo") | etv/CPC already received & mostly discarded; no CTR-curve model | S | **Build (cheap win)** |
| G4 | **Keyword clustering / topic grouping** | Worklist scores "best burger dubai/near me/delivery" separately; one page should own the cluster | Nothing | M (embed/cluster inside discovery; no new vendor) | **Build (in worklist, not a new tab)** |
| G5 | **Seasonality / trend curves** | Restaurant demand is seasonal (Ramadan, summer, DSF) | Single-snapshot volumes | S–M (DataForSEO monthly searches already in keyword data — surface it) | Build later |
| G6 | **Internal-link intelligence** (hubs, orphan fixes, "link from X to Y") | Crawler already collects inbound counts; intl pages are under-linked (Oman!) | Counts only | M | Build later (feeds loop nicely — actionable suggestions) |
| G7 | **Backlinks depth** (anchors, new/lost surfaced, quality) | Modest for local restaurants; domain-level covers intl subfolders | Ref-domains + dofollow% + weekly history (unread) | S for new/lost; M for anchors | Partial — surface new/lost only |
| G8 | **Field CWV (CrUX)** | Lab-only PSI can mislead | PSI lab only | S (free API) | Build later |
| G9 | Crawl-over-crawl diff UI | Regression detection | Snapshots stored, no diff | S | Build later |
| G10 | hreflang deployment audit | Generator exists; nothing validates live markup; EN/AR across 9 markets | Generator only | S–M (crawler already fetches pages) | Build with WS6 |

**Deliberately NOT building** (say no explicitly): daily rank tracking via SERP API (cost; weekly GSC is honest data), link-intersect/disavow/toxicity at Ahrefs depth (wrong battle for local restaurants), replacing GSC positions with rented SERP positions, generic "content score" editors. Ahrefs' backlink DB and index are unreachable and irrelevant to winning "best burger bahrain".

---

## 4. Pipeline review — in-flight work, reconciled with reality

| Workstream (roadmap) | Roadmap says | Code says (verified) | Call |
|---|---|---|---|
| WS1 Trust & correctness | in progress | Draft-vs-live label + rounding + eligibility FIXED (v7.4.66); keyword-opps auth leak FIXED (v7.4.67). Remaining: live-verify v7.4.13–28 pile (incl. **Arabic fail-closed fix — blocker for any intl regenerate**) | **Finish: verification checklist, needs Shazin signed in** |
| WS2 Site scanner | "NOT built" | **BUILT + validated** (onpage-audit-background, sitemap crawl 150+ pages, per-market rollup, Technical tab view) | **Roadmap STALE — update; remaining: cadence (monthly cron?), crawl-diff view** |
| WS3 Close the loop | not started | Partially done: content-outcomes live; intl intelligence built (v7.4.25–28, untested); scanner→generator routing NOT built | **Redefine WS3 = P1 unification below** |
| WS4 Reporting engine | not started | Big step landed: per-market traffic + tracker + CEO rollup (v7.4.63–65). Missing: monthly per-market report/PDF, per-market Reports breakdown | **Next after P1** |
| WS5 Local SEO depth | not started | GBP reviews/health/snapshots live; **Performance API, Q&A, local-pack rank unused** | Keep; pair with G1 |
| WS6 Intl hardening | not started | hreflang **generator exists** (roadmap stale); nesting = dev-side; Oman 0-index case known | Keep; add hreflang audit + Issues&Flags |
| WS7 Config layer + multi-site | not started | T1 done; T2 (dynamic market dropdowns) pending; T3 pipeline consolidation = C1 | **T3 pulled forward into P1 (it IS the cohesion fix); Blobs config + Settings form stays WS7** |
| Deferred backlog | — | Slack deep-link OAuth, Issues&Flags module (Shazin request), Perch-as-hub, auth follow-ups (Slack sig verify, OAuth state, RBAC granularity, reviews.js gating) | Slot into phases below |

**Revisit list** (explicitly): unify voice gates when pipelines merge; kill or justify the 7-day intl blog TTL; structured `marketKey` on approval items (keep locationTag for display); decide fate of `monitor` tier; `gsc-data.js` 500-row limit.

---

## 5. THE PLAN — phased, for Opus

> **RE-SEQUENCED per the North Star (§1b), 19 Jul.** Near-term order now:
> - **P1 (in progress):** pipeline unification. DONE: P1.0 queue module, P1.1 retire index/kill race, homepage guardrails (recommendAction + generate-draft). NEXT within P1: **(i) turn OFF the scheduler's 4 auto-content-gen jobs (keep its data jobs); (ii) build HUMAN-DRIVEN on-demand ⚡Generate — dispatch by actionType (meta [done] + page_creation + blog_draft), confidence-gated (high/med→Generate, low→Perch), button labels what it makes; (iii) guardrail-3 fit-check + clustering.** Then the remaining P1.2 voice-gate / P1.3 GSC-path / P1.4-1.5 extraction (the on-demand generators + scheduler share ONE `_lib/content-pipeline.js` — build once, both call it).
> - **BUMPED UP (were later):** Local/GBP as a first-class action type + local-pack tracking, and keyword **clustering** — these are top-value per the F&B priority order, pull them ahead of generic visibility polish.
> - Everything else (P3 visibility, P4 CEO layer, P5 local depth, P6 backlog) stays, oriented around the North Star.

> **⚡ ORDER CHANGE (19 Jul): P2 (config layer + one-click onboarding) JUMPS AHEAD of the rest of P1 — it's now THIS WEEK (Southpour + Yolk by EOW).** Revised near-term order:
> 1. ✅ P0 (done) · ✅ P1.0 queue · ✅ P1.1 race · ✅ homepage guardrails — all done, all config-compatible (queue is brand-agnostic; guardrails already read brandCtx). No rework.
> 2. **NEXT → P2 `brandsConfig` scalability layer + one-click onboarding (Southpour + Yolk).** THIS WEEK.
> 3. Then the on-demand ⚡Generate + kill-auto-gen (built config-driven, reading brandsConfig).
> 4. Then the REMAINING P1 (P1.2 voice-gate, P1.3 GSC-path, P1.4/1.5 extraction, P1.6 intelligence, P1.7 measurement) + guardrail-3/clustering.
>
> **KEY DEPENDENCY (why this ISN'T wasted reordering):** P2 and remaining-P1 touch the SAME hardcoded code — the `brand==='pickl'?eatpickl:bonbird` GSC-site ternary is exactly what P1.3 (GSC consolidation) + P1.4 (scheduler extraction) also rewrite. So **do the ternary/BRANDS-literal kill ONCE, config-driven** = P2 and the P1 extraction CONVERGE rather than conflict. Doing config FIRST makes the pipeline extraction cleaner, not redundant. The only reason it's not pure waste is the "every new line config-driven" rule — honor it and nothing gets built twice.
> Immediate build (kill auto-gen + on-demand Generate): now sequenced AFTER brandsConfig so it reads config from day one. NOT started — awaiting go.


Rules for every phase: config-driven (#12 — brand×market from config, zero inline lists), auth-gated (#11), one batched deploy per phase, `node --check` everything, update SETUP.md + memory, **live-verify acceptance gate before the next phase starts**. Prefer editing existing files over new parallel ones.

### Phase 0 — Truth first (days; mostly verification, no new surface)
1. **Live-verify checklist** (needs Shazin signed in, ~30 min guided): traffic report vs June baseline; tracker seeding all markets; **Arabic Opportunities refresh on KSA/Bahrain** (fail-open fix v7.4.24 — gate for everything intl); long-term group populates on a discovery run; content-intelligence payloads (serpFeatures/competitors arrays) on a manual intl run.
2. **Update NEST-ROADMAP.md** to reality (WS2 built; WS3 partial; WS4 started; hreflang generator exists). A stale canonical doc causes bad planning — this session proved it.
3. Retire the CLAUDE.md "Current Version: v7.4.28" drift + add-a-market checklist note pointing at WS7 target.
Acceptance: checklist run, docs truthful.

### Phase 1 — One pipeline, one truth (the structural fix; ~1.5–2 wk) ⭐
Goal: kill C1–C4 in one coherent move. This is WS7-T3 pulled forward, scoped tightly:
1. **Extract shared generation lib** (`_lib/content-pipeline.js`): candidate selection → intelligence (SERP-feature routing, competitor context, cannibalization guard — lifted from intl) → generation → voice/fact gates → queue. Parameterised by (brand, market, language); **UAE = market 'uae'**. Scheduler + intl job become thin orchestrators calling it. Do NOT rewrite generators; move them.
2. **Unify voice gate** via one config value (`config:voice-gate`, default ≥8 with the existing 3× fixBrandVoice loop; UAE inherits it). Watch queue-volume regression for one cycle.
3. **One GSC access path**: everything goes through `_lib/gsc.js` (dated, 25k) + a read-through cache blob with TTL; port `gsc-data.js` (kill the 500-row clip), scheduler's fetchers become wrappers; delete dead paths.
4. **Close measurement holes**: trackingKeyword + outcomes for `onpage_suggestion`; explicit `unmeasured:true` on review/schema types (honest, cheap); 60-day "no traction" verdict for seed blogs; `getBrandFeedback` into `generate-draft.js`; structured `marketKey` on new approval items.
5. Drop the intl 7-day blog TTL when opportunities exist (cache only the no-opportunity case).
Acceptance: one manual run per brand for UAE + 2 intl markets produces queue items with identical gate behaviour and intelligence fields; UAE item shows serpFeatures/competitor context; a duplicate-target content_gap is blocked in UAE; GSC fetch count per page load drops to ≤1.

### Phase 2 — Brand & Market Onboarding (WS7 config layer; ~1.5–2 wk) ⭐ SCALABILITY
Goal: adding a brand or market becomes an **onboarding experience in Settings, not a code change**. P1 is the prerequisite (one parameterised pipeline to onboard INTO); this phase makes the parameters data, not literals. This is also the CEO-requested track (Southpour, Yolk).

**Hardcode inventory to eliminate (the targets):**
- `INTERNATIONAL_MARKETS` literal (~15 fields/market, `_lib/international-config.js`) + the 10-step add-a-market checklist in CLAUDE.md (`MARKET_LOCATIONS`, `MARKET_KEYWORD_TERMS`, calendar.js timezones + `SP_ACCOUNTS`, index.html mirrors `CAL_MARKETS`/`CAL_MARKET_TIMEZONES`/`SP_ACCOUNTS_FLAT`/`SP_HAS_ACCOUNT`)
- `BRANDS` literal in scheduler-background.js; competitor seed lists in competitor-matrix-background.js + backlinks-background.js
- The `brand === 'pickl' ? 'https://eatpickl.com/' : 'sc-domain:bonbirdchicken.com'` site-URL ternary duplicated across many functions (market-traffic, rank-tracker, gsc-data, loadReports…)
- Hardcoded Pickl/Bonbird `<option>` dropdowns throughout index.html
- ⚠️ Landmine: `getBrandContext` falls back `pickl ? PICKL_DEFAULT : BONBIRD_DEFAULT` — a NEW brand silently inherits Bonbird's identity. Fix to a neutral default + require onboarding data.
- `WP_PICKL_*`/`WP_BONBIRD_*` env-var-per-brand pattern (env vars stay, but the NAMES come from config).

**Build:**
1. **`brandsConfig` + `marketsConfig` Blobs** as single source of truth (seeded by migration script from today's literals; code literals demoted to fallback). Shared accessors both BE & FE read (`getBrands()`, `getMarketsForBrand()` reading blob-first); ONE `/api/config` endpoint feeds every UI dropdown (brand-filtered).
2. **Settings → "Add Brand" wizard**: name/slug, domain + GSC property string, WP env-var prefix, GBP account, brand voice interview (existing), `brandedTerms`, seed competitors, priority products. Writes ONE brandsConfig record.
3. **Settings → "Add Market" form**: country + brand + slug (+ optional SP accounts, keyword seeds); auto-derive location_code via `resolveLocation(country)` and timezone via IANA lookup. Writes ONE marketsConfig record.
4. **Kill the mirrors**: index.html market/brand lists render from `/api/config`; calendar + SP maps read config.
5. **Onboarding checklist view** per new brand: GSC connected ✓, WP creds ✓, GBP ✓, voice examples ✓, competitors ✓, first discovery run ✓ — flags what's missing (ties into Issues & Flags, Phase 4).

**Acceptance gate: a Southpour dry-run.** Create the brand entirely through Settings (no deploy), run discovery + crawler + traffic report on it, see it appear in every dropdown and every cron loop. If any step needs a code edit, the phase isn't done. (RBAC granularity = separate later item; don't let it bloat this phase.)

### Phase 3 — Visibility parity that feeds the loop (~1–1.5 wk)
1. **G1 SERP-feature/local-pack history**: persist per-keyword features from the matrix run into `serpFeatureHistory:<brand>:<market>`; surface in rank tracker rows (📍pack/⭐snippet/🤖AIO badges + gained/lost deltas); alert on loss (Slack/Perch).
2. **G2 competitor movement**: weekly diff of `competitorRankedKeywords` + SoV trend sparkline in matrix UI ("Salt +8 keywords, SoV ↑2.1pts").
3. **G3 traffic estimation**: CTR-curve model (position×volume, discount AIO/pack presence) → "est. monthly visits" on worklist rows, tracker, and gap lists; per-competitor-domain estimate in matrix.
4. **G4 clustering inside discovery**: group worklist variants under a primary keyword (cheap embedding or Claude batch pass at discovery time); one page owns a cluster — feeds the cannibalization guard.
Acceptance: tracker shows feature badges with ≥1 week of history; matrix shows movement; worklist rows show est. traffic + cluster grouping; all config-driven.

### Phase 4 — CEO layer (WS4 completion; ~1 wk)
1. **Monthly per-market report**: assemble from what now exists (market-traffic, tracker summary, outcomes, GBP/speed snapshots, audit rollup) → `marketReport:<brand>:<market>:<YYYY-MM>` + Reports tab per-market view + PDF export + optional email (reuse email-digest).
2. **Issues & Flags module** (Shazin's ask): auto-detect market 0-footprint/not-indexed (Oman case), GSC disconnected, matrix empty for tracked market, KD coverage collapse, tracker with no snapshots — one panel + optional Perch task per flag. Detection rules config-driven.
3. Per-market breakdown in the Reports rank rollup (chips per market, not pooled only).
Acceptance: one click produces a Bahrain monthly report a CEO can read; Oman appears as a red flag with a recommended action.

### Phase 5 — Local depth (WS5; ~1–1.5 wk)
GBP **Performance API** (views Search/Maps, calls, directions, website clicks — trends per location), Q&A surfacing, and **local-pack position** per tracked local keyword (from matrix SERP data). Location-health report + monthly GBP PDF (CEO ask). Pairs with G1.

### Phase 6 — Enrichment backlog (slot into gaps; each S–M, independent)
Seasonality curves (G5, from monthly-searches data already returned) · internal-link recommendations (G6, from crawler inbound data → queue as onpage items — now measurable after P1.4) · backlinks new/lost surfacing (G7) · CrUX field data (G8) · crawl-diff view (G9) · hreflang deployment audit (G10, pairs with WS6/dev nesting fix) · Slack deep-link OAuth + Slack signature verification + remaining auth follow-ups + RBAC granularity · full Yolk/Shadow brand onboarding (repeat the P2 wizard, now trivial).

### Sequencing logic
P0 before anything (truth + the Arabic gate). P1 before P2: you can't onboard a new brand into two divergent pipelines — unification IS the onboarding prerequisite. P2 (onboarding) directly after P1 while the parameterisation is fresh; it's also the CEO track (Southpour). P3 visibility lands once, in one pipeline, for every brand incl. newly onboarded ones. P4 rides on P1–P3 data. P5/P6 independent. If a CEO deadline forces it, P4.1 (monthly report) can jump ahead — it only needs what's already shipped.

---

## 6. Standing risks & guardrails for Opus
- **Verification debt is the #1 recurring failure mode** (roadmap's own caveat: first live look at the meta sweep found 3/5 broken). Every phase ends with a live acceptance gate — no gate, no next phase.
- **Netlify credits**: batch deploys per phase; **Claude credits**: generation-heavy tests on 1–2 markets first.
- **DataForSEO**: Standard mode only (task_post/task_get), batch ≤100; Qatar/Oman/Pakistan absent from Labs — degrade gracefully (GSC covers them).
- **Never regenerate intl content** until the Arabic fail-open fix is confirmed live (P0.1).
- Jordan URL `/pickl-jordan/` immutable; `update SETUP.md before committing`; never push without explicit approval.
