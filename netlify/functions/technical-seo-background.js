// netlify/functions/technical-seo-background.js
// Technical SEO audit — runs on demand (triggered by technical-seo.js).
// Checks each brand's key pages via Google PageSpeed Insights (free, no auth).
// Also checks sitemap.xml and robots.txt health.
// Saves results to Blobs under technicalSeo:<brand> — incrementally updated so
// the frontend can poll and show results as they come in.
// Critical issues are auto-queued as onpage_suggestion approval items.

const { getSetting, setSetting, createApproval } = require('./_lib/store');

// Pages to audit per brand
const BRAND_PAGES = {
  pickl: [
    { url: 'https://eatpickl.com',           label: 'Homepage' },
    { url: 'https://eatpickl.com/menu',       label: 'Menu' },
    { url: 'https://eatpickl.com/locations',  label: 'Locations' },
    { url: 'https://eatpickl.com/journal',    label: 'Journal' },
  ],
  bonbird: [
    { url: 'https://bonbirdchicken.com',          label: 'Homepage' },
    { url: 'https://bonbirdchicken.com/menu',      label: 'Menu' },
    { url: 'https://bonbirdchicken.com/locations', label: 'Locations' },
  ],
};

const BRAND_DOMAINS = {
  pickl:   'https://eatpickl.com',
  bonbird: 'https://bonbirdchicken.com',
};

exports.handler = async (event) => {
  let brand;
  try { brand = JSON.parse(event.body || '{}').brand; } catch { brand = null; }
  if (!brand || !BRAND_PAGES[brand]) return;

  // Read the running state we wrote in technical-seo.js
  const audit = await getSetting(`technicalSeo:${brand}`).catch(() => ({
    status:    'running',
    startedAt: Date.now(),
    brand,
    results:   [],
  }));

  const pages   = BRAND_PAGES[brand];
  const results = [];

  for (const page of pages) {
    console.log(`[tech-seo] Auditing ${page.url} (mobile + desktop)...`);
    try {
      // Run mobile and desktop checks in parallel — both PSI calls at once
      const [mobile, desktop] = await Promise.all([
        runPageSpeed(page.url, 'mobile'),
        runPageSpeed(page.url, 'desktop'),
      ]);

      const result = {
        url:        page.url,
        label:      page.label,
        mobile,
        desktop,
        checkedAt:  Date.now(),
      };
      results.push(result);

      // Save after each page so frontend can show partial results
      await setSetting(`technicalSeo:${brand}`, {
        ...audit,
        results,
        status: 'running',
      }).catch(() => {});

      // Queue critical issues as approval items
      await queueCriticalIssues(brand, page, mobile, desktop);

    } catch (e) {
      console.error(`[tech-seo] PSI error for ${page.url}:`, e.message);
      results.push({ url: page.url, label: page.label, error: e.message, checkedAt: Date.now() });
    }
  }

  // Site-level technical checks (sitemap, robots, HTTPS)
  const domain         = BRAND_DOMAINS[brand];
  const technicalChecks = await runSiteChecks(domain);

  // Final save — status complete
  const finalAudit = {
    brand,
    status:       'complete',
    startedAt:    audit.startedAt,
    completedAt:  Date.now(),
    results,
    technicalChecks,
    summary:      buildSummary(results, technicalChecks),
  };

  await setSetting(`technicalSeo:${brand}`, finalAudit);
  console.log(`[tech-seo] Audit complete for ${brand}. ${results.length} pages checked.`);
};

// ── PageSpeed Insights ────────────────────────────────────────────────────────

