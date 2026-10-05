# Bonbird — missing 301 redirects (for the dev)

Checked live on 2026-10-05: every **old URL** below returns **404**, and every **target** returns **200**.

## Why this matters
When the site moved to `/ae/ /om/ /qa/ /pk/` in August, about 136 redirects were added. They cover the old *category-prefixed* blog URLs (`/uae/<slug>/`, `/qatar/<slug>/`…) and the main pages. They don't cover the **root-level** form of the same posts (`/<slug>/`), and Google had indexed that form too.

Traffic impact is small: about 3,000 impressions and 39 clicks over 90 days across all 39 dead URLs, and it's decaying every week as Google moves searches to the new URLs. The real cost is **links**. Any press, partner, or social link pointing at an old URL (e.g. the Lahore launch, the Kuwait debut) now lands on a 404 and passes no authority to the new page. A 301 keeps that authority and finishes the move cleanly.

## 1. Add these 301s (old → new)

| Old URL (404 now) | Redirect to |
|---|---|
| /best-fried-chicken-in-lahore-pakistan-launch/ | /pk/journal/best-fried-chicken-in-lahore-pakistan-launch/ |
| /best-fried-chicken-dubai-abu-dhabi-sharjah/ | /ae/journal/best-fried-chicken-dubai-abu-dhabi-sharjah/ |
| /proper-crispy-juicy-the-best-chicken-tenders-in-dubai/ | /ae/journal/proper-crispy-juicy-the-best-chicken-tenders-in-dubai/ |
| /the-best-fried-chicken-in-motor-city-dubai/ | /ae/journal/the-best-fried-chicken-in-motor-city-dubai/ |
| /best-fried-chicken-al-khoudh-oman-launch/ | /om/journal/best-fried-chicken-al-khoudh-oman-launch/ |
| /best-fried-chicken-in-mirdif/ | /ae/journal/best-fried-chicken-in-mirdif/ |
| /bonbird-to-debut-in-kuwait/ | /ae/journal/bonbird-to-debut-in-kuwait/ |
| /best-fried-chicken-in-oman-muscat-launch/ | /om/journal/best-fried-chicken-in-oman-muscat-launch/ |
| /proper-fried-chicken-doha-bonbird-west-walk/ | /qa/journal/proper-fried-chicken-doha-bonbird-west-walk/ |
| /why-bonbird-serves-the-best-fried-chicken-in-abu-dhabi/ | /ae/journal/why-bonbird-serves-the-best-fried-chicken-in-abu-dhabi/ |
| /chicken-burgers-that-belong-in-every-food-conversation/ | /ae/journal/chicken-burgers-that-belong-in-every-food-conversation/ |
| /bonbird-has-landed-in-dolmen-mall-lahore/ | /pk/journal/bonbird-has-landed-in-dolmen-mall-lahore/ |
| /now-dropping-fried-chicken-in-district-one-doha/ | /qa/journal/now-dropping-fried-chicken-in-district-one-doha/ |
| /bonbird-mega-bon-wraps/ | /ae/journal/bonbird-mega-bon-wraps/ |
| /pickl-and-bonbird-set-to-enter-iraq/ | /ae/journal/pickl-and-bonbird-set-to-enter-iraq/ |
| /the-aussie-secret-why-you-need-chicken-salt-in-dubai/ | /ae/journal/the-aussie-secret-why-you-need-chicken-salt-in-dubai/ |
| /bonbird-chicken-melt/ | /ae/journal/bonbird-chicken-melt/ |
| /messy-bon-bowls/ | /ae/journal/messy-bon-bowls/ |
| /feeling-peckish-grab-a-snackawrap-in-dubai/ | /ae/wraps/ *(matches the existing /uae/ version's redirect)* |
| /menu/wraps/ | /ae/wraps/ |
| /menu/burgers/ | /ae/chicken-burger/ |
| /menu/rice-bowls/ | /ae/menu/ |
| /menu/bone-in/ | /ae/menu/ |
| /menu/drinks/ | /ae/menu/ |
| /never-regular-the-bonbird-rice-bowls/ | /ae/menu/ *(post no longer exists)* |
| /taco-bird/ | /ae/menu/ *(retired product)* |
| /category/uk/ | /ae/journal/ *(12 clicks/90d, no UK market)* |

## 2. Fix these existing redirects (they point to the wrong market)

| Old URL | Currently goes to | Should go to |
|---|---|---|
| /category/pakistan/ | /ae/journal/ | /pk/journal/ |
| /category/oman/ | /ae/journal/ | /om/journal/ |
| /category/qatar/ | /ae/journal/ | /qa/journal/ |

## 3. Leave as 404 (correct behaviour)
These are typos or junk URLs with about 1 impression each. A 404 is the right answer: `/pk/lawhore/`, `/ae/dubai/%7Cae/journal/…`, `/ae/journal/bonbird-to-debut-in-kuwait/()/`, `/ae/dubai/dubai/`, `/ae/dubai/dubaicitycentre/`, `/ae/dubai/mirdif-city-centre/`, `/ae/journal/best-fried-chicken-dubai-above-dubai-sharjah/`, `/ae/journal/the-best-fried-chicken-motor-city-dubai/`, `/uae/`, `/journal/2/`, `/tst/`, `/landing/`.

## 4. Urgent: two pages point their canonical at a URL that redirects back to them
| Page | Canonical now | Should be |
|---|---|---|
| /ae/ | https://bonbirdchicken.com/ (which 301s to /ae/) | https://bonbirdchicken.com/ae/ |
| /ae/chicken/ | https://bonbirdchicken.com/chicken/ (which 301s to /ae/chicken/) | https://bonbirdchicken.com/ae/chicken/ |

Since late September Google has been showing the old root URL instead of /ae/ (in two weeks, /ae/ fell from 144 to 41 clicks while `/` rose from 71 to 144). Fix it in Yoast → Advanced → Canonical URL. If /ae/ is set as the WordPress front page and Yoast ignores the field, add a `wpseo_canonical` filter for the front page. Then request indexing for both pages in Search Console. Every other page checked (city hubs, menu, /pk/, /om/, /qa/) self-canonicalises correctly.

## 5. Separate, urgent: `www.` is broken
Every `https://www.bonbirdchicken.com/...` URL returns a **Cloudflare 526** error page (`http://www` and Pickl's `www` work fine). Google still shows some `www` URLs in results. Fix in Cloudflare: a redirect rule sending `www.bonbirdchicken.com/*` → `https://bonbirdchicken.com/$1` (301), or put a valid origin certificate on `www`.

---
*After deploying, the Nest picks this up on its own. The weekly registry re-checks these URLs, and the State of SEO red banner clears once `www` redirects.*
