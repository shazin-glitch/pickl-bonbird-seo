# The Nest — SETUP.md
> **Definitive source of truth.** Updated every time a change is made.  
> Start new chats by uploading the zip and saying **"read SETUP.md"**.

---

## Platform Identity

| Field | Value |
|---|---|
| **Platform name** | The Nest |
| **Current module** | SEO (more departments coming) |
| **Repo** | shazin-glitch/pickl-bonbird-seo |
| **Current URL** | https://yolkseo.netlify.app |
| **Target URL** | thenest.yolkbrands.com (custom domain — future) |
| **Stack** | Vanilla HTML · Netlify Functions (CommonJS) · Netlify Blobs (`seo-tool` store) |
| **Working dir** | `/home/claude/output/` |
| **Zip command** | Always zip from `/home/claude/` as `pickl-bonbird-seo-main.zip` |
| **Deploy** | Drag zip to Netlify dashboard |

---

## Vision

The Nest is the central marketing operations platform for Yolk Brands. Every department works from it. Role and department-aware — each person sees what's relevant to them.

**Departments using The Nest (current + planned):**
- **SEO team** — content queue, keyword strategy, technical health ✅ built
- **Content team** — blog planning, Google reviews, approval workflow
- **Social media team** — content calendar, post scheduling → SocialPilot
- **Design team** — project requests, asset tracking, status
- **Management** — cross-department visibility, approvals, reporting

**Core principle:** Everything internally linked. Tasks traceable back to their origin. No jumping between tools.

**Replaces:** Trello (project management), eventually Buffer/Hootsuite (social scheduling)

---

## Navigation Structure (locked)

| Tab | Purpose | Status |
|---|---|---|
| 🪺 **The Perch** | Landing page for everyone — role/dept aware kanban + task board | 🔜 To build |
| 📋 **Approvals Queue** | SEO content items waiting for review/publish | ✅ Built |
| 📊 **Analytics & ROI** | GSC keyword data, competitor matrix | ✅ Built |
| ⚡ **Technical SEO** | Page speed, CWV, site health + developer kanban | 🔄 In progress |
| 🌍 **International SEO** | 9-market content pipeline | ✅ Built |
| 🎨 **AI Content Studio** | Review responder, schema gen, content briefs | ✅ Built |
| ⚙️ **Settings & Logs** | Brand context, users, audit log, Slack webhook | ✅ Built |

**The Perch** is the first tab everyone sees on login. Personalised by role + department.

---

## Two Kanbans (locked)

### 1. Developer Kanban — lives inside Technical SEO tab
- Scoped to technical fixes only (speed issues, missing sitemap, broken pages etc.)
- Auto-populated from audit results — no manual creation needed
- Developer logs in, sees their tasks, updates status
- Statuses: To Do → In Progress → Done
- Internal link back to the audit result that generated it
- Never bleeds into Approvals Queue

### 2. The Perch — Marketing Team Kanban
- Replaces Trello for all departments
- Manual task creation + auto-populated from tool workflows
- Fields: title, description, department, assignee, due date, priority, status
- Departments: SEO / Social / Design / Content
- Statuses: To Do → In Progress → In Review → Done
- Internal links to related approvals, audits, content items
- Filtered by department/assignee/status

---

## Brands

### Pickl
- **Website:** https://eatpickl.com
- **Tagline:** "Grain-fed beef, smashed, seasoned, served up by legends"
- **Tone:** Playful, Cheeky, Relatable, Witty — never corporate
- **Customers:** "Legends"
- **Key language:** Gooder, Sando, Soon-ish, Jeff it up, Little Legends
- **WP env vars:** `WP_PICKL_BASE`, `WP_PICKL_USER`, `WP_PICKL_APP_PASS`
- **UAE locations:** JBR, City Walk, JLT, Motor City, Mirdif, Al Safa, Khalifa City, Mamsha Abu Dhabi, WTC Abu Dhabi, Al Ain, Al Hirah Beach Sharjah, Al Jada Sharjah, Mina Al Arab RAK

