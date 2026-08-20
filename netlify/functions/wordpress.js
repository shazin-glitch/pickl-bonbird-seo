// netlify/functions/wordpress.js
// WordPress REST API for Pickl (eatpickl.com) and Bonbird (bonbirdchicken.com).
// Auth: Application Passwords (WP admin → Users → Profile → Application Passwords).
//
// ENV VARS:
//   WP_PICKL_BASE / WP_PICKL_USER / WP_PICKL_APP_PASS
//   WP_BONBIRD_BASE / WP_BONBIRD_USER / WP_BONBIRD_APP_PASS
//
// ACTIONS:
//   test            verify credentials
//   create_draft    new blog POST as draft
//   create_page     new WP PAGE as draft  ← new: for landing/location pages
//   update_content  rewrite content of existing post/page, preserves current status
//   update_meta     update SEO title/description only
//   publish         flip draft → published  ← new: triggered by "Approve & Publish"
//   list_posts      search posts + pages
//   list_scaffolds  draft pages with empty/near-empty bodies (template scaffolds awaiting content)
//   get_post        get single item by ID

const { authorize } = require('./_lib/auth');
const { getBrand } = require('./_lib/brands-config');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Cookie, x-nest-internal',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Env-var names are derived from the slug (WP_<SLUG>_BASE/_USER/_APP_PASS) — the
// same convention brandsConfig uses for wpEnvPrefix. This scales to any onboarded
// brand with ZERO code edits (just set the three env vars). No hardcoded map.
function getCreds(brand) {
  if (!brand || !/^[a-z0-9_]+$/i.test(brand)) return null;
  const prefix = `WP_${String(brand).toUpperCase()}`;
  const cfg = { base: `${prefix}_BASE`, user: `${prefix}_USER`, pass: `${prefix}_APP_PASS` };
  const base = process.env[cfg.base];
  const user = process.env[cfg.user];
  const pass = process.env[cfg.pass];
  if (!base || !user || !pass) {
    return { error: `WordPress credentials not configured for ${brand}. Set ${cfg.base}, ${cfg.user}, ${cfg.pass} in Netlify environment variables.` };
  }
  return {
    base: base.replace(/\/$/, ''),
    auth: 'Basic ' + Buffer.from(`${user}:${pass.replace(/\s/g, '')}`).toString('base64'),
  };
}

