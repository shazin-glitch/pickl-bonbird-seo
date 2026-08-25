# The Nest — Market Planner (structured, autonomous SEO)

> Written 2026-08-21 (Opus, as CTO/SEO). The plan for turning the Nest from a
> fixed-quota, GSC-reactive, UAE-centric creator into a **structured per-market SEO
> planner + one execution engine**. Read this before touching planner code.

## Why this exists (the problem)

1. **Fixed quotas, not judgement.** The batch pipelines emit ~fixed counts (e.g. 1 quick-win, 4 meta rewrites, 10 gaps) regardless of whether the existing page/meta is already good. It doesn't *assess and decide*; it fills slots.
2. **GSC-reactive → cold-market blind.** `runQuickWins`/`runMetaRewrites` need existing rankings/impressions. A greenfield market (Lahore) with zero impressions never surfaces → the Nest can't *launch* a market, only *grow* one.
3. **Three separate generators, never unified.** `scheduler-background` (UAE batch, own Claude logic), `international-seo-background` (intl batch, own Claude logic), `generate-draft` (on-demand, the unified engine + shared `content-pipeline` brain). The batch pipelines were left separate by an earlier decision to kill auto-gen; they duplicate generation logic and diverge.
4. **Per-market research opportunities are discovered but not created.** Discovery stores `keywordOpportunities:<brand>:<market>` (research ideas by volume, non-GSC), but the creator reads only `keywordOpportunities:<brand>` (UAE). Intl opportunities are viewable, never generated.

## ⭐ ARCHITECTURE (v7.9.21): Claude IS the planner brain
The assess/cluster/relevance/prioritise step is ONE Claude call (`planWithClaude`) — NOT rules. Rules are only: a cheap gather/dedup pre-pass, a **fallback** if Claude fails (`useLLM:false` or error → rule `_assess`), and **hard safety guards** the LLM cannot bypass (executable-asset-only; a `city_hub` must reference a REAL configured city slug — invented cities dropped; dedupe vs queued). Claude clusters variants→one page, drops off-brand keywords, picks asset type, caps to a ~15 launch set. Shazin's point: the Claude API is the brain; use it for the DECISIONS, not just final writing.

## The target: one brain, one engine

**Per brand × market:**
1. **GATHER** (read-only, ~no Claude) — opportunities (`keywordOpportunities:<brand>[:<market>]` = research + GSC), current footprint (existing WP pages + templates, current meta, GSC rank/impr/CTR, venues from config, scaffolds, city list).
2. **ASSESS each opportunity** against current state (rules-first; light Claude only for intent classification if rules are ambiguous):
   - Dedicated page exists + ranks well (≤5) → **SKIP** (already winning).
   - Exists + underperforms (CTR gap / pos 6–20) → **META FIX** (only if current meta is genuinely improvable) or content improvement.
   - Exists but empty body (scaffold) → **FILL** (template body).
   - No page:
     - Local/venue intent + we have a venue in that city → **CITY HUB** or **LOCATION** page.
     - Product/menu intent → **PRODUCT** page (fill scaffold if one exists, else create).
     - Informational/long-tail → **JOURNAL** post.
   - **Priority score** = f(search volume, intent value, gap severity, writability, business-priority weights). No fixed quotas — the mix falls out of the data.
3. **PLAN** — a ranked, deduped list of `{keyword, assetType, target(existing|new), action, rationale, priority, estImpact}` = the **market content map**, reviewable BEFORE any Claude spend. Dedup vs already-queued + existing pages.
4. **EXECUTE** — for the human-selected/top-N items (budget-bounded), call **`generate-draft`** (the ONE engine) with the right params (`actionType`/`pageKind`/`market`/`city`/`url`). Reuses its guards: contentPaused, cannibalization, voice gate, FAQ contract, market taxonomy, writable-template guard.
5. **REVIEW → PUBLISH** — existing approvals flow (human-gated; never auto-publish).
6. **MEASURE → LOOP** — existing rank tracker + closed-loop (did shipped content move position vs positionAtPublish).

**Key property:** the PLAN (step 3) is produced and shown BEFORE generation (step 4). The human sees "Lahore: create 3 product pages + 1 city hub, fix 2 metas, write 4 journals — here's why each," approves scope + budget, THEN we spend Claude. This kills fixed quotas and "rewrote an already-good page."

## Architecture (all ADDITIVE — nothing existing is modified in Phase 1–3)

