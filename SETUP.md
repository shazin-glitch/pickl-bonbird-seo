# The Nest — SETUP.md
> **Definitive source of truth.** Updated every time a change is made.
> Start new chats by uploading the zip and saying **"read SETUP.md"**.

---

## Platform Identity

| Field | Value |
|---|---|
| **Platform name** | The Nest |
| **Built by** | Yolk Brands (Shazin + Claude) |
| **Repo** | shazin-glitch/pickl-bonbird-seo |
| **Current URL** | https://yolkseo.netlify.app |
| **Target URL** | thenest.yolkbrands.com |
| **Stack** | Vanilla HTML · Netlify Functions (CommonJS) · Netlify Blobs (`seo-tool` store) |
| **Working dir** | `/home/claude/output/` |
| **Zip command** | Always zip from `/home/claude/` as `pickl-bonbird-seo-main.zip` |
| **Deploy** | Push `output/` contents to GitHub `main` → Netlify auto-deploys |

---

## The Vision

The Nest is Yolk Brands' central marketing operations platform. It started as an SEO tool and is being built out to serve every department — SEO, Social, Design, Content — from one place. Role and department aware. Every team works from it. It replaces Trello for task management and eventually replaces Buffer/Hootsuite for social scheduling.

**Core principle:** The tool should not just surface problems. It should generate solutions, queue them for human approval, and publish them. Effort is automated. Judgement stays human.

---

## Brands

| Brand | Type | Website | WP | Pipeline |
|---|---|---|---|---|
| **Pickl** | Restaurant (UAE + 6 markets) | eatpickl.com | `WP_PICKL_*` | ✅ Live |
| **Bonbird** | Restaurant (UAE + 3 markets) | bonbirdchicken.com | `WP_BONBIRD_*` | ✅ Live |
| **Yolk Brands** | Parent company | yolkbrands.com | — | 📅 Calendar only |
| **Southpour** | Café/Coffee | southpourcoffee.com | TBD | 🔜 Planned |
| **Shadowburg** | Dark kitchen (runs from Pickl) | — | — | 🔜 Planned |
| **Shadowbird** | Dark kitchen (runs from Bonbird) | — | — | 🔜 Planned |

**Dark kitchen visibility rule:** Pickl team sees Pickl + Shadowburg. Bonbird team sees Bonbird + Shadowbird.

---

## Navigation (locked)

| Tab | Purpose | Status |
|---|---|---|
| 🪺 **The Perch** | First tab. Marketing team kanban — replaces Trello | ✅ Built |
| 📋 **Approvals Queue** | SEO content items awaiting review/publish | ✅ Built |
| 📈 **Reports** | CEO-ready SEO report. Traffic value (AED, real CPC), rankings, AI readiness | ✅ Built |
| 📍 **Local SEO** | GBP location health, review queue (API pending), local flags | ✅ Built |
| 📊 **Analytics & ROI** | Raw GSC data, competitor matrix | ✅ Built |
| ⚡ **Technical SEO** | PageSpeed, CWV, international health, developer kanban | ✅ Built |
| 🌍 **International SEO** | 9-market content pipeline | ✅ Built |
| 🎨 **AI Content Studio** | Review responder, schema gen, content briefs, page audit | ✅ Built |
| ⚙️ **Settings & Logs** | Brand context, brand voice examples, users, roles, departments, audit log | ✅ Built |
| ❓ **How It Works** | Scheduler explained, keyword tiers, seed keywords | ✅ Built |

---

## What's Live Today

### SEO Engine ✅
- **Automated content pipeline** — Every Monday 8am Dubai the scheduler runs 4 jobs:
  - Quick Wins (pos 11-20): rewrites existing pages to push to page 1
  - Meta Rewrites (poor CTR): rewrites title + description using real GSC page URLs
  - Content Gaps (pos 21-100 + seed keywords): writes new blog posts
  - Page Creation (location/service intent): builds full landing pages
- **Brand voice quality gate** — Every piece scored 1-10. Below 5 = auto-rejected. 5-7 = warning. 8-10 = green. Banned words enforced.
- **Brand voice examples** — User-curated real writing pasted via Settings → Brand Voice Examples. Stored in Blobs. Injected into every Claude prompt INSTEAD of hardcoded wrong/right examples. Real writing beats described rules every time.
- **Keyword tier system** — ⚡ Quick Win (11-20) · 📈 Short Term (21-35) · 🎯 Long Term (36-100) · 🚨 Priority Gap (seed list)
- **Empty pages fork** — GSC showing impressions for missing/empty WP pages: ≥100 impressions → page_creation queued. <100 → skipped.
- **Seed keywords** — 20 Pickl + 18 Bonbird pre-loaded non-branded terms. Treated as Priority Gap tier.
- **CPC enrichment** — Every Monday scheduler fetches real Google Ads CPC for top 150 non-branded GSC keywords via DataForSEO Keywords Data API (~$0.008/week). Stored in gscCache rows as `cpc_usd` + `cpc_aed` (× 3.67). Reports uses real CPC when available, falls back to AED 5 estimate.

### Reports Tab ✅
- All currency in AED throughout.
- **Traffic value** — non-branded clicks only × real DataForSEO CPC per keyword (AED). Branded keywords excluded (near-zero advertiser value). Shows "DataForSEO CPC" badge once enriched, "AED 5/click est." before first Monday run.
- **Performance Summary** section (formerly "CEO Talking Points") — auto-adjusts text based on whether CPC data is real or estimated.
- Data source labels on every section: GSC 90 days, PageSpeed Insights, DataForSEO, Approvals Queue.

### International SEO ✅
- 9 markets: Pickl (Bahrain, KSA, Qatar, Egypt, Jordan, Oman) + Bonbird (Oman, Pakistan, Qatar)
- EN + AR content for GCC markets. EN only for Oman/Pakistan.
- Dedup check, brand voice check, Slack ping on completion.
- Jordan URL: `/pickl-jordan/` — DO NOT CHANGE, already indexed.

### Competitor Intelligence ✅
- DataForSEO Standard mode (not Live — $0.0006/kw)
- Batched 100 keywords per POST, polls every 5s
- SERP Advanced results include `keyword_info.cpc` — now captured and stored on every competitor matrix row (free, already paid for).
- Pickl competitors: Salt, High Joint, Shake Shack, Five Guys
- Bonbird competitors: Raising Cane's, Jailbird, Dave's Hot Chicken, Toit, Nash Hot Chicken, Peppers, Jollibee, KFC, Popeyes

### Technical SEO ✅
- PageSpeed Insights (mobile + desktop) on core WP pages
- **Priority pages always audited:**
  - Pickl: Homepage, About, Menu, Locations, Franchise, Events
  - Bonbird: Homepage, uae-menu/ (correct URL), Locations, Franchise, Philosophy
- **Skip list:** taco-bird, menu-test, test-menu, menu-2, menu-old + existing game slugs — never audited
- International pages: HTTP health check + mobile PSI on all 9 markets
- Developer kanban: issues auto-created from audit, To Do → In Progress → Done
- Weekly cron: Monday 4am UTC alongside content pipeline
- API key: `GOOGLE_PAGESPEED_KEY` env var (25k queries/day free)

### The Perch (Marketing Team Kanban) ✅
- Drag and drop between columns (To Do / In Progress / In Review / Done)
- Slide-in right panel with inline editing (title, description, all fields)
- **Labels:** Urgent · Blocked · Awaiting Feedback · Scheduled · In Review · Campaign · Assets Needed · Done
- Quick-add cards at bottom of each column
- Assignee by name (not email) from users list
- Filters: Brand + Department + Assignee + Priority + My Tasks toggle
- Visibility rules: Pickl team sees Pickl+Shadowburg. Bonbird sees Bonbird+Shadowbird. Admin sees all.
- Comment thread on every task. Full audit log.
- **Slack notifications:** Task assigned to someone → Slack ping. Task moved to Done → Slack ping. Daily 9am Dubai overdue/due-soon digest.

### Slack ✅
- Full Block Kit messages (rich formatting, not plain text).
- Scheduler sends one message per brand after Monday run: items grouped by type (Quick Wins, Blog Drafts, etc.) with title, keyword, position, and voice score per item.
- Perch: task assignment notification, task completion notification, daily due date digest (overdue / due today / due this week).
- **Interactive approve/dismiss buttons** (from Slack, no need to open The Nest):
  - Requires one-time Slack App setup: Settings → Interactivity & Shortcuts → Request URL: `https://yolkseo.netlify.app/api/slack-callback`
  - `slack-callback.js` handles button presses, updates item status, updates the Slack message in-place.
- Webhook URL: Settings tab → saved to Blobs `slackWebhookUrl`. SLACK_WEBHOOK_URL env var as fallback.

### Auth & Roles ✅
- Google SSO. Only authorised @yolkbrands.com accounts get in.
- Bootstrap admins: shazin@yolkbrands.com, steve@yolkbrands.com (always Admin)
- Roles: Viewer (read-only) · Manager (approve/action) · Admin (everything + user management) · Developer (Technical SEO tab only — dev kanban only)
- User profile: role + brand + department — assigned at invite time OR updated after via Settings → Users
- Add User: modal form with checkboxes for brand access (pick any combination) — replaced old window.prompt
- Last Login column in Users table (relative time: Just now / 2h ago / Yesterday / X days ago)
- Brand access stored as array: user can have Pickl + Bonbird without All Brands
- User table shows brands as pills with ✏️ edit button opening checkbox modal

---

## Roadmap — 6 Weeks

**How we work:** Each session = one or two features. Upload zip, say "read SETUP.md, build X". Deploy. Test. Next session.

---

### Week 1 (now)
- **GBP Reviews activate** — remove stub in gbp-reviews.js once Google API approval lands (applied, pending)
- **Hreflang** — click Generate Hreflang in International SEO tab, approve items, implement via Yoast
- **Ranking movement** — Monday's snapshot will be #2, week-on-week deltas start showing

### Week 2
- **Backlink monitoring** — DataForSEO backlink API: domain authority, new/lost links, competitor backlink gaps
- **Citation tracker** — NAP consistency check across Zomato, TripAdvisor, Time Out Dubai, What's On, The Entertainer
- **Google Reviews management** — live once GBP API approved: review replies in brand voice, approve → publish

### Week 3
- **GA4 integration** — real sessions + revenue from organic search in AED (requires GA4 tracking on WP first)
- **AI Overview visibility tracker** — weekly check: are we appearing in Google's AI results for top 20 keywords
- **Deep competitor audit** — enter any competitor URL, get their top keywords, traffic estimate, backlink count

### Week 4
- **YouTube SEO module** — keyword research, video content briefs, video schema markup
- **Email digest** — weekly Monday summary email: what was queued, approved, published, top 3 targets
- **CEO PDF report** — monthly one-page export: ranking gains, content published, traffic value, ROI

### Week 5
- **Social media workflow → SocialPilot** — AI-assisted brand-voiced captions, approval workflow, auto-publish
- **Content calendar view** — all approved + scheduled content across SEO, social, design in one calendar
- **Delivery platform SEO** — Talabat, Deliveroo, Noon Food keyword optimisation (UAE-specific)

### Week 6
- **Multi-brand expansion** — Southpour, Shadowburg, Shadowbird into full SEO pipeline
- **Brand voice interview** — 8-question guided interview auto-populates brand context
- **Arabic content layer** — Arabic prompt layer for GCC markets, RTL handling

---

## What This Means for the CEO Meeting

**What we've built (talk to this):**
> "We've built The Nest — our internal marketing operations platform. The SEO engine runs every Monday automatically: it identifies our weakest keyword opportunities, writes improved content in Pickl and Bonbird's exact brand voice using real examples of how each brand actually writes, and queues it for approval. Nothing publishes without a human decision. The international pipeline covers 9 markets. We have technical SEO monitoring, competitor intelligence tracking, and The Perch — a Trello replacement for the whole marketing department. The whole thing cost less than one month of agency fees to build and runs permanently."

**What we're showing today:**
> "Here's our current SEO performance: [open Reports tab — traffic value in AED, position distribution, top keywords, Quick Wins waiting]. The traffic value is calculated using real Google Ads CPC data per keyword — not a flat estimate. Here's our AI Search Readiness Score against Google's own criteria — and here's exactly what's blocking us [page speed]. Here's the content pipeline this month — [X] items queued, [Y] approved, [Z] live."

**Competitor intelligence (what it actually does):**
> "We track where Salt, Shake Shack, Raising Cane's and others rank for the same keywords we target. That data lives in the Analytics tab — it shows side by side where they are vs where we are. We use it to prioritise our seed keywords and content targets."

**What's next (6 weeks):**
> "This week: GBP reviews go live once Google approves our API access (applied). Hreflang for 9 international markets — prevents Google treating our market pages as duplicate content. By week 3: real revenue attribution via GA4, AI Overview visibility tracking. By week 6: social media workflow, content calendar, YouTube SEO."

**The honest truth on page speed:**
> "Pickl's homepage scores 40/100 on mobile. LCP is 9.4 seconds against Google's 2.5-second threshold. This is directly limiting our eligibility for AI Overviews — the fastest-growing traffic source on Google. This is a developer fix, not a content fix. It needs to be prioritised immediately."

---

## Technical Reference

### Netlify Environment Variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API — model: claude-sonnet-4-6 (upgraded from claude-sonnet-4-20250514) |
| `GOOGLE_CLIENT_ID` | OAuth |
| `GOOGLE_CLIENT_SECRET` | OAuth |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL |
| `NETLIFY_SITE_ID` | Blobs access |
| `NETLIFY_AUTH_TOKEN` | Blobs access |
| `WP_PICKL_BASE` | Pickl WordPress REST base URL |
| `WP_PICKL_USER` | WP username |
| `WP_PICKL_APP_PASS` | WP application password |
| `WP_BONBIRD_BASE` | Bonbird WordPress REST base URL |
| `WP_BONBIRD_USER` | WP username |
| `WP_BONBIRD_APP_PASS` | WP application password |
| `DATAFORSEO_LOGIN` | DataForSEO API (SERP + Keywords Data) |
| `DATAFORSEO_PASSWORD` | DataForSEO API |
| `SLACK_WEBHOOK_URL` | Optional — Blobs value takes priority |
| `GOOGLE_PAGESPEED_KEY` | PageSpeed Insights API (25k/day free) |

### Netlify Blobs Keys (`seo-tool` store)

| Key | Contents |
|---|---|
| `approvals:index` | Array of all approval IDs |
| `approvals:<id>` | Individual approval payload |
| `userSession:<token>` | Session (email, name, picture) |
| `userRole:<email>` | Role: viewer/manager/admin/developer · lastLogin timestamp |
| `userProfile:<email>` | brands[] array + department assignment (backward compat: old single brand string auto-converted) |
| `userIndex` | Array of all user emails |
| `gscTokens` | GSC OAuth tokens |
| `gscCache:<siteUrl>` | GSC keyword data + `cpc_usd` / `cpc_aed` per row after Monday enrichment — 24hr TTL |
| `gscPageCache:<siteUrl>` | GSC keyword+page data — 24hr TTL |
| `gscSnapshot:<brand>:<YYYY-MM-DD>` | Weekly ranking snapshot |
| `brandContext:pickl/bonbird` | Editable brand context (Settings) |
| `brandExamples:pickl/bonbird` | User-curated brand writing examples pasted in Settings → Brand Voice Examples. Injected into every Claude content prompt. Max 50k chars. |
| `competitorMatrix:<brand>` | Latest competitor rankings + `cpc_usd` per keyword |
| `competitorConfig:<brand>` | Competitor domain list |
| `keywordConfig:<brand>` | Keyword filter settings |
| `seedKeywords:<brand>` | Manually curated seed keywords |
| `technicalSeo:<brand>` | Latest PSI audit results |
| `techTask:<id>` | Developer kanban task |
| `techTaskIndex:<brand>` | Array of tech task IDs |
| `perchIndex` | Array of all Perch task IDs |
| `perchTask:<id>` | Individual Perch marketing task |
| `slackWebhookUrl` | Slack webhook URL |
| `gbpTokens` | Google Business Profile OAuth tokens |
| `gbpCache:<brand>` | GBP location health data — 6hr TTL |
| `scheduler:lastrun` | Last scheduler run summary |
| `intlProcessed:<marketKey>:<lang>` | International dedup check |

### Cron Schedule

```toml
# Monday 04:00 UTC = 08:00 Dubai
[functions."scheduler-background"]         # Content pipeline + GSC snapshots + CPC enrichment
[functions."competitor-matrix-background"] # Competitor keyword tracking + CPC capture
[functions."international-seo-background"] # 9-market content
[functions."technical-seo-background"]     # PageSpeed + health checks

# Daily 05:00 UTC = 09:00 Dubai
[functions."perch-notify-background"]      # Overdue + due today + due this week digest
```

### DataForSEO Usage

| Endpoint | What for | Cost |
|---|---|---|
| `serp/google/organic` Standard | Competitor keyword rankings. Response includes `keyword_info.cpc` — captured for free. | ~$0.0006/kw |
| `keywords_data/google_ads/search_volume` Standard | Real Google Ads CPC for top 150 non-branded GSC keywords. Runs Monday. | ~$0.05/1000 kw ≈ $0.008/week |

**Rule:** Standard mode ONLY — task_post then task_get polling. NEVER use live/advanced endpoints.
Batch up to 100 keywords per SERP POST. Poll every 5s, max 10 minutes.

### API Routes

| Path | Function |
|---|---|
| `/api/approvals` | approvals.js |
| `/api/claude` | claude.js |
| `/api/auth/login` | auth-login.js |
| `/api/auth/callback` | auth-callback.js |
| `/api/auth/user` | auth-user.js |
| `/api/auth/logout` | auth-logout.js |
| `/api/users` | user-management.js |
| `/api/slack-notify` | slack-notify.js |
| `/api/slack-callback` | slack-callback.js ← Slack interactive button handler |
| `/api/seed-keywords` | seed-keywords.js |
| `/api/gsc-data` | gsc-data.js |
| `/api/db/get` | db-get.js |
| `/api/db/save` | db-save.js |
| `/api/wordpress` | wordpress.js |
| `/api/scheduler` | scheduler.js |
| `/api/reviews` | reviews.js |
| `/api/competitor-config` | competitor-config.js |
| `/api/keyword-config` | keyword-config.js |
| `/api/competitor-matrix` | competitor-matrix.js |
| `/api/technical-seo` | technical-seo.js |
| `/api/tech-tasks` | tech-tasks.js |
| `/api/perch` | perch.js |
| `/api/brand-examples` | brand-examples.js ← Brand voice examples CRUD |
| `/api/gbp-data` | gbp-data.js ← GBP location health data |
| `/api/gbp-reviews` | gbp-reviews.js ← Review queue (stub, activates when API approved) |
| `/api/hreflang` | hreflang.js ← Generate hreflang for 9 markets |

### International Markets

**Pickl (6):** Bahrain `/bh/` · KSA `/ksa/` · Qatar `/qatar/` · Egypt `/egypt/` · Jordan `/pickl-jordan/` ⚠️ · Oman `/oman/`
**Bonbird (3):** Oman `/oman/` · Pakistan `/pakistan/` · Qatar `/qatar/`
⚠️ Jordan URL must never change — already indexed.

---

## Google AI Search Guide — Key Points for The Nest

From Google's official AI Optimization Guide (June 2026):

1. **Page speed is an eligibility gate** — pages must provide "good page experience" to appear in AI Overviews. Pickl's 40/100 mobile score is actively blocking AI Overview eligibility.
2. **GBP is explicitly called out** for local businesses — our #1 missing integration.
3. **Non-commodity content wins** — unique, first-hand, brand-specific content. Our voice system enforces this. Brand voice examples (real writing) make it even stronger.
4. **RAG means ranking still matters** — AI Overviews are grounded in search rankings. SEO fundamentals still apply.
5. **Things to ignore** — llms.txt files, content chunking, rewriting for AI, inauthentic mentions.
6. **Agentic experiences** — emerging. Semantic HTML and accessibility help browser agents use your site.

---

## Session: June 2026 — v7.3.7 — Approval queue redesign + audit/citation fixes

### Approval Queue — filter UI redesign
Replaced 3 stacked rows of ~20 pills with a compact bar: a **Pending ↔ Published toggle**, 3 brand pills, and **Type / Market dropdowns** + a **keyword/title search box**. All filters (type, brand, market, search) now apply to BOTH the Pending and Published & Tracking views.
- New market dropdown option **"🌍 All International"** (`__intl__`) → every non-UAE market for the selected brand in one view.
- `state.queueView` ('pending'|'published') added; `state.activeQFilter` is now purely the type filter (no longer overloaded with 'published'); `publishedTypeFilter` removed; `state.queueSearch` added.
- New: `renderQueueOrPublished`, `switchQueueView`, `filterTypeSelect`, `filterMarketSelect`, `onQueueSearch`, and shared predicates `queueMarketMatch`/`queueSearchMatch`/`getVisibleQueueItems` (used by render + Dismiss Visible so they always agree). `filterQueue`/pill-based `filterMarket` removed. Old `nestQFilter='published'` localStorage auto-migrates to the toggle.
- `filterDashboardByMarket` now drives the market dropdown; sort dropdown re-renders the active view.

