// netlify/functions/technical-seo-background.js
// Technical SEO audit — runs on demand + weekly Monday cron.
//
// SCOPE:
//   Full PSI (mobile + desktop): WP-sourced core pages (~8 per brand)
//   HTTP health check: all international market pages (fast, ~30 seconds)
//   PSI escalation: any international page with response >3s or non-200 gets full PSI
//
// RESULTS: stored in Blobs technicalSeo:<brand> — updated after each page so
//          frontend can poll and show partial results while running.
//
// ISSUES: stored in Blobs techTask:<id> + techTaskIndex:<brand>
//         NEVER written to the main Approvals Queue.

const { getSetting, setSetting, newId, logAudit } = require('./_lib/store');
const { authorizeJob } = require('./_lib/auth');
const { INTERNATIONAL_MARKETS } = require('./_lib/international-config');

const BRAND_DOMAINS = {
  pickl:   'https://eatpickl.com',
  bonbird: 'https://bonbirdchicken.com',
};

const BRAND_WP = {
  pickl:   { base: 'WP_PICKL_BASE',   user: 'WP_PICKL_USER',   pass: 'WP_PICKL_APP_PASS' },
  bonbird: { base: 'WP_BONBIRD_BASE', user: 'WP_BONBIRD_USER', pass: 'WP_BONBIRD_APP_PASS' },
};

exports.handler = async (event) => {
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not authenticated' }) };
  let brand;
  try { brand = JSON.parse(event.body || '{}').brand; } catch { brand = null; }
  if (!brand || !BRAND_DOMAINS[brand]) return;

  const domain = BRAND_DOMAINS[brand];

  const audit = {
    brand,
    status:    'running',
    startedAt: Date.now(),
    results:   [],
    intlResults: [],
    technicalChecks: null,
    summary: null,
  };
  await setSetting(`technicalSeo:${brand}`, audit);

  // ── PART 1: Full PSI on core pages from WordPress ────────────────────────
  const corePages = await getCorePages(brand, domain);
  console.log(`[tech-seo] ${brand}: ${corePages.length} core pages to audit`);

  for (const page of corePages) {
    console.log(`[tech-seo] PSI: ${page.url}`);
    try {
      const [mobile, desktop] = await Promise.all([
        runPageSpeed(page.url, 'mobile'),
        runPageSpeed(page.url, 'desktop'),
      ]);
      audit.results.push({ url: page.url, label: page.label, mobile, desktop, checkedAt: Date.now() });
      await setSetting(`technicalSeo:${brand}`, { ...audit });
      await createIssuesFromPsi(brand, page, mobile, desktop);
    } catch (e) {
      console.error(`[tech-seo] PSI error ${page.url}:`, e.message);
      audit.results.push({ url: page.url, label: page.label, error: e.message, checkedAt: Date.now() });
      await setSetting(`technicalSeo:${brand}`, { ...audit });
    }
  }

  // ── PART 2: Health check + PSI on ALL international pages ───────────────
  // Health check first (fast), then always run mobile PSI regardless.
  // Desktop PSI skipped for international to keep audit time manageable.
  const intlPages = getInternationalPages(brand, domain);
  console.log(`[tech-seo] ${brand}: ${intlPages.length} international pages to audit`);

  for (const page of intlPages) {
    try {
      const health = await runHealthCheck(page.url);
      const result = { url: page.url, label: page.label, market: page.market, health, checkedAt: Date.now() };

      // Always run mobile PSI — real performance data, not just server response time
      console.log(`[tech-seo] PSI (mobile) for ${page.url}`);
      try {
        result.mobile = await runPageSpeed(page.url, 'mobile');
        // Also run desktop if health check flagged an issue
        if (health.status !== 'ok' || health.responseTimeMs > 3000) {
          result.desktop  = await runPageSpeed(page.url, 'desktop');
          result.hasIssue = true;
        }
        await createIssuesFromPsi(brand, page, result.mobile, result.desktop || result.mobile);
      } catch (psiErr) {
        console.warn(`[tech-seo] PSI failed for ${page.url}:`, psiErr.message);
        result.psiError = psiErr.message;
      }

      audit.intlResults.push(result);
      await setSetting(`technicalSeo:${brand}`, { ...audit });
    } catch (e) {
      console.error(`[tech-seo] Error for ${page.url}:`, e.message);
      audit.intlResults.push({ url: page.url, label: page.label, market: page.market, error: e.message, checkedAt: Date.now() });
    }
  }

  // ── PART 3: Site-level checks ────────────────────────────────────────────
  audit.technicalChecks = await runSiteChecks(domain);

  // ── Final save ───────────────────────────────────────────────────────────
  audit.status      = 'complete';
  audit.completedAt = Date.now();
  audit.summary     = buildSummary(audit.results, audit.intlResults, audit.technicalChecks);
  await setSetting(`technicalSeo:${brand}`, audit);
  console.log(`[tech-seo] Audit complete for ${brand}. Core: ${audit.results.length}, Intl: ${audit.intlResults.length}`);
};

