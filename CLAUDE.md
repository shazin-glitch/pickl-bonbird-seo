# The Nest — Claude Code Session Rules
> Read SETUP.md next. It is the definitive source of truth: current build state, all Blobs keys, API routes, and full history of what's been built.

---

## Mandatory Rules — Never Break These

> # ⭐ RULE #1 — OVERRIDES EVERYTHING BELOW
> **Never act on an unverified assumption.** VERIFY FIRST — especially before any write, live/production touch, or irreversible action. State the assumption, confirm it with a **read-only** check (config/code/current stored state), then act. Can't verify → STOP and ask; never "just try it."
> - **Never use a live/production resource as a test fixture.** Verify read-only, or against a **throwaway draft you create and then delete** — never a real page/post/record.
> - **Every write is irreversible until a clean rollback is confirmed.** READ + save current state first (`get_post`/`get_revisions`).
> - **Don't infer behaviour from a name or pattern** — check the actual page type / config / code path.
> - If this and any rule below ever conflict, **this wins.** Full text + the incident that created it = **rule 13**. (This is the highest-priority rule; it keeps the number 13 only so existing references stay valid.)

> # ⭐ RULE #2 — SCALABILITY IS A BUILD REQUIREMENT (non-negotiable)
> **Everything new must be CONFIG-DRIVEN and scale to a new brand / market / city / venue with ZERO code edits.** Before building anything, ask "does this work for the next brand/market with no code change?" — if adding one would need a code edit, it's not done.
> - Derive from the SINGLE source (config records / accessors), never a hardcoded list, inline `?:` brand ternary, static `<option>`, or a mirrored literal.
> - New per-brand/market/venue DATA goes in the **config record + the Settings form that writes it** — not a code literal. A reader must load the **Blobs-merged config**, never a static seed literal, or onboarded records are invisible.
> - Full text + rationale + the bugs it exists to prevent = **rule 12** below.