### Bug fixes
- **Citations blank (+ backlinks + ai-overview):** the manual-refresh trigger fired the background function with a non-awaited `fetch()` then returned — in serverless the request is frozen before it sends, so the background job never ran and nothing was written. Now `await`ed (resolves on the fast 202). This is why citations were always blank.
- **KSA "0 ideas" diagnostic:** `getKeywordIdeas` swallowed DataForSEO's real response, so the UI guessed "check balance/location". Now returns `{ ideas, diag }` and stores `ideasDiag` (real status_code/message or "OK but 0 ideas for loc X from N seeds"), surfaced in the Keyword Opportunities empty state. KSA config itself is correct (location_code 2682, real Riyadh seeds) — likely cause is English seeds in an Arabic-dominant market under the volume>10 filter; the UI now shows the true reason.
- **Competitor matrix dim "plum" text (dark mode):** `.cm-table td` etc. used `var(--text-primary,#1e293b)` but the app has no `--text-primary` → near-black fallback. Changed to `var(--text-main)`; themed the white keyword-input bg. Cache-bust bumped to `?v=7.3.7`.
- **"+ Add Keyword" clarity:** added an in-modal note explaining it tracks rank (GSC) + adds to the competitor matrix, and does NOT queue content (that's the Seed Keywords list).

### Revert notes
- Queue redesign: restore the 3 `pill-nav` blocks (queue-pills/brand-pills/market-pills) + `filterQueue`/`filterMarket`, revert `renderQueue`/`loadPublishedTracking`/`loadQueue`/`dismissVisible` to the pre-helper versions, restore `state.activeQFilter='published'` semantics + `publishedTypeFilter`.
- Citations/backlinks/ai-overview: drop the `await` on the bg trigger (not recommended — that's the fix).
- KSA diag: revert `getKeywordIdeas` to return a bare array; remove `ideasDiag` from result + UI.
- Competitor colors: revert `var(--text-main)` → `var(--text-primary,#1e293b)`.

### Still open (next)
- Unified **Run Audit control** on the Approvals Queue (brand + market scope; UAE→scheduler-background, intl→international-seo-background; fix intl trigger's broken synchronous summary).
- **Markets tab** rework into a per-market intelligence dashboard (it's the only international hub — keep + sharpen, don't remove).
- **Authentication hardening** (unauthenticated db-save/approvals/calendar/wordpress + forgeable actor) — deferred to its own session.

---

## Session: June 2026 — v7.3.6 — Bug-fix sweep + international page creation + Bonbird brand merge

Full review of the codebase (5 parallel passes) → fixed every confirmed functionality bug. Authentication hardening deliberately deferred to a following session. All files `node --check` clean; key data-flows verified by execution.

### Crash / broken-feature fixes
- **keyword-discovery-background.js** — TDZ crash: `marketLabel` was used in `brandGenericSeeds` before its `const` declaration → `ReferenceError` on every run (engine produced nothing). Moved `marketLabel`/`locationCode` declarations above first use.
- **keyword-discovery-background.js** — Bonbird read `gscCache:https://bonbirdchicken.com/` but the canonical key is `gscCache:sc-domain:bonbirdchicken.com` → cache always missed, `ourPosition` always null. Fixed key.
- **slack-notify.js** — `buildCalendarReviewNeeded` referenced undefined `data.slideCount` → every image/carousel "review needed" Slack notification threw. Added `slideCount` to the destructure.
- **perch.js** — `store` was not in the `_lib/store` import list but `store().delete(...)` was called → task DELETE always 500'd. Added `store` to import.
- **calendar-media.js** — `gcsGetToken` typo (function is `getGCSToken`) → signed-URL upload path always 500'd. Fixed name.
- **scheduler-background.js `runQuickWins`** — operated on `fetchGscDirect` rows which have no `.page`, yet used `r.page` for the WP existence check, `page_update` target URL, and location tag → `url:undefined` items + v7.3.5 missing-page routing dead. Now fetches `fetchGscWithPages` (like `runMetaRewrites`). (`runPageCreation` left as-is — its UAE-only location tag is correct via the `getLocationTag(undefined)`→UAE fallback.)

### Timeout / recovery fixes
- **backlinks.js + backlinks-background.js** — manual "Refresh Now" ran ~5 min of DataForSEO polling synchronously → 502. Now fires `backlinks-background?brand=` and returns 202; background accepts `?brand=`; frontend `refreshBacklinks` polls GET until `fetchedAt` changes.
- **citations.js + citations-background.js** — same fix for "Check All"; background accepts `?brand=`; frontend `checkAllCitations` polls on per-platform `checkedAt`.
- **ga4-data.js** — on a revoked/expired refresh token it returned the stale access token + `connected:true`, so the UI was stuck "connected" while every report 401'd. `refreshTokenIfNeeded` now throws `GA4_TOKEN_EXPIRED`, `runReport` flags 401/UNAUTHENTICATED, and the handler clears `ga4Tokens` + returns `notConnected:true` (reuses the existing "Connect GA4" button).

### International SEO — page creation feature + fixes
- **international-seo-background.js** — `runMarketKeywordOpportunities` content-gap branch is now intent-aware: a gap with no dedicated page → **`page_creation`** (full landing page, ported from the UAE `runPageCreation`, with the same voice gate) when the keyword has location/service intent, else `blog_draft` as before. New `hasLocationIntent()` helper; `pageCreations` count in the return. Uses the existing `create_page` push path (brand-resolved WP creds).
- **Voice gate was a silent no-op across 3 intl functions** — the local `callClaude(systemPrompt, userPrompt)` was passed straight into `_lib/brand.js` voice helpers (which call `cb(prompt, opts)` + read `.text`), so checks threw and fell back to a neutral score. Added module-level `voiceClaudeAdapter()` and applied it in `runMarketDataDrivenSEO`, `runMarketKeywordOpportunities`, and `generateBlogDraft`.
- Added `keywordMatchesMarket` filter to intl quick-wins + content-gaps (was only on `runMarketDataDrivenSEO`) → no more wrong-market keywords.
- `generateMetaUpdate` / `generateOnPageSuggestion` used `market.siteUrl` (undefined → literal "URL: undefined" in the prompt). Now use `buildPostUrl(market, 'meta_update', '', language)`.

### Other confirmed bugs
- **scheduler.js** — dry-run meta-rewrites preview used a 0–100 CTR scale (`30/pos`, threshold `1.5`) while the real run uses decimals (`0.30/pos`, `0.015`) → meaningless preview count. Aligned.
- **scheduler-background.js** — all 5 `fixBrandVoice` calls stopped at `brandExamples`, never passing rejection feedback. Now append `await getBrandFeedback(brand)`.
- **scheduler-background.js `runContentGapsWithOpportunities`** — wrote a **raw array** to `seedKeywords:<brand>`, but `seed-keywords.js` reads `stored.keywords` → injection lost AND the user's curated seed list clobbered to defaults. Now writes `{ brand, keywords, updatedAt }`.
- **competitor-matrix-background.js** — `fetchCompetitorRankedKeywords` ignored its `locationCode` param and hardcoded UAE `2784` → intl matrix runs pulled UAE data. Added `labsLoc` remap (21191→2784, intl codes pass through).
- **llm-mentions-background.js** — Perplexity model IDs (`llama-3.1-sonar-*`, `*-online`) deprecated → always "all models failed" (0% mentions). Updated to `sonar`/`sonar-pro`.

### Bonbird brand context merge + Settings fix (root cause of "butter chicken" suggestions)
- **`saveBrandCtx()` (index.html)** wrote `menu: {}`, and **`getBrandContext()`** returned the Settings override *wholesale* → every Settings save wiped the menu → Claude generated off-menu dishes (butter chicken) and `keywordMatchesMenu` lost its reference list.
  - `getBrandContext` now **merges the Settings override on top of the brand default** and backfills `menu` if the save left it empty/missing. Voice fields override; the canonical menu is never lost. Benefits scheduler, international, and keyword-discovery pipelines.
  - `saveBrandCtx` no longer sends an empty `menu`.
- Merged the full official Bonbird menu (bone-in, tenders, sandwiches, wraps, rice bowls, sides, shakes, sauces — **names only, no pricing**) into `BONBIRD_DEFAULT.menu`; `buildBrandPrompt` now surfaces Bone-In/Tenders/Shakes.
- Deleted the orphan `_lib/bonbird-brand.js` (was never imported; its header said "drop into brand.js" — that merge is now done). Its competitor list + seed keywords belong in `competitorConfig:bonbird` / the seed list, not the prompt context.

### Revert notes
- Crash fixes: each is a localised one/two-line change — restore the prior identifier/key/import. `runQuickWins`: revert the `fetchGscWithPages` block back to using the passed-in `rows`.
- Backlinks/citations async: restore the synchronous `refreshBrand`/`checkBrand` calls in the POST handlers; revert the background handlers to no-`event`; restore the non-polling frontend functions.
- GA4: restore `return tokens.access_token` in `refreshTokenIfNeeded`, the plain `throw` in `runReport`, and `{ error, connected:true }` in the catch.
- Intl page creation: remove the `hasLocationIntent` branch (revert to single `else` blog_draft), remove `voiceClaudeAdapter` (revert to bare `callClaude`), remove the `keywordMatchesMarket` filters, restore `market.siteUrl`.
- Bonbird merge: revert `getBrandContext` to `if (stored) return stored`, restore the old `BONBIRD_DEFAULT.menu`, restore `menu:{}` in `saveBrandCtx`, restore `_lib/bonbird-brand.js` from git history.

---

## Session: June 2026 — v7.3.5 — Quick wins routes missing pages to page_creation

### Changes in this session

#### Fix: runQuickWins routes missing pages to page_creation instead of skipping ✅

Previously: if `wpPageCheck` returned `hasContent: false`, `runQuickWins` logged and `continue`d — killing the ranking opportunity entirely.

Now mirrors `runMetaRewrites` pattern exactly:
- Pre-pass splits candidates into `validCandidates` (WP page exists) and `pageCreationNeeded` (missing/empty)
- Missing pages get a Claude-generated `page_creation` approval — same voice check + `fixBrandVoice` loop
- Existing pages proceed as before with `page_update` approval
- Return now includes `pageCreationsQueued` count alongside `queued`
- Prompt for page_creation highlights the position signal: "Google ranks pos X for this keyword — building the page captures this traffic"

`runQuickWins` no longer kills any ranking opportunity; missing pages become new page creation items.

### Revert notes
- Revert pre-pass split back to single loop with `continue` on `!hasContent`
- Remove `pageCreationNeeded` array and associated loop

---

## Session: June 2026 — v7.3.4 — Page update URL fixes + existence check

### Changes in this session

#### Fix: runQuickWins now validates page exists before generating content ✅

`runQuickWins` had no WordPress existence check before calling Claude. Deleted/empty pages would still generate full page_update items (wasting API tokens and cluttering the queue). Now calls `wpPageCheck(brand, r.page)` at the top of the loop — skips candidate if page not found or has <100 words.

#### Fix: page_update approval stores GSC URL not Claude's path guess ✅

Previously: `payload.url = parsed.url` — Claude was asked for `"page URL path e.g. /menu"` and returned a path like `/locations/mirdif`. The GSC row already has the full canonical URL (`r.page`). Changed to `url: r.page` — always the full `https://...` URL from GSC. Also updated `locationTag` to use `r.page` directly.

#### Fix: PAGE column is now a clickable link (brand-aware) ✅

Stats grid PAGE cell was plain text. Now an `<a>` tag opening the page in a new tab. Domain resolved brand-aware: `https://eatpickl.com` for Pickl, `https://bonbirdchicken.com` for Bonbird. Handles both full URLs (already `http`) and path-only values from older items.

#### Fix: "Target Page" in page_update detail view is now a clickable link ✅

Same brand-aware domain logic applied to the Target Page line in `buildDetailHTML`.

### Revert notes
- Revert `wpPageCheck` call in `runQuickWins` loop to remove existence check
- Revert `url: r.page` → `url: parsed.url` in createApproval call
- Revert PAGE column back to plain `<div>` text display

---

## Session: June 2026 — v7.3.3 — GSC URL mismatch detection in meta rewrites

### Changes in this session

#### Root cause identified: WordPress ghost-200s on unofficial URL paths

WordPress responds with a 200 to any URL whose last path segment matches a published page slug, regardless of the parent path. So `/dubai/pickl-city-walk/` returns 200 (hitting the real `pickl-city-walk` page) but renders empty content because no WordPress page with that slug exists under a "dubai" parent. Google indexed this ghost URL at some point (old internal link, old sitemap entry, or previous site structure) and it now appears in GSC with impressions.

Old `wpPageHasContent` extracted only the last slug and queried WordPress — it found the *real* page's content and incorrectly validated the ghost URL. The approval was queued against the GSC URL instead of the canonical.

#### Fix: `wpPageCheck` replaces `wpPageHasContent` in meta rewrites ✅

**`netlify/functions/scheduler-background.js`**
- New `wpPageCheck(brand, pageUrl)` returns `{ hasContent, canonicalUrl }` — fetches `id,link,content,status` from WP so we get the canonical `link` field alongside the content check
- Old `wpPageHasContent` kept as a shim (calls `wpPageCheck`, returns just the bool) — used by `runQuickWins` / `runPageCreation` which don't need the URL
- Validation loop in `runMetaRewrites` now uses `wpPageCheck`:
  - Compares WP canonical path vs GSC URL path
  - On mismatch: logs it, stores `wpCanonical` and `gscUrlMismatch` on the candidate
  - Still queues the opportunity — doesn't skip it
- Approval creation uses `matched.wpCanonical` as `finalUrl` (push target) instead of raw GSC URL
- `payload.gscUrl` added — set to the original GSC URL only when it differs from canonical, null otherwise

**`index.html` — approval card**
- When `payload.gscUrl` is set (mismatch exists), renders an amber warning block above the meta comparison:
  > ⚠️ GSC URL mismatch: Google has indexed `/dubai/pickl-city-walk/` but the canonical WordPress page is `/pickl-city-walk/`. Approving will update the meta on the canonical page. Consider adding a redirect or canonical tag to fix the GSC URL separately.

### Revert notes
- To revert: restore `wpPageHasContent` call in validation loop, remove `wpCanonical`/`gscUrlMismatch` fields, remove `gscUrl` from payload, remove mismatch warning from card

---

## Session: June 2026 — v7.3.2 — Dark mode panel fix + sidebar user block

### Changes in this session

#### Dark mode: task panel fully themed ✅

`buildPanelHTML` and `openAddTaskModal` had pervasive hardcoded light-mode colours. All replaced with CSS vars:
- Panel sticky header: `#f8fafc` → `var(--bg-subtle)`, `#e2e8f0` border → `var(--border)`
- Panel section labels: `#64748b` → `var(--text-muted)` (Labels, Details, Description, Activity)
- Panel title: `#1e293b` → `var(--text)`, close button `#64748b` → `var(--text-muted)`
- Label buttons inactive state: `#f1f5f9` bg / `#e2e8f0` border / `#475569` text → CSS vars
- Delete section divider: `#f1f5f9` → `var(--border)`
- New Task modal: `#fff` bg → `var(--bg-surface)`, all inputs/selects → `var(--bg-subtle)` + `var(--border)` + `var(--text)`, labels → `var(--text-muted)`
- Quick-add textarea + Add button: `#fff` / `#6366f1` → `var(--bg-surface)` / `var(--primary)`
- Task card assignee avatar: `#6366f1` → `var(--primary)`
- Comment cancel button: `#64748b` → `var(--text-muted)`

#### Sidebar user block — user/sign-out moved to bottom left ✅

Matching the IT intranet tool reference design:
- **`top-header` hidden** (`display: none`) — 56px freed, view content moves flush to top
- **`#perch-side-panel` top offset** changed from `52px` → `0` (full-height panel now)
- **New `.sidebar-user` block** added to `sidebar-footer` (above theme toggle):
  - Avatar (initial or Google picture), display name, role · department line
  - Sign-out icon button (`ti-logout`) on the right — minimal, not a full button
- **JS init** updated: populates `#sidebar-user-avatar`, `#sidebar-user-name`, `#sidebar-user-role` at login instead of the (now-hidden) top-header elements
- **CSS** added: `.sidebar-user`, `.sidebar-user .avatar`, `.sidebar-user-info .name/.role`, `.sidebar-signout`

### Revert notes
- To revert: restore `.top-header { height: 56px; ... }`, restore `#perch-side-panel top: 52px`, remove `.sidebar-user` block from footer HTML and JS init

---

## Session: June 2026 — v7.3.1 — Perch morning snapshot + AI performance narrative

### Changes in this session

#### Perch hero: personalised morning snapshot ✅

**index.html**
- `<h1>The Perch</h1>` → `<h1 id="perch-greeting">` — updated by `updatePerchHeroSnapshot()` at load time
- `updatePerchHeroSnapshot()` — new function called after `perchTasks` loads:
  - Greeting: time-aware salutation (Good morning / afternoon / evening) + first name from `state.actor` or `state.userEmail`
  - 3 stat chips in `.view-hero-actions`: **My tasks** (any task the user is assignee/creator/collaborator on), **Overdue** (active tasks with dueDate < today), **Due this week** (active tasks due in next 7 days)
  - Stats computed client-side from `perchTasks` — zero extra API calls

#### Perch design: hardcoded colours replaced with CSS vars ✅

Replaced all hardcoded colour islands in the task panel (built from `buildTaskCard` HTML):
- Assignee avatar: `#6366f1` → `var(--primary)`
- Comment post button: `#6366f1` → `var(--primary)`
- Textarea/input border + background: `#e2e8f0` / `#f8fafc` / `#1e293b` → CSS vars
- Comment avatars (other authors): `#e2e8f0` / `#475569` → `var(--bg-hover)` / `var(--text-muted)`
- Comment author + text: hardcoded slate → `var(--text)` / `var(--text-muted)` / `var(--text-secondary)`

#### Reports: AI-generated Monday performance narrative ✅

**scheduler-background.js**
- New `generatePerformanceSummary(brand, gscRows, jobResults, brandCtx)` function:
  - Loads last week's GSC snapshot (`gscSnapshot:<brand>:<YYYY-MM-DD>`) for position delta comparison
  - Finds keyword wins (moved up ≥2 positions) and drops (moved down ≥2 positions), top 5 each
  - Calls Claude with structured prompt: overall direction, position movers, content queued, one key focus
  - Stores result as `performanceSummary:<brand>` → `{ narrative, generatedAt }` in Blobs
- Called after all brand jobs complete (non-blocking — failure doesn't stop the run)

**db-get.js**
- Added `performanceSummary:pickl` + `performanceSummary:bonbird` to the parallel Blobs fetch
- Exposed as `performanceSummary_pickl` + `performanceSummary_bonbird` in the response

**index.html `loadReports()`**
- Fetches `performanceSummary_<brand>` from `/api/db/get` and passes to `renderReports()`
- `renderReports()` signature extended: `(brand, rows, techData, queue, matrixData, perfSummary)`
- Performance Summary card: shows AI narrative (split by `\n\n` into `<p>` tags) with "AI-generated · Xd ago" meta label when available; falls back to condensed static summary (2 bullets: what's running + current performance) when no narrative exists yet
- `#report-summary-meta` element added to card header for timestamp

#### Double heading fix ✅
- `#top-title` div in the `.top-header` bar hidden with `display:none` — heading only shows in `view-hero h1` for each view. The JS `textContent` assignment still runs harmlessly.

### New Blobs keys
- `performanceSummary:<brand>` — `{ narrative: string, generatedAt: timestamp }` — written by scheduler weekly, read by Reports tab

### Revert notes
- To revert Perch snapshot: remove `id="perch-greeting"` and `updatePerchHeroSnapshot()` call + function
- To revert performance narrative: remove `generatePerformanceSummary` call + function from scheduler; remove `performanceSummary_*` from db-get; revert `renderReports` signature and restore static talkingPoints

---

## Session: June 2026 — v7.3.0 — Brand voice fix + International keyword discovery

### Changes in this session

#### Fix: Brand voice examples injected into auto-fix ✅

**Root cause:** `fixBrandVoice` in `_lib/brand.js` was using `brandCtx.examples?.slice(0, 800)` — this path is always `undefined` because brand examples are stored separately in Blobs (`brandExamples:<brand>`), not inside `brandCtx`. Every auto-fix attempt was running without the real brand writing examples, making it much weaker than intended.

**Fix:**
- `_lib/brand.js` — `fixBrandVoice` signature extended: `(content, voiceCheck, brandCtx, callClaudeFn, brandExamples = null, feedbackNotes = [])`. Now injects real writing examples (up to 1500 chars) and accumulated rejection feedback into the fix prompt.
- `scheduler-background.js` — `runQuickWins`, `runMetaRewrites`, `runContentGaps`, `runContentGapsWithOpportunities`, `runPageCreation` all receive `brandExamples` as a new 7th parameter. All 4 `fixBrandVoice` calls updated to pass it.
- `international-seo-background.js` — `generateBlogDraft` already had `brandExamples` in scope; now passes it to `fixBrandVoice`.

**Effect:** When auto-fixing 5-7 scoring content, Claude now has the real brand writing examples from Settings as a reference. Quality of auto-fixed content should increase significantly.

#### Fix: International keyword discovery using correct location codes ✅

**Root cause:** `getKeywordIdeas` in `keyword-discovery-background.js` hardcoded `kwLocationCode = 2784` (UAE country) regardless of which market was being processed. Bahrain, KSA, Qatar, Egypt, Jordan, Oman, Pakistan all received UAE keyword volume data instead of their own market's data.

**Fix:**
- `keyword-discovery-background.js` — `const kwLocationCode = locationCode === 21191 ? 2784 : locationCode;` — UAE city code maps to UAE country code for Labs; all international market codes (already country-level in INTERNATIONAL_MARKETS) pass through unchanged.
- Brand-specific generic seeds: international markets now get brand-appropriate fallback seeds (`best burger in Bahrain` for Pickl, `best fried chicken in Bahrain` for Bonbird) instead of mixed Pickl/Bonbird seeds.

**Markets now getting their own keyword data:**
- Pickl: Bahrain (17000), KSA (2682), Qatar (179), Egypt (2818), Jordan (2144), Oman (2114)
- Bonbird: Oman (2114), Pakistan (2586), Qatar (179)

**UI + API:** Already fully built (market selector dropdown, `?market=` param, market-keyed Blob storage). The Monday cron already loops all 9 markets. Only the location code was wrong.

### Revert notes
- To revert voice fix: restore `fixBrandVoice(content, voiceCheck, brandCtx, callClaudeFn)` signature in brand.js, remove `brandExamples` from all callers
- To revert intl keyword fix: restore `const kwLocationCode = 2784` in keyword-discovery-background.js

---

## Session: June 2026 — v7.2.2 — View hero banners matching IT intranet tool

### Changes in this session

**index.html**
- Added `.view-hero` CSS class (matches IT tool's `.dept-hero`) — gradient banner, icon in rounded square, white title + muted subtitle, optional right-side actions
- Added `.view-hero-icon` and `.view-hero-actions` helper classes
- Replaced plain text headers in all 9 views with gradient hero banners:
  - The Perch: dark teal `#0D1F1C → #0F4A40`, `ti-home-2` icon, "+ New Task" button in hero-actions
  - Content Calendar: `#0D1F1C → #0a2e1f`, `ti-calendar-event`, all 4 action buttons in hero-actions
  - Approvals Queue: `#0D1F1C → #1a2a3a`, `ti-checkbox`
  - Analytics & Reports: `#0D1F1C → #0F2E29`, `ti-chart-bar`, "+ Add Keyword" button
  - Technical SEO: `#1a1a2a → #312e81` (indigo), `ti-code`
  - Local SEO: `#2a1a0a → #78350f` (amber), `ti-map-pin`, brand pills in hero-actions
  - AI Content Studio: `#2d1a3a → #4c1d95` (purple), `ti-wand`
  - Settings & Logs: `#1a2a3a → #1e3a5f` (navy), `ti-settings-2`
  - How It Works: `#0D1F1C → #14532d` (green), `ti-book`

- Sidebar inactive text: `rgba(255,255,255,0.55)` → `rgba(255,255,255,0.65)` (matches IT tool exactly)
- Active nav item: removed `border-left` indicator, `font-weight: 600` → `500` (matches IT tool)

### Revert notes
- To revert hero banners: remove `.view-hero`/`.view-hero-icon`/`.view-hero-actions` CSS, restore original plain-text title divs in each view
- To revert sidebar: `--sidebar-text` back to `rgba(255,255,255,0.55)`, restore `border-left: 2px solid transparent` on `.nav-item`, `font-weight: 600` on `.nav-item.active`

---

## Session: June 2026 — v7.2.1 — Typography alignment with IT intranet tool

### Changes in this session

**index.html**
- Removed `html { font-size: 14px }` — non-standard, IT tool uses browser default (16px)
- `.page-title`: `15px` → `20px` (matches IT tool's page/section headings)
- `.admin-tab`: `13px` → `13.5px`, padding `16px` → `18px` (matches IT tool tabs exactly)
- `.metric-title`: `11px` → `11.5px`
- `.metric-sub` / `.metric-trend`: `12px` → `11.5px`
- `.toggle-label p`: `12px` → `11.5px`
- `.log-detail`: `11px` → `11.5px`
- `.form-label` color: `--text-secondary` → `--text-muted` (lighter, matches IT tool label style)
- Colors were already identical (`--text-main: #111`, `--text-muted: #5a7a75`)

### Revert notes
- To revert: restore `html { font-size: 14px }`, set `.page-title` back to `15px`, `.admin-tab` back to `13px / 16px padding`, metric/toggle/log sizes back to `11px`/`12px`

---

## Session: June 2026 — v7.2.0 — Approval queue UX + Arabic native review + International keyword opportunities

### Changes in this session

**approvals.js**
- Added `appendBrandFeedback(brand, feedback)` helper — accumulates rejection notes in `brandFeedback:<brand>` Blobs key (capped at 20), called on every `handleReject`
- Added `mark_native_reviewed` action — patches `payload.nativeReview` from `'pending'` to `'reviewed'`, enables approve/publish on Arabic items

**scheduler-background.js**
- `runMetaRewrites()`: injects `brandFeedback:<brand>` notes into Claude prompt as "HUMAN FEEDBACK — NEVER do any of the following"
- `runMetaRewrites()`: runs brand voice check on every generated meta and stores `voiceScore`/`voiceIssues` in approval payload

**international-seo-background.js**
- Added `getBrandExamples` import — all 4 generation functions now receive voice examples from Settings and pass them to `buildBrandPrompt(brandCtx, brandExamples)`
- Added `getBrandFeedback()` helper — same pattern as scheduler, injected into relevant prompts
- `runMarketDataDrivenSEO`: injects brand feedback + voice score on meta_update items
- `queueApprovalItem`: adds `nativeReview: 'pending'` to Arabic (`language === 'ar'`) content payloads
- Added `runMarketKeywordOpportunities(market, brandCtx, brandExamples, force)`:
  - pos 11-20 + ≥30 impressions → `page_update` (max 2 per market, Claude generates 3-5 specific on-page fixes)
  - pos 21-35 + ≥20 impressions → checks `isDedicatedPage(r.page)` first:
    - Dedicated page already exists (`/bahrain/some-post/`) → `page_update` to improve it (no cannibalization)
    - Only market root ranking (`/bahrain/`) → `blog_draft` (no dedicated page exists yet)
  - Called from `processMarketLanguage` for English only, after `runMarketDataDrivenSEO`

**index.html**
- Added styled confirmation modal (`#confirm-modal`) + `nestConfirm(heading, sub, onOk)` — replaces native `confirm()` in `dismissVisible()`
- Filter persistence: `filterQueue()`, `filterBrand()`, `filterMarket()` write to `localStorage`; `loadQueue()` restores all 3 on every open + re-activates correct pills
- Arabic native review UI: `buildActionCard()` shows "⏳ Pending native review" orange badge; approve/publish buttons replaced with "✓ Mark Reviewed" button; `markNativeReviewed(id, btn)` calls `mark_native_reviewed` action

### Revert notes
- To revert brand feedback: remove `appendBrandFeedback` call from `handleReject` in approvals.js, remove `getBrandFeedback` + injection block in scheduler/intl functions
- To revert filter persistence: remove `localStorage.setItem` calls from filter functions, remove the restore block at top of `loadQueue()`
- To revert native review gate: remove `nativeReview` from `queueApprovalItem` payload, remove `mark_native_reviewed` case from approvals.js switch, revert `buildActionCard` card-actions HTML
- To revert keyword opportunities: remove `runMarketKeywordOpportunities` function + its call in `processMarketLanguage`

---

## Done (Full History)

- Full SEO content pipeline (quick wins, meta rewrites, content gaps, page creation)
- Brand voice system (1-10 scoring, banned words, auto-reject below 5)
- Brand voice examples — paste real brand writing in Settings, injected into every prompt
- Keyword tier system (Quick Win / Short Term / Long Term / Priority Gap)
- International SEO pipeline (9 markets, EN + AR)
- Competitor matrix (DataForSEO Standard mode) + CPC capture from SERP results
- Google SSO auth + 3 roles (Viewer / Manager / Admin)
- WordPress REST API integration (drafts, pages, meta, publish)
- Seed keywords + How It Works panel
- The Nest rebrand
- The Perch kanban (drag-drop, side panel, labels, quick-add, filters)
- Perch labels: Urgent · Blocked · Awaiting Feedback · Scheduled · In Review · Campaign · Assets Needed · Done
- Perch Slack notifications: task assigned, task done, daily due date digest
- Perch labels bug fix: labels were not being saved (not in EDITABLE list — fixed)
- 5 brands (Pickl, Bonbird, Southpour, Shadowburg, Shadowbird)
- Brand + department in user management
- Technical SEO v2 (WP-sourced priority pages, international health checks, PSI escalation, developer kanban)
- Empty pages fork (impressions ≥100 → page_creation)
- CEO Reports tab — now fully live:
  - Traffic value in AED, non-branded only, real DataForSEO CPC (falls back to AED 5/click)
  - Position distribution, top keywords, content pipeline, opportunities, AI readiness
  - "Performance Summary" section (renamed from "CEO Talking Points")
  - Data source labels on every chart/section
- Weekly GSC snapshots (every Monday)
- Priority pages fixed (Menu, Locations, Franchise, About always audited)
- CPC enrichment — DataForSEO Keywords Data API runs Monday, stores `cpc_usd`/`cpc_aed` in gscCache
- Slack rebuilt — Block Kit messages, per-item detail grouped by brand/type with voice scores
- Slack interactive buttons — approve/dismiss SEO items from Slack (`slack-callback.js`, needs Slack App interactivity URL set to `https://yolkseo.netlify.app/api/slack-callback`)
- Daily Perch due date digest (`perch-notify-background.js`, 5am UTC = 9am Dubai)
- SETUP.md as session handoff document
- Developer role (Technical SEO only — all other tabs hidden, lands on tech SEO automatically)
- Add User modal: proper form with email + role + brand + department at invite time
- Last Login column in Users table (relative time)
- Performance Summary updated to reflect actual build state
- GBP data fix: Account Management API used for listing locations (was using wrong API)
- Removed duplicate updateUserRole function
- Approval cards: context bar showing keyword, current position, goal, impressions, page URL
- Published & Tracking tab in Approvals Queue — tracks position movement after publish (updated every Monday)
- trackPublishedItems() in scheduler — updates positionLatest/positionDelta/lastTrackedAt for all published items
- Opportunities cards in Reports now clickable — drill-down table of keywords per category
- Top 10 Keywords card shows branded vs non-branded split
- Performance Summary includes branded/non-branded breakdown
- Multi-brand checkboxes: users can be assigned to any combination of brands
- brands[] array stored in userProfile, backward compat with old single brand string
- Bonbird menu URL fixed: /uae-menu/ (was /menu/)
- Taco Bird game page + test menu pages added to Technical SEO skip list
- Claude model upgraded: claude-sonnet-4-20250514 → claude-sonnet-4-6
- 📍 Local SEO tab — GBP location health cards, review queue (pending approval state), local SEO flags, GBP connect OAuth flow
- Hreflang generator — button in International SEO tab, queues all 9 markets as approvals with ready-to-use HTML code
- GBP OAuth flow (auth-login.js ?type=gbp, callback stores gbpTokens, redirects to /?gbp_connected=1)
- gbp-data.js — fetches location health from Account Management + Business Information APIs
- gbp-reviews.js — stub ready to activate when Google API approval lands
- Reports AI Readiness Score — GBP check goes ✅ when gbpTokens connected

---

*Last updated: June 2026 — Approval context bars. Published & Tracking tab. Opportunity drill-downs. Branded/non-branded split. Multi-brand checkboxes. Bonbird menu URL fixed. Taco Bird excluded from audits. Claude model → sonnet-4-6. Developer role. Add User modal. Last Login. GBP data fix. Local SEO, hreflang, CPC enrichment, Slack Block Kit, brand voice examples — all done.*

## Approval Card Context & Tracking

### Context Bar (on every pending card)
Every approval card now shows a context strip before the content:
- **Keyword** — the exact search query being targeted
- **Position Now** — current ranking (orange if 11-20, green if top 10, purple if deeper)
- **Goal** — what tier we're targeting (Top 10, Top 20, etc.)
- **Impressions 90d** — how many times Google showed this keyword
- **Page** — the URL being updated/created

### Published & Tracking Tab
In the Approvals Queue, "📈 Published & Tracking" pill shows all pushed/published items with:
- Keyword targeted + page URL
- Position at time of publish (stored on approve/publish)
- Position now (updated every Monday by scheduler)
- Movement delta: ↑5 positions / → No movement / ↓2 positions
- Tracking runs for 8 weeks after publish date

### How Tracking Works
1. Item approved/published → `trackingKeyword`, `positionAtPublish`, `publishedAt` stored on item
2. Every Monday scheduler calls `trackPublishedItems(brand, gscRows)`
3. For each published item within 8 weeks, looks up current GSC position for `trackingKeyword`
4. Updates item with `positionLatest`, `positionDelta`, `lastTrackedAt`
5. Published & Tracking tab reads this directly — no separate API needed

### Reports — Branded vs Non-Branded Split (added June 2026)
Top 10 Keywords card now shows: `X non-branded · Y branded · Z in top 3`
Performance Summary text includes the split.
Logic: BRAND_TERMS filter (`pickl`/`bonbird`) applied to top10 count — same filter used for traffic value.
Non-branded top 10 count is the real SEO growth metric — branded rankings are natural, non-branded is earned.

### Context Bar — Full Field Map (all item types)
- **page_update**: keyword, position, goal, impressions, page URL — all stored ✅
- **meta_update**: keyword, ranking, CTR gap, impressions, page URL — all stored ✅
- **blog_draft (GSC keyword)**: keyword, position, goal, impressions — stored ✅
- **blog_draft (seed keyword)**: keyword, "New keyword — not yet in GSC" label — correct, no GSC data exists
- **page_creation**: keyword, position, impressions — fixed (was missing currentPos/impressions)
- All main scheduler items now tagged `locationTag: '🇦🇪 UAE'` — was untagged before

### Clearing the Queue
"Dismiss Visible" button in Approvals Queue header — with all filters set to "All", dismisses every pending item. Items regenerate fresh on the next Monday scheduler run.
To trigger a manual run: Netlify dashboard → Functions → scheduler-background → Trigger function.

### Bug Fix — Reports Tab Empty (June 2026)
`state.reportOpportunities = { ..., avgMobile, ... }` was referencing `avgMobile` before it was declared with `const` later in the same function. JavaScript `const` does not hoist — threw a silent ReferenceError that killed `loadReports()` entirely, leaving all cards empty.
Fix: split into two assignments — set reportOpportunities without avgMobile early, then patch it in after avgMobile is calculated.

### Competitor Matrix — Full Rebuild (June 2026)

**Bug fixed:** `getCompetitorNames()` was merging all brand competitors regardless of brand filter. Bonbird competitors (Raising Cane's, Jailbird etc.) were showing as columns when viewing Pickl. Fixed: only shows competitors for the active brand filter.

**Keywords rebuilt:** DEFAULT_KEYWORDS replaced entirely.
- Removed: ~20 "near me" variants (DataForSEO SERP API can't resolve hyper-local queries), ~20 franchise keywords (wrong tool for this), product-specific menu items
- Added: competitive category keywords where multiple brands compete — "best burger in dubai", "smash burger dubai", "burgers jbr dubai", etc.
- These are the keywords where Salt/High Joint/Raising Cane's will actually appear in results

**Gap Analysis view added:** New "🎯 Gaps" tab in the competitor matrix.
- Shows keywords where any competitor ranks top 20 but we don't appear
- Grouped by competitor: "Salt is ranking for X keywords you don't"
- Sorted by competitor rank ascending (their strongest = our biggest gap = hardest to beat but highest priority)
- Opportunity level: 🔴 High (comp ranks 1-5) / 🟡 Medium (6-10) / ⚪ Low (11-20)

**Competitor Gaps in Reports tab:**
- New section between Opportunities and Performance Summary
- Shows top 5 gaps with competitor name, their ranking, your ranking
- "View full analysis →" links to Gaps tab in Analytics

**Note:** Keyword changes only take effect after next DataForSEO run (Monday or manual refresh in competitor matrix).

---

## Competitor Matrix — Planned Rebuild (Next Priority)

Current version is functional but not best-in-class. Full rebuild planned across two sessions.

### What's wrong with current version
- We track a fixed keyword list WE chose. Real competitor intelligence runs the other way — start from the competitor's domain, find what THEY rank for, then find gaps.
- No Share of Voice — "who ranks where" without context of who's winning overall
- Unknown competitors (e.g. Hammer Burgers) never surface because they're not hardcoded
- No SERP feature tracking (local pack, featured snippets, AI Overviews)
- No trend direction per competitor

### Pass 1 — Better Data (1 session)
**DataForSEO endpoints to use:**
- `ranked_keywords` per competitor domain — pull their top 50 organic keywords
- Find intersection with our GSC keywords → real gaps, not just keyword-list gaps
- `domain_intersection` — keywords where both we and a competitor rank, showing head-to-head
- Save all top-10 SERP results (already fetched, currently discarded) → auto-detect unknown competitors

**Auto-detection logic:**
- Every domain appearing top 10 across 3+ tracked keywords that isn't in competitor list → surfaced as "You should track this"
- Filter out: aggregators (Zomato, TripAdvisor, Talabat, TimeOut), social media, directories
- Shows: "Hammer Burgers (hammerburgers.ae) ranks top 10 for 8 of your target keywords — not tracked. Add?"

**Share of Voice:**
- For each tracked keyword: which brand ranks and at what position
- Weight by estimated impressions → total visibility % per brand
- Pickl 12% · Salt 31% · High Joint 8% · Untracked 49%
- Track weekly → shows if we're gaining or losing ground

### Pass 2 — Better Presentation (1 session)
- Share of Voice chart over time (line chart, one line per brand)
- Competitor content cluster view (their topic coverage vs ours)
- SERP features per keyword (who owns local pack, featured snippet, AI Overview)
- Trend direction arrows per competitor (rising fast vs stagnant)
- Competitor keyword list export for content planning

---

## CEO Request — Website Visits Tracking Per Market

**What was asked:** Dashboard showing website visits over a 12-month period, broken down by UAE + each international market.

**Why GA4 is required:**
GSC only shows search impressions and clicks — not actual website sessions or users. Real visit data requires GA4 (Google Analytics 4) connected to both WordPress sites. GA4 must be installed on eatpickl.com and bonbirdchicken.com first (developer task) before The Nest can pull this data.

**What to build once GA4 is connected:**

New section in Reports tab (or dedicated Analytics tab sub-section) showing:
- Total sessions per month over last 12 months — line chart
- Breakdown by market: UAE / Bahrain / KSA / Qatar / Egypt / Jordan / Oman (Pickl) and UAE / Oman / Pakistan / Qatar (Bonbird)
- Market detection: filter by URL path (/bh/, /ksa/, /qatar/, /egypt/, /pickl-jordan/, /oman/, /pakistan/) + country geo
- Organic search sessions vs all sessions (isolate SEO-driven traffic)
- YoY comparison when 13+ months of data available

**GA4 API approach:**
- Google Analytics Data API v1 (separate from GSC OAuth — needs ga.readonly scope)
- Add to same OAuth app (pickl-seo project) as new scope
- New Netlify function: `ga4-data.js`
- Cache in Blobs: `ga4Cache:<brand>` — 24hr TTL
- New Blobs key: `ga4Tokens` (separate from gscTokens)

**Developer prerequisite:**
GA4 tracking must be installed on both WordPress sites before building this. If not installed, all data will be zero. Confirm GA4 measurement ID exists for both brands before starting the build.

---

## LLM Tracking — Two Separate Features

This is TWO distinct things that are often confused. Both valuable, different implementation paths.

### Feature 1 — LLM Referral Traffic (GA4-dependent)
**What it is:** Visitors who came to eatpickl.com or bonbirdchicken.com FROM an LLM (ChatGPT, Perplexity, Claude, Gemini etc. gave your URL and someone clicked it).

**Why GA4 is required:** This is standard referral traffic tracking. GA4 shows source/medium per session. Filter for: perplexity.ai · chatgpt.com · claude.ai · copilot.microsoft.com · gemini.google.com · bing.com/chat

**What to build:** In the website visits dashboard, add an "LLM Traffic" row — sessions from LLM referrers over last 12 months. Will likely be near-zero initially but this is the trend to watch as AI search grows. "Dark traffic" (direct/none) may also contain LLM users who copy-pasted URLs — hard to attribute.

**Cost:** Zero — uses same GA4 API.

### Feature 2 — LLM Mention Tracker (independent of GA4)
**What it is:** Does ChatGPT / Perplexity / Claude mention Pickl or Bonbird when someone asks "best burger in Dubai"? This has nothing to do with website traffic — it's brand presence inside AI responses.

**Why this is separate:** LLMs don't send referral data. You can't see inside ChatGPT's responses from GA4. The only way to track this is to ASK the LLMs directly and record what they say.

**How to build:**
- Weekly automated function (`llm-mentions-background.js`) runs Monday alongside scheduler
- Sends 10-15 test queries to multiple LLMs via their APIs: "best burger in dubai", "smash burger dubai", "best chicken in dubai", "halal burger restaurant dubai" etc.
- Records whether brand name appears in response, what context, which LLMs
- Stores results as `llmMentions:<brand>:<YYYY-MM-DD>` in Blobs
- New section in Reports: "AI Search Presence" — Pickl mentioned in 3/4 LLMs for "best burger dubai" this week

**APIs needed:**
- Anthropic API (already have) — Claude mentions
- OpenAI API — ChatGPT mentions (separate key, ~$0.001/query)
- Perplexity API — most important for search, ~$0.001/query
- Cost: ~$0.05/week for all queries. Negligible.

**Why this matters more than LLM traffic right now:**
LLM traffic from direct links is tiny today. But LLM MENTIONS affect what millions of people are told when they ask AI assistants for restaurant recommendations. If Perplexity says "best burger in Dubai is at Salt" every week, that's a problem — regardless of whether anyone clicks through to your website.

**Build order:** LLM Mention Tracker can be built NOW (independent). LLM Traffic Tracker requires GA4 first.

---

### CTR Formula Bug (noted June 2026)
CTR is stored in gscCache as a decimal (0-1) from the GSC API. But in some code paths it may be pre-multiplied to a percentage (0-100) before storage. The display formula `(v * 100).toFixed(1) + '%'` then double-multiplies → 23.7% shows as 2370%.
Fix applied: normalising formatter `fmtCtr` now checks `v > 1` — if already a percentage, uses as-is; if decimal, multiplies by 100. All three CTR display locations updated.
TODO next session: trace where the pre-multiplication is happening in fetchGscDirect or CPC enrichment and standardise storage to always be decimal (0-1).

### CPC Enrichment — All Non-Branded Keywords
Increased from top 150 to all non-branded keywords (up to 700 per DataForSEO task limit).
Cost impact: ~$0.025/week for 500 keywords. Negligible.
Traffic value card label: "DataForSEO CPC × 3.67" when data available, "AED 5/click (no CPC data yet)" when not.
Note: AED 5 fallback only applies to keywords where DataForSEO has no CPC data — this becomes increasingly rare as enrichment covers all non-branded keywords.

---

## Session: June 2026 — v6.9 Build + Bug Fixes

### Changes Made

#### CTR Bug — FULLY FIXED ✅
Storage standardised to decimal (0-1) throughout:
- `gsc-data.js` line 87: `ctr: row.ctr` (was `Math.round(row.ctr * 1000) / 10`)
- `store.js` fetchGscDirect + fetchGscWithPages: same fix
- `scheduler-background.js`: `expected()` = `0.30 / pos`, `ctrGap > 0.015`
- `index.html`: `fmtCtr` always `* 100`, `lowCtrRows` filter uses `0.30 / r.position`

#### Market Tagging Bug — FIXED ✅
`locationTag` was hardcoded as `'🇦🇪 UAE'` at 4 places in `scheduler-background.js`.
Added `getLocationTag(url, brand)` function. Now detects: Bahrain (/bh/), KSA (/ksa/), Qatar (/qatar/), Egypt (/egypt), Jordan (/pickl-jordan/), Oman (/oman/), Pakistan (/pakistan/).
- `quick_wins`: uses `parsed.url || r.page`
- `meta_rewrites`: uses `finalUrl`
- `page_creation`: uses `r.page`
- `blog_draft`: stays UAE (new blog posts always created for main brand site)

#### Competitor Matrix Pass 1 ✅ (competitor-matrix-background.js — full rewrite)
New data per keyword row: `topDomains` (all organic top-20), `serpFeatures` (featured_snippet, localPack, peopleAlsoAsk, video, aiOverview)
New Blobs: `autoDetectedCompetitors:<brand>`, `sovHistory:<brand>` (rolling 12 weeks)
`sovCurrent` stored in `competitorMatrix:<brand>` — CTR-weighted Share of Voice per domain
`competitor-matrix.js` updated to return sovHistory + autoDetected in one fetch

#### Competitor Matrix Pass 2 ✅ (competitor-matrix-ui.js — full rewrite)
**Layout bug fixed**: replaced `justify-content:space-between` header with `cm-toolbar` (view toggle always left-aligned, actions right via `margin-left:auto`). All 5 views use `renderHeader()` helper.
Views: Rankings · 📊 Share of Voice · 🎯 Gaps · Manage Keywords · Manage Competitors
- Rankings: SERP feature pills, unknown competitor alert banner, Export CSV button, SoV summary card
- Share of Voice: horizontal bar chart + SVG 12-week trend line chart
- Gaps: honest "no gaps" messaging with next steps, expanded explanation

#### LLM Mention Tracker ✅
New: `netlify/functions/llm-mentions-background.js` (schedule: Monday 4am UTC)
New: `netlify/functions/llm-mentions.js` (`/api/llm-mentions`)
Queries 4 LLMs × 6 prompts per brand: Claude, OpenAI GPT-4o, Perplexity, Gemini
**"Run Now" button added** — manual trigger with 30s polling, shows today's data when ready
Blobs: `llmMentions:<brand>:<YYYY-MM-DD>`, `llmMentionsHistory:<brand>` (12 weeks)

#### GA4 Integration ✅
New: `netlify/functions/ga4-data.js` — 3 GA4 reports: monthly sessions, country breakdown, LLM referral traffic
Auth: `auth-login.js` + `auth-callback.js` updated for `?type=ga4` → stores `ga4Tokens`
**GA4 error "API not enabled"**: User must visit URL in error message to enable Analytics Data API in Google Cloud Console — one-time setup.
Reports tab: "🌍 Website Traffic (GA4)" section with 12-month bar chart + 3 summary cards
Settings tab: GA4 connect button, status indicator, env var instructions
AI Readiness Score: GA4 now included as 7th check

#### How It Works — Full rewrite ✅
All 10 features documented: Approvals Queue, Analytics & ROI, Reports, Technical SEO, Local SEO, International SEO, AI Content Studio, The Perch, LLM Mentions, Competitor Matrix. Updated keyword tier explanations, approval type descriptions, and new "why it matters" sections for LLM tracking and competitor matrix strategy.

### New Blobs Keys (this session)
| Key | Contents |
|---|---|
| `autoDetectedCompetitors:<brand>` | Domains appearing 3+ times in tracked keyword SERPs, not in competitor list |
| `sovHistory:<brand>` | Rolling 12-week SoV snapshots (array, max 12 items) |
| `llmMentions:<brand>:<YYYY-MM-DD>` | Weekly LLM mention results |
| `llmMentionsHistory:<brand>` | Rolling 12-week LLM mention history |
| `ga4Tokens` | GA4 OAuth tokens (access_token, refresh_token, expires_at) |
| `ga4Cache:<brand>` | GA4 report cache (24hr TTL) |

### Required Env Vars (new this session)
| Variable | Purpose | Status |
|---|---|---|
| `OPENAI_API_KEY` | LLM mention tracking | Add in Netlify |
| `PERPLEXITY_API_KEY` | LLM mention tracking | Add in Netlify |
| `GEMINI_API_KEY` | Google AI Studio — LLM tracking | Add in Netlify |
| `GA4_PROPERTY_ID_PICKL` | GA4 property for eatpickl.com | Add in Netlify |
| `GA4_PROPERTY_ID_BONBIRD` | GA4 property for bonbirdchicken.com | Add in Netlify |

### GA4 One-Time Setup Needed
1. User must enable "Google Analytics Data API" in Google Cloud Console at the URL shown in the error message
2. Developer must install GA4 tracking snippet on both WordPress sites (get Measurement IDs from GA4 admin)
3. Then connect via Settings → Connect Google Analytics 4

### Competitor Gaps — Why Only 4 Gaps
The competitor matrix tracks a curated list of ~30-35 competitive head terms. If you rank for most of them, gaps will be few. This is actually good news — it means the tracked keywords are well-covered. To find more gaps:
- Add 50-100 more keywords in Analytics → Competitor Matrix → Manage Keywords (aim for 100+ per brand)
- Add competitor-driven keywords you know they rank for to the Seed List in How It Works
- The auto-detected competitor alert banner surfaces new competitor domains to track

---

## Session: June 2026 — v6.9c Competitor Intelligence Fixes

### Two targeted fixes only (per user instruction)

#### Fix 1: Competitor Ranked Keywords (Non-Branded Top 50) ✅
`competitor-matrix-background.js`:
- Added `BRAND_KEYWORD_FILTERS` map — per domain: full list of brand terms to exclude (names, misspellings, concatenated versions, abbreviations) for all 13 tracked competitors
- Added `fetchCompetitorRankedKeywords(competitors, locationCode, authHeader)` using **DataForSEO Labs** `dataforseo_labs/google/ranked_keywords/live`
  - Note: Labs DB query only — no Standard mode equivalent exists for ranked_keywords. Cost ≈ $0.005/domain × 13 competitors = $0.065/run
  - Fetches 200 keywords per competitor, filters branded terms, returns top 50 by search_volume
- Stored in new Blob: `competitorRankedKeywords:<brand>` — `{ brand, competitors: { domain: [{keyword, searchVolume, position, url, cpc}] }, fetchedAt }`
- `competitor-matrix.js` read endpoint now fetches and returns `rankedKeywords` field

`competitor-matrix-ui.js` Gaps view:
- **Primary section**: "What competitors rank for that you don't" — shows ranked_keywords data grouped by competitor, sorted by search volume, with position + volume + CPC per keyword. Flags keywords not in your current GSC. Shows "not yet fetched" state before first run.
- **Secondary section**: "Within tracked keywords" — the original gap analysis remains below

#### Fix 2: Share of Voice — Two-tier split ✅
`competitor-matrix-ui.js` SoV view:
- Added `SERP_OCCUPIER_TERMS` array (tripadvisor, zomato, timeout, youtube, instagram, facebook, talabat, deliveroo, noon, careem, whats-on, whatson, thenational, gulfnews, khaleejtimes, visitdubai, dubizzle, yelp, foursquare, openrice + more)
- Added `isSerpOccupier(domain)` function
- Direct competitors chart shows restaurant brands only — these are your actual competitive SoV
- SERP Landscape section (collapsible, collapsed by default) shows aggregators/media with explanation: "Strategy is to get LISTED on these, not outrank them"

#### New Blobs Key
`competitorRankedKeywords:<brand>` — competitors' top 50 non-branded keywords, drives gap analysis

---

## Session: June 2026 — v6.9d Reports Polish

### Three targeted fixes

#### GA4 LLM Referral Traffic — per-source breakdown + chart overlay ✅
`ga4-data.js`:
- `llmMonthly` now stores per-source per month: `{ YYYYMM: { Perplexity: N, ChatGPT: N, Claude: N, Gemini: N, Copilot: N, total: N } }`
- `llmBySource` added: 90-day totals per AI source (used for the breakdown bars)
- `llmGrandTotal` replaces old `llmTotal.sessions`
- `llmSourceLabel()` maps raw session source strings to clean labels

`index.html` — `loadGa4Report()`:
- Monthly chart now shows **both** organic sessions (amber bars) and AI referral (purple bar within each column)
- Legend explains the two data series; hover tooltips show exact numbers per month
- Per-source breakdown bar chart shows Perplexity / ChatGPT / Claude / Gemini / Copilot / Bing AI sessions with horizontal bars + session counts
- Summary cards: 2 cards (Organic Sessions, AI Referral) replacing 3 — cleaner layout

#### Position Distribution — branded vs non-branded split ✅
`index.html` — `loadReports()`:
- `bands` now includes `nonBrand` and `branded` counts per position range (using existing `nonBrandedRows` / `brandedRows` already in scope)
- Each bar is now two-layer: full-opacity bottom = non-branded (earned), reduced-opacity top = branded (brand searches)
- Legend below explains the two layers
- Per-band breakdown text: "1–3: 12 non-brand + 4 branded" 
- Footer totals row shows overall non-branded vs branded split
- `bandDefs` extracted as separate constant; `bands` computed from it with `.range()` filter

#### SETUP.md ✅
Updated with all sessions: CTR fix, market tagging, Competitor Matrix Pass 1+2, LLM tracker, GA4, How It Works rewrite, layout fix, market tagging fix, Run Now button, competitor ranked keywords, SoV tier split, GA4 LLM breakdown, position distribution split.

### Data structures changed
`llmReferralMonthly` in `ga4Cache:<brand>` — was `{ YYYYMM: totalSessions }`, now `{ YYYYMM: { Perplexity: N, …, total: N } }`. Cache invalidates after 24h so old format won't persist.

---

## Session: June 2026 — v6.9e Voice Score Bug Fix

### Bug: New Page (page_creation) showed no brand voice score badge

**Root cause** — two problems in `runPageCreation` in `scheduler-background.js`:

1. `runBrandVoiceCheck` was never called — no voice score was generated for page_creation items coming from the location/service keyword path
2. The `createApproval` call was missing the `payload: {}` wrapper key — all fields (`excerpt`, `body`, `pageType`, `currentPos`, `impressions`, `wpAction`) were passed at the top level of the call, but `createApproval` in `store.js` stores `input.payload || {}`. Since `input.payload` was `undefined`, it stored an empty payload. The badge reads `item.payload?.voiceScore` → `undefined` → rendered nothing.

Note: the *other* page_creation path (in `meta_rewrites`, when a GSC page has impressions but no content) was correct — it has both the voice check and proper `payload: {}` wrapper. Only `runPageCreation` was broken.

**Fix** (`scheduler-background.js`):
- Added `runBrandVoiceCheck` call after `extractJson` — same as blog_draft and page_update
- Added score < 5 rejection gate (consistency with other types)
- Fixed `createApproval` to use proper `payload: {}` wrapper with ALL fields: `title`, `description`, `targetKeyword`, `slug`, `pageHeading`, `excerpt`, `body`, `pageType`, `currentPos`, `impressions`, `wpAction`, `voiceScore`, `voiceIssues`, `voiceTopFix`, `keywordTier`, `tierColor`, `tierEmoji`
- Updated `items.push` to include `voiceScore` for scheduler logs

**Fix** (`index.html` — `buildPreview`):
- Added `voiceTopFix` amber warning note to `page_creation` preview (same treatment as `blog_draft`)

**Note on existing queue items**: Any page_creation items already in the queue from before this fix will still show no voice badge (payload was stored empty at creation time). They'll need to be dismissed and regenerated on the next Monday run to get the badge. New items generated after this deploy will show correctly.

---

## Session: June 2026 — v6.9g Critical JS Fix + Full Syntax Audit

### Two missing function declarations (caused complete page failure)

Both issues were the same class of bug: `str_replace` operations that inserted a new function before an existing one accidentally dropped the existing function's declaration line, leaving the function BODY floating at the wrong scope level. A floating function body at IIFE top-level causes a JS SyntaxError at parse time — zero JS runs, page shows "Loading…" forever, no tabs work.

**Bug 1** (`index.html`): `function renderLlmQueryDetails(results, brandName) {` was missing.
Body was at top-level of script after `triggerLlmRun` closing `}`.

**Bug 2** (`competitor-matrix-ui.js`): `function render(container) {` was missing.
Body was floating inside the IIFE after `renderHeader` closing `}`. Caused "Unexpected token 'function'" error at `renderSoV` on line 416 because the floating code consumed the `}` that should have closed the IIFE, pushing `renderSoV` outside valid scope.

**Prevention**: Added `node --check` syntax verification step run against all JS files + extracted index.html JS before every package from this session forward. 

### Syntax audit results (all clean after fixes)
- 34 netlify function `.js` files: ✅ all pass
- 5 `_lib/*.js` files: ✅ all pass  
- `js/competitor-matrix-ui.js`: ✅ passes (after render() fix)
- `index.html` extracted JS: ✅ passes (after renderLlmQueryDetails fix)
- All redirect targets in netlify.toml: ✅ all function files exist
- All scheduled function names in netlify.toml: ✅ all function files exist
- All onclick handlers: ✅ all resolve to defined functions

---

## Session: June 2026 — v6.9h–v6.9k Fixes

### v6.9h — GA4 LLM referral fix
- Cache invalidation: if cached `ga4Cache:<brand>` is missing `llmBySource` field (old format), treats as stale and re-fetches
- Added `?refresh=1` param to force cache bypass; loadGa4Report now accepts `forceRefresh` param
- Added ↻ Refresh link next to property ID in GA4 status line
- Expanded LLM domain filter: `perplexity`, `chatgpt.com`, `chat.openai.com`, `openai.com`, `claude.ai`, `anthropic.com`, `gemini.google.com`, `bard.google.com`, `copilot.microsoft.com`, `you.com`, `phind.com`, `kagi.com`
- `llmSourceLabel()` updated for new sources

### v6.9i — LLM mention tracker: model fallbacks + error tracking
- `queryOpenAI()`: tries `gpt-4o` then `gpt-4o-mini` fallback
- `queryPerplexity()`: tries `llama-3.1-sonar-small-128k-online` → `sonar-small-online` → `sonar`
- `queryGemini()`: tries 5 models newest-to-oldest with proper 403/404/429 handling and detailed logging
- All query functions return `{ text, error }` instead of raw null/string
- `processBrand()` now tracks `keySet` per LLM and `errorReason` for failed calls
- Summary now includes `keySet` and `errorReason` fields
- UI now shows: "⚠ Key not set in Netlify" / "✕ API Error — check Netlify logs" with error detail / working score card

### v6.9j — Gemini model order fix
- Moved `gemini-1.5-flash` to FIRST in fallback chain (most reliable free-tier model)
- Added `gemini-1.5-flash-8b` to list
- Added explicit 404 handling (model not found → continue), 429 handling (rate limit → wait + continue)
- Added safety block handling: `finishReason: "SAFETY"` returns empty string (not null) so key is still counted as available
- Added raw response logging for debugging

### v6.9k — Competitor gaps: Labs error visibility + Queue buttons
**Labs error tracking** (`competitor-matrix-background.js`):
- `fetchCompetitorRankedKeywords()` now does a preflight test request to detect auth/access errors before running all competitors
- Returns `{ resultsMap, labsError }` (was: bare `resultsMap`)
- `labsError` stored in `competitorRankedKeywords:<brand>` blob
- Read endpoint passes `labsError` through to UI

**Gaps view** (`competitor-matrix-ui.js`):
- If Labs failed: shows red error banner with the actual error message and link to DataForSEO account
- If Labs succeeded but empty: shows blue "not yet fetched" state as before
- `📝 Queue` button on every gap row (both competitor-discovered and tracked-keyword gaps)
- `queueGapKeyword()`: fetches current seed keywords, adds the gap keyword, saves back to seed list
- Shows confirmation tip: "Added to Priority Gap seed list — runs Monday 8am or trigger manually in Settings & Logs"
- Scheduler's existing `getQueuedKeywords()` already prevents re-queuing anything already in the approvals queue

---

## The Nest — Full Vision & Current Gaps

### The Vision (updated June 2026)

The Nest is the **central marketing operations platform for Yolk Brands** — not just an SEO tool. The goal is for every marketing output (content, social posts, SEO pages, review replies, campaign briefs) to flow through The Nest: written/generated with AI assistance, approved by a human, then auto-published to the right destination.

**The full platform vision:**
- SEO team uses it for content pipeline, keyword strategy, technical health, competitor intelligence
- Social media team builds the content calendar inside The Nest — posts drafted (AI-assisted in brand voice), approved in The Nest, then auto-pushed to SocialPilot for scheduling
- Design team tracks asset requests and campaign timelines via The Perch
- Leadership sees Reports tab — traffic, rankings, AI search presence, market breakdown
- Eventually covers Southpour, Shadowburg, Shadowbird as additional brands

**Content Calendar — current status and roadmap:**
The Nest handles the full social content workflow: creation → assignment → approval → ready to post.

**Current posting flow (Option C):**
1. Social team creates posts in The Nest with captions, images (GCS), hashtags, scheduled date/time
2. Posts go through approval workflow (Slack notifications, Approve/Request Changes)
3. Once approved, "Mark Ready for SocialPilot" sets status to Scheduled — team manually schedules in SocialPilot
4. Zapier auto-push can be enabled later: add `ZAPIER_WEBHOOK_URL` env var → The Nest fires webhook → Zapier creates SP post

**SocialPilot direct API — investigated, blocked:**
SocialPilot's internal REST API (`rest.socialpilot.co/v4/`) requires AWS Cognito JWTs that expire every 24h.
The API key in SocialPilot account settings does NOT work for server-to-server auth.
Contact SocialPilot support asking for long-lived server-to-server credentials if needed.

**Long-term vision (build in-house, replace SocialPilot entirely):**
- Direct posting via platform APIs (Meta Graph, TikTok, LinkedIn, YouTube)
- Community management (comments, DMs) in The Nest
- Client roles (view-only, can't post — manager approves before publish)
- Analytics pulled directly from platform APIs
- Full social media OS for Yolk Brands — no tool-switching needed

### What the tool covers today ✅
- Google organic search (text): full automated pipeline — keyword discovery, content creation, meta rewrites, page updates, publishing to WordPress
- Technical SEO: Core Web Vitals, page speed, sitemap, robots, structured data audits
- International SEO: 9 markets, hreflang generation
- Competitor intelligence: SERP rankings, Share of Voice, gap analysis, SERP features
- AI search presence: LLM mention tracking across Claude, OpenAI, Perplexity, Gemini
- Google Business Profile: location health, review management (pending API approval)
- GA4 traffic: organic sessions, LLM referral attribution by source
- The Perch: full marketing team task management, replacing Trello
- Brand voice: 1-10 scoring, banned words, real writing examples injected into every prompt
- Multi-brand, multi-market, role-based access

### Current gaps in the tool 🔧

**SEO layer (not yet covered):**
- Schema markup auto-implementation — currently generates JSON-LD in AI Studio but doesn't push it to WordPress. Should be a queued item like meta_update.
- Backlink intelligence — who links to Salt/Shake Shack but not Pickl? DataForSEO backlink API would give this. Direct content PR target list.
- Citation consistency — NAP (name, address, phone) across Zomato, TripAdvisor, Time Out, What's On, The Entertainer. These aggregators dominate UAE food SERPs and being unlisted or inconsistent hurts rankings.
- AI Overview visibility tracker — are we appearing in Google's AI-generated answers for top keywords? Weekly automated check.
- Content repurposing signal — when a blog post is queued, also flag if the same keyword warrants a YouTube video or Instagram reel based on intent.

**Distribution layer (not yet covered):**
- YouTube SEO — video titles, descriptions, tags, transcript content. YouTube is the second largest search engine and Google owns it. For "best burger Dubai" video content has outsized presence.
- Social media pipeline → SocialPilot (Week 5). The full vision above.
- Influencer/media tracking — when Time Out Dubai or What's On publishes about Pickl or Bonbird, the tool should know. Feeds LLM training data and backlink value.

**Off-page authority (not yet covered):**
- Review platform presence — Zomato, TripAdvisor, Google Reviews aggregate scores affect both traditional rankings and LLM mention likelihood. The GBP module covers Google; Zomato and TripAdvisor need their own monitoring.
- Press/media mention tracker — PR mentions on Dubai food media (Grubhunt, What's On, Timeout, Gulf News Food) are real SEO signals. Should surface when competitor gets covered but you don't.

### SEO → AI search content strategy (the framework)

For a keyword like "best burger Dubai", the full asset set that maximises presence across ALL surfaces is:

| Asset | Surface | Status |
|---|---|---|
| SEO blog post | Google organic, LLM training | ✅ Auto-generated |
| Location landing page | Google organic (local intent) | ✅ Auto-generated |
| Meta title + description | Google CTR | ✅ Auto-rewritten |
| Google Business Profile | Local pack, Maps | ✅ Monitored |
| Structured data (Restaurant schema) | AI Overviews, rich results | 🔧 Generated but not auto-pushed |
| Zomato / TripAdvisor listing | SERP occupiers (get listed, not outranked) | 🔧 Not yet monitored |
| YouTube video | YouTube search, Google video tab | 📅 Roadmap Week 4 |
| Instagram Reel | Discovery/awareness (not search-intent) | 📅 Roadmap Week 5 |
| Press/media mention | LLM training data, backlinks | 📅 Roadmap (unscheduled) |

The Monday pipeline handles the top two rows automatically. Everything below is either in progress or on the roadmap. The platform is designed to eventually automate the entire column — not just the SEO layer.

---

## DataForSEO — Note on Labs Access
`dataforseo_labs/google/ranked_keywords/live` requires Labs product enabled on the DataForSEO account (separate from SERP Standard access). If the Competitor Gaps tab shows a Labs error after Refresh Now, check app.dataforseo.com → API Access. The SERP rankings, Share of Voice, and gap analysis against tracked keywords all continue to work without Labs. Labs only unlocks the "what competitors rank for outside your tracked list" discovery feature.


---

## Session: June 2026 — v6.9l Three Fixes

### Fix 1: Reports tab competitor gaps — wrong key access
`index.html` — `renderReports()`:
- Bug: `matrixData?.rows` — the API returns `{ pickl: { rows: [] }, bonbird: { rows: [] } }` but code was reading the top level directly, always getting `undefined`
- Fix: `matrixData?.[brand]?.rows || []`
- Result: "No competitor data yet" no longer shows when matrix data exists

### Fix 2: International blog approvals — voice score missing from payload
`international-seo-background.js` — `queueApprovalItem()`:
- Bug: `voiceScore`, `voiceIssues`, `voiceTopFix` were in `item.meta` but never mapped into `payload {}`. `createApproval` stores `input.payload || {}`, so the badge always read `undefined`
- Fix: Added explicit mapping of all three voice fields into payload object

### Fix 3: GA4 chart month labels overlapping bars
`index.html` — `loadGa4Report()`:
- Bug: Month labels (`writing-mode:vertical-rl`) were inside the same `height:90px` flex container as the bars, causing them to protrude into content below when bars were tall
- Fix: Separated into two rows — bar area (`height:80px`, bars only) and a clean label row below using horizontal text (month abbreviations fit without rotation)

---

## Session: June 2026 — v6.9m International SEO GSC Data

### Fix: International blogs had no position/impressions data

**Root cause:** The international SEO background function (`international-seo-background.js`) used pre-configured `market.seedKeywords` to decide what to write about but never fetched GSC data. There was a wrong comment in the code saying this was "intentional" — it was not, it was simply never implemented.

**Fix:**
1. Added `fetchGscDirect` import from `_lib/store.js`
2. At start of `processMarketLanguage()`, fetch GSC rows for the brand's main site:
   - Pickl: `https://eatpickl.com/` (covers all `/bh/`, `/egypt/`, `/qatar/` etc. as they're on same property)
   - Bonbird: `https://bonbirdchicken.com/`
3. Build `gscMap` — `keyword.toLowerCase() → { position, impressions }`
4. For each blog's `focusKeyword`, look up in gscMap → pass `currentPos` and `impressions` into `queueApprovalItem` meta
5. `queueApprovalItem` now maps `currentPos` and `impressions` from meta into the stored payload
6. Removed the incorrect "intentionally omitted" comment

**Behaviour after fix:**
- If the international keyword already has impressions in GSC (e.g. "best burger in bahrain" has ranking history) → position and impressions now show on the approval card
- If it's truly new content with no GSC data (new Oman market, never indexed) → fields are null, which is the honest state — the keyword hasn't been seen by Google yet. The card still shows target keyword, voice score, and market flag.


---

## Session: June 2026 — v6.9n Full Bug Fix Pass

### Complete list of issues fixed

#### Backend

**scheduler-background.js**
- `ctrGap` was stored as `toFixed(1)` on a decimal value (0.023 → "0.0"). Fixed to `(ctrGap * 100).toFixed(1)` → stored as percentage string like "2.3". Display in buildContextBar already shows `+${ctrGap}%` so this is now correct.

**perch.js**
- Sequential `await` in `for` loop was fetching each task one-at-a-time. With 50 tasks × 100ms/call = 5s minimum load time. Fixed to `Promise.all()` — all tasks fetched in parallel, load time drops to ~100ms regardless of task count.

**international-seo-background.js**
- `generateBlogDraft` always used `keywords[0]` — same keyword every run. Added `usedKeywords: Set` parameter so each blog in a run uses a different seed keyword.
- Changed from 1 blog draft per market run to **3 blog drafts per market run** (`MAX_BLOGS_PER_MARKET = 3`) using keyword rotation.
- GSC lookup was exact keyword match only — focus keywords Claude generates rarely match GSC keywords exactly. Added `findGscData()` with 3-tier fuzzy lookup: (1) exact match, (2) market country/city term match, (3) word-overlap match (≥2 meaningful words in common).
- Stores `gscKeyword` field in payload when fuzzy match used — shown in context bar as `via "matched keyword"`.

#### Frontend (index.html)

**Approvals Queue — badge not updating**
- `removeCardFromQueue()` called `renderQueue()` but never `updateQueueBadge()`. Nav badge stayed at original count after approving/dismissing. Fixed: badge now updates immediately from `state.queue.length`.

**Tab state — always returns to Perch on refresh**
- Active tab never saved. Now: `switchView()` writes `localStorage.setItem('nestActiveTab', target)`. On init, reads saved tab and restores it. Skips if saved tab is 'perch' (no point restoring to default).

**GA4 state — always "not connected" in AI Readiness Score on fresh load**
- `state.ga4Connected` only set on OAuth redirect or Settings tab visit. Now: `checkGa4Connection()` called in init on every page load so the Reports score is accurate without visiting Settings first.

**Dashboard tab — no data handler**
- No `if (target === 'dashboard')` case in `switchView()`. Added `loadDashboardIfNeeded()` which calls `loadGscIfNeeded()` — dashboard metrics now populate when the tab is opened directly.

**Approve/Publish button order**
- "Approve & Publish" (green, publishes live) was right next to "Approve → WP Draft" (blue) — easy to accidentally publish. Reorganised: WP Draft | Edit Draft | Rewrite with AI | [separator] 🚀 Publish Live. Visual separation makes the live publish intentional.

**Edit Draft — raw JSON textarea**
- Replaced raw JSON editor with type-specific labeled form fields:
  - `blog_draft` / `page_creation`: Title, Meta Description, Target Keyword, Slug, Content textarea
  - `meta_update`: Title, Meta Description
  - Other: raw content only
- Non-technical users can now edit without knowing JSON.

**Rewrite with AI — window.prompt()**
- Replaced native browser `prompt()` dialog with a proper styled modal matching the tool's design. Has a textarea for feedback with placeholder examples, Cancel/Rewrite buttons, border validation on empty submission.

**page_update — no voice note**
- `buildPreview` for `page_update` was missing the amber `⚠ Voice note` warning that `blog_draft` and `page_creation` have. Added.

**GA4 refresh — invisible link**
- "↻ Refresh" was a tiny inline `<a>` tag. Replaced with a proper styled `<button>`.

**Script cache busting**
- Added `?v=6.9n` to `/js/competitor-matrix-ui.js` script tag. Browsers that cached the old file will now fetch the latest version automatically on deploy.

**International context bar — GSC fuzzy match label**
- When a fuzzy GSC match is used (not exact keyword), the impressions cell now shows `via "matched keyword"` in small text so users understand where the data came from.

#### competitor-matrix-ui.js

**SoV trend chart — invisible for first week**
- `if (historyData.length > 1)` meant no chart showed after the first Monday run. Added message for `historyData.length === 1`: "📅 First data point recorded [date]. Trend line will appear after next Monday's run."

**Refresh Now poll orphan**
- If user clicked Refresh Now then navigated away and back, two polling loops ran simultaneously. Fixed: `loadData()` now clears any existing `pollTimer` BEFORE the `isLoading` check, so a new loadData always kills the previous poll first.

### New Blobs fields added
- `competitorRankedKeywords:<brand>` — now includes `gscKeyword` per blog draft (fuzzy matched GSC keyword)
- International blog payloads — `gscKeyword` field added

### What's left (known remaining issues — fix in next session)
- Add Target Keyword button in Analytics & ROI saves to wrong list (`state.keywords` via `/api/db/save` instead of competitor matrix keyword config). Needs to add to both.
- How It Works scheduler status: no timeout/error state — stays "Loading…" if API fails.
- International new market context bar: null position/impressions looks like broken data for Oman/Pakistan new markets — needs a "New market — no history yet" indicator.
- SoV aggregator split: confirmed the code exists and is correct. If user still sees one chart, it's a browser cache issue — hard refresh (Ctrl+Shift+R) fixes it. The `?v=6.9n` cache bust will prevent this going forward.


---

## Session: June 2026 — v6.9o Bug Fixes + Backlink Monitoring

### Bug Fixes

#### Fix 1: Add Target Keyword — now writes to both lists ✅
`index.html` — `addKeyword()`:
- Previously only saved to `state.keywords` (GSC tracking list) via `/api/db/save`
- Now also POSTs to `/api/keyword-config` with the new keyword appended to the brand's competitor matrix keyword list
- Toast updated: "added to {brand} tracking & competitor matrix"
- Error in keyword-config update is non-fatal (logged as warning, doesn't block the primary save)

#### Fix 2: How It Works scheduler status — timeout + error state ✅
`index.html` — `loadHowItWorks()`:
- Added `Promise.race()` with a 10s timeout against the `/api/db/get` call
- Timeout shows: "Status check timed out — Netlify function may be cold. Try refreshing." in danger color
- API error shows: "Error loading status: {message}" with a warning icon
- Both error states include a reassurance: "Scheduler still runs automatically every Monday 8am Dubai time."
- No more infinite "Loading…" if the function is cold or unreachable

#### Fix 3: International context bar — new market indicator ✅
`index.html` — `buildContextBar()`:
- Added `isNewMarket` detection: `isIntl && !pos && !impressions`
  - `isIntl` = has a locationTag that isn't `🇦🇪 UAE`
- New "Market Status" cell renders for new market items: "New market · No ranking history yet" in sky blue
- Early-return guard updated: `!isNewMarket` added to prevent empty bar on these items
- Affects: Oman (Pickl NEW), Oman (Bonbird), Pakistan (Bonbird) — the three markets with no established GSC presence

### New Feature: Backlink Monitoring ✅

#### What it does
- Fetches referring_domains data for eatpickl.com and bonbirdchicken.com via DataForSEO Standard mode (task_post + task_get polling)
- Also fetches top competitor domains for comparison
- Runs every Monday automatically (same cron as other Monday jobs)
- "Refresh Now" per-brand buttons for manual fetch

#### DataForSEO endpoint used
`/v3/backlinks/referring_domains/task_post` + `task_get` — Standard mode, polling every 5s
Cost: ~$0.002–0.005 per domain query. With 5 domains per brand × 2 brands = ~$0.04/week

#### Domains tracked
- **Pickl**: eatpickl.com (own) + salt.ae, highjoint.ae, shakeshack.com, fiveguys.ae (competitors)
- **Bonbird**: bonbirdchicken.com (own) + raisingcanes.com, kfc.com, popeyes.com, daves-hot-chicken.com (competitors)

#### Metrics shown
- Referring domains count (total unique linking domains)
- Total backlinks (sum from top 100 referring domains)
- Dofollow % (link equity being passed)
- Domain Score (avg DR of top 20 referring domains, DataForSEO's 0–1000 scale)
- Weekly delta: new domains gained / lost vs previous snapshot
- Top 10 referring domains table: domain, DR, backlink count, dofollow/nofollow
- Competitor comparison bar chart: referring domains side-by-side

#### New files
- `netlify/functions/backlinks.js` — GET (cached data) + POST (trigger refresh)
- `netlify/functions/backlinks-background.js` — Monday 4am UTC cron

#### netlify.toml additions
- `[[redirects]]` `/api/backlinks` → `/.netlify/functions/backlinks`
- `[functions."backlinks-background"]` schedule `"0 4 * * 1"`

#### New Blobs keys
| Key | Contents |
|---|---|
| `backlinkData:<brand>` | Latest backlink snapshot: own domain summary + competitor summaries + delta |
| `backlinkHistory:<brand>` | Rolling 12-week history (date, referringDomains, totalBacklinks) |

#### UI
- New pill in Analytics & ROI tab: "🔗 Backlinks"
- New `panel-backlinks` div — shown/hidden by `switchAnalyticsView()`
- `loadBacklinksIfNeeded()` — loads on first tab open, cached thereafter
- `renderBacklinks(data)` — renders full UI from data
- `refreshBacklinks(brand)` — triggers POST to /api/backlinks, re-renders on success

---

*Last updated: June 2026 — v6.9o: Add Target Keyword dual-write fix, How It Works timeout fix, International new market context bar, Backlink Monitoring (DataForSEO referring_domains, competitor comparison, delta tracking, Monday cron)*

---

## Session: June 2026 — v6.9p Citation Tracker

### What was built

#### Citation Tracker ✅
NAP (Name, Address, Phone) consistency checker across 5 UAE food platforms.

**Platforms checked:**
- 🍽 Zomato — `site:zomato.com`
- ✈️ TripAdvisor — `site:tripadvisor.com`
- ⏰ Time Out Dubai — `site:timeoutdubai.com`
- 📱 What's On — `site:whatson.ae`
- 🎟 The Entertainer — `site:theentertainerme.com`

**New files:** `citations.js`, `citations-background.js`
**New Blobs:** `citationNAP:<brand>`, `citationData:<brand>`, `citationStatus:<brand>`
**UI:** Local SEO tab — always-visible section, brand pills, per-platform rows with Verified/Issue buttons. Settings tab — Citation Settings card (Business Name, Address, Phone per brand).
**Cron:** Monday 4am UTC alongside other Monday jobs.

---

## Session: June 2026 — v6.9q AI Overview Visibility Tracker

### What was built

#### AI Overview Visibility Tracker ✅
Weekly check: do our top 20 non-branded GSC keywords trigger a Google AI Overview? Are we mentioned in them?

**How it works:**
- Reads top 20 non-branded keywords from `gscCache:<brand>` (sorted by impressions — no extra API call)
- Submits all 20 as a single batch POST to DataForSEO SERP Standard mode
- Polls all task IDs in parallel (5s interval, 90s max)
- Detects `ai_overview` item type in SERP results OR `ai_overview` in `serp_info.serp_features`
- Checks brand name (Pickl/Bonbird) in extracted AI overview text for brand mention
- Also captures our organic position from live SERP (more current than gscCache avg)
- Cost: ~$0.0006/keyword × 20 = ~$0.012/brand/run = ~$0.024/week

**New files:**
- `netlify/functions/ai-overview-background.js` — Monday 4am UTC cron + single-brand manual trigger via `?brand=`
- `netlify/functions/ai-overview.js` — GET (cached data + history) / POST (fires background, returns 202)

**netlify.toml additions:**
- `[[redirects]]` `/api/ai-overview` → `/.netlify/functions/ai-overview`
- `[functions."ai-overview-background"]` schedule `"0 4 * * 1"`

**New Blobs keys:**
| Key | Contents |
|---|---|
| `aiOverviewData:<brand>` | Latest 20-keyword results array |
| `aiOverviewHistory:<brand>` | Rolling 12-week summary `[{ date, keywordsChecked, aiOverviewCount, brandMentionedCount }]` |

**UI — Reports tab (between Competitor Gaps and GA4):**
- Two summary cards: "AI Overviews Triggered" X/20 · "Brand Mentioned" X
- 12-week trend SVG line chart (blue = AI Overviews, green = Brand Mentioned) — shown after 2+ data points
- Keyword table: Keyword | Our Position | AI Overview (✅/⬜) | Brand Mentioned (🟢/—) | Checked date
- Sorted: AI Overview Yes first, then by position ascending
- "↻ Refresh Now" button — fires background, polls every 30s until `checkedAt` changes, live re-renders
- Placeholder with "Run Now" button when no data yet

**JS functions added:**
- `loadAiOverview(brand)` — fetches and renders, called alongside GA4 + LLM in `renderReports`
- `renderAiOverview(el, data, history, brandName, brand)` — full UI render
- `renderAiOverviewTrend(history, brandName)` — SVG trend chart
- `triggerAiOverviewRefresh(brand)` — POST → background, 30s poll loop, live re-render on completion

*Last updated: June 2026 — v6.9q: AI Overview Visibility Tracker (DataForSEO SERP batch + parallel poll, brand mention detection, Reports tab section, 12-week trend chart, Monday cron)*

---

## Session: June 2026 — v6.9p Citation Tracker

### What was built

#### Citation Tracker ✅
NAP (Name, Address, Phone) consistency checker across 5 UAE food platforms.

**Platforms checked:**
- 🍽 Zomato — `site:zomato.com`
- ✈️ TripAdvisor — `site:tripadvisor.com`
- ⏰ Time Out Dubai — `site:timeoutdubai.com`
- 📱 What's On — `site:whatson.ae`
- 🎟 The Entertainer — `site:theentertainerme.com`

**How it works:**
- For each platform: submits SERP task `<brand name> Dubai site:<domain>` to DataForSEO Standard mode (task_post + task_get/advanced polling)
- Extracts top organic result: title, snippet, URL
- Stores raw snippet — human reviews and marks Verified / Issue Flagged
- Cost: ~$0.0006/query × 5 platforms × 2 brands = ~$0.006/run

**New files:**
- `netlify/functions/citations.js` — GET (cached data + NAP + status) / POST (check, save_nap, save_status)
- `netlify/functions/citations-background.js` — Monday 4am UTC cron, runs both brands

**netlify.toml additions:**
- `[[redirects]]` `/api/citations` → `/.netlify/functions/citations`
- `[functions."citations-background"]` schedule `"0 4 * * 1"`

**New Blobs keys:**
| Key | Contents |
|---|---|
| `citationNAP:<brand>` | Canonical name/address/phone for checking |
| `citationData:<brand>` | Array of 5 platform results from last check |
| `citationStatus:<brand>` | Manual status per platform: `verified` \| `issue` \| null |

**UI — Local SEO tab:**
- `#citation-section` — always visible, independent of GBP connection state
- Brand pills (Pickl / Bonbird) to filter display
- Per-platform rows: platform name + emoji, last checked date, snippet (120 chars), URL link, status pill
- Status pills: 🟢 Verified / 🔴 Issue Flagged / ⚪ Unchecked / ⏳ Checking…
- "✓ Mark Verified" / "⚠ Flag Issue" buttons — toggle off if clicked again
- "🔄 Check All Now" button — runs both brands sequentially with 2s delay between each

**UI — Settings tab:**
- New "📋 Citation Settings" card (full-width, above Audit Log)
- Per-brand: Business Name, Address, Phone fields
- Default values pre-filled: Pickl (name=Pickl, address=Dubai UAE, phone=+971), Bonbird (name=Bonbird Chicken, address=Dubai UAE, phone=+971)
- Brand selector + Save button

**JS functions added (index.html):**
- `loadCitationData()` — fetches all data, shows section, renders both brands
- `renderCitationTracker(brand)` — builds platform rows from state
- `checkAllCitations()` — POSTs check for each brand in sequence, live-updates rows
- `markCitationStatus(brand, platform, status)` — toggles verified/issue, saves to Blobs
- `loadCitationNap()` / `saveCitationNap()` — Settings NAP CRUD
- `switchCitationBrand(brand, el)` — brand pill filter
- `fmtRelativeDate(iso)` — relative time formatter (shared utility)

**switchView wiring:**
- `localseo`: now calls `loadCitationData()` alongside `loadLocalSeo()`
- `settings`: now calls `loadCitationNap()` alongside existing settings loaders

*Last updated: June 2026 — v6.9p: Citation Tracker (NAP checker, 5 UAE food platforms, DataForSEO SERP Standard, manual verify/flag, Settings NAP fields, Monday cron)*

---

## Session: June 2026 — v6.9s Deep Competitor Audit + CEO PDF Export + Email Digest

### What was built

#### Deep Competitor Audit ✅
Enter any competitor domain, get their top 50 non-branded keywords + traffic metrics via DataForSEO Labs.

**How it works:**
- POST `{ domain }` → DataForSEO Labs `dataforseo_labs/google/ranked_keywords/live` (Dubai location, en)
- Returns top 50 keywords by search volume, filtered to `search_volume > 0`
- Domain metrics: totalKeywords, top10, top3, estimated traffic value (ETV)
- Results cached 24hr per domain in Blobs

**New file:** `netlify/functions/competitor-audit.js`
- GET `?domain=xxx` — returns cached result (if < 24hr old)
- POST `{ domain }` — runs fresh audit, caches result
- `cleanDomain()` strips protocol/www, handles full URLs and bare domains

**netlify.toml:** Added `[[redirects]]` `/api/competitor-audit` → `/.netlify/functions/competitor-audit`

**New Blobs key:** `competitorAuditCache:<domain>` — `{ domain, keywords[], metrics, fetchedAt }`

**UI — Analytics & ROI tab:**
- New `🔍 Deep Audit` pill in `#analytics-pills`
- New `#panel-audit` panel — domain input + Run Audit button + results area
- 4 summary cards: Total Keywords · Top 10 · Top 3 · ETV (DataForSEO's estimated monthly traffic value)
- 50-row keyword table: Keyword | Position | Volume | CPC | Competition | Traffic% | URL | ➕ Queue
- ➕ Queue button calls `queueAuditKeyword(keyword)` — adds to Priority Gap seed list via `/api/seed-keywords`
- Cached results shown immediately, live audit badge shows when fetching fresh

**JS functions added (`index.html`):**
- `runCompetitorAudit()` — gets domain input, GETs cache first, POSTs if stale/missing
- `renderAuditResults(data, container)` — builds summary cards + keyword table
- `queueAuditKeyword(keyword)` — adds keyword to brand's seed list

**Note:** Requires DataForSEO Labs product enabled on account (`dataforseo_labs/google/ranked_keywords/live`). Labs is a separate product from SERP Standard. If not enabled, endpoint returns 40300. Check app.dataforseo.com → API Access.

---

#### CEO PDF Export ✅
One-click PDF export of the Reports tab for executive review.

**Implementation:** `window.print()` with `@media print` CSS
- Print CSS hides: nav, all panels except Reports, buttons, toasts, modals, analytics pills, perch content
- Shows only `#panel-reports` content
- Sets `overflow: visible` on containers so content doesn't clip
- Document title set to `"The Nest — {BrandName} Report — {YYYY-MM-DD}"` before printing, restored after
- Full-width layout in print: 2-col and 3-col grids become 1-col

**UI:** `📄 Export PDF` button in Reports tab header (right side)

**JS function:** `exportReportPdf()` — sets title, calls `window.print()`, restores title

---

#### Email Digest ✅
Weekly Monday summary email via Resend API — pipeline activity + GSC highlights per brand.

**New file:** `netlify/functions/email-digest.js`
- POST `{ to? }` — builds HTML email, sends via Resend, saves `digestLastSent` to Blobs
- GET — returns `{ lastSent, to, messageId }` metadata
- Requires env vars: `RESEND_API_KEY`, `DIGEST_FROM_EMAIL`
- Default recipient: `DIGEST_TO_EMAIL` env var, falls back to `shazin@yolkbrands.com`

**Email content per brand:**
- Non-branded keywords in top 10 (from gscCache)
- Quick wins (pos 11-20)
- Pending approval count
- Pipeline: items approved + published to WordPress this week
- AI Overview count (X/total from `aiOverviewData:<brand>`)
- Top 3 keyword opportunities table (by impressions)

**HTML email:** Responsive, dark header, brand-coloured section headers (amber for Pickl, red for Bonbird), inline CSS only (Resend-compatible)

**netlify.toml:** Added `[[redirects]]` `/api/email-digest` → `/.netlify/functions/email-digest`

**New Blobs key:** `digestLastSent` — `{ lastSent: ISO string, to, messageId }`

**UI — Settings tab (System Preferences card):**
- Email recipient input (pre-filled from `DIGEST_TO_EMAIL` env var default)
- "📧 Send Now" button → calls `sendDigestEmail()`, shows last sent date on success
- Note: requires `RESEND_API_KEY` + `DIGEST_FROM_EMAIL` env vars in Netlify

**JS function:** `sendDigestEmail()` — POSTs to `/api/email-digest`, shows success/error toast

**Required env vars (new):**
| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key (resend.com) |
| `DIGEST_FROM_EMAIL` | Verified sender address (e.g. `digest@yolkbrands.com`) |
| `DIGEST_TO_EMAIL` | Default recipient (optional, falls back to shazin@yolkbrands.com) |

*Last updated: June 2026 — v6.9s: Deep Competitor Audit (DataForSEO Labs ranked_keywords, 50-row table, queue to seed list), CEO PDF Export (window.print + @media print CSS), Email Digest (Resend API, per-brand HTML email, Settings send button)*

---

## Session: June 2026 — v6.9t YouTube SEO Brief Generator

### What was built

#### YouTube SEO Brief Generator ✅
Full YouTube SEO package generated on demand by Claude — no external APIs needed beyond Claude.

**Inputs:**
- Brand (Pickl / Bonbird)
- Target keyword
- Video type: Restaurant Review / How-To / Location Guide / Behind the Scenes / Food Showcase

**Outputs (5 structured sections):**
1. **Video Titles** — 3 options, each under 60 chars, keyword front-loaded
2. **Video Description** — 600–800 words with chapters/timestamps, keyword-rich, CTA, hashtags
3. **Tags** — 25 YouTube tags (exact match, category, location variants, brand, related)
4. **VideoObject Schema** — JSON-LD `VideoObject` ready to embed in WordPress
5. **Content Outline** — production-ready for video creator: hook (15s), 4–5 sections with talking points + B-roll suggestions, outro CTA

Each section has a **📋 Copy** button.

**UI — AI Content Studio tab:**
- New `🎥 YouTube SEO Brief` card in the studio grid (scrolls to section below)
- Full-width `#youtube-seo-section` below the tool grid: brand + keyword + video type + Generate button
- Results rendered by `renderYouTubeBrief()` — scrollable preview per section
- `ytCopySection()` — copies section text to clipboard

**JS functions added (`index.html`):**
- `generateYouTubeBrief()` — builds Claude prompt, calls `/api/claude` with `max_tokens: 3000`
- `renderYouTubeBrief(text, keyword)` — parses `## SECTION` headers from Claude response, renders structured output
- `ytCopySection(btn, key)` — clipboard copy per section

**No new Netlify function** — calls `/api/claude` directly (same pattern as other AI Content Studio tools).

*Last updated: June 2026 — v6.9t: YouTube SEO Brief Generator (5-section output: titles, description, tags, VideoObject schema, content outline; Copy buttons per section)*

---

## Session: June 2026 — v6.9u Content Calendar

### What was built

#### Content Calendar ✅
Full social media content operations platform — plan, review, approve and schedule posts across all brands and markets.

**Post lifecycle:**
```
draft → in_review → changes_requested ↔ in_review → approved → scheduled → published
```

**New files:**
- `netlify/functions/calendar.js` — full CRUD + approval workflow
- `netlify/functions/calendar-media.js` — image upload (base64 → Netlify Blobs) + serve

**netlify.toml:** `/api/calendar` + `/api/calendar-media` redirects added

**New Blobs keys:**
| Key | Contents |
|---|---|
| `calendarPost:<id>` | Full post object (brand, market, platforms, caption, media refs, approvals, comments, history) |
| `calendarIndex:<brand>` | Array of post IDs for each brand (max 1000) |
| `calendarMedia:<mediaId>` | Binary image data |
| `calendarMediaMeta:<mediaId>` | `{ filename, mimeType, size, postId, uploadedAt }` |

**New nav tab: 📅 Content Calendar** (between The Perch and Approvals Queue)
- Badge (purple) shows pending approval count for current user
- Brand / Market / Platform / Status filters
- Month navigation (← June 2026 →)
- Month grid view + List view toggle

**Post object structure:**
- Brand + market + platforms (multi-select)
- Post type: Reel / Carousel / Story / Static Image / Copy Only
- Scheduled date + time
- Caption (with live character counter per platform limits)
- Hashtags (separate field)
- Visual Notes (for designer — what should the post show)
- Media files: drag-and-drop image upload (JPEG/PNG/GIF/WebP, max 5MB each) with preview grid
- Video URL field (YouTube/Drive/OneDrive links for large video files)
- Required Approvers (multi-select from managers/admins)
- Assigned To

**Uploader UX (social team):**
- `+ New Post` button or click any calendar day to create
- Right-side slide-in panel (520px) — full form with file upload zone
- Platform pills (colour-coded, multi-select): Instagram / TikTok / Facebook / X / LinkedIn / YouTube
- Character counter updates per platform limits (X=280, LinkedIn=3000, Instagram=2200 etc.)
- `Save Draft` or `Submit for Review` (requires at least one approver)
- Drag-and-drop or click-to-browse image upload with instant preview thumbnails

**Approver UX (managers/admins):**
- Badge on nav shows how many posts need YOUR approval
- Post detail slide-in panel (580px) shows full media carousel, caption, hashtags, visual notes
- Approver list shows who has approved (✓) vs still pending (…)
- `✅ Approve` green button — if all required approvers have approved → status becomes Approved
- `💬 Request Changes` red button → inline comment textarea → sends to creator with Slack notification
- `✓ Resolve` on comments to clear change requests

**Admin/Manager post-approval actions:**
- `📤 Push to SocialPilot` — calls SocialPilot API, sets status to Scheduled (requires `SOCIALPILOT_API_KEY` env var)
- `✅ Mark Published` — manual status update

**Comment thread:**
- Any user can add comments at any time
- Change requests appear with red left border
- Admins/creators can resolve comments

**API endpoints in `calendar.js`:**
- `GET ?brand=&month=YYYY-MM` — list posts
- `GET ?id=` — single post
- `GET ?pending_approver=<email>` — badge count (posts needing this user's approval)
- `POST { action: create/update/submit/approve/request_changes/comment/resolve_comment/delete/push_socialpilot/mark_published }`

**Slack notifications sent for:**
- `calendar_review_needed` — when post submitted for review (pings each required approver)
- `calendar_changes_requested` — when approver requests changes (pings assignee)
- `calendar_approved` — when all approvers have approved (pings creator)

**Platform config:**
| Platform | Char Limit | Colour |
|---|---|---|
| Instagram | 2,200 | #E1306C |
| TikTok | 2,200 | #010101 |
| Facebook | 63,206 | #1877F2 |
| X (Twitter) | 280 | #000000 |
| LinkedIn | 3,000 | #0A66C2 |
| YouTube | 500 | #FF0000 |

**Markets per brand:**
- Pickl: UAE, KSA, Bahrain, Qatar, Egypt, Jordan, Oman
- Bonbird: UAE, Oman, Pakistan, Qatar, UK
- Southpour: UAE
- Shadowburg: UAE
- Shadowbird: UAE

**⚠️ Adding a new market — REQUIRED steps:**
1. Add market to `CAL_MARKETS` in `index.html`
2. Add IANA timezone to `MARKET_TIMEZONES` in `netlify/functions/calendar.js`
3. Add IANA timezone to `CAL_MARKET_TIMEZONES` in `index.html`
4. Add timezone abbreviation to `CAL_MARKET_TZ_ABBR` in `index.html` (or `null` for DST-aware like UK)
5. Add SocialPilot account IDs to `SP_ACCOUNTS` in `calendar.js`
Without steps 2–3, SocialPilot will receive the wrong UTC timestamp. Full IANA list: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones

**Required env vars (new):**
| Variable | Purpose |
|---|---|
| `SOCIALPILOT_API_KEY` | SocialPilot API — push approved posts to scheduling queue |

**Note on videos:** Videos > ~4MB can't be base64-uploaded through Netlify functions. Use the Video URL field (YouTube/Google Drive/OneDrive) for video content. Image uploads work for all standard social images (1–4MB).

---

## Session: June 2026 — v6.9v Content Calendar Upgrade

### Changes
- **Shadowburg + Shadowbird added to Content Calendar** — both brands now appear in filter dropdown and form brand select; markets: UAE for both
- **Post-type-specific upload UX** — form media section is now fully dynamic based on selected post type:
  - `copy_only` — no media fields shown
  - `static` — single image upload (1:1 or 4:5 ratio tip)
  - `story` — single vertical image (9:16 · 1080×1920px tip)
  - `reel` — video URL as primary required field (Google Drive / OneDrive / YouTube link), optional thumbnail upload
  - `carousel` — numbered slide manager: add up to 10 slides, each with image upload + caption note + up/down reorder buttons
- **Carousel slide ordering** — `calState.carouselSlides[]` tracks ordered slides; `mediaFiles` saved in correct order; existing carousel posts load slides correctly on edit
- **Presentation / Review Mode** — "📊 Present" button in calendar header opens full-screen dark overlay:
  - All non-draft posts for current brand+month shown as slides
  - Slide navigation (← → buttons + keyboard arrow keys + Escape to close)
  - Slide shows: status badge, platform pills, post type, scheduled date/time, media (carousel numbered), caption, hashtags, visual notes
  - Right panel: full comment/feedback thread for each post, "Add Note" sends comment to post's thread
  - Bottom thumbnail strip — click to jump to any post
  - "🖨 Export PDF" — prints all posts as clean white-background slides via window.print()
- `calState` extended with `carouselSlides`, `presentIdx`, `presentPosts`
- `updateCalMediaSection()` wired to post type `<select>` onchange so media section rebuilds live

*Last updated: June 2026 — v6.9v: Content Calendar upgrade — Shadowburg/Shadowbird brands, post-type-specific upload UX (carousel/reel/story/static/copy_only), carousel slide ordering, Presentation Mode with comment thread + PDF export*

---

## Session: June 2026 — v6.9ae Calendar Polish + SP MCP Live

### SocialPilot MCP Integration (live)
- Direct post scheduling via `https://mcp.socialpilot.co/{API_KEY}/mcp` (JSON-RPC 2.0)
- Supported: static image, carousel (multi-image), text/copy-only
- NOT supported by SP MCP: Reels, Stories, TikTok videos, YouTube videos (SP confirmed)
- Reel/Story posts blocked at push with clear error message → use CSV export instead
- Tool: `CreatePost` with `type`, `image.images[]`, `text.postDescription`, `loginIds[]`, `scheduleDateTime` ("YYYY-MM-DD HH:mm"), `shareType: 3`
- `SOCIALPILOT_API_KEY` from SP Settings → Profile → Security → API Key

### Calendar workflow changes
- **Submit Calendar** replaces "Submit All Drafts" — submits all drafts + sends ONE Slack summary notification (not per-post)
- Per-post Slack on submit removed — too noisy
- Slack still fires for: approved (fully), changes_requested
- **Approved posts** can now be edited: "Edit & Re-submit" button reverts to draft, clears approvals
- **Approve All** in Presentation Mode — confirmation list required, only for in-review posts
- Perch is now always the default tab on load (calendar brand restores from localStorage)
- Brand selection persists on calendar refresh
- Platform validation: can't save/submit without selecting at least one platform
- Carousel Slack preview: shows first slide image + "Carousel · N slides" context

### New calendar.js actions
- `submit_calendar` — bulk submit + one Slack notification
- `revert_to_draft` — reset approved/in-review post to draft, clear approvals

### New Blobs
No new Blobs keys this session.

*Last updated: June 2026 — v6.9ae: SP MCP live (image/text/carousel), scheduler quality fixes, calendar workflow polish*

---

## Session: June 2026 — v6.9af–v6.9ag Data-Driven SEO + International Fix

### v6.9af — Data-driven international SEO
- `international-seo-background.js` rebuilt to mirror main scheduler logic
- `runMarketDataDrivenSEO()` — same CTR gap analysis as UAE, scoped per market's URL pattern
- `marketPageMatcher()` — handles both flat (`/egypt`, `/egypt-menu`) and nested (`/egypt/`) URL structures
- `keywordMatchesMarket()` — rejects keywords about different markets (e.g. "cairo" keywords won't appear for `/ksa/` pages)
- `keywordMatchesMenu()` — same dish validation as main scheduler
- Data-driven analysis runs every week (no 7-day cache); seed keyword blog content retains 7-day cache
- Falls back gracefully when GSC has insufficient data for a market
- Imports `fetchGscWithPages` (keyword+page pairs) instead of `fetchGscDirect`

### v6.9ag — Keyword Discovery Engine + Deep Audit Intelligence

**Why this was built:** Deep Audit was a read-only report with a manual Queue button. Scheduler only reacted to GSC data (keywords already ranking). Neither discovered what to target proactively.

**Keyword Discovery Engine (`keyword-discovery-background.js`):**
- Takes menu items as seeds → DataForSEO Labs `keyword_ideas` → finds what people search for
- Cross-references with GSC (our current positions) and competitorRankedKeywords (what competitors rank for)
- Filters: off-menu dishes rejected, competitor brand names rejected, market mismatch rejected
- Scores: volume × CPC weight × gap vs competitor × reachability
- Tiers: content_gap / push / quick_win / top10 / top3
- Stores as `keywordOpportunities:<brand>` in Blobs
- Runs Monday 4am UTC (same as all Monday crons)

**`keyword-opportunities.js` API:**
- `GET ?brand=pickl` → scored opportunity list
- `GET ?brand=pickl&audit=domain.com` → audit enriched with our GSC positions per keyword
- `POST { brand }` → triggers fresh discovery immediately

**Deep Audit enhanced:**
- Shows "Opportunity Analysis" for every keyword: their position vs our position vs tier
- Tier badges: 🚀 Gap / 📈 Push / ⚡ Win / ✅ Already ranking
- "Queue All Opportunities (N)" button — one click queues all gaps

**Target Keywords dashboard:**
- New "🎯 Keyword Opportunities" pill in Analytics & ROI tab
- Scored opportunity list filterable by tier
- "Refresh Now" triggers DataForSEO discovery on demand

**Scheduler integration:**
- `runContentGapsWithOpportunities()` injects top content_gap/push keywords from keywordOpportunities into seed list before each run

### New Blobs keys
| Key | Contents |
|---|---|
| `keywordOpportunities:<brand>` | Scored keyword opportunity list from DataForSEO discovery |

### New env vars
None — uses existing `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`

### New netlify.toml entries
- Redirect: `/api/keyword-opportunities` → `/.netlify/functions/keyword-opportunities`
- Cron: `keyword-discovery-background` schedule `"0 4 * * 1"` (Monday 4am UTC)

*Last updated: June 2026 — v6.9ag: data-driven keyword strategy, international SEO rebuilt, deep audit intelligence*

---

## Session: June 2026 — v6.9ah Analytics Fixes

### Changes
- **Backlinks placeholder** — when below $100/month DataForSEO threshold, shows realistic greyed-out placeholder data (referring domains, backlink counts, competitor comparison) with a clear banner explaining the requirement and a link to top up. Placeholder is clearly marked as non-live data.
- **Competitor matrix empty state** — instead of blank table, shows last run timestamp + explains Monday cron may have failed + inline Refresh Now button
- **Keyword opportunities empty state** — guides user to fix competitor matrix first, then run discovery (explains dependency)
- **Deep audit ReferenceError fix** — `enrichedKws` was declared after it was used (`let` throws ReferenceError before initialization). Fixed: render table immediately with raw data, then enrich with gap analysis asynchronously in background without blocking the UI

### DataForSEO plan notes
- **Backlinks API**: requires $100/month minimum balance commitment — not included in standard pay-per-use
- **DataForSEO Labs**: pay-per-use from standard balance, no minimum — `ranked_keywords/live`, `keyword_ideas/live`, `keyword_suggestions/live` all accessible
- **SERP Standard**: pay-per-use — `serp/google/organic` task_post + task_get

*Last updated: June 2026 — v6.9ah: analytics fixes, backlinks placeholder, competitor matrix empty state, deep audit ReferenceError*

---

## Session: June 2026 — v6.9ai DataForSEO Polling Overhaul

### What changed and why

**Problem:** `competitor-matrix-background.js` was using per-task polling every 5 seconds.
With 107 tasks × 120 attempts = up to 12,840 individual API calls per run.
When DataForSEO is slow (evening/peak hours), this was costing ~$1.50/run instead of pennies.

**Fix:** Switched to `tasks_ready` endpoint which returns ALL completed task IDs in a single call.
Then we only fetch results for tasks that are actually ready. ~95% cost reduction.

**New approach:**
- POST all tasks → get task IDs
- Every 30s: call `tasks_ready` (one API call) → get list of completed task IDs
- Fetch results only for newly-ready tasks
- Max 20 checks = 10 minutes total

**Old approach (for reverting if needed):**
```javascript
// Old polling constants (competitor-matrix-background.js)
const POLL_INTERVAL_MS   = 5000;   // 5 seconds between each batch of polls
const POLL_MAX_ATTEMPTS  = 120;    // max 10 minutes

// Old poll loop: checked each pending task individually every 5s
while (pending.size > 0 && attempts < POLL_MAX_ATTEMPTS) {
  attempts++;
  await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  for (const taskId of [...pending]) {
    const res = await fetch(`${DATAFORSEO_GET_URL}/${taskId}`, ...);
    // parse result, remove from pending if done
  }
}
```

To revert: restore the old polling constants and loop. Remove `DATAFORSEO_READY_URL` and the `tasks_ready` while loop.

**Functions updated:**
- `competitor-matrix-background.js` — was worst offender (107 tasks × 120 attempts)
- `ai-overview-background.js` — updated to tasks_ready with 20s intervals

**Functions NOT updated (polling cost already negligible):**
- `citations.js` — 1 task, 18 attempts max
- `scheduler-background.js` CPC enrichment — 1 task, 24 attempts max
- `backlinks-background.js` / `backlinks.js` — requires $100/month balance, irrelevant

**DataForSEO tasks_ready endpoints:**
- SERP: `https://api.dataforseo.com/v3/serp/google/organic/tasks_ready`
- Keywords data: `https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/tasks_ready` (not yet used)

*Last updated: June 2026 — v6.9ai: tasks_ready polling, competitor matrix blob overwrite fix, backlinks placeholder*

---

## Session: June 2026 — v6.9aj Story/Reel Manual Post Fixes

### Three fixes

#### Fix 1: CSV export excludes Story + Reel ✅
`index.html` — `buildSpCsvRows()`:
- Added early `continue` for `postType === 'story'` or `postType === 'reel'` — these types are silently skipped from the generated CSV rows since SocialPilot bulk import doesn't support them
- `exportSPCsvSingle()` now shows an error toast immediately if called on a story/reel post, rather than generating an empty CSV

#### Fix 2: Story/Reel approved state — "Post Manually" instructions ✅
`index.html` — approved action bar in `renderCalDetail()`:
- Added `isManualPost` check: `postType === 'story' || postType === 'reel'`
- If true: replaces Push to SocialPilot + Export CSV buttons with an amber info box showing:
  - Post type label (Story / Reel)
  - Scheduled date + time
  - Platforms to post on
  - Video URL link (if set)
  - Explanation: "Stories and Reels can't be auto-scheduled via SocialPilot — post directly in the app."
  - Only "✅ Mark Published" and "✏️ Edit & Re-submit" buttons remain
- If false (static/carousel/copy_only): existing Push to SocialPilot + Export CSV buttons unchanged

#### Fix 3: Slack reminder when Story/Reel is due today ✅
`perch-notify-background.js` (runs daily 5am UTC = 9am Dubai):
- Before the Perch due-date check, now loops all brands' `calendarIndex:<brand>` posts
- Filters: `status === 'approved'` + `postType` in `['story','reel']` + `scheduledDate === today`
- If any found: POSTs `calendar_manual_reminder` to slack-notify with the full posts array

`slack-notify.js`:
- New notification type: `calendar_manual_reminder` → `buildCalendarManualReminder()`
- Shows: header "📱 Manual post due today", one line per post (brand/market/platforms/time/video link), context note, "Open Content Calendar" button

---

## Session: June 2026 — v6.9ak Overnight UX Audit + Improvements

### What was audited
Full codebase review for cohesiveness, missing features, and UX gaps. Priority issues identified and fixed in this session.

### Changes Made

#### Content Calendar: Caption Search ✅
`index.html` — filter bar:
- New search input `🔍 Search captions…` between status filter and month nav
- `renderCalendar()` filters by caption, hashtags, and market (client-side, no API call)
- Empty state shows "No posts match X — clear search" link when search is active

#### Content Calendar: Select All in List View ✅
`index.html` — `renderCalList()`:
- Header row with select-all checkbox and post count shown above date groups
- `toggleCalSelectAll(checked)` — checks/unchecks all `.cal-list-cb` items, syncs `calState.selectedPosts`
- `clearCalSelection()` centralised helper — clears set, unchecks all boxes including select-all

#### Content Calendar: Bulk Reschedule ✅
`netlify/functions/calendar.js` — new `bulk_reschedule` action: updates scheduledDate + scheduledTime for all IDs, writes history per post

`index.html` — list bar:
- "📅 Reschedule" button always shown when posts selected
- Inline form expands below bar: date + time inputs + Apply/Cancel
- `bulkCalAction('reschedule')` calls backend, shows "X posts moved to YYYY-MM-DD at HH:MM"

#### Content Calendar: Bulk Action Improvements ✅
- All buttons disabled during inflight (`setCalBulkBusy()`) — prevents double-submit
- Delete: tracks per-item failure, reports "3 deleted · 1 failed" if partial
- Submit: reports skipped count
- CSV export toast: shows story/reel excluded count

#### Content Calendar: Post Type Icons in Month Grid ✅
- Pills show emoji prefix: 🎬 Reel, 📱 Story, 🎠 Carousel, 📝 Copy Only
- Approved story/reel pills get gold outline to flag manual posting needed
- Tooltip includes post type

#### Content Calendar: Post Type Badge in List View ✅
- Type icon + label shown in each row's metadata strip
- "📱 Post manually" amber badge on approved story/reel rows

#### Content Calendar: List View Loading State ✅
- `cal-list-body` now shows "Loading…" during fetch (was blank/stale before)

#### The Perch: Label Filter ✅
- New "All Labels" dropdown with all 8 label types
- `renderPerchBoard()` updated with `labelF` filter: `(t.labels||[]).includes(labelF)`
- Combines with all existing filters

---

## Session: June 2026 — v6.9al Queue + Perch + Calendar UX

### Changes Made

#### Approvals Queue: Multi-select + Bulk Dismiss ✅
`index.html`:
- Checkbox added to every approval card (`.queue-cb`, `data-id`)
- `state.queueSelected: new Set()` tracks checked IDs
- `toggleQueueSelect(id, checked)` — adds/removes from set, calls `updateQueueSelectBar()`
- `updateQueueSelectBar()` — shows/hides "Dismiss Selected (N)" button in queue header
- `dismissSelected(btn)` — dismisses only checked items, reports done/failed, clears selection
- `renderQueue()` now clears `queueSelected` + hides the button on every re-render (prevents stale state after filter change)
- "Dismiss Selected (N)" button sits next to existing "Dismiss Visible" — two distinct operations

#### The Perch: Text Search ✅
`index.html` — filter bar:
- New `🔍 Search tasks…` input (`perch-search`) before label dropdown
- `renderPerchBoard()` filters by `title` and `description` (case-insensitive, client-side)
- Combines with all other filters (brand, dept, assignee, priority, label, My Tasks)

#### Content Calendar: "My Posts" Quick Filter ✅
`index.html`:
- "👤 My Posts" button added next to view toggle in filter bar
- `calState.myPostsOnly: false` flag on calState
- `toggleCalMyPosts()` — toggles flag, updates button styling (primary when active), calls `renderCalendar()`
- `renderCalendar()` filters by `createdBy === state.userEmail || assignedTo === state.userEmail`
- Mirrors "My Tasks" button on The Perch for consistent UX

---

## Session: June 2026 — v6.9am Calendar Filters + AI Caption Generator

### Changes Made

#### Content Calendar: Post Type Filter ✅
`index.html` — filter bar:
- New "All Types" dropdown (🖼 Static / 🎠 Carousel / 🎬 Reel / 📱 Story / 📝 Copy Only)
- `renderCalendar()` filters by `(p.postType || 'static') === typeFilter`
- Combines with all other filters (status, platform, My Posts, search)

#### Content Calendar: Error State Fix ✅
`loadCalendar()` error handler:
- Now clears `calState.posts = []` and sets `loaded = false` on API failure
- Shows error + "retry" link in both month grid AND list view (was only grid before)
- Prevents stale data persisting in list view after a failed reload

#### Content Calendar: AI Caption Generator ✅
`index.html` — calendar post form:
- "✨ Generate with AI" button on Caption label opens inline modal below the caption textarea
- User describes the post topic; Claude generates a caption + hashtag suggestions
- Reads brand, market, post type, and active platforms from the form context
- Splits response into caption (fills `cf-caption`) and hashtags (fills `cf-hashtags`)
- `openCalCaptionModal()` — toggles the modal, focuses topic input
- `generateCalCaption()` — calls `/api/claude`, parses HASHTAGS: delimiter, fills form fields
- Modal closes automatically on success; error shown inline without losing typed topic
- Bridges AI Content Studio and Content Calendar — no need to switch tabs

---

## Session: June 2026 — v6.9an Bulk Copy to Market

### Changes Made

#### Content Calendar: Bulk "Copy to Market" ✅
`index.html`:
- "🌍 Copy to Market" button added to list bar (always visible when posts selected, alongside Reschedule)
- `toggleCalCopyForm(show)` — shows/hides inline form below bar; populates market checkboxes from `CAL_MARKETS[calState.brand]`, excludes the currently filtered market
- Opening Copy form closes Reschedule form (and vice versa) — only one inline form visible at a time
- `bulkCalAction('copy_market')` — reads checked markets, calls existing `copy_to_markets` action per selected post, aggregates total drafts created
- Toast: "X drafts created across Market1, Market2"
- `setCalBulkBusy()` updated to include `cal-bar-copy` button
- `updateCalListBar()` now also shows/hides copy button (always visible when selection > 0)
- No backend changes — reuses existing `copy_to_markets` action in `calendar.js`

---

## Session: June 2026 — v6.9ao Perch Overdue Filter + Column Sort

### Changes Made

#### The Perch: Overdue Filter Button ✅
`index.html`:
- "⚠️ Overdue" toggle button added to filter bar (mirrors "My Tasks" styling)
- `perchOverdue: false` flag on module scope
- `togglePerchOverdue()` — toggles flag, updates button to red when active
- `renderPerchBoard()` filters: `t.dueDate && new Date(t.dueDate).getTime() < Date.now() && t.status !== 'done'`
- Works alongside all other filters (brand, dept, search, label, My Tasks, etc.)

#### The Perch: Column Sort ✅
`index.html`:
- Sort dropdown added to filter bar: Default / Priority ↑ / Due date ↑ / Due date ↓ / Newest first
- `renderPerchBoard()` sorts `perchFiltered` array after filtering, before column rendering
- Sort order: Priority (high→medium→low→none), Due date ascending/descending (nulls last/first), Created descending
- Drag-and-drop still works — sort reorders the render, not the stored task order

---

## Session: June 2026 — v6.9ap Calendar Today Button + Queue Sort

### Changes Made

#### Content Calendar: "Today" Navigation Button ✅
`index.html`:
- "Today" button added next to month nav arrows (hidden when already on current month)
- `calGoToToday()` — resets `calState.year/month` to current date, calls `updateCalMonthLabel()` + `loadCalendar()`
- `updateCalMonthLabel()` now shows/hides the Today button based on whether current month matches today

#### Approvals Queue: Sort Dropdown ✅
`index.html` — queue header:
- Sort dropdown with options: Default order / Voice score ↑ / Position (best first) / Impressions ↑ / By brand
- `renderQueue()` applies sort after filtering, before rendering cards
- Voice score reads `payload.voiceScore`; position reads `payload.currentPos || payload.ranking`; impressions reads `payload.impressions`
- Non-destructive — uses `[...items].sort()` so original state.queue order preserved

---

## Session: June 2026 — v6.9aq Filter UX + Badge Fix

### Changes Made

#### Content Calendar: Live Badge Update ✅
`loadCalendar()` now calls `loadCalendarBadge()` after every successful data fetch — nav badge updates after approve/submit/delete without requiring a page refresh or tab switch.

#### Content Calendar: Active Filters Bar + Clear All ✅
`index.html`:
- `#cal-filter-bar` appears below filter row when any filter is active
- Shows "Filtered: status · type · My Posts · "search term" · N posts shown"
- "✕ Clear filters" link resets all filter inputs + My Posts toggle, re-renders
- `clearCalFilters()` — resets status/platform/type/search dropdowns, calls `toggleCalMyPosts()` if active

#### The Perch: Active Filters Bar + Clear All ✅
`index.html`:
- `#perch-filter-bar` appears below filter row when any filter is active
- Shows "Filtered: brand · dept · priority · assignee · label · "search" · Overdue · My Tasks"
- "✕ Clear filters" link resets all dropdowns + toggle buttons, re-renders
- `clearPerchFilters()` — resets all 7 filter inputs + both toggle flags + button styles

---

## Session: June 2026 — v6.9ar Dashboard Calendar Metric Card

### Changes Made

#### Dashboard: "Posts Awaiting Approval" Metric Card ✅
`index.html`:
- 4th metric card added to the dashboard metrics grid: "📅 Posts Awaiting Approval"
- Populated by `loadCalendarBadge()` which already runs on page init + after every calendar load
- Shows count + "Needs your review →" (amber) or "All clear ✓" (muted)
- Card is clickable — navigates to Content Calendar tab
- Zero extra API calls — piggybacks on the existing `pending_approver` endpoint call

---

## Session: June 2026 — v6.9as AI Caption Generator: Vision Support

### What changed

`generateCalCaption()` in `index.html`:
- **Fixed messages format** — was incorrectly using `{ prompt }` field; now sends proper `messages: [{ role: 'user', content: [...] }]` array to match what `claude.js` expects
- **Vision support** — before generating, checks for an uploaded image in the form:
  - Static/story: reads `cf-image-url` input value
  - Carousel: reads `calState.carouselSlides[0].url` (first slide)
  - If image URL found: fetches it (same-origin, includes credentials), converts to base64 via FileReader, builds `{ type: 'image', source: { type: 'base64', ... } }` content block
  - If image fetch fails: silently falls back to text-only generation
- **Prompt adapts**: when image is present, prompt instructs Claude to look at what's visible and write a specific, image-grounded caption ("specific, not generic"). Without image, prompt is generic-topic based as before.
- **Status indicator**: shows "🖼 Using image · generating…" when vision mode is active, "Generating…" for text-only
- **Model**: updated to `claude-sonnet-4-6` (was using old `claude-sonnet-4-20250514`)

---

## Session: June 2026 — v6.9at AI Caption Generator: All Carousel Slides

### What changed

`generateCalCaption()` in `index.html`:
- Carousel posts now send ALL slides (not just the first) as separate image blocks
- `rawUrls` built from `calState.carouselSlides.map(s => s.url)` when postType is carousel
- Each URL fetched independently; failures skipped silently
- Prompt updated with slide count context: "this is an N-slide carousel — slides 1 through N in order"
- Prompt instructs Claude to "reference the visual journey across the slides"
- Status shows "🖼 Using N images · generating…" for multi-slide carousels

---

## Session: June 2026 — v6.9au Model Updates + Caption UX Polish

### Changes Made

#### Model string: claude-sonnet-4-6 everywhere ✅
Updated 4 stale `claude-sonnet-4-20250514` references to `claude-sonnet-4-6`:
- `index.html` — AI Content Studio tools (review responder, schema gen, etc.)
- `netlify/functions/approvals.js` — rewrite-with-AI calls
- `netlify/functions/claude.js` — fallback model in the API proxy
- `netlify/functions/international-seo-background.js` — `MODEL` constant

#### AI Caption Generator: Visual Notes auto-populate ✅
`openCalCaptionModal()`:
- When the caption modal opens, if the topic field is empty AND the "Visual Notes" field has content, the topic is pre-filled with those notes
- Only pre-fills when topic is empty — won't overwrite if user has already typed something
- Visual Notes field ID: `cf-visual-notes` (confirmed in form HTML)

---

## Session: June 2026 — v6.9aw Competitor Analysis + Claude Keyword Filter + Matrix Save Fix

### Changes Made

#### Competitor Analysis — Full Audit Expansion ✅
`netlify/functions/competitor-audit.js` — full rewrite:
- **On-page crawl**: fetches competitor homepage HTML, extracts title, meta description, H1, H2s (first 6), schema markup presence, canonical tag, mobile viewport, HTTPS, approx word count
- **PageSpeed**: runs PageSpeed Insights API (mobile + desktop) — score, LCP, CLS, TBT. Uses existing `GOOGLE_PAGESPEED_KEY` env var
- **Brand selector**: accepts `brand: 'pickl' | 'bonbird' | 'both'` — GSC positions loaded for selected brand(s). When 'both', each keyword row shows two "Our Pos" columns
- **Audit history**: stores last 10 audited domains in `auditHistory` Blobs key. GET `?history=1` returns the list
- All three data sources (keywords, page crawl, PageSpeed) run in parallel via `Promise.all`
- New Blobs key: `auditHistory` — `[{ domain, brand, fetchedAt }]` max 10 entries

`index.html` — audit UI:
- **Renamed** "Deep Audit" → "Competitor Analysis" (more accurate)
- **Brand selector** dropdown: Pickl / Bonbird / Both Brands
- **Audit history** — clickable past domain pills appear below form; click to re-load
- `loadAuditHistory()` — fetches and renders history list; called when panel opens
- `loadAuditFromHistory(domain, brand)` — pre-fills form and loads cached result
- `renderAuditResults()` — rewritten to show PageSpeed cards, on-page signals checklist (HTTPS ✓/✗, Mobile ✓/✗, Schema ✓/✗, Canonical ✓/✗), title/description/H1/H2s, then keyword table
- Keyword table: "Our Pos" column(s) now use `k.ourPos.pickl` / `k.ourPos.bonbird` from new data structure

#### Keyword Discovery — Claude Relevance Filter ✅
`netlify/functions/keyword-discovery-background.js`:
- Removed static `isRelevantToMenu()` function and `OFF_MENU_DISHES` hardcoded list
- New `filterKeywordsWithClaude(keywords, brandName, brandCtx)`:
  - Sends all DataForSEO keyword ideas to Claude in one batch (single API call)
  - Prompt includes brand name + menu summary
  - Claude returns array of relevant index numbers
  - Logs: "Claude filter: 200 → 45 keywords" 
  - Falls back to full list if Claude call fails
- Import path updated: `callClaude` and `extractJson` from `_lib/store`
- Volume threshold lowered from 20 to 10

#### Competitor Matrix — Save Button Reset ✅
`js/competitor-matrix-ui.js`:
- After successful save (keywords or competitors), button auto-resets to "Save Changes" (enabled, amber) after 3 seconds
- Save bar hides after 3 seconds so user can keep adding without page reload
- Applies to both Manage Keywords and Manage Competitors tabs

### New Blobs Key
| Key | Contents |
|---|---|
| `auditHistory` | Array of last 10 audit runs: `{ domain, brand, fetchedAt }` |

---

## Roadmap Item: International Keyword Opportunities

**Discussed:** June 2026 session — postponed, to be built next.

**What it is:** Extend the Keyword Discovery Engine to run per international market, not just UAE. Currently `keyword-discovery-background.js` only discovers opportunities for UAE (location code `2784`).

**Plan:**
- Run `dataforseo_labs/google/keyword_ideas/live` per market using per-market location codes (same codes already defined in `MARKET_LOCATIONS` in keyword-discovery-background.js)
- Cross-reference ideas against each market's GSC data (Pickl's international pages are all on the same GSC property `https://eatpickl.com/` — filter by URL path e.g. `/bh/`, `/ksa/`, `/qatar/`)
- Score and tier per market (same logic as UAE)
- Store as `keywordOpportunities:<brand>:<market>` in Blobs
- Add market selector to the Keyword Opportunities tab in Analytics (currently brand-only)

**Markets to cover:**
- Pickl: Bahrain (17000), KSA (2682), Qatar (179), Egypt (2818), Jordan (2144), Oman (2114)
- Bonbird: Oman (2114), Pakistan (2586), Qatar (179)

**Existing location codes** already defined in `keyword-discovery-background.js` `MARKET_LOCATIONS` constant — just need to loop over them.

**GSC filtering for international pages:** use `fetchGscWithPages` (already in `_lib/store.js`) and filter by market URL pattern — same approach as `international-seo-background.js` uses `marketPageMatcher()`.

---

## Session Corrections & Clarifications (June 2026)

### SocialPilot — Correct Current State
**v6.9ae incorrectly describes SP MCP as "live for image/text/carousel".** Actual state:
- All post types (static, carousel, copy-only, reel, story) use **CSV export** for SocialPilot Bulk Import
- The "Push to SocialPilot" MCP button still exists in the code but is not the primary workflow
- Reels and Stories show "Post Manually" instructions (no CSV/push) — Instagram limitation, not SocialPilot
- Daily 9am Slack reminder fires for approved Reels/Stories scheduled that day

### AI Overview Tracker — Shows 0, Not Broken
The tracker (Reports tab) correctly returns 0 AI Overviews triggered because **Google has not rolled out AI Overviews for UAE restaurant search queries**. Searched "smash burger dubai" and similar queries from Canada — no AI Overview boxes appear. This is expected behaviour, not a bug. The tracker will start showing data if/when Google expands AI Overviews to UAE local food searches.

### "My Posts" Toggle — Removed
Added in v6.9al, **removed in v6.9av**. Reason: calendar already has brand/market/status/type/search filters; "My Posts" was redundant for social content (unlike Perch tasks which are personally assigned).

### DataForSEO Labs Location Code Fix (June 2026)
All DataForSEO **Labs** endpoints (`ranked_keywords/live`, `keyword_ideas/live`) require **country-level** location codes, not city-level:
- Wrong: `21191` (Dubai city) — silently returns 0 results from Labs
- Right: `2784` (UAE country)
- SERP Standard (`task_post`) correctly keeps `21191` — city code is valid there
- Fixed in: `competitor-audit.js`, `competitor-matrix-background.js` (Labs calls only), `keyword-discovery-background.js`

### Keyword Discovery — Field Path Fix (June 2026)
`keyword_ideas/live` uses **flat** field paths (confirmed by DataForSEO support):
- Filter: `keyword_info.search_volume` (NOT `keyword_data.keyword_info.search_volume`)
- Item reading: `item.keyword`, `item.keyword_info`
`ranked_keywords/live` correctly uses `keyword_data.keyword_info.search_volume` — different endpoint, different schema.

### Roadmap Item: International Keyword Opportunities
Run keyword discovery per international market (not just UAE). Location codes already defined in `MARKET_LOCATIONS`. Store as `keywordOpportunities:<brand>:<market>`. Add market selector to Keyword Opportunities tab. Full plan documented in separate roadmap entry above.

---

## Session: June 2026 — v6.9ax AI Overview Tracker Fix + SETUP.md Corrections

### AI Overview Tracker — Conversational Queries Fix ✅
`netlify/functions/ai-overview-background.js`:

**Root cause:** Tracker was only checking short GSC head terms ("best fried chicken dubai") which rarely trigger AI Overviews. AI Overviews fire on **conversational, decision-intent queries** ("where can i find the best fried chicken in dubai"). Confirmed by screenshot showing Bonbird mentioned in AI Overview for the conversational query.

**Fix — Mixed keyword set (20 total, same cost):**
- Top 10 non-branded GSC keywords (existing, marked `source: 'gsc'`)
- 10 curated conversational queries per brand (new, marked `source: 'conversational'`)

**Conversational queries added:**
- Pickl: "where can i find the best burger in dubai", "what is the best burger restaurant in dubai", "best smash burger restaurant in dubai" + 7 more
- Bonbird: "where can i find the best fried chicken in dubai", "what is the best fried chicken restaurant in dubai" + 8 more

**Brand mention detection improved:**
- Replaced `extractAiOverviewText()` with `extractAiOverviewContent()` — now extracts text AND walks cited source domains/URLs recursively
- Brand match: checks text content OR own domain in cited sources (catches cases where brand appears as cited link but not in text body)

**UI:** Conversational query rows show a purple "conversational" badge in the keyword column

### SETUP.md Corrections Applied
- SocialPilot: all types use CSV export (not MCP direct push)
- AI Overview tracker: shows 0 because short keywords don't trigger AIs Overviews — now fixed with conversational queries
- "My Posts" toggle: documented removal (was added v6.9al, removed v6.9av)
- DataForSEO Labs location code fix: `21191` → `2784` for all Labs endpoints
- Keyword field path fix: `keyword_ideas` uses flat paths, `ranked_keywords` uses `keyword_data.*`
- International keyword opportunities: roadmap item documented

---

## The Nest — Aligned Platform Vision (June 2026)

### Core Principle
The Nest is a closed-loop marketing operations platform. Every insight triggers a recommended action. Every action is routed to the right place. Every result feeds back into the next insight cycle. Currently strong on insights, weak on the insight→action bridge and action→result attribution.

### The Three Layers
- **Layer 1 — Intelligence** (what's happening) ✅ Strong
- **Layer 2 — Action Engine** (what to do, routed automatically) 🔧 Building
- **Layer 3 — Attribution** (did it work, what's the ROI) 📅 Planned

---

### Priority Build Queue

#### 🔴 P0 — Build Now (highest daily impact)

**Action Engine**
Every insight module generates Claude-evaluated recommended actions ranked by impact + effort. Each action routes to the right destination:
- AI can execute → Approvals Queue (blog, meta, page, schema)
- Human creativity needed → The Perch (task pre-briefed, assigned to right person)
- Technical implementation → Developer Kanban (issue described)
- Social opportunity → Content Calendar (draft pre-filled)
- Video opportunity → AI Content Studio (YouTube brief pre-generated)
Confidence tiers: high-confidence → auto-queue; low-confidence → Perch with Claude's reasoning attached.
Loop closes: 4 weeks after action, system checks if metric moved.
Feeds from: Competitor Analysis, Keyword Opportunities, LLM Mentions, AI Overview, PageSpeed, GSC ranking drops, International gaps.

**Competitor Auto-Discovery**
`dataforseo_labs/google/competitors_domain/live` on eatpickl.com / bonbirdchicken.com.
Returns competing domains ranked by keyword overlap score.
Shows in TWO places: Competitor Matrix → Manage Competitors (for ongoing tracking) + Competitor Analysis (as quick-select cards, click to run full audit).
Replaces manual competitor entry for discovery. Manual form stays for adding known domains.

**Fix International — Data First, Permissions Later**
- Competitor matrix: run per market with market-specific location codes
- Deep audit: accept market param, use correct location code for that market
- Keyword discovery: run per market (already in roadmap)
- Claude prompts: inject market context explicitly — Claude should know /bh/ = Bahrain, /ksa/ = Saudi Arabia etc. from URL structure + brand context. No spoon-feeding needed.
- International content: flows through main Approvals Queue filtered by market flag, not a separate tab
- International SEO tab becomes: Market Configuration hub (set up markets, configure access, per-market performance) — not a content pipeline

**CEO Monthly Business Review (PPTX + Email)**
Auto-generated presentation for leadership:
- What we accomplished (rankings gained, content published, AI presence)
- Traffic value in AED with trend
- Competitor movement
- Opportunities identified vs actioned
- Forward-looking: what's queued for next month
Different from the existing PDF export (that's a data report). This is a narrative business review.
Delivered as email (CEO) + PPTX file. Same data, leadership-ready format. No personal bias.

#### 🟡 P1 — Build Next

**Social Performance Pull-Back**
Pull engagement data (likes, comments, shares, reach, saves) back into The Nest after a post publishes.
Best time to post per brand/market from historical performance.
Content mix insights: "carousels getting 3x saves vs reels — shift the mix."
Campaign groups: bundle posts, see campaign-level performance.

**Local SEO — Full Circle**
GBP → Local SEO connection: GBP is the #1 local pack ranking signal. Local pack = map results above organic. GBP completeness, review velocity, posting frequency, photo freshness all affect local pack position directly.
GBP posts from The Nest (offers, new items, events) — same approval workflow as social.
Review management (once GBP API lands — highest team time saved).
Zomato/TripAdvisor ratings tracker with competitor benchmark.

**Per-Market Keyword Opportunities**
Already documented as roadmap item. Run keyword_ideas/live per market with market location codes.

**Content ROI / Goal Tracking (Reports tab)**
Every published piece shows traffic contribution.
Goal tracking: "60 keywords in top 10 by Q4 2026" — progress bar.
Channel comparison: SEO vs paid vs social per brand.

#### 🟢 P2 — Build Later

**Weekly Intelligence Brief**
RECOMMENDATION (not building now): Monday Slack + email covering wins, watch items, opportunities queued, competitor moves, posts due for manual posting. Decision: not needed yet, don't clutter leadership. Revisit when team is larger.

**Competitor Content Monitoring**
When Salt/Shake Shack publish new pages or blog posts, The Nest knows. Slack alert.
New competitor alerts: "Hammer Burgers entered top 10 for 4 of your keywords — add to tracking?"

**Brand Health — Sentiment + Context**
When mentioned in AI responses: is it positive/neutral/negative?
What context: "best burger" vs "popular chain" — brand positioning signal.
Press/media monitoring: TimeOut, What's On coverage of competitors but not us → Perch task for content team.

**The Perch — Team OS Upgrades**
Auto-task creation from insights (ranking drops, competitor moves → Perch tasks).
Recurring task templates.
Workload view per team member.
Task dependencies.
Sprint view.

**SocialPilot Replacement (Long-term)**
Direct publishing via platform APIs (Meta Graph, TikTok, LinkedIn, YouTube).
Phase 1: Facebook (easiest). Phase 2: Instagram static. Phase 3: Stories/Reels (Instagram API limitation, not SocialPilot).
International markets get market-scoped calendar access: can create/submit, UAE team approves/schedules.
Permissions mirror SocialPilot's model but inside The Nest.

**Multi-Brand Operations**
Brands are distinct — different voice, different menu, different competitors.
One-click new brand setup inheriting all pipelines.
Cross-brand calendar view for simultaneous campaigns (optional).

---

### On AI Content Quality
The CEO not liking content = brand voice examples need more real writing. The brand voice examples feature exists (Settings → Brand Voice Examples). More real approved content pasted in → Claude's output sounds less AI. This is the primary lever. The platform is doing the right thing architecturally — the training data needs enriching.

On AI judgment calls: failures so far (keyword filter, wrong location codes) were prompt engineering + config failures, not fundamental AI limitations. Fix: confidence tiers (high-confidence → auto-queue, low-confidence → Perch with reasoning attached for human review).

---

### Competitor Domains — Corrected (June 2026)
| Brand | Competitor | Old Domain | Correct Domain |
|---|---|---|---|
| Pickl | Salt | saltuae.com | No website — removed |
| Pickl | High Joint | highjoint.co | No website — removed |
| Pickl | Shake Shack | shakeshack.com | shakeshackme.com |
| Pickl | Five Guys | fiveguys.ae | fiveguys.ae ✓ |
| Bonbird | Raising Cane's | raisingcanes.com | raisingcanesme.com |
| Bonbird | Jailbird | jailbirddubai.com | jailbird.co |
| Bonbird | Dave's Hot Chicken | daveshotchicken.com | daveshotchicken.com ✓ (no UAE site) |
| Bonbird | Toit | toitchicken.com | toit.vercel.app |
| Bonbird | Nash Hot Chicken | nashhotchicken.com | Removed (no active web presence) |
| Bonbird | Peppers | peppersuae.com | Removed (no website found) |
| Bonbird | Jollibee | jollibee.com.ph | jollibeeuae.com |
| Bonbird | KFC | kfc.com | uae.kfc.me |
| Bonbird | Popeyes | popeyes.com | popeyesuae.com |
| Bonbird | Texas Chicken | — | uae.texaschicken.com (NEW) |
| Bonbird | Black Tap | — | Added via UI by user |

---

## Session: June 2026 — v6.9ba Competitor Auto-Discovery

### What was built

#### Competitor Auto-Discovery ✅
`netlify/functions/competitor-matrix.js`:
- New route: `GET ?discover=1&brand=pickl|bonbird`
- Calls `dataforseo_labs/google/competitors_domain/live` on eatpickl.com / bonbirdchicken.com
- Location code: 2784 (UAE country)
- Filters: intersections > 5 shared keywords, order by intersections desc, limit 20
- Strips aggregators, social media, delivery platforms from results
- Returns: domain, shared keyword count, their total keywords, avg position
- No caching — live call so user always gets fresh data

`js/competitor-matrix-ui.js` — Manage Competitors view:
- New "Auto-Discover" panel above manual add form
- "Discover Pickl" / "Discover Bonbird" buttons trigger live DataForSEO call
- Results show as cards: domain, shared keyword count, "Already tracked" or "+ Add" button
- `cmDiscoverCompetitors(brand, btn)` — fetches and renders discovery results
- `cmAddDiscoveredCompetitor(brand, domain, btn)` — loads current config, appends, saves via competitor-config endpoint
- Display name auto-derived from domain (e.g. `jailbird.co` → "Jailbird")

`index.html` — Competitor Analysis panel:
- New "KNOWN COMPETITORS — click to audit" section above audit history
- Loads all configured competitors from competitor-config endpoint
- Deduplicated across brands
- Click any → pre-fills domain input and runs audit immediately
- `loadAuditHistory()` updated to also load known competitors

---

## Session: June 2026 — v6.9bb Action Engine (Competitor Analysis)

### What was built

#### Action Engine — Competitor Analysis ✅
The first implementation of the interconnected vision: every insight generates recommended actions routed to the right place.

`netlify/functions/competitor-audit.js`:
- New `POST { action: 'recommend', domain }` handler
- `generateRecommendations(auditData)` — builds a concise summary of keyword gaps (top 15) and technical gaps (schema, HTTPS, mobile, canonical, PageSpeed delta), sends to Claude
- Claude returns structured JSON array of 5-7 recommendations, each with:
  - `title`, `finding`, `action`, `impact` (high/medium/low), `effort` (low/medium/high)
  - `route`: "queue" (AI can execute) | "perch" (human creativity needed) | "dev" (technical implementation)
  - `keyword` (if applicable), `department` (for Perch routing)
- Results sorted by impact + effort score (high impact + low effort → top)

`netlify/functions/tech-tasks.js`:
- Added `POST` support — creates a developer kanban task from the Action Engine
- Fields: title, description, brand, priority, source ('action_engine')

`index.html`:
- `renderAuditResults()` renders "Recommended Actions" section immediately (with spinner)
- Triggers `POST /api/competitor-audit { action:'recommend' }` asynchronously after audit renders
- `renderAuditActions(recs, domain, brand)` — renders recommendation cards with impact/effort badges and route button
- `executeAuditAction(route, title, action, finding, keyword, brand, btn)` — one-click execution:
  - **queue**: adds keyword/title to seed list → next Monday's content pipeline
  - **perch**: creates Perch task (POST /api/perch) with finding + action pre-filled
  - **dev**: creates Developer Kanban task (POST /api/tech-tasks) with finding + action pre-filled
- Button turns green "✓ Done" on success, toast confirms destination

### Route Logic
- `queue` → blog posts, meta rewrites, landing pages → AI drafts, appears in Approvals Queue
- `perch` → campaigns, social series, strategic decisions → The Perch task, assigned to team
- `dev` → PageSpeed, schema, canonical, HTTPS, mobile → Developer Kanban in Technical SEO

---

## Session: June 2026 — v6.9bc Gaps Cleanup

### Changes Made

#### Competitor Ranked Keywords — Restaurant Relevance Filter ✅
`netlify/functions/competitor-matrix-background.js`:
- Added `isRestaurantKeyword(keyword)` function — checks against `FOOD_TERMS` (burger, chicken, fries, wrap, dining, delivery, etc.) and `LOCATION_TERMS` (dubai, abu dhabi, marina, near me, etc.)
- Applied as third filter in ranked_keywords processing: `!isBrandedKeyword && isRestaurantKeyword`
- Rejects keywords like "nearest western union", "cities in riyadh", "time in nyc" instantly with no API cost
- Free, fast alternative to Claude — catches 95%+ of irrelevant competitor keywords

#### Gaps View — "+30 more" Now Expandable ✅
`js/competitor-matrix-ui.js`:
- Changed static "+N more keywords" text to a clickable "Show N more keywords ▾" button
- Hidden rows (`display:none`) revealed by `cmShowAllGaps(compKey, btn)` on click
- Show more row hides itself after expanding
- Cache bust: ?v=6.9av → ?v=6.9bc needed in index.html script tag

#### Keyword Opportunities — Claude Filter Already Deployed
The improved Claude filter prompt (v6.9az) is live. Hit **Refresh Now** in Keyword Opportunities tab to regenerate with the new filter. Old cached data won't update automatically.

---

## Session: June 2026 — v6.9bd Competitor Config Auto-Migration

### What was built

#### Competitor Config Auto-Migration ✅
`netlify/functions/competitor-config.js` — full update:
- `DEFAULT_COMPETITORS` updated to correct UAE domains
- `DOMAIN_MIGRATIONS` map: old domain → correct domain (null = remove)
- `migrateCompetitors()` runs on every GET call — if stored config has old domains, silently fixes them and saves corrected config back to Blobs
- Preserves user additions (Black Tap etc.) — only touches domains in the migration map
- Texas Chicken added to Bonbird defaults

**Migrations applied automatically:**
- saltuae.com → removed (no website)
- highjoint.co → removed (no website)
- shakeshack.com → shakeshackme.com
- raisingcanes.com → raisingcanesme.com
- jailbirddubai.com → jailbird.co
- toitchicken.com → toit.vercel.app
- nashhotchicken.com → removed
- peppersuae.com → removed (no website)
- jollibee.com.ph → jollibeeuae.com
- kfc.com → uae.kfc.me
- popeyes.com → popeyesuae.com

No user action needed — runs automatically on first load after deploy.

#### Other fixes in this batch
- Removed "fine dining" from restaurant relevance filter (not relevant for Pickl/Bonbird)

---

## Session: June 2026 — v6.9be Keyword Config Auto-Fix

`netlify/functions/keyword-config.js`:
- On GET, if stored keywords < 15, auto-merges with defaults and saves back
- Fixes the case where 6 menu-item keywords overwrote the full 30+ default list
- Triggered by opening Manage Keywords tab (or any call to /api/keyword-config)

---

## Session: June 2026 — v6.9bf International Intelligence Layer

### What was built

#### Claude Prompt — Better International Context ✅
`netlify/functions/_lib/international-config.js` — `buildMarketPrompt()`:
- Explicit URL structure rule: "URL /bh/ = Bahrain market, NOT UAE page"
- Clear directive: "Write ONLY for [Market] — do not reference UAE, Dubai, or other markets"
- "What this market needs from content" section with specific requirements per market
- Confirmed locations section: "never invent location names"
- New export: `MARKET_LOCATION_CODES` — `marketKey → location_code` for any function to use

#### Competitor Analysis — Market-Aware ✅
`netlify/functions/competitor-audit.js`:
- Accepts `market` param: `POST { domain, brand, market: 'pickl_bahrain' }`
- Uses `MARKET_LOCATION_CODES[market]` for DataForSEO Labs location code
- Cache stored per domain+market: `competitorAuditCache:domain:pickl_bahrain` vs UAE default

`index.html` — Competitor Analysis form:
- "MARKET" dropdown alongside brand selector — all 9 markets + UAE
- Results header shows market: "vs Pickl · Bahrain · DataForSEO Labs"

#### Competitor Matrix — Market-Aware ✅
`netlify/functions/competitor-matrix-background.js`:
- `loadBrandConfig()` accepts optional `marketKey`
- When market specified: uses market `location_code` + market seed keywords
- Cache stored per market: `competitorMatrix:pickl:pickl_bahrain`
- Handler accepts `?market=pickl_bahrain` query param

`netlify/functions/competitor-matrix.js`:
- Read endpoint accepts `?market=pickl_bahrain` → reads market-specific blob

`js/competitor-matrix-ui.js`:
- Market dropdown in toolbar (🇦🇪 UAE / 🇧🇭 Bahrain / 🇸🇦 KSA / etc.)
- `currentMarketFilter` state, `cmMarketChanged()` global handler
- `setMarket()` exposed on `window.competitorMatrix` for cross-scope access
- Refresh Now and poll URLs include market param when non-UAE selected

#### Gaps Tab Bug Fix ✅
`js/competitor-matrix-ui.js` line ~775:
- Bug: `comp.replace(/\W/g,'_')` in the show-more row — `comp` was undefined in this scope
  (loop variable is `{ domain, brand, name, keywords }`, not `comp`)
- Fix: use `(name||domain).replace(/\W/g,'_')` via IIFE to derive the key correctly
- This was causing a TypeError that made the Gaps tab fail to render entirely

---

## Session: June 2026 — v6.9bg Brand Voice Auto-Fix + Page Creation Preview

### Changes Made

#### Brand Voice Auto-Fix Before Queue ✅
`netlify/functions/_lib/brand.js`:
- New `fixBrandVoice(content, voiceCheck, brandCtx, callClaudeFn)` function
- Called when voice score is 5-7 (warning zone) — attempts targeted rewrite of specific issues
- Keeps all facts, structure, SEO keywords identical — only fixes tone and phrasing
- Re-scores the fixed version; if improved, uses fixed content; if not, uses original
- Falls back gracefully if Claude call fails

Applied in:
- `scheduler-background.js`: quick_wins, content_gaps, page_creation all get auto-fix step
- `international-seo-background.js`: blog drafts get auto-fix step

**New flow:**
- Score < 5 → reject (unchanged)
- Score 5-7 → auto-fix → re-score → if improved queue fixed version; if still 5-7 queue with warning; if drops below 5 reject
- Score 8-10 → queue green (unchanged)

#### Page Creation Preview — Matches Blog Draft ✅
`index.html` — `buildPreview()` for `page_creation` type:
- Replaced clunky `<details>` with 200px max-height and 1200-char truncation
- Now shows: Title, Meta Description, Target Keyword + slug, Excerpt
- "📄 Read Full Content (~X words)" button — same as blog_draft
- Voice note amber warning (same as other types)
- Removed raw content dump

#### Roadmap Update
- Delivery Platform SEO: deprioritised (can't track app-internal ranking, only listing health)
- Brand Voice Interview: covered by existing Settings → Brand Context + Brand Voice Examples
- Southpour: part of one-click brand setup build (site is now live)

---

## Session: June 2026 — v6.9bh Per-Market Keywords + International Hub + Action Engine

### Manual triggers needed after this deploy
- Competitor Matrix → Manage Competitors tab (triggers domain migration) → then Refresh Now
- Keyword Opportunities → Refresh Now (new Claude filter + market-aware)  
- AI Overview → Reports tab → Refresh Now (conversational queries)

### Per-Market Keyword Discovery ✅
`netlify/functions/keyword-discovery-background.js`:
- `discoverKeywords()` accepts optional `marketKey` param
- International: uses `market.seedKeywords.en` + market location_code instead of UAE
- GSC cross-reference filters by market URL path (e.g. rows with `/bh/`)
- Stores as `keywordOpportunities:pickl:pickl_bahrain`
- Handler: runs UAE + all international markets for each brand on Monday cron
- Supports `?market=pickl_bahrain` for single-market manual trigger

`netlify/functions/keyword-opportunities.js`:
- GET supports `?market=pickl_bahrain` → reads market-specific blob
- POST accepts `{ brand, market }` → passes market to background trigger

`index.html` — Keyword Opportunities tab:
- Added market dropdown (🇦🇪 UAE / all 9 international markets)
- All load/refresh calls pass market param
- Action column: content_gap shows "📝 AI" + "📋 Perch" buttons; push/quick_win shows "📝 Queue"
- `queueOppKeyword()` — adds to seed list
- `perchOppKeyword()` — creates Perch task for content team

### International SEO Tab → Market Hub ✅
`index.html` — `loadIntlDashboard()`:
- Now fetches: approval counts, GSC rankings per market (matched by URL path), keyword opportunity summaries
- All 9 markets loaded in parallel

`renderIntlDashboard()`:
- Cards show 3 metrics: Top 10 rankings, Keyword Opportunities, Queued items
- 4 action buttons per card: ▶ Run, 📋 Queue (view approvals), 🎯 Keywords (opens KW Opps for this market), 🔍 Audit (opens Competitor Analysis pre-filled with market)
- `intlOpenKwOpps(brand, marketKey)` — switches to Analytics, sets brand + market filter, loads opportunities
- `intlOpenAudit(brand, marketKey)` — switches to Analytics → Competitor Analysis, pre-fills brand + market

### Action Engine — Keyword Opportunities ✅
Opportunity table: content_gap rows now show two action buttons:
- 📝 AI → queues keyword to content pipeline (Monday run)
- 📋 Perch → creates Perch task assigned to content team with keyword context
Push/quick_win rows show single 📝 Queue button.

---

## Session: June 2026 — v6.9bi Goal Tracking + Action Engine on Queue

### Goal Tracking ✅
`index.html` — Settings tab:
- New "🎯 SEO Goals" card with per-brand goal configuration
- Fields: Keywords in Top 10 (+ deadline), Monthly Traffic Value AED (+ deadline), AI Overview appearances, Content approved per month
- Goals stored via `/api/db/save` as `seoGoals:pickl` and `seoGoals:bonbird`
- `loadGoalSettings()` — loads on Settings open, pre-fills form
- `saveGoalSettings()` — saves with confirmation toast

`index.html` — Reports tab:
- New "🎯 Goals & Progress" card rendered at top of report when goals configured
- `renderGoalsCard(goals, top10, trafficValue, aiOverview, contentApproved)` — shows progress bars for each goal with on-track indicator
- Data sourced from already-calculated report metrics (no extra API calls)
- AI Overview count fetched from existing `/api/ai-overview` endpoint
- "Edit goals in Settings" link

### Action Engine on Approvals Queue ✅
`index.html` — `buildContextBar()`:
- New "Expected Impact" cell appended to context bar
- Only shown when: position > 10 AND impressions available
- Calculation: daily impressions × 30 × (targetCTR - currentCTR)
  - Close-in (pos 11-20): target top 5 CTR = 5%
  - Deeper (pos 21+): target top 10 CTR = 3%
- Shows: "+X clicks/mo if reaches top N · AED Y/mo" (AED only if CPC data available)
- Gives approvers clear impact context before reviewing content

---

## Session: June 2026 — v6.9bj Reports Cohesion Fixes

### Reports Tab — Three Cohesion Fixes

#### Competitor Gaps → Narrative Business Impact ✅
Was: duplicate table identical to Analytics Gaps view
Now: narrative summary per competitor — "Salt owns 12 keywords you don't rank for. Top gap: 'smash burger dubai' — they rank #3, you're not in top 30" — with total count and "View full gap analysis + queue keywords →" link to Analytics

#### Opportunities → Linked to Keyword Opportunities ✅
Was: clickable cards with no path to take action beyond the drill-down
Now: header now includes "Full keyword analysis →" link directly to the Keyword Opportunities tab in Analytics. Cards remain unchanged — they work well as a summary.

#### AI Overview + LLM Mentions → Single "AI Search Presence" Card ✅
Was: Two separate cards both using 🤖, titled differently, telling the same story
Now: One "🤖 AI Search Presence" card with two sub-sections:
- "Google AI Overviews — do our keywords trigger the AI box?"
- "AI Chatbot Mentions — do ChatGPT, Perplexity, Gemini recommend us?"
Single Refresh button in the header. Same data, clearer narrative.

Note: Technical SEO Developer Kanban stays separate from The Perch — developer is a third party, not an internal team member. That separation is intentional and correct.

---

## Session: June 2026 — v6.9av PDF + Cache + Competitor Matrix Fixes (undocumented until now)

- **PDF Export fixed**: `@media print` overrides set `overflow:visible` + `height:auto` on body/main-content/views-wrapper — was clipping to one viewport
- **Competitor matrix script cache bust**: `?v=6.9n` → `?v=6.9av` (June 8 UI changes were invisible to browsers)
- **Error visibility**: background job now stores `lastError` + `lastErrorAt` in `competitorMatrix:<brand>` blob on failure — empty state shows exact DataForSEO error + link to check balance
- **"My Posts" toggle removed from calendar**: was redundant given brand/market/status/type/search filters already cover the use case

## Session: June 2026 — removeCalMedia bug fix

- `removeCalMedia(mediaId, fromExisting)` function was missing entirely — clicking × on a calendar post's uploaded image thumbnail would throw a ReferenceError
- Added: hides the DOM element and removes matching slide from `calState.carouselSlides`

---

## Roadmap: Slack Bot OAuth (build later)

**What it enables:** Direct Slack DMs when someone is @mentioned in a calendar post comment, instead of a channel notification.

**What's needed:**
1. Create Slack App with Bot User OAuth scopes: `chat:write`, `users:lookupByEmail`
2. Add `SLACK_BOT_TOKEN` env var in Netlify
3. When `calendar_mention` fires: call `users.lookupByEmail` with mentioned user's Yolk email → get their Slack user ID → `chat.postMessage` to DM them directly

**Current state:** Mentions send to the main webhook channel. The recipient's name is shown prominently so they can find the notification. Direct DMs require Slack Bot setup (~20 min in Slack App dashboard + env var).

---

## Session: June 2026 — v6.9bl Bug Fixes + Market Permissions + Slack URL Fix

### Bug Fixes

#### Priority Gap = 0 in Reports ✅
Root cause: `state.seedKeywords` was never populated from the API — always undefined → always 0.
Fix: load seed keywords via `/api/seed-keywords` in `loadReports()` before calling `renderReports()`.
Also fixed: count was `seedKws.length` (total seeds) — should be `gapRows.length` (seeds not yet in GSC).

#### Keyword Opportunities — Better Diagnostics ✅  
Empty state now shows:
- Last run timestamp
- How many ideas DataForSEO returned vs how many survived Claude filtering
- Actionable diagnosis: "DataForSEO returned 0 ideas — check balance/location" or "Claude filtered all as irrelevant — check brand context in Settings"
- Tier filter active: shows "No X keywords — try All Tiers" without Run Discovery button

### Slack Calendar URL — Brand + Market ✅
`netlify/functions/calendar.js`:
- `submit_calendar` action now builds URL: `/?tab=calendar&brand=pickl&market=Jordan`
- Was: `/?tab=calendar` (opened calendar with no brand/market context)

`index.html`:
- On load, if `?tab=calendar&brand=X&market=Y` params present: switches to calendar, sets brand/market dropdowns, loads correct view
- Reviewer lands on the exact brand+market calendar that was submitted for review

### Market-Level User Permissions ✅
**New:** Users can now have a `markets` array restricting them to specific international markets.

`netlify/functions/auth-user.js`:
- Returns `markets` field from userProfile

`netlify/functions/user-management.js`:
- POST and PUT both accept and store `markets` array (null = unrestricted)

`index.html`:
- `state.userMarkets` set on login (null = all markets)
- Add User modal: market checkboxes for all 9 international markets
- `populateCalMarkets()`: filters market dropdown to user's allowed markets
- Approvals Queue: hides items outside user's allowed markets
- For international-only colleague: set markets to all 9 international keys, they won't see UAE

**Use case:** International social media manager can only see/create Pickl and Bonbird international market content.

---

## Session: June 2026 — v7.1.9 — Nav restructure + Analytics & Reports unified view

### Nav restructure: 11 tabs → 8 tabs
- Section labels renamed: Workspace → Create, Analytics → Analyse, SEO → Maintain, Tools stays
- Removed `Reports`, `International SEO`, `How It Works` nav items
- Renamed `Analytics & ROI` → `Analytics & Reports` (ti-chart-dots icon)
- `?` button added to top header for How It Works access
- Legacy tab names (`reports`, `international`) remapped in `switchView()` to `analytics`

### Analytics & Reports unified view
- Replaced pill-based flat layout with overview cards landing + underline tabs
- 6 overview cards (Rankings, Competitors, Opportunities, Backlinks, Markets, Report) — click to drill in
- 6 underline tabs with `← Overview` back button
- Rankings tab: GSC table + brand filter pills (All/Pickl/Bonbird)
- Competitors tab: Competitor matrix + Deep audit tool
- Opportunities tab: Keyword opportunities with brand/market/tier filters
- Backlinks tab: Referring domain monitoring
- Markets tab: International market grid (moved from old International SEO view) — brand + market filters
- Report tab: Full SEO report (moved from old Reports view) — export PDF, AI presence, GA4, pipeline
- `renderAnalyticsCards()` renders dynamic overview cards; called on GSC load and view open
- `switchAnalyticsTab(tab, btn)` and `showAnalyticsOverview()` drive the tab state
- `intlOpenKwOpps()` / `intlOpenAudit()` deep-links updated to use new tab API
- Report cross-links updated to `switchAnalyticsTab('opportunities')` / `switchAnalyticsTab('competitors')`
- Performance Summary card updated to dark green (was Tailwind slate blue)
- Hreflang Generator moved to AI Content Studio as Card 5

### Previous session below
## Session: June 2026 — v7.1.8 — Full UI/UX redesign + smart index pruning + dedup limit fix

### Design system overhaul (index.html)
- Replaced entire CSS with a Linear-inspired design system: Yolk teal accent (`#1BBFA3`), always-dark sidebar (`#0D1F1C`), zinc neutrals for light/dark main content
- Added Inter font (Google Fonts) + Tabler Icons CDN — proper icon library replacing emoji nav items
- Design tokens: `--accent`, `--accent-subtle`, `--accent-text`, shadow scale (xs/sm/md/lg/modal), radius scale (sm/base/lg/xl/full), full dark mode via `[data-theme="dark"]`
- Sidebar: always-dark with teal active state, left-border accent, section labels (Workspace / Analytics / SEO / Tools), Tabler icon per nav item
- Light/dark toggle button in sidebar footer — persists to localStorage
- Buttons: unified `.btn` base class + `.btn-primary/.btn-outline/.btn-ghost/.btn-danger/.btn-sm/.btn-lg` — removed all `onmouseover/onmouseout` inline hover hacks
- Cards: `0.5px` borders (more refined), `var(--shadow-sm)` lifted shadow
- Pills: teal active state, full border-radius
- Avatar: teal background with white initial
- User role badge + name label: extracted to CSS classes, removed inline styles
- Metric cards: uppercase label, tighter spacing, teal `metric-sub` colour
- Tables: `bg-subtle` header background, consistent `0.5px` borders
- All calendar status pills, Kanban columns, form inputs, modals, toasts updated to use design tokens

### Smart index pruning (approvals.js)
- Replaced hard 500-item cap (was silently dropping published items from dedup) with smart pruning: dead items (rejected/failed) older than 30 days get deleted from Blobs; pushed/published/pending kept forever
- Max index raised to 2000 entries before pruning kicks in

### Dedup window fix (scheduler-background.js)
- `getQueuedKeywords` + `getQueuedPages` limit raised 200 → 500 — prevents already-published keywords re-entering the queue after ~3–4 Monday runs

---

## Session: June 2026 — v7.1.7 — Edit Draft modal button fix

### Correct button logic per item type (index.html)
- **meta_update and other non-draft types**: single button — "Save & Publish Live" (meta goes live immediately on push, no WP draft state exists — old label "Save & Approve as Draft" was misleading)
- **blog_draft / page_creation / page_update**: two buttons — "Save → WP Draft" (edit_approve only) + green "Save & Publish Live" (edit_approve then publish in one step)
- `buildEditPayload()` extracted as a shared closure to avoid duplicating the form-field reading logic between both button handlers

---

## Session: June 2026 — v7.1.6 — Brand context injected into ALL Claude call sites

### Full audit of every Anthropic API call in the codebase

Previously: brand context (menu, tone, voice examples) was only injected by the Monday scheduler jobs. Three other call sites were generating brand-facing content with zero brand context — causing hallucinated menu items, wrong tone, made-up locations.

**Fixes:**

`scheduler-background.js` — `runPageCreation`:
- `brandPrompt` was passed as a parameter but never forwarded to the `callClaude` call
- Fix: `system: brandPrompt || buildBrandPrompt(brandCtx)` now passed — landing pages get full brand context

`approvals.js`:
- Added import: `const { getBrandContext, getBrandExamples, buildBrandPrompt } = require('./_lib/brand')`
- Local `callClaude` updated to support `opts.system` (previously only supported `maxTokens` integer — no system prompt support at all)
- `rewriteWithClaude` (reject + requeue path): now fetches brand context + examples, passes as system prompt to every rewrite
- `handleRewritePublished` (Edit & Re-push): switched from reading brandContext as raw Blobs text to using `getBrandContext` + `buildBrandPrompt` + `getBrandExamples` — same quality as scheduler

`reviews.js` — `draftResponse`:
- Added import from `_lib/brand`
- Now fetches brand context, builds system prompt via `buildBrandPrompt` before drafting review responses

**Already correct (no changes needed):**
- `scheduler-background.js` quick_wins, meta_rewrites, content_gaps — all inject brand context + examples ✅
- `international-seo-background.js` — all paths use `buildMarketPrompt(market, buildBrandPrompt(brandCtx))` ✅
- `gbp-reviews.js` — correct but behind early return (activates when API approved) ✅

---

## Session: June 2026 — v7.1.5 — Edit & Re-push for published items + refinements

### v7.1.5 — Core feature
Every Published & Tracking card has an "✏️ Edit & Re-push" button. Modal pre-fills current SEO title / meta description / focus keyword. Manual edit or AI fix (describe what's wrong → Claude generates corrected meta → review → push). New approvals.js actions: `rewrite_published` + `republish`.

### v7.1.5b — Smarter AI prompt + keyword lock + UI improvements
- Modal styling fixed: uses `btn-primary`/`btn-outline` classes + `var(--bg-surface)` — Generate Fix button was invisible (white on white)
- AI prompt rewritten: "fix ONLY what feedback describes, copy other fields verbatim" — previously Claude rewrote everything including the title when feedback only mentioned the description
- Focus keyword hardcoded in JSON instruction AND enforced server-side — Claude can never change it regardless of what it returns
- Keyword presence check: after AI generates, shows ✅/⚠️ badges for whether focus keyword appears in title and description

### v7.1.5c → superseded by v7.1.6
Brand context injection in `handleRewritePublished` was partially fixed here (raw text read from Blobs), then fully fixed in v7.1.6 using `buildBrandPrompt`.

---

### New feature: Edit & Re-push (approvals.js + index.html)
Every Published & Tracking card now has an "✏️ Edit & Re-push" button.

**What it does:**
- Opens a modal pre-filled with the currently stored SEO title, meta description, and focus keyword
- Char counters with green/red colour coding (50-60 title, 150-160 desc)
- Manual edit: directly change the fields and hit "Save & Re-push" to push to WordPress immediately
- AI fix: describe what's wrong in the "Fix with AI" textarea → Claude generates corrected meta → fields auto-fill for review before saving

**New actions in approvals.js:**
- `rewrite_published` — takes `{ id, feedback }`, calls Claude with current meta + feedback, returns `{ proposed: { metaTitle, metaDescription, focusKeyword } }`. Only runs on items with status pushed/published/failed. Includes Arabic rules when Arabic text detected.
- `republish` — takes `{ id, newTitle, newDescription, newFocusKeyword }`, calls `pushItem` with updated payload, patches item with `republishedAt` + history event. Returns `{ item, pushResult }`.

**Frontend (index.html):**
- `buildTrackingCard` now caches each item in `window._trackItems[id]` so modal can access it
- `openRepublishModal(id)` — builds modal, wires up char count listeners
- `generateRepublishFix(id)` — calls `rewrite_published`, fills form fields from response
- `saveRepublish(id)` — calls `republish`, closes modal, reloads Published & Tracking view

---

## Session: June 2026 — v7.1.4 — Fix Arabic meta translation + focus keyword fallback

### Arabic meta prompt fixed (international-seo-background.js)
- Added explicit Arabic rules: never translate brand names (Pickl/Bonbird stay as-is), never translate menu items literally ("smash burger" → "سماش برغر" not "لحم بقري مسحوق"), Gulf Arabic style not MSA, no use of "مسحوق" for burgers
- Focus keyword now falls back to first seed keyword if Claude doesn't return one

---

## Session: June 2026 — v7.1.3 — Fix meta_update writing card title instead of SEO title

### Root cause
- International pipeline (`queueApprovalItem`) sets `payload.title = item.title` (the card display name, e.g. "Meta update — Bahrain EN landing page") and stores the actual Claude SEO title in `payload.metaTitle`
- `buildSeoMeta` was only reading `payload.title` → was writing the display name to Rank Math/Yoast instead of the real SEO title
- Fix: `buildSeoMeta` now uses `p.metaTitle || p.title` for the SEO title, `p.metaDescription || p.description` for the description, `p.focusKeyword || p.targetKeyword` for the focus keyword
- Approval card and tracking card "What was published" updated to use same priority — shows correct SEO title for both international and scheduler items

### Navigation fix (index.html) — v7.1.2
- Clicking "All" or non-type pills while in Published & Tracking view exits back to approval queue
- Only type-specific pills (blog_draft, meta_update etc.) filter within published view

---

## Session: June 2026 — v7.1.2 — Navigation fix + Yoast/RankMath dual-plugin support

### Published & Tracking navigation fix (index.html)
- Clicking "All" or any non-type pill while in Published & Tracking view now correctly exits back to the approval queue
- Previously, any pill click while in published view was treated as a published-type filter — no way out without reloading
- Fix: only type-specific pills (blog_draft, meta_update, page_update etc.) filter within published view; "All" and other status pills always exit

### Yoast + Rank Math dual-plugin support (wordpress.js) — v7.1.1
- handleGetCurrentMeta: reads both rank_math_title and _yoast_wpseo_title, returns whichever has a value
- handleUpdateMeta write verification: checks both plugins' title keys, passes if either matches
- buildSeoMeta already writes to all three plugins simultaneously (no change)
- WP Code snippet: register all 6 meta keys (3 Yoast + 3 Rank Math) on both sites

### Known issue — KSA page bad SEO title
- Claude generated "Meta update — Saudi Arabia EN landing page" as the Rank Math SEO title for eatpickl.com/ksa/ — this was queued before the prompt fix
- Manually fix in WP admin → Rank Math SEO → update the title for the KSA page

---

## Session: June 2026 — v7.1.0 — Meta update overhaul: evaluation, before/after, write verification

### Meta update — Claude now evaluates before replacing (scheduler-background.js)
- Fetches current Yoast meta title + description from WordPress for every candidate page BEFORE calling Claude
- Claude prompt now includes current meta alongside GSC data and instructs Claude to skip pages where existing meta is already specific and on-brand
- Claude returns `skip: true` with a reason for pages that don't need changing — these are logged but not queued
- Only genuinely underperforming meta gets queued, reducing noise in the approval queue
- Scheduler result now includes `skipped` count alongside `queued`

### Meta update approval card — before/after comparison (index.html)
- When `payload.currentMeta` is present, shows a side-by-side red/green panel: current (what's in WordPress) vs proposed (Claude's replacement)
- Character counts shown on proposed title and description
- Page URL now shown as a clickable link
- Falls back to single-column display for older items without current meta

### Write verification on approve (wordpress.js + index.html)
- `handleUpdateMeta` now reads back the post after writing and checks if `_yoast_wpseo_title` was actually stored
- Returns `metaWritten: true/false` in push result
- If `metaWritten: false` — approve toast warns: "Yoast meta was NOT written — add the WP Code snippet"
- New `get_current_meta` action: fetches current Yoast title/desc/focuskw for a page by URL

### Meta update page-rename bug (wordpress.js) — v7.0.9
- Removed `updates.title = payload.title` from handleUpdateMeta — was overwriting WP post title with SEO title

### Fix: WP Code snippet required for Yoast REST API writes
- WordPress blocks writing protected meta keys (starting with `_`) via REST API by default
- Fix: add snippet via WP Code plugin on both bonbirdchicken.com and eatpickl.com
- Registers `_yoast_wpseo_title`, `_yoast_wpseo_metadesc`, `_yoast_wpseo_focuskw` for REST API with `edit_posts` auth

---

## Session: June 2026 — v7.0.9 — Meta update page-rename bug fix + tracking card content

### Meta update page-rename bug fixed (wordpress.js)
- `handleUpdateMeta` was setting `updates.title = payload.title` — payload.title is the SEO meta title (50-60 chars), NOT the WP post title
- This caused every approved meta update to rename the WordPress page to the SEO title
- Fix: removed `updates.title` line entirely — SEO title correctly goes only to `meta._yoast_wpseo_title` via `buildSeoMeta()`

### Published & Tracking — show what was published (index.html)
- `buildTrackingCard` now shows a "What was published" section above the movement indicator
- Meta updates: shows the SEO title and meta description that was written to WordPress
- Blog drafts: shows excerpt (or first 180 chars of body if no excerpt)

---

## Session: June 2026 — v7.0.8 — Copy-to-market fix + GSC page data + URL Inspection

### Copy-to-market bulk action fixed (index.html)
- Removed `confirm()` dialog that blocked the action during demos
- Replaced `.catch(() => null)` with proper per-post error tracking
- Now shows: "X drafts created across markets" / partial failure toast / "no new drafts" if all skipped / full error if all failed

### GSC page-level data (gsc-data.js)
- Added second parallel fetch with `dimensions: ['page']` alongside the existing keyword fetch
- Both run in parallel (Promise.all) — no added latency
- Cache now stores `{ rows, pages, cachedAt }` — `pages` array has url, clicks, impressions, ctr, position per URL
- API response now returns `{ rows, pages }`

### URL Inspection API in Monday cron (scheduler-background.js → trackPublishedItems)
- For items with `status === 'published'` (live, not WP draft), loads the published URL from `item.publishResult.ref` or `item.payload.url`
- Calls `POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect`
- Stores `item.indexStatus = { verdict, coverageState, lastCrawlTime, pageFetchState, url, checkedAt }` on the approval blob
- Token reused from `gscTokens` (already refreshed earlier in the same Monday cron run)
- Position tracking now also runs for items with no GSC data (previously skipped with `continue`) — item is saved regardless; position fields only added when data exists

### Index status badge on Published & Tracking cards (index.html)
- `buildTrackingCard` reads `item.indexStatus` and renders a coloured badge below the movement indicator
- ✅ Green: verdict PASS — "Indexed by Google · last crawled [date]"
- ❌ Red: verdict FAIL — "Not indexed · [coverageState]"
- ⏳ Yellow: verdict NEUTRAL — "[coverageState]"
- Published page URL (from `publishResult.ref` or `payload.url`) now shown as a clickable link

---

## Session: June 2026 — v7.0.7 — Priority Gap queuing + keyword filter fixes

### Priority Gap → Queue Brief (Reports tab)
- Clicking any gap keyword in the Reports drill-down now creates a `blog_draft` approval item
- Button disables on click, turns green "Queued ✓" on success, re-enables on error
- Item lands in approvals queue with `keywordTier: 'Priority Gap'` and `isSeedKeyword: true`

### Keyword Opportunities — filtering fixed (keyword-discovery-background.js)
- `OFF_MENU_DISHES` was defined but never called — dead code. Now wired up as `applyStaticFilter()`
- Expanded static blocklist: kung pao, tikka, curry, cheesecake, bakery, recipe, breakfast cereal, etc.
- Competitor keywords (`compKeywords`) previously bypassed all filtering — now run through static filter + Claude
- Claude prompt tightened: brand-specific off-menu guidance (Bonbird ≠ burgers), explicit UAE chain names to reject (pox chicken, j j chicken, dime burger, black tap, etc.), near-duplicate dedup rule
- Existing stale data in Blobs will refresh next Monday cron or via `?brand=pickl&force=true`

---

## Session: June 2026 — v7.0.6 — Reports tab crash fix

### Fixed Reports tab crash (TypeError: seedKws.filter is not a function)
- `renderReports` was reading `state.seedKeywords[brand]` which is `{ keywords: [], isDefault, updatedAt }` — an object, not an array
- Fixed: `state.seedKeywords?.[brand]` → `state.seedKeywords?.[brand]?.keywords`
- File: `index.html` line 4615

---

## Session: June 2026 — v7.0.5 — Yolk Brands in The Perch

### Added Yolk Brands to The Perch task board
- `BRAND_CONFIG` entry: `{ label: 'Yolk Brands', color: '#F5B800', bg: '#fffde7' }`
- `perch-filter-brand` dropdown includes Yolk Brands
- New Task modal brand dropdown includes Yolk Brands
- Side panel brand select auto-populates from `BRAND_CONFIG` (no extra change needed)

---

## Session: June 2026 — v7.0.3 + v7.0.4 — Yolk Brands Content Calendar

### Added Yolk Brands as a brand (calendar only)
- `--yolk: #F5B800` CSS variable added
- `BRAND_LABELS`, `CAL_MARKETS` (UAE), `SP_HAS_ACCOUNT`, `SP_ACCOUNTS_FLAT`, `SP_ACCOUNT_NAMES` entries added to `index.html`
- `cal-filter-brand` and `cf-brand` dropdowns include Yolk Brands
- `brandColor` ternaries updated so yolk uses `--yolk` not bonbird fallback
- `calendar.js` `allBrands` + `SP_ACCOUNTS` include yolk
- `user-management.js` `VALID_BRANDS` includes yolk
- SocialPilot IDs: Facebook `2445927`, Instagram `2445926`, LinkedIn `2445853`

---

## Session: June 2026 — v7.0.2 Bug-Fix Batch

### Fixes Applied ✅

**index.html:**
- `saveCalPost` TDZ crash: moved `const platforms` declaration before the `if (!platforms.length)` guard (every Save Draft / Submit was crashing immediately for all users)
- `removeCalMedia`: now also filters `calState.storySlides` — story slide state was never cleaned on media removal
- `dismissItem`: added null check on card element before calling `.classList.add` — prevented crash when card was already removed from DOM
- `calState` declaration: added `storySlides: []` initialisation alongside `carouselSlides: []`
- Reports tab GSC fallback: switched from `apiGet('/api/db/get')` (never returns gscCache) + GET to gsc-data (405) → uses `fetchGscRows(siteUrl)` (correct POST)
- `renderOpportunitiesTable`: added `const brand` declaration at function top — was causing "brand is not defined" crash in Keyword Opportunities tab
- `loadIntlDashboard`: switched from db-get (wrong) to `fetchGscRows()` for both brands
- `INTL_MARKETS`: added `marketSlug` property to all 9 entries — URL path matching for Top 10 rankings was always failing
- AI Readiness score: fixed display from `/6` to `/7`, updated thresholds

**competitor-matrix-ui.js:**
- Poll condition: changed `picklFresh && bonbirdFresh` to `(picklFresh || !data?.pickl) && (bonbirdFresh || !data?.bonbird)` — Refresh Now never resolved when one brand already had fresh data
- `getSovData`: fixed averaging — now divides per-domain sum by number of brands that have that domain, not a single shared counter; removed dead `count` variable
- `cmAddDiscoveredCompetitor`: removed dead `fetch` to `keyword-config` whose result was never used

**perch.js:**
- `canEditTask`: added `|| user.role === 'manager'` — managers were blocked from dragging/editing Perch tasks
- DELETE handler: added `store().delete('perchTask:' + id)` before index update — blob was accumulating forever on task deletion

---

## Session: June 2026 — v7.0.1 Story Slides + Caption UX + Upload Fixes

### Story Ordered Multi-Upload ✅
`index.html`:
- Stories now use `calState.storySlides = [{ url, type }]` — same ordered structure as carousel
- Story media section replaced with ordered slide manager: thumbnail, URL field, ▲▼ reorder, ✕ remove
- Each slide supports image OR video (9:16 vertical)
- `renderStorySlides()`, `addStorySlide()`, `removeStorySlide()`, `moveStorySlide()`, `uploadStorySlide()`
- On save: `postType === 'story'` → `mediaFiles = storySlides.filter(s=>s.url)` (backward compat: old single-image stories use imageUrl)
- AI caption generator reads story slide URLs like carousel slides
- Max 20 slides per story

### Static Image Remove Button ✅
- After upload, preview shows image with ✕ Remove button
- `clearCalImage()` clears `cf-image-url` and preview
- `updateCalImagePreview()` updated to include remove button

### AI Caption — Image Hint + Optional Topic ✅
- When modal opens and image is attached: shows "🖼 Image(s) attached — Claude will look at it" hint in green
- Topic field is optional when image is present ("optional if image attached" label)
- Requires topic OR attached image to generate (not both)
- Story slides included in image detection

### GCS Signed URL for Large Video Uploads ✅
`netlify/functions/calendar-media.js`:
- New `POST { action:'signedUrl', filename, mimeType }` → returns `{ uploadUrl, publicUrl }`
- Uses GCS resumable upload initiation — returns a direct-to-GCS upload URL
- **Requires GCS CORS to be configured on the bucket:**
  ```
  gsutil cors set cors.json gs://BUCKET_NAME
  ```
  cors.json: `[{"origin":["https://yolkseo.netlify.app"],"method":["PUT"],"responseHeader":["Content-Type"],"maxAgeSeconds":3600}]`

`index.html` — `uploadCalFile()`:
- If video > 10MB: tries signedUrl endpoint first → uploads directly to GCS → no size limit
- Falls back to helpful error message if GCS not configured / CORS not set
- Progress shows file size during direct upload

**Note:** Direct upload works when GCS CORS is configured. Until then, videos > 10MB show: "Use Google Drive/OneDrive — upload there and paste the link in the Video URL field."

---

## Domain Migration Checklist (yolkseo.netlify.app → thenest.yolkbrands.com)

When the custom domain is set up, update ALL of the following before announcing the new URL:

### 1. Netlify (5 min)
- Add custom domain in Netlify → Site Settings → Domain management
- Set as primary domain so `process.env.URL` auto-updates (used by all functions for Slack URLs, OAuth callbacks etc.)
- Enable HTTPS (auto via Netlify)

### 2. Google Cloud Console — OAuth Redirect URIs (10 min)
All three OAuth flows use redirect URIs that must be updated:
- **GSC (Google Search Console):** Add `https://thenest.yolkbrands.com/api/auth/callback` to OAuth app → Credentials → Authorized redirect URIs
- **GBP (Google Business Profile):** Same OAuth app, same place — add the new callback URL
- **GA4 (Google Analytics 4):** Same OAuth app — add `https://thenest.yolkbrands.com/api/auth/callback?type=ga4`
- Keep the old yolkseo.netlify.app URIs during transition, remove after confirming new domain works

### 3. Slack App — Interactivity URL (5 min)
The approve/dismiss buttons in Slack call back to the site:
- Slack App Dashboard → Your App → Interactivity & Shortcuts → Request URL
- Change from: `https://yolkseo.netlify.app/api/slack-callback`
- Change to: `https://thenest.yolkbrands.com/api/slack-callback`

### 4. GCS CORS (2 min — do this at same time as domain change)
Update the CORS config to the new origin:
```json
[{"origin":["https://thenest.yolkbrands.com"],"method":["PUT"],"responseHeader":["Content-Type"],"maxAgeSeconds":3600}]
```
```bash
gsutil cors set cors.json gs://YOUR_BUCKET_NAME
```
This is the same step as the large video upload CORS setup — do both at once.

### 5. SETUP.md (1 min)
Update "Current URL" from `yolkseo.netlify.app` to `thenest.yolkbrands.com`

### Things that update AUTOMATICALLY (no action needed)
- All Slack notification links (use `process.env.URL` which Netlify sets to primary domain)
- All background function self-calls (same `process.env.URL`)
- Calendar submit notification URLs (built from `process.env.URL`)

### Things that DON'T need updating
- DataForSEO API — no domain dependency
- Anthropic API — no domain dependency  
- Google PageSpeed API — no domain dependency
- Netlify Blobs — no domain dependency

---

## Current Version: v7.3.5

Last session built: Bug-fix batch (v7.0.2), added Yolk Brands to Content Calendar (v7.0.3 + v7.0.4), added Yolk Brands to The Perch (v7.0.5), fixed Reports tab crash (v7.0.6), Priority Gap → Queue Brief + keyword filtering fixes (v7.0.7), copy-to-market fix + GSC page data + URL Inspection indexing badges (v7.0.8).

### Yolk Brands — Content Calendar Setup
- Brand key: `yolk` | Colour: `#F5B800`
- Markets: UAE only
- SocialPilot accounts: Facebook `2445927`, Instagram `2445926`, LinkedIn `2445853`
- Blobs key: `calendarIndex:yolk`
- SEO pipeline: not connected (one-click setup pending)

---

## GA4 — Current Status (IMPORTANT)

**GA4 IS connected and showing data.** The WordPress tracking code was already installed before this session. The GA4 tab in The Nest displays live data.

`ga4-data.js`, the OAuth flow (`?type=ga4`), and the Reports "Website Traffic" section all exist. But GA4 tracking has NOT been installed on the WordPress sites. Until the following are done, GA4 section shows nothing:

**Prerequisites (developer tasks):**
1. Install GA4 tracking snippet on `eatpickl.com` (get Measurement ID from GA4 admin)
2. Install GA4 tracking snippet on `bonbirdchicken.com` (get Measurement ID from GA4 admin)
3. Add `GA4_PROPERTY_ID_PICKL` + `GA4_PROPERTY_ID_BONBIRD` as Netlify env vars
4. Enable "Google Analytics Data API" in Google Cloud Console (one-time, URL shown in error message)
5. Connect via Settings → "Connect Google Analytics 4" button (OAuth flow)

**Do not build on top of GA4 until step 1+2 are confirmed done by developer.**

---

## Pickl Brand Awards (confirmed June 2026)

| Award | Year(s) | Notes |
|---|---|---|
| TimeOut Dubai Best Burger | 2022, 2023 | Back to back; first ever Best Burger category winner |
| Deliveroo Restaurant of the Year | 2022, 2023, 2024, 2025 | 4 consecutive years; community voted (not selected by Deliveroo) |
| Deliveroo Best Homegrown Brand | 2025 | |
| Deliveroo Best Fried Chicken | TBC (Pickl won it — exact year not confirmed) | |

**Use in content:** Community-voted awards are a stronger E-E-A-T signal than judged awards — always mention "voted by the community" for Deliveroo awards.

---

## Technical SEO Developer Kanban — Intentionally Separate from The Perch

The Technical SEO dev kanban is NOT connected to The Perch and should NEVER be merged with it. The developer is a third-party external contractor who does not have access to The Perch. Action Engine routes developer tasks to the tech kanban, not The Perch. This is correct and intentional.

---

## Blog Content — Approved and Live

### "Best Burger in Dubai. Officially." ✅ (published to WP, user editing directly)
- Targets: "best burger dubai" keyword (33 impressions — content gap, no existing page)
- Awards: TimeOut Best Burger (2022, 2023) + Deliveroo Restaurant of the Year (2022-2025) + Best Homegrown (2025)
- ~640 words, 4 FAQs, Pickl voice, BBQ Bacon Cheeseburger in FAQ (not Buffalo)
- External links: TimeOut best-burgers-dubai page, TimeOut 2022 winners, TimeOut 2023 winners, Deliveroo 2025 awards — all open in new tab, no nofollow
- Internal links: locations page, Art of the Smash blog — same tab
- Status: Approved from queue, pushed to WordPress as draft, user edited directly in WP

### "Best Restaurant in Dubai" — PLANNED (not written yet)
- Targets: "best restaurant dubai" — will lead with Deliveroo 4-year Restaurant of the Year streak + Best Homegrown 2025
- Do NOT cover Best Fried Chicken award in this blog (separate chicken-focused blog later)
- Write in next available session

---

## AI Overviews in UAE — Confirmed Behaviour

Google AI Overviews DO appear for UAE food searches, BUT only for conversational/decision-intent queries:
- ✅ Triggers: "where can i find the best burger in dubai", "what is the best burger restaurant in dubai"
- ❌ Does NOT trigger: "best burger dubai", "smash burger dubai" (head terms)

The AI Overview tracker was fixed (v6.9ax) to test conversational queries. The tracker is working correctly — 0 results before this fix was because we were testing the wrong query format.

Bonbird was confirmed mentioned in an AI Overview for: "where can i find the best fried chicken in dubai"

---

## Pending Manual Actions (next session check-in)

| Action | Who | Status |
|---|---|---|
| Competitor Matrix → Manage Competitors → Refresh Now | Shazin | Needed to confirm domain migration applied |
| Keyword Opportunities → Refresh Now | Shazin | Needed to confirm Claude filter + market discovery working |
| AI Overview → Reports → Refresh Now | Shazin | Confirm conversational queries returning data |
| Settings → SEO Goals | Shazin | Set Q4 targets for Reports progress bars |
| GCS CORS setup | IT/Dev | Required for video > 10MB. CMD: `gsutil cors set cors.json gs://BUCKET_NAME` |
| GA4 tracking install on WP sites | Developer | Prerequisite for any GA4 data |
| Slack Bot OAuth setup | Shazin | Optional, ~20 min — enables DMs instead of channel notify |
