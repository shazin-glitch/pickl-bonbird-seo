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
//   update_content  rewrite content of existing post/page, saves as draft  ← new
//   update_meta     update SEO title/description only
//   publish         flip draft → published  ← new: triggered by "Approve & Publish"
//   list_posts      search posts + pages
//   get_post        get single item by ID

const { authorize } = require('./_lib/auth');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Cookie, x-nest-internal',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BRAND_ENV = {
  pickl:   { base: 'WP_PICKL_BASE',   user: 'WP_PICKL_USER',   pass: 'WP_PICKL_APP_PASS' },
  bonbird: { base: 'WP_BONBIRD_BASE', user: 'WP_BONBIRD_USER', pass: 'WP_BONBIRD_APP_PASS' },
};

function getCreds(brand) {
  const cfg = BRAND_ENV[brand];
  if (!cfg) return null;
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
  if (!brand || !BRAND_ENV[brand]) return fail(400, 'brand must be "pickl" or "bonbird"');
  const creds = getCreds(brand);
  if (creds && creds.error) return fail(503, creds.error);
  try {
    switch (action) {
      case 'test':           return await handleTest(creds);
      case 'create_draft':   return await handleCreateDraft(creds, body.payload || {});
      case 'create_page':    return await handleCreatePage(creds, body.payload || {});
      case 'update_content': return await handleUpdateContent(creds, body.payload || {});
      case 'update_meta':      return await handleUpdateMeta(creds, body.payload || {});
      case 'get_current_meta': return await handleGetCurrentMeta(creds, body.payload || {});
      case 'publish':          return await handlePublish(creds, body.payload || {});
      case 'list_posts':       return await handleListPosts(creds, body);
      case 'list_market_pages': return await handleListMarketPages(creds, body.payload || {});
      case 'get_post':         return await handleGetPost(creds, body);
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
  return win({ ok: true, user: { id: res.data.id, name: res.data.name }, message: `Connected as ${res.data.name}` });
}

// ── create blog POST draft ───────────────────────────────────────
async function handleCreateDraft(creds, payload) {
  if (!payload.title || !payload.body) return fail(400, 'title and body are required');
  const meta = buildSeoMeta(payload);
  const post = {
    title: payload.title, content: payload.body, excerpt: payload.excerpt || '',
    slug: sanitizeSlug(payload.slug), status: 'draft', meta,
    categories: payload.categoryIds || undefined,
    tags: payload.tagIds || undefined,
  };
  const res = await wpFetch(creds, '/wp/v2/posts', { method: 'POST', body: post });
  if (!res.ok) return fail(res.status, `WP create post draft failed: ${describeError(res)}`);
  if (Object.keys(meta).length && res.data.id) {
    await wpFetch(creds, `/wp/v2/posts/${res.data.id}`, { method: 'POST', body: { meta } }).catch(() => null);
  }
  return win({
    ok: true, id: res.data.id, postType: 'post', ref: res.data.link,
    editUrl: `${creds.base}/wp-admin/post.php?post=${res.data.id}&action=edit`,
    message: `Blog post draft #${res.data.id} created — add images then publish`,
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
  const page = {
    title: payload.title, content: payload.body, excerpt: payload.excerpt || '',
    slug: sanitizeSlug(payload.slug), status: 'draft', meta,
    parent: parentId,
    template: payload.template || '',
  };
  const res = await wpFetch(creds, '/wp/v2/pages', { method: 'POST', body: page });
  if (!res.ok) return fail(res.status, `WP create page draft failed: ${describeError(res)}`);
  if (Object.keys(meta).length && res.data.id) {
    await wpFetch(creds, `/wp/v2/pages/${res.data.id}`, { method: 'POST', body: { meta } }).catch(() => null);
  }
  return win({
    ok: true, id: res.data.id, postType: 'page', ref: res.data.link,
    editUrl: `${creds.base}/wp-admin/post.php?post=${res.data.id}&action=edit`,
    message: `Page draft #${res.data.id} created under parent "${payload.wpParent || 'root'}" — add images then publish when ready`,
  });
}

// ── update existing post/page content → saves as draft ──────────
// Claude rewrites the content, it lands as a pending draft for review.
// The existing published version stays live until you hit Publish.
async function handleUpdateContent(creds, payload) {
  let { postId, postType } = payload;
  if (!postId && payload.url) {
    const found = await findPostByUrl(creds, normalizeUrl(payload.url));
    if (!found) return fail(404, `No post or page matched URL: ${payload.url} — provide postId directly`);
    postId = found.id; postType = found.type;
  }
  if (!postId) return fail(400, 'postId or url required');
  if (!payload.title && !payload.body) return fail(400, 'title or body required to update content');

  const endpoint = postType === 'pages' ? 'pages' : 'posts';
  const updates = { status: 'draft' }; // always save as draft — never auto-publish
  if (payload.title)   updates.title   = payload.title;
  if (payload.body)    updates.content  = payload.body;
  if (payload.excerpt) updates.excerpt  = payload.excerpt;
  const meta = buildSeoMeta(payload);
  if (Object.keys(meta).length) updates.meta = meta;

  const res = await wpFetch(creds, `/wp/v2/${endpoint}/${postId}`, { method: 'POST', body: updates });
  if (!res.ok) return fail(res.status, `WP update content failed: ${describeError(res)}`);
  return win({
    ok: true, id: postId, postType: endpoint, ref: res.data.link,
    editUrl: `${creds.base}/wp-admin/post.php?post=${postId}&action=edit`,
    message: `Content updated on ${endpoint.slice(0,-1)} #${postId} — saved as draft`,
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
