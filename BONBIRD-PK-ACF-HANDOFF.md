# Bonbird Pakistan — ACF finishing checklist (4 Nest drafts)

_The Nest wrote the CONTENT (title, SEO prose, FAQ accordion + schema) — verified rendering
correctly against the live `bonbird-timber` theme. What remains is the VISUAL layer (hero
images, product cards, venue NAP), which ACF owns and only a human can add. Once these are
filled, each page looks like the reference (`/ae/chicken/`, `/ae/dubai/`)._

## How to fill ACF (do this for each page)
1. Go to **wp-admin → Pages** on https://bonbirdchicken.com/wp-admin/ (log in as admin).
2. Open the page (edit links below). It's a **draft** — it won't be public until you Publish.
3. Below the title/content editor you'll see the template's ACF fields. Fill them (details per page below).
   - **Hero images / Product card images** come from the **Media Library** — click the field → Select/Upload → pick real Bonbird photos (reuse the ones already used on `/ae/chicken/` etc. — Media Library → search "chicken"/"burger").
   - **Product cards** is a repeater — click **+ Add Row** per product; each row = Image, Name, Description, Menu link.
   - **Menu link** = the market menu deep-link: `/pk/menu/#ssm-category-<ID>` (IDs below).
4. **Preview** (top-right) to check it looks right, then **Publish**.
5. Do NOT edit the main content/body area — the Nest owns that; ACF fields only.

**PK menu category IDs** (for the Menu link field — `/pk/menu/#ssm-category-<ID>`):
Bone-In `46781` · Tenders `46782` · Just Chicken `46783` · Burgers `46784` · The Melts `46785` · Wraps `46786` · Sides `46788` · Angry Fries (PK-only) — confirm ID in the PK menu.
*(Pick the real PK menu items/photos — don't invent products or prices.)*

---

## 1. Best Burger in Lahore — #47015 (Bonbird Product template)
Edit: `/wp-admin/post.php?post=47015&action=edit`
- **Hero images** (gallery): 1–3 burger photos.
- **Product cards** (repeater) — one row per burger you sell in PK, e.g.:
  - Classic Chicken Burger · Good Good Chicken Burger · Korean Chicken Burger · Chicken Melt
  - each: Image + Name + 1-line Description + Menu link → `/pk/menu/#ssm-category-46784` (Burgers) or `#ssm-category-46785` (The Melts)
- **Show menu category tiles**: ON (leave default).

## 2. Chicken Tenders in Pakistan — #47016 (Bonbird Product template)
Edit: `/wp-admin/post.php?post=47016&action=edit`
- **Hero images**: 1–3 tenders photos.
- **Product cards**: the tenders offers (e.g. Tenders 3pc / 5pc / combo) → Menu link `/pk/menu/#ssm-category-46782` (Tenders).
- **Show tiles**: ON.

## 3. Chicken Delivery Lahore — #47052 (Bonbird Product template)
Edit: `/wp-admin/post.php?post=47052&action=edit`
- **Hero images**: a hero/bucket/combo photo.
- **Product cards**: your most-ordered / delivery-friendly items (buckets, combos) → Menu link to the relevant categories (Bone-In `46781`, Burgers `46784`, etc.).
- **Show tiles**: ON.
- (Delivery CTAs — the template's Order Now button already points at the market order URL.)

## 4. Bonbird Lahore city hub — #47054 (Bonbird Location template, page_type = city_hub)
Edit: `/wp-admin/post.php?post=47054&action=edit`
This is a CITY HUB — it renders each **child venue page** as a card. So:
- On the hub page itself: **Hero eyebrow** (e.g. "Lahore"), **Hero images** (1–2 Lahore photos), **Show tiles** ON. (Leave Address/Hours/Phone blank on the hub — those live on the child venue pages.)
- **Create 3 child venue pages** (Pages → Add New), one per real Lahore venue:
  - **Cue Cinemas, Gulberg** · **Dolmen Mall, DHA** · **Johar Town**
  - For each child: **Template = Bonbird Location**, **Parent = Bonbird Lahore (#47054)**, **Page type = venue**, then fill **Address, Opening hours, Phone, Map search query** (e.g. "Bonbird Cue Cinemas Gulberg Lahore"), optional Directions link.
  - The hub will then show a venue card per child. (The Nest can write each child's prose/FAQ body later if you want — ask me.)

---
_ACF field reference (from the live theme, `acf-json/`):_
- **Product template**: Hero images (gallery), Product cards (repeater: Image / Name / Description / Menu link), Show menu category tiles (toggle).
- **Location template**: Page type (venue|city_hub), Hero eyebrow, Hero images (gallery), Address, Opening hours, Phone, Map search query, Directions link, Order link override, Show tiles.
