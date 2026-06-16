# The Nest — Claude Code Session Rules
> Read SETUP.md next. It is the definitive source of truth: current build state, all Blobs keys, API routes, and full history of what's been built.

---

## Mandatory Rules — Never Break These

1. **Read SETUP.md first**, every session, before touching any file.
2. **Update SETUP.md before committing** any changes. No exceptions.
3. **Work in `output/`** — that's the deployable site root.
4. **Deploy:** `git push origin main` → Netlify auto-deploys. No manual steps.
5. **DataForSEO: Standard mode ONLY** — `task_post` + `task_get` polling. NEVER use live/advanced endpoints. Batch max 100 keywords per POST.
6. **Jordan URL is `/pickl-jordan/`** — NEVER change this. Already indexed by Google.
7. **Background functions** must be called at `/.netlify/functions/<name>` directly — redirects in netlify.toml do NOT work for them.
8. **Bootstrap admins** (always Admin regardless of Blobs): `shazin@yolkbrands.com`, `steve@yolkbrands.com`
9. **Claude model:** `claude-sonnet-4-6` (set in `_lib/store.js` callClaude function)
10. **Syntax check** all JS before committing: `node --check` on every function file + extract and check index.html JS.

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

---

## Current Version: v7.0.5

See SETUP.md → "Done (Full History)" for complete build log.

**Next up (see memory for full deferred backlog):**
- Slack bot OAuth — deep-link notifications to specific brand → market → calendar post
- International keyword opportunities (UAE only right now)
- Verify bugs: AI caption ignores image, PDF export truncated, video upload greyed out, deep audit not saving, "+30 more" keywords not clickable
- Tone-of-voice check before approval queue
- Domain migration → thenest.yolkbrands.com (checklist in SETUP.md)

**⚠️ Adding a new market — REQUIRED steps:**
1. Add to `CAL_MARKETS` in `index.html`
2. Add IANA timezone to `MARKET_TIMEZONES` in `calendar.js`
3. Add IANA timezone to `CAL_MARKET_TIMEZONES` in `index.html`
4. Add timezone abbreviation to `CAL_MARKET_TZ_ABBR` in `index.html`
5. Add SP account IDs to `SP_ACCOUNTS` in `calendar.js`
6. Add SP account IDs to `SP_ACCOUNTS_FLAT` in `index.html`
7. Add SP has-account map to `SP_HAS_ACCOUNT` in `index.html`
8. Add market config to `INTERNATIONAL_MARKETS` in `_lib/international-config.js`
9. Add location code to `MARKET_LOCATIONS` in `keyword-discovery-background.js`
10. Add market keyword terms to `MARKET_KEYWORD_TERMS` in `international-seo-background.js`
- Delivery platform SEO — Talabat, Deliveroo, Noon Food keyword optimisation

---

## Crons (Monday 4am UTC = 8am Dubai)

```
scheduler-background         — Content pipeline + GSC snapshots + CPC enrichment
competitor-matrix-background — Competitor keyword tracking
international-seo-background — 9-market content pipeline
technical-seo-background     — PageSpeed + health checks
llm-mentions-background      — LLM brand mention tracking
backlinks-background         — Referring domains + competitor comparison
citations-background         — NAP citation check across 5 UAE food platforms
ai-overview-background       — AI Overview visibility check (top 20 keywords per brand)
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
