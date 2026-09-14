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
// drops (self-activates once ≥2 weekly pageSnapshots exist). Fired after the registry
// build (chained) + HTTP-invocable; no own schedule (avoids the 403 trap).

const { store, getSetting, setSetting, newId, logAudit } = require('./_lib/store');
const { getBrandSlugs } = require('./_lib/brands-config');
const { authorizeJob } = require('./_lib/auth');

const MAX_NEW_PER_RUN = 30;   // never flood Perch in one run
const MIN_IMPR_OPTIMIZE = 25; // "indexed but 0 clicks" only matters above some exposure
const DROP_MIN = 3;           // positions dropped WoW to flag

const pathOf = u => { try { return new URL(u).pathname; } catch { return u; } };

function findingsForBrand(reg) {
  const pages = (reg && reg.pages) || [];
  const out = [];
  // 1) noindex — a live page Google is told not to index (earns nothing until fixed)
  for (const p of pages.filter(x => x.status === 'noindex')) {
    out.push({ priority: 'high', sourceId: `noindex:${reg.brand}:${pathOf(p.url)}`,
      title: `Fix noindex — ${pathOf(p.url)}`,
      description: `${p.url}\n\nThis page is set to noindex, so Google can't index or rank it (it's also excluded from the sitemap). Set Yoast to "index" and request indexing in Search Console.` });
  }
  // 2) missing from sitemap — our page is live but Google may never discover it
  for (const p of pages.filter(x => x.nestCreated && !x.inSitemap && x.status !== 'noindex')) {
    out.push({ priority: 'high', sourceId: `sitemap:${reg.brand}:${pathOf(p.url)}`,
      title: `Not in sitemap — ${pathOf(p.url)}`,
      description: `${p.url}\n\nThis page is live but missing from the XML sitemap, so Google may not discover it. Confirm it's indexable and included in the sitemap.` });
  }
  // 3) indexed but 0 clicks — ready for an optimization push (top by exposure)
  const optz = pages.filter(x => x.status === 'indexed' && (x.clicks || 0) === 0 && (x.impressions || 0) >= MIN_IMPR_OPTIMIZE)
    .sort((a, b) => b.impressions - a.impressions).slice(0, 5);
  for (const p of optz) {
    out.push({ priority: 'medium', sourceId: `optimize:${reg.brand}:${pathOf(p.url)}`,
      title: `Optimize — ${pathOf(p.url)} (${p.impressions} impr, 0 clicks)`,
      description: `${p.url}\n\nIndexed and shown ${p.impressions}× in 90 days but earning no clicks (avg position ${p.position != null ? p.position : 'n/a'}). Improve the title/meta or search-intent match, or push the ranking.` });
  }
  // 4) local GBP gaps — non-UAE markets with venue pages need Google Business Profiles
  const venMarkets = [...new Set(pages.filter(x => x.pageType === 'venue' && x.market && x.market !== 'uae').map(x => x.market))];
  for (const m of venMarkets) {
    out.push({ priority: 'high', sourceId: `gbp:${reg.brand}:${m}`,
      title: `Set up / verify Google Business Profiles — ${m} venues`,
      description: `Venue pages for ${m} are live but local rankings need Google Business Profiles — the main driver of "near me" and Google Maps traffic. Claim, categorise, photograph and link each venue's GBP to its page.` });
  }
  return out;
}

// Ranking drops (self-activates once ≥2 weekly snapshots exist; produces nothing before).
async function dropFindings(brand) {
  const out = [];
  try {
    const { blobs } = await store().list({ prefix: `pageSnapshot:${brand}:` });
    const keys = (blobs || []).map(b => b.key).sort();
    if (keys.length < 2) return out;
    const curr = await store().get(keys[keys.length - 1], { type: 'json' }).catch(() => null);
    const prev = await store().get(keys[keys.length - 2], { type: 'json' }).catch(() => null);
    if (!curr || !prev) return out;
    const prevMap = new Map((prev.pages || []).map(p => [p.u, p]));
    const drops = (curr.pages || []).map(p => {
      const pr = prevMap.get(p.u);
      if (!pr || p.p == null || pr.p == null) return null;
      const delta = p.p - pr.p;                       // positive = worse (dropped)
      return (delta >= DROP_MIN && (p.i || 0) >= 20) ? { p, pr, delta } : null;
    }).filter(Boolean).sort((a, b) => b.delta - a.delta).slice(0, 5);
    for (const d of drops) {
      out.push({ priority: 'high', sourceId: `drop:${brand}:${pathOf(d.p.u)}:${curr.week}`,
        title: `Ranking drop — ${pathOf(d.p.u)} (#${d.pr.p}→#${d.p.p})`,
        description: `${d.p.u}\n\nFell ${d.delta.toFixed(1)} positions week-over-week (${curr.week}). Check for a content/technical change or new competition.` });
    }
  } catch (e) { console.warn(`[perch-sync/${brand}] drop scan failed:`, e.message); }
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
    candidates = candidates.concat((await dropFindings(brand)).map(f => ({ ...f, brand })));
  }

  // Dedup vs existing tasks (any status), cap, high-priority first.
  const seen = await existingSourceIds();
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
  }

  console.log(`[perch-sync] candidates=${candidates.length} new=${created.length} (capped at ${MAX_NEW_PER_RUN})`);
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, candidates: candidates.length, created: created.length, tasks: created }) };
};