// ── Get core pages from WordPress ─────────────────────────────────────────────

// Priority pages — confirmed from site nav (June 2026)
const PRIORITY_PAGES = {
  pickl: [
    { url: 'https://eatpickl.com',          label: 'Homepage' },
    { url: 'https://eatpickl.com/menu',      label: 'Menu' },
    { url: 'https://eatpickl.com/locations', label: 'Locations' },
    { url: 'https://eatpickl.com/franchise', label: 'Franchise' },
    { url: 'https://eatpickl.com/about',     label: 'About' },
    { url: 'https://eatpickl.com/events',    label: 'Events' },
  ],
  bonbird: [
    { url: 'https://bonbirdchicken.com',                  label: 'Homepage' },
    { url: 'https://bonbirdchicken.com/uae-menu/',        label: 'Menu' },
    { url: 'https://bonbirdchicken.com/locations',        label: 'Locations' },
    { url: 'https://bonbirdchicken.com/franchise',        label: 'Franchise' },
    { url: 'https://bonbirdchicken.com/philosophy',       label: 'Philosophy' },
  ],
};
const SKIP_SLUGS = ['sample-page','privacy-policy','cookie-policy','terms','thank-you',
  'cart','checkout','my-account','games','pickl-games','burger-generator',
  'pickl-burger-muncher','pickl-munch','seoul-catcher',
  'taco-bird','tacobird','taco-bird-game','menu-test','test-menu','menu-2','menu-old'];

async function getCorePages(brand, domain) {
  // Priority pages always come first — these are always audited
  const priorityPages = PRIORITY_PAGES[brand] || [{ url: domain, label: 'Homepage' }];
  const priorityUrls  = new Set(priorityPages.map(p => p.url));
  const pages         = [...priorityPages];

  const envKeys = BRAND_WP[brand];
  const wpBase  = process.env[envKeys.base];
  const wpUser  = process.env[envKeys.user];
  const wpPass  = process.env[envKeys.pass];

  if (wpBase && wpUser && wpPass) {
    try {
      const auth = Buffer.from(`${wpUser}:${wpPass}`).toString('base64');
      const res  = await fetch(
        `${wpBase}/wp-json/wp/v2/pages?status=publish&per_page=100&_fields=id,slug,link,title,parent`,
        { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(15000) }
      );
      const wpPages = await res.json();
      if (Array.isArray(wpPages)) {
        const gscSiteUrl = brand === 'pickl' ? 'https://eatpickl.com/' : 'sc-domain:bonbirdchicken.com';
        const gscCache   = await getSetting('gscPageCache:' + gscSiteUrl).catch(() => null);
        const impMap     = {};
        for (const row of (gscCache?.rows || [])) {
          const path = (row.page || '').replace(/^https?:\/\/[^/]+/, '');
          impMap[path] = (impMap[path] || 0) + row.impressions;
        }
        // Add up to 3 extra high-traffic pages not already in priority list
        const extras = wpPages
          .filter(p => !SKIP_SLUGS.includes((p.slug || '').toLowerCase()))
          .map(p => {
            const url  = p.link || `${domain}/${p.slug}/`;
            const path = url.replace(/^https?:\/\/[^/]+/, '');
            return { url, label: p.title?.rendered || p.slug, impressions: impMap[path] || 0 };
          })
          .filter(p => !priorityUrls.has(p.url))
          .sort((a, b) => b.impressions - a.impressions)
          .slice(0, 3);
        pages.push(...extras);
      }
    } catch (e) {
      console.warn('[tech-seo] WP pages fetch failed, using priority pages only:', e.message);
    }
  }

  // Deduplicate by URL
  const seen = new Set();
  return pages.filter(p => { if (seen.has(p.url)) return false; seen.add(p.url); return true; });
}

// ── Get international pages from config ───────────────────────────────────────

function getInternationalPages(brand, domain) {
  return Object.values(INTERNATIONAL_MARKETS)
    .filter(m => m.brand === brand)
    .map(m => ({
      url:    `${domain}/${m.marketSlug || m.marketKey}/`,
      label:  `${m.flag} ${m.label}`,
      market: m.marketKey,
    }));
}

// ── PageSpeed Insights ────────────────────────────────────────────────────────

