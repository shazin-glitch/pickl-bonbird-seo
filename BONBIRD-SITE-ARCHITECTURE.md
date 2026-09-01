# Bonbird Site Architecture — brief for The Nest

_Last updated: 2026-08-19. **Read this before generating or publishing ANY Bonbird content.** The Bonbird website was rebuilt off Elementor into a WordPress + Timber (Twig) theme and went live at **bonbirdchicken.com** on 2026-08-18. The old assumptions ("just post to /posts or /pages") no longer hold — page type now decides whether Nest can write to something._

---

## 1. TL;DR — what changed
- Rebuilt off Elementor → **WP + Timber** theme; **live at `https://bonbirdchicken.com`**.
- **ISO market URL structure**: every market is now prefixed — **`/ae/` (UAE), `/om/` (Oman), `/qa/` (Qatar), `/pk/` (Pakistan)**. UAE moved from the root to `/ae/`. **136 redirects** map every old URL → its new `/xx/` path.
- **Never target the root or old (pre-ISO) URLs.** Always publish under `/ae/`, `/om/`, `/qa/`, `/pk/`.

## 2. WP connection (Nest's access)
| Netlify env | Value |
|---|---|
| `WP_BONBIRD_BASE` | `https://bonbirdchicken.com` (NOT `bonbirddev…`) |
| `WP_BONBIRD_USER` | `shazin@eatpickl.com` (admin) |
| `WP_BONBIRD_APP_PASS` | the **"Claude SEO Bot Bonbird"** application password |

The app password survived the go-live DB copy (it came from the dev DB). If Nest 401s, either `WP_BONBIRD_BASE` still points at `bonbirddev` (fix it to the live domain) or the app password needs recreating (wp-admin → Users → `shazin@eatpickl.com` → Application Passwords). Redeploy Nest after any env-var change.

## 3. Markets & shared config
- Markets: **ae / om / qa / pk** (ISO). A page's market is derived from its **top-ancestor page slug** (`/om/…` = Oman). Each market home = `/{market}/`.
- **Menu categories are a SINGLE shared set** (`ssm_menu_category` CPT) — every market's menu renders the same anchors. Deep-link with `/{market}/menu/#ssm-category-<id>`:
  Bone-In `46781` · Tenders `46782` · Just Chicken `46783` · Burgers `46784` · The Melts `46785` · Wraps `46786` · Sides `46788` (also: Messy Bowls 46787, Sauces&Dips 46789, Drinks 46790, Desserts 46791). *UAE discontinued Rice Bowls (46793) & Snack-A-Wraps (46792); Angry Fries is PK-only.*
- **Social accounts per market** (for schema `sameAs` / any social references): UAE + regional default = **`bonbird.mena`**; Oman = **`bonbird.oman`** (TikTok falls back to mena); Qatar = **`bonbird.qatar`**; Pakistan = **`bonbird.pk`**.

## 4. Page types — WHERE NEST CAN AND CAN'T WRITE  ⚠️ most important section
| Page type | Rendered from | Nest can write? |
|---|---|---|
| **Journal / blog posts** (`/{market}/journal/…`) | `post_content` | ✅ **Fully** — body + Yoast meta. Primary content surface. Attribute via the `markets` REST field (see below). |
| **Phase-2 data-driven pages** ("Bonbird Location" / "Bonbird Product" templates) | ACF fields + `post_content` | ✅ **Body writable** (prose + FAQ). Media/NAP are ACF = human. |
| **13 legacy landing pages** (see below) | **static generated Twig** (NOT post_content) | ⚠️ **Body NOT writable** — editing `post_content` has *no visible effect*. Yoast meta IS writable. |
| **Market homes** `/ae/ /om/ /qa/ /pk/` **+ every other block-built page** (philosophy, franchise, games, menu, contact…) | `post_content` = **Gutenberg/ACF blocks** | 🔴 **DO NOT write the body — a raw write CLOBBERS the live page** (this caused the `/ae/` incident). Yoast meta only. |