### Bonbird
- **Website:** https://bonbird.com
- **Tagline:** "All bird. No bull."
- **Tone:** DIRECT · BOLD · DYNAMIC · CONFIDENT · UNAPOLOGETIC
- **Customers:** "Champs"
- **WP env vars:** `WP_BONBIRD_BASE`, `WP_BONBIRD_USER`, `WP_BONBIRD_APP_PASS`
- **UAE locations:** (stored in brand context Blobs)

---

## Architecture

```
/
├── index.html                          # Full SPA — all tabs rendered here
├── login.html                          # Google SSO login page
├── netlify.toml                        # Redirects + cron schedules
├── package.json                        # @netlify/blobs ^8.1.0
└── netlify/functions/
    ├── _lib/
    │   ├── brand.js                    # buildBrandPrompt(), runBrandVoiceCheck()
    │   ├── bonbird-brand.js            # Bonbird brand context
    │   ├── international-config.js     # All 9 market configs
    │   ├── notify.js                   # Slack helper used by background fns
    │   └── store.js                    # Blobs store wrapper
    ├── approvals.js                    # GET/POST/PATCH/DELETE approval items
    ├── auth-callback.js                # Google OAuth callback (login + GSC flows)
    ├── auth-login.js                   # Redirects to Google — ?type=login or ?type=gsc
    ├── auth-logout.js                  # Clears yolk_session cookie
    ├── auth-user.js                    # Returns { email, role } from session
    ├── claude.js                       # Anthropic API proxy
    ├── competitor-config.js            # GET/POST competitor lists per brand
    ├── competitor-matrix.js            # Trigger + status for matrix runs
    ├── competitor-matrix-background.js # DataForSEO Standard mode, batched 100 kw/POST
    ├── db-get.js / db-save.js          # Generic Blobs read/write
    ├── gsc-data.js                     # GSC API — 24hr Blobs cache
    ├── international-seo-background.js # 9-market content pipeline
    ├── keyword-config.js               # Per-brand keyword settings
    ├── reviews.js                      # Review Responder (AI Content Studio)
    ├── scheduler.js                    # Manual trigger endpoint
    ├── scheduler-background.js         # Main weekly SEO pipeline (cron)
    ├── seed-keywords.js                # GET/POST/DELETE seed keywords per brand
    ├── slack-notify.js                 # Webhook sender
    ├── technical-seo.js                # GET cached audit / POST triggers background
    ├── technical-seo-background.js     # PageSpeed Insights + site health checks
    ├── user-management.js              # Admin user CRUD
    └── wordpress.js                    # WP REST API — drafts, pages, meta, publish
```

---

## Netlify Environment Variables

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

---

## Netlify Blobs Keys (`seo-tool` store)

| Key | Contents |
|---|---|
| `approvals:index` | Array of all approval item IDs |
| `approvals:<id>` | Individual approval payload |
| `userSession:<token>` | Session data (email, name, picture) |
| `userRole:<email>` | Role string: viewer / manager / admin |
| `userIndex` | Array of all user emails |
| `gscTokens` | Google Search Console OAuth tokens |
| `gscCache:<siteUrl>` | GSC keyword-only data — 24hr TTL |
| `gscPageCache:<siteUrl>` | GSC keyword + page URL data — 24hr TTL |
| `brandContext:pickl` | Editable brand context (Settings tab) |
| `brandContext:bonbird` | Editable brand context (Settings tab) |
| `competitorMatrix:pickl` | Latest competitor rankings |
| `competitorMatrix:bonbird` | Latest competitor rankings |
| `competitorConfig:pickl` | Competitor domain list |
| `competitorConfig:bonbird` | Competitor domain list |
| `keywordConfig:pickl` | Keyword filter settings |
| `keywordConfig:bonbird` | Keyword filter settings |
| `seedKeywords:pickl` | Manually curated seed keyword list |
| `seedKeywords:bonbird` | Manually curated seed keyword list |
| `technicalSeo:pickl` | Latest technical SEO audit results |
| `technicalSeo:bonbird` | Latest technical SEO audit results |
| `technicalTasks:pickl` | Developer kanban tasks from audit |
| `technicalTasks:bonbird` | Developer kanban tasks from audit |
| `slackWebhookUrl` | Slack webhook URL (set via Settings tab) |
| `scheduler:lastrun` | Timestamp of last scheduler run |
| `intlProcessed:<marketKey>:<language>` | Dedup check for international pipeline |

