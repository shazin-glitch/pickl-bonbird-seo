# Semrush export, 28 Oct 2026 (trial ended that night)

Everything pulled from Semrush for Bonbird (bonbirdchicken.com) and Pickl (eatpickl.com) before the trial expired. Semrush is no longer available, so this folder is the source of record.

| File / folder | What it is |
|---|---|
| `position-tracking-all-targets.csv` | 545 tracked keywords across 22 targets (Bonbird 7: UAE-Arabic, Dubai, Abu Dhabi, Sharjah, Lahore, Muscat, Doha. Pickl 15: UAE-Arabic, Dubai, Abu Dhabi, Sharjah, Al Ain, RAK, Riyadh, Cairo, Doha, Bahrain, Amman, Muscat, Kuwait, Baghdad). Volume, KD, intent, first + latest position, ranking URL, SERP features. Mobile, map-pack business name set. Baseline = the latest date. |
| `raw/position-tracking.json` | Full raw API response per target (daily visibility trend, every competitor/position field). |
| `site-audit-issues.csv` | Every Site Audit issue with affected URLs. Bonbird 95 pages (health 94), Pickl eatpickl.com 129 pages (82), Pickl eatpickl.com-1 100 pages (83). Crawls dated 26 Oct (Bonbird's predates llms.txt going live). |
| `raw/site-audit.json` | Raw audit: crawl history, issue counts per snapshot, issue rows. |
| `organic/organic-<brand>-<db>.csv` | Every keyword each domain ranks for in Semrush's organic index, per country (position, URL, volume, KD, traffic). Bonbird: ae 296, pk 79, qa 33, om 12. Pickl: ae 195, eg 101, sa 84, qa 74, bh 39, om 13, jo 12, kw/iq none. |
| `competitors/competitors-<brand>-<db>.csv` | Organic competitors by shared keywords per country. |
| `keyword-magic/kmt-<db>-<seed>.csv` | Keyword Magic Tool broad-match lists, sorted by volume, top 200 to 800 rows per seed. 79 lists, 28,664 rows, English + Arabic, product seeds (fried chicken, burger, hot chicken...), city/area/mall seeds for every venue, brand seeds. |
| `opportunities-<brand>.csv` | All KMT keywords relevant to the brand (product or area/restaurant term) with whether we rank (from `organic/`). Noisy. |
| `opportunities-<brand>-clean.csv` | Same, filtered to generic terms only (no rival brands, no other cuisines). Start here. |
| `rivals/rival-<db>-<domain>.csv` | Every keyword the main rival sites rank for: crispychicken-uae, saudibroastuae, texaschicken (AE + QA), kababjeesfriedchicken + kababjees + mrchickenpk (PK), gocrispy (QA), justburgergroup + hammerburgers (AE), regal.sa (SA), buffaloburger + butchersburger (EG), burgerlandbh (BH). |
| `serp/serp-top10-priority-keywords.csv` | Who is on page 1 (positions 1-10, with SERP features) for 52 priority keywords across both brands and all markets. Raw text in the .json. |
| `backlinks/` | Backlink overview text, top 1,200 backlinks, ALL referring domains (Bonbird 2,007, Pickl 2,349) and anchors, per brand. |
| `backlinks/backlink-gap-<brand>.csv` | Backlink Gap: domains linking to rivals but not us (top 500 by Authority Score). Bonbird vs crispychicken-uae, texaschicken, kababjeesfriedchicken. Pickl vs justburgergroup, hammerburgers, buffaloburger. Outreach prospect list. |
| `questions/questions-<db>-<seed>.csv` | Question keywords (what people ask) for chicken, fried chicken, burger, restaurants in AE, PK, SA, EG, EN + AR. Journal topic source. |
| `overviews/` | Domain Overview + AI Visibility overview text per brand. |

Caveats: Semrush volumes for small markets (OM, QA, BH, JO, KW, IQ, PK) are rough. "Not ranking" in the opportunity files means not in Semrush's top-100 organic index, not a live check. Map-pack (Google Business Profile) results are separate from organic.
