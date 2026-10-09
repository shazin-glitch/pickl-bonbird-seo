// netlify/functions/perch-sync-background.js
// Phase 6 (NEST-REFINEMENT-PLAN) — Perch as the ACTION SPINE. Turns concrete SEO
// findings into tracked Perch tasks so nothing important lives only in a dashboard.
// Perch had ZERO inbound edges before this (only manual CRUD + the one-time seeder).
//
// SIGNAL, NOT NOISE — the guardrails that keep the board trustworthy:
//   • only concrete, one-action findings (no raw keyword-list dumps)
//   • dedup by a stable sourceId (never recreate a task that already exists, any status)
//   • a per-run cap (never flood the board)
//   • severity → priority so the board is pre-triaged
// Sources (this build): registry health flags (noindex / missing-from-sitemap /
// indexed-but-0-clicks), local GBP gaps (non-UAE markets with venue pages), and ranking
// drops (registry `wk`: GSC last 7 days vs the 7 before). Fired after the registry
// build (chained) + HTTP-invocable; no own schedule (avoids the 403 trap).

const { getSetting, setSetting, newId, logAudit } = require('./_lib/store');
const { getBrandSlugs } = require('./_lib/brands-config');
const { authorizeJob, internalHeaders } = require('./_lib/auth');

const SITE = process.env.URL || process.env.NETLIFY_URL || 'https://yolkseo.netlify.app';

const MAX_NEW_PER_RUN = 30;   // never flood Perch in one run
const MIN_IMPR_OPTIMIZE = 25; // "indexed but 0 clicks" only matters above some exposure
const DROP_MIN = 1.5;         // positions dropped WoW to flag (weekly GSC positions) — same rule as the Outcomes card
const DROP_MIN_IMPR = 100;    // min impressions in EACH week — a weekly position from fewer is noise

const pathOf = u => { try { return new URL(u).pathname; } catch { return u; } };
// A real content page (not a PDF/image/asset or /wp-content/ upload) — assets aren't
// "optimize the title/meta" candidates.
// Exclude assets AND legal/utility/functional pages — a ranking wobble on a
// terms/privacy/giveaway/contact page isn't an actionable SEO signal.
const UTIL_RE = /(privacy|terms|conditions|cookie|legal|giveaway|competition|sweepstake|contest|\/contact|\/careers|\/faqs?|\/sitemap|\/login|\/account|\/cart|\/checkout|thank-you|unsubscribe|\/jobs?\/|-tc\/?$|\/games\/?$|\/order\/?$)/i;
// Site leftovers that aren't worth a task: "-legacy" copies, numbered duplicates ("…-2/"),
// a /home/ page duplicating the homepage, per-market events pages, pranks, journal pagination.
// Pickl's relaunch left ~40 of these in its sitemap and each became its own "not indexed" task.
const JUNK_RE = /(-legacy\/?$|\/home(-events)?\/?$|-\d+\/?$|events\/?$|recruitment|aprilfool|prank|\/journal\/\d+\/?$|\/page\/\d+\/?$|\/author\/)/i;
const isContentPage = u => !/\/wp-content\//i.test(u) && !/\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|csv)(\?|$)/i.test(u) && !UTIL_RE.test(u) && !JUNK_RE.test(u);

