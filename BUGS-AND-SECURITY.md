# The Nest — Bug & Security Register
> Audit 9–10 Jul 2026 (Fable). 3 parallel audit agents (auth/access · backend correctness · frontend/XSS) + **manual verification of every finding below against the actual code**. Severity is by *exploitability*, not theoretical class: XSS from user/external data outranks XSS that needs a Claude/config compromise.
> Legend: ✅ verified by me (file:line read) · ⚠️ reported, NOT yet verified · 🔧 fix known.
> Scope gap: the **backend-correctness agent died on a session limit** — that surface (async/await, Blobs races, DataForSEO batching, date/tz) is only PARTIALLY covered here. Re-run before trusting it clean.

---

## TIER 0 — Fix before anything else (unauthenticated / external exposure)

### S1. `slack-callback.js` — no Slack signature verification ✅ CRITICAL
Zero `SLACK_SIGNING_SECRET` / `x-slack-signature` references anywhere in the repo (grep = 0 hits). The endpoint is public by necessity but verifies nothing. **A single forged HTTP POST can approve/dismiss any approval item and trigger a live calendar publish** (it calls `/api/calendar` internally). This is the highest-risk finding — state change + external publish, reachable by anyone.
🔧 Verify `X-Slack-Signature` + `X-Slack-Request-Timestamp` HMAC-SHA256 against the signing secret; reject stale timestamps (>5 min); reject before any state change.

### S2. `approvals.js` — GET is unauthenticated ✅ CRITICAL
`if (event.httpMethod === 'GET')` at **line 183**; `authorize()` not called until **line 206** (POST-only path). Anyone on the internet can read the entire content pipeline — pending items, payloads, target keywords, audit log — across all brands. Same class as the keyword-opportunities leak fixed in v7.4.67.
🔧 Move `authorize()` above the GET branch (gate all methods except OPTIONS). **Then** add `internalHeaders()` to the internal caller — see B-note below.

### S3. `calendar.js` — GET is unauthenticated ✅ CRITICAL
GET branch at **line 87**; `authorize()` at **line 149**. Unauthenticated read of the whole social calendar — captions, media URLs, approver emails, all brands/markets.
🔧 Gate before the GET branch.

