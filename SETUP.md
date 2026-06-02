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

**The social + SocialPilot integration (Week 5 roadmap):**
This is NOT a basic social scheduling tool. The design is:
1. Social media team creates content calendar inside The Nest (posts, captions, visuals, schedule)
2. All content follows brand voice guidelines and goes through the same approval flow as SEO content
3. Once approved, posts are auto-pushed to SocialPilot via API for auto-scheduling
4. The Perch handles campaign tasks, asset requests, and cross-team coordination
5. The Nest becomes the single source of truth for all marketing activity — replaces Trello, Buffer/Hootsuite, and agency management in one platform

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

