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

> 🔴 **Bonbird site was REBUILT (live 2026-08-18)** — new WP/Timber theme, ISO market URLs (`/ae/ /om/ /qa/ /pk/`), and page-type-dependent writability. **Read `/BONBIRD-SITE-ARCHITECTURE.md` before generating or publishing any Bonbird content.** (Journal posts = fully writable; the 13 legacy product/location landing pages render from static Twig so their body is NOT writable via post_content; the new Location/Product template pages take Nest-written `post_content` prose + FAQ while a human owns the ACF images/NAP.)

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
| `brandsConfig:index` | **Array of brand slugs (the config-layer index)** |
| `brandsConfig:<slug>` | **One operational brand record: {slug,name,vertical,domain,gscProperty,wpEnvPrefix,gbpAccountEnv,gbpLocationEnv,color,flag,cuisine,brandedTerms,brandTerms,competitors[],keywordSeeds[],active}. Seeded from code literals for pickl/bonbird; new brands (southpour/yolk) exist ONLY here (zero code edits).** |
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
| `gbpCache:<brand>:v9` | GBP location health + ratings + reviews + photo counts — 6hr TTL |
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
| `/api/config` | config.js ← **brand config: GET brand list for all dropdowns; POST save/delete a brand (onboarding)** |
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

## Session: Aug 2026 — v7.8.1 — Bonbird PHASE 2 backend: template contract + scaffold discovery + market-aware menu