- **`_lib/market-planner.js`** — `buildMarketPlan({ brand, market })` → the ranked plan. Read-only gather + rules. No writes, no generation. Optional tiny Claude classifier behind a flag (default off in phase 1).
- **`market-planner.js`** (`/api/market-planner`, gated) —
  - `POST { action:'plan', brand, market }` → returns the plan JSON (read-only; cheap).
  - `POST { action:'execute', brand, market, items:[...] | topN, dryRun }` → loops `generate-draft` (internal `fetch` + `internalHeaders()`) for selected items → drafts land in Approvals. `dryRun` default true.
- **Frontend** — a "🗺️ Market Planner" panel: pick brand + market → **Build plan** (renders the ranked map, read-only) → tick items / set N + budget → **Generate selected** → drafts to queue.
- **Reuse (do not reimplement):** `generate-draft` (generator), `content-pipeline` (intel), `keywordOpportunities:*` (data), `get_current_meta` + `wpPageCheck` (current state), `citiesForMarketAsync` (venues→cities), `list_scaffolds`, rank-tracker.

## Non-breaking rollout (⚠️ the "don't break everything" requirement)

Learned the hard way (the config-driven migration shipped `brandCfg`-out-of-scope, `m.brandName(brand)`, `intelDirective` undeclared — all swallowed by try/catch). So:

