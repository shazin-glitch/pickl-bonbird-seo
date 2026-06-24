// netlify/functions/seed-roadmap-tasks.js
// ONE-TIME seeder: writes the current SEO/platform roadmap into Perch as `todo`
// tasks so the CEO sees the backlog. Idempotent (skips titles that already
// exist) and self-disabling (sets `perchRoadmapSeeded`; won't re-run without
// ?force=true). Safe to delete after the tasks exist in Perch.
//
// Trigger: GET /.netlify/functions/seed-roadmap-tasks   (?force=true to re-run)

const { newId, getSetting, setSetting, logAudit, ok, bad, preflight } = require('./_lib/store');

// Roadmap backlog. status tags in the title so the CEO sees state at a glance.
const TASKS = [
  // ── Strategic / P1 ──────────────────────────────────────────────────────
  { p: 'high',   t: '[Dev] Fix international URL structure (nesting + journal CPT + hreflang)',
    d: 'Inner market pages nest under their hub (/oman/menu not /oman-menu); journals become a REST-exposed custom post type at /{market}/journal/{slug}; location CPT exposed in REST; 301s via RankMath (Pickl) / Redirection plugin (Bonbird, free Yoast). Full developer brief prepared. PREREQUISITE for the Nest to publish/populate international pages cleanly.' },
  { p: 'high',   t: '[Urgent] Migrate to custom domain thenest.yolkbrands.com',
    d: 'yolkseo.netlify.app (and all *.netlify.app) is ISP-blocked in Egypt — Steve currently needs a VPN to access. Custom domain bypasses it. Update GCS CORS, Google OAuth URIs, Slack callbacks, Netlify config (checklist in SETUP.md).' },
  { p: 'high',   t: 'hreflang implementation (EN/AR across 9 markets)',
    d: 'Highest-leverage international SEO lever for a bilingual, multi-market, blog-heavy site: language/region annotations (en-AE, en-SA, ar-SA, …) + x-default so variants do not cannibalise and Google serves the right market/language.' },
  { p: 'medium', t: 'Reports: add per-market awareness (currently UAE-only)',
    d: 'The board-facing weekly report only covers UAE; international performance is invisible. Add a market dimension/selector.' },
  { p: 'medium', t: 'Auth hardening follow-ups',
    d: 'Slack signature verification (slack-callback is forgeable), OAuth CSRF state nonce, finer role tiers (viewer-cannot-publish), reviews.js mutation gating.' },

  // ── CEO-requested ───────────────────────────────────────────────────────
  { p: 'high',   t: '[Needs scoping] Automated monthly SEO report per website + market',
    d: 'CEO request. Decide contents (rankings, GSC clicks/impressions/CTR, opportunities actioned, content published, competitor SoV, technical/speed, backlinks, GBP), per-market scope, delivery (emailed PDF / in-app / Slack), cadence. Trend snapshots now being banked (v7.4.16) so it launches with history.' },
  { p: 'medium', t: 'Onboard Southpour to all functionality',
    d: 'Full brand onboarding: WP creds, brand context, seeds, competitors, GSC/GA4 property, GBP, calendar. Note: coffee brand — keyword/competitor logic must adapt from the burger/chicken assumptions.' },
  { p: 'medium', t: 'Connect Yolk website to the SEO pipeline',
    d: 'Yolk is already a calendar brand but the SEO pipeline is not connected. Corporate site (not a restaurant) — competitor/menu logic differs.' },
  { p: 'medium', t: 'Google reviews: location-health report (what is missing per location)',
    d: 'CEO request. Quickest standalone win — GBP health flags (no hours/description/phone, low rating, unanswered, photo count) are already computed; surface them as a consolidated per-location report + export.' },
  { p: 'medium', t: '[Needs discussion] Google reviews: monthly PDF report per location',
    d: 'CEO request. Per-location monthly: rating trend, review volume, response rate, unanswered, health changes. Monthly GBP snapshots now accruing (v7.4.16) so a trend will exist. Agree metrics + format first.' },
  { p: 'medium', t: 'Monthly speed-test report',
    d: 'CEO request. PageSpeed cron already runs; speed snapshots now banked weekly (v7.4.16). Build the monthly packaging + delivery per site/market.' },
  { p: 'high',   t: 'Layers of access & permissions (granular RBAC)',
    d: 'CEO request. Role × brand × market × action (view/edit/approve/publish). userProfile already carries brand/market/department fields — build the enforcement + management UI.' },

  // ── Shazin additions ────────────────────────────────────────────────────
  { p: 'high',   t: 'Build out Local SEO tab — performance insights',
    d: 'Use the already-enabled Google APIs: Business Profile Performance (views Search vs Maps, how customers find you, calls/directions/website clicks over time), Q&A, Posts. Currently the Local SEO tab only shows ratings/reviews/photos/health.' },
  { p: 'medium', t: 'Tie everything into Perch (cross-module task creation)',
    d: 'Perch exists and notifies, but no other module feeds it. Build a shared "create Perch task" hook so SEO opportunities, GBP health issues, speed regressions and rejected approvals spawn tracked tasks automatically.' },
  { p: 'medium', t: 'Location-page populator: finish in-place update + Local SEO button',
    d: 'Generator engine built (v7.4.14): GBP data → unique location page + schema → approval queue. BLOCKED on the dev exposing the location CPT in REST so the Nest can update existing empty pages in place (not create duplicates). Then add a "Generate location pages" button.' },

  // ── P2 / later ──────────────────────────────────────────────────────────
  { p: 'low',    t: 'International CPC / currency traffic-value',
    d: 'CPC enrichment is UAE-only; intl markets carry currency configs that are never used for valuation.' },
  { p: 'low',    t: 'Arabic GSC-driven optimization',
    d: 'Arabic content is seed-only; the GSC-driven optimization jobs run for English only. No performance feedback loop for Arabic.' },
  { p: 'low',    t: 'Curated per-market competitor seed lists',
    d: 'Reduce reliance on SERP auto-detection by seeding known competitors per international market.' },
  { p: 'low',    t: 'Deep-audit → prioritised action plan',
    d: 'After an audit, produce a ranked action list by impact vs effort; high-touch → Perch task, low-touch → content queue.' },
];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  const force = (event.queryStringParameters || {}).force === 'true';

  const seeded = await getSetting('perchRoadmapSeeded').catch(() => null);
  if (seeded && !force) {
    return ok({ alreadySeeded: true, seededAt: seeded, note: 'Roadmap already seeded into Perch. Re-run with ?force=true to top up missing tasks.' });
  }

  const index = (await getSetting('perchIndex').catch(() => [])) || [];
  // Existing titles (for idempotency) — load current tasks.
  const existingTitles = new Set();
  for (const id of index) {
    const t = await getSetting('perchTask:' + id).catch(() => null);
    if (t?.title) existingTitles.add(t.title.trim());
  }

  const now = Date.now();
  const created = [];
  let newIndex = [...index];

  for (const task of TASKS) {
    if (existingTitles.has(task.t.trim())) continue;
    const id = newId('task');
    const obj = {
      id,
      title:         task.t.trim(),
      description:   task.d,
      brand:         'all',
      department:    'seo',
      assignee:      null,
      collaborators: [],
      dueDate:       null,
      priority:      task.p,
      status:        'todo',
      createdBy:     'claude (roadmap)',
      createdAt:     now,
      updatedAt:     now,
      source:        'roadmap_seed',
      sourceId:      null,
      comments:      [],
      auditLog:      [{ action: 'created', actor: 'claude (roadmap)', actorName: 'The Nest Roadmap', timestamp: now }],
    };
    await setSetting('perchTask:' + id, obj);
    newIndex.push(id);
    created.push(task.t);
  }

  if (created.length) {
    await setSetting('perchIndex', newIndex);
    await logAudit({ action: 'perch_roadmap_seeded', actor: 'claude (roadmap)', details: { count: created.length } });
  }
  await setSetting('perchRoadmapSeeded', new Date().toISOString());

  return ok({ ok: true, created: created.length, skipped: TASKS.length - created.length, titles: created });
};