async function wpFetch(creds, path, opts) {
  opts = opts || {};
  const url = creds.base + '/wp-json' + path;
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: Object.assign({
      'Authorization': creds.auth,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }, opts.headers || {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json')
    ? await res.json().catch(() => null)
    : { raw: await res.text() };
  return { ok: res.ok, status: res.status, data };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return fail(405, 'Method Not Allowed');
  // Auth gate — publishes/creates content live to WordPress. Internal callers
  // (approvals pushItem, scheduler) pass the x-nest-internal token; the browser
  // path uses the session cookie. Was fully open before.
  const auth = await authorize(event);
  if (!auth.ok) return fail(401, 'Not authenticated');
  let body;
  try { body = JSON.parse(event.body); } catch (_) { return fail(400, 'Invalid JSON'); }
  const { action, brand } = body;
  // Validity = the slug resolves to WP env vars (getCreds derives WP_<SLUG>_* from
  // the slug). A brand with no creds set returns {error} → surfaced as 503 below.
  const creds = getCreds(brand);
  if (!creds) return fail(400, `Invalid brand slug: ${brand}`);
  if (creds && creds.error) return fail(503, creds.error);
  try {
    switch (action) {
      case 'test':           return await handleTest(creds);
      case 'create_draft':   return await handleCreateDraft(creds, body.payload || {});
      case 'create_page':    return await handleCreatePage(creds, body.payload || {});
      case 'update_content': return await handleUpdateContent(creds, body.payload || {}, brand);
      case 'update_meta':      return await handleUpdateMeta(creds, body.payload || {});
      case 'get_current_meta': return await handleGetCurrentMeta(creds, body.payload || {});
      case 'publish':          return await handlePublish(creds, body.payload || {});
      case 'list_posts':       return await handleListPosts(creds, body);
      case 'list_market_pages': return await handleListMarketPages(creds, body.payload || {});
      case 'list_scaffolds':    return await handleListScaffolds(creds, body.payload || {});
      case 'get_post':         return await handleGetPost(creds, body);
      case 'get_revisions':    return await handleGetRevisions(creds, body.payload || {});
      default:               return fail(400, `unknown action: ${action}`);
    }
  } catch (e) {
    console.error('wordpress error', action, e);
    return fail(500, e.message || 'WordPress function error');
  }
};

// ── test ────────────────────────────────────────────────────────
async function handleTest(creds) {
  const res = await wpFetch(creds, '/wp/v2/users/me?context=edit');
  if (!res.ok) return fail(res.status, `WP credential test failed: ${describeError(res)}`);
  // Also report WHICH site we actually reached — the configured base can silently point
  // at a dev/staging host (e.g. bonbirddev) after a site rebuild, and the credential test
  // alone would still pass. `/wp-json` root returns the site's own name + home URL.
  let site = null;
  try {
    const root = await wpFetch(creds, '');
    if (root.ok && root.data) site = { name: root.data.name || null, url: root.data.url || root.data.home || null };
  } catch { /* non-critical */ }
  const isDevHost = /dev|staging|test|localhost|\.local/i.test(creds.base);
  return win({
    ok: true,
    user: { id: res.data.id, name: res.data.name },
    base: creds.base,          // the configured WP_<BRAND>_BASE — not a secret
    site,                      // what WordPress says it is
    devHostWarning: isDevHost, // flag an obvious non-production target
    message: `Connected as ${res.data.name}`,
  });
}


// ── Custom taxonomy terms (e.g. Bonbird's `market` taxonomy) ──────────────────
// WP's REST API accepts custom taxonomies as `{ <taxonomy>: [termId, …] }` on the
// post body, but only ACCEPTS IDs — so slugs/names must be resolved first.
// Bonbird journal posts derive their market from a `market` term (see
// /BONBIRD-SITE-ARCHITECTURE.md §4); without it a Nest-created post is market-less.
// payload.taxonomies = { market: ['om'] }  →  { market: [12] }
const _termCache = new Map(); // `${tax}:${slug}` → id (per invocation)

async function resolveTermIds(creds, taxonomy, values) {
  const out = [];
  for (const v of (Array.isArray(values) ? values : [values])) {
    if (v == null || v === '') continue;
    if (typeof v === 'number') { out.push(v); continue; }        // already an id
    const key = `${taxonomy}:${String(v).toLowerCase()}`;
    if (_termCache.has(key)) { out.push(_termCache.get(key)); continue; }
    // try slug first, then name — custom taxonomies expose /wp/v2/<taxonomy>
    let id = null;
    for (const q of [`slug=${encodeURIComponent(v)}`, `search=${encodeURIComponent(v)}`]) {
      const r = await wpFetch(creds, `/wp/v2/${encodeURIComponent(taxonomy)}?${q}&_fields=id,slug,name&per_page=10`);
      if (r.ok && Array.isArray(r.data) && r.data.length) {
        const exact = r.data.find(t => String(t.slug).toLowerCase() === String(v).toLowerCase()
                                    || String(t.name).toLowerCase() === String(v).toLowerCase());
        id = (exact || r.data[0]).id;
        if (id) break;
      }
    }
    if (id) { _termCache.set(key, id); out.push(id); }
    else console.warn(`[resolveTermIds] taxonomy "${taxonomy}" has no term matching "${v}" — skipping (post will lack that term)`);
  }
  return out;
}

// Build the taxonomy fields to merge into a post body. Returns {} when nothing
// resolves, and reports what failed so the caller can surface it.
async function buildTaxonomies(creds, payload) {
  const spec = payload.taxonomies;
  if (!spec || typeof spec !== 'object') return { fields: {}, unresolved: [] };
  const fields = {}, unresolved = [];
  for (const [tax, vals] of Object.entries(spec)) {
    if (tax === 'categories' || tax === 'tags') continue;         // handled natively
    const ids = await resolveTermIds(creds, tax, vals);
    if (ids.length) fields[tax] = ids;
    else unresolved.push(`${tax}=${[].concat(vals).join(',')}`);
  }
  return { fields, unresolved };
}


// ── Body-writability guard (static-template pages) ────────────────────────────
// Some pages render from a static theme template, not `post_content` — writing a
// body there returns 200 and changes nothing visible, so Nest would report success
// on content that never shipped. The list is config-driven per brand
// (brandsConfig.bodyNotWritablePaths). Meta updates are still allowed (they render).
function _pathOf(u) {
  try { return String(u).replace(/^https?:\/\/[^/]+/, '').split('?')[0].split('#')[0].replace(/\/+$/, '').toLowerCase() || '/'; }
  catch { return ''; }
}
// Decide whether a BODY (post_content) write is safe for this target.
// AUTHORITATIVE rule (site team, 20 Aug): body is writable ONLY when the target is
// a journal POST, or a PAGE whose template is in the brand's `writableTemplates`
// allow-list (template-location.php / template-product.php). Every other page —
// market homes (template=default) and all block-built pages — renders its body from
// Gutenberg/ACF blocks, so a raw post_content write CLOBBERS the live page. The old
// path deny-list missed the market homes entirely (the /ae/ homepage incident).
// Brands without `writableTemplates` fall back to the legacy path deny-list so their
// behaviour is unchanged.
async function bodyWritable(brand, url, creds, postId, postType) {
  const cfg = await getBrand(brand).catch(() => null);

  // Journal posts are always body-writable.
  if (postType === 'posts' || postType === 'post') return { ok: true };

  const allow = cfg?.writableTemplates;
  if (Array.isArray(allow) && allow.length) {
    // Template allow-list model (e.g. Bonbird). Resolve the page's template.
    let template = null;
    if (postId && creds) {
      try {
        const r = await wpFetch(creds, `/wp/v2/pages/${postId}?context=edit&_fields=template`);
        if (r.ok) template = r.data?.template ?? '';
        else return { ok: true }; // not a page (likely a post) → journal, writable
      } catch { return { ok: true }; }
    }
    if (template === null) return { ok: false, path: _pathOf(url), reason: 'could not resolve page template' };
    if (allow.includes(template)) return { ok: true };
    return { ok: false, path: _pathOf(url), template: template || 'default' };
  }

  // Fallback: legacy path deny-list (brands without the template model).
  const list = (cfg?.bodyNotWritablePaths || []).map(_pathOf);
  if (!list.length) return { ok: true };
  const p = _pathOf(url);
  return list.includes(p) ? { ok: false, path: p } : { ok: true };
}

// ── create blog POST draft ───────────────────────────────────────
async function handleCreateDraft(creds, payload) {
  if (!payload.title || !payload.body) return fail(400, 'title and body are required');
  const meta = buildSeoMeta(payload);
  // Custom taxonomies (e.g. { market:['om'] }) — required for Bonbird journal posts.
  const { fields: taxFields, unresolved } = await buildTaxonomies(creds, payload);
  const post = {
    title: payload.title, content: payload.body, excerpt: payload.excerpt || '',
    slug: sanitizeSlug(payload.slug), status: 'draft', meta,
    categories: payload.categoryIds || undefined,
    tags: payload.tagIds || undefined,
    ...taxFields,
  };
  const res = await wpFetch(creds, '/wp/v2/posts', { method: 'POST', body: post });
  if (!res.ok) return fail(res.status, `WP create post draft failed: ${describeError(res)}`);
  if (Object.keys(meta).length && res.data.id) {
    await wpFetch(creds, `/wp/v2/posts/${res.data.id}`, { method: 'POST', body: { meta } }).catch(() => null);
  }
  return win({
    ok: true, id: res.data.id, postType: 'post', ref: res.data.link,
    taxonomies: taxFields, unresolvedTaxonomies: unresolved.length ? unresolved : undefined,
    editUrl: `${creds.base}/wp-admin/post.php?post=${res.data.id}&action=edit`,
    message: `Blog post draft #${res.data.id} created${Object.keys(taxFields).length ? ` (${Object.entries(taxFields).map(([k,v])=>k+':'+v.join('/')).join(', ')})` : ''} — add images then publish`
      + (unresolved.length ? ` ⚠ unresolved taxonomy: ${unresolved.join('; ')}` : ''),
  });
}

// ── Resolve a WP page slug to its numeric page ID ───────────────────────────
async function resolveParentId(creds, parentSlug) {
  if (!parentSlug) return 0;
  if (typeof parentSlug === 'number') return parentSlug;
  const res = await wpFetch(creds, `/wp/v2/pages?slug=${encodeURIComponent(parentSlug)}&_fields=id,slug,link`);
  if (res.ok && Array.isArray(res.data) && res.data.length) return res.data[0].id;
  console.warn(`[resolveParentId] slug "${parentSlug}" not found — page will be created at root`);
  return 0;
}

// ── create WP PAGE draft ─────────────────────────────────────────
// Creates under /wp/v2/pages — appears in Pages menu, not Posts.
// Used for landing pages, location pages, new content pages.
// Images left as [IMAGE_PLACEHOLDER] comments for you to swap in WP.
async function handleCreatePage(creds, payload) {
  if (!payload.title || !payload.body) return fail(400, 'title and body are required');
  const meta     = buildSeoMeta(payload);
  const parentId = payload.parentId || await resolveParentId(creds, payload.wpParent) || 0;
  // Custom taxonomies (e.g. { market:['om'] }) — a NEW page needs its market term too,
  // otherwise the site can't attribute it (same requirement as create_draft).
  const { fields: taxFields, unresolved } = await buildTaxonomies(creds, payload);
  const page = {
    title: payload.title, content: payload.body, excerpt: payload.excerpt || '',
    slug: sanitizeSlug(payload.slug), status: 'draft', meta,
    parent: parentId,
    template: payload.template || '',
    ...taxFields,
  };
  const res = await wpFetch(creds, '/wp/v2/pages', { method: 'POST', body: page });
  if (!res.ok) return fail(res.status, `WP create page draft failed: ${describeError(res)}`);
  if (Object.keys(meta).length && res.data.id) {
    await wpFetch(creds, `/wp/v2/pages/${res.data.id}`, { method: 'POST', body: { meta } }).catch(() => null);
  }
  return win({
    ok: true, id: res.data.id, postType: 'page', ref: res.data.link,
    taxonomies: taxFields, unresolvedTaxonomies: unresolved.length ? unresolved : undefined,
    editUrl: `${creds.base}/wp-admin/post.php?post=${res.data.id}&action=edit`,
    message: `Page draft #${res.data.id} created under parent "${payload.wpParent || 'root'}"`
      + (Object.keys(taxFields).length ? ` (${Object.entries(taxFields).map(([k,v])=>k+':'+v.join('/')).join(', ')})` : '')
      + ' — add images then publish when ready'
      + (unresolved.length ? ` ⚠ unresolved taxonomy: ${unresolved.join('; ')}` : ''),
  });
}

// ── update existing post/page content → saves as draft ──────────
// Claude rewrites the content, it lands as a pending draft for review.
// The existing published version stays live until you hit Publish.
async function handleUpdateContent(creds, payload, brand) {
  let { postId, postType } = payload;
  if (!postId && payload.url) {
    const found = await findPostByUrl(creds, normalizeUrl(payload.url));
    if (!found) return fail(404, `No post or page matched URL: ${payload.url} — provide postId directly`);
    postId = found.id; postType = found.type;
  }
  if (!postId) return fail(400, 'postId or url required');
  if (!payload.title && !payload.body) return fail(400, 'title or body required to update content');

  // Refuse a BODY write to a non-writable page. For pages, body is writable ONLY on an
  // allowed template (journal posts are always fine); everything else renders its body
  // from blocks/ACF, so a write would CLOBBER a live page (the /ae/ homepage incident).
  if (payload.body) {
    const target = payload.url || (await wpFetch(creds, `/wp/v2/pages/${postId}?_fields=link`).then(r => r.ok ? r.data?.link : null).catch(() => null));
    const w = await bodyWritable(brand, target, creds, postId, postType);
    if (!w.ok) {
      return fail(409, `Body not writable: ${w.path || target} is a page on template "${w.template || '(unknown)'}" — its body renders from blocks/ACF, not post_content, so a write here would CLOBBER the live page (or silently do nothing on a static template). Only journal posts and template-location.php / template-product.php pages accept a body write. Update its SEO title/meta instead (those DO render).`);
    }
  }

  const endpoint = postType === 'pages' ? 'pages' : 'posts';
  // Do NOT force status here. update_content targets an EXISTING page; forcing
  // status:'draft' flipped a currently-PUBLISHED (live, ranking) page to draft → it
  // 404'd on its public URL until republished. Omitting status makes WP preserve the
  // page's current state: a published page stays live with the rewritten content (the
  // human already approved it in the queue), a draft stays a draft. Matches handleUpdateMeta.
  const updates = {};
  if (payload.title)   updates.title   = payload.title;
  if (payload.body)    updates.content  = payload.body;
  if (payload.excerpt) updates.excerpt  = payload.excerpt;
  const meta = buildSeoMeta(payload);
  if (Object.keys(meta).length) updates.meta = meta;
  // Custom taxonomies (e.g. set/repair a post's `market` term).
  const { fields: taxFields, unresolved: taxUnresolved } = await buildTaxonomies(creds, payload);
  Object.assign(updates, taxFields);

  const res = await wpFetch(creds, `/wp/v2/${endpoint}/${postId}`, { method: 'POST', body: updates });
  if (!res.ok) return fail(res.status, `WP update content failed: ${describeError(res)}`);
  return win({
    ok: true, id: postId, postType: endpoint, ref: res.data.link,
    editUrl: `${creds.base}/wp-admin/post.php?post=${postId}&action=edit`,
    taxonomies: taxFields, unresolvedTaxonomies: taxUnresolved.length ? taxUnresolved : undefined,
    message: `Content updated on ${endpoint.slice(0,-1)} #${postId} — status preserved (live pages stay live)`
      + (taxUnresolved.length ? ` ⚠ unresolved taxonomy: ${taxUnresolved.join('; ')}` : ''),
  });
}

// ── update SEO meta only ─────────────────────────────────────────
async function handleUpdateMeta(creds, payload) {
  let { postId, postType } = payload;
  if (!postId && payload.url) {
    const found = await findPostByUrl(creds, normalizeUrl(payload.url));
    if (!found) return fail(404, `No post or page matched URL: ${payload.url}`);
    postId = found.id; postType = found.type;
  }
  if (!postId) return fail(400, 'postId or url required');

  const updates = {};
  if (payload.excerpt) updates.excerpt = payload.excerpt;
  const meta = buildSeoMeta(payload);
  if (Object.keys(meta).length) updates.meta = meta;
  // NOTE: payload.title is the SEO meta title — never write it to updates.title (that's the WP post title / page name)
  if (!Object.keys(updates).length) return fail(400, 'Provide title, description, or targetKeyword');

  const endpoint = postType === 'pages' ? 'pages' : 'posts';
  const res = await wpFetch(creds, `/wp/v2/${endpoint}/${postId}`, { method: 'POST', body: updates });
  if (!res.ok) return fail(res.status, `WP meta update failed: ${describeError(res)}`);

  // Verify the meta was actually written — check both Yoast and Rank Math keys
  const verify = await wpFetch(creds, `/wp/v2/${endpoint}/${postId}?context=edit`);
  const writtenMeta  = verify.ok ? (verify.data?.meta || {}) : null;
  const writtenTitle = writtenMeta?.rank_math_title || writtenMeta?._yoast_wpseo_title || null;
  const metaWritten  = writtenTitle === payload.title;

  return win({
    ok: true, id: postId, postType: endpoint, ref: res.data.link,
    editUrl: `${creds.base}/wp-admin/post.php?post=${postId}&action=edit`,
    metaWritten,
    message: metaWritten
      ? `SEO meta updated on ${endpoint.slice(0,-1)} #${postId}`
      : `Post updated but Yoast meta was NOT written — add the WP Code snippet to enable REST API meta writes`,
  });
}

// ── get current Yoast meta for a page ──────────────────────────────
// Called by scheduler before queuing meta_update, so Claude sees what's already there.
async function handleGetCurrentMeta(creds, payload) {
  let { postId, postType } = payload;
  if (!postId && payload.url) {
    const found = await findPostByUrl(creds, normalizeUrl(payload.url));
    if (!found) return win({ found: false });
    postId = found.id; postType = found.type;
  }
  if (!postId) return fail(400, 'postId or url required');

  const endpoint = postType === 'pages' ? 'pages' : 'posts';
  const res = await wpFetch(creds, `/wp/v2/${endpoint}/${postId}?context=edit`);
  if (!res.ok) return win({ found: false });

  const m = res.data?.meta || {};
  // Check both Rank Math and Yoast — take whichever has a value (both may be installed)
  return win({
    found:        true,
    postId,
    postType:     endpoint,
    currentTitle: m.rank_math_title || m._yoast_wpseo_title || res.data?.yoast_head_json?.title || null,
    currentDesc:  m.rank_math_description || m._yoast_wpseo_metadesc || res.data?.yoast_head_json?.description || null,
    currentKw:    m.rank_math_focus_keyword || m._yoast_wpseo_focuskw || null,
    wpTitle:      res.data?.title?.rendered || null,
  });
}

// ── publish ──────────────────────────────────────────────────────
// Flips any draft post or page to published status.
// Called by "Approve & Publish" button or "publish this" Claude command.
async function handlePublish(creds, payload) {
  let { postId, postType } = payload;
  if (!postId && payload.url) {
    const found = await findPostByUrl(creds, normalizeUrl(payload.url));
    if (!found) return fail(404, `No post or page matched URL: ${payload.url}`);
    postId = found.id; postType = found.type;
  }
  if (!postId) return fail(400, 'postId required to publish');

  const endpoint = postType === 'pages' ? 'pages' : 'posts';
  const res = await wpFetch(creds, `/wp/v2/${endpoint}/${postId}`, { method: 'POST', body: { status: 'publish' } });
  if (!res.ok) return fail(res.status, `WP publish failed: ${describeError(res)}`);
  return win({
    ok: true, id: postId, postType: endpoint,
    ref: res.data.link,
    message: `Published! Live at ${res.data.link}`,
  });
}

// ── list posts + pages ───────────────────────────────────────────
async function handleListPosts(creds, body) {
  const q = body.q || '';
  const params = new URLSearchParams({ per_page: String(body.per_page || 20), status: 'publish,draft', _fields: 'id,title,link,status,date,type' });
  if (q) params.set('search', q);
  const [postsRes, pagesRes] = await Promise.all([
    wpFetch(creds, `/wp/v2/posts?${params}`),
    wpFetch(creds, `/wp/v2/pages?${params}`),
  ]);
  const normalize = (items, type) => (items || []).map(p => ({ id: p.id, title: p.title?.rendered || '', link: p.link, status: p.status, date: p.date, type }));
  const items = [
    ...normalize(postsRes.ok ? postsRes.data : [], 'posts'),
    ...normalize(pagesRes.ok ? pagesRes.data : [], 'pages'),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));
  return win({ items });
}

// ── list pages belonging to an international market (by slug tokens) ─────────
// Used by the intl meta sweep to discover ALL of a market's pages (root +
// sub-pages like /bahrain-events/, /franchise-bahrain/). Matches a token against
// whole hyphen/slash slug segments; hyphenated tokens match as substrings.

// ── list scaffolds ───────────────────────────────────────────────
// Draft pages whose body is empty/near-empty — i.e. template scaffolds waiting for
// content. Bonbird's rebuild left 12 product scaffolds as drafts (parent + template +
// slug set, empty bodies) ready for Nest to write; this is how we find them.
// payload: { tokens?: ['om','qa','pk'], template?: 'substring', maxWords?: 30 }
async function handleListScaffolds(creds, payload) {
  const tokens   = (payload.tokens || []).map(t => String(t || '').toLowerCase().trim()).filter(Boolean);
  const tplMatch = payload.template ? String(payload.template).toLowerCase() : null;
  const maxWords = Number.isFinite(payload.maxWords) ? payload.maxWords : 30;

  const found = [];
  for (let page = 1; page <= 3; page++) {
    const params = new URLSearchParams({
      per_page: '100', page: String(page), status: 'draft,pending,future,private',
      context: 'edit', _fields: 'id,slug,link,title,content,template,parent',
    });
    const res = await wpFetch(creds, `/wp/v2/pages?${params}`);
    if (!res.ok) break;
    const items = Array.isArray(res.data) ? res.data : [];
    for (const p of items) {
      const raw   = p.content?.raw ?? p.content?.rendered ?? '';
      const words = String(raw).replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
      if (words > maxWords) continue;                                  // already has a body
      const tpl = String(p.template || '');
      if (tplMatch && !tpl.toLowerCase().includes(tplMatch)) continue;
      const link = String(p.link || '');
      if (tokens.length) {
        const path = link.replace(/^https?:\/\/[^/]+/, '').toLowerCase();
        const segs = path.split('/').filter(Boolean);
        if (!tokens.some(t => segs.includes(t))) continue;             // wrong market
      }
      found.push({ id: p.id, slug: p.slug || '', link, title: p.title?.raw || p.title?.rendered || '', template: tpl, parent: p.parent || 0, words });
    }
    if (items.length < 100) break;
  }
  return win({ count: found.length, scaffolds: found, filters: { tokens, template: tplMatch, maxWords } });
}

async function handleListMarketPages(creds, payload) {
  const tokens = (payload.tokens || []).map(t => String(t || '').toLowerCase().trim()).filter(Boolean);
  if (!tokens.length) return fail(400, 'tokens required');

  const collected = [];
  for (let page = 1; page <= 3; page++) {
    const params = new URLSearchParams({ per_page: '100', page: String(page), status: 'publish', _fields: 'id,slug,link,title' });
    const res = await wpFetch(creds, `/wp/v2/pages?${params}`);
    if (!res.ok) break;
    const items = Array.isArray(res.data) ? res.data : [];
    for (const p of items) {
      collected.push({ id: p.id, slug: p.slug || '', link: p.link || '', title: p.title?.rendered || '' });
    }
    if (items.length < 100) break; // last page reached
  }

  const matchesToken = (slug) => {
    const s = String(slug || '').toLowerCase();
    const segs = s.split(/[-/]/).filter(Boolean);
    return tokens.some(tok => (tok.includes('-') ? s.includes(tok) : segs.includes(tok)));
  };
  const matched = collected.filter(p => matchesToken(p.slug));
  return win({ total: collected.length, matched, tokens });
}

// ── get single post/page ─────────────────────────────────────────
async function handleGetPost(creds, body) {
  if (!body.postId) return fail(400, 'postId required');
  let res = await wpFetch(creds, `/wp/v2/posts/${body.postId}?context=edit`);
  if (!res.ok) res = await wpFetch(creds, `/wp/v2/pages/${body.postId}?context=edit`);
  if (!res.ok) return fail(res.status, `WP get failed: ${describeError(res)}`);
  return win({ post: res.data });
}

// Read a post/page's revision history (authed, server-side). Read-only recovery aid.
async function handleGetRevisions(creds, payload) {
  const { postId } = payload;
  if (!postId) return fail(400, 'postId required');
  const type = payload.postType === 'post' ? 'posts' : 'pages';
  const res = await wpFetch(creds, `/wp/v2/${type}/${postId}/revisions?per_page=10&context=edit&_fields=id,modified,content,title`);
  if (!res.ok) return fail(res.status, `WP revisions get failed: ${describeError(res)}`);
  const revs = (Array.isArray(res.data) ? res.data : []).map(r => ({
    id: r.id, modified: r.modified,
    contentLen: (r.content?.raw ?? r.content?.rendered ?? '').length,
    content: r.content?.raw ?? r.content?.rendered ?? '',
  }));
  return win({ postId, count: revs.length, revisions: revs });
}

// ── shared helpers ───────────────────────────────────────────────
function buildSeoMeta(p) {
  const meta = {};
  // metaTitle takes priority over title — international pipeline stores SEO title in metaTitle,
  // while title is the approval card display name (e.g. "Meta update — Bahrain EN landing page")
  const seoTitle = p.metaTitle || p.title || null;
  const seoDesc  = p.metaDescription || p.description || null;
  const seoKw    = p.focusKeyword || p.targetKeyword || null;
  if (seoTitle) { meta._yoast_wpseo_title = seoTitle;  meta.rank_math_title = seoTitle;       meta._seopress_titles_title = seoTitle; }
  if (seoDesc)  { meta._yoast_wpseo_metadesc = seoDesc; meta.rank_math_description = seoDesc; meta._seopress_titles_desc = seoDesc; }
  if (seoKw)    { meta._yoast_wpseo_focuskw = seoKw;   meta.rank_math_focus_keyword = seoKw; }
  if (p.schema) { meta._seo_custom_schema = typeof p.schema === 'string' ? p.schema : JSON.stringify(p.schema); }
  return meta;
}

function normalizeUrl(url) {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  return 'https://' + url.replace(/^\/+/, '');
}

function sanitizeSlug(slug) {
  if (!slug) return undefined;
  return slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

async function findPostByUrl(creds, url) {
  let slug, expectedPath;
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    slug = parts[parts.length - 1];
    expectedPath = u.pathname.toLowerCase().replace(/\/+$/, '');
  } catch (_) {
    slug = url.replace(/\/+$/, '').split('/').filter(Boolean).pop();
  }
  if (!slug) return null;

  const fields = '_fields=id,link,slug,type';
  for (const [type, endpoint] of [['posts', 'posts'], ['pages', 'pages']]) {
    const res = await wpFetch(creds, `/wp/v2/${endpoint}?slug=${encodeURIComponent(slug)}&${fields}`);
    if (!res.ok || !Array.isArray(res.data) || !res.data.length) continue;
    // If we have an expected path, prefer the result whose canonical link matches it.
    // This prevents cross-market slug collisions (e.g. /ksa/best-burger vs /bh/best-burger).
    let match;
    if (expectedPath && res.data.length > 1) {
      match = res.data.find(p => {
        try { return new URL(p.link).pathname.toLowerCase().replace(/\/+$/, '') === expectedPath; }
        catch { return false; }
      });
      // Multiple results, none matching the expected path → do NOT guess data[0]
      // (would target the wrong market's page for a shared slug). Skip this endpoint.
      if (!match) {
        console.warn(`[findPostByUrl] slug "${slug}" → ${res.data.length} results, none matched ${expectedPath} — skipping`);
        continue;
      }
    }
    // Single result: verify it's actually the right page before returning
    if (!match && res.data.length === 1 && expectedPath) {
      try {
        const linkPath = new URL(res.data[0].link).pathname.toLowerCase().replace(/\/+$/, '');
        if (linkPath !== expectedPath) {
          console.warn(`[findPostByUrl] slug match "${slug}" → wrong page (${linkPath} ≠ ${expectedPath}) — skipping`);
          continue;
        }
      } catch (_) {}
    }
    const best = match || res.data[0];
    return { ...best, type: endpoint };
  }
  return null;
}

function describeError(res) {
  if (!res.data) return `HTTP ${res.status}`;
  if (res.data.message) return res.data.message;
  if (res.data.code)    return `${res.data.code} (HTTP ${res.status})`;
  return `HTTP ${res.status}`;
}

function win(body)        { return { statusCode: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS), body: JSON.stringify(body) }; }
function fail(status, msg){ return { statusCode: status, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS), body: JSON.stringify({ error: msg }) }; }