async function runPageSpeed(url, strategy) {
  const key    = process.env.GOOGLE_PAGESPEED_KEY ? `&key=${process.env.GOOGLE_PAGESPEED_KEY}` : '';
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}${key}`;

  const res = await fetch(apiUrl, { signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`PSI ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'PSI API error');

  const lh = data.lighthouseResult;
  if (!lh?.categories?.performance) throw new Error('No performance data in PSI response');

  const audits = lh.audits || {};
  const score  = Math.round((lh.categories.performance.score || 0) * 100);
  const lcp    = audits['largest-contentful-paint'];
  const cls    = audits['cumulative-layout-shift'];
  const tbt    = audits['total-blocking-time'];
  const fcp    = audits['first-contentful-paint'];
  const si     = audits['speed-index'];
  const tti    = audits['interactive'];

  const fieldMetrics = data.loadingExperience?.metrics || null;
  const fieldData    = fieldMetrics ? {
    lcp:     fieldMetrics.LARGEST_CONTENTFUL_PAINT_MS?.category   || null,
    cls:     fieldMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.category || null,
    inp:     fieldMetrics.INTERACTION_TO_NEXT_PAINT?.category      || null,
    overall: data.loadingExperience?.overall_category              || null,
  } : null;

  const oppIds = ['render-blocking-resources','unused-javascript','unused-css-rules','uses-optimized-images','uses-webp-images','uses-text-compression','uses-long-cache-ttl'];
  const opportunities = oppIds
    .map(id => audits[id])
    .filter(a => a && a.score !== null && a.score < 0.9 && a.title)
    .map(a => ({ id: a.id, title: a.title, description: (a.description || '').split('.')[0] + '.', displayValue: a.displayValue || null, score: Math.round((a.score || 0) * 100) }))
    .slice(0, 6);

  return {
    score,
    metrics: {
      lcp:  { display: lcp?.displayValue,  value: lcp?.numericValue,  status: scoreLcp(lcp?.numericValue) },
      cls:  { display: cls?.displayValue,  value: cls?.numericValue,  status: scoreCls(cls?.numericValue) },
      tbt:  { display: tbt?.displayValue,  value: tbt?.numericValue,  status: scoreTbt(tbt?.numericValue) },
      fcp:  { display: fcp?.displayValue,  value: fcp?.numericValue },
      si:   { display: si?.displayValue,   value: si?.numericValue },
      tti:  { display: tti?.displayValue,  value: tti?.numericValue },
    },
    fieldData,
    opportunities,
  };
}

// ── HTTP Health Check ─────────────────────────────────────────────────────────

async function runHealthCheck(url) {
  const start = Date.now();
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000), redirect: 'follow' });
    const responseTimeMs = Date.now() - start;
    return {
      status:         res.ok ? 'ok' : 'error',
      httpStatus:     res.status,
      responseTimeMs,
      finalUrl:       res.url !== url ? res.url : null,
    };
  } catch (e) {
    return { status: 'error', httpStatus: null, responseTimeMs: Date.now() - start, error: e.message };
  }
}

// ── Site-level checks ─────────────────────────────────────────────────────────

async function runSiteChecks(domain) {
  const checks = {};
  const to = { signal: AbortSignal.timeout(10000) };

  try {
    const res = await fetch(`${domain}/sitemap.xml`, { ...to, method: 'HEAD' });
    if (!res.ok) {
      const res2 = await fetch(`${domain}/sitemap_index.xml`, { ...to, method: 'HEAD' });
      checks.sitemap = res2.ok ? { status: 'ok', path: '/sitemap_index.xml' } : { status: 'missing', httpStatus: res.status };
    } else {
      checks.sitemap = { status: 'ok', path: '/sitemap.xml' };
    }
  } catch (e) { checks.sitemap = { status: 'error', error: e.message }; }

  try {
    const res = await fetch(`${domain}/robots.txt`, to);
    if (!res.ok) {
      checks.robotsTxt = { status: 'missing', blocking: false };
    } else {
      const text       = await res.text();
      const blocking   = /disallow:\s*\/\s*$/im.test(text);
      const hasSitemap = /sitemap:/i.test(text);
      checks.robotsTxt = { status: 'ok', blocking, hasSitemap, snippet: text.slice(0, 300) };
    }
  } catch (e) { checks.robotsTxt = { status: 'error', error: e.message }; }

  checks.https = { status: domain.startsWith('https://') ? 'ok' : 'warning' };
  return checks;
}

// ── CWV thresholds ────────────────────────────────────────────────────────────

function scoreLcp(ms) { if (!ms) return 'unknown'; return ms <= 2500 ? 'good' : ms <= 4000 ? 'needs-improvement' : 'poor'; }
function scoreCls(v)  { if (v == null) return 'unknown'; return v <= 0.1 ? 'good' : v <= 0.25 ? 'needs-improvement' : 'poor'; }
function scoreTbt(ms) { if (!ms) return 'unknown'; return ms <= 200 ? 'good' : ms <= 600 ? 'needs-improvement' : 'poor'; }