Bonbird-only focus (Pickl's site is still being fixed — left untouched).

**1.4 Market-aware menu (stops promoting discontinued products).** Brief §3: UAE discontinued Rice Bowls + Snack-A-Wraps; Angry Fries is PK-only. Nest's Bonbird menu still listed them. Added config-driven `menuExcludeByMarket` + `menuOnlyInMarkets` (brandsConfig) and `menuForMarket()` in generate-draft — the excluded items are BOTH withheld from the menu summary AND named in a hard "NEVER mention these" prompt rule, injected into all three generators. Verified: UAE drops riceBowls + bans rice bowl/snack-a-wrap/angry fries; **Oman keeps riceBowls** (only UAE discontinued them) and bans angry fries; PK allows everything.

**2.1 Location/Product template contract — the generator now knows it.** New `pageKind` param (`journal` | `template_location` | `template_product`) → `generateTemplatePage()` writes ONLY `post_content` in the shape the theme parses: intro answering intent → 2-3 `<h2>` prose sections → **`<h2>FAQs</h2>` + ≥4 `<h3>Q</h3><p>A</p>` pairs** (theme builds the accordion + FAQPage JSON-LD). Hard prompt rules: never write images/hours/phone/address (ACF = human), never invent a venue/branch, must be genuinely market-specific ("if a sentence would read identically for another market, rewrite it" — the anti-doorway bar). Queues as `page_update` with `wpAction:'update_content'` + `postId` so it fills an existing scaffold instead of creating a duplicate, carries the market taxonomy term, and records `humanTodo: add images + NAP via ACF`.
**`validateFaqBlock()` gates it before queueing** — a malformed block would render as flat text with no schema. Verified it blocks: missing FAQ heading · <3 questions · questions without answers · any `<img>` (ACF-owned); accepts a valid block and the `FAQ`/`FAQs` heading variants.

**2.2 Scaffold discovery.** New `list_scaffolds` action (`wordpress.js`): draft/pending pages whose body is empty/near-empty (`maxWords`, default 30), optionally filtered by market tokens and template substring, returning id/slug/link/title/template/parent/words. That's how the **12 waiting product scaffolds** (IDs 47005–47016, om/qa/pk × chicken/wraps/chicken-burger/chicken-tenders) get found — `list_market_pages` couldn't, it only lists *published* pages.

**Post-Phase-2 gap check (found by re-auditing my own work, not by symptom):**
- **`create_page` was dropping the market taxonomy.** I'd wired `buildTaxonomies` into `create_draft` + `update_content` but NOT `handleCreatePage` — so a brand-NEW Bonbird page (city hubs in Phase 3, or any non-scaffold page) would have been created market-less, silently. All three write paths now carry it. Verified by counting `buildTaxonomies` in each handler.
- **Scaffold button used `esc()` where it needed `escJs()`.** The generated `onclick` interpolates the page title; a title containing an apostrophe would have terminated the JS string and broken the button. Switched to the existing `escJs` helper (the one added by the v7.4.69 onclick-XSS sweep — same trap).
- Verified the push path end-to-end on paper: `approvals.pushItem` maps `page_update` → `update_content` and preserves `postId`, so a generated scaffold body fills the existing draft rather than creating a duplicate.

**Phase 2 UI shipped (v7.8.2):** Analytics → Markets → **📄 Page scaffolds awaiting content** — pick brand + page type, *Find scaffolds* lists every empty draft page (path, market, word count), and **⚡ Generate body** writes the prose + FAQ block for that scaffold by `postId` (never creates a duplicate) and queues it for review. Reports the FAQ-pair count on success; a malformed body is rejected before queueing.
**Then Phase 1.5** (schema `countryCode` — already added to all 9 market records — + `schemaType` per vertical) and **Phase 3** (city-hub tier). **1.6 Qatar venue confirmation is a human task.**

---

## Session: Aug 2026 — v7.8.0 — Bonbird enablement PHASE 1 (market taxonomy · legacy-page guard · hreflang from config)

Per `/BONBIRD-NEST-PLAN.md` Phase 1. Each step verified with a mocked-WP harness (no live writes).

**1.1 `market` taxonomy — Nest could NOT set it (journal posts were market-less).** Brief §4: journal posts derive their market from a `market` term, but `wordpress.js` only supported `categories`/`tags`. Added generic custom-taxonomy support: `payload.taxonomies = { market:['om'] }` → `resolveTermIds()` looks the slug/name up via `/wp/v2/<taxonomy>` (cached per invocation, exact slug/name match preferred) and sends term IDs; wired into `create_draft` **and** `update_content` (so an existing post's market can be repaired). Unresolvable terms warn + are reported in `unresolvedTaxonomies` — the post still creates rather than failing. Config-driven per brand: `brandsConfig.marketTaxonomy` + `.homeMarketSlug` (Bonbird `market`/`ae`; Pickl omits → **completely unaffected**). generate-draft attaches it for blog + page creation; `approvals.js` already forwards the payload verbatim. Verified: om/qa/pk → `{market:[om|qa|pk]}`, UAE → `{market:['ae']}`, Pickl → `{}`.

**1.2 Legacy static pages — body writes were SILENT NO-OPS.** The 13 legacy landing pages render from `views/page-{slug}.twig`, so a `post_content` write returned 200 and changed nothing — Nest reported success on content that never shipped. Added a config-driven guard (`brandsConfig.bodyNotWritablePaths`, 12 paths enumerated — brief says 13, the 13th needs identifying): `update_content` now refuses a BODY write to those paths with a 409 explaining why and pointing at meta instead. Resolves the target from `payload.url`, or fetches the post's `link` when only a postId is given. Verified: legacy body write → **409 with ZERO writes to WP** (both url and postId paths); **meta update on the same page still succeeds**; non-legacy page unaffected; Pickl unaffected.

**1.3 hreflang generator was stale AND duplicated the market config.** `hreflang.js` held its own hardcoded slug list — still `/oman/ /pakistan/ /qatar/` with no `/ae/`, so it would have emitted wrong hreflang right after the site's own hreflang was fixed. Now **derived** from brand + market config (rule 12): locale = `<lang>-<ISO countryCode>`, home market from `brandsConfig.homeMarketSlug`, Arabic alternates only when `arabicSlug` exists. Added **`countryCode` (ISO-3166) to all 9 market records** — one source now feeding hreflang **and** the pending schema fix (1.5/L1). Verified output — Bonbird: `en-ae /ae/ · en-om /om/ · en-pk /pk/ · en-qa /qa/ · x-default`. Pickl: all 12 prior tags preserved.
**⚠️ ONE CHANGE TO VERIFY:** Pickl now also emits `ar-jo → /pickl-jordan-arabic/` (from config's `arabicSlug`), which the old hardcoded list omitted. **Confirm that page exists before pasting the block**, or clear `pickl_jordan.arabicSlug`.

**Next (Phase 2):** teach the generator the Location/Product template contract (`<h2>FAQs</h2>` + `<h3>Q</h3><p>A</p>` → template builds accordion + FAQPage JSON-LD; never attempt ACF/media), then target the 12 waiting scaffolds (IDs 47005–47016). Phase 1.4/1.5/1.6 (discontinued menu items · schema countryCode+schemaType · Qatar venue confirmation) fold in with Phase 2.

---

## Session: Aug 2026 — v7.7.9 — 🔴 Bonbird ISO market slugs + Connections health panel

**Trigger:** `/BONBIRD-SITE-ARCHITECTURE.md` (Bonbird rebuilt off Elementor → WP+Timber, live 2026-08-18). Cross-checked every claim against Nest's code; found a live mismatch.

**B1/B2 FIXED — Nest was configured for the OLD site.** The rebuild moved to ISO market URLs (`/ae/ /om/ /qa/ /pk/`; UAE off the root, 136 redirects). Nest still had `marketSlug`/`journalSlug`/`wpMarketParent` = `oman`/`pakistan`/`qatar`, so:
- **Publishing** would have targeted `/oman/journal/…` etc. — URLs that no longer exist (and `wpMarketParent` lookups would fail to find the parent page).
- **Attribution was silently wrong in production.** Proven by simulation: `/om/`, `/qa/menu/`, `/pk/chicken/` ALL attributed to `uae` (the home-market fallback), because `MARKET_PAGE_TOKENS` still held the old words. That corrupted per-market traffic, rank tracker, keyword-discovery attribution and the crawler's page inventory for all of Bonbird. **Site was fine — purely Nest-side stale config.**
- Fix: ISO slugs for the 3 Bonbird intl markets + tokens now `['om','oman']`, `['pk','pakistan']`, `['qa','qatar']` — **old words kept deliberately** so historical (pre-18 Aug) GSC rows still attribute. Verified: new URLs → correct market; old URLs → correct market; `/ae/` → `uae` (correct, home market); Pickl unchanged.

**NEW — 🔌 Connections panel (Settings).** There was no way to see which site Nest was actually wired to. `wordpress.js handleTest` now also returns `base` (configured `WP_<BRAND>_BASE`), `site` (what `/wp-json` says the site's name/home URL is) and `devHostWarning` (base matches dev/staging/localhost). Settings → 🔌 Connections runs, per brand: WP connect + which host + a red flag if it looks like a dev host or if WP's self-reported home ≠ the configured base, plus a live GSC check (property + row count). This is the "is Nest connected to the new site?" answer.

**Still open from the brief (not fixed):** the 13 legacy static pages render from Twig, so **`post_content` writes are silent no-ops** (Yoast meta DOES work) — Nest needs a per-page "body not writable" guard; Nest's Bonbird menu still lists **Rice Bowls + Snack-A-Wraps** which the doc says UAE discontinued (content could promote dead products); city-hub tier still absent (= register finding L3); 12 product scaffolds (IDs 47005–47016) sit as drafts awaiting Nest bodies.

---

## Session: July 2026 — v7.7.8 — 🐛 FIX: Reports tab blank for Pickl + Bonbird (TDZ crash from the v7.6.0 bulk rename)

**Symptom:** Reports tab showed no data for BOTH Pickl and Bonbird. GSC ruled out first — a direct `/api/gsc-data` call returned **200 with full rows** for both properties (`https://eatpickl.com/` and `sc-domain:bonbirdchicken.com`), and `gsc-data.js` hasn't been touched since v7.4.71. So: frontend bug, not data/credentials.
**Root cause (my bug, v7.6.0/WS4):** the bulk ternary→helper replacement produced **self-referential declarations** — `const brandName = brandName(brand);`. That's a TDZ `ReferenceError: Cannot access 'brandName' before initialization`, thrown the instant the function runs. `renderReports` died on its 5th line → the tab rendered nothing. I'd caught and fixed this exact pattern for `brandColor` (3 sites) in the same sweep but never checked `brandName`.
**Fixed 3 sites** (local var renamed to `bName`, helper call preserved): `renderReports` (index.html:6607 — the Reports bug), `loadLlmMentions` (:7125 — AI mentions card), `generateYouTibeBrief` (:12674 — YouTube brief tool). 9 local references renamed in total.
**Swept exhaustively:** a regex pass for `const X = X(` across index.html, login.html, js/*.js and all functions now reports **zero** self-referential declarations. (First attempt used a grep backreference that errored and silently reported "clean" — re-ran in Python. Don't trust a check whose exit code you didn't verify.)
**LESSON:** bulk find/replace that swaps an expression for a same-named helper call silently creates TDZ bombs; `node --check` does NOT catch them (syntactically valid). Grep for `const X = X(` after any such sweep.

---

## Session: July 2026 — v7.7.7 — Competitor Matrix UI made config-driven (missed file: js/competitor-matrix-ui.js)

**Miss found by Shazin:** "no southpour option in competitor matrix". My v7.5.0–v7.7.6 hardcode sweep covered `index.html` + `netlify/functions/` but **never audited `js/competitor-matrix-ui.js`** — a third JS file loaded separately at the bottom of index.html. It was fully hardcoded: `BRAND_COLORS` {pickl,bonbird} labels/colours, **7×** `["pickl","bonbird"]` fan-outs/loops, the brand filter buttons, and the 9-market dropdown.
**Note the backend was already fine** — `competitor-matrix-background.js` iterates `getBrandSlugs()`, so the matrix already RAN for a new brand; only the UI couldn't select/display it.
**Fixed (all config-driven from `window.NEST_BRANDS` / `NEST_MARKETS`, seed pair kept as pre-config fallback):**
- `cmBrands()` + `cmBrandMeta(slug)` helpers; `BRAND_COLORS` kept as a **Proxy shim** so existing `BRAND_COLORS[x]` reads resolve through config with no call-site churn.
- All 7 `["pickl","bonbird"]` sites → `cmBrands()`; brand filter buttons rendered from config; market dropdown built from `NEST_MARKETS` (UAE home first, brand suffix only when >1 brand).
- Bumped the script cache-buster `?v=7.4.20` → `?v=7.7.7` so browsers actually load it (stale-cache trap).
**LESSON for future sweeps:** the frontend is THREE surfaces — `index.html` (inline), `js/*.js` (separate files), and `login.html`. Grep all of them, not just index.html.

---

## Session: July 2026 — v7.7.6 — 🐛 FIX: empty-array-truthy killed seeds for new brands (Southpour "0 ideas ()")

**Symptom (live, Southpour):** Keyword Opportunities showed all zeros with diag `langs[en] → 0 ideas ()` — blank reason.
**Root cause (my bug, from the v7.5.0 vertical work):** `BRAND_SEEDS[brand] || brandCfg?.keywordSeeds || rel.seeds('UAE')` — **an empty array is TRUTHY in JS**, so a configured-but-empty `keywordSeeds: []` won the `||` chain and the café vertical seeds were never reached. `seedSet.length === 0` then hit `continue`, so the DataForSEO keyword_ideas call was **never made** (hence 0 ideas + empty reason). Same pattern silently left the competitor matrix with zero tracked keywords for a new brand.
**Fixed:**
- Added `firstNonEmpty(...lists)` helper (first NON-EMPTY array wins) and used it for the seed chain in `keyword-discovery-background.js` + `competitors`/`keywords` in `competitor-matrix-background.js`. Never use `||` for array fallbacks.
- Home-market vertical seeds now also seed the **primary city** (`rel.seeds('Dubai')` + `rel.seeds('UAE')`) — "best coffee in Dubai" carries volume, "…in UAE" barely registers.
- Diagnostic no longer lies: an empty seed set reports `en:no-seeds` instead of a blank `()`.
**Verified:** Southpour w/ empty seeds → 12 café seeds; user-typed seeds still take priority; Pickl unchanged (regression-checked). `node --check` clean.
**Still open for Southpour's empty worklist:** GSC likely a property-format mismatch (wizard auto-set `https://southpourcoffee.com/`; if GSC has a **Domain** property it must be `sc-domain:southpourcoffee.com`) → discovery logs the GSC error but doesn't surface it (next fix); DataForSEO Labs has no ranked_keywords/competitors data for this small domain.

---

## 🔴 OPEN — Local-SEO page bugs (verified 22 Jul 2026, NOT fixed)

Found in a parallel session, each re-verified against the code. Full detail: `/BUGS-AND-SECURITY.md` §L1–L6 + memory `local-seo-pages-bugs-jul22`.
- **L1 HIGH `addressCountry:'AE'` hardcoded** (`local-seo-pages-background.js:50`) — there is **no ISO country code anywhere in config** (markets carry only `location_code`+`currency`). Running the location-page pipeline for Bonbird's Oman/Qatar/Pakistan publishes JSON-LD claiming the venues are in the UAE → false NAP. Fix = add `countryCode` to the **market config** + resolve from context (not another hardcoded map).
- **L2 HIGH `'@type':'Restaurant'` hardcoded** (same file, line 46) — wrong for Southpour (cafe → `CafeOrCoffeeShop`) and Yolk (corporate → `Organization`). Derive from `brandsConfig.vertical`; add `schemaType` to `VERTICALS`. Fix together with L1 (one function, one deploy).
- **L3 GAP** no city-hub page tier (venue pages only) — city hubs capture head terms like "bonbird dubai"; relevant to the Bonbird `/{market}/{city}/{venue}/` rebuild.
- **L4** Qatar Bonbird locations self-flagged unconfirmed (`international-config.js:370`) — blocks Qatar location content until a human verifies.
- **L5/L6** venue/city data diverges (Nest vs WordPress: Oman is really **two cities** Muscat+Seeb; "District 1"/"District One", "Cue Cinemas"/"Cue Cinema") and `pickl_oman` contradicts itself (1 location listed, notes say 2). **Reconcile toward GBP** (`gbpCache:<brand>:v9` = authoritative NAP).

---

## ⚠️ OPEN — pick up next session: GBP menu photo uploads (large files) + GCS CORS

Not done. The GBP menu builder's photo upload (`gmUploadImage` in index.html + `rehostToGcs` in gbp-menu.js) uses ONLY the base64→function path → **large dish photos (>~4–5MB) fail** (Netlify function body cap ~6MB, base64 inflates ~33%).
**PREREQUISITE — the GCS bucket CORS was NEVER configured** (Shazin held off previously in case the domain migrated to thenest.yolkbrands.com; that's NOT happening now, so proceed). The signed-URL direct-to-GCS upload — used by the content calendar and needed here — requires it. Set it: `gsutil cors set cors.json gs://<GCS_BUCKET_NAME>`, origin `https://yolkseo.netlify.app` (config in the "GCS Signed URL for Large Video Uploads" section below).
**Next session:** (1) set the bucket CORS + test a >5MB calendar upload; (2) wire the existing `action:'signedUrl'` path into `gmUploadImage` (mirror the calendar uploader ~index.html:11348) for large files; (3) add client-side downscale (~1600px) so menu photos are small anyway; (4) fix seed re-host for large master photos; (5) test live. Full detail in memory `gbp-menu-photo-upload-todo`.

---

## Session: July 2026 — v7.7.5 — GBP menus WITH photos: clone-seed + per-venue media + structured builder

Photos now propagate (the point of cloning). GBP menu photos are per-location `mediaKeys`, so you can't copy a reference across venues — you must re-create the image on each. Verified the API: `media.create` (v4, `accounts.locations.media`) accepts a public `sourceUrl` (category `FOOD_AND_DRINK`) and returns a MediaItem whose `name` ends in the new `mediaKey`. Pipeline (all in `gbp-menu.js`, reuses the calendar's GCS hosting — no new infra):
- **`seed_from_master`** — clone a master venue's menu (names/prices/desc) AND re-host each dish photo: resolve item `mediaKeys` → the master's media `googleUrl` (listLocationMedia) → download → re-upload to GCS via `/api/calendar-media` → store as the item's `imageUrl`. Photos that can't be resolved just come back blank (upload manually). Prices/photos are a **GBP-only** menu; SEO menu stays price-free.
- **media-aware `push`** — per selected venue, each item's `imageUrl` → `media.create(sourceUrl)` on THAT venue → attach the returned key as the item's `mediaKeys` → `updateFoodMenus`. `imageUrl`/foreign keys stripped before send. **dry-run (default) makes ZERO writes** (no media.create, no PATCH — just counts photos); only `dryRun:false` writes. Sequential, per-venue ✓/photo-count/fail.
- **Structured builder UI** (replaces the JSON box): Local SEO → GBP Menus → clone master loads sections/items into an editor with **per-item photo upload/replace** (📷 tile → `/api/calendar-media` → GCS), editable name/price, add/remove sections+items, cross-reference vs brand menu, currency-scoped venue checklist, Preview (dry-run) → Push.

Verified headlessly (stubbed GBP+GCS): seed re-hosts + strips source keys; dry-run = 0 writes; real push = 1 media.create + 1 updateFoodMenus per venue with the new key attached; save/load; unauth blocked. Live click-through owed (real listings + confirm `googleUrl` is fetchable for auto-seed; fallback = manual per-item upload, which always works).

---

## Session: July 2026 — v7.7.4 — GBP food-menu bulk create + push (clone / editor / cross-ref / per-venue)

Full feature on top of the v7.7.3 probe. Live probe confirmed 17 Pickl venues, all eligible, across 3 GBP accounts (16 AED + 1 Jordan JOD). VERIFIED via docs: GBP requires a **price per item** — so menus carry prices, stored in a **GBP-ONLY** source (`gbpMenu:<brand>:<CUR>` Blobs), **never `brandContext.menu`** (SEO stays price-free, as Shazin set it).

`gbp-menu.js` (`/api/gbp-menu`, gated; writes = manager/admin) actions:
- `menus` — venues + which already have a menu (clone masters) + detected currency.
- `getmenu` — one venue's live FoodMenu (clone source + preview).
- `push` `{locationIds[],menus,dryRun}` — PATCH v4 `updateFoodMenus?updateMask=menus` per SELECTED venue; **dry-run is the DEFAULT** (only `dryRun:false` writes); per-venue ✓/skip/fail; sequential.
- `savemenu`/`loadmenu` — persist the GBP-only menu per brand+currency.

UI: Local SEO → **🍔 GBP Menus** card — Load venues → pick a **clone master** (a listing you already built by hand) → menu loads into an editable view → **⇄ Cross-reference vs brand menu** (shows items in the SEO menu maybe missing from GBP, to lock structure) → **venue checklist** auto-ticked to the menu's currency but every venue toggleable (⚠ flags a different-currency pick) → **👁 Preview (dry-run)** then **🚀 Push** (double-confirm). Visual menu builder = next; editor is JSON-backed for now.

Verified headlessly (stubbed GBP): menus/getmenu/clone, dry-run fires 0 writes, real push fires exactly 1 PATCH/venue, save/load, unauth push → 401. Live click-through owed (needs signed-in deploy + real listings).

---

## Session: July 2026 — v7.7.3 — GBP food-menu bulk-push: capability probe (step 1)

Goal (Shazin): create a menu once and push it to ALL (or selected) venues for a brand, instead of editing each GBP listing by hand. Confirmed the API supports it — GBP v4 `accounts.locations.updateFoodMenus` (structured sections/items/prices/allergens/options); we already use GBP v4 (reviews) + already enumerate a brand's locations. **Step 1 shipped: capability probe** — `GET /api/gbp-menu?action=probe&brand=<slug>` (gbp-menu.js, gated) lists every venue for the brand with food-menu eligibility (`metadata.canHaveFoodMenus` → ✓/✗/? unknown) + the v4 resource name for each. Read-only, no spend. Reuses the proven gbpTokens refresh + accounts/locations listing; brand-filtered by title (config brandTerms). Verified headlessly (stubbed GBP): correct brand filter, per-venue ✓/✗/? and v4 ids.
**Step 2 (next, after a live probe run):** `POST {action:'push', brand, locationIds:[...], menu}` → PATCH updateFoodMenus per SELECTED eligible venue, per-venue ✓/skip/fail + a preview/venue-checklist UI. **Prices for GBP menus will come from a GBP-ONLY source, never `brandContext.menu`** — Shazin deliberately removed menu prices from Blobs so SEO content wouldn't use them; that stays.

---

## Session: July 2026 — v7.7.2 — Onboarding: live env-var verification + Netlify deep-link

The wizard's step 4 now VERIFIES creds instead of just naming them. New gated `GET /api/config?envcheck=<slug>` reads `process.env` for the brand's `WP_<SLUG>_*` + `GBP_<SLUG>_*` and returns **booleans only** (never the values — the leak class that bit db-get before). Step 4 checklist shows live ✓/⚠ for "WordPress credentials connected" / "Google Business Profile connected", plus a **↗ Open Netlify env vars** deep-link and a **↻ Re-check** button (re-runs after you add vars + redeploy). The tool does NOT create env vars (no Netlify API token held — deliberate) and WP creds stay in env, not Blobs (declined the paste-to-Blobs option on security grounds). Verified: envcheck returns correct booleans + leaks no values.

---

## Session: July 2026 — v7.7.0 — ⭐ Auto-discovery onboarding wizard (URL → discover → review → launch)

Onboarding is now an EXPERIENCE, not a form (Shazin: "give it a URL, it figures out the rest"). New `brand-discover.js` (`/api/brand-discover`, gated admin/manager): given a DOMAIN it runs 3 discoveries in parallel — (1) fetches homepage + /menu + /about and Claude infers IDENTITY (name, vertical, positioning, what-it-sells, brand-voice sample, tagline, branded terms, locations); (2) DataForSEO `ranked_keywords` on the domain → seed keywords it already ranks for (brand-navigational terms post-filtered out using the discovered name); (3) DataForSEO `competitors_domain` → competitor suggestions (social/aggregator domains filtered). All the capability already existed (crawler, ranked_keywords, competitors_domain) — this WIRES it into onboarding.

Settings → 🏷️ Brands → "✨ Onboard a brand" opens a **4-screen wizard** (replaces the manual form):
1. **URL** (+ optional name, vertical override, GSC property).
2. **Analyzing…** animated progress (crawl / read / keywords / competitors).
3. **Review & edit** — everything pre-filled from discovery (identity, vertical, voice, seed-keyword list, competitors, branded terms), fully editable. Approve → writes `brandsConfig` (`save_brand`) + `brandContext:<slug>` voice (via `/api/db/save` → the key `getBrandContext` reads, so the generator uses it).
4. **Connect & launch** — onboarding checklist (GSC/competitors/seeds/voice/WP-env status) + env-var reminder + "🚀 Run first analysis" (fires keyword-discovery + onpage crawler in the background). `editBrand` reuses the review step (no re-discovery).

Verified headlessly (fetch/Anthropic/DataForSEO stubbed): discovery returns correct identity/vertical/voice, drops brand-navigational seeds, filters social competitors; wizard JS + all functions + inline JS `node --check` clean; all integration tests pass. Browser flow still needs a signed-in deploy to click through.

---

## Session: July 2026 — v7.6.0 — ⭐ FULL config-driven scalability: brands + SEO markets, whole tool (BE + FE)

Extends v7.5.0 (brand layer) to the WHOLE tool — the goal is "better than SEMrush/Ahrefs except historical data," fully config-driven. Onboarding a **brand** OR an **SEO market** is now a Blobs record via Settings, ZERO code edits, and it flows through every dropdown, pill, metric card, cron loop, report and pipeline.

**Architecture — two config layers + one endpoint:**
- `_lib/brands-config.js` — brand records (v7.5.0). `_lib/markets-config.js` (NEW) — **SEO markets only** (the `INTERNATIONAL_MARKETS` analog; Blobs-first, seeded from it + SEO keyword-terms; fixed the drifted Bahrain code → 2048). ⚠️ **The content calendar / SocialPilot is a SEPARATE module (content team) — markets-config does NOT touch SP_ACCOUNTS / MARKET_TIMEZONES / CAL_MARKETS.**
- `/api/config` returns `{brands, markets, verticals}` and accepts `save_brand`/`delete_brand`/`save_market`/`delete_market`. The frontend reads it once into `window.NEST_BRANDS` / `NEST_MARKETS` / `NEST_BRAND_MAP`.
- `international-config.js` gained Blobs-aware async accessors (`getMarketsMapAsync`/`getMarketAsync`/`getMarketsForBrandAsync`/`marketForUrlAsync`, lazy-required → no circular dep) so a config-onboarded market is picked up. WP creds now derive from the slug (`WP_<SLUG>_*`) — no pickl/bonbird prefix ternary.

**WS1 marketsConfig backbone** · **WS2 backend market consumers migrated** (keyword-discovery, competitor-matrix, market-traffic, rank-tracker, onpage-audit, and international-seo-background — the latter also lost its BRAND_GSC/WP/`?'Pickl':'Bonbird'` ternary cluster) · **WS3 backend brand hard-blockers fixed** (local-seo-pages no longer coerces to pickl; backlinks own+competitors from config; user-management VALID_BRANDS; calendar/calendar-media brand loops; db-get/save iterate all brands; ga4 no pickl-misattribution; gbp-data location→brand tagging via config; notify left as safe slug-fallback) · **WS4 frontend render engine**: `state.gscRows` is a per-slug map (loops `NEST_BRANDS` by gscProperty; `PICKL_GSC`/`BONBIRD_GSC` gone); Dashboard "Top 10s" = one card/brand; ALL brand pill navs generated from config (dashboard/analytics/report/techseo/local/citation/backlinks + International brand+market pills); ~25 `?'Pickl':'Bonbird'` ternaries → `brandName/brandFlag/brandColor/brandDomain/brandTermsFor` helpers; citation rows + backlinks render + CEO report loop configured brands; **backlinks $100/mo paywall placeholder REMOVED** (paywall was lifted ~1 Jul per memory; there were never backend guards, only stale FE text + fake demo data — now an honest empty state) · **WS5** Settings "Add Brand" + "Add SEO Market" forms; consolidated the competing brand color/label maps to config-fed.

**Verified (Node + in-memory-Blobs; app is auth+Blobs-gated so no browser run):** `/api/config` onboards Southpour (café) + Yolk (corporate) + a `southpour_ksa` SEO market → all appear in GET; café keeps coffee/rejects burger, corporate no food gate; landmine fix (new brand ≠ Bonbird identity); async market accessors attribute a new market's URLs. `node --check` passes on all 74 functions + extracted index.html inline JS.

**WS6 DONE — the single intelligent content brain (`_lib/content-pipeline.js`, NEW):** lifted SERP-feature/local-pack routing + page-level competitor context + cannibalization guard out of `international-seo-background` into one shared lib, generalized for UAE (`market:'uae'` → unsuffixed matrix key; "dedicated page" = any non-homepage page) and every intl market. `generate-draft` (the LIVE on-demand path) now calls it: before a page/blog it runs the cannibalization guard (blocks creating a 2nd page when a dedicated one already ranks → suggests meta instead), routes local-pack keywords blog→page, and injects SERP-feature + competitor-to-beat directives into the prompt (+ surfaces serpFeatureTag/competitors on the queued item). `international-seo-background`'s 7 intelligence fns now DELEGATE to the lib (one copy, no divergence — the exact C1 split we were avoiding). Legacy auto-gen orchestration stays OFF; delete at leisure. Verified headlessly (mock Blobs): serpTag + competitors + cannibalization + local-pack routing all fire for a UAE keyword.

**Still NOT done (honest):** (1) **live creation of Southpour/Yolk on production Blobs** — do it via Settings → Brands/Markets on the deploy (can't write prod Blobs from a dev box) + set env vars `WP_<SLUG>_*`, `GBP_<SLUG>_*`; (2) **live-verify pass once signed in** (the "test everything in one go" — see checklist below).

**LIVE-VERIFY CHECKLIST (post-deploy, signed in) — test everything in one go:**
1. Settings → 🏷️ Brands: add **Southpour** (vertical café, domain, GSC property, flag/colour) + **Yolk Brands** (corporate). Confirm they appear in the brand list.
2. Reload → confirm Southpour + Yolk appear in EVERY brand dropdown/pill (Dashboard cards, Analytics rankings, Report switcher, TechSEO, Local, Citation, Calendar brand, Studio, Perch, user-management).
3. Settings → 🌍 SEO Markets: optionally add a Southpour intl market → confirm it shows in the International brand/market pills.
4. Run discovery for Southpour (`/.netlify/functions/keyword-discovery-background?brand=southpour&force=true`) → Opportunities shows COFFEE keywords, not burgers (vertical adaptation). Yolk → corporate terms, no food gate.
5. Worklist → ⚡Generate on a Southpour keyword → draft queued in café voice; try a local-pack keyword as a blog → confirms it routes to a page + shows the SERP/competitor directive; try a keyword with an existing dedicated page → cannibalization block fires.
6. Traffic report / rank tracker / crawler (onpage-audit) / competitor-matrix each accept `?brand=southpour` without 400.
7. Publish a Southpour draft → WP (needs `WP_SOUTHPOUR_*` env). GBP/citations need `GBP_SOUTHPOUR_*`.
Set env in Netlify first: `WP_SOUTHPOUR_BASE/_USER/_APP_PASS`, `WP_YOLK_*`, `GBP_SOUTHPOUR_*`, `GBP_YOLK_*`. The content **calendar** stays the content team's separate module (brand list is config-driven; markets/SocialPilot untouched).

---

## Session: July 2026 — v7.5.0 — ⭐ P2 SCALABILITY: config-driven brand layer + one-click onboarding (Southpour + Yolk)

THE this-week priority (North Star §1b): make onboarding a brand a **config record, not a code edit**. Built the `brandsConfig` backbone + killed the critical hardcodes + turned off auto-gen + built the real on-demand content path + made keyword discovery vertical-aware.

**1. `brandsConfig` layer — the single source of truth (`netlify/functions/_lib/brands-config.js`, NEW):**
- One Blobs record per brand (`brandsConfig:<slug>` + `brandsConfig:index`). Code literals (pickl/bonbird) are SEED/fallback only; Blobs wins. A new brand exists ONLY as a Blobs record.
- Shared accessors both BE + FE read: `getBrands()`, `getBrand(slug)`, `getBrandSlugs()`, `setBrand()`, `deleteBrand()` (Blobs-first, 60s module cache).
- Resolver helpers kill the ternaries: `gscPropertyFor()` (canonical GSC siteUrl — fixes the sc-domain-vs-https inconsistency), `ownDomainFor()`, `wpCredentialsFor()` (WP_<SLUG>_* convention), `gbpIdsFor()` (GBP_<SLUG>_* convention), `relevanceConfigFor()`.
- `VERTICALS` map (restaurant | cafe | corporate) drives keyword relevance so café/corporate don't get burger keywords.
- **ONE `/api/config` endpoint** (`config.js`, NEW): GET brand list for every dropdown (auth-gated); POST save_brand/delete_brand (admin/manager) — backs the Settings onboarding form.

**2. LANDMINE FIXED (`_lib/brand.js`):** `getBrandContext` no longer falls back to `BONBIRD_DEFAULT` for any non-pickl brand — a NEW brand was silently inheriting Bonbird's name/menu/awards/voice. Now returns a neutral skeleton derived from the brandsConfig record (own name/vertical, EMPTY awards + menu — no impersonation).

**3. AUTO-GEN OFF (`scheduler-background.js`):** the weekly cron's 4 content-gen jobs (quick_wins/meta_rewrites/content_gaps/page_creation) no longer run by default (`jobs` defaults to `[]` = data-only). DATA jobs kept (GSC snapshot, CPC, trackPublishedItems, rank history, pruneApprovals). Legacy generators still callable manually via `{jobs:[...],dryRun:true}` for testing; delete at leisure. BRANDS literal → config-derived.

**4. On-demand ⚡Generate (`generate-draft.js`):** now dispatches by `actionType` — `meta_update` (done) + `page_creation` + `blog_draft` — config-driven (brand voice + vertical), **confidence-gated** (low → `{routeToPerch:true}`, no Claude spend), and every queued item is LABELLED (`payload.generatedType`, title prefix "Meta:/Page:/Blog:"). Frontend `generateDraftFromWorklist` forwards actionType/confidence + handles Perch routing.

**5. Vertical adaptation (`keyword-discovery-background.js`):** `isRelevantKeyword`/`applyStaticFilter`/`passesStaticRelevance` now take the brand's vertical relevance config (roots + off-menu). Café keeps coffee & rejects burgers; corporate has no positive food gate; restaurant unchanged. `brandGenericSeeds` + UAE seeds + the Claude filter prompt are all vertical-framed. `isOwnBrandKeyword` takes config branded terms. GSC ternary + OWN_DOMAINS → config.

**6. Hardcodes killed (config accessors):** GSC-site ternary across market-traffic, keyword-opportunities, technical-seo-background, content-outcomes-background, keyword-discovery, competitor-matrix-background, onpage-audit-background; WP creds (wordpress.js WP_<SLUG> derivation, scheduler, technical-seo); GBP ids (reviews.js GBP_<SLUG> derivation); cron iteration `['pickl','bonbird']` → `getBrandSlugs()` in backlinks-background, ai-overview-background, llm-mentions-background, citations, snapshots-background, email-digest, seed-keywords, keyword-config, competitor-config, competitor-matrix, competitor-matrix-background. The `["pickl","bonbird"]` competitor-matrix bug (CLAUDE.md #12) is GONE.

**7. Frontend (`index.html`):** `bootstrapBrands()` fetches `/api/config` on load → `window.NEST_BRANDS`; `syncBrandDropdowns()` injects any config brand into every brand `<select>` + `[data-bfilter]` pill group (augments the legacy Pickl/Bonbird options — no per-brand HTML). Settings → **🏷️ Brands** card: add/edit a brand (slug, name, vertical, domain, GSC property, WP prefix, flag, colour, branded terms, competitors, seeds) → writes ONE record via `/api/config`.

**Verified (Node, headless — app is auth+Blobs-gated so no browser preview):** in-memory-Blobs integration test onboards Southpour (café) + Yolk (corporate) → both appear in `getBrandSlugs()`, resolvers auto-derive WP/GBP env names, café keeps "flat white" & rejects "best burger", corporate has no food gate, and the landmine is fixed (Southpour ctx = own name, empty awards/menu — NOT Bonbird). `/api/config` handler tested: auth gate (401 unauth), GET list, POST save w/ slug validation, seed-delete protection. `node --check` passes on all changed .js + extracted index.html inline JS.

**REMAINING (documented, non-blocking — acceptance gate met):** live creation of the Southpour + Yolk records happens via Settings → Brands (or POST /api/config) on the deploy — can't write production Blobs from a dev box. Cosmetic FE per-brand refs still hardcoded (dashboard "Pickl/Bonbird Top 10s" metric cards, intl market pills, per-brand report pills, calendar CAL_MARKETS/SP_* social maps, citations NAP, ga4 MARKET_PATHS) + a few secondary BE files (`backlinks.js` on-demand, `notify.js` brandLabel, `local-seo-pages-background.js`, `db-get/db-save`, `perch.js`, `international-seo-background.js` BRAND_GSC — intl is pickl/bonbird only). None block a new brand from running discovery/crawler/traffic/tracker/generate/publish. intl markets (INTERNATIONAL_MARKETS) remain a code literal — separate P2 marketsConfig track. Note: backlinks-background competitor domains + email-digest colours now come from config (single source) — intended, slightly different from old file-local values.

**Env vars for a new brand (set in Netlify — the ONLY non-Settings step):** `WP_<SLUG>_BASE/_USER/_APP_PASS` (publishing), `GBP_<SLUG>_ACCOUNT_ID/_LOCATION_ID` (reviews). GSC just needs the property connected in the shared GSC OAuth.

---

## Session: July 2026 — v7.4.77 — Page-architecture guardrails (homepage protection) in keyword discovery

Pulled forward from P1.6 after Shazin flagged the worklist recommending a HOMEPAGE meta rewrite for "fast food near me open now" (no SEO expert does that). Root cause: `targetPage` = the page GSC already shows impressions for; on a small site the homepage ranks for everything, so long-tail/local queries get mis-attributed to `/`. Fix in `keyword-discovery-background.js recommendAction`:
- **Guardrail 1 — homepage protection:** never recommend a meta_update/page_update on the true homepage (`isHomepageUrl`) for a NON-BRAND keyword (branded queries like "pickl"/"بيكل" are still allowed to fine-tune the homepage, via `isBrandedQuery`).
- **Guardrail 2 — local-intent routing:** such a keyword with local intent ("near me/open now/delivery") → recommend a **location/landing page**; otherwise → a **dedicated page**. Never rewrite the homepage.
- `recommendAction(opp, brandCtx)` now takes brandCtx; both call sites updated.
Verified DFS-free (unit-tested 5 cases: the flagged near-me case → location page; non-brand head term → dedicated page; BRAND term on homepage → still fine-tunes; product term on a product page → unchanged page_update; no-page local → location page). **Takes effect on the next discovery run per market** (Monday cron auto-applies; or a manual Refresh — small DFS — to see it now). Guardrail 3 (tighten keyword↔page fit so several distinct terms don't pile onto one loose-match promo page, e.g. the /ksa-win-free-burgers case) = next increment.

---

## Session: July 2026 — v7.4.76 — P1.0: one queue module (`_lib/queue.js`)

First step of P1 (pipeline unification), DataForSEO-free. Consolidated the TWO drifted queue copies — `_lib/store.js createApproval` (used by 6 background generators) and `approvals.js`'s own createItem/patchItem/etc (API path) — into ONE implementation in **`_lib/queue.js`** (create/get/list/update/remove/addAudit/getAudit/appendBrandFeedback + index/prune). Both files now DELEGATE to it (store.js queue fns are thin wrappers; approvals.js aliases `listItems=queue.list` etc). Same Blobs keys, same behaviour (post-BC1 prune logic), strong consistency. This is the root-cause fix for the drift behind BC1/BC3/BC5.

Behaviour-preserving (the mutable-index race BC3 is NOT addressed here — that's P1.1, deferred because deriving the list via `store.list()` prefix-scan changes result ordering and needs its own verification). Verified: syntax on all 9 queue consumers; end-to-end functional test via a mock Blobs store (create via both paths → list/get/update+history/index/audit/delete all correct). **Committed UNPUSHED — needs a 2-min signed-in smoke test before deploy (create a draft → approve → publish → confirm it appears in the queue), since it's the approval spine and can't be verified headlessly.**

---

## Session: July 2026 — P1 build spec written (`/P1-BUILD-SPEC.md`)

Wrote the P1 (pipeline unification) build spec while the DataForSEO top-up / P0 gate is pending. 7 incremental ship-and-verify steps: P1.0 `_lib/queue.js` (one queue impl, behavior-preserving) → P1.1 kill the `approvals:index` race via prefix-listing (BC3) → P1.2 config-driven voice gate (BC6) → P1.3 one GSC path (C3/BC8) → P1.4 extract `_lib/content-pipeline.js` + move UAE onto it (pure refactor) → P1.5 route intl onto it → P1.6 turn ON SERP-routing + competitor-context + cannibalization guard for ALL markets (C1, behind a config toggle) → P1.7 measurement holes (C4). Steps 0–5 are behavior-preserving (diff payloads to prove); only step 6 changes output and is instantly rollback-able via `config:content-intelligence`. Acceptance = UAE + 2 intl runs with identical gate behaviour + intelligence fields, a duplicate-target UAE content_gap blocked, GSC live-fetch ≤1/page-load. **Not started — needs P0 (Arabic verify) + positive DFS balance first.** Doc committed unpushed (rides with the P1 code deploy).

---

## Session: July 2026 — v7.4.75 — Tier 3 XSS esc() wraps (defense-in-depth)

Closed the remaining defense-in-depth XSS (needs a Claude/OAuth/external-data compromise to exploit; wrapped anyway). All in `index.html`, no behavior change: X6 robots.txt snippet → `esc()`; X7 performance-summary narrative paragraphs → `esc()`; X8 sidebar profile-pic `<img src>` → `esc()`. Still open (more sites): X9 technical-SEO PSI/audit fields, X10 Perch label color-in-style. Syntax clean.

---

## Session: July 2026 — v7.4.73–74 — P1 safe fixes (brand-feedback + BC5 meta dedup)

Safe, DataForSEO-independent, unit-tested fixes made while the DFS balance top-up is pending (P0 live-verify gate still open). The risky P1 core (queue merge + pipeline unification) is intentionally held until it can be verified live.

- **v7.4.73** — promoted `getBrandFeedback` to `_lib/brand.js` (was scheduler-only) and wired it into `generate-draft` so on-demand meta drafts stop repeating past human rejections (audit content-loop finding #8). Additive, no blast radius.
- **v7.4.74 — BC5 fixed.** meta_update dedup missed when the same page was stored under its GSC URL (GSC-driven path) vs its WP permalink (sweep path) → double meta_update = double Claude spend. Added one shared `metaDedupKey(url,lang)` normalizer (→ pathname + normalized lang, host/protocol/trailing-slash agnostic) and applied it to all 4 key-builders in `international-seo-background.js` (builder + 3 lookups). Unit-tested 5 cases (cross-form collapse, cross-market/lang distinctness, bare-path). Pathnames are unique per single-brand site → no false-dedup risk.

P0 status: doc reconciliation done; live-verify PENDING DataForSEO top-up (V1 KSA was inconclusive — negative balance; run never reached the Arabic filter). P0 gate OPEN — no intl regenerate until V1 passes.

---

## Session: July 2026 — v7.4.72 — P0 (truth): doc reconciliation + live-verify checklist

Start of the P0 phase from `/PLAN-FOR-OPUS.md` ("truth first"). Docs only — no code.

- **NEST-ROADMAP.md reconciled to reality** (statuses had drifted): WS1 mostly done (correctness + security + backend sweeps shipped v7.4.63–71), WS2 crawler ✅ BUILT (v7.4.52, was marked "not built"), WS3 partial (content-outcomes live), WS4 started (reporting/tracker/long-term shipped), hreflang GENERATOR exists (deployment-audit not built). Added a banner pointing to `/PLAN-FOR-OPUS.md` (build sequencing) + `/BUGS-AND-SECURITY.md` (audit), progress-log entries for v7.4.52/63-65/67-71, and the Arabic-regenerate gate to the caveats.
- **CLAUDE.md version drift fixed**: `Current Version` v7.4.28 → v7.4.71; added canonical-docs pointer (PLAN-FOR-OPUS + BUGS-AND-SECURITY) and next-up (P0→P1); noted the 10-file add-a-market checklist is what P2 (config layer) eliminates.
- **`/P0-VERIFY-CHECKLIST.md` created** — the signed-in live-verify pass (Fable can't run it; needs a session + real GSC/DFS data): V1 Arabic Opportunities fail-open (🔴 GATE — no intl regenerate until it passes), V2 traffic vs June baseline, V3 tracker seeds every market, V4 CEO rollup, V5 long-term group on a discovery run, V6 content-intelligence fields, V7 page_update keeps live page live (BC2), V8 no duplicate re-queue (BC1). Pass/fail criteria each.

P0 remaining = Shazin runs the checklist. All ✅ (esp. V1) → P0 gate cleared → P1 (pipeline unification).

---

## Session: July 2026 — v7.4.71 — Backend correctness batch: BC4/BC6a/BC7/BC8/BC10 + LOWs

Second backend-correctness batch (register: `/BUGS-AND-SECURITY.md` Tier 6). Self-contained fixes that don't belong to the P1/P2 structural work.

- **BC4 (MED) — `wordpress.js findPostByUrl` wrong-page publish.** When a slug returned multiple results and none matched the expected path, it fell through to `data[0]` → update_meta/update_content/publish could hit the wrong market's page. Now skips (continues) instead of guessing.
- **BC6a (MED) — voice-gate parse.** `runBrandVoiceCheck` used `JSON.parse` and fell back to a neutral score 6 on any non-bare-JSON reply (which passes UAE's <5 gate but fails intl's <8 gate). Now uses `extractJson` (handles fenced/prose-wrapped JSON) so the inconsistent fallback rarely fires. (Threshold unification itself = P1.)
- **BC7 (MED) — `trackPublishedItems` clobber.** Was raw-writing the whole stale item snapshot over a 15-min run → a concurrent user edit/approve was lost. Now re-reads fresh and merges ONLY the tracking fields (lastTrackedAt/positionLatest/positionDelta/clicksLatest/indexStatus).
- **BC8 (MED) — `gsc-data.js` rowLimit 500→25000.** The 500 cap clipped the long tail feeding competitor-audit gap detection + ai-overview keyword selection. (Full consolidation onto `_lib/gsc` = P1.)
- **BC10 (MED) — `reviews.js` orderBy.** `updateTime desc` had a literal space in the v4 URL → possible 400 → empty reviews. Now `encodeURIComponent`'d (matches gbp-data.js).
- **LOWs:** content-outcomes-background now falls back to `payload.targetKeyword/keyword` (mirrors scheduler) so pre-trackingKeyword items get measured; scheduler internal-fetch base `NETLIFY_URL`→`URL || NETLIFY_URL` (Netlify sets URL, not NETLIFY_URL).

**Deferred with reason (NOT forgotten):** BC3 index race + store/approvals queue-dup → P1 (one queue module); BC5 meta dedup url mismatch → P1 (spans 4 key-builders; piecemeal risks a dedup regression); BC6 thresholds → P1 voice-gate unify; BC9 brand→GSC ternary → P2 config layer; BC11 + judgment LOWs (Labs-detection, urlMatchesTokens hyphen, ai-overview field paths, HEAD health check) → per-phase, need live verification. Verified: syntax all 6 files, modules load, extractJson resolves.

---

## Session: July 2026 — v7.4.70 — Backend correctness BC1+BC2: index-truncation + live-page-unpublish

From the backend-correctness audit re-run (register: `/BUGS-AND-SECURITY.md` Tier 6). The two most impactful backend bugs.

- **BC1 (CRITICAL) — `approvals:index` no longer hard-truncated to 500.** `_lib/store.js createApproval` (used by ALL 6 background content generators: scheduler, international-seo, generate-draft, hreflang, local-seo-pages, reviews) did `idx.length = 500`, silently orphaning every item past 500 once pushed/published (never pruned) accumulated → broken dedup (`getQueuedKeywords`/`getQueuedMetaMap` → duplicate content = **Claude re-spend**) + broken `trackPublishedItems`/`content-outcomes`/rank tracking. Replaced with the same prune-not-truncate logic `approvals.js createItem` already uses (drop rejected/failed >30d, keep pushed/published/pending forever, 2000 ceiling). Unit-tested: 600→585 kept, all published/pending/recent-dead preserved, only old-dead dropped. NOTE: store.js + approvals.js are drifted duplicate queue impls — unify into one module in P1 (this replicates the shared logic for now).
- **BC2 (HIGH) — `update_content` no longer unpublishes live pages.** `wordpress.js handleUpdateContent` hard-set `status:'draft'`, so approving a `page_update` on a currently-**published** page flipped it to draft → the live URL **404'd** until republished. Removed the forced status; WP now preserves the page's current state (published page stays live with the approved rewrite — the human already reviewed it in the queue; a draft stays a draft). Matches `handleUpdateMeta`. Updated the header comment, success message, and the approvals.js push comment.

Verified: syntax on all 3 files; BC1 prune unit-tested. Remaining Tier 6 (BC3 index race, BC4 findPostByUrl wrong-page, BC5 meta dedup url mismatch, BC6 voice-gate fallback, BC7 trackPublished clobber, BC8 gsc-data rowLimit, BC9 brand→GSC ternary, + LOW) fold into P1/P2 — see register. Down-rated non-bugs (verified): DataForSEO `/live` (Labs is live-only by design), 700-keyword batch (within real limits).

---

## Session: July 2026 — v7.4.69 — Security Tier 2/4: onclick XSS sweep (escJs) + crash fixes

Batch 2 of the audit fixes (register: `/BUGS-AND-SECURITY.md`). Frontend only (`index.html`, `js/competitor-matrix-ui.js`).

- **Root cause fixed — the onclick XSS class.** `esc()` encodes `'`→`&#39;`, which the browser HTML-decodes back to `'` *before* parsing an inline `onclick`, so `esc()` alone does NOT protect a JS-string arg — a crafted `');alert(1);//` closes the string and executes. **The codebase's own idiom `esc(x).replace(/'/g,"\\'")` was a no-op** (esc already replaced the quotes), so those 11 "protected" sites were ALSO vulnerable.
- **Added global `escJs(s)`** = JS-escape (`\`, `'`, newlines) THEN `esc()` — survives both the HTML-attribute decode and the JS parse. Verified end-to-end: apostrophe keywords render fine, `');alert(1);//` is received as a literal string (no execution), `<img onerror>`/quotes safe.
- **Converted the 11 broken-idiom sites → `escJs`** (balanced-paren transform) + **6 named free-text onclick sinks**: queueGapKeyword, insertCalMention, removeSeedKeyword, showEditBrandsModal, removeUser, loadAuditFromHistory (keyword/name/email/domain — user/external data).
- **X2 unescaped `<img src>` escaped** — calendar list thumb (9845) + present strip (11679), from user-pasted `imageUrl`/media URLs (was stored XSS).
- **B1 crash fixed** — GBP star rating `'★'.repeat(r.rating||5)`: a rating of 6/-1/NaN threw `RangeError` and blanked the whole review queue. Now clamped 0–5 (null→5).
- **B2 was a FALSE POSITIVE** (corrected): the "esc-out-of-IIFE ReferenceError crash" claim is wrong — index.html's `esc`/`escJs` are global (bare `<script>`), so `competitor-matrix-ui.js`'s out-of-IIFE functions fall back to them. No crash. Did convert its one external-data onclick (`cmAddDiscoveredCompetitor` c.domain, line 1597) to `escJs`.

Still open (later phases): S4 authorization layer (Viewer-can-publish); ~15 fixed-set onclick args + competitor-matrix-ui's quote-blind local `esc`; Tier 3 XSS (robots.txt/narrative/profile-pic); Tier 4 remainder (B3–B7); Tier 5 hardening; and the **backend-correctness audit still owed** (agent died mid-run) — re-run before P1.

---

## Session: July 2026 — v7.4.68 — Security Tier 0: Slack signature verification + gate approvals/calendar GET

From the 9–10 Jul bug/security audit (register: `/BUGS-AND-SECURITY.md`; plan: `/PLAN-FOR-OPUS.md`). Fixes the three unauthenticated-exposure findings. **⚠️ DEPLOY GATE: set `SLACK_SIGNING_SECRET` in Netlify env BEFORE this deploys, or Slack approve/dismiss buttons will 401** (Slack App → Basic Information → Signing Secret).

- **S1 `slack-callback.js` — Slack request signing (CRITICAL).** Previously NO verification: a forged POST could approve/dismiss any item and publish calendar posts. Added fail-closed HMAC-SHA256 verification (`verifySlackSignature`): checks `x-slack-signature` over `v0:{ts}:{rawBody}` with `SLACK_SIGNING_SECRET`, rejects missing secret / missing headers / stale timestamp (>5 min replay window) / mismatch, using `crypto.timingSafeEqual`. Also now reads the raw body respecting `isBase64Encoded` (correctness for signature + form parse). Unit-tested: valid✓ stale✗ bad-sig✗ missing✗ no-secret✗.
- **S2 `approvals.js` — GET was unauthenticated (CRITICAL).** GET branch (line 183) ran before `authorize()` (206) → anyone could read the whole content pipeline + audit log, all brands. Hoisted `authorize()` to gate all methods. Fixed the one internal GET caller (`international-seo-background.js:1535`) to send `internalHeaders()` so dedup still works.
- **S3 `calendar.js` — GET was unauthenticated (CRITICAL).** GET (87) before `authorize()` (149) → whole social calendar readable unauth. Hoisted the gate. No internal GET callers (only slack-callback POST, which sends the token).
- Swept all 59 functions for the GET-before-authorize pattern: only these two remained (kw-opps fixed v7.4.67); `perch.js`/`user-management.js` flagged by the crude grep are false alarms (gate via `getCurrentUser`/`getCallerRole` admin-only).

Also committed the planning + audit deliverables: `/PLAN-FOR-OPUS.md` (5-phase build plan: P0 verify → P1 unify pipelines → P2 onboarding/config → P3 visibility → P4 CEO → P5 local → P6 backlog) and `/BUGS-AND-SECURITY.md` (verified register). **NEXT (batch 2):** Tier 2 XSS sweep — a corrected `escJs()` helper (the existing `esc(x).replace(/'/g,...)` idiom is a no-op because `esc` already encodes `'`) across ~25 onclick sites + `<img src>` escapes (9834/11668) + crash bugs B1 (star-rating RangeError 7194) and B2 (competitor-matrix-ui esc-out-of-IIFE 1561). Backend-correctness audit still owed (agent died mid-run).

---

## Session: July 2026 — v7.4.67 — Security: gate keyword-opportunities GET (unauthenticated worklist leak)

Found during the post-deploy WS1 verification sweep. `keyword-opportunities.js` gated its POST but NOT its GET — `/api/keyword-opportunities?brand=<b>` returned the full worklist (keyword strategy, competitor positions, target pages, KD/volume) to anyone, unauthenticated. Violates CLAUDE.md #11 ("reads that return non-public data get gated too"). Fix: `authorize()` at the top of the handler (gates all methods; accepts session OR x-nest-internal). Verified the only callers are the frontend via apiGet/apiPost (session cookie) + the audit sub-path — background jobs read the Blob directly, so nothing breaks. Probed the other 9 read endpoints live (competitor-matrix, backlinks, technical-seo, ai-overview, llm-mentions, citations, business-priority, gbp-data, onpage-audit) — all already return 401; this was an isolated gap, not systemic. **Verify post-deploy:** `/api/keyword-opportunities?brand=pickl` returns 401 unauthenticated; the Opportunities tab still loads when signed in.

---

## Session: July 2026 — v7.4.66 — WS1 trust & correctness: tracking-status truth + position rounding

Roadmap Workstream 1 (trust/correctness) fixes. No new features — makes the Published & Tracking view tell the truth.

- **Draft-vs-live mislabel (the headline bug):** the tracking card computed `isWpDraft = item.status === 'pushed'` — type-blind. But `meta_update`/`schema_update` push via `update_meta` to an EXISTING live page (live the moment pushed), whereas `blog_draft`/`page_creation`/`page_update` save as a WP draft needing manual publish. So a live meta edit was labelled "📝 Saved as WordPress draft — publish it live," implying an already-live, already-tracked change wasn't live. Fixed in `buildTrackingCard` (index.html): live-on-push types (`meta_update`,`schema_update`) now show "✅ Live on the page — tracked every Monday"; genuine drafts keep the publish prompt; the no-data case is unchanged.
- **Backend tracking eligibility aligned to the UI:** `trackPublishedItems` (scheduler-background.js) required top-level `item.trackingKeyword` and `continue`d otherwise, while the UI also accepts `payload.targetKeyword`. Items pushed before `trackingKeyword` was captured showed in the UI but were silently never tracked. Now falls back to `payload.targetKeyword || payload.keyword` (matches the UI exactly).
- **7-decimal position leak:** GSC positions are long floats. Rounded to 1 dp at two display points that rendered raw values — the intl market keyword table (`#7.4285714` → `#7.4`) and the tracking card's positions + delta (`buildTrackingCard`, now via a local `r1()` rounder).

**Verified:** JS syntax (all inline blocks + scheduler); Node render harness of `buildTrackingCard` — live meta edit says "Live" not "draft", blog draft still says "draft", long-float positions render at 1 dp and delta computes to 5.3, no 7-decimal leak.

**WS1 remaining (not done this pass):** verify the untested v7.4.13–28 pile live; the broader "verify" debt. Deferred bugs list in memory unchanged otherwise.

---

## Session: July 2026 — v7.4.65 — SEO reporting Step 3: long-term targets in the worklist

Final part of the 3-part reporting/tracker build. Adds a strategically-scoped "long-term targets" group to the keyword worklist.

**What was built (all in `keyword-discovery-background.js` + Opportunities UI):**
- **Modern definition (NOT the old volume>5k cutoff):** `isLongTermTarget(opp, cfg)` = hard by difficulty (KD ≥ threshold) OR hard by position (KD unknown + we don't rank / pos > threshold + an established competitor holds the top N), AND worth pursuing (real volume OR strong commercial intent). Quick-wins/top-10/top-3 are never long-term.
- **Guaranteed group, never displaces quick-wins:** long-term targets are split off the scored list BEFORE the top-N slice, tagged `tier:'long_term'`, ranked WITHIN the group by **traffic potential** (`min(volume, cap) × intent`, not raw volume), capped, and appended at the END (quick-wins → push → gaps → 🎯 long-term). Each carries `whyLongTerm` (one-line reviewer rationale) + `trafficPotential`.
- **Scalable (#12):** all thresholds live in ONE config object `DEFAULT_LONG_TERM_CONFIG` (kdThreshold 60, unrankablePos 30, competitorTopPos 10, minVolume 300, strongIntentMin 1.0, volCap 5000, longTermLimit 15, mainLimit 100), **overridable per deployment via the Blobs key `config:keyword-longterm`** (merged over defaults) — tune for any brand/market with no code edit. Nothing brand/market-specific.
- **UI (Opportunities tab):** 🎯 Long-term summary badge, tier-filter option, purple "Long-term" tier badge, a section-header banner before the group, the `whyLongTerm` note per row, and AI + Perch actions (it's a content play). Added `long_term` to the summary counts.

**Verified:** JS syntax (all files + inline blocks); 10-case classifier unit test (hard-by-difficulty, hard-by-position, quick-win/top10 exclusion, worth-by-volume vs worth-by-intent vs neither, KD-below-threshold, unrankable-pos boundary) + traffic-potential ranking + reason lines; live UI render via stubbed-auth preview (group at end, header banner, badges, filter, reason notes, actions). **Post-deploy:** the group only populates after the next keyword-discovery run per brand/market (it's computed at discovery time).

Reporting/tracker plan (Steps 1–3) now COMPLETE.

---

## Session: July 2026 — v7.4.64 — SEO reporting Step 2: rank tracker (tracked keywords, position-over-time, CEO rollup)

Second of the 3-part build (Step 1 = v7.4.63 below; Step 3 = long-term targets, still to do). Deployed together with Step 1 in one batch.

**What was built:**
- `_lib/rank-tracker.js` (new) — shared logic. Storage keys (config-driven, brand×market, #12): `trackedKeywords:<brand>:<market>` (seeded from the DATA-DRIVEN worklist `keywordOpportunities:<brand>[:<market>]`, top 25 by score; entries carry keyword/vol/kd/targetPage/intent/tier/pinned/aspirational/source) and `rankHistory:<brand>:<market>` = `{ kwLower: [{date,pos}] }` (weekly points, capped 26). Helpers: `marketsForBrand` (derives brand's markets incl. UAE from the single market config), `ensureTracked` (lazy-seed on first read), `updateRankHistory` (append this week's positions for all markets from ONE page+query pull — **market-attributed by page via marketForUrl**, the locked methodology; the query-only gscSnapshot can't attribute), `buildView` (current/delta/history + non-branded summary via `isBrandedQuery`), `posWeight` (visibility score).
- `rank-tracker.js` (new endpoint) — `authorize()`-gated (#11; non-public reads + POST mutations, no external spend). GET `?brand&market` lazy-seeds, returns keywords+summary+**the brand's market list** (so the UI market selector is config-driven, no hardcoded list). POST `{action: add|remove|pin|unpin|reseed}` — reseed refreshes from worklist while **preserving manual adds + pinned terms**.
- `scheduler-background.js` — after `trackPublishedItems`, added a non-critical `updateRankHistory` step using `fetchGscWithPages` (cached `['query','page']`, so no extra API cost) → appends weekly positions for every tracked keyword across all the brand's markets. This is the ONLY wiring the Monday cron needed (reuses the existing weekly run).
- `index.html` — **Rank Tracker card** in Analytics→Rankings (below the traffic card): brand + config-driven market selector, Non-branded (default) / Branded / All filter, summary chips (visibility/top3/top10/improving/declining/avg pos, recomputed per filter), table with current pos, Δ-vs-last-week arrows, inline SVG sparkline (green=improving), vol/KD/target-page, and per-row pin/remove. Add-keyword + Reseed controls. **CEO rollup card** in Reports (`report-rank-tracker`): aggregates non-branded tracked keywords across ALL the brand's markets → summary chips + Top movers / Needs attention (with market tags). Non-blocking load.
- `netlify.toml` — `/api/rank-tracker` redirect.

**Verified:** all JS syntax + inline blocks; lib logic unit test (seed, weekly history append with market-attribution isolation [Bahrain row does not pollute UAE], idempotent same-date, delta up/down, reseed merge preserves manual+pinned & drops stale, branded classification); live UI render via stubbed-auth preview (market dropdown populated from endpoint, non-branded default hides branded, pinned-first sort, sparklines, filter switch, CEO rollup aggregation across markets). **Post-deploy:** history needs ≥2 weekly cron runs before Δ/trend appear; first run just seeds + records week 1.

**Not done:** Step 3 (long-term targets group in the worklist).

---

## Session: July 2026 — v7.4.63 — SEO reporting Step 1: per-market organic traffic (GSC, dated, branded/non-branded)

First of the 3-part SEO reporting + rank-tracker build (plan in `seo-reporting-tracker-plan` memory). This session = **Step 1 only** (traffic report); Steps 2 (rank tracker) + 3 (long-term targets in worklist) are next.

**Locked methodology (do not repeat past mistakes):**
- **Total per market = page-level GSC** (`dimensions:['page']`) — accurate, GSC drops no rows.
- **Branded / Non-branded split = query-level** (`['page','query']`) — this **undercounts** (GSC anonymises rare queries), so it is NEVER used for Total, only for the split. The two segments deliberately won't sum to Total (noted in the UI).
- **Non-branded is the real SEO KPI** (new customers); branded = awareness context. ~93% of clicks are branded → non-branded is the untapped ceiling.
- Pages attributed to markets via the shared `marketForUrl` (single source of truth).

**What was built:**
- `_lib/brand.js` — added optional `brandedTerms` per-brand field (Pickl: pickle/بيكل/بكل/بيكلز/بيك; Bonbird: bon bird/بونبيرد/بون بيرد) + exported `isBrandedQuery(query, brandCtx)` / `brandedTermsFor()`. **Scalable (#12):** brand `name`+`slug` are auto-derived as branded (zero config for a new brand's Latin name); `brandedTerms` only ADDS non-derivable variants. Lives in the one per-brand config record (Settings-editable via `brandContext:<brand>`). Single classifier reused by traffic report + (upcoming) rank tracker + Reports. 15/15 unit tests pass incl. cross-brand isolation.
- `_lib/gsc.js` — added `fetchGscPageOnly()` (accurate Totals) + `startDate`/`endDate` support on both fetchers (opts object; back-compat preserved — existing callers pass no opts). Shared `runGscQuery`/`resolveWindow` internals.
- `market-traffic.js` — rewritten: two **parallel** GSC pulls (page-only + page+query), per-market per-segment aggregation (`total`/`branded`/`nonBranded` each with clicks/impressions/impression-weighted avgPosition/pages), accepts `?startDate&endDate` (defaults last 28d), seeds every brand market so 0-traffic markets (e.g. Pickl Oman, not-indexed) still surface. **Auth (#11):** gated with `authorize(event)` (non-public read). No spend (GSC free), no mutation.
- `index.html` — new "🌍 Organic Traffic by Market" card at top of Analytics→Rankings: brand selector, date-range picker (default 28d) + 28d/90d/6mo presets, segment filter pills (Total default | Non-branded | Branded). All three segments returned in one response → segment switch is client-side (no re-query). Table re-sorts by active segment; footer shows range + segment totals. Below it, the existing keyword-rankings table (now labelled).
- `netlify.toml` — `/api/market-traffic` redirect.

**Not done (next sessions):** rank tracker (`trackedKeywords`/`rankHistory`, weekly GSC snapshot, seeded from worklist), long-term targets group in worklist, CEO rollup of this data in Reports tab. Verified locally: syntax (all JS + inline blocks), classifier unit tests, id/function reference resolution. Live GSC path verifies post-deploy (auth-gated + secrets).

---

## Session: June 2026 — v7.4.9 — Voice gate hardening (intl content paths)

All international content paths now require ≥8/10 brand voice score before queuing (was ≥5 warn-and-queue). Hard-strips em/en dashes before scoring (`hardStripBannedTokens`). `fixBrandVoice` improved logic fixed to accept rewrites that clear flagged issues even when score is flat. All `fixBrandVoice` calls now pass accumulated human rejection feedback. `generateBlogDraft` returns null on gate reject; caller handles it. Meta updates now have full fix+gate in both data-driven and seed-content paths.

---

## Session: June 2026 — v7.3.9 — Authentication hardening (mutating endpoints)

Closed the critical hole: `db-save`, `approvals`, `calendar`, `wordpress` were fully unauthenticated (anyone could overwrite data / publish live / burn credits). Now every **mutation** requires a valid session OR an internal service token. Reads (GETs) left open.

### New: `_lib/auth.js`
- `authorize(event)` → `{ ok, via:'session'|'internal'|null, user }`. Two trust paths:
  - **Session** — browser `yolk_session` cookie → `userSession:<token>` Blob → role (same mechanism as auth-user.js). `apiGet`/`apiPost` are same-origin so the cookie rides along automatically.
  - **Internal** — `x-nest-internal` header = `sha256('nest-internal:' + NETLIFY_AUTH_TOKEN)`. That env var is in every function context, so **no new env var** and no deploy-ordering break. For function-to-function + cron calls that have no session.
- `internalHeaders()` (spread into fetch headers for internal callers), `denied()` (401), `getSessionUser()`.

### Gated (mutations only)
- **db-save.js** — `authorize` (browser-only; no internal callers).
- **wordpress.js** — `authorize`; internal callers pass the token.
- **approvals.js** — POST gated; `actor` now derived from the verified session (was forgeable `body.actor`); its two wordpress fetches send `internalHeaders()`.
- **calendar.js** — POST gated; `actor`/`actorEmail` derived from session; internal calls keep stated actor.

### Internal callers updated to send the token
- `approvals.js` → wordpress (publish + pushItem). `scheduler-background.js` → wordpress (get_current_meta). `international-seo-background.js` → approvals (create). `slack-callback.js` → calendar (approve).

### OAuth callback (`auth-callback.js`)
- **Access model = closed allowlist (Option A):** bootstrap admins OR an explicit `userRole:<email>` record created via Settings → Users — works for **ANY domain**. Domain is **not** a hard gate (so external/partner emails can be granted by adding them in Settings → Users). Blocks only explicitly-unverified Google emails (`email_verified === false`) and guards missing `id_token`.
- **To give another domain access:** add the user in Settings → Users (no code change/redeploy needed).
- (Option B — a configurable auto-allow-domain list so Yolk staff self-onboard as viewer — was considered and deferred; allowlist chosen for tighter control.)

### ⚠️ Verify after deploy (could not be tested locally — needs live session + Blobs)
1. **Login still works** (domain check didn't lock anyone out).
2. **Settings save** works (db-save + session).
3. **Approve → WP Draft / Publish Live** works (browser session → approvals → wordpress internal token).
4. **Manual scheduler run** still publishes / get_current_meta works (cron internal token).
5. **International audit** creates items (intl → approvals internal token).
6. **Slack approve** still works (slack-callback → calendar internal token).
If publishing or the Monday pipeline breaks, the internal-token path is the suspect — **rollback = revert this commit**.

### Deliberately deferred (auth follow-ups, lower severity / higher breakage risk)
- **Slack signature verification** on `slack-callback.js` (HMAC w/ SLACK_SIGNING_SECRET) — it's still a public endpoint; a forged Slack payload can approve/dismiss. The internal token only stops direct anonymous calls to calendar/approvals.
- **OAuth `state` CSRF nonce** (random state in a cookie, verified on callback) — skipped this pass (highest login-breakage risk).
- **Role-tier granularity** (viewer-can't-publish): currently any authenticated user passes; closing the anonymous hole was the priority.
- **reviews.js** mutation gating (lower priority).

### Revert notes
- Remove the `authorize`/`denied` import + the gate block from db-save/wordpress/approvals/calendar; revert `internalHeaders(...)` back to `{ 'Content-Type': 'application/json' }` in the 4 internal callers; revert auth-callback domain/email_verified/id_token guard; delete `_lib/auth.js`.

---

## Session: June 2026 — v7.3.8 — Run Audit control + Dismiss Visible fix + filter spacing

### Unified Run Audit control (Approvals Queue)
The "Run Audit Now" button is now **scope-aware**, driven by the selected **brand pill + market dropdown** (the two filters that map to a run; type/search/the Pending-Published toggle are view-only and ignored). Button label shows the live scope (e.g. "Run Audit · Pickl · All Intl").
- `getAuditScope()` → builds run targets from brand+market: UAE → `scheduler-background` (POST `{brand}`); international → per-market `international-seo-background?market=<key>`. Handles `All markets` (UAE + all intl for the brand[s]), `🇦🇪 UAE`, `🌍 All International`, and a specific flag market (incl. both brands when a shared flag like Qatar/Oman is picked with brand=All).
- `runScopedAudit()` confirms with the scope + run count, fires all targets (awaited 202s), toasts, refreshes the queue after ~45s.
- `updateRunAuditLabel()` keeps the button label in sync (called from `filterBrand`, `filterMarketSelect`, `loadQueue`).
- Replaced `runAuditNow` (all-jobs-both-brands-UAE-only). **Retired orphaned `runIntlSeo`** (its `#intl-run-btn` never existed in the DOM; relied on a synchronous `data.summary` background functions never return) + removed its readonly-list refs. Per-market ▶ Run in Markets (`runIntlMarket`) kept.

### Fixes
- **Dismiss Visible (and every nestConfirm dialog) did nothing** — `runConfirmCallback()` called `closeConfirmModal()` (which nulls `_confirmCallback`) BEFORE invoking it, so the confirmed action never ran. Fixed: capture `const cb = _confirmCallback` before closing, then invoke.
- **Approval queue filter spacing** — 24px margin + 18px padding + a `--border` divider below `#queue-filters` so the toolbar is visually distinct from the card list.

### Revert notes
- Run Audit: repoint the button to a `runAuditNow` that POSTs `{}`; remove `getAuditScope`/`runScopedAudit`/`updateRunAuditLabel`; restore `runIntlSeo` from git history if needed.
- runConfirmCallback: revert to `closeConfirmModal(); if (_confirmCallback) _confirmCallback();` (re-introduces the bug — don't).
- Spacing: restore `#queue-filters` style to `margin-bottom:4px` with no padding/border.

### Next
- **Authentication follow-ups** — Slack signature verification on slack-callback.js; OAuth state CSRF nonce; role-tier granularity (viewer-can't-publish); reviews.js mutation gating.

---

## Session: June 2026 — v7.4.8 — GBP polish: photos, per-listing filter, venue disambiguation

After v7.4.7 made ratings/reviews load, Shazin asked for: photo counts, click-into-"X unanswered" per listing, an explanation of red-flag logic, Bonbird venue disambiguation (all listings titled "Bonbird Chicken Shop"), and review pagination.

### `gbp-data.js`
- **Photo counts** — added v4 media API call (`GET /v4/{v4Name}/media?pageSize=1`), reads `totalMediaItemCount` → `loc.photoCount`. Fetched in parallel with reviews per location.
- **Newest-first** — reviews call now uses `orderBy=updateTime desc` (URL-encoded).
- **Uncapped queue** — was `unanswered.slice(0,5)` per location; now `slice(0,50)` (the full fetched page) so the per-listing filter shows everything we know about.
- **`locationAddr`** added to each queued review (= `loc.address`) so the UI can distinguish identical titles.
- **Health rules (documented):** RED = rating < 4.0. AMBER = listing data gaps (no hours / no description / no phone, set in parseLocation) OR >10 unanswered reviews. GREEN = healthy. Currently 0 red because all venues are 4.5–4.7 — working as intended, not broken.
- Cache v8 → v9.

### `index.html`
- `localSeoState` gains `allReviews` + `reviewFilter`. `renderReviewQueue(brand, apiPending)` now reads from state (no longer takes a reviews array).
- **Click-to-filter** — each location card's "X unanswered" is now a clickable link → `filterReviewQueue(v4Name)` filters the queue to that listing + scrolls to it. A filter bar with "✕ Show all" (`clearReviewFilter()`) shows the active filter + count.
- **Per-review venue line** now shows `locationName · locationAddr · timeAgo` so Bonbird reviews are attributable to the right shop.
- `removeReviewFromQueue(reviewId)` helper — on publish/skip, removes the card AND splices `allReviews` AND updates the badge (so it doesn't reappear when re-filtering). Used by both `approveReviewReply` and `dismissReview`.
- `renderLocalSeoFlags` — guards photo flag against null (`photoCount != null && < 5`), adds a "No description" aggregate flag, and labels duplicate-titled venues with their address.

### Pagination note
Reviews fetch the **newest 50 per location** (no follow-on pageToken loop). Unanswered reviews are almost always recent, so this covers active management. If a venue ever has >50 unanswered, older ones won't appear until newer ones are handled. A full pageToken loop can be added later if needed.

### Still pending
- Photos shows a count only — no thumbnail/upload UI.
- Rating-only reviews (no comment) are queued alongside commented ones; could be deprioritised/separated later.

---

## Session: June 2026 — v7.4.7 — Fix v4 reviews location-name format (the real "no data" bug)

After v7.4.4–v7.4.6, locations + hours + descriptions all loaded correctly (logs confirmed `hasHours=true hasDesc=true hasPhone=true` for every Pickl listing), but **ratings/reviews stayed empty**. Netlify logs showed the v4 reviews call returning **404** with the URL:
```
https://mybusiness.googleapis.com/v4/locations/16693459919947765190/reviews   ❌
```

### Root cause
The Business Information v1 API returns each location's `name` as **`locations/{id}`** (no account prefix). The legacy v4 Reviews API requires the **account-qualified** path:
```
https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{id}/reviews   ✅
```
Calling v4 with the bare `locations/{id}` path 404s. v7.4.4 built the reviews URL from `loc.id` (= `locations/{id}`), so every reviews call failed → `reviewsApiPending` stayed effectively dead and all ratings showed `—`.

### Fix (`gbp-data.js`)
- `parseLocation(loc, accountName)` now also computes **`v4Name`** = `${accountName}/locations/${locId}` (rebuilds the account-qualified path from the account the location was listed under in Step 2's loop).
- Step 3 reviews call uses `loc.v4Name` instead of `loc.id`.
- Unanswered review objects carry `locationId: loc.v4Name` so the reply endpoint in `gbp-reviews.js` (`PUT /v4/{locationId}/reviews/{reviewId}/reply`) also gets the correct account-qualified path — publishing replies works without further change.
- **Cache bumped v7 → v8.**

### readMask note (settled)
readMask **MUST** be `encodeURIComponent`'d (v7.4.6 restored this). v7.4.4 wrongly removed it → 400 "Invalid Request Message" on the locations list. Do not remove it again.

### Revert notes
- `gbp-data.js`: drop the `v4Name` field + `accountName` param from parseLocation; revert Step 3 to `loc.id`; revert cache to v7. (But this re-breaks reviews — don't.)

---

## Session: June 2026 — v7.4.4 — GBP reviews layer activated

### What changed
**`gbp-data.js`**
- **readMask encoding fixed** — was using `encodeURIComponent(readMask)` which encodes commas as `%2C`; some Google API versions don't re-decode them, causing `regularHours` and `profile` fields to come back empty (hence false "No hours set" / "No description" flags). Fix: pass readMask literally in the URL string.
- **v4 Reviews API added (Step 3)** — after fetching `brandLocations`, parallel-fetches `mybusiness.googleapis.com/v4/{loc.id}/reviews?pageSize=50` for each location. Populates `rating`, `totalReviews`, `unansweredReviews` on each location object. Sets `reviewsApiPending: false` when any call succeeds. Graceful fallback: if all calls return 403 (API not yet approved), `reviewsApiPending` stays `true` and locations keep `rating: null`.
- Low-rating locations (< 4.0★) are flagged `health: 'red'` and get a "Low rating (X★)" flag tag.
- Unanswered reviews (up to 5 per location) are collected into `data.reviews` array for the review queue.
- **Cache bumped to v5** (v4 cached unfiltered data + missing ratings).
- Added `timeAgo()` helper.

**`gbp-reviews.js`** — fully un-stubbed:
- `POST { action: 'draft', brand, stars, comment }` → calls Claude with brand voice prompt → returns `{ draft }`. No GBP tokens needed.
- `POST { action: 'publish_reply', reviewId, locationId, reply }` → token refresh → `PUT /v4/{locationId}/reviews/{reviewId}/reply` → returns `{ published: true }`.

**`index.html`**
- `const reviewStore = {}` — stores full review objects so `draftReviewReply` can access comment/stars without inline HTML encoding.
- Review cards redesigned: comment → editable `<textarea>` (pre-filled with `draftReply` if present) + "Draft with AI" button.
- `approveReviewReply(reviewId, locationId)` — reads textarea value, sends it as `reply` in POST body, removes card from DOM on success.
- `draftReviewReply(reviewId)` — calls `POST /api/gbp-reviews { action: 'draft', ... }`, fills textarea with result.
- `dismissReview(reviewId)` — removes card from DOM without API call; shows "No unanswered reviews 🎉" when last card is gone.

### Still pending
- **Photos** — `photoCount: null` until v4 media API is added.
- If v4 reviews API is not yet approved for this Google account, `reviewsApiPending` stays `true` → pending notice shows (no change from before). Ratings will populate automatically on next cache refresh once approved.

### Revert notes
- `gbp-data.js`: restore `encodeURIComponent(readMask)`, remove Step 3 reviews block, revert cache key to v4.
- `gbp-reviews.js`: restore the two early-return stubs at top of GET and POST handlers.
- `index.html`: revert `reviewStore`, review card HTML, and the three review functions.

---

## Session: June 2026 — v7.4.3 — GBP brand filtering (Pickl/Bonbird pills now work)

v7.4.2 made locations load (23 returned), but the Pickl/Bonbird pills did nothing — all 23 showed regardless. Cause: both brands live under ONE Google account ("Appetite"/Yolk), and `gbp-data.js` never filtered by the `?brand` param (it was used only for cache key + label).

### Fix (`gbp-data.js`)
- `parseLocation` now infers a `brand` from the listing title: name contains "pickl" → `pickl`, "bonbird" → `bonbird`, else `null` (e.g. "Appetite Head Office" is dropped from both brand views).
- Handler filters `allLocations` to `brandLocations` by the requested brand before building the result. debugNote distinguishes "found N but none matched <brand>" from "0 locations at all".
- **Cache key `v3` → `v4`** — v3 had cached the unfiltered 23-location result for both brands.

### Still NOT pulling (next batch — needs other APIs)
- **Rating / Reviews / Unanswered** → legacy **v4 reviews API** (`mybusiness.googleapis.com/v4`), still stubbed in `gbp-reviews.js`. `gbp-data.js` hardcodes `rating:null`, `unansweredReviews:0`.
- **Photos** → **v4 media API**, not built (`photoCount:null`).
- **Description / Hours flags** come from the Business Info data we DO have — likely genuine (many listings have no description set). Add a raw-response debug dump if they look wrong.

### Revert notes
- `gbp-data.js`: remove the `brand` field from parseLocation + the `brandLocations` filter (return `allLocations`), revert cache key to v3.

---

## Session: June 2026 — v7.4.2 — GBP location listing fixed (root cause of "No locations returned")

User confirmed GBP quota form approved + the 3 modern APIs enabled (Account Management, Business Information, Performance). Reconnect succeeded ("connection successful") but Local SEO still showed **"No locations returned from Google"**. Root cause found in `gbp-data.js`:

### Three bugs
1. **Wrong API for listing locations (the killer).** Step 2 listed locations from the **Account Management API** (`mybusinessaccountmanagement…/accounts/{id}/locations`) — that API has no locations endpoint. Locations live in the **Business Information API**. The call 404'd. (Regression: SETUP.md previously recorded a "fix" moving location listing *to* Account Management — wrong direction.)
2. **Missing `readMask`.** Business Information `locations.list` **requires** a `readMask` query param or returns `400 INVALID_ARGUMENT`. None was sent.
3. **Silent swallow.** Both failures were caught by `catch { console.warn }` and the empty result had no `error` field, so the v7.4.1 surfacing couldn't show it → generic "No locations returned" with zero signal. PLUS the empty result was cached for 6h.

### Fix (`gbp-data.js`)
- List locations from `BIZ_INFO_BASE` with `readMask=name,title,storefrontAddress,phoneNumbers,websiteUri,regularHours,metadata,profile`, with `pageToken` pagination.
- Parse locations **directly from the list response** — dropped the separate per-location detail loop (Step 3), saving N requests + quota.
- Capture `locError`; if 0 locations + error → return `{ error }` (front-end surfaces it). If 0 locations + no error → return `debugNote` ("connected to N accounts but 0 locations…").
- **Cache key bumped `v2` → `v3`** to bust the stale empty cache. Only non-empty results are now cached.

### Fix (`index.html` `loadLocalSeo`)
- Extended the v7.4.1 error branch to also fire on `debugNote` when 0 locations, with a distinct title ("Connected — but no locations found") so the 0-locations case is no longer a blank tab.

### If it STILL shows 0 locations after this deploy
The connected Google account doesn't *manage* the Pickl/Bonbird GBP listings, OR they're under a different account. The debugNote will say how many accounts were seen. Reconnect with the owning Google account.

### Revert notes
- `gbp-data.js`: restore Step 2 (Account Management list) + Step 3 (per-location detail loop), revert cache key to v2.
- `index.html`: revert the branch condition to `if (data.error)` only.

---

## Session: June 2026 — v7.4.1 — Markets run-log fix + GBP error surfacing (diagnostic pass)

### Markets ▶ Run log (index.html `runIntlMarket`)
- Background functions return `202` with `{}` — they never send a `summary`. The old code checked `data.summary` and always fell into the `⚠️ Completed with response: {}` branch. Now checks `res.status === 202/200` → `✅ Pipeline triggered — running in background (2–3 min)` + a link to the approvals queue.

### GBP / Local SEO — two swallowed-error bugs fixed (diagnostic only, no activation yet)
Goal of this pass: make GBP connection failures **visible** so we can see the real Google error (user reported "reconnect did nothing" + Google API usage showing errors).
1. **Page load ignored `?error=`** — GBP/GA4/GSC OAuth callbacks redirect to `/?error=…` on failure, but only `?gbp_connected=1` (success) was handled → failed reconnect silently returned to dashboard. Added an `oauthErr = urlParams.get('error')` handler → toast + console.warn with the decoded reason.
2. **`loadLocalSeo()` ignored `data.error`** — `gbp-data.js` returns `{ error, locations:[], reviewsApiPending:true }` (status 200) when the Google API call fails (quota=0, API not enabled, scope not granted), but the front-end only checked `data.notConnected` then rendered an empty tab. Added a `data.error` branch → shows the error state with the real message + `data.debugNote` + a Reconnect button.

### GBP architecture notes (for next session — activation)
- **No separate GBP API key.** GBP uses the shared OAuth app (`GOOGLE_CLIENT_ID`/`SECRET`). Credential = `gbpTokens` Blob (access+refresh) written by `auth-callback.js` on the `state=gbp` flow. Nothing extra needed in Netlify env vars.
- **Quota gotcha:** Business Profile APIs default to **0 quota** — enabling the APIs is not enough; you must be granted quota via the Business Profile API access request form. User confirmed (June 2026) the **API access/quota form was approved** → should now be unblocked.
- **Reviews = legacy v4 only:** reviews are available *only* via `mybusiness.googleapis.com/v4` (no v1 equivalent). `gbp-reviews.js` already has the full implementation written behind a stub early-return; activation = remove stub + add token refresh (currently reads `access_token` with no refresh → 401s after 1h).
- **`gbp-data.js` never fetches ratings/reviews** — hardcodes `rating:null`, `reviewsApiPending:true`. Avg Rating / Unanswered cards show `—` until v4 reviews fetch is added per location.
- **AI replies must be on-demand** (per-card button → `/api/claude`), NOT inline in `gbp-data.js` (10+ Claude calls would exceed the ~26s function timeout).

### Revert notes
- `runIntlMarket`: restore the `if (data.summary) {…} else {⚠️}` block.
- GBP: remove the `oauthErr` handler block and the `data.error` branch in `loadLocalSeo`.

---

## Session: June 2026 — v7.4.0 — Markets tab rework: per-market intelligence dashboard

Reworked Analytics → Markets from a simple card grid into a full per-market intelligence hub.

### Grid view (all/brand filter) — enhanced cards
- Each card now shows a **top opportunity preview** below the metrics row: `⚡ keyword — pos N` (first quick_win opportunity, or first opportunity of any tier)
- Card body is now **clickable** — clicking anywhere on the card (except the action buttons) opens the detail view for that market
- Removed the ▶ Run button from action row (replaced by ▶ Run in detail view); kept 📋 Queue and 🎯 Keywords as quick-links
- `kwOpps` now stores the full API response (`{ opportunities, summary, updatedAt }`) instead of just `summary`

### Per-market detail view (new)
Triggered by clicking a market pill or card. Renders full-width inside the grid container:
- **Gradient header** — large flag, market name, brand/language, action buttons (▶ Run Pipeline / 📋 View Queue / 🎯 Keywords)
- **6-metric row** — Top 10, Total KW, Avg Position (green if ≤20), Quick Wins (amber), Gaps (blue), Queued (green)
- **Top Ranking Keywords table** — GSC rows filtered to this market's URL slug, sorted by impressions (keyword / position / impressions). Shows "No GSC data yet" empty state.
- **Pending Items panel** — approval queue items for this market with type label and title (up to 5 shown, +N more count). Shows "No pending items" empty state.
- **Keyword Opportunities list** — up to 10 items, tier-badged (⚡ Quick Win / 📈 Push / 🎯 Gap) with keyword, position, impressions
- **Empty state** when no opportunities stored yet, prompting to run the pipeline

### New functions
- `selectMarketDetail(key)` — sets `intlState.activeMarket`, syncs pill state, renders detail
- `renderMarketDetail(key, m)` — builds full detail HTML string; filters `intlState.gscRows` and `intlState.allItems` by market (no extra API calls)

### intlState additions
- `gscRows: { pickl: [], bonbird: [] }` — stored at load time; reused by detail view
- `allItems: []` — all pending approval items; filtered per-market in detail view

### Navigation
- Detail → grid: click any brand pill or the "All" market pill (existing `switchIntlView` handles this)

### Revert notes
- Remove `selectMarketDetail` and `renderMarketDetail` functions; restore the original `renderIntlDashboard` from git history (no routing to detail, no top-opp preview); revert `kwOpps[mk] = d` → `if (d?.summary) kwOpps[mk] = d.summary`; remove `gscRows`/`allItems` from `intlState`

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

- v7.4.28 — **Closed-loop ranking attribution (gap #4 of 4).** The system generated content forever with no idea whether any of it moved a ranking. The publish path (`approvals.js`) ALREADY stamps every shipped item with a baseline — `trackingKeyword` + `positionAtPublish` + `publishedAt` (lines 316-318) — but nothing read it back. New `content-outcomes-background.js`: for each pushed/published item ≥14 days old, look up the keyword's CURRENT position from the GSC cache (`gscCache:https://eatpickl.com/` / `gscCache:sc-domain:bonbirdchicken.com`, rows `{keyword,position}`), compute `delta = positionAtPublish − positionNow` (positive = improved), patch the item with an `outcome` (+ history event), and aggregate into `contentOutcomes:<brand>` (totals: improved/declined/flat/awaitingAge/awaitingSignal). Re-measures weekly (REMEASURE_DAYS=7). Read endpoint `content-outcomes.js` (GET ?brand=). Cron: Mon 6am UTC (netlify.toml, alongside snapshots-background). ⚠️ NO UI yet — data is written + readable via API but not surfaced in a tab (follow-up). NOT live-tested.
- v7.4.27 — **Page-level competitor context (gap #3 of 4).** Content-gen saw only a bare keyword; now it writes to BEAT specific competitor pages. Matrix (`competitor-matrix-background.js`) now captures `url` in each `topDomains` entry (was domain+rank only — needs a fresh matrix run to populate; old rows degrade gracefully). Content-gen (`international-seo-background.js`): `loadCompetitorContext(market)` reads the matrix → `keyword → top-3 competing pages (domain/url/rank, our own domain excluded, rank ≤10)`; `competitorBrief(comps)` builds a "COMPETITORS TO BEAT" prompt block. Injected into every content path (quick-win page_update, content-gap page_update, page_creation, blog_draft) and carried into payloads as `competitors`. Fail-safe: no matrix data = empty block = unchanged behaviour.
- v7.4.26 — **Cannibalization guard (gap #2 of 4).** 9 markets share one `eatpickl.com` property; content-gen could create a new page/blog for a keyword we ALREADY have a dedicated page ranking for → two pages split authority. Existing dedup (`getQueuedKeywordsForMarket`) only covered *queued* items, not *published* pages. Added (`international-seo-background.js`): `buildOwnedKeywordMap(rowsWithPages)` (keyword→pages we rank for, from the whole-property GSC set) + `existingDedicatedPageFor(kw, currentPage, ownedMap, market)` (returns an existing dedicated page under `/<slug>/` ranking for the same keyword, else null). In `runMarketKeywordOpportunities` content-gap loop, the CREATE branches (page_creation / blog_draft — only fire when the market ROOT is ranking, not a dedicated page) now skip with a `cannibalization avoided` log if a dedicated page already exists for the keyword. Meta-rewrites + quick-wins untouched (they only UPDATE existing pages — no cannibalization risk). Limitation: EXACT-keyword match only (conservative — avoids false-positive blocking); fuzzy/intent-level dedup is a follow-up. Cross-market geo-keywords ("...riyadh" vs "...bahrain") differ, so they correctly don't collide. Gaps #3–4 (page-level competitor context, closed-loop attribution) pending — see memory `seo-content-intelligence-gaps`.
- v7.4.25 — **SERP-feature-aware content routing (gap #1 of 4).** Content-gen (`international-seo-background.js`) ignored the SERP features the competitor matrix already captures (`serpFeatures`: localPack/PAA/aiOverview/featuredSnippet/video per keyword) — it wrote a blog regardless of whether a blog could ever rank. Now: `loadSerpFeatureMap(market)` reads `competitorMatrix:<brand>:<brand>_<marketKey>` → `keyword→serpFeatures`; `serpFeatureBrief(features)` returns `{tag, directive, isLocal}`. Wired into `runMarketKeywordOpportunities`: (a) **local-pack keywords now route to a landing PAGE, not a blog** (`hasLocationIntent(kw) || sb.isLocal`); (b) feature-specific tactics injected into every prompt (PAA→FAQ schema, AI Overview→citation-friendly, featured snippet→snippet format, local pack→GBP/location copy); (c) `serpFeatures`+`serpFeatureTag` carried into all approval payloads so the reviewer sees the SERP context. Fail-safe: empty map (matrix not yet run) = no directive, behaviour unchanged. NOT yet applied to meta-rewrites (`runMarketDataDrivenSEO`) — follow-up. Gaps #2–4 (cannibalization guard, page-level competitor context, closed-loop attribution) still pending — see memory `seo-content-intelligence-gaps`.
- v7.4.24 — **Opportunities Arabic filter fail-open + batching.** The v7.4.21 language fix made KSA/Bahrain/Jordan return full Arabic keyword-idea batches (200 ideas), but `filterKeywordsWithClaude` (keyword-discovery-background.js) sent all ~200 in one Claude call and **failed closed** — Claude returned `[]` → every keyword discarded ("200 ideas → Claude filtered all as irrelevant"). Fix: (1) recurse in ≤50-keyword **batches** (raised max_tokens 800→1500); (2) **fail OPEN** — a batch of >10 returning zero keeps the batch rather than dropping it (zero from a big batch = filter failure, not a real all-irrelevant verdict). UAE/English unaffected (small batches that legitimately filter to >0). NOT yet live-tested — re-run an intl Opportunities refresh (e.g. Bahrain/KSA) to confirm Arabic opportunities now populate. ⚠️ STILL OPEN: competitor matrix runs Bonbird on Pickl-only markets (KSA) — Bonbird shouldn't run where it has no presence; separate fix.
- v7.4.23 — **Per-market competitor curation made reachable.** The hybrid per-market competitor UI (`renderCompetitorsIntl` in `js/competitor-matrix-ui.js`: auto-detected promotable chips + pinned list + add/remove + per-market save to `competitorConfig:<brand>:<market>`) was fully built, but the **UAE** branch of `renderCompetitors` called `renderHeader("competitors")` with **no opts** → no market dropdown → no way to switch to an intl market from the Manage Competitors tab (chicken-and-egg: the intl panel renders the dropdown, but you couldn't reach it). Fix: pass `{ showBrandFilter: true }` so the market dropdown shows in the UAE competitors view too; selecting a market re-routes to the per-market panel. Backend (`competitor-config.js` GET/POST with market param) + matrix consumer (manual overrides merged ahead of auto-detect) were already done in the v7.4.21 batch.
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
- GBP data fix: Account Management API used for listing locations (was using wrong API) — ⚠️ SUPERSEDED by v7.4.2: locations MUST be listed from the Business Information API with a readMask, NOT Account Management. Do not revert.
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

## Platform Migration: Netlify → Google VM (BIG lift — read before attempting)

A custom domain on Netlify (above) is cosmetic. **Moving OFF Netlify to a Google VM is a full re-platform** — the app depends on several Netlify-specific primitives. Plan for each:

1. **Netlify Functions → re-host.** All 51 `netlify/functions/*.js` are CommonJS handlers with the Netlify `(event) => { statusCode, body }` signature. On a VM you need an adapter (Express/Fastify route → build the `event` shape, map the return to `res`), or migrate to Google Cloud Run/Functions. Budget real effort — this is the bulk of the work.
2. **Netlify Blobs (`seo-tool` store) → new storage. THE critical one.** ALL app state lives in Blobs (approvals, GSC cache, competitor matrix, brand context, sessions, keyword data, sweep reports, etc.). No Blobs off Netlify. Export everything first, then migrate to GCS or Firestore and swap `getStore()` for the new client behind a thin wrapper. Nothing works until this is done.
3. **Crons (Netlify scheduled functions) → GCP Cloud Scheduler or system cron.** The `schedule=` lines in netlify.toml die on migration. Replace with Cloud Scheduler jobs (or crontab) that **HTTP POST the endpoints WITH the `x-nest-internal` header.** ⭐ This is exactly what `authorizeJob()` (v7.4.44) was designed for: on the VM, the cron sends the internal token → the job gate is fully token-secured, and the Netlify-only "scheduled invoke" branch simply goes unused. No code change to the gate needed.
4. **Env vars / secrets → VM env or GCP Secret Manager.** Move `ANTHROPIC_API_KEY`, `DATAFORSEO_*`, GSC OAuth tokens, `NETLIFY_AUTH_TOKEN` (the internal-token secret — the gates depend on it), `NETLIFY_SITE_ID`, etc. Rotate anything that was ever exposed while doing so.
5. **`netlify.toml` redirects (`/api/*` → `/.netlify/functions/*`) → nginx/Express routing.** Re-create the path mapping. NOTE CLAUDE.md rule 7: background functions were called at `/.netlify/functions/<name>` directly — on the VM they're just routes, so that quirk disappears.
6. **`process.env.URL`** (Netlify auto-sets it) → set manually to the VM's public URL; internal self-calls (Slack, function-to-function) read it.
7. **Deploy pipeline:** `git push → Netlify auto-deploy` becomes a VM deploy (git pull + process restart, or Cloud Build). Update SETUP/CLAUDE.md deploy instructions.
8. **Same as the domain checklist:** OAuth redirect URIs, Slack callback URL, GCS CORS → point at the new host.

**Auth note:** the internal-token model (`_lib/auth.js`) is domain- and host-independent — it survives the move untouched, provided `NETLIFY_AUTH_TOKEN` (the shared secret) is carried over and the crons/schedulers send the `x-nest-internal` header.

---

## Current Version: v7.4.62

Last built (v7.4.62): **2c validated live + Juffair (closed location) data fix.** `node --check` clean.
- **2c PROVEN end-to-end:** live generate-draft for a Bahrain quick-win → `meta_update` draft, `status:pending` (NOT published), wpAction update_meta, voiceScore 7, length-flag fired ("title 44<50"), current-meta compared. Loop closed: worklist → Generate → draft → review → publish.
- **DATA FIX:** the first live draft named "Juffair" (a CLOSED Bahrain location). Root: the v7.4.37 fix removed Juffair from `international-config.js` `locations` but MISSED two stale prose refs — the cultural-note (`:64`) + `brand.js:89` international line. Both corrected to "Riffa" (+ explicit "Juffair Square is closed — never mention it" guard). Generator was config-grounded (not hallucinating) — bad config. Verified no other Juffair refs remain.
- **NOTE (calibration, not a bug):** the /bh/ current meta was already strong; the tool rewrote to a shorter title rather than skipping. "Skip if already good" threshold could be tuned later.
- **QUEUE NOTE:** existing queued approval items were generated by OLD code — our improvements (scoring/prompts/Juffair/business-priority) do NOT retro-improve them. Triage: publish good, reject→rewrite (regens with current prompts) salvageable, dismiss stale (blind-sweep/Juffair/low-quality).

Last built (v7.4.61): **Stage 2c — one-click "Generate" from the worklist (meta-first, closes the loop).** `node --check` clean (backend + index.html JS). Credits back → unblocked. NEVER auto-publishes — creates a DRAFT for the human gate.
- **NEW `generate-draft.js`** (gated `authorize`; POST = manager/admin or internal) — on-demand single-item meta generation. Input `{brand, keyword, url, market, competitorPage}`. Reuses the PROVEN path: `get_current_meta` (live meta) → `buildBrandPrompt` + the single-candidate meta prompt with the shared `metaLengthRule` + menu + competitor-to-beat + Arabic-aware → `callClaude` → `runBrandVoiceCheck` → `metaLenIssues` → `createApproval` as a `meta_update` draft. Claude respects "skip if already good" (returns skipped, queues nothing). `/api/generate-draft` redirect added.
- **Worklist UI:** "⚡ Generate" button on any Opportunities row that has a page (targetPage or existingPage) → POSTs to generate-draft → toast "queued — review in Approvals". Content-gap-with-no-page rows keep the existing AI/Perch (meta-first: don't auto-spawn thin pages).
- **Scope:** v1 = META generation (safest, highest-ROI, proven). Full page/blog on-demand generation = later 2c phase (needs the cron generators factored out). The loop now runs end-to-end on demand: worklist → Generate → draft → approve → publish.
- **NEXT:** validate one live draft (queues, no publish); then tier-2 brand-aware UI; verify measurement.

Last built (v7.4.60): **Worklist confidence + strategic flags (surface "judgment as input" to a non-SEO reviewer).** `node --check` clean (backend + index.html JS). Second item of the "judgment as input" strategy.
- **`keyword-discovery-background.js`:** each opportunity now carries `confidence` ('high'|'medium'|'low', = count of independent signals: our position known + KD known + volume>0 + competitor data) and `flags` (advisory notes) via new `assessOpportunity()`. Flags include: "ranks via a generic/home page — a dedicated page would win it better" (`isGenericTargetPage` detects homepage + market-hub roots like /bh, /ksa), "difficulty unknown", "search volume unknown", "from keyword-expansion (weaker signal)". All derived from existing data — no new API cost.
- **Opportunities UI:** the Recommended-action cell now shows a colour-coded **confidence** label + a hoverable **⚑ N** flag count (full notes on hover). Tells a non-SEO which recs to trust vs double-check.
- **NEXT (queue):** 2c one-click Generate (credits back → unblocked); tier-2 brand-aware UI; verify measurement (closed-loop). Quarterly human-SEO audit = backstop.

Last built (v7.4.59): **Business-priority input → worklist re-weighting ("judgment as input").** `node --check` clean (backend + index.html JS). Implements the agreed top-priority from the "judgment as input" strategy (see [[seo-platform-roadmap]] memory + NEST-ROADMAP): capture the commercial judgment the SEO engine can't infer, so the worklist points at what makes money.
- **NEW `business-priority.js`** (gated `authorize`; POST = manager/admin only) — GET/POST `businessPriority:<brand>` Blob `{products:[terms], markets:[keys], growthNote}`. `/api/business-priority` redirect added.
- **`keyword-discovery-background.js`** loads it + applies a `businessBoost` (×1.4 if a keyword contains a priority product term, else ×1.0) to the opportunity score; stores `businessBoost` + `priorityMarket` on each opportunity. Neutral (×1.0) if unset → fully backward-compatible. Config-driven per brand (#12).
- **Settings UI:** new "💰 Business Priorities" card (mirrors SEO Goals) — priority products, priority markets, growth note; per-brand; saves via `apiPost`. `loadBusinessPriority()` hooked into settings-view load.
- Offline verified: with burger/smash priority, `burger near me` (raw 0.60 ×1.4 = 0.84) jumps above `chicken near me` (0.62 ×1.0). Re-weighting works.
- **NEXT (from the strategy):** surface strategic FLAGS + per-rec confidence on the worklist; then 2c one-click Generate; tier-2 brand-aware UI; verify measurement. Quarterly human-SEO audit = the backstop.

Last built (v7.4.58): **Shared SEO-meta length module + honest correction on "fact grounding".** `node --check` clean; validated with 2 bounded single-draft Claude tests (~2¢ total, no queue writes).
- **NEW `_lib/seo-meta.js`** — single source of truth for meta length (title 52-58/floor 50, desc 150-158/floor 148) + `metaLengthRule` prompt block + `metaLenIssues(title,desc)` checker. Scalable per CLAUDE.md #12: UAE + intl + any future brand read the numbers from ONE place. Wired into `scheduler-background.js` meta prompt (replaced the duplicated inline "52-58"/"150-158"). TODO (consolidation): intl `generateMetaUpdate` in international-seo-background.js should adopt the same module.
- **Length result:** one-draft test improved desc 138→149 (in-range) and title 45→49 (still 1 under the 50 floor). LESSON: prompt rules reduce but don't guarantee exact counts (same as the award-fabrication lesson) → the mechanical `metaLenIssues` flag is the real enforcement (surfaces short drafts to the human reviewer rather than silently queuing; not a hard-reject — wouldn't bin a good title over 1 char).
- **⚠️ CORRECTION — do not repeat:** I twice flagged accurate generator output as "fabrication" — "JLT" (a real Pickl location, in `PICKL_DEFAULT.locations.areas`) and "grain-fed beef" (a MANDATED brand phrase — brand.js:84 "always describe burgers this way"; on the menu). Both are TRUE and correctly grounded. I had added an "ingredient-honesty" blocklist rule to `buildBrandPrompt` forbidding "grain-fed" etc. — it contradicted the brand's own instruction and would suppress a real CTR differentiator. **REVERTED.** The existing menu/locations/awards grounding in `buildBrandPrompt` is working correctly. Lesson: verify against `brandCtx` before calling output a fabrication; over-eager fact-flags suppress good content.

Last built (v7.4.57): **Stage 2 recommendAction fix — `hasPage`-first (no duplicate-page recs).** Live validation caught it: a `content_gap` keyword we rank #64 for on `/bh/` was recommending "Create a location/landing page" (would cannibalize). Root: the content_gap branch didn't check `targetPage`. Fix: if we rank on ANY real page → optimise/strengthen it (page_update); only "create" when there's genuinely no page (targetPage AND no existingPage match). Validation before fix: Bahrain 100 opps, 92 targetPage, but 12 "create" recs — 4 of them on pages we already rank. After fix those flip to page_update. Re-ran to confirm.

Last built (v7.4.56): **Stage 2 — keyword→page→action worklist (2.3 crawler-fed create-vs-fix + 2b UI).** `node --check` clean (backend + index.html JS). NO Claude spend (pure JS + DataForSEO; the worklist doesn't need credits — only future 2c "Generate" does).
- **2.3 (backend, `keyword-discovery-background.js`):** each opportunity now resolves keyword→page→action definitively. Loads `pageInventory:<brand>` (crawler), filters to the market's pages, and `matchExistingPage()` (keyword content-token overlap ≥50% vs page url/title/h1) finds an EXISTING page even one we don't rank for. `recommendAction()` now: rank → optimise that page; don't rank but a relevant page EXISTS → "optimise existing (don't duplicate)"; genuinely no page → create (landing vs blog by intent). Adds `existingPage` to each opportunity. This closes Shazin's gap (GSC alone can't see a non-ranking page).
- **2b (UI, `index.html`):** Opportunities table now has a **"Recommended action"** column — action label + the exact page (target/existing path, or "＋ new page/post") + "beat: <competitor page>", with the rationale on hover. The worklist is now visible in Analytics → Opportunities.
- **NEXT:** re-run discovery so stored opportunities carry the new fields (done post-deploy), eyeball the worklist. Then 2c: wire a "Generate" that hands actionType+targetPage+competitorPage to the existing generators → approval → publish (needs Claude credits). Then tier-2 brand-aware UI. ON SHAZIN/IT: top up Claude credits.

Last built (v7.4.55): **Cross-brand competitor contamination fix + scalability rule (CLAUDE.md #12).**
- **Bug (found via live blobs):** `competitor-matrix-background.js:868` — the on-demand market refresh ran BOTH brands (`["pickl","bonbird"].map(...)`) for any market, ignoring who operates there → created `competitorMatrix:bonbird:pickl_ksa` etc. (Bonbird tracked in Pickl-only KSA/Bahrain + doubled DataForSEO spend). The monthly-cron path (line 879) was correct (`market.brand`); classic UAE-vs-intl two-path divergence. FIX: derive brand from `INTERNATIONAL_MARKETS[targetMarket].brand` for intl markets; UAE/null runs both (both brands operate there). UAE data verified clean (only the known off-brand `best burger in sharjah` Bonbird seed).
- **Cleanup:** deleted **32** contaminated blobs (wrong-brand across all 5 prefixes — competitorMatrix/Config/autoDetected/sovHistory/rankedKeywords — for every single-brand intl market, both directions).
- **CLAUDE.md rule #12 added — "Scalability is a build requirement."** New code must be config-driven, never hardcode brand/market lists inline; derive from `getMarketsForBrand`/`INTERNATIONAL_MARKETS` (backend) + one endpoint (frontend, brand-filtered). Onboarding a brand/market = one config record, not ~10 files.
- **Brand↔market scale plan (Shazin, tiered):** T1 ✅ this fix + cleanup. T2 (next, small-med): make UI market dropdowns DYNAMIC + brand-filtered from one endpoint — kill the hardcoded static `<option>` lists (index.html:971-981/1018-1028) + the `INTL_MARKETS` JS mirror; a brand not in a market must not appear. T3 (real refactor, after Stage 2.3): config→Blobs + Settings onboarding form + consolidate UAE+intl into ONE brand×market-parameterised pipeline (ends the whack-a-mole). See WS7 in `/NEST-ROADMAP.md`.

Last built (v7.4.54): **Site Audit crawler fix — `broken_links` renders as boolean not count.** First full deployed crawl (208 pages, health 82.31, all markets attributed, Oman=0 flagged) showed the page-issue chip printing literal "true broken link(s)". `item.broken_links` is a boolean on the OnPage /pages item → now shows "has broken links" (or "N broken links" if numeric). Re-crawled to regenerate stored issues. Audit findings confirmed valuable: 77 thin UAE pages (empty /location/* CPT, e.g. al-aali-mall=43 words), 101 missing meta, 66 orphan, 61 no-H1, 15 4xx.

Last built (v7.4.53): **Phase 2.2 — Site Audit UI (SEMrush-grade) + crawler sitemap-seeding fix.** `node --check` clean (functions + extracted index.html JS). Files: `onpage-audit-background.js`, `index.html`, `netlify.toml`.
- **Crawler coverage fix (validated locally, no deploy wasted):** default link-follow crawl found only 15 pages / ZERO market pages (they're standalone, not in nav). FIX: `respect_sitemap:true` + `custom_sitemap:https://<domain>/sitemap_index.xml` → 150+ pages incl. all /bh//ksa//egypt/ + /location/* . Default maxPages 150→250 (site has >150 pages); filters /cdn-cgi/ junk; poll cap 48×15s. Field paths verified against a live 10-page probe.
- **Site Audit UI:** new sub-mode in the Technical SEO tab — pill toggle `⚡ Speed & Vitals | 🔎 Site Audit`. `switchTechSeoMode` toggles `#techseo-mode-speed`/`#techseo-mode-audit`. Audit view: `buildScoreGauge` health score + Errors/Warnings/Notices scorecards + Coverage-by-market table (flags 0-page markets — the "Issues & Flags" seed) + Issues-by-type + filterable (market × issue) page list with severity-coloured issue chips. Own `Run Site Crawl` button → `apiPost('/api/onpage-audit',{brand})` → 15s poll on `crawledAt`. All rendered from data (no hardcoded markets — scalable per WS7).
- **Routing:** added `/api/onpage-audit` → `onpage-audit` redirect in netlify.toml (redirects are explicit per-function, no wildcard).
- **Crawl cadence:** MANUAL only for now (cost-conscious); optional monthly cron deferred.
- **NEXT:** after deploy, run a full crawl (sitemap-seeded → full coverage) + eyeball the Site Audit tab (UI needs human eyes). Then 2.3: feed `pageInventory` into Stage 2 create-vs-fix. Stage 2a groundwork still held in keyword-discovery. ON SHAZIN/IT: top up Claude credits (Stage 2c + Monday cron), rotate keys.

Last built (v7.4.52): **Phase 2.1 — site crawler / page inventory (DataForSEO OnPage) + Stage 2a groundwork (held).** `node --check` clean. Files: NEW `onpage-audit-background.js`, `onpage-audit.js`. Uses DataForSEO, NOT Claude (runs despite exhausted Anthropic credits). Full plan + SEMrush/Ahrefs competitive read + WS7 scalability/config-layer note in `/NEST-ROADMAP.md`.
- **Crawler (2.1):** `onpage-audit-background.js` (gated `authorizeJob`) — DataForSEO OnPage Standard mode: `task_post` (target=brand domain, `max_crawl_pages` default 150, cost-bounded) → poll `on_page/summary/{id}` until crawl finishes → `on_page/pages` for per-page detail. ONE crawl per brand domain covers ALL markets (flat structure); each page attributed to its market by URL via `getMarketPageTokens` (config-driven — zero changes when markets/brands added, per WS7 principle). Stores `pageInventory:<brand>` (the definitive page list Stage 2 needs: url, market, title, metaDescription, h1, wordCount, statusCode, indexable, issues[]), `onpageAudit:<brand>` (onpage_score + issue-count checks + per-market rollup for the "Issues & Flags" view), `onpageSnapshot:<brand>:<date>` (trend). Read: `onpage-audit.js` (gated `authorize`; GET ?brand=[&pages=1], POST fires the bg crawl). ⚠️ OnPage response field paths NOT doc-verified — stored `audit._debug.firstPageSample` to confirm on first live run.
- **Stage 2a groundwork (held, not surfaced):** `keyword-discovery-background.js` opportunities now carry `targetPage` (GSC page+query, via `noteOurPage`), `competitorPage` (matrix url), `action{actionType,label,rationale}` (`recommendAction()`). Reliable for "optimise" (we rank); the "create vs fix-existing" side is intentionally DEFERRED to consume `pageInventory` from the crawler (GSC alone can't tell if a non-ranking page EXISTS — Shazin's catch). Wired into Stage 2 after 2.1 validates.
- **NEXT:** trigger a live crawl (pickl, ~100 pages) → verify field paths via `_debug` + market attribution + issues → then 2.2 Technical-SEO audit view → 2.3 feed pageInventory into Stage 2 create-vs-fix → resume 2b/2c. DEFERRED: `GET /keyword-opportunities` ungated. ON SHAZIN/IT: top up Claude credits (for Stage 2c generation + Monday cron), rotate Anthropic/Slack keys.

Last built (v7.4.51): **Phase 1 quality pass — SEMrush/Ahrefs-grade opportunity scoring + GSC relevance gate.** `node --check` clean; scoring order offline-verified. File: `keyword-discovery-background.js`. Fixes the two quality problems the v7.4.50 live run exposed.
- **Problem 1 — non-food junk leaked from GSC:** our pages accidentally rank for off-category terms (`wok`/`public`/`lettuce`) which, being un-gated, scored high on raw volume. FIX: GSC organic candidates now pass `passesStaticRelevance` (the same food-category allowlist as ideas/competitor). Reverses the v7.4.40 "never gate GSC" call — validated necessary. Food quick-wins still pass; off-category dropped. Brand-navigational still dropped separately.
- **Problem 2 — scoring rewarded ALREADY-ranking over opportunity:** old winnability boosted pos≤10 (0.85) above pos 11–20 (0.7), so we-already-rank-#8 out-scored quick-wins, and ~60 zero-volume top-10 long-tail flooded intl lists. FIX: new `positionOpportunity` term (pos 11–20 quick-win=1.0, content-gap=0.9, push=0.55, already-top-10=0.15) is now the PRIMARY lever; `winnabilityScore` is KD-only (unknown=0.5); volume stays CAPPED (min/2000) so unknown-KD head terms can't dominate. Score = relevance × (0.30·vol + 0.30·positionOpp + 0.20·intent + 0.20·winnability). Plus: drop already-ranking top-10 with zero volume (near-won + no upside = noise).
- **Offline order check:** competitor-gap kd3 0.854 > head-term برجر(vol301k, unknown KD) 0.711 > top-10-with-real-vol 0.645 > quick-win-vol0 0.60 > top-10-vol0 0.345(dropped). Quick-wins/gaps now correctly beat already-ranking; head terms don't run away.
- **NEXT:** re-validate Qatar/Bahrain/KSA (expect: non-food gone, quick-wins/gaps on top, vol-0 top-10 flood cleared). Then Phase 1 fully closed → Phase 2 (crawler). DEFERRED: `GET /keyword-opportunities` ungated. NEW BACKLOG: "Issues & Flags" module (Shazin — flag markets with 0 footprint like Oman). ON SHAZIN/IT: TOP UP Claude API credits (content engine + Monday cron need it), rotate Anthropic/Slack keys.

Last built (v7.4.50): **GSC page+query rowLimit 5000→25000 (GSC max) + live-validated with GSC connected.** File: `_lib/gsc.js`.
- **Live findings (GSC reconnected, validated 2 Jul):** GSC page+query is now the active organic source (data shifted materially from the Labs fallback). First-party truth: our INTL market pages rank almost entirely for BRAND/navigational terms → after the brand filter, non-branded organic on Bahrain/KSA pages is tiny (2–3), so the opportunity lists are (correctly) competitor-gap-dominated.
- **GSC page presence confirmed:** Bahrain 7 pages/24k impr, KSA 4/30k, Qatar 4/10k, Egypt 5/72k, Jordan 2/12k — all URL-token-matched. **Oman: 0 pages / 0 impr** → genuinely no organic footprint AND not in Labs → 0 sourceable keywords is the TRUTH, not a bug. Oman needs pages built before any source can find keywords.
- **rowLimit bump:** low-traffic intl page+query rows sit in the long tail of a busy property; 5000 could clip them. Raised to 25000 (GSC max) so intl organic isn't silently truncated.
- **NEXT:** re-validate incl. Qatar (non-Labs but HAS a footprint — the real test that GSC helps non-Labs markets). Phase 1 then closed → Phase 2 (crawler). DEFERRED: `GET /keyword-opportunities` ungated. ON SHAZIN/IT: rotate Anthropic/Slack keys (GSC just reconnected).

Last built (v7.4.49): **Phase 1 COMPLETE — first-party GSC page+query as the primary "what we rank for" source.** `node --check` clean. Files: new `_lib/gsc.js`, `keyword-discovery-background.js`.
- **Why:** v7.4.48 used DataForSEO Labs `ranked_keywords` for our own rankings — accurate but (a) rented data, (b) Labs lacks Qatar/Oman/Pakistan, so those 3 markets had NO organic source. GSC is Google's first-party data: free, more accurate, and covers every market.
- **New `_lib/gsc.js`:** `getGscAccessToken(store)` (loads `gscTokens`, refreshes if expiring, persists) + `fetchGscPageQuery(site, token)` — the `['page','query']` dimension that gives each keyword its ranking URL (the whole-property query-only cache couldn't, which caused the v7.4.47 contamination).
- **Discovery now:** PRIMARY = GSC page+query, attributed to market by ranking URL via `belongsToMarket` (intl = URL matches market tokens; UAE = URL is not any intl page). Best position across a market's pages. Brand-navigational queries dropped. FALLBACK = Labs own-domain `ranked_keywords`, only when GSC yields nothing for the market (not connected / no local impressions) — so if the pending GSC key rotation breaks tokens, discovery degrades gracefully to Labs.
- **Fixes the last Phase-1 gap:** Qatar/Oman/Pakistan now get organic keywords (via GSC), and all markets get first-party-accurate positions.
- **NEXT:** re-validate live incl. a non-Labs market (Oman) to confirm it now returns organic data. Then Phase 1 is fully closed → Phase 2 (crawler). STILL DEFERRED: `GET /keyword-opportunities` ungated (rule-11). STILL ON SHAZIN/IT: rotate Anthropic/GSC/Slack keys.

Last built (v7.4.48): **Phase 1 — market-correct "what we rank for" + brand filter (fixes the v7.4.47 live-validation bugs).** `node --check` clean; helpers offline-verified. File: `keyword-discovery-background.js`.
- **Root cause found in live validation:** the GSC cache (`gscCache.rows`) is query-dimension only (`dimensions:['query']`, no page — [gsc-data.js:73](netlify/functions/gsc-data.js#L73)), so the intl per-market filter `row.page.includes('/'+marketSlug)` silently failed open → every intl market got all 500 property-wide UAE keywords with UAE positions mislabeled as local. Bahrain top-20 was ~14/20 branded-navigational + UAE-contaminated.
- **Fix — own-domain ranked keywords, URL-attributed (SEMrush/Ahrefs "Organic Research" model):** new `fetchOwnRankedKeywords` pulls OUR domain from DataForSEO Labs `ranked_keywords` (same endpoint the competitor matrix uses) — each keyword arrives WITH its ranking URL. `urlMatchesTokens` (via existing `getMarketPageTokens`, whole-segment, handles flat slugs like `/bahrain-locations/`) attributes each keyword to the market whose page it ranks on. Intl = URL matches that market's tokens; UAE = URL matches NO intl market. `gscMap`/organic candidates are now market-correct.
- **Brand filter:** `isOwnBrandKeyword` drops navigational brand searches (`pick*`/`بيك*` for Pickl, `bonbird*` for Bonbird) — they're not opportunities.
- **Coverage:** works for Labs markets (UAE/KSA/Bahrain/Jordan/Egypt). Qatar/Oman/Pakistan aren't in Labs → intl skips organic (leans on competitor+ideas); UAE falls back to the GSC-query cache. FOLLOW-UP: GSC `['page','query']` pull for first-party accuracy + full-market coverage.
- **NEXT:** re-run discovery (Bahrain/KSA/UAE) → eyeball top-20 (should now be market-correct, no brand junk). STILL DEFERRED (separate small fix): `GET /keyword-opportunities` is ungated ([keyword-opportunities.js:27](netlify/functions/keyword-opportunities.js#L27)) — rule-11 gap. STILL ON SHAZIN/IT: rotate Anthropic/GSC/Slack keys.

Last built (v7.4.47): **Phase 1 international keyword-first rebuild — DEPLOYED.** `node --check` clean + offline-sanity-checked. File: `keyword-discovery-background.js`. ⚠️ Live top-20-per-market acceptance gate STILL OWED (see NEXT below) — code is shipped, not yet validated against a real run.
- **GSC + competitor now PRIMARY candidate sources.** New `addCandidate`/`candidates` Map in `discoverKeywords`: GSC-ranked keywords become opportunities directly (were only position-annotation before → quick-wins were invisible); GSC bypasses the allowlist (relevant by construction); competitor keywords stay filtered; idea-expansion demoted to a supplement.
- **Scoring redesigned** (`scoreOpportunity`): `relevance × (0.35·volume + 0.25·winnability + 0.25·intent + 0.15·gap)`. `SOURCE_RELEVANCE` multiplier {gsc 1.0 / competitor 0.9 / idea 0.75} so weak-source keywords can't out-score primary ones on raw volume. New `intentScore` (EN+AR transactional>informational) + `winnabilityScore` (KD-driven, softened by our proximity) replace the old CPC/reachability terms.
- **KD=0/null = UNKNOWN, not easy** → neutral 0.5 winnability + stored as `null`. No-data long-tail can no longer masquerade as a slam-dunk.
- **Enrich-before-score** (batched → ~2 calls/lang) fixes the old enrich-after-slice bug that dropped 0-volume GSC/competitor keywords before backfill.
- Offline sanity: GSC quick-win 0.810 > competitor 0.626 > high-vol-KD0 idea 0.544 > recipe 0.203.
- **NEXT:** manual `?brand=&market=` discovery run (or Monday cron) → `/keyword-opportunities?brand=&market=` → **eyeball top-20/market** (the acceptance gate — genuinely ours, not branded/junk). Watch for branded/navigational GSC queries flooding top-20 (GSC un-gated by design); if so add a brand-name filter to GSC candidates. STILL ON SHAZIN/IT: rotate Anthropic/GSC/Slack keys (orthogonal to this deploy — old keys still valid, rotation is defense-in-depth).

Last built (v7.4.46): **SECURITY sweep COMPLETE — every function gated.**
- Gated the entire remaining tail in one batch. `-background` money/cron jobs (`authorizeJob`): ai-overview, backlinks, citations, llm-mentions, local-seo-pages, content-outcomes, snapshots, technical-seo, email-digest. On-demand HTTP (`authorize`, OPTIONS bypassed so CORS preflight still works): ai-overview, backlinks, citations, competitor-audit, competitor-matrix, content-outcomes, dataforseo-locations, ga4-data, gbp-data, gbp-reviews, gsc-data, hreflang, llm-mentions, reviews, technical-seo, calendar-media, sweep-report, seed-roadmap-tasks.
- Downstream wiring so gates don't break internal calls: `technical-seo`→`technical-seo-background` and `snapshots-background`→`gbp-data` now send `internalHeaders()`.
- **Coverage confirmed:** the ONLY ungated functions remaining are `auth-login` / `auth-callback` / `auth-logout` (OAuth flow — must be public) and `user-management` (gated by its own inline admin check). Nothing that spends money, mutates state, or returns non-public data is exposed.
- `node --check` passes on all. CLAUDE.md rule 11 (security is a build requirement) added so this stays true for new features.
- **STILL ON SHAZIN/IT: rotate Anthropic key + GSC OAuth tokens + Slack webhook** (were publicly retrievable pre-fix). Confirm Monday's crons fire (scheduled-invoke path can't be simulated locally).

Last built (v7.4.45): **SECURITY — gate slack-notify + perch-notify + fix seed-keywords regression.**
- `slack-notify` gated (`authorize`); its 6 internal callers (calendar, perch, perch-notify-background ×2, scheduler-background, international-seo-background) now send `internalHeaders()`. `perch-notify-background` gated (`authorizeJob`).
- REGRESSION FIX: `scheduler-background` read the now-gated `seed-keywords` without the internal header (would 401 the UAE content_gaps job) → fixed. CLAUDE.md rule 11 (security = build requirement) added.

Last built (v7.4.44): **SECURITY batch #2 — gate the expensive background jobs (cost/DoS fix, IT #3) + migration-proof design.**
- IT flagged (correct): `scheduler-background`, `international-seo-background`, `competitor-matrix-background`, `keyword-discovery-background` were reachable at `/.netlify/functions/<name>` with NO auth — anyone could loop them to run up Anthropic + DataForSEO bills. (Ironic given the intl cron was disabled for cost, but the manual trigger was wide open.)
- New `authorizeJob(event)` in `_lib/auth.js`: allows a **Netlify scheduled invoke** (no `httpMethod` — not an HTTP request, so an attacker hitting the URL can't forge it; `next_run` body as backup) **OR** the internal `x-nest-internal` header **OR** a valid session. Anonymous HTTP → 401. Applied to all 4 jobs.
- Fixed the internal trigger wrappers so they still work: `scheduler.js` and `keyword-opportunities.js` are now themselves gated (they were ungated doors that fire the jobs) AND send `internalHeaders()` when calling the background functions.
- **Migration-proof:** on the future Google VM, point Cloud Scheduler/cron at these endpoints with the `x-nest-internal` header → fully token-secured, scheduled-branch unused (see Platform Migration §3).
- ⚠️ **Interim limitation (Netlify only):** the `next_run` body marker is technically spoofable; the non-HTTP `!httpMethod` signal is not. Bare anonymous curls (the actual "loop the URL" attack) get 401. Fully closed at VM migration. **Verify the next scheduled (Monday) run still fires** — the one path that can't be simulated locally.

Last built (v7.4.43): 

Last built (v7.4.43): **SECURITY batch #1 — gate the ungated write endpoints + fix session-expiry bug.**
- Gated with `authorize(event)` (session or internal header, else 401): `brand-examples`, `keyword-config`, `competitor-config`, `seed-keywords`, `tech-tasks`. All are browser-called same-origin (session cookie), so signed-in users unaffected.
- `user-management.js`: fixed the inline session check — `expiresAt < Date.now()` passed when `expiresAt` was `undefined` (NaN comparison), so expiry-less sessions were valid forever. Now fails closed on missing expiry.
- Confirmed already-gated (grep false-positives): `perch.js` (getCurrentUser → 401) and `user-management.js` (admin-role check).
- **STILL TODO (batch #2, needs cron-safe design):** `-background` money-spenders publicly triggerable (scheduler/international-seo/competitor-matrix/keyword-discovery + others) — gate must allow the Netlify scheduled invocation (`next_run` marker) + internal header + session, block anonymous, and internal callers (keyword-opportunities→discovery, slack-notify's callers) must send `internalHeaders`. `slack-notify` gates with this batch. LOW: read endpoints (keyword-opportunities/sweep-report/content-outcomes/ai-overview/llm-mentions).
- **ACTION (Shazin/IT): rotate Anthropic key + GSC OAuth tokens + Slack webhook** — were publicly retrievable via the now-closed claude.js/db-get.js.

Last built (v7.4.42): 

Last built (v7.4.42): **SECURITY sweep — closed `db-get.js` credential leak + full function audit.**
- **CRITICAL fixed:** `db-get.js` was unauthenticated and returned `gscTokens` (Google Search Console OAuth tokens) + `slackWebhookUrl` + brand context to anyone hitting `/.netlify/functions/db-get`. Now gated via `authorize(event)`. **ACTION REQUIRED: rotate GSC OAuth tokens + Slack webhook** (they were publicly retrievable) — same as the Anthropic key.
- Ran a full auth sweep of all 51 functions. Findings tiered in memory + below. `user-management.js` confirmed SAFE (has an in-handler admin-role check; grep false-positive). Already-gated: approvals, calendar, db-save, wordpress, scheduler-background, international-seo-background, slack-callback, claude (v7.4.41).
- **Still ungated (prioritized, pending decision):** HIGH — reviews/gbp-reviews (Claude spend + publish to Google), on-demand DataForSEO spenders (backlinks, citations, competitor-audit, competitor-matrix, dataforseo-locations), slack-notify, email-digest. MEDIUM — config writers (keyword-config, seed-keywords, competitor-config, hreflang, technical-seo, tech-tasks, perch, calendar-media, scheduler) — some may already roll their own session check (verify per-file like user-management). MEDIUM — `-background` money-spenders triggerable by URL (cron tradeoff: gating naively can break scheduled invocation). LOW — read endpoints leaking SEO data (keyword-opportunities, sweep-report, content-outcomes, ai-overview, llm-mentions, brand-examples).

Last built (v7.4.41): 

Last built (v7.4.41): **SECURITY — closed the open Anthropic proxy (`claude.js`).**
- IT flagged (correctly, high severity): `/api/claude` → `functions/claude.js` was **unauthenticated** — anyone on the internet could POST arbitrary messages (choosing model + max_tokens) and it forwarded to Anthropic on our API key. A free LLM gateway billed to Yolk Brands + a jailbreak surface.
- Fix: `claude.js` now calls `authorize(event)` (from `_lib/auth.js`) and returns 401 unless the request carries a valid `yolk_session` (browser) or the `x-nest-internal` service header. The 3 legit callers are all in index.html via `apiPost` (same-origin → session cookie sent automatically), so signed-in users are unaffected; internal functions use `callClaude` directly (not this endpoint), so crons/pipelines are unaffected.
- Verified post-deploy: anonymous POST to `/api/claude` returns 401 (was 200 + forwarding).

Last built (v7.4.40): 

Last built (v7.4.40): **International REBUILD started — keyword-first (Phase 1, step 1: relevance allowlist).**
- STRATEGIC RESET (see `/NEST-ROADMAP.md` → "INTERNATIONAL REBUILD"). Evidenced findings: (1) the intl meta sweep was META-FIRST (no target keyword/position/KD feeding it) — architecturally wrong, now being discarded; (2) the keyword research is GARBAGE — pulled live data: KSA ~50% junk, Bahrain ~80% (ministries, museums, Zain telecom, prayer times, competitor restaurant brand-names scored TOP). Cause: broad idea-expansion + a negative-only English filter that fails open on Arabic; KD null everywhere. (3) UAE ~75% relevant only because the English filter works + rich home GSC — UAE is the right EXECUTION pattern (GSC-driven `runMarketDataDrivenSEO`), NOT a clean keyword foundation. SEMrush is good because it sources from your domain + competitors (relevant by construction); the Nest has those ingredients (GSC + competitor-ranked-keywords) but under-uses them.
- **Phase 1 step 1 shipped:** positive multilingual relevance allowlist (`RELEVANT_ROOTS` + `isRelevantKeyword`) in `applyStaticFilter` (keyword-discovery-background.js). A keyword now must carry a product/food root (EN+AR+UR); generic "restaurant"/"مطعم" alone is insufficient (kills competitor names). Applies to idea + competitor sources, NOT GSC (GSC = real by definition). Offline-validated vs live data: KSA 100→28, Bahrain 100→12, UAE 100→59 — all junk removed, real burger/chicken keywords kept.
- REMAINING Phase 1: competitor-keyword sourcing as primary, KD enrichment fix, scoring redesign (relevance not volume). Then Phase 2 crawler, Phase 3 mapping/prioritization, Phase 4 keyword-first execution (discard blind sweep), Phase 5 measurement.

Last built (v7.4.39): 

Last built (v7.4.39): **Fact-claim guard + real truncation fix + report-key fix (Workstream 1).**
- **Fact-claim guard (the big one):** verified-facts *grounding alone did NOT stop* Claude fabricating awards — a fresh Bahrain run still produced "four-time TimeOut Dubai Best Burger and Restaurant of the Year" (EN) and the same fabrication in Arabic. Added a mechanical backstop: `mentionsAward()` (EN+AR triggers) + `verifyAwardClaims()` — when award language appears, a strict fact-checker Claude call verifies every claim against `brandCtx.awards` and REJECTS the card if any is wrong-count / misattributed / combined / invented. Fails CLOSED. Runs only when award words present (cheap). This is the guarantee prompt rules couldn't give.
- **Truncation fix (real):** 5/6 cards were cut mid-phrase ("...in five heat", "...we bring", "...hand-breaded"). `cleanMeta` now trims to the LAST real sentence boundary (regex, threshold 40c); if that's under the min-length, the guard rejects it → regenerated, never shipped as a fragment. Prompt tightened: description 135-152 (EN) / 120-150 (AR), "ONE or TWO COMPLETE sentences ending in a full stop, never trail off."
- **Report-key fix:** `sweepReport` was written under the handler's loop key `pickl_bahrain` but read as `bahrain` → endpoint always looked empty. Now writes with `market.marketKey` (= `bahrain`), matching `/sweep-report?market=bahrain`.

Last built (v7.4.38): 

Last built (v7.4.38): **Sweep run-report + guard-ordering fix (Workstream 1 QA visibility).**
- **Guard-ordering bug (found in QA):** the meta min-length guard ran BEFORE the brand-voice fix, so a voice-fix that shortened the description below the minimum slipped through (journal card queued at 103c vs 110 min). Now re-checks length AFTER the voice fix too.
- **Run report:** `runMarketPageMetaSweep` now records every page decision `{slug, action: queued|skipped, reason}` (reasons: already-good / unknown-page / missing-fields / too-short / voice-reject / too-short-after-voicefix / already-pending) plus discovered + excluded slug lists. `processMarketLanguage` persists it to Blob `sweepReport:<brand>:<market>:<lang>`.
- **New read endpoint `sweep-report.js`:** `GET /.netlify/functions/sweep-report?brand=pickl&market=bahrain` → per-language report. Answers "why didn't this page generate?" without hunting Netlify logs — essential QA visibility for the verification-debt phase.

Last built (v7.4.37): 

Last built (v7.4.37): **Location-context intelligence fix (Workstream 1).**
- Two content-quality failures on the Bahrain run: (1) "Al Aali Mall, Riffa" read as ONE address instead of two separate outlets; (2) the journal page meta called the brand "Al Aali Mall's most talked-about burger spot" — shrinking a multi-location brand to one mall kiosk.
- Root cause: `buildMarketPrompt` fed locations as a bare comma-list with no "these are separate" signal and no page-type awareness. Fixed in `_lib/international-config.js`: locations now numbered as "N SEPARATE outlets — NEVER merge into one address", + a multi-location-brand instruction ("say 'and' not a comma") when >1 outlet.
- `runMarketPageMetaSweep` prompt now has a LOCATIONS-BY-PAGE-TYPE rule: journal/about/franchise/events pages speak to the WHOLE market brand; only locations/contact pages foreground specific outlets (as separate places).
- `buildMarketPrompt` is shared, so this improves blogs, on-page, and meta across all 9 markets. Also persisted the full build roadmap to repo `/NEST-ROADMAP.md`.
- **Also fixed: fabricated award facts (CRITICAL).** A Bahrain card claimed "Four-time TimeOut Dubai Best Burger winner" — FALSE. Truth: TimeOut Dubai Best Burger won 2×; Deliveroo Restaurant of the Year won 4×. Claude merged the two real awards + invented a count because there was NO canonical awards sheet (only one vague KSA cultural note). Fix: added `awards` field to `PICKL_DEFAULT` in `_lib/brand.js` (exact: TimeOut Best Burger ×2, Deliveroo RotY ×4) + a "VERIFIED FACTS & AWARDS — state ONLY these, never invent/inflate/combine, omit if unsure" section in `buildBrandPrompt` (so it grounds ALL generators, UAE + intl). `getBrandContext` backfills awards from default. Bonbird has NO awards on file → prompt instructs zero award claims until provided. Vague KSA cultural note corrected. **VERIFIED PICKL AWARDS (Shazin-confirmed):** Time Out Dubai Best Burger 2022 + 2023 (2×, never "four-time"); Deliveroo Restaurant of the Year 4 yrs running 2022–2025; Deliveroo Best Fried Chicken (year UNCONFIRMED 2022/2023 → state NO year); Deliveroo Best Homegrown Dubai 2025. ALL are Dubai/UAE awards — intl content may cite as Dubai *pedigree* only, NEVER localize ("never Bahrain's Best Burger winner"); intl awards unknown (assume none). Reconciled the intl "don't reference Dubai" rule to carve out this pedigree exception. **STILL PENDING: Bonbird verified facts/awards.**
- **Also fixed: mid-sentence meta endings.** `cleanMeta` trimmed clean at word boundary but left dangling connectors ("...corporate events, and" / "...dialled up across"). Now strips trailing conjunctions/prepositions after a trim. (The 21-char contact title was a STALE pre-v7.4.36 card, not a guard failure — guard `minTitle:25` is correct.)
- **Also fixed: "New market" card label on every intl item.** `index.html` flagged ANY international item with no GSC position/impressions as "Market Status: New market / No ranking history yet" — so established markets (Bahrain etc.) looked just-opened. Relabelled to "Ranking: Not yet ranking — No GSC data for this page yet" (accurate per-item, not per-market); var `isNewMarket`→`noRankingData`. Generation prompts unchanged (only Oman has `isNew`, correctly).

Last built (v7.4.36): **Meta sweep quality hardening (Workstream 1 of the platform roadmap).**
- First live Bahrain sweep produced 3/5 broken cards. Root causes fixed in `runMarketPageMetaSweep`:
  - **Markdown leaked into meta** (`**Your event called…**` rendered literally). New `cleanMeta()` helper strips bold/italic/code/heading/bullet markdown.
  - **Descriptions truncated mid-word** (`…ready for Bahr`). `cleanMeta()` trims at the last sentence end, else last word boundary — never mid-character. Replaces the old raw `.slice(0,160)`.
  - **Stub descriptions queued** (a 47-char Events desc). New min-length guard rejects title <25c or desc <110c (EN) / <90c (AR) before queuing.
  - **Prompt hardened:** plain-text-only (no markdown), complete-sentence required, and the page-type keyword must appear in the title (contact/franchise/locations pages keep their keyword + brand + market).
- `cleanMeta` unit-tested against the actual broken outputs. `node --check` passes.
- This is Workstream 1 of the refined roadmap (full roadmap in memory [[seo-platform-roadmap]] + [[seo-pipeline-full-audit]]). Remaining WS1: draft-vs-live tracking bug, decimal rounding, verification of untested v7.4.13–28 work.

Last built (v7.4.35): **International Monday cron DISABLED — manual-trigger only.**
- The weekly cron ran the full intl pipeline (≈3 blogs/market + meta sweep + on-page across 9 markets) every Monday 4am UTC, spending on the Anthropic API unattended. Shazin's call (2026-06-26): don't auto-run, trigger manually instead.
- Commented out `schedule` under `[functions."international-seo-background"]` in netlify.toml (function stays deployed + callable by URL; only the auto-fire stops). Re-enable = uncomment one line.
- **Manual trigger:** `/.netlify/functions/international-seo-background?market=<key>&only=meta` (drop `&only=meta` for the full blog+meta+onpage run).
- All other Monday crons (UAE scheduler, competitor-matrix, technical, llm-mentions, backlinks, citations, ai-overview, keyword-discovery) still run as before.

Last built (v7.4.34): **Meta sweep exclude list — skip legal/campaign pages.**
- First live Bahrain sweep discovered 12/143 pages correctly, but the token match also caught pages that aren't local-SEO targets: a "national day giveaway" T&C page and two `pickl-world-tour-*` campaign microsite pages.
- Added `PAGE_SLUG_EXCLUDE` + `isExcludedPageSlug()` in international-config.js — case-insensitive slug-substring blocklist for legal/utility/campaign pages: `terms-and-condition, terms-of, privacy, policy, cookie, giveaway, giveway` (live site has the typo "giveway"), `disclaimer, world-tour`. Applied in `runMarketPageMetaSweep` right after discovery; logs what it drops.
- Journal index pages (`journal-<market>`) are intentionally KEPT (legit meta target, Shazin's call).
- Verified against the real Bahrain slug list: 9 kept (bh, bh-arabic, bahrain-locations, franchise-bahrain, bahrain-events, bahrain-contact-us, bahrain-contact-us-arabic, bahrain-menu-arabic, journal-bahrain), 3 excluded (2× world-tour, 1× T&C giveaway).
- Applies to every market automatically.
- **Truncation bug fixed (found in first live Bahrain run):** intl `callClaude` had `max_tokens: 1500` hardcoded. The 6-page EN batch exceeded it → JSON array truncated → `extractJson` returned null → "Claude did not return JSON array" → 0 queued (the 3-page AR batch fit, so it worked). Fix: `callClaude` now takes an `opts.max_tokens` override (backwards compatible, default 1500); the sweep sizes it to the batch (`min(8000, 1200 + pages×380)`). Plus a salvage path — if the array is still truncated, parse up to the last complete `}` and close it, so partial batches still yield their complete items. Verified: recovers all complete objects from a mid-object truncation.

Last built (v7.4.33): **Full market page meta sweep — covers ALL country pages, not just the root.**
- **Problem:** intl meta only ever covered `/bh/` + `/bh-arabic/` (the seed block hardcoded the market root) and missed every country sub-page (`/bahrain-events/`, `/franchise-bahrain/`, `/bahrain-contact-us/`, `/ksa-locations/`, `/franchise-ksa/`, etc.). The GSC-driven path couldn't see them either — `marketPageMatcher` keyed off the root slug (`bh`) but the pages use the full country name (`bahrain`) in prefix OR suffix position, so they never matched. And most have too little GSC traffic to clear the impressions filter regardless.
- **Fix — page discovery by slug token.** New WP action `list_market_pages` (wordpress.js) enumerates all published pages and filters by the market's slug tokens, matched as whole hyphen/slash segments (so `bh` won't match `bhx`; `franchise-bahrain` matches token `bahrain`). Tokens defined in `MARKET_PAGE_TOKENS` + `getMarketPageTokens()` in international-config.js (abbr + full name, merged with marketSlug/arabicSlug). Verified: Bahrain matches bh/bh-arabic/bahrain-events/franchise-bahrain/bahrain-contact-us; correctly excludes /menu/, /sharjah/.
- **Fix — quality matched to UAE.** New `runMarketPageMetaSweep` mirrors UAE's `runMetaRewrites`: fetches current WP meta for every discovered page, batches them into ONE Claude call with skip-if-good logic ("only replace if vague/generic/missing"), tight char counts (EN 52-58 / 150-158 exactly — count them; AR 50-60 / 120-155), slug-aware page-type guidance (franchise page ≠ generic landing meta), real menu items + spice system injected. Per-page voice gate (≥8, one fix attempt). Card now shows side-by-side Current vs Proposed (added `currentMeta` passthrough in `queueApprovalItem`).
- **Dedup preserved.** Sweep reuses `getQueuedMetaMap`; GSC-driven items (real impressions) still win, sweep skips pages already pending. Replaces the old single-page seed block entirely (`generateMetaUpdate` deleted). Gated to en/ar passes only ('ur' pages covered by the English pass).
- **First run logs every discovered page** (slug list + token list) before queuing, so token-matching can be verified against the live site before anything is pushed.
- `node --check` passes on all three changed functions. WP password still must be rotated before approving/pushing any items.

Last built (v7.4.32): **Three on-page card bugs fixed.**
- **"Claude's Suggestion: —" always blank:** Frontend rendered `p.suggestion` but backend stored `p.suggestedCopy` — field name mismatch. On-page card now renders `suggestionTitle` (bold), `suggestionDetail` (muted 13px), and `suggestedCopy` as three distinct rows. `p.url || p.targetUrl` fallback added so the page link always shows.
- **focusKeyword polluted with character-count reasoning:** Claude was dumping verification notes into the last section (`### FOCUS_KEYWORD`) since nothing terminated its output. Fix: added `### END` marker after `### FOCUS_KEYWORD` in the prompt so `parseSection` stops cleanly. Also take first non-empty line only as belt-and-suspenders.
- **`?only=meta` param added:** `?only=meta,onpage` always ran on-page suggestions too. `?only=meta` now skips on-page generation entirely — use for pure meta-only focused runs. `?only=meta,onpage` still runs both. Full cron (no param) unchanged.

Last built (v7.4.31): **meta_update smart dedup — no more double-cards for the same page.**
- Two generators could both queue a `meta_update` for the same page+language: `runMarketDataDrivenSEO` (GSC-driven: has real position/impressions) and the `processMarketLanguage` seed block (blind: no GSC data). Now mutually aware.
- New helpers: `getQueuedMetaMap(brand)` → Map of `"normalizedUrl::language" → {id, status, isGscDriven}`. `dismissPendingMeta(id, reason)` → sets item to dismissed with audit note.
- **GSC-driven** now uses `alreadyQueuedMetaMap` instead of the old `alreadyQueuedPages` Set. Filter distinguishes: pushed/approved = skip (don't redo); GSC-driven pending = skip (first wins); seed-block pending = proceed AND dismiss the old one before queuing the better version. Quality reasoning: GSC-driven item has real impressions/position → always beats blind seed-block.
- **Seed block** now calls `getQueuedMetaMap` before queuing. If any meta_update is already pending for that page+language (whether GSC-driven or seed-block from a prior run) → skips with a console log.
- Net effect: one meta_update card per page per queue, always the highest-quality available version.
- `updateApproval` added to store.js import (needed for dismiss).
- Syntax-checked: `node --check` passes.

Last built (v7.4.30): **Intl content quality + all market locations audited and corrected.**
- `generateMetaUpdate`, `generateOnPageSuggestion`, `generateBlogDraft`, `runMarketKeywordOpportunities`, `runMarketDataDrivenSEO` all now inject the brand's actual menu item list and spice/heat system explicitly into prompts. Claude can no longer invent heat levels ("nuclear", "mild") or off-menu dishes — it's pinned to the real list from `brandCtx.menu.spiceSystem`. Works brand-aware: Pickl gets `Plain → The Reaper`, Bonbird gets `Plain Jane / Medium / Hot / XXX + flavours`.
- Voice score badge now shows on intl `meta_update` cards (was checked but never stored in payload).
- All market locations audited against live eatpickl.com/location + bonbirdchicken.com/locations: Bahrain (Juffair Square removed — closed, Riffa added); Qatar Pickl (Lusail→West Walk + District 1); Egypt (Hyde Park removed, Park St East→Park Street East); Oman Pickl (Al Hail removed — not open); Bonbird Oman (Souq Al Madina + Al Khoudh Seeb); Bonbird Pakistan (3 Lahore locations added, Karachi refs removed); Bonbird Qatar (West Walk + District 1). Pakistan seed keywords and cultural notes corrected to Lahore-only.

Last built (v7.4.29): **Group A — meta/on-page pipeline fixes (A1–A4).** Full forensic pre-fix before any re-run.

- **A1: `generateMetaUpdate` now fetches live WP meta** via `get_current_meta` before calling Claude — prompt includes current title/description so Claude can evaluate whether replacement is needed (not blind keyword injection). Returns null when `arabicSlug` is null (safety block). `generateOnPageSuggestion` now fetches the actual page HTML from WP REST (`wpPageCheck`-style fetch), strips tags, feeds up to 3000 words of real content to Claude. If page doesn't exist → generates "what this page SHOULD contain" guidance. Both now return properly structured SUGGESTION_TITLE / SUGGESTION_DETAIL / SUGGESTED_COPY (was freeform essay → blank cards). Null-checks added throughout callers.
- **A2: Publishing safety.** `handleCreatePage` in wordpress.js now resolves `wpParent` slug → numeric parent ID via `resolveParentId()` helper (WP REST `pages?slug=...`), so new pages are nested under `/ksa/`, `/bh/` etc. instead of publishing to root. `findPostByUrl` now verifies full canonical path match (new URL(...).pathname comparison) to prevent cross-market slug collisions (e.g. Bahrain and KSA both having a `best-burger` slug → wrong market updated). Arabic blog generation blocked when `market.arabicSlug` is null (`MAX_BLOGS_PER_MARKET=0`) so Arabic blogs don't land on English journal paths. `edit_approve` payload now merges (not replaces) — partial UI edits no longer drop `market/language/url/wpParent`.
- **A3: WP credentials stripped from payloads.** Removed `wpBase/wpUser/wpPass` from `queueApprovalItem` payload construction. They are now never persisted to Blobs or returned by `GET /api/approvals`. The push path (`wordpress.js getCreds`) always uses ENV vars — payload creds were dead weight + a plaintext leak. Remaining call-site references in data-driven paths (lines 260/485/590/663/751) are now silently ignored (Group B cleanup).
- **A4: `?only=meta,onpage` scope param.** Passing `?only=meta,onpage` to `international-seo-background` skips blog generation, bypasses the 7-day `wasRecentlyProcessed` cache, and skips `markProcessed` (so next full run can still generate blogs). Meta update + on-page suggestion always run. Use this for focused, cheap meta/onpage re-runs without the 3-blogs cost (~225–450 Claude calls saved).

Last built (v7.4.22): **Arabic GSC-driven optimization** (Perch backlog item — intl GSC jobs were EN-gated). The international content pipeline's two GSC-driven jobs (`runMarketDataDrivenSEO` = meta rewrites, `runMarketKeywordOpportunities` = quick-wins/content-gaps/page-creation/blog-drafts) only ran on the **English** pass (`if (language === 'en')`), so every Arabic-script search query (e.g. "pickl مطعم" pos 2.3 on /ksa/, "مطعم بيكل" on /bh-arabic/) was either processed as English or dropped. Live GSC has **111 Arabic-script queries for Pickl (64 on intl pages)** — real, unworked demand.
- Both functions now take a `language` param and **partition GSC queries by script** (`scriptMatch`: en → Latin, ar → Arabic `[؀-ۿ]`). Each language pass works only its own queries.
- Prompts built with `buildMarketPrompt(market, …, language)` (Arabic dialect rules) + an explicit `langDirective` so titles/descriptions/suggestions/body come back in Arabic; blog prompt's hardcoded "LANGUAGE: English" made language-aware; meta char-length rules switch to Arabic ranges.
- All 5 `createApproval` calls now tag `languageTag: <LANG>` and set `payload.language` + `nativeReview: 'pending'` for Arabic items (so the queue shows AR and routes to native-speaker review).
- Handler (`processMarketLanguage`) runs the GSC jobs for **en AND ar** passes (was en-only), passing `language`. `ur` (Pakistan) still gets seed content only — Urdu generation is a separate task.
- Additive + backwards-compatible: `language` defaults to `'en'`, so UAE/English behaviour is byte-identical. Backend-only (no UI change).
- NOTE: an Arabic query ranking an English page (/ksa/) will produce an Arabic meta suggestion for that page — the `nativeReview` gate lets a human redirect it to the Arabic mirror if needed.

Prior built (v7.4.21): KSA matrix all-blank fix — KD/volume + competitor ranks + aggregator leak. Reported as "KSA refresh shows nothing — Vol/mo, KD, competitor data all empty." Three real root causes, all live-verified against the DataForSEO API (creds pulled via `netlify env:get`):
- **KD/volume blank (the big one).** DataForSEO Labs is strict about `language_code`: KSA (2682), Jordan (2400) and Bahrain (2048) accept **only `ar`**; Pakistan (2586) `en,ur`; UAE/Egypt `ar,en` (confirmed by NAME via `dataforseo_labs/locations_and_languages` — NB the config's old fallback codes were wrong: Jordan was 2144=**Sri Lanka**, Bahrain 17000; both corrected to the real codes this pass so a cache miss can't send Jordan SEO to Sri Lanka). `_lib/keyword-metrics.js` was sending `en` for KSA → 40501, then **dropping** language_code on rejection → Labs then demands `language_name` → 40501 again → KD null for every keyword. Fix: new `postWithLang()` tries the keyword's natural-script language, then the location's **authoritative** languages (from `resolveLocation().languages`), and only drops language as a last resort. `enrichKeywordsMixed(...supportedLangs)` now threads those languages. Both callers updated (competitor-matrix-background via new `config.locationLanguages`; keyword-discovery via `loc.languages`). Live test: KSA "burger"→KD 19/vol 49.5k, "fried chicken"→KD 42/vol 3.6k (was null for all). Note: long-tail seeds (e.g. "أفضل برغر في الرياض") legitimately have no DataForSEO data and still show "—".
- **Competitor ranks all "—" on intl.** `fetchSerpRankings` keyed each row's `competitorRanks` by `config.competitors` (the curated UAE list — Shake Shack/etc.), but intl columns render the **auto-detected/manual** set → names never matched → every cell "—". Fix: for intl runs, after building `effectiveCompetitors`, re-key each row's `competitorRanks` from its `topDomains` (every top-20 domain+rank) via `domainMatches`. Replay against live KSA data: 20/22 rows now show ≥1 competitor rank (was 0). Auto-detected competitor names now use the **full domain** (was `split('.')[0]`, which produced duplicate "ar" columns for ar.timeoutriyadh.com / ar.tripadvisor.com).
- **Aggregator subdomain leak.** `isAggregatorDomain` only checked the **first** label, so `ar.timeoutriyadh.com` / `ar.tripadvisor.com` / `sa.wingie.com` saw "ar"/"sa" and slipped through as "competitors". Fix: prefix-match **every** non-TLD label; added `wanderlog`/`wingie` (travel aggregators). Unit-tested.
- No version bump needed on the UI file (pure data-shape fix); SERP/Standard-mode rules untouched. Labs/KeywordsData `/live` endpoints are unchanged (cheap synchronous DB queries — no Standard-mode equivalent, as already noted in code).

Prior built (v7.4.20): Keyword Difficulty + search-volume enrichment (research-parity #1; fixes the empty matrix Vol/mo).
- New `_lib/keyword-metrics.js` `enrichKeywords`/`enrichKeywordsMixed`: volume+cpc via `keywords_data/google_ads/search_volume/live`, KD (0–100) via `dataforseo_labs/google/bulk_keyword_difficulty/live`. Language-aware (splits Arabic↔ar), drops language_code on rejection, safe ({} on failure).
- competitor-matrix-background: enriches tracked-keyword rows with volume+cpc+KD after SERP (SERP doesn't return volume) → Vol/mo column now populates + new KD column. Skips markets not in Labs.
- keyword-discovery: enriches the top-100 opportunities with KD (+ backfills competitor-sourced volume).
- UI: matrix Rankings adds a colour-coded KD column; Keyword Opportunities table adds a KD column. cache-bust → v7.4.20.
- Cost: ~2 extra DataForSEO calls per market run (cheap, language-scoped). STILL OPEN from the research-parity track: traffic-estimation surfacing + OnPage full-site audit.

Prior fix (v7.4.19): comprehensive SEO-data audit (3 parallel agents) fixed in one batch.
- **Language-aware discovery** (the "Bahrain only 4 keywords" root cause): keyword-discovery now reads supported languages from `dfsLocations` and runs a Labs pass per language with matching seeds (ar seeds for KSA/Bahrain/Jordan, en for Pakistan, both for Egypt) via `resolveLocation()` (returns {code, languages, supported, inCache}). Stopped double-dropping zero-volume intl keywords; softened Claude dedup so Arabic morphological variants aren't collapsed.
- **Qatar/Oman graceful skip**: resolver signals `supported:false` for markets not in Labs → keyword-discovery + competitor-matrix skip the Labs calls with a clear diag instead of the cryptic 40501.
- **Shared aggregator helper** `_lib/aggregator-domains.js` (bare-term + boundary matching): fixes timeoutbahrain.com / zomato.qa / regional variants leaking as competitors, and the duplicate-blocklist drift between competitor-matrix-background + competitor-matrix. Boundary-aware rank attribution (no phantom ranks). AI-overview detection no longer drops real organic rows. Intl auto-detect threshold lowered to 2. SoV history de-dups same-day re-runs.
- **5 silent-UAE-write bugs fixed** (writes now respect the selected market, route intl to market-tagged briefs/config): addCompetitorFromAlert, cmAddDiscoveredCompetitor, executeAuditAction(queue), queueAuditKeyword, queueAllAuditOpportunities.
- **Misleading labels**: matrix no longer hardcodes "UAE (EN) · Desktop" — shows the active market via cmLocaleLabel(). cache-bust → v7.4.19.
- STILL OPEN (separate build): matrix Vol/mo column needs a Keyword-Data enrichment call (SERP doesn't return volume) — bundled with the KD + traffic research-parity task.

Prior fix (v7.4.18): WRONG DataForSEO location codes (Qatar=179 etc. → "40501 Invalid Field: location_code") + authoritative resolver covering ALL countries.
- Root cause: several intl `location_code`s in `_lib/international-config.js` were wrong/invalid for DataForSEO (Qatar 179, Bahrain 17000, Oman 2114, Jordan 2144 looked off; KSA 2682 / Egypt 2818 / Pakistan 2586 / UAE 2784 correct). This is a DIFFERENT error than the v7.4.13 language_code fix.
- Robust fix (not per-country patching): `dataforseo-locations.js` fetches DataForSEO Labs' authoritative `locations_and_languages`, caches a country→{code,iso,languages} map for ALL countries in Blobs `dfsLocations`, and returns a configured-vs-authoritative comparison. `_lib/dfs-locations.js resolveLocationCode(country, fallback)` reads it. Wired into keyword-discovery, competitor-matrix (loadBrandConfig), competitor-audit — each resolves its code by market.label, falling back to the config code if cache missing (so it can only improve, never break). Any future market resolves automatically by country.
- **MUST DO after deploy:** trigger `GET /.netlify/functions/dataforseo-locations` once to populate the cache (then all markets resolve authoritative codes). `?refresh=true` to refetch.

Prior fix (v7.4.17): KSA refresh quality — competitor junk, missing volume, Arabic over-acceptance.
- **Aggregator/social blocklist gaps** (caused reddit/x.com/timeout showing as "competitors"): added reddit, x.com, quora, medium, pinterest, threads, snapchat, booking, agoda, trustpilot, apple/app stores, indeed, glassdoor, bayt, mrsool, jahez, thechefz, ubereats to AGGREGATOR_DOMAINS (competitor-matrix-background) + EXCLUDE_DOMAINS (competitor-matrix) + SERP_OCCUPIER_TERMS (competitor-matrix-ui).
- **REGRESSION FIX**: v7.4.15 made `isRestaurantKeyword` blanket-accept ANY Arabic-script keyword → let competitor brands (ستاربكس) + off-menu (مطعم هندي, قهوة) through. Replaced with proper Arabic food/location accept + Arabic off-menu/brand reject lists. Also removed "coffee" from FOOD_TERMS.
- **Search volume now carried for competitor-sourced opportunities**: keyword-discovery discarded the real searchVolume from competitorRankedKeywords (set volume:0). Now carries volume + cpc via compMeta → opportunities show real volume.
- **Search volume now shown in the matrix**: added a "Vol/mo" column to the Rankings table (data was fetched but never displayed).
- **Strengthened off-menu reject** (OFF_MENU_DISHES): added coffee/cappuccino/latte + competitor brands (starbucks/mcdonald/kfc/herfy/albaik) + Arabic equivalents. cache-bust → v7.4.17.

Prior built (v7.4.16): snapshot capture for monthly-report trend history (the "start banking now" step). New background function `snapshots-background.js` (cron Mon 6am UTC, after the 4am jobs) writes dated, once-per-day, never-overwritten keys:
- `gbpSnapshot:<brand>:<YYYY-MM-DD>` — per-brand + per-location: avgRating, totalReviews, totalUnanswered, responseRateProxy, totalPhotos, health {green/amber/red}. (GBP only had a latest cache before — no trend.)
- `speedSnapshot:<brand>:<YYYY-MM-DD>` — the technicalSeo audit summary/results/intlResults/technicalChecks (technicalSeo:<brand> was overwritten each run — no trend).
- GSC / SoV / backlinks / AI-overview / LLM-mentions already keep their own history — not duplicated.
- Manual: `GET /.netlify/functions/snapshots-background?brand=pickl`. Feeds the future monthly SEO report (#1) + GBP monthly PDF (#5) + speed report (#6). Retention/pruning of dated keys = future nicety.

Prior built (v7.4.15): the four Nest-code P0 SEO fixes (structure/nesting P0 stays with the dev).
1. **Intl pipeline Arabic-aware** (root cause of KSA "1 keyword"): `.ar` seeds now used in keyword-discovery + competitor-matrix; SERP task_post sets `language_code` per keyword (Arabic script → 'ar'); `isRestaurantKeyword` accepts Arabic-script keywords; Claude relevance filter is market-aware + keeps Arabic; intl volume threshold relaxed (keyword_ideas minVolume 0, opportunity gate ≥1 for intl).
2. **Intl discovery → content wired**: `international-seo-background.js processMarketLanguage` now reads `keywordOpportunities:<brand>:<market>` and feeds the top opportunities (by tier+score, language-matched) into `generateBlogDraft` (was orphaned — discovery ran weekly but drove zero content).
3. **Stuck "tracking starts Monday" fixed**: `scheduler-background.js trackPublishedItems` keyword match normalised + fuzzy (containment/word-overlap) so ranking pages actually record `positionLatest`; the hardcoded Reports banner (index.html) reworded to a truthful "updates every Monday" instead of permanent "saving from next Monday".
4. **Silent UAE-write guards**: Manage Keywords (`competitor-matrix-ui.js renderKeywords`) shows a UAE-only notice on intl markets instead of overwriting the UAE list; matrix Gaps queue guarded the same; Opportunities "Queue" (`index.html queueOppKeyword`) now creates a market-tagged content-brief approval for intl instead of writing to the UAE seed list. competitor-matrix-ui cache-bust → v7.4.15.

Prior built (v7.4.14): Local SEO — location-page populator. New background function `local-seo-pages-background.js` turns empty/thin location pages into assets.
- Reads `gbpCache:<brand>:v9` (GBP locations: name/address/maps) → generates a UNIQUE, brand-voice location page per location (real area context, local keywords, internal links, image placeholders) + deterministic LocalBusiness/Restaurant JSON-LD schema → queues as a `page_creation` approval (NOT auto-published; human reviews then publishes via existing create_page, which resolves WP creds from `brand`).
- Voice gate ≥8 (hard-strip dashes + fixBrandVoice 3× loop). Dedup by `payload.locationId` against pending/pushed/published items.
- Manual trigger (no cron, to control cost): `GET /.netlify/functions/local-seo-pages-background?brand=pickl` (`&force=true`, `&limit=6`). Requires the GBP cache warm (open Local SEO tab once).
- NEXT: a "Generate location pages" button in the Local SEO tab; net-new locations (no page yet) wait for the intl nesting/CPT structure decision.

Prior fix (v7.4.13): DataForSEO Labs `language_code` rejection for non-UAE markets.
- Symptom: Opportunities tab showed "DataForSEO task error 40501: Invalid Field: 'language_code'. (loc 2682)" for KSA (and any market whose Labs DB doesn't pair with English).
- Root cause: DataForSEO Labs endpoints (`keyword_ideas`, `ranked_keywords`) validate the location+language pair. UAE (2784) accepts `en`; KSA (2682) and other Arabic-first markets reject it. `language_code` is OPTIONAL on these endpoints (auto-derived from location).
- Fix: retry/omit `language_code` on a language rejection in 3 places — `keyword-discovery-background.js` (`getKeywordIdeas`, retry without lang), `competitor-matrix-background.js` (`fetchCompetitorRankedKeywords`, one-time probe sets `useLanguage=false` for all domains), `competitor-audit.js` (`runKeywordAudit`, retry without lang). Only triggers on an actual language error → UAE + working markets unaffected. SERP `task_post` calls (which accept `en` everywhere) untouched. See memory → dataforseo-labs-language-code-gotcha.

Also v7.4.13: fixed bootstrap admin (Steve) "logged in but can't do anything" lockout.
- Root cause: `auth-user.js` (SPA login check) used `if (!session || session.expiresAt < Date.now())` — MISSING the `!session.expiresAt` guard that `_lib/auth.js` (mutation gate) has. A legacy pre-v7.3.9 session blob without `expiresAt` read as "authenticated" in auth-user (so the SPA never bounced to re-login) but was rejected by `_lib/auth` on every mutation → 401 on everything. Steve had a pre-tightening session; the invited manager had a fresh one with `expiresAt`, so she worked.
- Fix: `auth-user.js` now matches the stricter guard AND clears the stale cookie (`Set-Cookie ... Max-Age=0`) on an invalid session, forcing a clean Google re-login. Immediate unblock for Steve without waiting for deploy: hit `/api/auth/logout` or clear cookies / use incognito, then sign in.

Prior session built: International competitor matrix — Settings UI for per-market curation (step 5), completing the feature.
- `competitor-config.js`: GET/POST now market-aware. Intl reads/writes `competitorConfig:<brand>:<market>` — no UAE defaults/migration, empty list allowed (= pure auto-detect). UAE path unchanged.
- `competitor-matrix.js`: fixed read endpoint to use market-qualified `autoDetectedCompetitors:` + `competitorRankedKeywords:` keys (was reading unsuffixed → would've shown empty for intl after the v7.4.11 writer change).
- `competitor-matrix-ui.js`: `renderCompetitors` branches to `renderCompetitorsIntl` for non-UAE markets. Shows auto-detected domains (with top-10 appearance counts) as one-click "promote to pinned" chips, plus a manual pinned-competitor list with add/remove/save per market. `loadCompetitorConfig` market-aware. Script cache-bust bumped to v7.4.12.
- **Verify post-deploy:** pick an intl market in the matrix market dropdown → Refresh Now (forces a run incl. intl) → Manage Competitors tab → auto-detected domains should populate; pin a few, Save; next run uses manual ∪ auto.

Prior session: International competitor matrix — all 4 wiring gaps closed (v7.4.11).
- `competitor-matrix-background.js`: `processBrand` now takes `marketParam`; AUTO_DETECT_KEY + RANKED_KEYWORDS_KEY market-qualified (`:${market}` suffix, UAE stays unsuffixed for back-compat); effective competitor set = manual `competitorConfig:<brand>:<market>` ∪ top-10 auto-detected (hybrid); Labs call + SoV use effective set; results keyed `brand:market`; handler loops all intl markets monthly (first Monday, UTC date 1–7) or on `?force=true`.
- `keyword-discovery-background.js`: removed `!isIntl` guard; reads `competitorRankedKeywords:<brand>:<market>` for intl runs — intl discovery now scores with full competitor-gap signal.
- `_lib/brand.js` — `hardStripBannedTokens()` (deterministically removes em/en dashes before queuing); fixed `fixBrandVoice` improved logic to accept rewrites that clear flagged issues even when numeric score is flat (`issuesCleared` check).
- `international-seo-background.js` — raised queue bar to ≥8/10 across all intl paths (was ≥5): `generateBlogDraft` returns null + logs rejection; `processMarketLanguage` blog loop handles null; meta_update in both `runMarketDataDrivenSEO` and `processMarketLanguage` now has fix+gate; `runMarketKeywordOpportunities` blog_draft now gates on body (not just meta title/description); all `fixBrandVoice` calls now pass `feedbackNotes`; `page_creation` threshold raised from <5 to <8.
- UAE scheduler paths (`scheduler-background.js`) already had correct ≥5 reject + feedbackNotes — left untouched.

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

### v7.8.4 — Technical audit was auditing the OLD Bonbird site (+ market attribution)

**Trigger:** "why is the technical audit for bonbird not returning results? are we still hitting old urls?" — yes, we were. Two distinct faults, both found by reading code and then verified against the live site with `curl`.

**1. WP page discovery was dead for EVERY brand (regression, `technical-seo-background.js`).**
`getCorePages()` referenced `brandCfg.gscProperty`, but `brandCfg` is declared inside `exports.handler` — not in that function's scope. The ReferenceError was swallowed by the enclosing `try`, which logged *"WP pages fetch failed, using priority pages only"*. Net effect: the audit never discovered any WordPress page and fell back to the hardcoded priority list alone. Introduced during the `getBrand()` migration. Fixed by passing `brandCfg` in as a parameter.

**2. The priority list held pre-rebuild Bonbird URLs — now config-driven.**
`PRIORITY_PAGES.bonbird` was `/uae-menu/`, `/locations`, `/franchise`, `/philosophy` and the bare root. Verified live: all five **301** (they don't 404) — so PSI still returned data, just for a redirect chain against the wrong page set. The 301 targets revealed the real paths. Replaced with `brandsConfig.priorityPaths` (paths, not full URLs — the domain comes from config), so the next site restructure is a config edit. The stale Bonbird literal is deleted; Pickl's stays as a seed (its site is still being fixed — left alone deliberately).

Audit now hits 12 pages, **every one verified `200` live**: `/ae/`, `/ae/menu/`, `/ae/locations/`, `/ae/franchise/`, `/ae/philosophy/`, `/ae/dubai/`, `/ae/sharjah/`, `/ae/abu-dhabi/`, `/ae/chicken/` + `/om/ /pk/ /qa/` from market config. (The intl half was already correct — `getInternationalPages()` derives from `INTERNATIONAL_MARKETS` and filters by brand, so it picked up the v7.7.9 ISO fix for free.)

**3. `scheduler-background.js getLocationTag()` still attributed by word slug.** Its Bonbird branch matched only `/oman/ /pakistan/ /qatar/`, so every post-rebuild URL fell through to the UAE default — silently mis-attributing all new intl content. Now delegates to `marketForUrl()`, which reads `MARKET_PAGE_TOKENS` (holds BOTH the ISO slug and the legacy word, so historical GSC rows still attribute). Verified with a 10-URL table: new ISO, legacy, and `/ae/` sub-paths all resolve correctly. **Pickl's branch left untouched on purpose** — `urlMatchesTokens` would not match `/pickl-jordan/` for token `jordan` (the code comment claiming it does is wrong), so delegating Pickl would have regressed Jordan.

**4. `index.html` INTL_MARKETS seed** — Bonbird rows carried the old word slugs. `bootstrapBrands()` overwrites this from `/api/config`, so it was only the pre-bootstrap fallback, but a wrong fallback is a trap. Now `om`/`pk`/`qa`.

**Checked and deliberately NOT changed:** `ga4-data.js MARKET_PATHS` looks stale (`/oman/` etc.) but is **inert** — only `Object.keys()` is read and the frontend never consumes `marketPaths`, so it's dead config, not a live bug. `international-seo-background.js:1419` matches market words inside *keywords*, not URLs — correct as-is. The audit's trigger path was already correct (direct `/.netlify/functions/` + `internalHeaders()`, per rule 7).

**Still unverified live:** whether a *completed* `technicalSeo:bonbird` record exists. Both faults above degrade the audit's page set rather than emptying it, so if the panel is still blank after a fresh run, the next thing to check is whether the run completes at all (Netlify function log for `[tech-seo]`).

### v7.8.5 — Markets tab dead + 3 more ReferenceErrors + a checker that actually catches them

**Trigger:** "the markets tab is also giving error: brand is not defined ... how did you mess this one up?" Fair. Root cause and, more importantly, the reason my checks kept missing this class of bug.

**The Markets tab.** `index.html` had `const brandLbl = m.brandName(brand);` in **two** places — [9056](index.html:9056) (market cards) and [9127](index.html:9127) (`renderMarketDetail`, i.e. clicking into a market). Both should be `brandName(m.brand)`; the adjacent line already read `brandColor(m.brand)` correctly. Corruption from the WS4 bulk brand-migration replace. JS evaluates call arguments before the property lookup, so the bare `brand` threw `ReferenceError: brand is not defined` before `m.brandName` was ever found — hence the exact message.

**Why my v7.7.8 sweep missed it:** that sweep regexed for `const X = X(` (self-referential declarations). This corruption is `obj.helper(arg)` — a different shape, invisible to that regex. Hand-rolled regexes only catch the shape you already thought of.

**So: a real static check.** `tools/check.sh` (`npm run check`) = `node --check` **plus** an ESLint `no-undef` pass over `netlify/functions`, `js/*.js`, and the extracted `index.html` inline JS (extraction preserves original line numbers, so hits map 1:1 to index.html). Runs via `npx eslint@9` — **no new repo dependency**, and with no `[build]` command in netlify.toml the Netlify build never runs it. Proof it works: re-introducing the v7.8.4 `brandCfg` bug into a scratch copy → `node --check` **passes**, `no-undef` flags it in one second.

**Two further real bugs it found immediately, both previously invisible:**
- 🔴 `generate-draft.js generateTemplatePage()` interpolated `${intelDirective}` but never declared it (the other three generators each declare it). **This is the Phase 2 "⚡ Generate body" path shipped in v7.8.2 — it would have thrown ReferenceError on the very first click.** Fixed by declaring it from the in-scope `intel`.
- 🔴 `scheduler-background.js generatePerformanceSummary()` called `store()`, which is not in scope → the **Monday performance narrative** for the Reports tab has been throwing. Now `getStore({name:'seo-tool', …})`, matching the other five call sites in the file.

**Also removed:** a dead `if (typeof BRAND_COLORS === 'object')` line in `bootstrapBrands()` — `BRAND_COLORS` is not a global anywhere, so the branch never ran; `competitor-matrix-ui.js` resolves colours via its `cmBrandMeta` proxy and `renderPerch` derives its own from `NEST_BRANDS`.

**CLAUDE.md rule 10 rewritten** from "syntax check" to "run `npm run check`", with these three failures recorded as the reason.

**Honest scope note:** `no-undef` catches unbound identifiers. It does **not** catch wrong-but-defined values (e.g. a stale hardcoded URL, or `esc()` where `escJs()` was meant). Those still need reading and live verification.

### v7.8.6 — Tech audit "returns nothing" was a SILENT mid-run crash (now self-diagnosing)

**Trigger:** after v7.8.4/v7.8.5 deployed (confirmed live — `?v=7.7.7` marker matches, background fn gated 403), the Bonbird technical audit still showed nothing.

**Ruled out by testing, not assumption:** deploy is current (live markers match local); `technical-seo-background.js` module loads with no require-time crash; `getBrand('bonbird')` always resolves (falls back to the seed record, never null → the `if (!brandCfg) return` guard can't fire); `authorizeJob` accepts the wrapper's `internalHeaders()`; `runPageSpeed` has a 45s timeout and its throws are caught **per page**, so every audited page writes either a score or an `{error}` row. Net: **if the audit runs at all, `results` is non-empty.** So "nothing" means the background handler dies mid-run.

**The mechanism:** the handler body had **no top-level try/catch**. PART 3 (`runSiteChecks`) and `buildSummary` are unwrapped — a throw there (or anywhere after the loops) kills the function *after* the initial `status:'running'` write but *before* `status:'complete'`. The record stays frozen on `running`. The frontend shows that as a spinner forever, and the `/api/technical-seo` POST guard then refuses to re-trigger for 5 minutes ("already in progress") — so re-clicking Run Audit does nothing. That is the "returns nothing" symptom.

**Fix (safe — cannot affect the happy path):**
- Wrapped the whole PART 1/2/3 body in try/catch. Any unhandled failure now writes `status:'error'` + `error:<message>` + `completedAt`, so the record never stays stuck on `running` and the **next run shows the actual error**.
- PART 3 `runSiteChecks` and `buildSummary` made individually non-fatal (try/catch → null) so a site-check failure can no longer discard the PSI results that already succeeded.
- Frontend `renderTechSeoResults`: added a `status:'error'` branch that shows the failure reason in the panel (⚠️ + message) and re-enables the Run button, instead of rendering a blank card.

**Why this is the right move regardless of the underlying error:** the audit was failing *invisibly*. Now it fails *loudly* — the next run will either succeed or tell us exactly which call threw (most likely candidate: PageSpeed rate-limiting if `GOOGLE_PAGESPEED_KEY` is unset, which would surface as `PSI 429` rows). Precise fix to follow once the real error is visible.

**Still owed:** one live reading to confirm the underlying throw (see session notes). `no-undef`/`npm run check` pass.

### v7.8.7 — THE actual cause: the background audit was never invoked (un-awaited trigger)

**Trigger:** "nothing is happening, nothing is showing in technical seo background logs." That was the decisive clue — zero logs in `technical-seo-background` means the function is **never invoked**, so every earlier fix (v7.8.4 URLs, v7.8.6 crash-hardening) was downstream of the real fault. (Also confirmed: Claude API balance is irrelevant — this audit uses PageSpeed + WordPress, never Claude.)

**Root cause:** `technical-seo.js` fired the background function with an **un-awaited** `fetch()` (commented "non-blocking — we don't await it"). On AWS Lambda / Netlify Functions the execution context is frozen the instant the handler returns — so a fire-and-forget fetch that hasn't completed **never actually sends**. The wrapper returned its 202 immediately and the background invocation was dropped every time. The sibling triggers `backlinks.js` and `ai-overview.js` already carry the fix as a comment: *"MUST await — an un-awaited fetch is frozen when the function returns, so the background invocation never fires. Awaiting resolves on the fast 202."* technical-seo.js simply hadn't followed it.

**Fix:** added `await` to the trigger fetch in `technical-seo.js`. Background functions return 202 immediately then run up to 15 min, so awaiting resolves fast and does not block the user.

**Same bug found by sweep and also fixed:** `onpage-audit.js:46` (the full-site "Site Audit" crawler) had the identical un-awaited fire-and-forget → its background crawl never fired either. Now awaited. Swept all `-background` triggers; no un-awaited ones remain.

**Lesson:** "returns nothing" + "no logs in the background function" = invocation problem, not audit-logic problem. Check the *trigger* (await + direct `/.netlify/functions/<name>` path per rule 7) before touching the audit. v7.8.6's crash-hardening still stands — it just addressed a failure mode that could only occur *once the function actually runs*, which it now will.

### v7.8.8 — instrument the tech audit so invocation is never ambiguous

**Trigger:** after v7.8.7 the background function STILL showed no `[tech-seo]` logs. A manual run logged only `Duration: 4.83 ms, Memory 85 MB` — i.e. it WAS invoked but returned instantly at an early `return`, before the first log line (a manual GET carries no body → `brand` undefined → `if (!brandCfg) return;` fires silently).

**Changes (pure instrumentation + testability — no logic change to the audit itself):**
- `technical-seo-background.js`: logs `[tech-seo] INVOKED method=… auth=… via=… brand=…` **before any guard**, so "no logs at all" can never again be ambiguous between *never invoked* and *invoked-then-early-returned*. Both early returns now log their reason (`ABORT: not authenticated` / `ABORT: no brand config`). Also accepts `?brand=bonbird` from the query string, so a manual dashboard/browser run can actually reach the audit (previously only a POST body worked).
- `technical-seo.js` (wrapper): logs `firing background for <brand>` + the background's response status, and logs `SKIP trigger … still marked running (guard: 5 min)` when the anti-double-trigger guard blocks a re-click — a common reason re-clicking Run Audit appears to do nothing.

**How to read the next run:**
- Click Run Audit, then check BOTH function logs.
- `technical-seo` (wrapper) should log `firing background … -> …/technical-seo-background` then `background responded 202`. If instead it logs `SKIP trigger`, a stale `running` record is blocking — wait 5 min or it self-clears now that v7.8.6 writes a terminal status.
- `technical-seo-background` should log `INVOKED … brand=bonbird` then `START bonbird @ https://bonbirdchicken.com` then per-page `PSI:` lines. Whichever line is the LAST one printed pins the exact failure point.

### v7.8.9 — THE root cause: brand was sent in the POST body to a SCHEDULED function

**Decisive log (manual dashboard invoke):** `[tech-seo] INVOKED method=POST auth=true via=scheduled brand=(none)`. Two facts in one line: (a) the function IS reachable and auth works; (b) `via=scheduled` + `brand=(none)` means Netlify delivered a **synthetic scheduled-event body** (`isScheduledInvoke` matches `"next_run"`) and the caller's payload was gone.

**Root cause:** `technical-seo-background` has `schedule = "0 4 * * 1"` in netlify.toml → Netlify treats it as a scheduled function. `technical-seo.js` was firing it with `brand` in the **POST body**. The proven-working siblings do NOT: `backlinks.js` and `ai-overview.js` pass `?brand=` in the **query string** via GET, precisely because the body isn't reliably delivered here. So Bonbird's brand never arrived → `if (!brandCfg) return` → the audit did nothing, every time.

**Second bug exposed by the same root cause:** the **Monday 4am cron** invokes this function with a scheduled event and *no brand at all* → it hit the same early return → **the weekly audit has been silently auditing nothing for every brand.**

**Fixes:**
- `technical-seo.js`: fire the background via **GET + `?brand=`** with `internalHeaders()` (matches backlinks.js/ai-overview.js exactly), instead of a POST body.
- `technical-seo-background.js`: refactored the per-brand work into `runAuditForBrand(brand, brandCfg)`. The handler now: with a brand → audit that one; **with no brand (the cron) → iterate `getBrandSlugs()` and audit every brand.** So the scheduled run finally does real work.
- (v7.8.8 instrumentation retained: `INVOKED`/`START`/`ABORT` logs, `?brand=` accepted from the query.)

**Confidence + honest caveat:** the query-string change matches code that is known to work for the identical scheduled-function setup, so I'm confident in the mechanism. The one thing only a live run confirms is that an HTTP GET to this function surfaces `queryStringParameters.brand` (the dashboard "Run" simulates a *cron* event, which is why that path shows `via=scheduled`; a real HTTP GET from the wrapper should be `via=internal` with the brand present). The v7.8.8 logs will show it plainly.

### v7.9.0 — REVERT the tech-audit trigger churn (v7.8.7/v7.8.8/v7.8.9 broke a working button)

**What happened:** Shazin confirmed the audit **button worked before this session** — it invoked the background function fine; the only real defect was stale pre-rebuild URLs (correctly fixed in v7.8.4). I then "fixed" the trigger three more times on wrong theories:
- v7.8.7 "un-awaited fetch is frozen" — FALSE here: the original fire-and-forget POST worked.
- v7.8.9 "POST body stripped by a scheduled fn / scheduled fns 403 on HTTP" — FALSE: the `schedule` predates this session (added in `39cede6`) and the button worked with it present. The 403 I saw was my own **browser-direct GET** to the background function (no internal header) — a bad test, never the button's path.

**Fix:** reverted `technical-seo.js` and `technical-seo-background.js` to their v7.8.6 state (`34d607b`). That keeps the genuine fixes — v7.8.4 config-driven `priorityPaths` + the `getCorePages(brand,domain,brandCfg)` scope fix, and v7.8.6 crash-hardening — and restores the **original working trigger** (fire-and-forget POST with `{brand}` body + `internalHeaders`). Dropped: the await change, the POST→GET query switch, the `runAuditForBrand`/multi-brand-cron refactor, and the INVOKED logging (all tangled with the churn).

**Net state now = what worked before + the correct URL fix.** The button should invoke the background and audit the live `/ae/…` + `/om//pk//qa/` URLs.

**Lesson (hard):** when a feature "returns wrong results", fix the results path only — do NOT also re-architect the invocation path on theory. Every trigger change I made was unverifiable locally and reverted a pattern that was already working in production. Verify a hypothesis against git history + the user's lived experience BEFORE changing working infrastructure. `npm run check` can't catch a "correct code, wrong theory" regression — only reverting to the known-good commit could.

### v7.9.1 — THE real root cause (found by live-debugging in Chrome): scheduled fns 403 on HTTP

**Debugged live in Shazin's Chrome against production.** Findings, each proven with a real request:
- The stored record was stuck `status:'running', results:0` across triggers. v7.8.6's crash-hardening would have written `status:'error'` if the background had *run and thrown* — it wrote nothing, so the background was **never executing**.
- A direct `POST /.netlify/functions/technical-seo-background` returned **403 with an empty body**. The function's own auth returns **401 with JSON** — so the 403 is Netlify's platform layer, before the function.
- Proof by comparison (live): `technical-seo-background` (scheduled) → **403**; `backlinks-background` (scheduled) → **403**; `international-seo-background` (schedule commented off) → **202**; `onpage-audit-background` (no schedule) → **202**.

**Root cause:** **Netlify returns 403 for any HTTP invocation of a function that has a `schedule`.** `technical-seo-background`'s schedule was added 2026-06-01 (`39cede6`); ever since, the wrapper's HTTP fetch to it was 403'd and swallowed → the audit never ran and the record froze on `running`. This predates and is unrelated to this session — the button last worked before June. (Also means the same on-demand break affects `backlinks-background` and every other scheduled bg fn — logged for follow-up.)

**Fix:**
- `netlify.toml`: commented out `technical-seo-background`'s schedule (same manual-only pattern already used for `international-seo-background`). It's now HTTP-invocable → the Run Audit button works.
- `scheduler-background.js`: the working Monday 4am cron now fires `technical-seo-background` per-brand over HTTP with `internalHeaders` (fire-and-forget, non-critical try/catch), so the weekly audit is preserved — and actually runs per-brand, which the old scheduled invoke never did (it arrived with no brand and early-returned).

**Second issue observed (not yet changed):** the wrapper's 5-minute "already running" guard means that once a run leaves a stale `running` record (as every 403'd run did), the button returns "Audit already in progress" for 5 min. Harmless once invocation works (runs now reach a terminal status), so left as-is.

**Process note:** this is what the earlier v7.8.7/v7.8.9 guesses *should* have been — a live request against production, not a theory. Reverting to v7.8.6 first (v7.9.0) was correct; this is the real fix on top of it.

### v7.9.2 — Queue cleared + Pickl SEO content generation HARD-PAUSED

**Queue cleanup (done live):** deleted all 77 pending approval items (59 Pickl + 18 Bonbird) via `action:'delete'` (no Claude spend). Pushed/published history preserved. Queue now empty. These were stale pre-rebuild drafts (old `/menu` `/locations` links etc.) plus the 15 I accidentally generated — all cleared.

**Pickl content generation paused (config-driven):** Shazin — do NOT generate/publish any SEO content for Pickl until its website is fixed.
- `brands-config.js`: `contentPaused: true` on the Pickl seed record + `isContentPaused(brandOrCfg)` helper (exported). `_normalize` merges it through, so it always applies. Re-enable = delete the one line (deliberate).
- Guards added at every Claude-spending content generator:
  - `generate-draft.js` (on-demand ⚡Generate): returns `{paused:true}` before any Claude call.
  - `international-seo-background.js`: skips every market whose brand is paused (this is the job my probe accidentally fired).
  - `scheduler-background.js`: skips the content-jobs loop AND the AI performance narrative for a paused brand; data/monitoring jobs (rank history, tech audit) still run.
- NOT affected (intentionally): reporting, analytics, rank tracking, technical audit, GSC/keyword DATA — Pickl monitoring continues; only content generation is gated.

---

#### ▶ RE-ENABLING Pickl SEO content generation (do this once the Pickl website is fixed)

**One edit re-enables everything.** All three guards read the single `contentPaused`
flag via `isContentPaused()`, so removing the flag opens all of them at once.

1. **Delete the flag** — in `netlify/functions/_lib/brands-config.js`, in the `BRAND_SEED.pickl`
   record (~line 111), remove the line:
   ```js
   contentPaused: true,
   ```
   (and, optionally, the 4-line explanatory comment directly above it).

2. **Check for a Settings/Blobs override (usually none).** The flag currently lives ONLY
   in the code seed — nothing writes it to the `brandsConfig:pickl` Blobs record. But if
   Pickl was ever re-saved via Settings → 🏷️ Brands, that Blobs record could carry its own
   `contentPaused`. To be safe, after step 1 confirm the live config (step 4). If it still
   shows paused, clear it via `POST /api/config {action:'save_brand', brand:{slug:'pickl', …, contentPaused:false}}`
   or re-save Pickl in Settings.

3. **Commit + deploy** — `npm run check`, then push (Netlify auto-deploys).

4. **Verify live** (all read-only / zero Claude spend):
   - `GET /api/config` → the `pickl` brand no longer has `contentPaused:true`.
   - `POST /api/generate-draft {brand:'pickl', keyword:'…', actionType:'blog_draft'}` → now
     actually generates (no `{paused:true}`). NOTE: this one DOES spend Claude — only run it
     after the deploy is confirmed live, and expect a real draft.

**The three guards the flag controls** (all key off `contentPaused`, no separate toggles):
- `generate-draft.js` — the on-demand ⚡Generate button.
- `international-seo-background.js` — the international content pipeline (per-market skip).
- `scheduler-background.js` — the weekly content-jobs loop + AI performance narrative.

To PAUSE another brand later (same mechanism): add `contentPaused: true` to that brand's
seed record (or its `brandsConfig:<slug>` Blobs record) — no other code changes needed.

**Also noted (not yet fixed) — generated internal links bug:** generated page/blog content emits guessed relative links (`/menu`, `/locations`, `/order`) that (a) render against yolkseo.netlify.app in the queue *preview* only (cosmetic — a relative href resolves against the Nest origin; on publish to WordPress it resolves to the brand domain), and (b) more importantly use PRE-REBUILD paths — Bonbird should be `/ae/menu/` `/ae/locations/`, and `/order` may not exist. Root cause: `generate-draft.js` never passes Claude the site's real internal URL list, so it invents paths. Fix (deferred): feed the generator the brand's actual internal URLs (sitemap/markets config) + instruct link-only-to-those; and set the preview modal's base to the brand domain.

### v7.9.3 — Bonbird Phase 1.5: location-page schema no longer hardcodes AE / Restaurant

Fixes the L1/L2 schema bugs (false NAP for non-UAE markets; wrong @type for non-restaurant verticals).
- `_lib/brands-config.js` `VERTICALS`: added `schemaType` — restaurant→`Restaurant`, cafe→`CafeOrCoffeeShop`, corporate→`Organization`.
- `local-seo-pages-background.js buildLocationSchema(loc, brandCtx, brandRec, geo)`:
  - `@type` now comes from the brand's vertical (was hardcoded `Restaurant`).
  - `addressCountry` resolved by `resolveCountryCode(loc, markets, brandRec)`: matches the GBP location's name+address against each market's `label` + `locations` (city) tokens → that market's `countryCode`; falls back to the brand's `homeCountryCode`; **returns null → addressCountry OMITTED** when genuinely unknown (never defaults to AE — a wrong country is false NAP, worse than an absent field).
  - `servesCuisine` dropped for `Organization` (corporate); `url` set from brandCtx.
- Verified with mocked harness on the exact plan cases: Muscat/Seeb → `OM`, Dubai City Walk/Sharjah → `AE`, café vertical → `CafeOrCoffeeShop`, corporate → `Organization`, unknown-country venue → `addressCountry` omitted. Schema still built deterministically in code, never by Claude.
- Live-verified this session (bonus, was mock-only before): **1.3 hreflang** — `GET /api/hreflang?brand=bonbird` emits `en-ae→/ae/`, `en-om→/om/`, `en-pk→/pk/`, `en-qa→/qa/`, home defaults to `/ae/`, zero stale `/oman|/pakistan|/qatar/` paths.

**Phase 1 now 1.1–1.5 ✅ · 1.6 (confirm Qatar venues) = human task. Next: Phase 3 (city hubs).**

### v7.9.4 — INCIDENT: live homepage overwritten during "verification" + new CLAUDE.md rule 13

**What happened:** while live-verifying Bonbird Phase 1.2 (the legacy-page body-write guard), I ran a "control" `update_content` **body** write against `/ae/` to demonstrate the guard does NOT fire on a non-legacy page. `/ae/` (page #912, "Final Home New") is the live UAE homepage and IS `post_content`-driven, so the write **overwrote the live homepage body** with a test string. Shazin restored it from the 2026-08-19 17:06 revision.

**Root cause:** acted on an unverified assumption (that `/ae/` was a template no-op like the 13 legacy pages, inferred from pattern not checked) via a mutating call to a live production page. A "control" proving a negative never needed to be a real write — reading `bodyNotWritablePaths` config would have shown `/ae/` isn't listed.

**Fixes:**
- **CLAUDE.md rule 13 added** — never act on an unverified assumption; verify read-only FIRST before any write/live/irreversible action; never use a live resource as a test fixture (use a throwaway draft or a read-only check); every write is irreversible until a clean rollback is confirmed; don't infer behaviour from a name/pattern.
- `wordpress.js` gained a read-only **`get_revisions`** action (authed, server-side) so original content is recoverable after an errant write — this is how the original homepage body was retrieved.
- Memory: `feedback-never-act-on-unverified-assumption`.

**Process:** Shazin revoked Claude Code auto-permission (justified). Operate with explicit approval for writes/live actions going forward.

**Verification status (Bonbird Phase 1):** 1.3 hreflang live-verified ✅. 1.2 guard: the **rejection** half is live-verified (✅ `/ae/dubai/` body write → 409). 1.1 (market taxonomy) and the 1.2 "meta still allowed" half remain **code-verified only** — must be re-verified against a **throwaway draft**, never a live page.

### v7.9.5 — Bonbird fixes from the site team's answers: `markets` taxonomy + template-based write guard

Two real bugs, both surfaced by asking the website-side chat instead of testing against live (per rule 13):

**1. Market taxonomy was silently ignored (1.1 was broken).** The REST base is `/wp/v2/markets` (PLURAL) and the post field is `markets`; `market` (singular) 404s / is silently dropped — so every Nest-created Bonbird journal post was getting NO market attribution. Fixed: `brandsConfig.bonbird.marketTaxonomy` `'market'` → `'markets'` (drives `resolveTermIds` URL + the post field via `marketTaxonomyFor`). Term slugs ae/om/qa/pk → IDs 42/43/44/45 (resolved by slug, so no hardcoded IDs needed).

**2. Body-write guard was a path deny-list; the correct rule is a template allow-list.** Authoritative rule: body is writable ONLY on a journal POST, or a PAGE whose `_wp_page_template` ∈ {`template-location.php`, `template-product.php`}. Every other page — the market homes `/ae/ /om/ /qa/ /pk/` (verified `type=page, template=""` i.e. default, block markup) and all block-built pages — renders its body from blocks/ACF, so a raw `post_content` write CLOBBERS the live page. The old deny-list only listed the 13 legacy slugs and **missed the market homes entirely — that gap is what the /ae/ homepage incident hit.**
- `brandsConfig.bonbird.writableTemplates = ['template-location.php','template-product.php']`.
- `wordpress.js bodyWritable(brand, url, creds, postId, postType)` rewritten: journal posts (`postType==='posts'`) always allowed; for pages it resolves the template and allows only allow-listed templates; brands without `writableTemplates` keep the legacy path deny-list (unchanged behaviour). `handleUpdateContent` passes creds/postId/postType and returns a clear 409.
- Verified: read-only `get_post` confirmed `/ae/`(912)=default and scaffold 47005=`template-product.php`; mocked guard test passes all cases (journal→allow, /ae/ + /ae/dubai/→block, location/product templates→allow).

**Also learned (for later, from the site team):**
- **City hubs (Phase 3):** a Page on the **Bonbird Location** template with `page_type=city_hub`, parented `/{market}/{city}/`; Nest writes prose+FAQ body, template does venue cards/schema. Existing `/ae/dubai|sharjah|abu-dhabi/` are legacy twigs (body dev-edit-only). Confirm design with Shazin before coding.
- **Safe test surface:** create a DRAFT journal post on live → verify → delete. NOT `bonbirddev` (stale DB, Nest creds point at prod). The 12 product scaffolds (47005–47016) are earmarked for real bodies — not throwaways.
- **FAQ contract confirmed** (`bonbird_split_faq`): `<h2>FAQs</h2>` (or "FAQ"/"Frequently Asked Questions", case-insensitive) then `<h3>Q</h3><p>A</p>` pairs; template builds accordion + FAQPage schema verbatim. Matches `generate-draft.js generateTemplatePage`. `validateFaqBlock` now accepts all three heading variants via one shared `FAQ_HEADING_RE` (done v7.9.7; unit-tested).

**Still owed (Bonbird verification):** 1.1 end-to-end (draft journal post → confirm `markets` term lands → delete) and the 1.2 "meta still allowed" half — both against a **throwaway draft**, with explicit approval, never a live page.

### v7.9.6 — wordpress.js `delete_post` action (throwaway-draft cleanup)

Adds a gated `delete_post` action so a verification draft can be cleaned up (no orphaned test artifacts — rule 13). Requires an explicit `postId` (never a URL lookup, so it can't delete the wrong target); defaults to TRASH (recoverable), `force:true` = permanent. Used to run the 1.1 end-to-end check: create a DRAFT journal post → confirm the `markets` term attaches + `/{market}/journal/` permalink → delete.

**1.1 live-verified (v7.9.6):** created two throwaway DRAFT journal posts (#47032, #47034) via `create_draft` with `taxonomies:{markets:['om']}`, read them back, deleted both (confirmed 404, no orphans). Result: `markets` term resolved om→**43** and **stored on the post** (read-back `markets:[43]`), and the draft's permalink was **`https://bonbirdchicken.com/om/journal/nest-test-markets-2/`** — both 1.1 acceptance criteria met. GOTCHA logged: `get_post` reads a **top-level** `postId` (`handleGetPost(creds, body)` → `body.postId`), NOT `payload.postId` like the other actions — a malformed (nested) call returns 400 "postId required", which is easy to misread as an empty/negative result.

### v7.9.6 (doc) — verify-first promoted to the #1 / prime-directive rule

Per Shazin: the "never act on an unverified assumption" rule is now the overriding #1 rule. Implemented as a **prime-directive banner at the very top of CLAUDE.md's Mandatory Rules** (above rule 1), explicitly "overrides everything below". The numbered list (1–13) and its ~30 stable references (`#5/#7/#10/#11/#12`, cited across code comments + docs) are left UNTOUCHED — the rule keeps its number 13 for the full text so no reference goes stale (chose this over a full renumber to avoid missing a reference).

### v7.9.7 — validateFaqBlock accepts the template's FAQ heading variants

Per the site team's Q5 answer: the `bonbird_split_faq` template splits on `<h2>`
matching **FAQ / FAQs / Frequently Asked Questions** (case-insensitive). The Nest's
`generate-draft.js validateFaqBlock` only accepted `FAQs?`, so a valid body using
"Frequently Asked Questions" would have been wrongly rejected before queueing. Factored
the matcher into one shared `FAQ_HEADING_RE` (used by both the presence check and the
split, so they can't drift) and added the variant. Unit-tested: all three headings pass;
missing-heading / <3 questions / stray `<img>` still fail.

### v7.9.8 — create_page hardened for the city-hub path (site-team answers)

Confirmed with the Bonbird site team (relayed by Shazin) + verified in code:
- **Template + parent already pass through** `create_page` (`template: payload.template||''`, `parent: parentId` via `resolveParentId`). Q1/Q4 need no change — a caller just includes `template:'template-location.php'` + `wpParent` (market-home slug; ae=912, om=544, qa=542, pk=517).
- **Added a create guard** (the real gap): for a brand with `writableTemplates` (Bonbird), `create_page` now REFUSES to create a body-bearing page unless `payload.template` is in the allow-list — otherwise a new page on the default/block template renders its body invisibly (same class as the /ae/ clobber; the router's local-intent `blog_draft→page_creation` path could have hit this). Journal posts must use `create_draft`. Passed `brand` into `handleCreatePage` to enable the check. Mirrors the `update_content` body guard.

**Confirmed constraints (NOT code — flow/human):**
- **Q2 `page_type=city_hub` is ACF, NOT REST-writable** (`show_in_rest:0`). Nest creates the page (title/slug/parent/template/body); a HUMAN sets "City hub" + fills venue ACF in wp-admin. (If we later want Nest to set it, the site team can register that one meta in REST — flag it.)
- **Q5 venue NAP is 100% ACF** (`bonbird_venue_data()`); a `city_hub` auto-renders its CHILD `venue` pages as cards. Generator writes ONLY prose + FAQ into `post_content`, never venue/NAP. Individual venues = `venue`-type Location pages parented under the hub.
- **Q6** a fresh Location-template draft renders cleanly (guarded hero/venue/FAQ; only market-derived menu tiles always show) — safe to stage.

**Still a Shazin decision before any city-hub is generated (Q3 — do NOT assume):**
- UAE `/ae/dubai|sharjah|abu-dhabi/` already exist as legacy static Twig pages — slugs are taken. Either (a) a DEV migrates a legacy page onto the Location template (not a Nest blind template-flip — the body is baked into the twig), or (b) city hubs are NEW cities only. om/qa/pk city slugs are not pre-decided — Shazin supplies the per-market city list (real venue/demand-driven, anti-doorway bar). Nest must never invent slugs.

**Net:** the create_page PLUMBING for city hubs is now complete + safe. Generating them still needs (1) Claude credits, (2) Shazin's per-market city list, (3) a human ACF pass after creation.

### v7.9.9 — Nest can now set city-hub `page_type` on create (site team registered it in REST)

Site team registered `page_type` as REST-writable **registered postmeta** (chose meta over ACF-in-REST so `address`/`hours`/`phone`/`map`/hero stay `show_in_rest:0` = un-writable — the anti-fake-NAP guardrail holds). Confirmed live on prod + verified end-to-end their side (REST-set `city_hub` → `get_fields()` returns `city_hub`).

Nest side (`wordpress.js handleCreatePage`): if `payload.pageType` ∈ {`venue`,`city_hub`}, it's merged into the create `meta` object as `meta.page_type` — sent as **meta, never acf** (acf silently no-ops per the site team). Invalid/absent → omitted (site defaults to `venue`). So the city-hub create payload is now: `create_page { template:'template-location.php', wpParent:<market slug>, pageType:'city_hub', title, body(prose+FAQ) }` → `POST /wp/v2/pages { template, parent:<id>, status:draft, meta:{page_type:'city_hub'}, ... }`. Market-home parents: ae=912, om=544, qa=542, pk=517. Removes the previous human "pick City hub" step; a human still creates + fills the child `venue` pages' NAP (ACF).

⚠️ Site-team note: if a first REST write no-ops right after their deploy, a WP Engine "Clear all caches" clears PHP-FPM opcache and it takes.

**Still Shazin's content call (Q3, unchanged):** which city slugs per market + migrate-vs-new for the UAE legacy `/ae/dubai|sharjah|abu-dhabi/` pages. Nest never invents slugs.

### v7.9.10 — structured venue records + `citiesForMarket()` (city-hub source of truth)

Captures the confirmed Bonbird venue data as the config-driven source for city-hub generation (rule 12). Added a `venues` array to `bonbird_oman/qatar/pakistan` in `international-config.js` — structured `{name, city, type}` records, LEAVING the existing `locations` string arrays untouched (they're consumed as strings by intl generation prompts + `resolveCountryCode` — verified before changing shape). `type`: `dine_in` (dine-in + pickup + delivery) | `dark_kitchen` (pickup/delivery only, NO dine-in — content must not imply dining in). Types confirmed with Shazin 20 Aug (NOT googled — venue attributes are NAP-class, taken from the owner, not inferred).

New `citiesForMarket(marketKey)` (exported) groups `venues` by city → the city-hub target list. Verified (mocked): **4 hubs** — `/om/muscat/` (Souq Al Madina), `/om/seeb/` (Al Khoudh), `/qa/doha/` (West Walk · District 1), `/pk/lahore/` (Cue Cinemas · Dolmen Mall · Johar Town[dark_kitchen]).

**City-hub readiness now:** plumbing ✅ (create_page template+parent+page_type, verified v7.9.9), city source ✅ (this), venue types ✅. Remaining to actually generate: (1) the generation path (`create_page` payload + prose/FAQ prompt driven by `citiesForMarket` — buildable no-Claude, RUNS only with credits), (2) Claude credits, (3) a human ACF pass on child venue pages, (4) site-team confirm: does the Location template render a `dark_kitchen` differently (hide dine-in / order-only)? Pre-existing note: `pickl_qatar` carries the same Doha location strings as bonbird_qatar (config smell — left alone, Pickl is paused).

### v7.9.11 — venue/city config layer made truly scalable + Scalability promoted to RULE #2

**Rule:** promoted "scalability is a build requirement" to a **prime-directive banner (RULE #2)** at the top of CLAUDE.md — same treatment as RULE #1, pointing to the full text at rule 12 (numbers/refs unchanged). Shazin has asked for this repeatedly; it's now a headline, not buried.

**Build — closed two gaps that broke "add a new country/city with no code":**
1. `citiesForMarket()` read the static seed literal (`INTERNATIONAL_MARKETS`) → a Settings-onboarded market or any UI venue edit was invisible. Added **`citiesForMarketAsync(marketKey)`** (exported) that reads the **Blobs-merged** market config via `_mc().getMarket()` (falls back to seed). Verified: a Blobs-only `bonbird_kuwait` (not in any literal) yields `/kw/kuwait-city/` + `/kw/salmiya/[dark_kitchen]` with zero code; the sync seed-only version returns 0 (the gap).
2. The Settings SEO-Markets form captured none of the city-hub inputs. Added **`countryCode`** (ISO) + a **`venues`** editor (textarea, one per line `Name | City | type`; type = `dine_in`|`dark_kitchen`) to the form, `saveMarketFromForm` payload, and the edit-populate path. `config.js save_market` already passes the whole record through (no whitelist); `markets-config._normalize` now normalises `venues` shape/type + defaults to `[]`.

**Net:** launch a new market → add it + its `countryCode` + cities/venues in Settings → city hubs (`citiesForMarketAsync`) and schema (`countryCode`) work with ZERO code edits. This is the scalable end-state, and it's the config source the (still-to-build, credits-gated) city-hub generator will read.

### v7.9.12 — city-hub GENERATOR built (generate-draft `city_hub` pageKind)

The engine that turns the scalable venue/city config into a publishable city hub. New `pageKind: 'city_hub'` in `generate-draft.js` → `generateCityHub(ctx)`:
- Resolves the city + its REAL venues from **`citiesForMarketAsync(market)`** (Blobs-merged config — rule 12; a config-onboarded market works with no code). Errors if the city isn't configured (never invents one).
- Prompt = intro + 2–3 city-specific `<h2>` prose sections + the `<h2>FAQs</h2>` contract; references venues by NAME only, tells the model a `dark_kitchen` venue is pickup/delivery-only (no dine-in), forbids images/NAP/addresses (ACF/human), anti-doorway ("if it'd read identically for another city, rewrite").
- Validates the FAQ block, runs the voice check, queues a **`page_creation`** approval whose payload carries `wpAction:create_page, template:'template-location.php', pageType:'city_hub', wpParent:<marketSlug>, slug:<citySlug>`, market taxonomy, and a `humanTodo` to create+fill the child venue pages.
- On publish → `pushItem` (page_creation → create_page) → the v7.9.8/9 guarded create sets template + parent + `meta.page_type=city_hub`. All downstream pieces already verified.

Verified with a stubbed-Claude mock-invoke of the handler (bonbird_oman / muscat): payload = create_page · template-location.php · page_type=city_hub · parent `om` · slug `muscat` · 4 FAQ pairs. Only the live Claude prose is unverified (credits-gated).

**Remaining for a fully clickable feature:** a frontend trigger (list `citiesForMarket` per brand/market + a "Generate hub" button → `generate-draft {pageKind:'city_hub', market, city}`) — mechanical, mirrors the scaffold panel; next. Then the human creates/fills child `venue` pages' ACF NAP.

### v7.9.13 — city-hub frontend trigger (feature now clickable end-to-end)

- `/api/config` GET now attaches **`cities`** to each market (grouped from `venues` via `citiesFromMarketRecord` — single source, rule 12), so the UI doesn't re-group.
- New **🏙️ City hubs** panel (Analytics → Markets, under Page scaffolds): pick a brand → **Find city hubs** lists every config-derived city (`/{market}/{city}/`) with its venues (a `dark_kitchen` badged), and **⚡ Generate hub** calls `generate-draft {pageKind:'city_hub', market, city}` → queues the city-hub page for review. Keyword seed = `<brand cuisine> <city>`.
- The generate button surfaces paused/skipped/queued states (Pickl is content-paused → shows ⏸). Cities are config-only — the UI never lets you invent one.

Verified: `npm run check` green; config `cities` payload verified (Bonbird → /om/muscat, /om/seeb, /qa/doha, /pk/lahore). The **listing** is live-testable; the **generate** action is credits-gated (no Claude), so its live run is still owed. City-hub feature is now complete + clickable — pending only Claude credits + the human ACF pass on child venue pages.

### v7.9.14 — UAE legacy decision (new-cities-only) + create_page duplicate guard

**Decision (Shazin, 20 Aug): NO UAE legacy migration for now — new-cities-only.**
- The 3 UAE city pages `/ae/dubai/ /ae/sharjah/ /ae/abu-dhabi/` + their venue children stay **as-is, human-owned** (static Twig; Nest body writes stay blocked by the 409 guard).
- Nest on those 3 = **Yoast meta only**, and only where there's genuine data-backed room — not cosmetic rewrites. Bodies untouched.
- **UAE city hubs:** generate ONLY for a genuinely NEW UAE city with no existing page (a new venue location). Rare, fine. (UAE isn't in the markets/venues config today, so the City-hubs panel won't offer Dubai/Sharjah/Abu Dhabi.)
- **om/qa/pk:** city hubs proceed now via the `page_type` meta contract.
- Migrating the 3 UAE pages onto the Location template (to unlock data-driven bodies) is **parked — revisit later**.

**Code — enforced the "no existing page" requirement generically:** `handleCreatePage` now refuses (409) to create a page whose slug already exists under the same parent, instead of letting WP silently mint a colliding `slug-2` URL. Protects every market (not just UAE) from duplicate city-hub/page creation. Message points the user to edit/migrate the existing page.

### v7.9.15 — struck the dark_kitchen site-template question (decision)

Shazin: strike it. The only thing that genuinely mattered — generated copy not falsely implying dine-in at a pickup-only venue — is already handled by the `type:'dark_kitchen'` config flag + the generator's prompt line. Whether the Location *template* renders a dark-kitchen card differently (dine-in framing / schema) is human-owned ACF, one venue (Johar Town), and low-stakes — **not worth a site-team round-trip**. Removed from the open list. Revisit only if many more dark kitchens open and their cards need to visibly differ.

### v7.9.16 — fix Approvals "Run Audit" (scheduler-background 403 trap) + honest button feedback

**Bug:** the Approvals "Run Audit" button (`runScopedAudit`) fires `scheduler-background` (UAE content jobs) / `international-seo-background` (intl). `scheduler-background` was a **scheduled function** → Netlify **403s** any HTTP call → the UAE run never executed. `scheduler.js` (the wrapper) hit the same 403. And `runScopedAudit` did `fetch(...).catch()` with **no `res.ok` check**, so the 403 was swallowed and the button falsely showed *"Audit started"* while nothing ran/queued. (This — not the per-opportunity ⚡Generate — is why "Run Audit for Bonbird UAE" produced nothing.)

**Fix:**
- **netlify.toml:** commented out `scheduler-background`'s `schedule` → it's now HTTP-invocable, so the button (and `scheduler.js`) can trigger it. On-demand content runs work.
- **index.html `runScopedAudit`:** now checks `res.ok` per target — reports real failure instead of a false "started"; refreshes the queue only if at least one run succeeded.

**⚠️ PARKED / TODO (Shazin: ignore for now, just logged):** unscheduling `scheduler-background` disables its **Monday 4am cron** — which did more than content: **GSC snapshots, rank-history, CPC enrichment, and the tech-audit fan-out**. Those weekly jobs are now OFF until a tiny scheduled dispatcher fires `scheduler-background` weekly via `internalHeaders()` (same pattern as technical-seo v7.9.1). **Re-enable before relying on the weekly cron.** (The other scheduled data jobs — competitor-matrix/backlinks/ai-overview/citations — still have the same on-demand-403 trap; separate fix.)

### v7.9.17 (plan) — Market Planner design written → /MARKET-PLANNER-PLAN.md
The structured per-market SEO planner (replaces fixed-quota batch jobs; assess-then-act, current-state-aware, research-led for cold markets, one engine = generate-draft). Phased, additive rollout (P1 read-only planner lib → P2 plan API+panel → P3 execute via generate-draft → P4 retire duplication). Building P1 now.

### v7.9.17 — Market Planner P1: buildMarketPlan (read-only planner lib)
`_lib/market-planner.js buildMarketPlan({brand, market})` — reads the per-market opportunity list (`keywordOpportunities:<brand>[:<market>]`, which already carries a recommended `action:{actionType,rationale}` + tier/volume/position/target from discovery's `recommendAction`), drops already-winning (top3/top10/monitor) + already-queued, ranks by discovery score, returns a plan with **data-driven counts** (NOT fixed quotas). No Claude, no writes, no generation. Works cold (research-led) or warm. Mock-verified: pakistan cold plan → 1 page_creation + 1 blog_draft + 1 meta_update, skips winning + queued, ranked. ADDITIVE — the 3 existing generators untouched. Next: P2 (/api/market-planner plan + panel), P3 (execute → loop generate-draft).

### v7.9.18 — Market Planner P2 backend: /api/market-planner (plan) + config-asset merge
- `_lib/market-planner.js`: now merges **city hubs from `citiesForMarketAsync`** (venue config) into the plan — so markets with no DataForSEO coverage still get a real plan. Confirmed live: **Oman & Qatar are not in DataForSEO Labs** (0 keyword ideas; the Nest already falls back + logs `ideasDiag`), Pakistan 362 / UAE 200 ideas, all fresh (Aug 24). City hubs are research-independent, deduped vs queued; execution's create_page dup-guard blocks cities that already have a page (UAE legacy). Mock-verified: cold Oman → 2 city hubs + 1 blog, top-3 skipped.
- New gated `market-planner.js` (`/api/market-planner`, redirect added): `action:'plan'` → returns the ranked plan JSON (read-only, no Claude/writes). `action:'execute'` deferred to P3.
- ADDITIVE — existing generators untouched. `npm run check` green. Next: P2b frontend panel, then P3 execute (loop generate-draft, dryRun→one→batch).

### v7.9.19 — Market Planner P2b: frontend "🗺️ Market Planner" panel
Added the read-only planner UI (Analytics → Markets, above Page scaffolds): pick brand + market → **Build plan** → `/api/market-planner action:'plan'` → renders the ranked map (counts by asset type + each item's keyword / assetType / target / rationale / priority). No generation yet (P3). `fillMpMarkets()` populates markets per brand (UAE home + intl); `mp-brand` seeded in bootstrapBrands. npm check green.

### v7.9.20 — Market Planner P2.5: assess/map (fix cold-market mis-classification)
Live P2 exposed that plans were "structured garbage": Pakistan = 104 `page_update` (GSC attributes cold-market long-tail to the `/pk/` hub → recommendAction saw hasPage → "optimise /pk/" ×104), and `page_update` isn't even a generate-draft action. Fixed **in the planner** (additive; no discovery change, no re-run/DataForSEO spend): `_assess(opp, offMenu)` in `_lib/market-planner.js` —
- **generic target** (homepage or single-segment market hub `/pk/`) or no page → **page_creation** (or **blog_draft** if informational-intent regex) — kills the bogus mass page_update.
- `page_update` on a **real specific** page → **meta_update** (generate-draft can't rewrite arbitrary bodies yet; safe move).
- **relevance guard**: drops keywords containing the brand vertical's `offMenu` terms (config-driven; e.g. biryani/pizza). NOTE: subtle off-brand leaks (e.g. "bun bo hue") still need the upstream discovery relevance filter tightened — logged, not fixed here.
Every planner assetType is now executable by generate-draft (meta_update/page_creation/blog_draft + city_hub). Mock-verified all cases. npm check green. Ready for P3 (execute).

### v7.9.21 — Market Planner P2.6: Claude IS the planner brain (cluster + relevance + prioritise)
Per Shazin — clustering & relevance are semantic judgement, so Claude does them, not brittle guards. `_lib/market-planner.js planWithClaude()` = ONE Claude call over the candidate opportunities + configured cities → returns a clustered, relevance-judged, asset-typed, prioritised **launch set** (~15), with a `dropped` list. `buildMarketPlan({...,useLLM=true})` uses it by default (`mode:'llm'`); rules remain as a cheap pre-pass, a **fallback** (`useLLM:false`/failure → `mode:'rules'`), and **hard safety guards**: executable-asset-only, and a `city_hub` must match a REAL configured city slug (invented cities dropped — verified in test with "fakeville"). So "Build plan" now = one small AI call. Mock-verified: clusters 2 kws→1 page, drops "bun bo hue", keeps real city, rejects invented one, fallback works. npm check green. Next: P3 execute (loop generate-draft over the plan; dryRun→one→batch).

### v7.9.22 — Market Planner: fit the Claude planning call inside the sync limit
Live plan-build 504'd — the synchronous `/api/market-planner` (Netlify ~26s) can't hold a clustering call over ~100 keywords at 4000 max_tokens. Trimmed `planWithClaude`: cap to **top-50 candidates by volume** + **max_tokens 2500** → the call fits sync. (If it still times out, the fix is a `-background` function + poll; noted.) No behaviour change otherwise. check green.

### v7.9.23 — Market Planner: async build (background + poll) — fixes the 504
The Claude clustering call exceeds Netlify's synchronous limit (504 at ~31s even trimmed to 50 kws/2500 tokens). Moved the build to a **background function**: new `market-planner-background.js` (HTTP-invocable, NOT scheduled; 15-min budget) runs `buildMarketPlan` (incl. the Claude call) and stores `marketPlan:<brand>:<market>` = {status:ready|error, …}. Sync `/api/market-planner`: `action:'plan'` writes status:'building' + fires the background (awaited 202) + returns 202; `action:'get'` polls the stored plan (3-min double-fire guard). Frontend panel now triggers + polls every 5s (~100s max) with a spinner, renders on ready. npm check green. Next: live-verify the plan renders, then P3 execute.

### v7.9.24 — Market Planner P2 VERIFIED LIVE (Claude planner brain, async) + doc lock
Full planner pipeline confirmed live end-to-end: `/api/market-planner action:'plan'` (202) → `market-planner-background` runs `buildMarketPlan` (Claude clustering) → stores `marketPlan:<brand>:<market>` → `action:'get'` polls. Bonbird Pakistan result: **12 focused items, mode:'llm'** (6 page_creation / 3 meta_update / 2 blog_draft / 1 city_hub) from 100+ raw keywords — clustered, relevant, real-page meta targets, config-only city hub. This is the "autonomous SEO expert" plan (vs the old fixed-quota dump). ⚠️ LLM proposed "best burger in karachi" (no Bonbird venue there) — human-review catches it; add a "venues only in <cities>" prompt guard in P3.
**Files:** `_lib/market-planner.js` (buildMarketPlan + planWithClaude + _assess fallback + safety guards), `market-planner.js` (sync plan/get), `market-planner-background.js` (build worker), index.html 🗺️ Market Planner panel (Analytics→Markets). **NEXT = P3** (execute: `action:'execute'` loops generate-draft, dryRun→one→batch, likely -background+poll; then dashboard generate controls). See /MARKET-PLANNER-PLAN.md.

### v7.9.25 — Market Planner P3a: EXECUTE backend (dryRun default, background + poll)
The planner can now ACT on a plan — it loops the selected items through **`generate-draft`** (THE one engine) so drafts land in Approvals for human review. Nothing auto-publishes; every content guard stays inside generate-draft (contentPaused, cannibalization, voice gate, FAQ contract, writable-template, confidence).

- **`_lib/market-planner.js`** — `planItemToDraftCall(item,{brand,market})` = the SINGLE plan-item→generate-draft mapping (so a dry run shows exactly what a real run sends): `page_creation`/`blog_draft` pass through · `meta_update` carries `url:target` · `city_hub` → `{actionType:'page_creation', pageKind:'city_hub', city}`. An item that can't be executed (meta with no target, hub with no city, unknown assetType) returns an **error, never a guessed call**. `selectPlanItems(items,{select,topN,max})` — select by keyword (case-insensitive) and/or index, or topN; **no selection = nothing runs** (no accidental full-plan spend); hard cap `MAX_EXECUTE = 25`.
- **`/api/market-planner action:'execute'`** `{brand, market, items?|topN, dryRun}` — **`dryRun` defaults TRUE**: returns the exact calls it *would* make, synchronously, with **zero Claude spend, zero writes, zero network**. Must opt in with `dryRun:false` to spend. Guards: manager/admin only (same bar as generate-draft, viewers 403 on dry AND real), plan must be `status:'ready'` (else 409), un-executable items reported not run, 15-min double-fire guard.
- **`market-planner-execute-background.js`** (NEW, no schedule → HTTP-invocable, rule 7) — sequential loop, progress saved to `marketPlanRun:<brand>:<market>` after every item; classifies each outcome as `queued|skipped|routed|error` (paused brand / cannibalization / Perch-routing / HTTP error). Defence in depth: refuses any call whose `actionType` isn't a real generate-draft action or whose brand doesn't match. 13.5-min budget stop so a run never dies stuck on `running`. A fetch throw is reported as "may still have completed — check Approvals before re-running" (a 504 still spends credits).
- **`action:'run'`** polls the run record for the dashboard.

**Verified offline (50 assertions, mocked Blobs/fetch — no network, no Claude):** mapping for all 4 asset types + all 3 un-executable cases · selection (keyword/index/topN/cap/empty) · dry run makes **0 network calls and 0 writes** · 409/400/403/401 guards · real run fires the bg + seeds the record + double-fire guarded · bg loop posts exactly the runnable calls, preserves `pageKind`/`city`, classifies every outcome, refuses forged/mismatched calls · polling. `npm run check` green.

**Live dry-run over the real stored Bonbird Pakistan plan is the next step, then ONE real item, then batch** (plan's verify order). **NEXT = P3b** dashboard controls — and per /MARKET-PLANNER-PLAN.md, P3b is where placement gets decided with Shazin (first-class "Content Planner" nav vs the Analytics→Markets card) and the city-hubs + scaffold panels get folded in. Also still owed in P3: the "venues only in <cities>" prompt guard (the "best burger in karachi" miss) + vertical-aware asset guidance for corporate/cafe brands.

### v7.9.26 — Bugfix found BY the P3a live dry-run: relative meta targets never resolved
The live dry run over the real Bonbird Pakistan plan (12/12 mapped, 0 writes, 0 spend) showed 3 `meta_update` calls carrying **root-relative** targets (`/pakistan-menu/`, `/pk/journal/…`) — the form GSC returns and the planner stores. `wordpress.js normalizeUrl()` turned `/pk/journal/x/` into `https://pk/journal/x/`, making **"pk" the HOSTNAME**; `findPostByUrl` then saw pathname `/journal/x/` (or, for a single-segment path, none at all) and always missed.

Impact (no corruption — `findPostByUrl` skips on a path mismatch and never guesses a wrong page, so this failed SAFE): `get_current_meta` returned `found:false` → generate-draft wrote "Current title: NOT SET" and generated the rewrite **blind**, and the resulting approval could never publish (`update_meta` → 404 no match). Every relative target silently wasted a generation. This predates the planner — it hit any relative url reaching `get_current_meta` / `publish` / the two update paths.

**Fix:** `normalizeUrl(url, base)` — absolute passes through, root-relative resolves against the brand's `WP_<BRAND>_BASE`, bare host gets `https://`. All 4 call sites pass `creds.base`. No base → returns the path unchanged (still fails safe). Verified: all 4 URL forms now resolve to the right path + slug. `npm run check` green.

### v7.9.27 — Market Planner P3a: pre-flight target check (don't generate against a dead page)
Direct consequence of the v7.9.26 finding. The live Bonbird Pakistan plan carried 3 `meta_update` targets; read-only checks showed **2 no longer exist** — `/pakistan-menu/` (now `/pk/menu/`, id 43426) and `/pakistan/bonbird-has-landed-in-dolmen-mall-lahore/` (now `/pk/journal/…`, id 1175). GSC history keeps serving pre-rebuild URLs long after a site move, so the planner faithfully plans against dead pages.

`preflightTargets()` in `_lib/market-planner.js`, run in the `execute` path **before** anything is generated: resolves every `meta_update` target via a read-only `get_current_meta` (parallel, no Claude, no writes). Resolvable → records `targetPostId`/`targetTitle`. Unresolvable → the item is reported as **skipped with a "stale URL?" reason and never generated**. A lookup ERROR fails **open** (item proceeds, `preflightWarning` set) so a WP hiccup can't silently empty a run. Runs in the sync path only, so the background executor receives already-vetted calls (no double reads).

Net: the dry run is now a true pre-flight — it tells you which items would actually produce a publishable draft. **Offline suite now 52 assertions, all green** (added: dead target skipped and never sent; live target survives + records postId; absolute and relative targets both resolved). `npm run check` green.

### v7.9.28 — Market Planner P3: plan-quality fixes (the 4 problems the live dry-run exposed)
The P3a dry run over the real Bonbird Pakistan plan made the planner's *judgement* problems visible. All four fixed, config-driven (rule #2), enforced as BOTH prompt guidance and hard guards (the LLM is told the rule; the code enforces it).

1. **"near me" → never a page.** Google rewrites "near me"/"nearest"/"nearby" to the searcher's coordinates and answers from the **local pack**, ranked by **Google Business Profile** signals — a page cannot be "near" anyone, so a landing page on the literal phrase is unrankable by construction. The live plan had queued `page_creation` for *"restaurants near me"*, *"nearest chicken shop to me"* and *"best fast food deals near me"*. Now: any non-`city_hub` asset on an implicit-location query is **dropped and routed to GBP + the city hub** — which IS the correct vessel, so `city_hub` items are never touched by this guard. Demand re-routed, not deleted.
2. **No-venue cities (the Karachi miss).** *"best burger in karachi"* was queued as a page — Bonbird has no Karachi venue; that is a doorway page. The prompt now names the venue cities (`WE HAVE VENUES ONLY IN: …`, from venue config) and a guard drops an explicit `in <city>` keyword naming no configured city. *"best burger in lahore"* is kept (venue configured).
3. **Stale GSC targets filtered at PLAN BUILD, not just execute.** The v7.9.27 pre-flight caught dead targets before generating, but they still ate launch slots (2 of 3 meta items). `buildMarketPlan({verifyTargets, site, headers})` now resolves every meta target read-only during the build (run from the background worker, which has the budget; fails **open** on error). The near-me guard runs first, so it saves a lookup.
4. **Vertical-aware asset guidance.** New `assetHint` per vertical in `brands-config VERTICALS` — restaurant/cafe get local+product+journal framing; **corporate explicitly forbids local/"near me"/venue/product pages** (Yolk has no venues) and points at franchise/careers/about/thought-leadership. The system prompt now names the vertical noun too. Zero per-brand code.

Plans now also return **`dropped[]`** — every guard removal with a plain-English reason, for the P3b UI.

**Net on the live plan: 12 items → 5 genuinely rankable, 7 dropped with reasons.** Survivors: halal fried chicken lahore, chicken sandwich, chicken tenders, best burger in lahore, Lahore city hub.

**Verified:** new `tools/quality-test.js` (18 assertions) replays the EXACT live Claude output and asserts each fix; `tools/p3a-test.js` (52 assertions) still green — both offline, mocked Blobs/Claude/WP, runnable with `node tools/<file>`. `npm run check` green.

**P3a LIVE-VERIFIED end-to-end (v7.9.25–27):** dry run (12 mapped, 0 writes, 0 spend, run record `none`) → pre-flight (12→10 runnable, 2 dead targets skipped) → ONE real item fired → background → generate-draft → Approvals item `itm_mt9bt4x0_ij567z` "Meta: fried chicken near me", run closed `done`, attributed to shazin@yolkbrands.com. The draft's `currentMeta` was **populated** with the real live title, proving the v7.9.26 fix. ⚠️ That draft targets a near-me keyword and is now exactly what guard #1 drops — it was a **pipeline smoke-test, not a keeper**: reject it in the queue.

**NEXT = P3b dashboard.** Decide placement with Shazin first (first-class "Content Planner" nav vs the Analytics→Markets card), fold in the city-hubs + scaffold panels, surface `dropped[]`, per-item checkboxes → `action:'execute'` → poll `action:'run'`. Batch execute is still un-run live (only the single item has been fired).

### v7.9.29 — Market Planner: the obsolete 2500-token cap was silently killing the AI planner
Live rebuild after v7.9.28 came back `mode:'rules'` with **43 unclustered items** — the old fixed-quota-style dump, not a plan. Cause: `planWithClaude` still carried `max_tokens: 2500` + a 50-candidate cap, set in **v7.9.22 purely to fit the SYNCHRONOUS function limit**. v7.9.23 then moved the build into a background function (15-min budget), making that squeeze obsolete — and the richer v7.9.28 prompt pushed the model's JSON past 2500 tokens, so `extractJson` returned null and `buildMarketPlan` fell back to rules **silently**. A quality cliff disguised as a graceful fallback.

**Fix:** `max_tokens` 2500 → **8000**, candidate cap 50 → 80 (the sync constraint no longer applies), and an unparseable/truncated response now logs loudly (`LLM returned unparseable/!plan JSON (N chars) … likely a max_tokens truncation`) instead of degrading in silence. Lesson for the register: **a constraint added for one execution model must be revisited when the execution model changes** — and a `catch → fallback` hides exactly this class of regression (same shape as the CLAUDE.md #10 bugs). `npm run check` + both offline suites (52 + 18) green.

### v7.9.30 — Market Planner P3b: Content Planner is now a top-level SECTION (not another card)
Shazin's direction: **streamline sections, don't bolt more buttons on.** The placement was already decided in /MARKET-PLANNER-PLAN.md (first-class destination, fold the redundant cards in) — built as specified.

**New top-level nav item "Content Planner"** (`view-planner`), placed in the **Create** group between Content Calendar and Approvals Queue so the sidebar reads as the actual SEO spine: Discover → **Plan → Generate** → Review (Approvals) → Publish → Measure.

**Three cards collapsed into one section.** 🗺️ Market Planner, 🏙️ City hubs and 📄 Page scaffolds each sat under Analytics → Markets with **its own duplicate brand picker**. They are now ONE destination with **one brand+market control bar** driving everything: `#pl-brand` / `#pl-market` replace `mp-`/`sc-`/`ch-` (the folded-in city-hub and scaffold finders read the same select). Nothing was duplicated — the old cards are deleted from Analytics, with a comment pointing at the new home.

**The section is the workflow, in order:** `1 · Plan` — Build plan → ranked checkbox list (all selected by default), select-all/clear, plus a collapsible **"what the guards skipped"** showing every `dropped[]` entry with its plain-English reason. `2 · Generate` — **Preview (dry run)** (free, shows exactly what would run and anything the pre-flight rejects) then **Generate selected** (confirm dialog naming the count) → live progress bar + per-item `queued/skipped/error` status → a **"Review N draft(s) in Approvals →"** button that switches views. `Also ready to generate` — the folded-in config/site sources.

Switching brand or market re-reads any stored plan via the cheap `action:'get'` (no build, no spend). **`mode:'rules'` is now surfaced in the UI as "⚠ rule-based fallback"** rather than passing silently — that silent fallback is exactly what hid the v7.9.29 regression. `npm run check` green.

### v7.9.32 — 🔴 The generator did not know the brand TRADES in its own international markets
Found by the first real batch run (Bonbird Pakistan, 6 items). **All 4 blog drafts were skipped by Claude itself**, each with a variation of *"Bonbird has no presence in Pakistan and no locations in Lahore — publishing this would mislead searchers."* The config says the opposite: **three Lahore venues** (Cue Cinemas Gulberg, Dolmen Mall DHA, Johar Town), and there is a live launch journal post about the Lahore opening.

**Cause:** `generateCityHub` injects the market's REAL venue list from `citiesForMarketAsync` into its prompt — which is why the Lahore city hub generated fine in the same run. `generateBlog`, `generatePage` and `generateTemplatePage` never did. They pass the brand's HOME-market identity plus a market label, so for an international market the model reasons from the brand context ("a UAE fried-chicken brand") and **correctly refuses to write content for a market it believes we're absent from**. The refusal was good judgement on a false premise.

**Impact:** the Nest could not generate blog or landing-page content for ANY international market it actually operates in — silently, as "skipped" rather than an error, so it read like the quality gate working. Only meta_update (targets an existing page) and city_hub (injects venues) were unaffected.

**Fix:** `buildPresenceDirective(market, mkt, brandName)` — config-driven, from the same `citiesForMarketAsync` the planner uses. Appended to the intel directive in all three prompts:
- **Venues configured** → "PRESENCE — this is TRUE, do not contradict it: <brand> IS open and trading in <market>, with venues in <city (venue, venue…)>. Never say or imply we have no presence…" + "Reference venues by NAME only. Never invent an address, phone number, opening hours, or a venue not listed."
- **No venues configured** → "<brand> has NO venues in <market> yet… do NOT target city-level local intent" — so the anti-doorway behaviour is *preserved*, not traded away.
- **Home market** → empty string, existing behaviour untouched.

Verified: new `tools/presence-test.js` (9 assertions) covers venue-market, no-venue-market and home-market; `tools/p3a-test.js` (52) + `tools/quality-test.js` (18) still green. `npm run check` green.

**First real batch run (6 items):** 2 queued (`Meta: fried chicken lahore` `itm_mt9is6ot_qes6ji`, `City hub: Lahore` `itm_mt9ist33_4c5ga8`), 4 skipped by the bug above — to be re-run once this deploys.

⚠️ **STILL OPEN — `page_creation` has no template (the other 6 plan items were NOT run).** Shazin asked whether new pages use the Location template: **they do not.** A plain `page_creation` produces `wpAction:'create_page'` with **no `template`**, and `handleCreatePage`'s allow-list (`writableTemplates: ['template-location.php','template-product.php']`) **409s** it at publish — the body would not render. So those 6 generations would have been wasted. Needed next: route `page_creation` by intent — local/area → `template-location.php` (`page_type:'venue'`, parented under the city hub), product/menu → `template-product.php` — and FIRST check `list_scaffolds`, because **31 empty product scaffolds already exist** (`template-product.php`, 0 words, e.g. `chicken-tenders`, `chicken-burger`, `wraps`, `chicken`), so several plan items should FILL an existing scaffold (`update_content` by postId) rather than create a duplicate page. This is the plan's "TODO P2b: merge unfilled product scaffolds".

### v7.9.33 — executor: believe the QUEUE, not the HTTP status (504 reconciliation)
The v7.9.32 re-run proved the presence fix worked — Claude wrote all 4 Lahore blog posts — but the run reported **4 × "HTTP 504"** while all 4 drafts were sitting in Approvals. `generate-draft` is synchronous, and a blog (GSC pull + 3500-token Claude call + voice check) exceeds Netlify's ~26s gateway; the function keeps running server-side and creates the approval after the caller has given up. Reporting that as an error is worse than useless — it invites a re-run that pays for every draft twice.

`reconcileTimeout(brand, keyword, since)` in the executor: on ANY error result, wait and re-check `/api/approvals` (read-only) for a pending item whose `payload.targetKeyword` matches and that was created since the item started. Found → `queued`, with the reason recorded as *"Generator timed out (HTTP 504) but the draft was created — recovered from the queue, not re-run."* Not found → the error stands, now explicitly stating *"no draft found in Approvals, so nothing was created"* so the operator knows a re-run is safe. `NEST_FAST_RECONCILE` shortens the waits for the offline suite only.

Suite now 54 assertions (added: a 504 that DID create the draft recovers as queued; a genuine failure still reports nothing created). All three suites green — 54 + 18 + 9. `npm run check` green.

⚠️ **Root cause not yet fixed:** `generate-draft` remains synchronous, so the **UI's own ⚡ Generate button also 504s on a blog while silently creating the draft** — the user sees a failure and a phantom draft appears. The structural fix is a `generate-draft-background` + poll (memory `netlify-function-traps` #2). Logged, not built.

### v7.9.34 — `page_creation` routing: fill an existing scaffold, or create on the RIGHT template
Closes the gap Shazin spotted ("it should use the location page template we have, right?" — it didn't). A plain `page_creation` carried **no template**, so `handleCreatePage` would 409 it against Bonbird's `writableTemplates` allow-list and the body would never render. Worse, **12 real product scaffolds already exist as empty drafts** (4 per market × om/qa/pk), so creating a page for one of them would have duplicated it.

**`preflightPageCreations()`** (`_lib/market-planner.js`), run read-only in the execute path before any spend. Three outcomes per item:
1. **FILL a matching scaffold** → `pageKind` from the scaffold's template, `postId` set → `generateTemplatePage` writes the body via `update_content`. Cheapest and safest; no new page.
2. **CREATE on the right template** → product/category intent gets `template_product` + `wpParent:<marketSlug>`, matching how the existing scaffolds are structured.
3. **BLOCK a venue page** → a keyword naming a real configured venue ("bonbird johar town lahore") is refused with an actionable reason: a venue page must be a CHILD of that city's hub and its NAP/images are human-owned ACF, so the hub must exist first. Architecturally correct rather than mis-parenting a page.

**Two subtleties verified live before building** (rule #1): (a) a scaffold's market can only be read from its **`parent`** — draft links are `/?page_id=N`, so `list_scaffolds`' token filter is blind to the market; market home ids resolved from config (`pk`=517, `om`=544, `qa`=542, `ae`=912). (b) Of the 31 "scaffolds" the endpoint returns, only **12 are real** (`template-product.php`, parented to a market home); the other 19 are launch cruft (parent 0, no/elementor template — the `bonbird-post-launch-cleanup` backlog) and are now excluded by construction.

**Matching is deliberately conservative:** every token of the scaffold slug must appear in the keyword, and a single-token slug never matches — otherwise slug `chicken` would swallow "chicken sandwich" and fill the generic product page with the wrong content. Live set: `chicken tenders`→#47016 ✓, `chicken sandwich`→no match, `best burger in lahore`→no match (`chicken-burger` needs both tokens). Venue detection also ignores tokens that are city names, so a venue like "Lahore Fort Branch" can't block every Lahore keyword.

**`generateTemplatePage` now creates as well as fills:** no `postId` → `wpAction:'create_page'` with `template` (+ `pageType:'venue'` for location), `wpParent` and a Claude-supplied slug, typed `page_creation`; with `postId` it behaves exactly as before. `handleCreatePage`'s duplicate-slug-under-same-parent guard still applies.

**Net on the held-back 6:** 1 fills an existing scaffold, 3 create correctly-templated product pages, 2 venue pages are blocked with instructions. Previously all 6 would have generated and then failed at publish.

**Verified:** new `tools/routing-test.js` (16 assertions) replays the exact live Pakistan scaffold set incl. the Qatar same-slug decoy and the cruft drafts. Full offline suite green — **54 + 18 + 9 + 16**. `npm run check` green.

### v7.9.34 — LIVE-VERIFIED: the full Bonbird Pakistan plan is now executed
Live dry run over the 6 previously-blocked `page_creation` items matched the offline suite exactly: 6 selected → **4 runnable, 2 blocked**. Then run for real, both new paths confirmed from the queued payloads:
- **FILL** `Product page: chicken tenders` → `type:page_update`, `wpAction:update_content`, **`postId:47016`** (the real /pk/ scaffold, not the same-slug Qatar one), **no** template/parent/slug (correct — filling, never re-templating), 5 FAQ pairs, `markets:['pk']`.
- **CREATE** `Product page: chicken sandwich` (+ `chicken fries`, `best burger in lahore`) → `type:page_creation`, `wpAction:create_page`, **`template:'template-product.php'`** ← the field whose absence caused the 409, `wpParent:'pk'`, slug from Claude, 5 FAQ pairs, `markets:['pk']`.
- **BLOCKED** the 2 venue keywords, unchanged.

**The 12-item plan is now fully executed: 10 drafts in Approvals, 2 blocked pending their city hub.** (4 Lahore blogs · 1 meta · 1 Lahore city hub · 1 scaffold fill · 3 new product pages.) Voice scores are 7/10 across the batch — visible per item, worth a human read before publishing.

**Remaining known gaps:** (1) `generate-draft` is still synchronous, so the UI's own ⚡ Generate button 504s on a blog while silently creating the draft — the executor reconciles this, the UI does not (fix = `generate-draft-background` + poll). (2) Venue pages need their city hub published first, then they become scaffolds the Nest can fill. (3) P4 — retire the three legacy generators — still open.

### v7.9.35 — CTO/SEO review fixes: content preview bug, halal commodity terms, 4 quality guards
Reviewing the 10 generated drafts as CTO/SEO surfaced one UI bug and five content-strategy defects. All fixed.

**🔴 UI BUG — the generated body was invisible in Approvals.** `buildPreview()` gated the "📄 Read Full Content" button on `payload.body`, but `generate-draft` writes the body to **`payload.content`**. So for EVERY draft the generator produced, the queue showed only title + meta with no way to read it. `previewContent()` already read `p.body || p.content`, so the modal worked and was simply unreachable — only legacy batch-pipeline items (which used `payload.body`) ever showed the button. Fixed with one accessor, `_bodyOf(p)`, used by all three branches so the two field names can't drift again.

**🔴 "halal" is table stakes, not an SEO angle.** Every Bonbird market — UAE, Pakistan, Qatar, Oman — is Muslim-majority, so every competitor is halal too. Optimising for "halal fried chicken" wastes an asset and makes the copy read defensively. GSC still shows halal queries, but that is demand for fried chicken, already served by the base term. New config `brandsConfig.commodityTerms: ['halal']` + `commodityTermsByMarket` override (so a future UK/US entry, where halal IS a differentiator, is a config edit not a code change):
- **Planner** strips the term and folds the variant into the base keyword — `"halal fried chicken lahore"` → `"fried chicken lahore"`, and if that item already exists the duplicate is dropped with a reason. The demand is kept; the redundant asset is not.
- **Generator** (all 5 paths) is told it is table stakes: never in the title, H1, meta description or opening line, never a section — mention once in passing only if a customer would genuinely ask.

**Four quality guards from the review:**
1. **Scaffold-family awareness.** Live, `best burger in lahore` created `/pk/best-burger-lahore/` while the EMPTY `/pk/chicken-burger/` scaffold sat beside it — two pages competing for one product. The strict all-tokens matcher correctly refused a wrong fill but produced a worse outcome. `_matchScaffoldFamily` now fills the sibling when exactly ONE scaffold shares a distinctive token (stopwords like "best"/"in" excluded); ties are refused, so an ambiguous keyword still creates rather than guessing.
2. **Same-URL meta conflicts.** Both `fried chicken lahore` and `fried chicken near me` were queued against post 1170 — a page has one title+description, so publishing the second silently overwrites the first. `preflightTargets` now blocks a second rewrite for a page that already has one pending (or one selected in the same batch), comparing by PATH so relative and absolute forms match.
3. **Internal linking.** All 10 drafts shipped with **zero** internal links — the biggest single miss for a launch cluster. `buildLinkingDirective` requires 2–3 contextual links with descriptive anchors, offering ONLY real known paths (market home + configured city hubs) so a path can never be invented; no known targets → no directive.
4. **Intra-batch cannibalization.** The planner clustered keywords but never checked the resulting ASSETS against each other (hence a burger page and a sandwich page describing the same four products). Added a prompt rule — no two items may serve the same product/intent even under different words; exactly one item owns local intent per city — plus a rules backstop dropping items whose distinctive-token sets are identical.

**Verified:** new `tools/review-fixes-test.js` (26 assertions). Two older assertions were updated because they encoded the now-fixed behaviour (noted inline). Full suite green — **54 + 19 + 9 + 16 + 26 = 124**. `npm run check` green.

⚠️ `commodityTerms` is on the brand SEED; `_load()` uses `rec || BRAND_SEED[slug]`, so a stored Blobs record REPLACES the seed wholesale. Verify live after deploy that `commodityTerms` is present on Bonbird — if a Blobs record shadows it, read-modify-write the stored record via `/api/config` rather than editing the seed.

### v7.9.36 — 🔴 a queued city hub erased its city from the brand's "presence" truth
Caught by live-verifying v7.9.35: the rebuilt Pakistan plan dropped **"fast food restaurants in lahore"** with *"Targets 'lahore', where we have no configured venue — a doorway page."* Lahore has three configured venues; we had just queued its city hub.

**Cause:** `buildMarketPlan` used ONE list for two different jobs. `cities` is `citiesForMarketAsync(market)` **filtered to exclude cities whose hub is already queued** — correct for "which hubs still need building", wrong as "which cities we have venues in". Queueing the Lahore hub removed Lahore from that list, so the no-venue/doorway guard concluded we aren't in Lahore and rejected legitimate Lahore keywords — and the prompt's `WE HAVE VENUES ONLY IN: …` line would have gone EMPTY once every hub was queued, suppressing local content in that market entirely. A self-inflicted version of the same class as v7.9.32.

**Fix:** two explicitly-named lists — `allCities` (every venue city = the presence truth, used for the prompt line and the doorway guard) and `cities` (hub candidates only, queued ones removed). Covered by 3 new assertions in `tools/review-fixes-test.js` that queue a hub and assert the city's keywords still survive and the prompt still names it. Suite: **54 + 19 + 9 + 16 + 29 = 127**. `npm run check` green.

**Live-verified for v7.9.35:** `commodityTerms:['halal']` present on Bonbird (the seed is in use — no Blobs record shadows it, so no read-modify-write needed); rebuilt plan returned **zero halal keywords**; Approvals now renders 9 "📄 Read Full Content" buttons across 12 cards (the 3 without are meta updates, which have no body) and the modal opens with the full body, headings, FAQs and voice score.

### v7.9.37 — audit fixes: cross-run dedup hole + Slack never fired for planner drafts
Audit of the P3 pipeline (fresh-eyes pass) found one concrete bug and the root cause of "Slack didn't ping when items were queued."

**🔴 Cross-run duplication.** The planner's "don't re-plan what's queued" check matched RAW keyword equality only. The commodity-strip dedup and the cannibalization signature dedup both started from EMPTY sets — comparing only within the current plan, never against pending drafts. Proven: with `fried chicken lahore` already queued, a fresh plan containing `halal fried chicken lahore` stripped to `fried chicken lahore`, passed the raw check, and queued a SECOND asset for the same page. Across repeated planning sessions this compounds into authority-splitting duplicates; `handleCreatePage`'s slug guard only saves you when Claude happens to pick the same slug. **Fix:** both dedup sets are now seeded from the queued keywords (stripped/signatured the same way), so a commodity-variant or near-duplicate of a PENDING draft is dropped with a reason pointing at the existing queue item.

**🔴 Slack never fired for planner/generate-draft drafts — two causes.** (1) `notifyQueued` was only wired into `approvals.js`'s HTTP create actions (the old batch pipeline); the planner → `generate-draft` → `createApproval` → `queue.create()` path never notified at all. (2) `notifyQueued`/`notifyPushFailed` read `process.env.SLACK_WEBHOOK_URL` ONLY, ignoring the Blobs `slackWebhookUrl` the Settings UI writes — so a Blobs-configured webhook was a silent no-op everywhere except `slack-notify.js`. **Fix:** the executor now sends ONE `planner_run` summary per run (not per draft) through `slack-notify` (Blobs-first, proven), with a "Open Approvals →" button when anything queued; and `approvals.js` now resolves the webhook Blobs-first via a shared `resolveSlackWebhook()`, so the batch/UI create paths work too. (`_lib/notify.js` is dead code — not imported anywhere — left untouched.)

Verified: `tools/review-fixes-test.js` now 32 assertions (added cross-run dedup + the planner_run builder unit-checked separately). Full suite: 54 + 19 + 9 + 16 + 32. `npm run check` green.

**Audit verdict (recorded for the roadmap):** NOT foolproof. Remaining known gaps, unfixed — (a) `generate-draft` still synchronous → the UI ⚡ Generate button 504s on a blog while silently creating the draft (executor reconciles this, UI does not; fix = `generate-draft-background` + poll); (b) `resolveParentId` matches a slug unscoped (safe for distinctive market slugs pk/qa/om, latent otherwise); (c) execute double-fire guard is a non-transactional Blob read-then-write (low-likelihood race); (d) no staleness warning when a plan is built off old `keywordOpportunities`. **Multi-market: config-ready but only `bonbird_pakistan` has been run end-to-end.** Oman/Qatar (thin/no DataForSEO Labs data → config-driven city-hub + scaffold path) and non-restaurant brands (Southpour cafe, Yolk corporate "no venues" branch) have code paths but ZERO live coverage — dry-run each before trusting. Nothing has been PUBLISHED; all drafts remain human-gated in Approvals.

### v7.9.38 — audit follow-ups: peri-peri off-menu, home-market city hubs (Southpour), off-menu hard guard
From the multi-market dry-run (Oman/Qatar/Southpour) + Shazin's calls:

**1. Peri-peri is off-brand for Bonbird.** Bonbird sells Nashville-style fried chicken, not peri-peri. Added a BRAND-level `offMenu` (`peri peri` + variants) that the planner MERGES with the vertical's off-menu (`offMenu = [...vertical.offMenu, ...brand.offMenu]`) — config, not a literal (rule #2). Also promoted off-menu to a **hard guard on the final plan items**, not just a candidate pre-filter: the LLM can emit an off-brand keyword even when it's dropped from candidates, so it's now enforced post-LLM alongside near-me/commodity/cannibalization. Dropped items show "Off-brand — 'peri peri' isn't something Bonbird sells."

**2. Home-market city hubs (Southpour).** `isUae ? []` hard-disabled city hubs for the home market — correct for Bonbird/Pickl (legacy static /ae/* pages) but wrong for Southpour, a UAE-native Dubai cafe that wants them. Now config-driven: home venues live in a `<brand>_uae` market record; the planner reads `citiesForMarketAsync('<brand>_uae')` for the home market, and `generate-draft`'s city_hub path resolves the same key (`cityMarketKey`). Bonbird/Pickl carry `legacyHomeMarket: true` and are explicitly suppressed, so a future `bonbird_uae` record can never spawn hubs that collide with /ae/*. Verified no `<brand>_uae` record currently exists for any brand, so this is inert until venues are entered.
   ⚠️ **DATA TASK (Shazin, cannot be invented):** to actually produce Southpour Dubai hubs, add Southpour's Dubai venue(s) in Settings → SEO Markets (creates `southpour_uae` with venues). Until then the code path is live but yields zero hubs (correct — never invent a venue). Internal-linking to home-market hubs still degrades to none (no home marketSlug concept yet) — minor, revisit when Southpour venues exist.

**3. 🔴 Venue config is STALE vs the website (Qatar).** Shazin: Bonbird Qatar is in **District One**; the website is authoritative. The `bonbird_qatar` config record has **2 venues (West Walk + District 1)** grouped under Doha — divergent from the live site. This is the known Nest-vs-WP venue divergence (memory `local-seo-pages-bugs-jul22`). NOT auto-corrected — venue truth must come from the site, not a chat sentence (rule #13). Next step: reconcile `bonbird_qatar` (and re-check om/pk) venue records against the live website read-only, show the diff, and correct via Settings/`save_market` with confirmation.

Verified: `tools/review-fixes-test.js` now 36 assertions (peri-peri hard-drop; Southpour home hub yes / Bonbird home hub no). Full suite 54+19+9+16+36. `npm run check` green.

### v7.9.38b — Qatar venue config corrected (District 1 → District One)
Confirmed with Shazin: Bonbird Qatar has TWO Doha venues — **West Walk** (first) + **District One** (second). Config said "District 1". Fixed in BOTH places so they can't drift: the seed literal in `international-config.js` (`locations` + `venues`, and the stale "confirm Qatar locations" cultural note → "confirmed 2026-08-26") AND a read-modify-write to the live `marketsConfig:bonbird_qatar` Blobs record via `save_market` (verified round-trip: venues now West Walk + District One). The earlier "Lusail" doorway concern was moot — Lusail was LLM-invented, not a config venue. Oman (Souq Al Madina/Muscat, Al Khoudh/Seeb) and Pakistan (Cue Cinemas Gulberg, Dolmen Mall DHA, Johar Town — all Lahore) configs reviewed and surfaced to Shazin for confirmation.

### v7.9.39 — product/landing pages must stay on ONE product (intra-body topical drift)
Shazin spotted a queued "chicken fries" product page whose second <h2> was "Chicken Tenders. Your Way." — the body drifted onto a sibling product that has its own page, competing with it. Root cause: the generator prompt says "WHAT BONBIRD OFFERS: <full menu>" + "Only reference REAL offerings: <full menu>", which INVITES covering the whole menu. None of the earlier fixes touched this — cannibalization/dedup are keyword/planning-level, not intra-body focus. Added a focus constraint to both product-page paths (`generateTemplatePage` product branch + `generatePage`): every <h2> must be about the target product; a different product that has its own page gets at most a passing mention, never a section. Location/city pages are unaffected (they're legitimately about the area + full offer). That stale drift-y draft should be dismissed and regenerated. `npm run check` + full suite green.

### v7.9.40 — generate-draft is now async (background + poll); executor generates in-process
Fixes the last High gap: `generate-draft` was synchronous, so a blog (GSC pull + 3500-token Claude call + voice check) exceeded Netlify's ~26s gateway → the UI ⚡ Generate button 504'd while the draft was created anyway (phantom draft + false error).

**Refactor (core extracted, logic unchanged):** the old handler body became `coreGenerate(body, auth)` — every guard (paused, confidence, cannibalization, presence, commodity, off-menu, FAQ, voice, writable-template) is untouched, just relocated. Two entry points wrap it:
- **`exports.handler` (UI)** is now ASYNC: `POST` fires `generate-draft-background` (15-min budget) and returns `202 {jobId}`; a new `action:'job'` polls the stored `genDraftJob:<jobId>`. Job-poll is allowed for any authenticated session; generation stays manager/admin. Frontend: one shared `generateViaJob(params)` helper (fire → poll every 4s, ~3min cap) returns the SAME shape the sync call did, so the 3 UI callers (⚡ Generate, scaffold body, city-hub panel) are unchanged downstream.
- **`generateDraftCore(params)`** — in-process entry for the planner executor. The executor now calls it directly instead of `fetch`-ing generate-draft, so a batch generation has **no gateway limit at all** (it runs inside the executor's 15-min budget). This RETIRES the v7.9.33 504-reconcile hack (deleted `reconcileTimeout`) — a 504 is no longer possible in the batch path.
- **`generate-draft-background.js`** (NEW, no schedule → HTTP-invocable, rule 7) wraps `generateDraftCore` and stores the result.

Verified: new `tools/genjob-test.js` (13 — fire/poll/guards) ; `tools/p3a-test.js` reworked for the in-process executor (mocks `generateDraftCore`; dropped the obsolete 504-reconcile cases) — 50 ; quality 19 · presence 9 · routing 16 · review-fixes 36. `npm run check` green. **Live-verify owed:** UI ⚡ on a blog (no 504, draft appears via poll) + one executor batch (in-process, no 504s).

### v7.9.41 — generate-draft: one retry on a transient empty/invalid Claude response
Live, a planner run posted to Slack "bonbird · bonbird_pakistan (nothing queued) · 1 error" — the item had 502'd with "generation returned no title/content". Root cause: Claude occasionally (~1-in-N) returns an empty or non-JSON blob; the same keyword succeeds on a re-run. (Also confirms the v7.9.37 Slack fix is working live — the run DID notify.) Added `callClaudeJson(prompt, opts, needsRetry)` — retries ONCE when the parse is empty/invalid, with a generator-specific `needsRetry` so a legitimate `{skip:true}` never retries. Wired into all 5 generators (meta needs title+description; page/template/cityHub/blog need title+contentHtml). A still-empty second attempt 502s exactly as before (no behaviour change on genuine failure). Verified: `tools/genjob-test.js` now 17 assertions (retry-once, no-retry-on-valid, no-retry-on-skip, still-empty→empty). Full suite green. `npm run check` green.

### v7.9.42 — 🔴🔴 THE publishing blocker: body field mismatch (content vs body)
Trying to actually publish exposed why no Nest-generated content ever reached WordPress. `generate-draft` stores the body as **`payload.content`**; `wordpress.js` reads **`payload.body`** in create_draft, create_page AND update_content. Consequences, all silent:
- **create_page** → 400 "missing title or body" (every new page/city-hub failed at push).
- **create_draft** (blogs) → same 400.
- **update_content** (scaffold fills) → WORST: the guard `!title && !body` passed on title alone, so it returned **"Content updated" (success) while writing title+meta only — never the body.** A phantom success; the scaffold stayed empty.

The old batch pipeline used `payload.body`, so this only ever bit the newer generate-draft engine — i.e. everything the Market Planner produces. **Fix:** wordpress.js now accepts `payload.body || payload.content` in all three handlers (guard + the actual content write + the update_content body-writable check), and approvals `pushItem` guard matches. Authoritative single normalization. `npm run check` + full offline suite green.

⚠️ Cleanup from the live discovery: the two fills approved before the fix (#47015 chicken-burger, #47016 chicken-tenders) got title+meta but no body; the two create_page items (chicken delivery, Lahore city hub) 400'd. Re-pushed directly from their stored payloads post-deploy (zero Claude) and verified the bodies landed.

### v7.9.43 — RENDER-VERIFIED the template pages via SSH (not just content-saved) + ACF handoff
Shazin rightly pushed: had I looked at how the drafts RENDER, not just that content saved? I hadn't. Did it properly this time — SSH'd into the live `bonbird-timber` theme (WPEngine, `bonbird.ssh.wpengine.net`) and read `template-product.php`/`.twig` + `template-location.twig` + the `acf-json/` field groups, then ran the theme's own `bonbird_split_faq()` against the 4 real draft posts via `wp eval-file`.

**Confirmed:** the new templates render `post.title` → hero H1, my `post_content` prose → the body section, and my `<h2>FAQs</h2>` block → styled accordion + FAQPage JSON-LD. All 4 drafts split correctly (207–371-word bodies, 1.3–1.8 KB accordions, FAQ schema present). So the Nest's content IS correct and DOES render on the new layouts — my earlier "verified the content but not the render" was the gap (the anonymous draft-preview that showed "FINAL HOME NEW" was WordPress falling back to the homepage, not my page).

**The visual layer is ACF (human-owned by design):** product template = `hero_images` (gallery) + `product_cards` (repeater: image/name/description/menu_link); location template = `hero_images` + venue NAP (`address`/`hours`/`phone`/`map_query`), and a `page_type=city_hub` renders its CHILD venue pages as cards. The Nest cannot write ACF/media (anti-fake-NAP guardrail), so a Nest page is always "content-complete, visuals pending human ACF." Per-page finishing checklist written to **`/BONBIRD-PK-ACF-HANDOFF.md`** (the 4 PK drafts #47015/#47016/#47052/#47054, exact fields + how-to + PK menu category IDs).

**SSH access:** `ssh -i ~/.ssh/id_ed25519 bonbird@bonbird.ssh.wpengine.net` (prod install `bonbird`; theme at `sites/bonbird/wp-content/themes/bonbird-timber`; `wp` CLI available — WPEngine has no scp/sftp subsystem, pipe files via `ssh 'cat > sites/bonbird/x.php'` and `wp eval-file` needs a `<?php` opener).

### v7.9.44 — `venue` page kind: the Nest now scaffolds a city hub's child venue pages
Shazin (correctly): the child venue pages under a city hub should be created BY the Nest, with only NAP left to the human. They can be — `page_type=venue`, template, parent, title and body are all REST-writable; only NAP/images are locked (ACF `show_in_rest:0`). The city-hub generator previously stopped at the hub (documented shortcut) — closed that.

New `pageKind:'venue'` in generate-draft (routes through generateTemplatePage as a location page):
- **CREATE** (new child): `create_page` on `template-location.php`, `page_type=venue`, **parented to the hub by `parentId`**, WP title = the venue NAME (`pageTitle`), SEO title → Yoast via `metaTitle`.
- **FILL** (existing venue page by `postId`): `update_content` writes body + Yoast meta but **omits the post title**, so a human-named page ("Cue Cinemas") is never clobbered — `buildSeoMeta` still sets the Yoast SEO title from `metaTitle`.
- Body = location/area prose + FAQ (accordion + schema), same contract as the hub. NAP + images remain the human ACF step.

Threaded `parentId` + `pageTitle` through the handler → coreGenerate → ctx. `handleCreatePage` already honoured `payload.parentId`. `npm run check` green.

Live target (Bonbird Lahore hub #47054): Cue Cinemas #47057 (published, NAP already added by Shazin — body queued for his approval since it's live), Dolmen Mall #47065 (draft — body filled), Johar Town (created as a new child). Only NAP left for the 2 without it. Remaining nicety: auto-loop all configured venues when a hub is generated (dedup vs existing children) — the `venue` kind is the building block.

### v7.9.44b — Lahore venue pages scaffolded live (verified) + parent-display fix
Ran the `venue` kind for the Bonbird Lahore hub (#47054). Verified server-side via wp-cli:
- **#47057 Cue Cinemas** — title PRESERVED (not clobbered), still published, parent 47054, page_type=venue, NAP already present; body generated but LEFT in the Approvals queue for Shazin's approval (live page).
- **#47065 Dolmen Mall** — title preserved, draft, parent 47054, page_type=venue, **body filled (502 words + 5 FAQ)**; needs NAP.
- **#47068 Johar Town** — created new, "Johar Town", draft, **parent 47054** (correctly under the hub), page_type=venue, body 484 words + 5 FAQ; needs NAP.
Confirmed the title-preserving fill works (fills omit post title, set Yoast via metaTitle). Fixed a cosmetic bug: `create_page` success message printed `wpParent` ('root') even when a numeric `parentId` was used — now shows the real parent (`#47054`). Remaining for Shazin: approve the Cue Cinemas body (live), add NAP to Dolmen + Johar Town. All suites green.

### v7.9.45 — city hubs auto-scaffold their venue pages (approve hub → venue drafts appear)
Closes the loop Shazin asked for: generating/approving a city hub now automatically scaffolds a draft venue page for EVERY configured venue in that city — parented to the hub, page_type=venue, body written — so the only human step is NAP.

- **`scaffold-venues-background.js`** (NEW, no schedule → HTTP-invocable): given `{brand, hubPostId, city, marketSlug}`, resolves the market key (from brand+slug), reads the city's venues from `citiesForMarketAsync` (config only — never invents), **dedups against existing children** (new `list_children` WP action; contains-match so a human-named "Cue Cinemas" page dedupes the config "Cue Cinemas, Gulberg"), and loops `generateDraftCore({pageKind:'venue', parentId:hub, pageTitle:venue.name})` for each missing venue → pending approvals. In-process generation (past the sync gateway), one per venue.
- **Trigger:** `approvals.js handleApprove` fires it fire-and-forget when a `city_hub` is successfully pushed. So: generate hub → approve hub → its venue drafts appear in Approvals (deduped) → you approve + add NAP. Also callable directly for a backfill.
- Creates pending APPROVALS, not live pages — the content gate stays; nothing publishes.
- **`list_children`** added to wordpress.js (child pages of a parent: id/title/slug/status).

Verified: new `tools/scaffold-venues-test.js` (11 — scaffolds missing, skips existing via contains-dedup, resolves market from slug, idempotent re-run generates nothing, never invents for a no-venue city, arg guards). Full suite green (50+19+9+16+36+17+11). `npm run check` green. Live backfill for the existing Lahore hub not needed — its 3 venues already scaffolded manually (v7.9.44b).

### v7.9.46 — split H1 (page title) from the SEO title; brand-in-title for venues
Shazin asked whether the brand belongs in the title (SEO call). It does — branded-local searches ("bonbird johar town", "bonbird gulberg") are the highest-intent a venue page wins — but the real bug was using ONE string for two jobs: the generator jammed the keyword-rich SEO title into the WP page title, so it rendered as the H1 (and, for venues, the card heading via `get_the_title`). Result: hub H1 = "Bonbird Lahore | Fresh Fried Chicken, No Bull", products = "Best Burger in Lahore | Bonbird Chicken Burgers" — reads like a meta tag.

**Fix — H1 and SEO title are now separate levers:**
- WP **page title** (= H1, and the venue-card label) → a **clean headline** via `cleanHeading()` (strips the ` | …` / ` - …` / `: …` suffix; splits only on space-padded separators so "Snack-A-Wrap" survives). `generatePage` uses the LLM's `h1` field; hub/product/location use `cleanHeading(title)`.
- **Yoast SEO title** (the `<title>` / SERP) → the full keyword-rich string via `metaTitle` (buildSeoMeta already prefers metaTitle).
- **Venue** page title = **`{Brand} {Venue}`** ("Bonbird Johar Town") — clean as both card and H1, brand as the local keyword; fill still preserves a human-named page.

Verified: `cleanHeading` unit tests in `tools/genjob-test.js` (now 22) incl. hyphen/colon/pipe/dash cases; full suite green. `npm run check` green. Existing Lahore pages retitled live (title/meta only — slugs, permalinks and bodies untouched): hub #47054 → "Bonbird Lahore"; products #47015 "Best Burger in Lahore" / #47016 "Chicken Tenders in Pakistan" / #47052 "Chicken Delivery Lahore"; venues #47068 "Bonbird Johar Town", #47057 "Bonbird Cue Cinemas" (+Yoast set), #47065 "Bonbird Dolmen Mall". ⚠️ Minor: Johar Town auto-slug is `pk-lahore-johar-town` (could shorten to `johar-town` — would change its permalink).

### v7.9.46c — venue slugs = plain venue name (title has brand, slug doesn't)
Pattern confirmed with Shazin: page TITLE carries the brand ("Bonbird Johar Town"), the SLUG stays short and un-prefixed ("johar-town"), because the brand is already in the domain and the path already carries market+city (→ /pk/lahore/johar-town/). Generator: venue create now derives the slug from the plain venue name (not the LLM slug, which tended to include market/city, e.g. `pk-lahore-johar-town`). Fixed the existing Lahore venue slugs live → /pk/lahore/{johar-town,dolmen-mall,cue-cinemas}/ (Johar Town was published but fresh — no redirect needed). Slug changes only; titles/bodies/Yoast untouched.

### v7.9.47 — fix: Approvals queue crashed ("puUrl.startsWith is not a function")
A `page_update` approval that targets a numeric `postId` with no `url` (e.g. the venue/scaffold fills) made `buildPreview`'s page_update branch compute `puUrl = p.url || p.postId` = a NUMBER, then call `puUrl.startsWith(...)` → threw → the WHOLE queue failed to render ("Could not load queue"). Fixed: coerce/guard — link only a real string URL, otherwise show the postId as "#<id>" (no link). The parallel `buildContextBar` path was already safe (`url = p.url || null`). `npm run check` green.

### v7.9.48 — Slack pings for single-item + auto-scaffold generations (the other silent paths)
"0 notifications on Slack" — because only the planner EXECUTOR sent a run summary (v7.9.37). The single-item path (`generate-draft-background`, i.e. the UI ⚡ button + direct /api/generate-draft calls) and `scaffold-venues-background` created drafts via `generateDraftCore` and never pinged. Wired both to `slack-notify` (Blobs-first webhook), new `draft_queued` message type, one ping per action (no per-item spam; the executor's in-process path is unaffected so no double-ping):
- `generate-draft-background`: pings when an item is actually queued (skips/paused don't ping).
- `scaffold-venues-background`: one summary — "N venue pages for <city>".
`npm run check` + suites green. Now every creation surface notifies: planner run summary, single generate, venue scaffold, and approvals.js create.

### v7.9.49 — approval cards for page FILLS label by the target page, not the keyword
Shazin couldn't find "Cue Cinemas" in the queue — the card was titled "Venue page: fried chicken gulberg lahore" (the keyword), though it targets postId 47057 = Cue Cinemas. A page_update/fill card now labels by the PAGE it updates: generateTemplatePage reads the existing WP title (get_current_meta by postId) and titles the card "Venue page: Bonbird Cue Cinemas". (Creates already labelled by pageTitle.) Content was correct all along — the Cue Cinemas body is Gulberg-specific and mentions the venue; H1 stays "Bonbird Cue Cinemas", Yoast targets "Bonbird Gulberg Lahore". The existing pending card keeps its old label (no rename endpoint) — it IS the Cue Cinemas update, safe to approve. `npm run check` + suites green.

### v7.9.50 — fix: "Publish Live" (and hub auto-scaffold) — pushItem dropped the WP post id
"Could not determine WP post ID to publish" on Publish Live. Root cause: `pushItem` returned only `{ ok, ref, message }` — it discarded the `id`/`postType` the wordpress handlers return (create_draft/create_page/update_content all `win({ id, postType })`). So `handlePublishItem` got `pushResult.id = undefined` after the push and bailed with that 500. Same bug silently broke the **venue-scaffold-on-hub-approve** trigger (it fires with `hubPostId: pushResult.id`, which was undefined → 400 → no auto-scaffold). Fix: `pushItem` now surfaces `id: data.id ?? data.postId` + `postType`. Publish-live and hub→venue auto-scaffold both work now. `npm run check` + suites green. (Live-verify: click Publish Live on a draft; approve a city hub → its venue drafts appear.)

### v7.9.51 — P4 (part 1): weekly cron dispatcher — restores the parked Monday data pipeline
The Monday 4am data run (GSC snapshots, rank history, CPC enrichment, published-item tracking, per-brand technical-seo audit) was PARKED since v7.9.16 — `scheduler-background`'s schedule was commented so it stayed HTTP-invocable for the "Run Audit" button (a scheduled fn gets 403'd on HTTP). Reporting/trend data has been going stale as a result. Fixed with the documented dispatcher pattern:
- **`cron-weekly-background.js`** (NEW, `schedule = "0 4 * * 1"`) — cron-only; fires `scheduler-background` over HTTP with `internalHeaders()`.
- ⚡ **DATA-ONLY**: it passes NO `jobs`, so scheduler-background runs only its unconditional data/measurement jobs — **autonomous content-gen stays OFF** (North Star; content is on-demand via the planner). `international-seo-background` is deliberately NOT fired (it IS content-gen → stays manual).
- `scheduler-background` stays schedule-LESS (Run Audit button unaffected).

**Triple-checked:** `npm run check` green; all 7 offline suites green (50+19+9+16+36+22+11); TOML verified — the ONLY newly-active schedule is `cron-weekly-background`, and scheduler/intl/technical-seo remain commented (HTTP-invocable). P4 part 2 (retire/thin the legacy generators) deliberately NOT done — higher risk, low urgency, and scheduler's content jobs are already inert without a `jobs` arg.

### v7.9.52 — tracking accuracy: kill fabricated rankings + clear stale positions
Live tracking run (invoked manually, not waiting for Monday) confirmed the mechanism WORKS — all 5 Lahore items updated lastTrackedAt. BUT four brand-new pages showed position #1 the day they launched: the fuzzy matcher in `trackPublishedItems` attributed ANY GSC query sharing ≥2 words (or a broader term like the branded "bonbird lahore" #1) to a specific page. Fabricated data.
- **`matchTrackedPosition()`** (new, extracted + unit-tested): exact match, else a GSC query that CONTAINS the tracked phrase as a WHOLE word/phrase (a genuine longer-tail, e.g. "chicken tenders" ⊂ "best chicken tenders lahore"); NEVER a broader query; word-boundaried so "chicken" ≠ "chickens". No genuine match → null (honest "not ranking yet"). Exact match wins over a different long-tail.
- **Clear-on-null:** the tracker only ever SET positionLatest, never cleared a wrong one, so fabricated values would persist forever. Now positionLatest/delta/clicks reflect the LATEST measurement (cleared when no match). positionAtPublish + rank history (rank-tracker.js) untouched. Genuine exact-match items (e.g. "bonbird sharjah" #1) are unaffected.
Verified: `tools/tracking-match-test.js` (10). Full suite green (50+19+9+16+36+22+11+10). A re-run will correct the 5 fabricated Lahore positions to honest values.

### v7.9.53 — DataForSEO error cleanup: 40501 invalid-char keywords + 40401 Task-Not-Found poll flood
DataForSEO error dashboard showed 307 errors (25 Aug–1 Sep). Root-caused from the export + endpoint mapping:
- **40501 "Keyword text has invalid characters" (~25: search_volume live 13 + Labs bulk_kd 12 + task_post)** — real GSC queries carry symbols (`best dish?`). We sent them raw. NEW `sanitizeKeywordsForDfs()` in `_lib/keyword-metrics.js`: keeps letters (ANY script — Arabic preserved), digits, spaces, `& ' -`; strips the rest, collapses spaces, drops empties/>80ch, dedupes. Applied in `enrichKeywords` (→ competitor-matrix + keyword-discovery) AND the scheduler CPC `task_post`. Unit-verified (`?`/`؟` stripped, `fish & chips` kept, Arabic kept).
- **40401 "Task Not Found" (192) on `search_volume/task_get`** — the scheduler CPC poll treated EVERY non-20000 status as "keep waiting", so a dead/failed task got hammered all 24 poll attempts (24 × 8 manual runs last session = 192). Fixed: only `40601/40602/40100` (in queue / in progress / not ready) continue polling; any other code (40401 etc.) aborts the poll immediately with a warn.
- **40601/40602 (82) on `serp/task_get/advanced`** — NOT a defect: normal Standard-mode "in queue / in progress" states from citations + ai-overview polling before ready (already handled as keep-polling). Left as-is.
Full suite green + `npm run check`.

### v7.9.54 — Market Planner menu accuracy: stop inventing off-menu product pages + fold national terms into the hub
Shazin caught the Oman/Qatar plans proposing pages for things Bonbird doesn't sell — "fried chicken salads", "chicken catering", and "chicken fingers" (it's **tenders**). The guards caught doorway pages + stale URLs but had **no positive menu** to check against, so Claude inferred products from GSC demand. Pulled the real menu from the `bp-menu` plugin (`ssm_menu_category` CPTs): Bone-In, Tenders, Just Chicken, Chicken Burgers, The Melts, Wraps, Mega Bon Wraps, Snack-A-Wraps, Rice Bowls, Messy Bowls, Sides, Sauces & Dips, Drinks, Desserts (no salads/catering).
- **`brands-config.js` (bonbird):** `offMenu` += `salad`, `catering`; new `menuCategories` (canonical allowlist, documents what's real) + `menuSynonyms` (`chicken fingers/strips → chicken tenders`). Config-driven (rule 12) — a new brand ships its own menu.
- **`market-planner.js`:** `applyMenuSynonyms()` folds wrong-name demand into the canonical term on BOTH candidates (before clustering) and final items (LLM can still emit a wrong name). National-term FOLD (Shazin-approved): a bare-country term ("best fried chicken oman") is no longer dropped as a doorway — it's attached as a secondary keyword to the primary city hub (most-venued city, config order breaks ties = Muscat for Oman), so one authoritative page owns the country term.
- Korean/hot-chicken stay as blog angles (Korean items exist as wraps/melts/rice-bowls; hot = brand style), NOT product pages.
Verified: `tools/menu-accuracy-test.js` (9) + full suite green (50+16+19+9+36) + `npm run check`.

### v7.9.55 — Market Planner: metrics on every card + dedup against PUBLISHED (not just pending)
Shazin's questions on the plans surfaced two gaps. Both built + tested.
- **#1 Metrics on cards.** AI-planned items never carried volume/rank (the clustering step returns only keywords), so cards showed no traffic or current rank. Now `buildMarketPlan` joins each item back to the research data: **volume** (summed across the cluster = total addressable), **current position** (best rank among the clustered keywords, or null = not ranking), and a **goalRank** (commercial pages → top 3, blogs → top 10). The planner card renders `1,200/mo · now #14 · goal: top 3` and a `🎯 kw · kw · kw` line showing the actual clustered keywords (answers "which keywords / what traffic / where do we rank / the goal").
- **#2 Dedup against published.** Was pending-only, so a page published last week could be re-proposed. Now dedups against pending/approved (in-flight) AND pushed/published (live) — `listApprovals({brand})` then partitioned. The signature-dedup reports the accurate reason: *"already published for this brand"* vs *"already in the Approvals queue"*. The silent early drop was removed so the skip is visible in the UI, not invisible.
- **Bug caught by the new test:** the commodity-fold was mislabeling an exact published/queued duplicate as a "halal table stakes" drop; it now only claims "commodity" when the item actually carried a commodity term, otherwise the plain dup falls to the signature-dedup for the correct reason.
Verified: `tools/menu-accuracy-test.js` (18, extended) + full suite green (50+16+19+9+36+22+11+10) + `npm run check`. (Re-optimising an underperforming live page is intentionally NOT re-proposed here — that's a separate future flow via closed-loop attribution.)

### v7.9.57 — "Rewrite with AI" was broken for every page_creation draft (silent reject, nothing requeued)
Shazin gave rewrite feedback on the Muscat city-hub draft and nothing came back. Root cause: `rewriteWithClaude` in `approvals.js` had a prompt map for `blog_draft / meta_update / onpage_suggestion / review_response / schema_update` — **no `page_creation` key**. A city hub / product / venue draft is `type:'page_creation'`, so `prompts[item.type]` was `undefined` → `return null`. And `handleReject` marked the item **rejected BEFORE** the rewrite, then requeued nothing → the draft vanished and the UI still said "revised version queued ✓". Every page-type draft hit this.
- **Added `page_creation` rewrite** — rewrites the full body addressing feedback, keeps the `<h2>FAQs</h2>` contract for template pages, and **MERGES** the result into the original payload so routing survives (pageType, template, wpParent, parentId, market taxonomy, slug). Title split into clean H1 + full metaTitle via the shared `cleanHeading`.
- **Ownership parity (v7.9.56):** the rewrite now injects the SAME market-aware `buildOwnershipDirective` (resolved from the item's market slug), so a rewrite can't reintroduce "homegrown / not a franchise" in a franchised market. Reused from `generate-draft.js` (now exports `buildOwnershipDirective` + `cleanHeading`) — no divergence.
- **No data loss:** `handleReject` now rewrites FIRST and only rejects the original once the revised draft is queued; on failure it returns 502 and keeps the draft pending. Frontend toast only claims success when `res.rewrite` exists (was lying).
Verified: `tools/rewrite-fix-test.js` (14) + full suite green (50+16+19+9+36+22+11+10+18) + `npm run check` + require smoke-test (no approvals↔generate-draft cycle).
Note: the Muscat draft from the failed attempt is already `rejected`; the freshly-generated Muscat hub in the queue still carries the claim — rewrite it (now works) or it'll be caught on rewrite/regeneration.

### v7.9.58 — rewrite follow-up: revised item lost its market tag (invisible under a market filter)
After v7.9.57, a rewritten Seeb hub DID requeue — but the user couldn't see it. `handleReject`'s `createItem` passed the payload but not the original's top-level `locationTag`, so `queue.create` defaulted it to 🇦🇪 UAE. The Approvals market filter (set to Oman) then hid the revised item. Its actual routing was fine (`wpParent:'om'`, city_hub) — purely a queue-filter mislabel. Fix: the revised item now inherits `item.locationTag` (falls back to `payload.locationTag`). Verified: `tools/rewrite-fix-test.js` (19, +handleReject market-tag assertions) + full suite green + `npm run check`. Existing mistagged revised drafts are visible under "All markets" and publish correctly; retag by delete+regenerate if desired.

### v7.9.59 — Rewrite-with-AI now runs the REAL generator (kills the parallel-path drift) + Edit-draft body was uneditable
Two issues from live use. **(1) The band-aid pattern:** `rewriteWithClaude` was a second, drifting copy of the generator — it kept missing what the generator has (page_creation → ownership → market tag), and even after patches it reproduced the franchise claim because it fed the model the OLD body to edit and the model echoed it. Fixed by routing rewrites through `generateDraftCore` itself:
- `generate-draft.js`: new per-call `reviseFeedback` → injected as a top-priority REVISION directive into every generator prompt (distinct from the brand-wide feedback list).
- `approvals.js`: `itemToGenerateParams(item)` reconstructs the generate call (city_hub/venue/template/blog/meta); `handleReject` fires `generate-draft` (background) with `reviseFeedback` + `revisedFrom`, returns `{status:'running', jobId}`. Feedback stays PER-ITEM (no longer auto-appended to the brand-wide list on the generator path, so a one-off tweak can't become a permanent brand rule). Legacy `rewriteWithClaude` kept only as a fallback for light types (review/schema/onpage).
- `generate-draft-background.js`: after a `revisedFrom` run, tags the fresh draft `(revised)`, parents it, and rejects the original on success (no data loss; the new draft is tagged correctly by the generator natively, so no franchise claim + right market).
- `index.html`: the rewrite button polls the regeneration job (`action:'job'`) and reports the real outcome (done/skipped/failed).
**(2) Edit-draft body uneditable:** the Edit modal only rendered the Content box `if (p.body !== undefined)`, but every Nest draft stores its body under `p.content` — so the field never showed for pages/blogs. Now reads/writes the real key (`content`, falling back to `body`), always shows a Content (HTML) textarea for blog/page/page_update.
Verified: `tools/rewrite-fix-test.js` (24 — generator path + itemToGenerateParams + ownership + legacy fallback + market-tag) + full suite green (50+16+19+9+36+22+11+10+18) + `npm run check` + require smoke-test (no cycle).

### v7.9.60 — keyword CLUSTER wired end-to-end (was plan-only; content/queue/tracking/dedup ignored it)
Full-feature audit of the cluster lifecycle found it half-built: the plan grouped keywords but the cluster died at 6 points. Fixed all:
- **Plan → generator:** `planItemToDraftCall` now forwards `keywords` (cluster), `currentPos`, `volume`, `goalRank`; `generateDraftCore` reads them.
- **Generation:** a **cluster directive** injects the secondary keywords into every generator prompt ("this one page should also read naturally for: …") so the page targets the variants, not just the primary.
- **Payload:** `clusterMeta(ctx)` persists `keywords`/`currentPos`/`volume`/`goalRank` on every draft (spread into all 5 payloads).
- **Queue:** the Approvals card shows the cluster (🎯 Also targeting: …) + volume/now-rank/goal, matching the planner card (`_clusterLine`). Edit-draft unaffected.
- **Dedup:** the planner now dedups against every queued/live item's cluster **members**, not just its primary — so a variant already covered by a shipped page ("fried chicken al khoudh" folded into the Seeb hub) is never re-proposed as its own page.
- **Tracking:** `trackPublishedItems` measures each cluster keyword's rank (`item.clusterPositions`, same accurate matcher) and the Published & Tracking card renders per-variant ranks. `positionAtPublish` now populates from the forwarded `currentPos` → closed-loop delta works for planner content.
Verified: `menu-accuracy-test.js` (24, +6 cluster) + `p3a-test` shape updated + full suite green (50+16+19+9+36+22+11+10+24+24) + `npm run check`.

### v7.9.61 — ownership directive de-emphasised (Dubai origin was the backbone, should be a one-off)
The franchised-market directive said "Frame it as a UAE-born brand bringing its food to X" — which MANDATED the Dubai angle, so every page opened with "born in Dubai / no need to drive to Dubai". Rewrote it: origin is now a LIGHT, at-most-once, optional signal (never the hook/opener/backbone; the "drive to Dubai" line explicitly banned as a one-off, not a template); lead with food + local relevance. Hard rules (never "homegrown/local/not a franchise" in-market) unchanged. Verified: rewrite-fix-test 25 + full suite + npm run check.

### v7.9.62 — ownership directive: ban "homegrown" outright on franchised pages
Muscat regen still contained *"Homegrown in Dubai, now properly planted in Oman"* — technically homegrown-in-Dubai (not Oman) so it slipped the in-market-only ban, but exactly the origin-lean to kill. Directive now bans the word "homegrown" ANYWHERE on a franchised page (even "homegrown in Dubai"). rewrite-fix-test updated (26).

### v7.9.63 — publish/update on PAGES failed: "Invalid post ID" (postType singular/plural)
`create_page` and WP's REST `type` return `postType:'page'` (singular), but four endpoint selectors (publish/update_content/update_meta + one) checked `=== 'pages'` (plural) only → a page fell through to `/wp/v2/posts/<id>` → WP rejects a page id as a post. Only surfaced now because city hubs/products are the first PAGES published through the flow (blogs are posts → matched by luck). Fix: all four treat 'page' and 'pages' as pages.

### v7.9.64 — Publish Live now also fires the venue auto-scaffold
The city_hub → venue scaffold trigger lived only in `handleApprove` (Approve → WP Draft). Publishing a hub via `handlePublishItem` (Publish Live) skipped it, so a directly-published hub scaffolded no venues. Added the same idempotent trigger to the publish path.

### v7.9.65 — venue auto-scaffold was DEAD (silent): .find() on a keyed-map object
Even via the correct trigger, scaffolding produced nothing. `resolveMarketKey` did `getMarketsForBrandAsync(brand).find(...)`, but that accessor returns an OBJECT keyed by market key (`acc[m.key]=m`), not an array — `.find` on an object throws a TypeError, and because the bg job had already returned 202 the throw died silently → a published hub scaffolded ZERO venues (Muscat + Seeb). Only "worked" when a caller passed a full market KEY (short-circuits before .find); Approve/Publish pass the market SLUG → always broke. Fix: `Object.values(map).find(...)`. `scaffold-venues-test` had mocked the accessor as an ARRAY (wrong shape) which hid it — corrected to the real object shape (11 green, now guards it). Muscat + Seeb venues backfilled + live (Souq Al Madina #47157, Al Khoudh #47165).

### v7.9.66 — reconcile WP-admin publishes (Nest status drift)
Publishing a page directly in wp-admin never notified the Nest, so its approval item stayed `pushed` while the page was live — the Published & Tracking tab showed "WP draft" and the Google index-check (published-only) never ran. Now `trackPublishedItems` does one cheap internal `get_post` per `pushed` item each Monday; if WP says `publish`, it flips the Nest item to `published` (+ publishedAt). Backfilled the 4 live Oman pages manually (Muscat/Seeb hubs + Souq Al Madina/Al Khoudh venues). Tracking already covered `pushed`, so no ranking data was lost — this just fixes the label + index-check.


### v7.9.56 — market-aware ownership framing (stop "not a franchise" leaking into franchised markets)
Bonbird is homegrown in the UAE and **franchised** in Oman/Qatar/Pakistan, but the brand identity asserted the homegrown claim globally, so generated intl copy said things like *"This isn't a franchise flown in from somewhere else. Bonbird is a homegrown brand built in the UAE and now serving Muscat"* — false for a franchised Oman location (and it recurred in FAQs). Same class of bug as the hardcoded `+971` / `addressCountry:'AE'`.
- **Root cause:** `_lib/brand.js` differentiators carried the absolute `'Dubai-born homegrown brand — not a franchise or import'` (Bonbird) / `'Homegrown UAE brand — not an import or franchise…'` (Pickl), injected into every generation prompt via `buildBrandPrompt`, with no market awareness.
- **Fix:** those differentiators are now origin-neutral facts (`'…founded in the UAE (part of the Yolk Brands family)'`). A new **config-driven** `buildOwnershipDirective(market, mkt, brandName)` in `generate-draft.js` supplies the *right* framing per market and is injected into the **system prompt** (`ctx.systemPrompt`), so it reaches every generator (meta/blog/page/hub/venue): **home market (uae)** → homegrown/not-a-franchise pride is allowed; **franchised markets** → explicit guard ("NEVER describe as homegrown/local/not a franchise in <market>… frame as a UAE-born brand bringing its food to <market>"). Default is `franchise` for non-home markets; a market record may set `ownership:'corporate'` for a company-owned expansion (→ no guard).
- **Scope:** fixes FUTURE generation only. Pages already published with the false claim (the Muscat/Oman page + the FAQ) need a separate content pass.
Verified: `npm run check` green; `presence-test` 9/9 (no regression); `buildOwnershipDirective` output confirmed for home / franchise / corporate cases.
