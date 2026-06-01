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
| 📈 **Reports** | CEO-ready SEO report. Traffic value, rankings, AI readiness | 🔄 Building now |
| 📊 **Analytics & ROI** | Raw GSC data, competitor matrix | ✅ Built |
| ⚡ **Technical SEO** | PageSpeed, CWV, international health, developer kanban | ✅ Built |
| 🌍 **International SEO** | 9-market content pipeline | ✅ Built |
| 🎨 **AI Content Studio** | Review responder, schema gen, content briefs, page audit | ✅ Built |
| ⚙️ **Settings & Logs** | Brand context, users, roles, departments, audit log | ✅ Built |
| ❓ **How It Works** | Scheduler explained, keyword tiers, seed keywords | ✅ Built |

---

## What's Live Today

### SEO Engine ✅
- **Automated content pipeline** — Every Monday 8am Dubai the scheduler runs 4 jobs:
  - Quick Wins (pos 11-20): rewrites existing pages to push to page 1
  - Meta Rewrites (poor CTR): rewrites title + description using real GSC page URLs
  - Content Gaps (pos 21-100 + seed keywords): writes new blog posts
  - Page Creation (location/service intent): builds full landing pages
- **Brand voice quality gate** — Every piece of AI-generated content scored 1-10. Below 5 = auto-rejected. 5-7 = warning. 8-10 = green. Banned words list enforced.
- **Keyword tier system** — ⚡ Quick Win (11-20) · 📈 Short Term (21-35) · 🎯 Long Term (36-100) · 🚨 Priority Gap (seed list)
- **Empty pages fork** — GSC showing impressions for missing/empty WP pages: ≥100 impressions → page_creation opportunity queued. <100 → skipped.
- **Seed keywords** — 20 Pickl + 18 Bonbird pre-loaded non-branded terms. Treated as Priority Gap tier.

### International SEO ✅
- 9 markets: Pickl (Bahrain, KSA, Qatar, Egypt, Jordan, Oman) + Bonbird (Oman, Pakistan, Qatar)
- EN + AR content for GCC markets. EN only for Oman/Pakistan.
- Dedup check, brand voice check, Slack ping on completion.
- Jordan URL: `/pickl-jordan/` — DO NOT CHANGE, already indexed.

### Competitor Intelligence ✅
- DataForSEO Standard mode (not Live — $0.0006/kw)
- Batched 100 keywords per POST, polls every 5s
- Pickl competitors: Salt, High Joint, Shake Shack, Five Guys
- Bonbird competitors: Raising Cane's, Jailbird, Dave's Hot Chicken, Toit, Nash Hot Chicken, Peppers, Jollibee, KFC, Popeyes

### Technical SEO ✅
- PageSpeed Insights (mobile + desktop) on core WP pages
- **Priority pages always audited (from nav screenshots):**
  - Pickl: Homepage, About, Menu, Locations, Franchise, Events
  - Bonbird: Homepage, Menu, Locations, Franchise, Philosophy
- International pages: HTTP health check + mobile PSI on all 9 markets
- Developer kanban: issues auto-created from audit, To Do → In Progress → Done
- Weekly cron: Monday 4am UTC alongside content pipeline
- API key: `GOOGLE_PAGESPEED_KEY` env var (25k queries/day free)

### The Perch (Marketing Team Kanban) ✅
- Drag and drop between columns (To Do / In Progress / In Review / Done)
- Slide-in right panel with inline editing (title, description, all fields)
- Labels: Urgent, Blocked, Awaiting Feedback, Scheduled, In Review, Campaign, Assets Needed, Done *(labels pending colour update)*
- Quick-add cards at bottom of each column
- Assignee by name (not email) from users list
- Filters: Brand + Department + Assignee + Priority + My Tasks toggle
- Visibility rules: Pickl team sees Pickl+Shadowburg. Bonbird sees Bonbird+Shadowbird. Admin sees all.
- Comment thread on every task. Full audit log.

### Auth & Roles ✅
- Google SSO. Only authorised @yolkbrands.com accounts get in.
- Bootstrap admins: shazin@yolkbrands.com, steve@yolkbrands.com (always Admin)
- Roles: Viewer (read-only) · Manager (approve/action) · Admin (everything + user management)
- User profile: role + brand + department assigned by Admin in Settings → Users

---

## What We're Building This Week