> ⚠️ Likely more of these. The keyword-opportunities GET leak (fixed v7.4.67) + these two are the same mistake three times. **Do a definitive GET-before-authorize sweep of all 59 functions** — the auth agent found these three by reading, not exhaustively. (One earlier probe showed 9 other read endpoints correctly 401, so it's not universal — but confirm every one.)

---

## TIER 1 — Authorization gap (authenticated, but no role/brand enforcement) ✅ HIGH

### S4. Publish-class mutations enforce authentication but not authorization
Verified: role/brand scope is enforced in only **4 files** (`business-priority.js:38`, `generate-draft.js:30`, `perch.js`, `user-management.js:48`). Everywhere else it's authn-only. Concretely:
- `approvals.js` `approve`/`publish`/`republish` (→ live WordPress) — any authenticated user incl. **Viewer** can publish, and **any brand's** items (no brand-scope check). ✅ (auth at 206, no role/brand check in handleApprove).
- `calendar.js` `approve`/`push_socialpilot`/`mark_published` — any Viewer can push posts live to SocialPilot for any brand. ✅
- `wordpress.js` `create_draft`/`publish`/`update_content`/`update_meta` — authn-only; Pickl-scoped user can publish to Bonbird. ✅
- `markets`/`brands` scoping in the user profile is **UI-only** — the frontend hides buttons, the server doesn't enforce (confirmed: several Perch/calendar optimistic mutations don't even check `res.ok`, so a server 403 wouldn't surface anyway).
🔧 Add a shared `requireRole(auth, [...])` + brand/market-scope helper to `_lib/auth.js`; apply to every session-path mutation (internal calls exempt). This is partly a product call (is Viewer-can-publish acceptable?) but the presence of `role`/`brands`/`markets` in the profile says the intent is server-side enforcement.

---

## TIER 2 — XSS (stored, reachable via normal app data) ✅ HIGH

**Root cause (systemic, one fix pattern):** `esc()` (index.html:4256) escapes `& < > " '` → but it turns `'` into `&#39;`, which the browser **HTML-decodes back to `'` before parsing an inline `onclick`**. So `esc()` alone is insufficient inside `onclick="fn('${esc(x)}')"` JS-string context. The codebase already knows the right idiom — `esc(x).replace(/'/g,"\\'")` — and uses it in ~10 places; these are the misses. **Surface size (verified): ~25 esc-only onclick JS-string args in index.html** — this is a sweep, not a handful. Two fix patterns: (a) add a shared `escJs(x)=esc(x).replace(/'/g,"\\'")` and apply to all onclick args; (b) better long-term, migrate to `data-*` attributes + delegated `addEventListener`.

### X1. `queueGapKeyword` onclick — apostrophe keyword injection ✅ HIGH (index.html:7379)
`onclick="queueGapKeyword('${esc(r.keyword)}','${esc(d.brand)}',this)"`. Keywords legitimately contain apostrophes (`mcdonald's near me`, `valentine's menu`) → **breaks on real data today**, and a crafted keyword (`');alert(1);//`) executes JS. Keywords flow from seed lists (user-entered) + DataForSEO.

### X2. Unescaped `<img src>` in calendar list + present strip ✅ HIGH (index.html:9834 `thumbSrc`, 11668 `stripSrc`)
`<img src="${thumbSrc}">` / `<img src="${stripSrc}">` with no `esc()`, from `p.imageUrl` / `mediaFiles[].url` (user-pasted URL fields). A post with `imageUrl` = `x" onerror="…` runs attacker JS for everyone viewing the calendar. Every *other* `<img>` in the file escapes its src (10479, 10695, 11620) — these two are the misses. Stored XSS by any authenticated user who creates a post.

### X3. `insertCalMention` onclick — display-name injection ✅ HIGH (index.html:11121)
`insertCalMention('${esc(u.name||u.email)}')` — esc-only. A user named `O'Brien` breaks the handler; a crafted display name injects. User names are user-controlled at invite time.

### X4. `removeSeedKeyword` onclick — seed-keyword injection ✅ MED-HIGH (index.html:8679)
`removeSeedKeyword('${esc(kw)}')` — esc-only, free-text user-added keyword.

### X5. `competitor-matrix-ui.js` queue-tip keyword ⚠️ MED (js/competitor-matrix-ui.js:~919)
Keyword interpolated raw (no esc) into the tooltip `innerHTML`. Reported, structure plausible; verify the exact line.

---

## TIER 3 — XSS (needs external-data or model compromise — defense-in-depth) ✅ MEDIUM

- **X6. robots.txt snippet raw into `<pre>`** ✅ (index.html:7831) — `${tc.robotsTxt.snippet}` unescaped. Source = the audited site's live robots.txt (attacker-controllable if you ever audit an external/competitor domain). 🔧 `esc()`.
- **X7. Performance-summary narrative raw into innerHTML** ✅ (index.html:6330) — `perfSummary.narrative` (Claude output, stored) `.map(p => <p>${p}</p>)` unescaped. Needs Claude to emit HTML or a poisoned store. 🔧 `esc()` each paragraph.
- **X8. User profile picture URL** ✅ (index.html:2481) — `<img src="${currentUser.picture}">` from the OAuth provider, unvalidated (`javascript:`/`data:` not blocked). 🔧 validate `https:` scheme.
- **X9. Technical-SEO PSI/audit fields** ✅ (index.html:7707 `r.error`, 7777–7811 `r.url`/`r.label`/Lighthouse `o.title`/`o.description`, 7880, 8480 error JSON) — external API/error strings into innerHTML unescaped. Mostly Google-controlled; low practical risk, real class. 🔧 `esc()`.
- **X10. Perch label color into `style`** ⚠️ (index.html:5389) — `background:${l.c}` unescaped; XSS-via-attribute only if a persisted label color can be non-preset. Verify whether `task.labels[].c` is ever non-preset before rating.

**Killed as false positives (verified):** all `showToast(...)` "XSS" items — `showToast` uses `textContent` (index.html:4684), not innerHTML. Any report citing showToast as an XSS sink is wrong.

---

## TIER 4 — Functional bugs (crash / stuck / wrong data) — verified sample

### B1. Star-rating `RangeError` blanks the review queue ✅ HIGH (index.html:7194)
`'★'.repeat(r.rating || 5) + '☆'.repeat(5 - (r.rating || 5))`. A GBP rating of `6` (or negative/NaN) → `.repeat(-1)` throws `RangeError`, and there's no per-row guard, so **one bad review blanks the whole Local SEO review render**. 🔧 clamp: `const st = Math.max(0, Math.min(5, Math.round(r.rating||0)))`.

### B2. `competitor-matrix-ui.js` — `esc()` called outside its IIFE scope ❌ FALSE POSITIVE (corrected 11 Jul)
The agent (and my first note) claimed a `ReferenceError` crash because `esc` is IIFE-local (defined at line 211, IIFE closes 1551) while `cmDiscoverCompetitors` (line 1561) is outside it. **On re-verification this is NOT a crash:** `index.html`'s main `<script>` is bare (not an IIFE), so its `esc`/`escJs` are **global**; the out-of-IIFE function falls back to the global `esc` at runtime. No crash. The *real* (lower-severity) issue there was the same onclick class — `esc(c.domain)` in the `cmAddDiscoveredCompetitor` onclick (line 1597), external DataForSEO data. ✅ FIXED v7.4.69 → `escJs(c.domain)` (global). Lesson logged: verify the global fallback before calling an out-of-scope reference a "crash".

### B3. `renderCalDetailPanel(res.post)` crash on postless 200 ⚠️ MED (index.html:~11703 + siblings)
Several callers assign/pass `res.post` without a guard; `renderCalDetailPanel` dereferences `post.createdBy` immediately → throws, blanks the panel. Some callers guard (`if (res.post)`), 11703 (presentApprove) does not. 🔧 guard `res.post`.

### B4. Backlinks tab crash on missing field ⚠️ MED (index.html:~6869)
`d.backlinks.toLocaleString()` with no null guard inside `renderBacklinks` (no try/catch around the body) → a topDomain missing `backlinks` blanks the tab. 🔧 `(d.backlinks||0)`.

### B5. Reports `avgPos` = NaN on null GSC position ⚠️ MED (index.html:~6064)
`rows.reduce((s,r)=>s+r.position,0)` — a single null `position` poisons the average to `NaN`. 🔧 filter/coalesce. Also: `renderReports` has no try/catch — any throw blanks the whole Reports tab.

### B6. Poll timers never cleared on tab/brand switch ⚠️ MED (multiple: index.html ~6664, 9319, 12217; techSeoState/backlinks poll timers)
`setInterval` poll loops (keyword discovery, LLM, tech-SEO, backlinks) aren't cleared when the user navigates away or switches brand mid-poll → wasted API calls and **stale-brand data rendered into the new brand's panels** (poll closure captures old brand, writes shared DOM ids). 🔧 store handles, clear on view/brand switch.

### B7. Optimistic Perch mutations ignore `res.ok` ⚠️ MED (index.html:5453, 5671, 5681, 5706)
Drop/save/comment/move PATCH-POSTs don't check `res.ok`; a server 403/500 isn't surfaced — UI shows success, server rejected (and `perchTasks[idx]=data.task` can set `undefined` → later crash). Compounds S4 (role rejection would be invisible). 🔧 check `res.ok`, revert on failure.

### B8. CSV export — quote/formula injection ⚠️ LOW (js/competitor-matrix-ui.js:1275)
Keyword with `"` breaks CSV quoting; leading `=`/`+`/`-`/`@` = Excel formula injection. 🔧 escape `"`→`""`, prefix formula chars. (Also blob URL never `revokeObjectURL`'d — minor leak.)

---

## TIER 5 — Auth hardening (lower urgency) ✅/⚠️

- **A1. OAuth `state` is a static string** ✅ (`auth-login.js:28` `'login'/'gbp'/'ga4'`, consumed as a flow selector in `auth-callback.js:23,35`) — no per-request CSRF nonce. MED. 🔧 random nonce stored + verified; keep flow-type as a separate field.
- **A2. `authorizeJob` scheduled-invoke heuristic is forgeable** ✅ (`_lib/auth.js:80-84`) — returns true for any event with no `httpMethod`, and matches `"next_run"` anywhere in the body. All `-background` jobs (Claude + DataForSEO spend) rely on it. MED. 🔧 require `x-nest-internal` for cron invokes (migration note already says this); drop the body heuristic.
- **A3. `CORS: '*'` on credentialed/mutating endpoints** ✅ (e.g. `user-management.js:38-40` advertises `Allow-Headers: Cookie` with `*`). Mitigated by `SameSite=Lax` cookies, but wrong for authed APIs. LOW. 🔧 echo a fixed allowed origin.
- **B-note. `international-seo-background.js:1535`** ✅ — internal fetch to `approvals?status=pending` **without `internalHeaders()`**. Harmless today (approvals GET is ungated) but the moment S2 is fixed this 401s → empty items → duplicate drafts. Fix S2 and this together.

---

## Already fixed (do not re-report)
- ✅ **Tier 0 (v7.4.68, committed, NOT yet pushed — pending `SLACK_SIGNING_SECRET`):** S1 slack-callback signature verification; S2 approvals GET gated; S3 calendar GET gated; intl-seo:1535 internalHeaders.
- ✅ **Tier 2/4 batch 2 (v7.4.69, committed):** added correct global `escJs()` (JS-escape THEN html-escape; the old `esc(x).replace(/'/g,…)` idiom was a no-op → those 11 sites were ALSO XSS, now converted); converted 6 named free-text onclick sinks (X1 queueGapKeyword, X3 insertCalMention, X4 removeSeedKeyword, + showEditBrandsModal/removeUser/loadAuditFromHistory) to escJs; X2 `<img src>` escaped (thumbSrc 9845, stripSrc 11679); B1 star-rating clamp; B2 competitor-domain onclick → escJs. Verified: escJs neutralises `');alert(1)//` end-to-end; star clamp handles 6/-1/null.
- ✅ `keyword-opportunities.js` GET auth leak — gated (v7.4.67, live-verified 401).
- ✅ Draft-vs-live tracking mislabel + backend eligibility + position rounding (v7.4.66).

## Still open after batch 2 (for later phases)
- **S4 authorization layer** (Viewer-can-publish, cross-brand) — the big one; pairs with P2 onboarding.
- **Remaining onclick sweep:** ~15 esc-only onclick args carrying fixed-set values (brand/market/ids) — low risk, convert for consistency. Plus `competitor-matrix-ui.js` IIFE-local `esc` doesn't escape quotes at all (its own onclicks); and its queue-tip keyword (X5) needs esc.
- **Tier 3 XSS** (robots.txt 7831, perf-summary narrative, profile pic) — `esc()` sweep.
- **Tier 4 remainder** (B3 renderCalDetailPanel guard, B4 backlinks toLocaleString, B5 Reports NaN/try-catch, B6 poll-timer clear on brand switch, B7 Perch res.ok).
- **Tier 5 hardening** (A1 OAuth state nonce, A2 authorizeJob heuristic, A3 CORS).
- **⚠️ Backend-correctness audit still owed** (agent died) — re-run before P1.

## False positives killed during verification
- showToast XSS (uses textContent). · "rank-tracker seeds UAE-only" (earlier planning agent — `oppKey` handles `:brand:market`). · Most `brand`/`market`/`route` onclick interpolations (fixed-set `<select>` values — flag for consistency, not live exploits).

---

## Recommended fix order (for the build phase)
1. **Tier 0** (S1 slack sig, S2/S3 GET gating) — one small PR, unauthenticated exposure. Add the definitive GET-before-authorize sweep here.
2. **X1–X4** (stored XSS on real data) + the shared `escJs()` helper — one PR; grep every `onclick="...('${` for the missing `\\'`.
3. **B1, B2** (crash-a-tab bugs on live data) — cheap, high user impact.
4. **S4** (authorization layer) — bigger; design `requireRole` + brand-scope once, apply broadly. Pairs naturally with **P2 (onboarding/config)** in PLAN-FOR-OPUS since both touch the auth/identity layer.
5. Tier 3 XSS (`esc()` sweep), Tier 4 remainder, Tier 5 hardening — fold into the relevant build phases.
6. **Re-run the backend-correctness audit** (agent died) before the P1 pipeline unification — that refactor touches exactly the async/Blobs/DataForSEO code that pass didn't finish.
