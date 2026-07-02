# THE NEST — Session Handoff

> Paste the top section as the first message in a new session. **Read SETUP.md + the auto-loaded memory (`seo-pipeline-full-audit`, `seo-platform-roadmap`) and `/NEST-ROADMAP.md` FIRST, before touching anything.** Current version: v7.4.46.

---

## Context: where we are
The Nest is our in-house SEO platform (Pickl + Bonbird, 9 intl markets). Last session = a security remediation (DONE) + an international-SEO strategic reset (IN PROGRESS). The publishing engine is PROVEN: automated meta writes go live on WordPress (RankMath), and a page's on-page score went **25→78**. Note: background functions always return HTTP 202 — **verify them by data-change, not status code.**

## ✅ DONE (verified live)
- **Security sweep complete (v7.4.41–46).** Every function that spends money / mutates / returns non-public data is gated via `_lib/auth` — `authorize()` for on-demand, `authorizeJob()` for `-background`/cron (allows Netlify scheduled invoke + internal header + session). Only auth-flow endpoints are public. Fixed: open Anthropic proxy (claude.js), leaked GSC tokens + Slack webhook (db-get.js), ungated cost/DoS background jobs, session-expiry bug. CLAUDE.md **rule 11** = security is a build requirement.
- **Intl keyword-research relevance fix (Phase 1, step 1).** `RELEVANT_ROOTS` positive allowlist in `keyword-discovery-background.js` `applyStaticFilter` — validated live: KSA/Bahrain/UAE now return clean burger/chicken keywords (was 50–80% junk: ministries, museums, telecoms). KD location-code fix (UAE 21191→2784).

## ⚠️ THE MESS / what needs fixing
1. **International meta was built BACKWARDS (meta-first, no target keyword).** The blind `runMarketPageMetaSweep` in `international-seo-background.js` is still deployed but is being DISCARDED. Do NOT build on it. Real fix = keyword-first (below).
2. **Keyword research half-fixed.** Allowlist cleans relevance, but: scoring is still volume-weighted (`scoreOpportunity`); KD comes back mostly `0` = "no DataForSEO data" for regional/long-tail — **treat KD=0 as UNKNOWN, not easy**, when scoring.
3. **Verification debt.** Lots of v7.4.13–28 shipped untested — esp. the 4 content-intelligence gaps (SERP routing, cannibalization guard, page-context, closed-loop attribution) and the Arabic opportunities filter fail-closed bug. Verify before trusting.