### 1. CEO Report Tab 📈
Brand-wise reporting dashboard for executive presentations:
- **Traffic Value** — total clicks × avg CPC for UAE restaurant queries = "what your SEO is worth in paid ads"
- **Position overview** — keywords in top 3, top 10, top 20, plus distribution chart
- **Content pipeline** — items queued, approved, published this month
- **Top keywords** — by impressions, with position and click data
- **Quick Wins** — how many keywords are at pos 11-20 right now
- **AI Search Readiness Score** — based on Google's official AI Overviews guide: HTTPS, page speed, LCP, sitemap, robots.txt, GBP status

### 2. Weekly GSC Snapshots
Every Monday the scheduler now saves a date-stamped copy of GSC keyword data.
From next Monday: week-on-week ranking movement becomes trackable.
From the Monday after: "which keywords moved up/down this week" is real data.
Key: `gscSnapshot:<brand>:<YYYY-MM-DD>`

### 3. Priority Pages Fix
PSI audit now always includes the key nav pages from both sites (Menu, Locations, Franchise, About/Philosophy) regardless of GSC impression data. Games page excluded.

---

## Next Week (Sprint 2)

### Brand Content Feeding — HIGHEST PRIORITY FOR VOICE QUALITY
**The problem:** The brand voice scoring system catches bad content but Claude still writes generically because it's working from rules, not examples. Rules say "be playful" — examples SHOW what playful looks like for Pickl specifically.

**The fix:** Pull the last 30 journal posts from each brand's WordPress. Store in Blobs (`brandExamples:pickl`, `brandExamples:bonbird`). Inject 3-5 real examples into every Claude prompt: *"Here is how Pickl actually writes. Match this voice exactly."*

This is the single highest-leverage improvement to content quality. No scoring change — just showing Claude real Pickl/Bonbird writing instead of describing it.

**Phase 2:** Instagram captions (Instagram Graph API or manual import). Real social copy is even more on-brand than journal posts.

### Hreflang for 9 International Markets
Currently Pickl has 6 international URL paths and Bonbird has 3. Without hreflang tags, Google may treat them as duplicate content and suppress them. Auto-generate the full hreflang block for every market, queue as `page_update` items.

### Slack Rebuild
Per-item detailed notifications grouped by brand/type. Direct links filtered to that brand. Slack action buttons: approve/dismiss without opening The Nest. Requires Slack interactive components + new Netlify function for Slack callbacks.

### Perch Labels Update
Swap current generic labels for: Urgent · Blocked · Awaiting Feedback · Scheduled · In Review · Campaign · Assets Needed · Done

---

## Month 2 — Local SEO + Off-Page

### Google Business Profile Integration 🔴 CRITICAL FOR RESTAURANTS
GBP is more important than the website for local restaurant search. "Smash burger near me" surfaces GBP listings before organic results. Google's AI Overviews guide explicitly calls this out for local businesses.

**What to build:**
- Connect Google Business Profile API (separate OAuth from GSC)
- Pull listing data for all Pickl + Bonbird locations
- Monitor: review volume, star rating, unanswered Q&As, photo freshness, missing info
- Auto-queue: review responses (brand voice checked before queuing)
- Show GBP health score per location in a new Local SEO tab
- AI Search Readiness Score goes green when GBP is connected

### Backlink Monitoring
DataForSEO has a full backlink API. Weekly check:
- Domain authority for eatpickl.com and bonbirdchicken.com
- New links gained, links lost
- Competitor backlink comparison (who's linking to Salt that isn't linking to Pickl?)
- Unlinked brand mentions = link building opportunities

### Google Reviews Management
GMB API → auto-queue review responses → brand voice check → admin approves → publishes reply via GMB API. This was Phase 3 in the original roadmap.

### Citation Tracker
Are Pickl and Bonbird listed consistently on Zomato, TripAdvisor, Time Out Dubai, What's On, The Entertainer? NAP (Name, Address, Phone) consistency check. Missing/inconsistent citations flagged as action items.

### Deep Competitor URL Audit
Enter any competitor URL → get: their top keywords, estimated traffic, backlink count, page speed scores, GSC keyword overlap vs your site. Richer than current DataForSEO keyword-only tracking.

---

## Month 3 — Content Channels + Analytics

### YouTube SEO Module
YouTube is the second largest search engine. Google owns it. Food content on YouTube ranks in Google search results AND in AI Overviews.

**What to build:**
- YouTube keyword research (what are people searching for in our category on YouTube?)
- Video content brief generator (Claude writes a video brief targeting a keyword)
- Video schema markup generator
- Channel performance tracker if YouTube API connected
- "Best chicken sandwich Dubai" on YouTube = direct competitor to Google ranking