**✅ Definitive rule — Nest may write the BODY to ONLY:** (a) **journal posts**, and (b) pages whose template is **"Bonbird Location"** or **"Bonbird Product"** (`_wp_page_template` = `template-location.php`/`template-product.php`). **Everything else = never write the body** — it's either static Twig (silent no-op) or block markup (destructive clobber). **Yoast meta (title/description) is safe to write on any page.** When unsure, check the page's `_wp_page_template`; only the two Bonbird templates are body-safe.

**Journal-post market attribution (REST):** the taxonomy's `rest_base` is **`markets`** (PLURAL) — `/wp/v2/markets`; `/wp/v2/market` 404s. On a post, set the **`markets`** field to an **array of TERM IDs**: `ae=42, om=43, qa=44, pk=45` (slugs are ae/om/qa/pk but REST assigns by id). Setting `markets` is the **only** thing needed — it drives both attribution AND the `/{market}/journal/{slug}/` URL (permalink filter). Posts are flat — no parent/path to set. ⚠️ Using `market` (singular) is silently ignored.

**The 13 legacy static pages** (UAE only): products `/ae/chicken/`, `/ae/wraps/`, `/ae/chicken-burger/`, `/ae/chicken-tenders/`; locations `/ae/dubai/` (+ `/city-walk/`, `/mirdif/`, `/motor-city/`), `/ae/sharjah/` (+ `/aljada/`), `/ae/abu-dhabi/` (+ `/khalifa-city/`). These render from `views/page-{slug}.twig`, so their **body copy is dev-edit-only** until they're migrated to the data-driven templates. Nest can still optimise their **Yoast title/meta description**.

**Phase-2 data-driven pages** (the scalable system): a page assigned the **Bonbird Location** or **Bonbird Product** template is a **hybrid**:
- **ACF fields = human/data** (hero images, venue NAP/hours/phone/map, product cards). Nest cannot set these (no ACF write, no media upload).
- **`post_content` = Nest/content** — write the **intro + SEO prose + an `<h2>FAQs</h2>` block** (`<h3>Question?</h3><p>Answer.</p>` pairs). The template automatically turns that FAQ block into the styled accordion **and** emits FAQPage JSON-LD. Title + Yoast meta also writable.
- **12 product scaffolds already exist as DRAFTS** for om/qa/pk (`chicken`, `wraps`, `chicken-burger`, `chicken-tenders`) — parent + template + slug set, empty bodies **ready for Nest to write** (post IDs 47005–47016). Filling one = write its `post_content` body (prose + FAQ), a human adds images, then publish.

**City-hub creation (`page_type`) — REST contract (live + verified 2026-08-20):** the Location template's `page_type` (`venue` | `city_hub`) is now REST-writable so Nest can create a city hub without a human clicking the ACF dropdown. Set it as **post meta** on create/update — NOT via `acf`:
```
POST /wp/v2/pages  { "template":"template-location.php", "parent":<market-home id>, "status":"draft", "meta":{ "page_type":"city_hub" } }
```
- Meta key `page_type`; values `venue` / `city_hub` (anything else sanitises to `venue`). `venue` is the default, so omit it for a normal venue page.
- Sending `{"acf":{...}}` silently no-ops — the Location field group stays `show_in_rest:0` on purpose, so **NAP/address/hours/phone/map remain un-writable via REST** (anti-fake-NAP guardrail). Only `page_type` is exposed.
- Auth = `edit_post` cap (App Password inherits it — same gate as the Yoast meta writes). A theme hook keeps ACF's `_page_type` reference in sync so the template's `get_fields()` sees a REST-set value. *(Impl: `inc/_nest-integration.php`.)*
- Still human: a city hub renders its **child `venue` pages** as cards, so a person must create + fill those child venues' ACF NAP. `page_type` is the only part this contract automates.
- ⚠️ After a fresh deploy, a WPE "Clear all caches" may be needed before the first REST write takes (PHP-FPM opcache).

## 5. Nest's WP capability (recap) & how to author for these pages
- **CAN**: create/update `post_content` (HTML body), `title`, `excerpt`, and SEO-plugin meta (Yoast) — by URL/slug or postId, via Application Password (`netlify/functions/wordpress.js`).
- **CANNOT**: write ACF fields, upload media/images.
- Generation today = one HTML body blob → fits `post_content` directly. For a data-driven location/product page, author the body as **intro prose → SEO sections → `<h2>FAQs</h2>` + Q/A pairs**, and the template handles accordion + schema. Don't try to write hero images or NAP — those are ACF (human).