1. **Read SETUP.md first**, every session, before touching any file.
2. **Update SETUP.md before committing** any changes. No exceptions.
3. **Repo layout (v7.5.0 restructure):** functions at `netlify/functions/`, frontend `index.html` at repo ROOT. (The old `output/` root is gone — ignore any "output/" references below.)
4. **Deploy:** `git push origin main` → Netlify auto-deploys. No manual steps.
5. **DataForSEO: Standard mode (`task_post`+`task_get`) for crawls & SERP** — NEVER the expensive live/advanced SERP/OnPage endpoints; batch ≤100/POST. EXCEPTION (in use since before v7.4 + v7.7.0 onboarding): cheap instant DataForSEO **Labs** lookups — `ranked_keywords/live`, `competitors_domain/live`, `keyword_ideas/live` — are allowed (they're not the metered SERP/crawl class; used by keyword-discovery, competitor-matrix, brand-discover).
6. **Jordan URL is `/pickl-jordan/`** — NEVER change this. Already indexed by Google.
7. **Background functions** must be called at `/.netlify/functions/<name>` directly — redirects in netlify.toml do NOT work for them.
8. **Bootstrap admins** (always Admin regardless of Blobs): `shazin@yolkbrands.com`, `steve@yolkbrands.com`
9. **Claude model:** `claude-sonnet-4-6` (set in `_lib/store.js` callClaude function)
10. **Run `npm run check` before committing — not just `node --check`.** `node --check` only validates SYNTAX; it CANNOT see an out-of-scope variable, and a `try/catch` will happily swallow the resulting ReferenceError so the bug looks like a graceful fallback. Three real bugs shipped this way (19-20 Aug): `technical-seo-background.js` referenced `brandCfg` outside its scope → **WP page discovery silently dead for every brand**; `index.html` had `m.brandName(brand)` → **Markets tab dead** ("brand is not defined"); `generate-draft.js generateTemplatePage` used `intelDirective` without declaring it → the ⚡Generate-body button would have thrown on first click. `tools/check.sh` (= `npm run check`) runs `node --check` **plus** an ESLint `no-undef` pass over `netlify/functions`, `js/*.js` and the extracted `index.html` inline JS. It uses `npx` — **no repo dependency, and the Netlify build never runs it.** If you add a genuine cross-file global, register it in `tools/eslint.browser.mjs`.
11. **Security is a build requirement, not an afterthought.** EVERY function/endpoint must gate with `_lib/auth` before it ships: `authorize(event)` (valid session OR `x-nest-internal` header) for on-demand endpoints; `authorizeJob(event)` for `-background`/cron jobs (allows the scheduled invoke + internal header + session). NEVER expose secrets, spend money (Anthropic/DataForSEO), publish externally, or mutate state on an unauthenticated handler. Any internal function→function `fetch` to a gated endpoint MUST send `internalHeaders()`. When building/reviewing a feature, ask "what's the auth + abuse surface?" first. Reads that return anything non-public get gated too.

12. **Scalability is a build requirement — everything new is config-driven, never hardcoded.** New code must scale to a new brand/market/site WITHOUT code edits. NEVER hardcode brand or market lists inline (`["pickl","bonbird"]`, static `<option>` market dropdowns, duplicated `INTL_MARKETS`-style mirrors). Derive brands×markets from the SINGLE source of truth — backend: `getMarketsForBrand()` / `INTERNATIONAL_MARKETS`; frontend: fetch that list from one endpoint and render dynamically, filtered by brand (a brand not in a market must not appear in the UI). Each market record carries its `brand`; onboarding a brand/market should touch ONE config record, not ~10 files. When building/reviewing, ask "does this scale to a new brand/market with no code change?" (The competitor-matrix `["pickl","bonbird"]` bug and the triple-hardcoded UI market lists are what this rule exists to prevent. Target end-state: config in Blobs + a Settings onboarding form + one brand×market-parameterised pipeline — see WS7 in `/NEST-ROADMAP.md`.)

13. **Never act on an unverified assumption — VERIFY FIRST, especially before any write, live/production touch, or irreversible action.** State the assumption, confirm it with a **read-only** check (read the config/code/current stored state), and only then act. If you cannot verify it, STOP and ask — do not "just try it."
    - **NEVER use a live/production resource as a test fixture.** Verification must be **read-only**, or run against a **throwaway draft you create and then delete** — never a real page/post/record. A "control" test to prove something does NOT happen must be read-only (read the guard's config), never a real mutating call.
    - **Any write is assumed irreversible** unless you have already confirmed a clean rollback. Before writing to a WP page/post, first READ and save its current content (`get_post` / `get_revisions`), so a mistake is recoverable.
    - **Do not infer behaviour from a name or a pattern** ("`/ae/` is probably a template no-op like the legacy pages"). Check the actual page type / config / code path before touching it.
    - This rule exists because a `/ae/` "control" write during verification **overwrote the live Bonbird homepage body** — an unverified assumption (that `/ae/` was a non-`post_content` no-op) applied via a mutating call to production. See SETUP.md v7.9.4 + memory [[feedback-verify-before-claiming-done]].

---

## Stack

| Layer | Detail |
|---|---|
| Frontend | Vanilla HTML — single `output/index.html` file |
| Functions | Netlify Functions — CommonJS (not ESM) in `output/netlify/functions/` |
| Storage | Netlify Blobs — store name: `seo-tool` |
| Auth | Google SSO — `@yolkbrands.com` only |
| Hosting | Netlify — `yolkseo.netlify.app` |
| Repo | `shazin-glitch/pickl-bonbird-seo` |

---

## Brands

| Brand | Domain | Pipeline |
|---|---|---|
| Pickl | eatpickl.com | ✅ Live |
| Bonbird | bonbirdchicken.com | ✅ Live |
| Southpour | southpourcoffee.com | 🔜 Planned |
| Shadowburg | — | 🔜 Planned |
| Shadowbird | — | 🔜 Planned |

---

## WordPress

- Always check `/posts` then `/pages`
- Env vars: `WP_PICKL_BASE` / `WP_BONBIRD_BASE`
- Jordan posts use parent page `/pickl-jordan/` with journal child slug
- **🔴 BONBIRD REBUILT (live 2026-08-18) — read `/BONBIRD-SITE-ARCHITECTURE.md` before generating/publishing ANY Bonbird content.** Key facts: ISO market URLs now `/ae/ /om/ /qa/ /pk/` (UAE moved off root; 136 redirects); page type decides writability — **journal posts = fully writable**; the **13 legacy product/location landing pages render from static Twig so their BODY is NOT writable** (Yoast meta is); new **"Bonbird Location/Product" template pages are hybrid** — Nest writes `post_content` (prose + an `<h2>FAQs</h2>` block → template builds accordion + schema), a human owns ACF images/NAP. 12 om/qa/pk product scaffolds sit as drafts ready for bodies. Never invent venues; city-hub content pages are the Nest opportunity; hold the anti-doorway/thin-content bar.

---

## Current Version: v7.9.23

See SETUP.md → session log for the complete build history.

**Canonical planning docs (read these first):**
- `/PLAN-FOR-OPUS.md` — the current build sequencing (P0 verify → P1 pipeline unification → P2 brand/market onboarding + config layer → P3 visibility → P4 CEO layer → P5 local → P6 backlog). Supersedes the workstream sequencing below.
- `/BUGS-AND-SECURITY.md` — verified bug/security register (security Tier 0–2 + backend correctness fixed through v7.4.71; remaining items folded into P1/P2).

**Next up:** P0 (signed-in live-verify pass — traffic/tracker/long-term + the Arabic Opportunities fail-open fix; do NOT run an intl regenerate until the Arabic fix is confirmed live) → P1 (unify the UAE + intl pipelines into one brand×market-parameterised module — also fixes BC3/BC5/BC6 queue-dup + voice-gate).

**Deferred backlog (see memory):** 🔴 **Local-SEO page bugs — `addressCountry:'AE'` + `@type:'Restaurant'` hardcoded (false NAP for non-UAE markets; wrong schema for cafe/corporate) + Qatar locations unconfirmed + Nest-vs-WP venue divergence — see `/BUGS-AND-SECURITY.md` §L1–L6 + memory `local-seo-pages-bugs-jul22`** · ⚠️ **GBP menu photo uploads for large files + set GCS bucket CORS (never done — do next; see SETUP "⚠️ OPEN" note + memory `gbp-menu-photo-upload-todo`)** · Slack bot OAuth deep-link · GBP deeper dive · domain migration → thenest.yolkbrands.com (checklist in SETUP.md).

**✅ Adding a brand or SEO market is now CONFIG-DRIVEN (v7.5.0–v7.7.0) — no code edits:**
- **Brand:** Settings → 🏷️ Brands → "✨ Onboard a brand" (URL → auto-discover identity/keywords/competitors → review → save). Or POST `/api/config {action:'save_brand'}`. Writes one `brandsConfig:<slug>` record. Set env `WP_<SLUG>_*` + `GBP_<SLUG>_*` in Netlify for publish/reviews.
- **SEO market:** Settings → 🌍 SEO Markets (or POST `/api/config {action:'save_market'}`). Writes one `marketsConfig:<key>` record. A brand launches UAE-only with zero markets.
- **The content CALENDAR** (SocialPilot accounts, timezones, `CAL_MARKETS`) is a SEPARATE content-team module — NOT part of the SEO markets config; add calendar markets there.
- Config layers: `_lib/brands-config.js` + `_lib/markets-config.js`; both BE & FE read via `/api/config`. Content brain = `_lib/content-pipeline.js`.
- Delivery platform SEO — Talabat, Deliveroo, Noon Food keyword optimisation (backlog).

---

## Crons (Monday 4am UTC = 8am Dubai)

```
scheduler-background         — Content pipeline + GSC snapshots + CPC enrichment
competitor-matrix-background — Competitor keyword tracking
international-seo-background — 9-market content pipeline  ⛔ CRON DISABLED v7.4.35 — manual only: ?market=<key>&only=meta
technical-seo-background     — PageSpeed + health checks
llm-mentions-background      — LLM brand mention tracking
backlinks-background         — Referring domains + competitor comparison
citations-background         — NAP citation check across 5 UAE food platforms
ai-overview-background       — AI Overview visibility check (top 20 keywords per brand)
```

Monday 6am UTC (after the 4am jobs):
```
snapshots-background         — GBP + speed dated snapshots for monthly-report trend history
content-outcomes-background  — Closed-loop: did shipped content move rankings (delta vs positionAtPublish)
```

Daily 5am UTC = 9am Dubai:
```
perch-notify-background      — Overdue + due today digest
```

---

## Key Blobs Keys

See SETUP.md → "Netlify Blobs Keys" for the full table.
Most-used: `approvals:index`, `gscCache:<brand>`, `competitorMatrix:<brand>`, `backlinkData:<brand>`, `brandExamples:<brand>`, `perchIndex`

---

## Session Commit Format

```
git add -A
git commit -m "v6.9X — brief description of what was built"
git push origin main
```

Always bump the version number in the commit message and in SETUP.md.