### GA4 Integration + Revenue Attribution
Connect GA4 to get:
- Real sessions from organic search (not just clicks from GSC)
- Goal completions / conversions from SEO traffic
- Revenue attribution if ecommerce tracking is set up
- True ROI: "Our SEO drove X sessions which generated Y conversions worth $Z"
- Replaces current estimated traffic value with real revenue data

### AI Overview Visibility Tracker
Are Pickl and Bonbird appearing in Google's AI Overviews for target keywords? Build a monitoring system that checks weekly: for our top 20 keywords, does an AI Overview appear? Are we cited in it? This is the new frontier of SEO visibility.

### Delivery Platform SEO (UAE-specific)
Talabat, Deliveroo, Noon Food, Careem Food are search engines in the UAE. People search for food on these platforms before Google. Separate SEO universe — keyword optimization for delivery platform listings, review management, photo quality. Phase 3 addition.

### Content Freshness Monitor
Flag pages that are 6+ months old and still ranking (they could rank higher with a refresh). Auto-queue `page_update` items for stale high-performing content.

### Arabic Content (GCC Markets)
Arabic prompt layer for bilingual content in UAE, Bahrain, KSA, Qatar, Egypt markets. RTL content handling. Language detection already in international pipeline — needs Arabic generation layer added.

---

## Month 4 — Full Marketing Operations

### Social Media Workflow → SocialPilot
- Social post creation with AI assist (brand-voiced captions)
- Approval workflow (same as content approvals)
- SocialPilot auto-publish on approval
- Platform-specific formatting (Instagram vs Twitter/X vs LinkedIn)
- Content calendar view showing all approved + scheduled social posts

### Content Calendar View
Calendar view across all content types and departments. SEO blog posts, social content, design requests, campaign planning — all in one view. Makes The Perch into a true editorial calendar.

### Email Digest (Resend)
Weekly summary email every Monday: what Claude queued, what was approved, what's live, top 3 SEO targets for the week. CEO-level digest.

### Brand Voice Interview
8-question guided interview that auto-populates brand context fields. Much better than manual form filling. Captures founder voice directly.

---

## Month 5+ — Scale

### Multi-Brand Expansion
One config object = new brand onboarded. Southpour, Shadowburg, Shadowbird into the full SEO pipeline. Any future Yolk Brands brand added in under an hour.

### Franchise SEO
Location-specific pages for franchise partners. Their own brand context layer. Local keyword targeting per franchise location.

### CEO Dashboard + PDF Report
Monthly one-page PDF: top ranking gains, content published, competitor movements, traffic value, ROI summary. Exportable for board presentations.

### Paid Search Integration
GSC organic data informs Google Ads strategy. Keyword opportunity cards cross-referenced with paid performance. Organic + paid working together.

---

## Delivery Timeline

**How we work:** Each session = one or two features. Upload zip, say "read SETUP.md, build X". Deploy. Test. Next session. Keep chats short and focused — long chats make Claude slower and less precise.

**External blockers (outside our control):**
- Google Business Profile API — requires Google Cloud project + OAuth approval
- Instagram Graph API — requires Meta app review
- GA4 revenue attribution — requires proper event tracking on WP sites first
- Ranking movement data — needs Monday's snapshot run before deltas are available

---

### ✅ Done (Sessions 1–N, June 2026)
- Full SEO content pipeline (quick wins, meta rewrites, content gaps, page creation)
- Brand voice system (1-10 scoring, banned words, auto-reject below 5)
- Keyword tier system (Quick Win / Short Term / Long Term / Priority Gap)
- International SEO pipeline (9 markets, EN + AR)
- Competitor matrix (DataForSEO Standard mode)
- Google SSO auth + 3 roles (Viewer / Manager / Admin)
- WordPress REST API integration (drafts, pages, meta, publish)
- Seed keywords + How It Works panel
- The Nest rebrand
- The Perch kanban (drag-drop, side panel, labels, quick-add, filters)
- 5 brands (Pickl, Bonbird, Southpour, Shadowburg, Shadowbird)
- Brand + department in user management
- Technical SEO v2 (WP-sourced priority pages, international health checks, PSI escalation, developer kanban)
- Empty pages fork (impressions ≥100 → page_creation)
- CEO Reports tab (traffic value, position distribution, AI readiness, talking points)
- Weekly GSC snapshots (starts this Monday)
- Priority pages fixed (Menu, Locations, Franchise, About always audited)
- SETUP.md as session handoff document

---

