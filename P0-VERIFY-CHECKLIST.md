# P0 — Live Verify Checklist (run signed in to yolkseo.netlify.app)
> The P0 gate before P1 (pipeline unification). This clears the v7.4.13–28 verification debt + confirms the reporting/tracker/long-term features + the Arabic fail-open fix work on live data. Fable can't run these — they need a signed-in session + real GSC/DataForSEO data.
> Mark each ✅/❌. Anything ❌ → tell Claude the exact symptom; it becomes a fix before P1.

## STATUS (11 Jul 2026)
- ✅ **V1 PASSED (no spend).** KSA Opportunities already shows a full set of ARABIC keyword opportunities (16 gaps / 21 push / 63 quick wins / 12 long-term) — the fail-open bug was "0 Arabic opportunities", so their presence proves Arabic ideas now flow through the filter. No refresh needed; **P0 gate CLEARED**; intl regenerate is safe. (Also ✅ V5: long-term group present — 12.)
- 📌 Observed in the same data (NOT an Arabic-gate issue — the P1.6 page-architecture gap): "برجر" (301k vol) → "create a blog post" (should be a menu/category page); several burger variants → one /ksa-win-free-burgers promo page. Guardrails already added to P1.6.
- V2–V4 (traffic/tracker, free) — optional, not yet run; nice-to-have, not gating.
- V7/V8 — spot-checks, optional.

## 🔴 GATE — do this FIRST, and do NOT run any international content regenerate until it passes
### V1. Arabic Opportunities fail-open fix (v7.4.24, never live-tested)  — PENDING (DataForSEO top-up)
1. Analytics → Opportunities. Set brand = **Pickl**, market = **KSA** (🇸🇦). Click **Refresh Now**. Wait 1–3 min.
2. Then repeat for market = **Bahrain** (🇧🇭).
- **PASS:** Arabic keyword opportunities populate (rows with Arabic keywords, volume/KD). The empty-state diag no longer says "200 ideas → Claude filtered all as irrelevant".
- **FAIL:** still 0 opportunities / "filtered all as irrelevant" → the batching/fail-open fix isn't working. **Stop — do not regenerate intl content.** Report to Claude.

## Traffic report (v7.4.63)
### V2. Per-market traffic vs June baseline
1. Analytics → Rankings → **Organic Traffic by Market** card. Brand = Pickl, set the date range to **June 2026** (1–30 Jun).
2. Filter = **Total**.
- **PASS:** UAE ≈ **3,230 clicks / ~148k impressions**; Pickl total ≈ **4,796 / ~205k**; Egypt ~920, KSA ~202, Oman shows **0** (known not-indexed). Numbers within ~5–10% of these.
- Switch filter to **Non-branded** → UAE ≈ **150 clicks, avg pos ~9.7**. Switch to **Branded** → the bulk of clicks (~93%).
- **FAIL:** wildly different numbers, blank table, or branded+non-branded summing exactly to Total (they should NOT — non-branded undercounts).

## Rank tracker (v7.4.64)
### V3. Tracker seeds every market
1. Analytics → Rankings → **Rank Tracker** card. For **each** market in the dropdown (Pickl: UAE, Bahrain, KSA, Qatar, Egypt, Jordan, Oman; Bonbird: UAE, Oman, Pakistan, Qatar):
- **PASS:** the table auto-seeds tracked keywords (from the worklist) — not empty. Δ/trend/sparklines will be blank until 2+ weekly cron runs have accrued (expected — note the date).
- **FAIL:** a market shows "No tracked keywords" AND its Opportunities worklist is non-empty → seeding is broken for that market.
2. Toggle **Non-branded / Branded / All** — the table + summary chips re-filter. Pin/remove/add a keyword → persists on reload.
### V4. CEO rollup
- Analytics → Reports (Pickl). The **📊 Rank Tracker — Non-branded** card shows aggregated chips + Top movers / Needs attention (movers blank until 2nd snapshot — OK).

## Long-term targets (v7.4.65)
### V5. Long-term group populates
1. Opportunities → Pickl / UAE → **Refresh Now** (runs discovery). Wait for it to finish.
- **PASS:** a **🎯 Long-term** summary badge appears with a count; the tier filter has a "🎯 Long-term Targets" option; scrolling to the bottom shows the purple **"🎯 Long-term targets"** banner + rows with the "why" note + AI/Perch buttons.
- **FAIL:** no long-term group after a fresh discovery run (note: it only appears AFTER a discovery run, not on old stored data).

## Content-intelligence (built v7.4.25–28, never live-tested) — optional, deeper
### V6. Intelligence fields on a manual intl run
1. Trigger a manual intl run for one market (Claude can do this, or: the intl pipeline is manual-only). After it queues items, open a queued **intl** item's card.
- **PASS:** SERP-feature routing (local-pack keywords → page not blog), competitor "pages to beat" context present, no duplicate page for a keyword already covered.
- This is lower priority — flag anything odd; full closed-loop attribution needs 14+ days post-publish.

## Backend fixes just shipped (v7.4.70–71) — spot check
### V7. page_update keeps a live page live (BC2)
- If you have a safe test page: approve a **page_update** on an already-published page → confirm the public URL still returns 200 (not a 404/draft). **This was the bug — a live page should stay live with updated content.**
### V8. No duplicate content re-queued (BC1)
- Over the next weekly run, confirm the approvals queue isn't re-generating items for keywords already pushed/published (the index-truncation fix). Hard to eyeball instantly; watch for obvious dupes.

---
**When done:** tell Claude which items passed/failed. All green (esp. V1) → P0 gate cleared → start **P1 (pipeline unification)**.