---

## Cron Schedule

All background functions run **Monday 04:00 UTC (08:00 Dubai)**.

```toml
[functions."scheduler-background"]
  schedule = "0 4 * * 1"

[functions."competitor-matrix-background"]
  schedule = "0 4 * * 1"

[functions."international-seo-background"]
  schedule = "0 4 * * 1"

[functions."technical-seo-background"]
  schedule = "0 4 * * 1"   ← TO ADD in next build
```

> ⚠️ Background functions must be called at `/.netlify/functions/<name>` directly.  
> Redirects in `netlify.toml` do **NOT** work for background functions.

---

## Auth & Roles

- **Cookie:** `yolk_session` — HttpOnly, 7-day TTL
- **Bootstrap admins (hardcoded):** shazin@yolkbrands.com, steve@yolkbrands.com — always Admin regardless of Blobs
- **Flow:** `auth-login.js?type=login` → Google → `auth-callback.js` detects `state=login` param
- **GSC flow:** `auth-login.js?type=gsc` (default) → same callback

| Role | Permissions |
|---|---|
| **Viewer** | Read-only — see queue, can't act |
| **Manager** | Approve / Edit / Dismiss / Trigger scheduler |
| **Admin** | Everything + user management (Settings tab) |

> **Planned:** Department field on users (SEO / Social / Design / Content) — drives The Perch personalisation

---

## Keyword Tiers

| Tier | Positions | Emoji | Colour | Strategy |
|---|---|---|---|---|
| Quick Win | 11–20 | ⚡ | Green `#059669` | One update = page 1. Fastest ROI |
| Short Term | 21–35 | 📈 | Amber `#d97706` | New focused post. 4–8 weeks |
| Long Term | 36–100 | 🎯 | Indigo `#6366f1` | New content from scratch. 3–6 months |
| Priority Gap | Seed list / 0 GSC impressions | 🚨 | Red | Competitor ranks top 20, we have zero |

---

## Brand Voice System

Lives in `_lib/brand.js` → `runBrandVoiceCheck(content, brand)`

| Score | Status | Action |
|---|---|---|
| 8–10 | ✅ Green badge | Queue normally |
| 5–7 | ⚠️ Yellow warning | Queue with warning |
| Below 5 | ❌ Auto-rejected | Not queued |

**Banned words/phrases:** delicious, tasty, mouth-watering, scrumptious, legendary, furthermore, in conclusion, culinary journey, elevate your, indulge in, em dashes (—), en dashes, + 10 more AI clichés.

---

## Approval Queue

**Item types:** `blog_draft` · `meta_update` · `page_update` · `page_creation` · `onpage_suggestion` · `review_response`

**Actions:** Approve · Approve & Publish · Edit Draft · Rewrite with AI · Dismiss · Read Full Content

**Bulk action:** Dismiss Visible (with confirmation)

**3 filters:** Type + Brand + Market

---

## Technical SEO — Audit Spec (locked, to build)

### Audit scope
- **Full PSI** (mobile + desktop): UAE core pages + franchise page (~9 pages per brand). Always runs.
- **HTTP health check**: All international market pages (~30 pages). Fast, ~30 seconds total.
- **Full PSI on escalation**: Any international page that fails health check (slow response >3s or HTTP error) automatically gets full PSI run.

