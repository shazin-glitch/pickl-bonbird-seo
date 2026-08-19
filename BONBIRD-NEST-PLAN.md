# Bonbird × The Nest — enablement plan

> Written 2026-08-19 (Opus). **Read `/BONBIRD-SITE-ARCHITECTURE.md` first** — that's the site-side brief; this is the Nest-side work it implies.
> Goal: make The Nest genuinely functional for Bonbird now that the site rebuild (live 2026-08-18) fixed page speed, hreflang, nesting and market URL structure.
> Every claim below was **verified against the code** (file:line where it matters), not inferred. Status legend: ✅ done · 🔴 blocker · 🟡 should-fix · 🟢 opportunity · ⛔ ruled out (no action).

---

## 0. Already fixed this session (v7.7.9)
- ✅ **ISO market slugs** — `marketSlug`/`journalSlug`/`wpMarketParent` for `bonbird_oman|pakistan|qatar` → `om`/`pk`/`qa` (`_lib/international-config.js`). Publishing now targets real URLs.
- ✅ **URL attribution** — `MARKET_PAGE_TOKENS` now `['om','oman']`, `['pk','pakistan']`, `['qa','qatar']`. **Old words kept on purpose** so pre-18-Aug GSC rows still attribute. Verified by simulation: new + old URLs → correct market; `/ae/` → `uae` (correct, home market); Pickl unchanged.
- ✅ **Connections panel** — Settings → 🔌 Connections. Per brand: WP connects?, **which host it actually reached**, red flag if it looks like dev/staging or if WP's self-reported home ≠ configured base, plus live GSC property + row count. This answers "is Nest pointed at the new site?".

## ⛔ Ruled out — do NOT re-investigate
- **SEO-plugin meta keys are fine.** `wordpress.js` `update_meta` writes Yoast **and** RankMath **and** SEOPress keys simultaneously (`_yoast_wpseo_title`/`rank_math_title`/`_seopress_titles_title`, same for description + focus kw) — so Bonbird-on-Yoast is already covered. (`wordpress.js:367-369`)
- **Attachment `guid` trap** — grep shows Nest never reads `.guid`, so the `localhost:8890` guid issue can't bite us.

---

## PHASE 1 — Stop wrong/silent output (small, do first)

### 1.1 🔴 `market` taxonomy term on journal posts — **Nest currently CANNOT set it**
Doc §4: journal posts are **posts**, and *"Market set via the `market` taxonomy term on the post."* But `wordpress.js handleCreateDraft` only supports `categories` and `tags` (`wordpress.js:131-132`) — **no custom-taxonomy support**. So every Bonbird journal post Nest creates lands with **no market**, and the site can't attribute it.
**Fix:** add generic custom-taxonomy support to `create_draft`/`update_content` (e.g. `payload.taxonomies = { market: ['om'] }` → sent as `{ market: [termIdOrSlug] }`); resolve term slug→id via `/wp/v2/market?slug=…` with a cache. Populate it from the market record in the intl publish path.
**Accept:** create a Bonbird journal draft for `om` → the post shows market = Oman in wp-admin and renders under `/om/journal/`.

### 1.2 🔴 Legacy static pages — body writes are **silent no-ops**
Doc §4: the **13 legacy landing pages** render from `views/page-{slug}.twig`, NOT `post_content`. A body write returns 200 and changes nothing visible. Nest would report success and you'd believe content shipped.
The 13 (UAE): products `/ae/chicken/`, `/ae/wraps/`, `/ae/chicken-burger/`, `/ae/chicken-tenders/`; locations `/ae/dubai/` (+`/city-walk/`, `/mirdif/`, `/motor-city/`), `/ae/sharjah/` (+`/aljada/`), `/ae/abu-dhabi/` (+`/khalifa-city/`).
**Fix:** a config-driven "body not writable" list per brand (put it in the brand/market config, not a code literal — rule 12). `wordpress.js` refuses `update_content`/`create_page` body writes to those slugs with a clear error; **meta updates still allowed** (they do render). Surface in the UI as "meta-only page".
**Accept:** attempting a page_update on `/ae/dubai/` is rejected with an explanatory error; a meta_update on it still succeeds.