function findingsForBrand(reg) {
  const pages = (reg && reg.pages) || [];
  const out = [];
  // 1) noindex — a live page Google is told not to index (earns nothing until fixed)
  for (const p of pages.filter(x => x.status === 'noindex')) {
    out.push({ priority: 'high', sourceId: `noindex:${reg.brand}:${pathOf(p.url)}`,
      title: `Fix noindex — ${pathOf(p.url)}`,
      description: `${p.url}\n\nThis page is set to noindex, so Google can't index or rank it (it's also excluded from the sitemap). Set Yoast to "index" and request indexing in Search Console.` });
  }
  // 2) missing from sitemap — our page is live but Google may never discover it. ONLY
  // flag when it also has zero impressions: a page with impressions is clearly discovered
  // regardless of the sitemap (avoids false-positiving the homepage / high-traffic pages).
  // Require indexNote === 'index' — i.e. a CONFIRMED live, 200, indexable page. This excludes
  // redirects (a 301 URL belongs out of the sitemap; its target is in it — see the ISO-market
  // /→/ae/, /dubai/→/ae/dubai/, /oman/→/om/ false positives), plus unreachable/unknown/noindex.
  for (const p of pages.filter(x => x.nestCreated && !x.inSitemap && x.indexNote === 'index' && (x.impressions || 0) === 0)) {
    out.push({ priority: 'high', sourceId: `sitemap:${reg.brand}:${pathOf(p.url)}`,
      title: `Not in sitemap — ${pathOf(p.url)}`,
      description: `${p.url}\n\nThis page is live but missing from the XML sitemap and has no search impressions, so Google may not have discovered it. Confirm it's indexable and included in the sitemap, then request indexing.` });
  }
  // 3) indexed but 0 clicks — ready for an optimization push (top real pages by exposure)
  const optz = pages.filter(x => x.status === 'indexed' && (x.clicks || 0) === 0 && (x.impressions || 0) >= MIN_IMPR_OPTIMIZE && isContentPage(x.url))
    .sort((a, b) => b.impressions - a.impressions).slice(0, 5);
  for (const p of optz) {
    out.push({ priority: 'medium', sourceId: `optimize:${reg.brand}:${pathOf(p.url)}`,
      title: `Optimize — ${pathOf(p.url)} (${p.impressions} impr, 0 clicks)`,
      description: `${p.url}\n\nIndexed and shown ${p.impressions}× in 90 days but earning no clicks (avg position ${p.position != null ? p.position : 'n/a'}). Improve the title/meta or search-intent match, or push the ranking.` });
  }
  // 4) CTR gap (7d) — ranks page-one with real impressions but few clicks = a title/meta
  // problem, not a ranking one. Requires clicks>=1 (0-click pages are the "optimize" finding
  // above) so the two don't double-flag the same page.
  const ctr = pages.filter(x => x.status !== 'noindex' && x.position != null && x.position <= 10 && (x.impressions || 0) >= 200 && (x.clicks || 0) >= 1 && (x.clicks / x.impressions) < 0.02 && isContentPage(x.url))
    .sort((a, b) => b.impressions - a.impressions).slice(0, 5);
  for (const p of ctr) {
    const rate = (p.clicks / p.impressions * 100).toFixed(1);
    out.push({ priority: 'medium', sourceId: `ctr:${reg.brand}:${pathOf(p.url)}`,
      title: `Low CTR — ${pathOf(p.url)} (#${p.position}, ${rate}%)`,
      description: `${p.url}\n\nRanks #${p.position} with ${(p.impressions || 0).toLocaleString()} impressions but only ${p.clicks} clicks (${rate}% CTR). A page ranking this high should earn more clicks — rewrite the title tag and meta description to be more compelling and better match search intent.` });
  }
  // 5) local GBP gaps — non-UAE markets with venue pages need Google Business Profiles
  const venMarkets = [...new Set(pages.filter(x => x.pageType === 'venue' && x.market && x.market !== 'uae').map(x => x.market))];
  for (const m of venMarkets) {
    out.push({ priority: 'high', sourceId: `gbp:${reg.brand}:${m}`,
      title: `Set up / verify Google Business Profiles — ${m} venues`,
      description: `Venue pages for ${m} are live but local rankings need Google Business Profiles — the main driver of "near me" and Google Maps traffic. Claim, categorise, photograph and link each venue's GBP to its page.` });
  }
  // 6) stuck — not indexed / not serving: live + set-to-index + in the sitemap but ZERO
  // impressions for 3+ weeks (the durable signal from the registry, not the lagging
  // URL-Inspection verdict). Either it isn't indexed or it's indexed but ranks for nothing.
  // ONE grouped task per brand per month (refreshed in place while open) instead of one task
  // per URL — per-URL tasks put 93 near-identical cards on the board (Oct 2026).
  const stuck = ((reg.summary && reg.summary.indexingConcernUrls) || []).filter(c => isContentPage(c.url)).sort((a, b) => b.ageDays - a.ageDays);
  if (stuck.length) {
    const month = new Date().toISOString().slice(0, 7);
    out.push({ priority: 'high', sourceId: `notindexed:${reg.brand}:rollup:${month}`, rollup: true,
      title: `Not indexed / not serving — ${stuck.length} page${stuck.length > 1 ? 's' : ''} (${reg.brand})`,
      description: `These pages are live and set to index but have had zero search impressions for 2+ weeks — likely not indexed, or indexed but ranking for nothing.\n\nFor each: Search Console → URL Inspection → Test Live URL → Request Indexing; make sure a page that already ranks links to it; check it has enough unique content to be worth indexing. If a page shouldn't exist, noindex or redirect it instead.\n\n` +
        stuck.slice(0, 40).map(c => `• ${pathOf(c.url)} — ${c.ageDays}d${c.lastCrawlVerdict ? ` (last crawl: ${c.lastCrawlVerdict})` : ''}`).join('\n') +
        (stuck.length > 40 ? `\n…and ${stuck.length - 40} more (see State of SEO → indexing concerns).` : '') +
        `\n\nThis list refreshes each run while the task is open.` });
  }
  return out;
}