### Pages always audited (full PSI)
**Pickl:** Homepage, Menu, Locations, Journal, Franchise  
**Bonbird:** Homepage, Menu, Locations

### International pages (health check only, escalates to PSI on failure)
All 9 markets — see International Markets section below.

### Results display
- Brand filter + Market filter + Status filter (All / Issues only / Healthy)
- Grouped by market within filtered view
- Each market row expandable — shows page URLs, scores, CWV, opportunities
- Issues panel below filtered view, ordered by severity

### Developer kanban (inside Technical SEO tab)
- Auto-populated from audit — never manual
- Statuses: To Do → In Progress → Done
- Each task links back to the audit result that generated it
- Never appears in Approvals Queue

### Automation
- Manual "Run Audit" button — primary necessity, always available
- Weekly cron Monday 4am UTC — convenience, runs alongside other Monday jobs

### What is NOT in this tab
- Content suggestions → go to Approvals Queue
- Blog drafts, meta updates → go to Approvals Queue
- Marketing team tasks → go to The Perch

---

## Empty Pages Fix (locked, to build)

When `runMetaRewrites` finds a page in GSC that doesn't exist in WordPress or has <100 words:

| Condition | Action |
|---|---|
| Page exists in WP, ≥100 words | Proceed with meta rewrite as normal |
| Page missing/empty + impressions ≥100 | Queue as `page_creation` — full content, meta title, description |
| Page missing/empty + impressions <100 | Skip silently, log reason |

---

## International Markets

### Pickl (6 markets)
| Market | URL path | Languages | DataForSEO code |
|---|---|---|---|
| Bahrain | `/bh/` | EN + AR | 17000 |
| KSA | `/ksa/` | EN + AR | 2682 |
| Qatar | `/qatar/` | EN + AR | 2634 |
| Egypt | `/egypt/` | EN + AR | 2818 |
| Jordan | `/pickl-jordan/` ⚠️ DO NOT CHANGE | EN + AR | 2109 |
| Oman | `/oman/` | EN only | 2840 |

### Bonbird (3 markets)
| Market | URL path | Languages | DataForSEO code |
|---|---|---|---|
| Oman | `/oman/` | EN only | 2840 |
| Pakistan | `/pakistan/` | EN only | 2840 |
| Qatar | `/qatar/` | EN + AR | 2634 |

---

## Competitors

### Pickl
Salt (saltuae.com), High Joint (highjoint.co), Shake Shack, Five Guys

### Bonbird
Raising Cane's, Jailbird (jailbirddubai.com), Dave's Hot Chicken, Toit, Nash Hot Chicken, Peppers, Jollibee, KFC, Popeyes

---

## DataForSEO Rules

- ✅ **Standard mode ONLY** — `task_post` then `task_get` polling
- ❌ Never use live/advanced endpoint
- Batch up to **100 keywords per POST**
- Poll every 5s, max 10 minutes

---

## Slack Notifications

- **Webhook URL:** Blobs `slackWebhookUrl` takes priority over `SLACK_WEBHOOK_URL` env var
- **Set via:** Settings tab
- **Currently sends:** Basic queue summary only
- **Planned rebuild:** Per-item detail, grouped by brand/type, Slack action buttons (approve/dismiss without opening tool)

---

## WordPress Integration

- Always check `/posts` then `/pages` endpoints
- Jordan posts use parent page `/pickl-jordan/` with journal child slug
- Actions: `create_draft`, `create_page`, `update_content`, `update_meta`, `publish`

---

## API Routes

| Frontend path | Function |
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

---

## Build State Log

### Phase 1 ✅ Complete
Dashboard + approvals queue · 6 item types · Approve/Publish/Edit/Rewrite/Dismiss · Dismiss Visible · Scheduler background (4 jobs) · Brand context system · WordPress REST API · GSC pipeline · Analytics & ROI tab · AI Content Studio · Settings tab

