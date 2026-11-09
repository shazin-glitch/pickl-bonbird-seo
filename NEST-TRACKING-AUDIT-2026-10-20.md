# Nest tracking audit: go/no-go before the DataForSEO top-up (20 Oct 2026)

Read-only audit of every DataForSEO call, the rank tracker and reporting, and every scheduled job. Nothing was changed. Detailed reports (session scratchpad): `audit-dataforseo.md`, `audit-tracking.md`, `audit-crons.md`.

## Verdict: don't top up yet

Topped up as-is, the money starts spending at 04:00 UTC next Monday on jobs that mostly produce no usable data (about $20 to 25 a month), while the thing you want, seeing whether your work moves rankings, still wouldn't work. Fix first, then a $50 top-up lasts about 5 months.

## Why you can't track your SEO today (verified)

| # | Problem | Evidence |
| --- | --- | --- |
| 1 | **Search Console data fails every other Monday, silently.** The weekly run on 19 Oct pulled 0 rows for every brand and logged no error. The OAuth app was set to Internal on 5 Oct and Google was reconnected on the evening of 19 Oct, so it should now hold; the first real proof is **Mon 2 Nov**. | `scheduler:lastrun`: `gscRows: 0` for pickl, bonbird, southpour; `errors: []` |
| 2 | **The rank tracker never measured weekly rankings.** It reads a 90-day average position from only the top 1,000 Search Console rows for the whole site, with no country filter. Anything without impressions is always blank. Pickl UAE: 0 of 25 tracked keywords have a position. | `_lib/store.js` `rowLimit: 1000`; rank history mostly null |
| 3 | **The tracked keywords are junk.** Auto-seeded once in July and August and never curated (e.g. Bonbird Pakistan tracks "restaurants in alaska"). None of the 51 Pickl page keywords are tracked. | `trackedKeywords:*` |
| 4 | **No city-level tracking exists.** Search Console has no city dimension, and the only real search-results job covered one location per market. | |
| 5 | **The paid search-results jobs pay for data and then don't collect it.** They wait 8 to 10 minutes; DataForSEO finished 10 to 17 minutes after posting. On 12 Oct the Pickl UAE competitor matrix saved 3 of 55 rows. The international matrix can't finish inside one run and has **never** produced data for Qatar or Oman. | `competitorMatrix:pickl` has 3 rows; DataForSEO task history |
| 6 | **Every UAE search result before today used Venezuela's location code.** Fixed in v7.9.131; the first correct run is 26 Oct. All UAE rank, share-of-voice and AI-Overview history before then is invalid. | |
| 7 | **"Non-branded" is about half misspelled brand searches.** Pickl: pickel, pikl, pikle, picl, pick menu. Bonbird: bonebird, bone bird, bornbird (about 70%). The "Bonbird non-branded +36%" headline is mostly these. | Search Console query data |
| 8 | **Failed runs overwrite good data with junk.** Keyword opportunities, competitor ranked keywords, AI Overview and citations were wiped by the 19 Oct 402 errors. Bonbird's Performance summary now says it "has no measurable organic search presence". | Blobs |

## What DataForSEO can and can't do (settles the Qatar/Oman question)

- **Rankings (search results) and Google Ads volumes:** every market and every city, including Qatar, Oman, Kuwait and Iraq. City codes exist for Dubai, Abu Dhabi, Sharjah, Riyadh, Cairo, Doha, Muscat, Manama, Amman, Kuwait City, Baghdad, Lahore and Karachi.
- **Labs (keyword ideas, competitors' keywords, difficulty):** not Qatar, Oman, Kuwait or Iraq. Google Ads keyword endpoints fill that gap.

## The fix: one focused build, then top up

Built around the goal: **weekly rankings per city for the keywords our pages target, and a monthly report you trust.**

1. **Stop the waste (before any money goes in).**
   - Pause keyword discovery (make it monthly and on-demand), citations, AI Overview and LLM mentions in the weekly dispatcher.
   - Take Southpour out of paid jobs.
   - Add a free balance check before any paid job runs, with a Slack alert.
2. **Never overwrite good data.** Keep the last good result and record the error, for every job. Alert when Search Console returns 0 rows.
3. **Real rank tracking.**
   - **Keywords:** import the target keywords from the page files (primary and secondary per page, tied to the page and its city), and save a "before" baseline at import.
   - **Weekly rankings:** check each keyword in its city through DataForSEO search results (standard queue, depth 30). Post the checks in one run and collect the results in the next, so nothing is paid for and lost.
   - **About 600 checks a week** (Pickl plus Bonbird) at about $8 to 10 a month.
4. **Fix the branded split.** Catch misspellings with fuzzy matching, make it read the brand config, and exclude "pick n mix", "pickup" and "pickleball". Then rebuild the monthly trend.
5. **One report per market:** non-branded clicks and impressions (corrected), tracked keyword positions by city with change versus last week and versus baseline, and pages that moved.

Then: top up $50, and the 26 Oct run gives the first correct UAE baseline.

## Decisions for Shazin

1. Approve this build (it fixes the SEO tool, which is Steve's priority, and removes more than it adds).
2. Southpour: mark it inactive for now? That also hides it in the UI.
3. Branded edge case: should a bare "pick" search count as branded? (Default: yes in KSA, where "pick الرياض" is clearly Pickl.)

## Check on Monday 2 Nov (read-only)

`scheduler:lastrun` shows `gscRows` above 0 for Pickl and Bonbird, and gscSnapshot keys exist for 2026-11-02. If not, the Google login still expires and needs another look.