### 🔄 Week 1 (Next session — start here)
**Brand content feeding** ← DO THIS FIRST, highest leverage for voice quality
- Pull last 30 journal posts from WP for each brand
- Store in Blobs: `brandExamples:pickl`, `brandExamples:bonbird`
- Inject 3-5 real examples into every Claude content prompt
- Result: AI writes FROM real Pickl/Bonbird copy, not just from rules

**Hreflang for 9 markets**
- Auto-generate hreflang block for every international URL
- Queue as `page_update` items in Approvals Queue

**Perch labels update**
- Swap to: Urgent · Blocked · Awaiting Feedback · Scheduled · In Review · Campaign · Assets Needed · Done

**Slack rebuild**
- Per-item notifications grouped by brand/type
- Approve/dismiss directly from Slack (interactive components)

---

### Week 2
**Google Business Profile integration** ← biggest local SEO gap
- Connect GBP API (separate OAuth)
- Monitor: reviews, photos, Q&A, listing completeness per location
- Auto-queue review responses (brand voice checked)
- GBP health score per location in new Local SEO tab
- AI Readiness Score goes green when connected

**Google Reviews management**
- Pull reviews via GMB API
- Queue responses → brand voice check → approve → publish

**Backlink monitoring**
- DataForSEO backlink API
- Domain authority, new/lost links, competitor comparison

---

### Week 3
**YouTube SEO module**
- YouTube keyword research for food/restaurant queries
- Video content brief generator (Claude writes briefs targeting keywords)
- Video schema markup generator
- YouTube = second largest search engine, food content wins

**Citation tracker**
- Check Zomato, TripAdvisor, Time Out Dubai, What's On, The Entertainer
- NAP consistency check (Name, Address, Phone)
- Missing/inconsistent citations → flagged as action items

**Content freshness monitor**
- Flag pages 6+ months old that are still ranking
- Auto-queue `page_update` items for stale high-performing content

---

### Week 4
**Social media workflow → SocialPilot**
- Social post creation with AI assist (brand-voiced captions)
- Approval workflow (same as content approvals)
- SocialPilot auto-publish on approval
- Platform-specific formatting

**Content calendar view**
- Calendar showing all approved + scheduled content
- SEO posts, social content, design requests — one view

**Delivery platform SEO (UAE-specific)**
- Talabat, Deliveroo, Noon Food keyword optimisation
- UAE-specific: people search for food on these before Google

---

### Week 5
**GA4 integration + Revenue attribution**
- Connect GA4 (requires tracking set up on WP first)
- Real sessions, conversions, revenue from organic search
- Replaces estimated traffic value with real £/$ numbers

**AI Overview visibility tracker**
- Weekly check: for top 20 keywords, does AI Overview appear?
- Are we cited in it?
- This is the new frontier of SEO visibility

**Week-on-week ranking movement**
- By now we have 3+ weekly snapshots
- Show: keywords that moved up/down, by how much
- Which published content moved the needle

---

### Week 6
**Deep competitor URL audit**
- Enter any URL → full audit (keywords, traffic estimate, backlinks, speed)
- Richer than current DataForSEO keyword-only tracking

**Email digest (Resend)**
- Weekly summary: what was queued, approved, published
- Top 3 SEO targets for the week
- CEO-level digest every Monday

**Brand voice interview**
- 8-question guided interview → auto-populates brand context
- Captures founder voice directly

**Arabic content generation**
- Arabic prompt layer for GCC markets
- RTL content handling

---

### Beyond Week 6
- Franchise SEO (location-specific pages for franchise partners)
- Southpour + dark kitchens into full SEO pipeline
- CEO monthly PDF report (exportable for board)
- Multi-brand expansion (one config = new brand onboarded)
- Paid search integration (organic data informs Google Ads)

---

## What This Week Means for the CEO Meeting

## What This Week Means for the CEO Meeting

**What we've built (talk to this):**
> "We've built The Nest — our internal marketing operations platform. The SEO engine runs every Monday automatically: it identifies our weakest keyword opportunities, writes improved content in Pickl and Bonbird's exact brand voice, and queues it for our approval. We've run this for [X] weeks. The international pipeline covers 9 markets. We have technical SEO monitoring with Core Web Vitals data. And we've built The Perch — a Trello replacement for the whole marketing department."

**What we're showing today:**
> "Here's our current SEO performance: [open Reports tab — traffic value, position distribution, top keywords, Quick Wins waiting]. Here's our AI Search Readiness Score against Google's own AI Overviews criteria — and here's exactly what's holding us back [page speed, GBP]. Here's the content pipeline this month — [X] items queued, [Y] approved, [Z] live."

