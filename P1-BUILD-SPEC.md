# P1 — Pipeline Unification: Build Spec
> The structural keystone of the plan (`/PLAN-FOR-OPUS.md` P1). Turns "two divergent pipelines + two queue copies" into ONE brand×market-parameterised path. Also closes the deferred backend bugs whose root cause is that duplication: **BC3** (index race), **BC6** (voice-gate split), and the intelligence-asymmetry (**C1**). BC5 already fixed (v7.4.74); BC1 root-cause finished here.
> Prerequisite: **P0 gate must pass first** (Arabic fail-open verified live — needs the DataForSEO top-up). Do NOT run an intl regenerate until then.
> Rules: config-driven (#12), auth-gated (#11), `node --check` everything, **each sub-step ships + is verified independently** (this is how a big refactor of the live revenue loop is de-risked), update SETUP.md + memory per step.

---

## Why (the problems this fixes, all verified in the audit)
- **C1 — intelligence lives in the wrong pipeline.** SERP-feature routing, page-level competitor context, and the cannibalization guard exist ONLY in `international-seo-background.js` (~lines 330–430: `loadSerpFeatureMap`, `loadCompetitorContext`, `existingDedicatedPageFor`). The high-volume `scheduler-background.js` (UAE) picks candidates by raw position/impressions — a local-pack keyword gets a blog, nothing checks cannibalization.
- **BC1/BC3 — two drifted queue copies.** `_lib/store.js createApproval` (6 bg generators) and `approvals.js createItem` (API path) both write `approvals:index` + `approvals:item:*` with no locking → read-modify-write race + divergent prune logic (BC1 patched to match, but they're still two copies).
- **BC6 — voice gate split.** UAE gates `<5` (scheduler ~lines 672/748/901/1226/1341), intl gates `<8` (intl-seo). Same brand, two standards.
- **C3 — 4 GSC fetch paths** (`gsc-data.js` 500-row, `_lib/gsc.js` 25k, `_lib/store.js` fetchGscDirect/fetchGscWithPages); UI burns live calls while the scheduler cache goes unread.
- **C4 — measurement holes** (onpage_suggestion never measured; seed blogs "awaiting signal" forever). Partly closed (content-outcomes fallback v7.4.71, generate-draft feedback v7.4.73).

## Target architecture
```
scheduler-background.js  ─┐                         (thin orchestrators: loop brands×markets,
international-seo-bg.js   ─┼─► runContentPipeline({brand, market, language, jobs, dryRun, force})
manual triggers          ─┘         │
                                    ├─ selectCandidates()   GSC page+query (via _lib/gsc) + worklist opps + competitor
                                    ├─ per candidate:
                                    │    ├─ classifyIntent + SERP-feature routing   (from matrix — ALL markets incl UAE)
                                    │    ├─ competitorContext (pages to beat)
                                    │    ├─ cannibalizationGuard (existingDedicatedPageFor)
                                    │    ├─ generate*()  (EXISTING generators — moved, not rewritten)
                                    │    └─ gates: voiceGate(config) + factGuard + lengthRule
                                    └─ queue.create(item)   ◄── _lib/queue.js (ONE impl)
UAE  ==  market:'uae'.   No separate code path.
```
New modules: `_lib/queue.js` (one queue), `_lib/content-pipeline.js` (one generation flow), `_lib/voice-gate.js` (or a fn in brand.js) reading `config:voice-gate`. Generators are **moved, not rewritten** — minimize behavior change.

---

## Migration order — each step independently shippable + verifiable
> Golden rule: **no step changes output until the step before it is verified.** Steps 0–5 are behavior-preserving refactors; only 6 turns on new behavior.

### P1.0 — `_lib/queue.js` as a behavior-preserving wrapper (kills the duplication, not the behavior) ✅ DONE v7.4.76 (committed, unpushed — needs signed-in smoke test)
- Extract ONE implementation of create/get/update/list/delete/audit (start from `approvals.js createItem` — it has the correct prune logic). `store.js createApproval` and `approvals.js`'s own functions both **delegate** to it. Same keys (`approvals:index`, `approvals:item:*`), same prune.
- **Acceptance:** create an item via a background generator + via the API; both appear; approve→push→publish still works; audit log intact. No output change.
- ✅ Built `_lib/queue.js`; store.js queue fns are thin wrappers; approvals.js aliases to queue fns. Verified via mock-store end-to-end test (both create paths, list/get/update+history/index/audit/delete). **Live smoke test still owed before push.**

### P1.1 — Kill the index race (BC3) ✅ DONE v7.4.78 (committed — needs signed-in smoke test)
- Replaced the mutable `approvals:index` blob with a **prefix scan** (`store.list({ prefix:'approvals:item:' })` — the non-paginate form collects all pages internally, so no truncation). `create()` now just writes its own item key → **O(1) and race-free** (concurrent creates touch different keys). `remove()` just deletes the blob. Pruning of dead>30d moved to a **weekly sweep** (`queue.pruneDead` → `store.pruneApprovals`, called once per scheduler run) instead of on every create. `list()` sorts by `createdAt` desc with an `id` tiebreaker (deterministic even for same-ms batches).
- Migrated the two direct index consumers off it: `scheduler-background.js trackPublishedItems` and `email-digest.js` (the latter also fixed a pre-existing wrong-key bug — it read `approvals:${id}` not `approvals:item:${id}`, so its counts were always 0). Old index blob is now orphaned/ignored — no data migration needed (items found by prefix).
- Verified: mock end-to-end (prefix-scan list, O(1) create, brand filter, pruneDead removes old-rejected, remove, newest-first + same-ms determinism). **Live smoke test owed:** queue lists all items in order; approve/dismiss work; email digest + published-tracking still populate.
- **Acceptance:** concurrent create loses no ids; listApprovals returns the same set as before; dedup (`getQueuedKeywords`/`getQueuedMetaMap`) unaffected.

### P1.2 — One voice gate (BC6)
- `config:voice-gate` Blob `{ min: 8, autofixFloor: 5 }` (default = intl's stricter bar). Shared `voiceGate(score)` → `{ pass, needsFix }`. Replace every inline `<5`/`<8`/`>=5 && <8` check in scheduler + intl-seo with it.
- ⚠️ Behavior change: UAE moves 5→8 (stricter = safer). **Verify next-run queue volume is sane, not zero.** Config-tunable if too aggressive.
- **Acceptance:** a UAE run and an intl run apply the identical threshold; a score-7 item is handled the same in both.

### P1.3 — One GSC path (C3/BC8)
- Route everything through `_lib/gsc.js` (dated, 25k, read-through cache blob w/ TTL). Port `gsc-data.js`; make `store.js fetchGscDirect/fetchGscWithPages` thin wrappers (or delete after callers move). UI reads the cache, not a fresh live call each load.
- **Acceptance:** Rankings/traffic/report numbers unchanged; GSC live-call count per Analytics page load ≤1.

### P1.4 — Extract `content-pipeline.js`; move UAE onto it (pure refactor)
- `runContentPipeline({brand, market:'uae', ...})` = today's scheduler jobs, moved verbatim (quick_wins/meta_rewrites/content_gaps/page_creation). scheduler-background becomes a thin loop calling it.
- **Acceptance:** a UAE dry-run produces the SAME items as before this step (diff the queued payloads).

### P1.5 — Route intl onto the same module (pure refactor)
- international-seo-background becomes a thin loop calling `runContentPipeline` per market/language. Its intelligence helpers move INTO the shared module (still only firing for intl at this step).
- **Acceptance:** an intl dry-run (KSA/Bahrain) produces the SAME items as before (diff payloads) — including serpFeatures/competitor fields.

### P1.6 — Turn ON intelligence for ALL markets + page-architecture guardrails (the actual win — C1)
- Enable SERP-feature routing + competitor context + cannibalization guard for UAE (they already run for intl now that it's shared). Gate behind `config:content-intelligence` (default on) so it's toggleable.
- **PLUS three page-architecture guardrails (added 11 Jul — Shazin flagged "fast food near me open now" being targeted at the HOMEPAGE, which no SEO expert would do).** Root cause: `targetPage` = the page GSC *already* shows impressions for (on a small site the homepage ranks for everything) — NOT the page the keyword *should* live on. The tool reflects Google's accidental association instead of applying page-role judgment. Fix — a `validateTargetPage(opp)` step before an opportunity becomes a meta_update/page_update:
  1. ✅ **Protect the homepage — DONE v7.4.77** (early, in keyword-discovery-background.js recommendAction): a non-brand keyword ranking on / never yields a homepage rewrite; branded queries still fine-tune it. isHomepageUrl + isBrandedQuery.
  2. ✅ **Intent → page-type routing — DONE v7.4.77** (paired with #1): a homepage-blocked keyword with local intent → location/landing page; else → dedicated page. Full SERP-local-pack routing beyond the homepage case lands with the pipeline extraction.
  3. ⬜ **Target-page fit check** — tighten matchExistingPage token-overlap (use pageInventory:BRAND) so several distinct terms don’t pile onto one loose-match promo page (observed: /ksa-win-free-burgers). NEXT increment.
- **Acceptance (the P1 gate):** a UAE manual run shows serpFeatures/competitor context on items; a content_gap that would duplicate an existing UAE page is blocked; **"fast food near me open now" no longer produces a homepage meta_update — it routes to a Locations page (or a create-page recommendation); the homepage is never rewritten for a long-tail/local keyword**; "hot burger"→cheeseburger-page style product→product-page matches still work; intl unchanged.

### P1.7 — Measurement holes (C4 remainder)
- onpage_suggestion gets a trackingKeyword (so it can be measured); review/schema flagged `unmeasured:true`; 60-day "no traction" verdict for seed blogs; structured `marketKey` on new items (keep `locationTag` for display).
- **Acceptance:** content-outcomes reports a status for every measurable type; no type silently un-tracked.

---

## Acceptance gate for P1 as a whole (from the plan)
One manual run per brand for **UAE + 2 intl markets** produces queue items with **identical gate behaviour** and **intelligence fields**; a UAE item shows serpFeatures/competitor context; a duplicate-target UAE content_gap is blocked; GSC live-fetch per Analytics page load ≤1. All config-driven.

## Risks & rollback
- **Blast radius = the live content loop.** Mitigation: steps 0–5 are behavior-preserving (diff payloads to prove it); only step 6 changes output, behind a config toggle → instant rollback by flipping `config:content-intelligence` off.
- Keep the old functions until the new path is verified; delete in a follow-up.
- **Verification needs DataForSEO + live runs** — this is exactly why P0 (and a positive DFS balance) must land first.

## What this spec deliberately does NOT include (later phases)
- **S4 authorization** + **BC9 brand→GSC config map** → P2 (identity/config layer).
- Visibility features (SERP-feature history, competitor deltas, traffic est., clustering) → P3.
- The queue-module (P1.0/1.1) is the natural home to later add per-brand/market scoping hooks for P2.