## 6. Where Nest should focus (SEO opportunity)
- **City / area hub pages** (e.g. "Fried Chicken in Sharjah", "Best Chicken Burger Doha") — content-driven, **NOT tied to a physical store** — are the surface Nest should **generate** to rank per market. This "city-hub tier" **does not exist yet** and is the clearest Nest-owned win.
- **Venue pages are tied to REAL stores.** Nest must **never invent a venue** (fake NAP = Google penalty). Nest's role for a venue = write its copy once a real store exists + a human has entered the NAP.
- **⚠️ Anti-doorway / thin-content bar (hard rule):** mass-generated location/city pages that are near-duplicate "city-name mad-libs" get deindexed as a cluster. Every page must be **genuinely differentiated per market** — real neighbourhood context, distinct local keywords, distinct FAQ. Done well = a local-SEO moat; done lazily = the exact "lazy agency copy-paste" this rebuild removed.

## 7. Data-vs-content ownership (the core principle)
| | Owner |
|---|---|
| Structured **data** — venue NAP/hours/map, hero images, product cards | **Human / GBP** (ACF) |
| **Content** — intro, SEO prose, FAQ, title, meta description | **Nest** (post_content + Yoast meta) |

## 8. Gotchas
- **Don't test on `bonbirddev`** — it's noindexed, so PageSpeed/behaviour checks error or mislead. Use `bonbirdchicken.com`.
- **No copy-env dev→prod post-launch** — it overwrites the live DB (wipes form leads / content added since launch). Content changes go directly to prod.
- Deep-links + Order/Menu CTAs are **market-aware**; reuse `/{market}/…` — don't hardcode `/ae/`.
- Attachment `guid`s still contain `localhost:8890` (not domain-rewritten) — never use a guid for a URL; the rendered URLs are correct.

## 9. Deferred (not yet wired — future Nest builds)
1. **Nest's keyword→content pipeline for location/product pages** — the WP side (templates + ACF + FAQ transform) is done and Nest CAN write their bodies by URL; wiring the generation for these page types is a future build.
2. **City-hubs — DECISION (2026-08-20): new-cities-only.**
   - **om/qa/pk:** hubs proceed now — slugs are free; create via the `page_type` meta contract (§4).
   - **UAE:** the 3 legacy city pages (`/ae/dubai/`, `/ae/sharjah/`, `/ae/abu-dhabi/` + their venue children) stay **human-owned / static**. **No migration for now** (no dev capacity). Nest **must not** write their bodies (already 409-blocked) and **must not** flip their template (empty `post_content` → near-blank page). Nest may optimise their **Yoast meta ONLY where data shows a genuine improvement** (weak/missing/truncated tag, or CTR/ranking evidence) — never cosmetic churn.
   - Migrating those 3 onto the Location template — which is what would unlock Nest editing their **bodies** — is **parked; revisit later.** (Shazin is open to data-driven body improvements in principle; the migration is the enabler, just not resourced yet.)
3. **Newsletter + contact-form signups → Yolk pipeline (Como) — BUILT + LIVE (2026-08-27).** Bonbird website forms now POST to WordPress and forward **server-side** to `integrations.yolkbrands.com/api/signup` (→ Como), replacing direct-to-Mailchimp (retired). Newsletter (home + Philosophy) → `source: newsletter`; contact form → `source: contact_form`, **only when a marketing opt-in checkbox is ticked** (unticked default; consent recorded on the `bonbird_entry`). Handler = Bonbird theme `inc/_yolk-signup.php`; needs 5 `YOLK_*` constants in `wp-config.php` (secrets from Adam; same across Yolk sites, only `YOLK_SIGNUP_BRAND` differs). **This is a Bonbird WEBSITE feature, not a Nest feature** — noted here only so the Nest never assumes Mailchimp. Portable Pickl port at `~/Documents/pickl-signup-package/`. Full detail: bonbird repo `PROJECT-STATUS.md` (2026-08-27).

_Full build history + the WP-side detail lives in the `bonbird-website-rebuild` repo (`PROJECT-STATUS.md`, `tools/`). This brief is the Nest-facing summary._