// ── Create tech task (developer kanban) ───────────────────────────────────────
// Issues go to techTask Blobs — NEVER to the main Approvals Queue.

async function createIssuesFromPsi(brand, page, mobile, desktop) {
  const issues = [];

  if (mobile.score < 50) {
    issues.push({
      severity: 'critical',
      title:    `🔴 Critical speed: ${page.label} — ${mobile.score}/100 mobile`,
      description: `Mobile performance score of ${mobile.score}/100 on ${page.url}. Actively hurting rankings and user experience.\n\nTop fixes:\n${mobile.opportunities.slice(0,3).map(o=>`• ${o.title}${o.displayValue ? ` (${o.displayValue})` : ''}`).join('\n')}`,
    });
  } else if (mobile.score < 70) {
    issues.push({
      severity: 'warning',
      title:    `⚠️ Speed needs work: ${page.label} — ${mobile.score}/100 mobile`,
      description: `Mobile score ${mobile.score}/100 — below Google's 70 threshold.\n\nTop fixes:\n${mobile.opportunities.slice(0,2).map(o=>`• ${o.title}`).join('\n')}`,
    });
  }

  if (mobile.metrics.lcp.status === 'poor') {
    issues.push({
      severity: 'critical',
      title:    `🔴 Poor LCP: ${page.label} — ${mobile.metrics.lcp.display}`,
      description: `LCP of ${mobile.metrics.lcp.display} on ${page.url}. Google threshold: 2.5s.\n\nCommon causes: unoptimised hero image, render-blocking CSS/JS, slow server response.`,
    });
  }

  if (mobile.metrics.cls.status === 'poor') {
    issues.push({
      severity: 'warning',
      title:    `⚠️ Layout shift: ${page.label} — CLS ${mobile.metrics.cls.display}`,
      description: `CLS of ${mobile.metrics.cls.display} on ${page.url}. Causes visible jumping as page loads.\n\nFix: add width/height to images, avoid injecting content above existing content.`,
    });
  }

  for (const issue of issues) {
    await createTechTask(brand, {
      ...issue,
      url:         page.url,
      pageLabel:   page.label,
      mobileScore: mobile.score,
      desktopScore: desktop?.score,
      lcp:         mobile.metrics.lcp.display,
      cls:         mobile.metrics.cls.display,
      tbt:         mobile.metrics.tbt.display,
      opportunities: mobile.opportunities.map(o => o.title),
    });
  }
}

async function createTechTask(brand, taskData) {
  try {
    const id   = 'tt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const task = {
      id,
      brand,
      status:    'todo',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source:    'technical_audit',
      ...taskData,
    };
    await setSetting(`techTask:${id}`, task);
    const index = await getSetting(`techTaskIndex:${brand}`).catch(() => []);
    await setSetting(`techTaskIndex:${brand}`, [...(index || []), id]);
    console.log(`[tech-seo] Task created: ${task.title}`);
  } catch (e) {
    console.error('[tech-seo] Failed to create tech task:', e.message);
  }
}

// ── Summary for overview cards ────────────────────────────────────────────────

function buildSummary(results, intlResults, checks) {
  const scored    = results.filter(r => r.mobile?.score != null);
  const avgMobile = scored.length ? Math.round(scored.reduce((s, r) => s + r.mobile.score, 0) / scored.length) : null;
  const avgDesktop = scored.length ? Math.round(scored.reduce((s, r) => s + (r.desktop?.score || 0), 0) / scored.length) : null;

  const cwvStatuses = scored.flatMap(r => [r.mobile?.metrics?.lcp?.status, r.mobile?.metrics?.cls?.status, r.mobile?.metrics?.tbt?.status]).filter(Boolean);
  const cwvOverall  = cwvStatuses.every(s => s === 'good') ? 'good' : cwvStatuses.some(s => s === 'poor') ? 'poor' : 'needs-improvement';

  const intlFailing = intlResults.filter(r => r.health?.status !== 'ok' || r.health?.responseTimeMs > 3000 || r.error).length;

  const techIssues = [
    checks?.sitemap?.status   !== 'ok' ? 'Sitemap missing' : null,
    checks?.robotsTxt?.status !== 'ok' ? 'robots.txt missing' : null,
    checks?.robotsTxt?.blocking         ? 'robots.txt blocking Google' : null,
  ].filter(Boolean);

  return { avgMobile, avgDesktop, cwvOverall, intlFailing, techIssues };
}