## ✅ PHASE 1 LIVE-VALIDATED — ACCEPTANCE GATE PASSED (v7.4.48, 2 Jul 2026)
- **v7.4.48** fixed the two bugs the v7.4.47 live run exposed. Root cause: `gscCache.rows` is query-dimension only (no page), so the intl per-market GSC filter failed open → every intl market got 500 property-wide UAE keywords with UAE positions mislabeled. Fix: **own-domain `ranked_keywords`** (Labs, URL-tagged) + `urlMatchesTokens` (via `getMarketPageTokens`) attributes each keyword to its market by ranking URL; `isOwnBrandKeyword` drops navigational brand searches. Re-run: contamination GONE, top10 flood collapsed (Bahrain 82→6, KSA 66→0, UAE 59→18), brand junk gone, scoring correct (KSA #1 = winnable kd3 "burgers restaurant near me"; head term برجر vol 301k sits at #15). Bahrain FAIL→PASS (~18/20 clean), KSA/UAE strong pass. Coverage: Bahrain 71 / KSA 73 / UAE 100 opps.
- **Residual (minor, non-blocking):** Qatar/Oman/Pakistan aren't in Labs → intl skips organic (competitor+ideas only) — FOLLOW-UP: GSC `['page','query']` pull for them + first-party accuracy. Occasional competitor-brand in our OWN rankings (jollibee bahrain menu — GSC un-gated by design). `GET /keyword-opportunities` still ungated (rule-11 gap, deferred small fix).
- **(v7.4.47) Phase 1 steps 2+3** (`keyword-discovery-background.js`): GSC + competitor are now PRIMARY candidate sources (GSC keywords become opportunities directly via new `addCandidate`/`candidates` Map — were only position-annotation before, missing quick-wins; GSC bypasses allowlist; ideas demoted to supplement). Scoring rebuilt: `relevance×(0.35·vol+0.25·winnability+0.25·intent+0.15·gap)`, `SOURCE_RELEVANCE` multiplier (gsc 1.0/comp 0.9/idea 0.75), new `intentScore` (EN+AR) + `winnabilityScore` (KD-driven). **KD=0/null = UNKNOWN→0.5, never "easy."** Enrich-before-score (batched, cheap) fixes the enrich-after-slice bug. Offline: GSC quick-win 0.810 > competitor 0.626 > high-vol-KD0 idea 0.544 > recipe 0.203.
- **⚠️ Owed before trusting (deployed, but NOT yet validated):** trigger a discovery run (`?brand=&market=` or Monday cron) → hit `/keyword-opportunities?brand=&market=` → **eyeball top-20/market** (acceptance gate). Watch specifically whether branded/navigational GSC queries flood the top-20 (GSC intentionally un-gated per roadmap) — if so, add a brand-name filter for GSC candidates. Key rotations (Anthropic/GSC/Slack) remain on Shazin/IT — orthogonal to this deploy.

## 🔨 WHAT TO BUILD — international keyword-first rebuild (plan in /NEST-ROADMAP.md)
- **Phase 1 (finish):** ✅ code staged (above). NEXT: deploy + live top-20 validation.
- **Phase 2:** site crawler / page + GSC inventory (automated version of the audits — DataForSEO OnPage API; spec in `seo-build-handoff-and-testlist` memory).
- **Phase 3:** keyword→page mapping + prioritization (the opportunity list that must exist BEFORE any meta).
- **Phase 4:** execution keyword-first — KEEP UAE's `runMarketDataDrivenSEO` (GSC-driven) pattern; DISCARD the blind sweep.
- **Phase 5:** closed-loop measurement.

## Key facts / decisions
- **Verified Pickl awards** (in `_lib/brand.js`, do not change): TimeOut Dubai Best Burger 2022+2023 (2×, NEVER "four-time"); Deliveroo Restaurant of the Year 2022–2025 (4×); Deliveroo Best Fried Chicken (year unconfirmed → state NO year); Deliveroo Best Homegrown Dubai 2025. ALL Dubai/UAE — intl content cites as pedigree only, NEVER localizes ("never Bahrain's Best Burger winner"). A mechanical fact-claim guard (`verifyAwardClaims`) rejects fabricated awards. **Bonbird awards: NONE on file — ask Shazin.**
- **Funding:** Pro annual + metered top-ups (20x Max rejected). Possible future migration Netlify→Google VM — guide in SETUP.md; auth is migration-proof.
- **Rules:** update SETUP.md + memory BEFORE committing; NEVER commit/push without explicit approval; ONE deploy per batch (Netlify credits limited); `node --check` all JS.
- **Useful endpoints:** `/sweep-report?brand=&market=` (per-page decisions), `/keyword-opportunities?brand=&market=` (keyword data). Both gated now — trigger via UI or with the internal header.
- **SEO audits:** two independent audits (Pickl + Bonbird PDFs in ~/Downloads) confirmed gaps — no crawler, thin content, no schema, PDF menu, no location pages, weak backlinks. Most is dev/content/PR work, not tool work.

## Outstanding HUMAN actions (Shazin/IT, not code)
- Rotate **Anthropic API key + GSC OAuth tokens + Slack webhook** (were publicly exposed pre-fix).
- Confirm Monday crons actually fired (scheduled-invoke path can't be simulated locally).
- Provide Bonbird awards/facts.

## Suggested first step
Confirm the security rotations are done, then resume **Phase 1** — competitor-keyword sourcing + KD/scoring — validating top-20-per-market before building anything on top.