- **Additive only.** New lib + new function + new panel. Do NOT modify `scheduler-background` / `international-seo-background` / the core of `generate-draft` in phases 1–3. Existing paths keep working.
- **`npm run check` before every commit** (syntax + no-undef over functions, js/*.js, extracted index.html). Register any genuine cross-file global.
- **Mock-verify each slice** (stub Blobs/Claude); **live-verify read-only** parts; for any write/generation, verify ONE item (throwaway) before batch. Never claim done from code-reading alone.
- **Config-driven / scalable (rule #2):** brand×market from config; works cold (research) or warm (GSC); a new market needs zero code.
- **Verify-first (rule #1):** read current state before any write; no live resource as a test fixture.

### Phases (each ships + is verified independently)

- **P1.5 — config-driven assets merged (v7.9.18).** `buildMarketPlan` now merges **city hubs from `citiesForMarketAsync`** (venue config, research-independent) into the plan, deduped vs queued. So a market DataForSEO doesn't cover still gets a real plan. Learned live: **Oman & Qatar are NOT in DataForSEO Labs** (`ideasDiag: "… not in DataForSEO Labs"`, ideasFetched:0) → keyword-research plans there are thin, but city-hub + product + seed-journal assets (config/menu-driven) fill the gap. Pakistan (362 ideas) + UAE (200) are research-rich. Data confirmed fresh (Aug 24 run). (TODO P2b: also merge unfilled product scaffolds via list_scaffolds.)
- **P1 — `buildMarketPlan` (read-only planner lib).** Gather + assess + rank → plan JSON. No Claude, no writes. Accept: mock test produces a sensible ranked plan for a warm market (bonbird UAE) AND a cold market (bonbird pakistan, research-led). `npm run check` green.
- **P2 — `/api/market-planner action:'plan'` (gated GET/POST) + frontend "Build plan" panel.** Read-only, shows the map. Accept: live panel renders the Bonbird Oman/Pakistan plan; no writes.
- **P2.5 assess/map ✅ (v7.9.20) — planner now corrects cold-market mis-classification + maps to executable actions.
- **P3 — EXECUTE (two halves):**
  - **P3a backend** — `/api/market-planner action:'execute' {brand, market, items?/topN, dryRun}` → reads the stored `marketPlan:<brand>:<market>`, and for each selected item calls **`generate-draft`** with the right params: `blog_draft`→{actionType:'blog_draft'}; `page_creation`→{actionType:'page_creation'}; `meta_update`→{actionType:'meta_update', url:target}; `city_hub`→{pageKind:'city_hub', actionType:'page_creation', city, market}. `dryRun:true` (DEFAULT) returns the exact generate-draft calls it WOULD make (no Claude spend). Likely a **-background** function too (N generations > sync limit) → store `marketPlanRun:<brand>:<market>` progress, poll it. Reuses all generate-draft guards (contentPaused, cannibalization, voice, FAQ, writable-template, dup-guard).
  - **P3b dashboard** — add controls to the 🗺️ Market Planner panel: per-item checkboxes + "Generate selected" (and a topN + budget cap) → `action:'execute'` → poll run progress → items land in Approvals for review→publish.
  - Verify order: my own `dryRun` first → ONE real item (throwaway/low-risk) in queue → then batch.
- **P2 VERIFIED LIVE (v7.9.23):** Bonbird Pakistan plan = **12 focused items** (mode llm) from 100+ keywords — 6 page_creation, 3 meta_update, 2 blog_draft, 1 city_hub; clustered (e.g. "nearest chicken shop to me +8"), relevant (no off-brand), meta targets real pages. ⚠️ LLM included "best burger in karachi" — Bonbird has NO Karachi venue; human review catches it, and a prompt refinement ("we only have venues in <cities>; don't target no-presence cities as local") should pre-empt it — do in P3.
- **P4 — Retire duplication (deliberate, later).** Once the planner is proven, make `scheduler-background` / `international-seo-background` thin callers of the planner+generate-draft, or retire the fixed-quota jobs. Also re-add the weekly cron via a dispatcher (parked from v7.9.16). Only after P1–P3 are solid.

## Guardrails the planner must honour (already built — reuse, don't bypass)
- `contentPaused` (Pickl) → planner skips paused brands.
- Cannibalization guard + `existingDedicatedPageFor` → don't create a page that already ranks.
- Writable-template guard (`create_page`) + body-writable guard (`update_content`) → never clobber static/block pages; city hubs use `template-location.php` + `page_type=city_hub`.
- Duplicate-page guard → no colliding slugs (UAE legacy cities).
- Voice gate + FAQ contract in `generate-draft`.
- Cities/venues from config only — never invent a city/venue.

## Status
- P1: ✅ DONE (v7.9.17) · P1.5 config-asset merge ✅ (v7.9.18) — `_lib/market-planner.js buildMarketPlan` read-only, mock-verified (cold + warm, dedupe, skip-winning, ranked, data-driven counts).  P2: ✅ DONE + VERIFIED LIVE (v7.9.18 backend · v7.9.19 panel · v7.9.20 assess-map · v7.9.21 Claude brain · v7.9.22-23 async background+poll) — 🗺️ Market Planner card (Analytics→Markets): brand+market → Build plan → ranked read-only map. Next: P3 execute.  P3: ⬜ NEXT (execute backend + dashboard controls; see P3 above)  P4: ⬜ (deferred).

## ⭐ UI COHERENCE (P3b — Shazin, don't bolt on another panel)
The tool has fragmented: Discover (Opportunities tab), Plan (🗺️ card under Analytics→Markets), city-hubs card, scaffolds card, Generate (per-opportunity buttons), Review (Approvals), Measure (Reports) — scattered across tabs with overlapping entry points. The Market Planner now SUBSUMES the standalone city-hubs + scaffold cards (it already proposes city hubs and can fill scaffolds via generate-draft), so those become redundant.
**Design P3b around the SEO workflow, one coherent spine:** Discover → **Plan** → Generate → Review → Publish → Measure. The Market Planner should be the PRIMARY "act on a market" surface (its own destination, not a buried card), with Generate happening in-place on the plan, flowing into Approvals. FOLD the separate city-hubs + scaffold panels into the planner (or retire them) rather than adding a parallel one. Decide placement (own nav item vs top of Markets) with Shazin before building P3b.

## ⭐ PLACEMENT + MULTI-BRAND DECISION (Shazin raised; my call)
The planner is **per brand × market** and must serve ALL brands, so it is a **first-class destination**, NOT a card under Analytics→Markets. Proposed IA: a top-level **"Content Planner"** nav item (or a "Grow" group) — the single Plan→Generate→Review surface. Flow: **Brand → Market → Plan → Generate → Approvals**. Single-market brands (Southpour café, Yolk corporate) just use market = home ('uae'); multi-market (Pickl, Bonbird) pick a market. FOLD the city-hubs + scaffold cards into it.

**It must be VERTICAL-ADAPTIVE (rule #2), and mostly already is** because the Claude prompt is fed the brand's `vertical` + `cuisine/sells` and city hubs come from venue config:
- **restaurant** (Pickl/Bonbird): local + product + journal + city hubs (venue-driven). ✓
- **cafe** (Southpour): coffee/brunch/specialty content + city hubs from its venues. ✓ (vertical drives relevance + prompt)
- **corporate** (Yolk): NO venues → citiesForMarketAsync = [] → **no city hubs automatically** (correct); Claude gets "hospitality group" context → should propose franchise / careers / about / thought-leadership journal + meta, not local/product.
- **P3 refinement:** make `planWithClaude`'s asset-type guidance **vertical-aware** — don't frame a corporate brand around "local landing / product / city hub." Pass the vertical's `promptNoun` + a per-vertical asset hint into the prompt. Small addition; do it in P3 so Yolk/Southpour plans read correctly.

Net: ONE planner, brand-first, adapts by vertical — coherent across Pickl/Bonbird/Southpour/Yolk with zero per-brand code (config + vertical drive it).