// Ranking drops (self-activates once ≥2 weekly snapshots exist; produces nothing before).
// Ranking drops from the registry's per-page `wk` (GSC last 7 days vs the 7 before, merged to
// the live page server-side) — the same source the Outcomes card uses, so tasks and dashboard
// agree. (Replaces diffing stored 90-day snapshots: they barely move, and an old snapshot's
// merge bug became a fake "drop" — 5 false tasks on 2026-10-05.)
const isoWeekOf = d => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const f = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return t.getUTCFullYear() + '-W' + String(1 + Math.round(((t - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0'); };
async function dropFindings(brand, reg) {
  const out = [];
  const win = reg?.summary?.weekWindow;
  if (!win) return out;                                   // registry predates weekly movement
  const week = isoWeekOf(new Date(win.cur[1] + 'T00:00:00Z'));
  const drops = (reg.pages || []).map(p => {
    const w = p.wk;
    if (!w || w.p == null || w.pp == null || !isContentPage(p.url)) return null;
    if (w.i < DROP_MIN_IMPR || w.pi < DROP_MIN_IMPR) return null; // too few impressions for a stable position
    if (w.c > w.pc) return null;                          // clicks grew → broader queries, not a loss
    const delta = w.p - w.pp;                             // positive = worse (dropped)
    return delta >= DROP_MIN ? { p, w, delta } : null;
  }).filter(Boolean).sort((a, b) => b.delta - a.delta).slice(0, 5);
  for (const d of drops) {
    out.push({ priority: 'high', sourceId: `drop:${brand}:${pathOf(d.p.url)}:${week}`,
      title: `Ranking drop — ${pathOf(d.p.url)} (#${d.w.pp}→#${d.w.p})`,
      description: `${d.p.url}\n\nAverage position fell ${d.delta.toFixed(1)} week-on-week (${win.prev[0]}–${win.prev[1]} vs ${win.cur[0]}–${win.cur[1]}, Google Search Console); clicks ${d.w.pc} → ${d.w.c}. Check for a content/technical change or new competition.` });
  }
  return out;
}

async function existingSourceIds() {
  const ids = (await getSetting('perchIndex', [])) || [];
  const tasks = await Promise.all(ids.map(id => getSetting('perchTask:' + id).catch(() => null)));
  return new Set(tasks.filter(t => t && t.sourceId).map(t => t.sourceId));
}

exports.handler = async (event) => {
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not authenticated' }) };

  const qs = event.queryStringParameters || {};
  const brands = qs.brand ? [qs.brand] : await getBrandSlugs();

  // Gather candidate findings across brands.
  let candidates = [];
  for (const brand of brands) {
    const reg = await getSetting(`pageRegistry:${brand}`);
    if (reg) candidates = candidates.concat(findingsForBrand(reg).map(f => ({ ...f, brand })));
    candidates = candidates.concat((await dropFindings(brand, reg)).map(f => ({ ...f, brand })));
  }

  // Grouped (rollup) findings refresh their OPEN task in place; everything else dedups
  // vs existing tasks of ANY status (incl. 'dismissed', so a dismissed finding never returns).
  const seen = await existingSourceIds();
  let refreshed = 0;
  for (const f of candidates.filter(c => c.rollup && seen.has(c.sourceId))) {
    const idx = (await getSetting('perchIndex', [])) || [];
    for (const id of idx) {
      const t = await getSetting('perchTask:' + id).catch(() => null);
      if (!t || t.sourceId !== f.sourceId) continue;
      if (t.status === 'todo' && (t.title !== f.title || t.description !== f.description)) {
        await setSetting('perchTask:' + id, { ...t, title: f.title, description: f.description, updatedAt: Date.now() });
        refreshed++;
      }
      break;
    }
  }
  const fresh = candidates.filter(f => !seen.has(f.sourceId));
  fresh.sort((a, b) => (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1));
  const toCreate = fresh.slice(0, MAX_NEW_PER_RUN);

  const index = (await getSetting('perchIndex', [])) || [];
  const created = [];
  for (const f of toCreate) {
    const id = newId('task');
    const now = Date.now();
    const task = {
      id, title: f.title, description: f.description || '',
      brand: f.brand, department: 'seo', assignee: null, collaborators: [],
      dueDate: null, priority: f.priority || 'medium', status: 'todo',
      createdBy: 'system', createdAt: now, updatedAt: now,
      source: 'auto:seo', sourceId: f.sourceId,
      comments: [], auditLog: [{ action: 'created', actor: 'system', actorName: 'Nest (auto)', timestamp: now }],
    };
    await setSetting('perchTask:' + id, task);
    index.push(id);
    created.push({ title: task.title, brand: task.brand, priority: task.priority });
  }
  if (created.length) {
    await setSetting('perchIndex', index);
    await logAudit({ action: 'perch_autosync', actor: 'system', details: { created: created.length, brands } });
    // ONE Slack summary per run (only when there's genuinely new work — dedup means a
    // re-run with nothing new stays silent). Not per-task, so it's signal not spam.
    try {
      await fetch(`${SITE}/.netlify/functions/slack-notify`, {
        method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          type: 'perch_autosync',
          created: created.length,
          tasks: created.map(t => ({ title: t.title, priority: t.priority, brand: t.brand })),
        }),
      });
    } catch (e) { console.warn('[perch-sync] slack notify failed:', e.message); }
  }

  console.log(`[perch-sync] candidates=${candidates.length} new=${created.length} refreshed=${refreshed} (capped at ${MAX_NEW_PER_RUN})`);
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, candidates: candidates.length, created: created.length, tasks: created }) };
};