async function runPageSpeed(url, strategy) {
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}`;
  
  const res = await fetch(apiUrl, { signal: AbortSignal.timeout(45000) });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`PSI ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'PSI API error');

  const lh = data.lighthouseResult;
  if (!lh?.categories?.performance) throw new Error('No performance data in PSI response');

  const audits = lh.audits || {};
  const score  = Math.round((lh.categories.performance.score || 0) * 100);

  // Core Web Vitals (lab data)
  const lcp  = audits['largest-contentful-paint'];
  const cls  = audits['cumulative-layout-shift'];
  const tbt  = audits['total-blocking-time'];       // lab proxy for INP
  const fcp  = audits['first-contentful-paint'];
  const si   = audits['speed-index'];
  const tti  = audits['interactive'];
  const ttfb = audits['server-response-time'];

  // Field data (real user Chrome UX Report data — may not exist for low-traffic pages)
  const fieldMetrics = data.loadingExperience?.metrics || null;
  const fieldData    = fieldMetrics ? {
    lcp:     fieldMetrics.LARGEST_CONTENTFUL_PAINT_MS?.category   || null,
    cls:     fieldMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.category || null,
    inp:     fieldMetrics.INTERACTION_TO_NEXT_PAINT?.category      || null,
    overall: data.loadingExperience?.overall_category              || null,
  } : null;

  // Top improvement opportunities from Lighthouse
  const oppIds = [
    'render-blocking-resources',
    'unused-javascript',
    'unused-css-rules',
    'uses-optimized-images',
    'uses-webp-images',
    'uses-text-compression',
    'uses-long-cache-ttl',
    'efficient-animated-content',
  ];
  const opportunities = oppIds
    .map(id => audits[id])
    .filter(a => a && a.score !== null && a.score < 0.9 && a.title)
    .map(a => ({
      id:           a.id,
      title:        a.title,
      description:  (a.description || '').split('.')[0] + '.',
      displayValue: a.displayValue || null,
      score:        Math.round((a.score || 0) * 100),
    }))
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
      ttfb: { display: ttfb?.displayValue, value: ttfb?.numericValue },
    },
    fieldData,
    opportunities,
  };
}

// ── CWV thresholds ────────────────────────────────────────────────────────────

function scoreLcp(ms) {
  if (ms == null) return 'unknown';
  if (ms <= 2500) return 'good';
  if (ms <= 4000) return 'needs-improvement';
  return 'poor';
}

function scoreCls(val) {
  if (val == null) return 'unknown';
  if (val <= 0.1)  return 'good';
  if (val <= 0.25) return 'needs-improvement';
  return 'poor';
}

function scoreTbt(ms) {
  if (ms == null) return 'unknown';
  if (ms <= 200) return 'good';
  if (ms <= 600) return 'needs-improvement';
  return 'poor';
}

// ── Site-level checks ─────────────────────────────────────────────────────────

async function runSiteChecks(domain) {
  const checks = {};
  const to     = { signal: AbortSignal.timeout(10000) };

  // sitemap.xml
  try {
    const res = await fetch(`${domain}/sitemap.xml`, { ...to, method: 'HEAD' });
    checks.sitemap = { status: res.ok ? 'ok' : 'missing', httpStatus: res.status };
    if (!res.ok) {
      // Try sitemap_index.xml as fallback
      const res2 = await fetch(`${domain}/sitemap_index.xml`, { ...to, method: 'HEAD' });
      if (res2.ok) checks.sitemap = { status: 'ok', httpStatus: res2.status, path: '/sitemap_index.xml' };
    }
  } catch (e) {
    checks.sitemap = { status: 'error', error: e.message };
  }

  // robots.txt
  try {
    const res = await fetch(`${domain}/robots.txt`, to);
    if (!res.ok) {
      checks.robotsTxt = { status: 'missing', blocking: false };
    } else {
      const text     = await res.text();
      const blocking = /disallow:\s*\/\s*$/im.test(text);
      const hasSitemap = /sitemap:/i.test(text);
      checks.robotsTxt = { status: 'ok', blocking, hasSitemap, snippet: text.slice(0, 300) };
    }
  } catch (e) {
    checks.robotsTxt = { status: 'error', error: e.message };
  }

  // HTTPS enforcement (can only infer from domain string in background function)
  checks.https = { status: domain.startsWith('https://') ? 'ok' : 'warning' };

  return checks;
}