**What's coming:**
> "Next week we fix the single biggest problem: our brand voice training. The AI is working from rules — next week it works from real Pickl and Bonbird writing. Month 2 is Google Business Profile — the biggest local SEO gap for a restaurant brand. Month 3 is YouTube SEO and revenue attribution. We'll be able to show you the actual money value of every SEO improvement."

**The honest truth on page speed:**
> "Pickl's homepage scores 40/100 on mobile. LCP is 9.4 seconds against Google's 2.5-second threshold. This is directly limiting our eligibility for AI Overviews — the fastest-growing traffic source on Google. This is a developer fix, not a content fix. It needs to be prioritised immediately."

---

## Technical Reference

### Netlify Environment Variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API |
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
| `DATAFORSEO_LOGIN` | DataForSEO API |
| `DATAFORSEO_PASSWORD` | DataForSEO API |
| `SLACK_WEBHOOK_URL` | Optional — Blobs value takes priority |
| `GOOGLE_PAGESPEED_KEY` | PageSpeed Insights API (25k/day free) |

### Netlify Blobs Keys (`seo-tool` store)

| Key | Contents |
|---|---|
| `approvals:index` | Array of all approval IDs |
| `approvals:<id>` | Individual approval payload |
| `userSession:<token>` | Session (email, name, picture) |
| `userRole:<email>` | Role: viewer/manager/admin |
| `userProfile:<email>` | Brand + department assignment |
| `userIndex` | Array of all user emails |
| `gscTokens` | GSC OAuth tokens |
| `gscCache:<siteUrl>` | GSC keyword data (query only) — 24hr TTL |
| `gscPageCache:<siteUrl>` | GSC keyword+page data — 24hr TTL |
| `gscSnapshot:<brand>:<YYYY-MM-DD>` | Weekly ranking snapshot (new) |
| `brandContext:pickl/bonbird` | Editable brand context |
| `brandExamples:pickl/bonbird` | Real WP journal posts for voice training (Sprint 2) |
| `competitorMatrix:<brand>` | Latest competitor rankings |
| `competitorConfig:<brand>` | Competitor domain list |
| `keywordConfig:<brand>` | Keyword filter settings |
| `seedKeywords:<brand>` | Manually curated seed keywords |
| `technicalSeo:<brand>` | Latest PSI audit results |
| `techTask:<id>` | Developer kanban task |
| `techTaskIndex:<brand>` | Array of tech task IDs |
| `perchIndex` | Array of all Perch task IDs |
| `perchTask:<id>` | Individual Perch marketing task |
| `slackWebhookUrl` | Slack webhook URL |
| `scheduler:lastrun` | Last scheduler run summary |
| `intlProcessed:<marketKey>:<lang>` | International dedup check |

### Cron Schedule (All Monday 04:00 UTC = 08:00 Dubai)

```toml
[functions."scheduler-background"]       # Content pipeline + GSC snapshots
[functions."competitor-matrix-background"] # Competitor keyword tracking
[functions."international-seo-background"] # 9-market content
[functions."technical-seo-background"]    # PageSpeed + health checks
```

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

### International Markets

**Pickl (6):** Bahrain `/bh/` · KSA `/ksa/` · Qatar `/qatar/` · Egypt `/egypt/` · Jordan `/pickl-jordan/` ⚠️ · Oman `/oman/`
**Bonbird (3):** Oman `/oman/` · Pakistan `/pakistan/` · Qatar `/qatar/`
⚠️ Jordan URL must never change — already indexed.

---

## Google AI Search Guide — Key Points for The Nest

From Google's official AI Optimization Guide (June 2026):

1. **Page speed is an eligibility gate** — pages must provide "good page experience" to appear in AI Overviews. Pickl's 40/100 mobile score is actively blocking AI Overview eligibility.
2. **GBP is explicitly called out** for local businesses — our #1 missing integration.
3. **Non-commodity content wins** — unique, first-hand, brand-specific content. Our voice system enforces this. Brand content feeding (Sprint 2) makes it even stronger.
4. **RAG means ranking still matters** — AI Overviews are grounded in search rankings. SEO fundamentals still apply.
5. **Things to ignore** — llms.txt files, content chunking, rewriting for AI, inauthentic mentions.
6. **Agentic experiences** — emerging. Semantic HTML and accessibility help browser agents use your site.

---

*Last updated: June 2026 — Full roadmap consolidated. Reports tab building now. Brand content feeding Sprint 2.*