### 1.3 🔴 hreflang generator is stale AND duplicates market config
`hreflang.js:26-41` keeps its **own hardcoded slug list** — still `/oman/`, `/pakistan/`, `/qatar/`, and **no `/ae/`**. Since the site's hreflang was just fixed, a Nest-generated hreflang block would now be actively wrong.
**Fix:** delete the local list; derive from the markets config (`getMarketsForBrandAsync`) + the brand's home market, per rule 12. Include `/ae/` for Bonbird UAE. Keep `x-default`.
**Accept:** `GET /api/hreflang?brand=bonbird` emits `/ae/ /om/ /qa/ /pk/` and nothing stale; adding a market via Settings changes the output with no code edit.

### 1.4 🟡 Bonbird menu lists products discontinued in UAE
Doc §3: UAE discontinued **Rice Bowls** (46793) and **Snack-A-Wraps** (46792); **Angry Fries is PK-only**. Nest's `BONBIRD_DEFAULT.menu` still lists both Rice Bowls entries and "Snack-A-Wrap" (`_lib/brand.js`) → content can promote dead products, and `keywordMatchesMenu` treats them as valid.
**Fix:** make the menu **market-aware** (or at minimum remove the UAE-discontinued items and note PK-only items). Cleanest: `menu` + optional `menuByMarket` overrides in brand config.
**Accept:** generated UAE content never mentions Rice Bowls/Snack-A-Wraps; PK content may mention Angry Fries.

### 1.5 🟡 Schema bugs (registered as L1/L2) — now urgent because om/qa/pk are live
`local-seo-pages-background.js:50` hardcodes `addressCountry:'AE'` → publishing location pages for Bonbird's Oman/Qatar/Pakistan asserts the venues are **in the UAE** (false NAP). `:46` hardcodes `'@type':'Restaurant'`.
**Fix:** add ISO `countryCode` to the **market config**, resolve from brand/market context; add `schemaType` per vertical in `VERTICALS`. Keep schema built in code (never by Claude) so fields can't be fabricated.
**Accept:** an Oman location page emits `addressCountry:'OM'`; a café brand emits `CafeOrCoffeeShop`.

### 1.6 🟡 Qatar venues still unconfirmed — blocks Qatar location content
Doc §3 + `international-config.js:370` self-flag: *"Confirm Qatar Bonbird locations before publishing location content."* **Human action, not code.** Reconcile against GBP (`gbpCache:bonbird:v9` = authoritative NAP) and update the market record. Until then: no Qatar venue content.

---

## PHASE 2 — The enablement build (what makes Bonbird productive)

### 2.1 🔴 Teach the generator the Location/Product **template contract**
Verified: `generate-draft.js` and `_lib/content-pipeline.js` have **zero** knowledge of the FAQ format or the ACF boundary (grep = 0 hits).
The contract (doc §4/§5) — a page on the **Bonbird Location** or **Bonbird Product** template is a hybrid:
- **ACF = human/data** → hero images, venue NAP/hours/phone/map, product cards. **Nest must never attempt these** (no ACF write, no media upload).
- **`post_content` = Nest** → author as: **intro prose → SEO sections → `<h2>FAQs</h2>` → `<h3>Question?</h3><p>Answer.</p>` pairs**. The template turns that FAQ block into the styled accordion **and** emits FAQPage JSON-LD — so we get schema for free by obeying the format.
- Title + Yoast meta also writable.
**Fix:** add a `pageKind` (`journal` | `template_location` | `template_product` | `legacy_static`) to the generation request; a matching prompt/format per kind; post-generation validation that the FAQ block is well-formed (`<h2>FAQs</h2>` present, ≥3 `<h3>`/`<p>` pairs) before queueing. Explicitly instruct: never write image/NAP content.
**Accept:** a generated Product body contains valid prose + a conforming FAQ block; pushing it to a scaffold renders an accordion + FAQ schema on the live page; no ACF/media fields attempted.