// ── Auto-queue critical issues ─────────────────────────────────────────────────

async function queueCriticalIssues(brand, page, mobile, desktop) {
  const issues = [];

  if (mobile.score < 50) {
    issues.push({
      title:  `🔴 Critical speed issue: ${page.label} scores ${mobile.score}/100 on mobile`,
      reason: `${page.url} has a very poor mobile performance score of ${mobile.score}/100. This is actively hurting rankings and user experience. ` +
              `Top fixes: ${mobile.opportunities.slice(0, 3).map(o => o.title).join(' · ')}`,
    });
  } else if (mobile.score < 70) {
    issues.push({
      title:  `⚠️ Speed needs work: ${page.label} scores ${mobile.score}/100 on mobile`,
      reason: `${page.url} scores ${mobile.score}/100 on mobile — below Google's 70 threshold. ` +
              `Top fixes: ${mobile.opportunities.slice(0, 2).map(o => o.title).join(' · ')}`,
    });
  }

  if (mobile.metrics.lcp.status === 'poor') {
    issues.push({
      title:  `🔴 Poor LCP on ${page.label}: ${mobile.metrics.lcp.display}`,
      reason: `Largest Contentful Paint of ${mobile.metrics.lcp.display} on ${page.url}. Google's threshold is 2.5s. ` +
              `Common causes: unoptimised hero image, render-blocking CSS/JS, slow server response time.`,
    });
  }

  if (mobile.metrics.cls.status === 'poor') {
    issues.push({
      title:  `⚠️ High layout shift on ${page.label}: CLS ${mobile.metrics.cls.display}`,
      reason: `CLS of ${mobile.metrics.cls.display} on ${page.url} causes visible layout jumping. ` +
              `Fix: add width/height attributes to images and embeds, avoid inserting content above existing content.`,
    });
  }

  for (const issue of issues) {
    try {
      await createApproval({
        type:  'onpage_suggestion',
        brand,
        actor: 'technical-seo audit',
        title: issue.title,
        reason: issue.reason,
        payload: {
          url:          page.url,
          issueType:    'technical_seo',
          pageLabel:    page.label,
          mobileScore:  mobile.score,
          desktopScore: desktop.score,
          lcp:          mobile.metrics.lcp.display,
          cls:          mobile.metrics.cls.display,
          tbt:          mobile.metrics.tbt.display,
          opportunities: mobile.opportunities.map(o => o.title),
          wpAction:      null, // developer task, not a WP push
        },
      });
      console.log(`[tech-seo] Queued issue: ${issue.title}`);
    } catch (e) {
      console.error('[tech-seo] Failed to queue issue:', e.message);
    }
  }
}

// ── Summary for the overview cards ────────────────────────────────────────────

function buildSummary(results, checks) {
  const scored    = results.filter(r => r.mobile?.score != null);
  const avgMobile = scored.length
    ? Math.round(scored.reduce((s, r) => s + r.mobile.score, 0) / scored.length)
    : null;
  const avgDesktop = scored.length
    ? Math.round(scored.reduce((s, r) => s + r.desktop.score, 0) / scored.length)
    : null;

  const cwvStatuses = scored.flatMap(r => [
    r.mobile?.metrics?.lcp?.status,
    r.mobile?.metrics?.cls?.status,
    r.mobile?.metrics?.tbt?.status,
  ]).filter(Boolean);

  const allGood = cwvStatuses.every(s => s === 'good');
  const anyPoor = cwvStatuses.some(s => s === 'poor');
  const cwvOverall = allGood ? 'good' : anyPoor ? 'poor' : 'needs-improvement';

  const techIssues = [
    checks?.sitemap?.status !== 'ok' ? 'Sitemap missing' : null,
    checks?.robotsTxt?.status !== 'ok' ? 'robots.txt missing' : null,
    checks?.robotsTxt?.blocking ? 'robots.txt blocking Google' : null,
  ].filter(Boolean);

  return { avgMobile, avgDesktop, cwvOverall, techIssues };
}