### Phase 2 ✅ Complete
Google SSO · 3 roles · Sign out button · Competitor Matrix (DataForSEO Standard mode) · International SEO pipeline (9 markets) · Bonbird brand context · Brand voice system (1–10 scoring) · Keyword tier system · Seed keywords · 3-filter queue · Slack notifications (basic) · How It Works panel · Full content preview modal

### Session: Technical SEO v1 + Empty Pages Fix (June 2026) ✅ Built, pending deploy
**Empty pages bug fix:** GSC now fetched with `dimensions: ['query', 'page']` via new `fetchGscWithPages()` in store.js. `runMetaRewrites` uses real GSC URLs, validates WP content ≥100 words before queuing. Empty pages no longer generate meta updates.

**Technical SEO tab (v1):** On-demand audit via PageSpeed Insights API. Mobile + desktop scores, LCP/CLS/TBT, field data, Lighthouse opportunities, sitemap + robots.txt checks. Polls every 4s while running. Critical issues auto-queued as `onpage_suggestion`.

**⚠️ Not yet correct — to fix in next session:**
- Empty pages with impressions ≥100 should become `page_creation` not just skip (logic locked, not built yet)
- Technical issues should NOT go to Approvals Queue — need own Blobs key + own kanban in Technical SEO tab
- Audit scope needs expanding: franchise page, all international pages (health check), auto-escalate to PSI on failure
- Weekly cron not yet added to `technical-seo-background`
- Results need Brand + Market + Status filters, not just Brand switcher
- Developer kanban not yet built

### Pending Deploy (zip ready)
- Sign out button fix
- How It Works scroll fix
- Technical SEO tab v1 (basic version — see corrections above)
- Empty pages partial fix

---

## Roadmap

### Next session — Technical SEO v2 + Empty Pages fix (complete)
1. Fix empty pages fork: impressions ≥100 → `page_creation`, else skip
2. Rebuild Technical SEO audit: franchise page + international health checks + PSI escalation
3. Move technical issues OUT of Approvals Queue → own Blobs key + developer kanban in Technical SEO tab
4. Add Brand + Market + Status filters to results
5. Add weekly cron to `technical-seo-background`

### After that — The Perch (Phase A)
1. Rename tool from "Yolk SEO Command Center" to "The Nest" across all branding
2. Build The Perch tab — marketing team kanban, replaces Trello
3. Add department field to users
4. The Perch personalised by role + department on login
5. Internal linking: tasks link to their source (audit, approval, etc.)

### Slack rebuild
Per-item detailed notifications, grouped by brand/type, direct filtered links, Slack action buttons (approve/dismiss from Slack)

### Phase 2 Remaining (SEO)
- Competitor gap feed → auto-flag Priority Gap when competitor ranks top 20, we have zero
- DataForSEO Keywords for Keywords → related keyword suggestions → auto-populate seed list
- Hreflang audit + generator across all 9 international markets

### Phase 3 — Content + Reviews
- Google Reviews (GMB API → auto-queue responses → brand voice check → approve → publish)
- Arabic content generation (bilingual SEO, RTL handling)
- ROI dashboard (before/after position tracking)
- Email digest (weekly Resend summary)

### Phase 4 — Social + Full Marketing Ops
- Social media workflow: post creation → approval → SocialPilot auto-publish
- Content calendar view
- GA4 Analytics dashboard (replaces static Analytics tab)
- Brand voice interview (8-question → auto-populates brand context)
- Journal + caption feeding (WP posts + Instagram → brand-examples.md → prompts)

### Phase 5 — Scale
- Multi-brand expansion (one config object = new brand)
- Franchise SEO (location-specific pages)
- CEO dashboard (monthly PDF report)
- Paid search integration

---

*Last updated: June 2026 — Platform renamed to The Nest. Nav structure locked. Two kanbans locked. Technical SEO v2 spec locked. The Perch spec locked.*