### 2.2 🔴 Target the 12 waiting scaffolds
Doc §4: **12 product scaffolds already exist as DRAFTS** for om/qa/pk (`chicken`, `wraps`, `chicken-burger`, `chicken-tenders`) — parent + template + slug set, **empty bodies ready**, post IDs **47005–47016**.
**Fix:** a UI surface (Opportunities or a "Bonbird scaffolds" panel) listing empty scaffolds → ⚡Generate → writes `post_content` by **postId** → human adds images → publish.
**Accept:** pick a scaffold, generate, review, push → body live; repeat for all 12.

---

## PHASE 3 — 🟢 The opportunity the doc names

### 3.1 City-hub tier (also registered as finding **L3**)
Doc §6: city/area hub pages (e.g. "Fried Chicken in Sharjah", "Best Chicken Burger Doha") — content-driven, **NOT tied to a physical store** — are the surface Nest should generate. **This tier doesn't exist yet** and is the clearest Nest-owned win. Nest generates one page per GBP *venue* today; the tier above is missing.
**Hard rules (doc §6, non-negotiable):**
- **Never invent a venue** (fake NAP = penalty). Venue pages only get copy once a real store exists and a human entered the NAP.
- **Anti-doorway/thin-content bar:** near-duplicate "city-name mad-libs" get deindexed as a cluster. Every page must be genuinely differentiated — real neighbourhood context, distinct local keywords, distinct FAQ.
**Accept:** generated city hubs for 2 markets are materially different from each other (not templated), pass the thin-content bar on review, and target head terms venue pages can't.

### 3.2 Internal-linking + social signals (small, real SEO value)
- **Menu deep-links:** categories are a **single shared set**; link as `/{market}/menu/#ssm-category-<id>` — Bone-In `46781` · Tenders `46782` · Just Chicken `46783` · Burgers `46784` · The Melts `46785` · Wraps `46786` · Sides `46788` (Messy Bowls 46787, Sauces&Dips 46789, Drinks 46790, Desserts 46791). Generated content should use these instead of bare `/menu/`. Store in config, market-aware (never hardcode `/ae/`).
- **Social per market** (schema `sameAs` / references): UAE + regional default `bonbird.mena`; Oman `bonbird.oman` (TikTok falls back to mena); Qatar `bonbird.qatar`; Pakistan `bonbird.pk`.

---

## Ordering + rules
**Recommended:** 1.1 → 1.2 → 1.3 (stop wrong output) → 2.1 + 2.2 (make it productive, uses the scaffolds already built) → 1.4/1.5 folded in with 2.1 → 3.1 → 3.2. 1.6 is a human task, in parallel.

**Rules for every step** (CLAUDE.md): config-driven, never hardcoded (#12) — new lists go in brand/market config; auth-gated (#11); `node --check` all JS **plus** the extracted `index.html` inline script; **frontend is THREE surfaces** — `index.html`, `js/*.js`, `login.html`; after any bulk find/replace grep for `const X = X(` (TDZ bombs that `node --check` can't catch); update SETUP.md + memory before committing; **never push without Shazin's approval**; one batched deploy per phase.

**Deploy caution:** Netlify function env vars are capped at **4KB total** and were already over (see memory `netlify-4kb-envvar-ceiling`) — if a deploy fails, check that before suspecting code. **If a code fix appears to have no effect, verify the deploy actually Published.**

**Verification caveat:** the app is auth+Blobs-gated, so I can verify logic headlessly but **live behaviour needs Shazin signed in**. Don't claim a step is done on headless checks alone — say what was verified and how.
