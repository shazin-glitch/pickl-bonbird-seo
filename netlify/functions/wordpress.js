// netlify/functions/wordpress.js
// WordPress REST API integration for Pickl (eatpickl.com) and Bonbird (bonbirdchicken.com).
// Both are self-hosted on WP Engine. We auth with Application Passwords —
// generated in WP admin → Users → Profile → Application Passwords.
//
// REQUIRED env vars (per brand):
//   WP_PICKL_BASE       e.g. "https://eatpickl.com"
//   WP_PICKL_USER       admin username
//   WP_PICKL_APP_PASS   the application password (spaces or no-spaces both fine)
//   WP_BONBIRD_BASE     "https://bonbirdchicken.com"
//   WP_BONBIRD_USER
//   WP_BONBIRD_APP_PASS
//
// Endpoints exposed:
//   POST /api/wordpress  body:
//     { action: 'create_draft',  brand, payload }   -> creates a draft post
//     { action: 'update_meta',   brand, payload }   -> updates title/desc/etc on existing post
//     { action: 'list_posts',    brand, q? }        -> search posts (helps the UI pick a post)
//     { action: 'get_post',      brand, postId }
//     { action: 'test',          brand }            -> ping /wp/v2/users/me
//
// Meta updates support Yoast SEO (`_yoast_wpseo_title` / `_yoast_wpseo_metadesc`)
// and Rank Math (`rank_math_title` / `rank_math_description`) — we write both
// keys so it works regardless of which plugin is installed. WordPress core
// also stores the post title and excerpt natively, which we update too.
//
// All push payloads are validated server-side. We never trust the queue blindly:
// e.g. blog drafts are forced to `status: 'draft'` even if payload says otherwise.

const { ok, bad, preflight, parseBody } = require('./_lib/store');

const BRAND_ENV = {
  pickl: {
    base: 'WP_PICKL_BASE',
    user: 'WP_PICKL_USER',
    pass: 'WP_PICKL_APP_PASS'
  },
  bonbird: {
    base: 'WP_BONBIRD_BASE',
    user: 'WP_BONBIRD_USER',
    pass: 'WP_BONBIRD_APP_PASS'
  }
};

function getCreds(brand) {
  const cfg = BRAND_ENV[brand];
  if (!cfg) return null;
  const base = process.env[cfg.base];
  const user = process.env[cfg.user];
  const pass = process.env[cfg.pass];
  if (!base || !user || !pass) {
    return { error: `WordPress credentials not set for ${brand} — set ${cfg.base}, ${cfg.user}, ${cfg.pass} in Netlify env vars` };
  }
  return {
    base: base.replace(/\/$/, ''),
    auth: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
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
      'Accept': 'application/json'
    }, opts.headers || {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let data;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    data = await res.json().catch(() => null);
  } else {
    data = { raw: await res.text() };
  }
  return { ok: res.ok, status: res.status, data };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  if (event.httpMethod !== 'POST') return bad(405, 'Method Not Allowed');

  const body = parseBody(event);
  if (body === null) return bad(400, 'Invalid JSON');

  const { action, brand } = body;
  if (!brand || !BRAND_ENV[brand]) return bad(400, 'brand must be "pickl" or "bonbird"');

  const credsOrError = getCreds(brand);
  if (credsOrError && credsOrError.error) return bad(503, credsOrError.error);
  const creds = credsOrError;

  try {
    switch (action) {
      case 'test':            return await handleTest(creds);
      case 'create_draft':    return await handleCreateDraft(creds, body.payload || {});
      case 'update_meta':     return await handleUpdateMeta(creds, body.payload || {});
      case 'list_posts':      return await handleListPosts(creds, body);
      case 'get_post':        return await handleGetPost(creds, body);
      default:                return bad(400, `unknown action: ${action}`);
    }
  } catch (err) {
    console.error('wordpress error', err);
    return bad(500, err.message || 'wordpress error');
  }
};

// ---- handlers ---------------------------------------------------------------

async function handleTest(creds) {
  const res = await wpFetch(creds, '/wp/v2/users/me?context=edit');
  if (!res.ok) {
    return bad(res.status, `WP test failed: ${res.data?.message || res.status}`);
  }
  return ok({
    ok: true,
    user: { id: res.data.id, name: res.data.name, slug: res.data.slug },
    capabilities: res.data.capabilities ? Object.keys(res.data.capabilities).filter(k => res.data.capabilities[k]) : []
  });
}

async function handleCreateDraft(creds, payload) {
  // Required: title + body (HTML).
  if (!payload.title || !payload.body) {
    return bad(400, 'title and body are required for a blog draft');
  }

  const meta = buildSeoMeta(payload);
  const post = {
    title: payload.title,
    content: payload.body,
    excerpt: payload.excerpt || '',
    slug: payload.slug || undefined,
    status: 'draft', // FORCED — never publish from the queue
    meta: meta,
    categories: payload.categoryIds || undefined,
    tags: payload.tagIds || undefined
  };

  const res = await wpFetch(creds, '/wp/v2/posts', { method: 'POST', body: post });
  if (!res.ok) {
    return bad(res.status, `WP create draft failed: ${describeWpError(res)}`);
  }

  // Some hosts/plugins refuse to set custom meta in the create call. Patch it.
  if (Object.keys(meta).length) {
    await wpFetch(creds, `/wp/v2/posts/${res.data.id}`, {
      method: 'POST',
      body: { meta }
    }).catch(() => null);
  }

  return ok({
    ok: true,
    id: res.data.id,
    ref: res.data.link,
    editUrl: `${creds.base}/wp-admin/post.php?post=${res.data.id}&action=edit`,
    message: `Draft created (#${res.data.id})`
  });
}

async function handleUpdateMeta(creds, payload) {
  // Either postId is given, OR url is given and we look it up
  let postId = payload.postId;
  if (!postId && payload.url) {
    const found = await findPostByUrl(creds, payload.url);
    if (!found) return bad(404, `no WP post matches URL: ${payload.url}`);
    postId = found.id;
  }
  if (!postId) return bad(400, 'postId or url required');

  const updates = {};
  if (payload.title) updates.title = payload.title;
  if (payload.excerpt) updates.excerpt = payload.excerpt;
  if (payload.content) updates.content = payload.content;
  // SEO plugin fields
  const meta = buildSeoMeta(payload);
  if (Object.keys(meta).length) updates.meta = meta;

  if (!Object.keys(updates).length) {
    return bad(400, 'nothing to update — pass title/excerpt/content/description');
  }

  const res = await wpFetch(creds, `/wp/v2/posts/${postId}`, {
    method: 'POST',
    body: updates
  });
  if (!res.ok) {
    return bad(res.status, `WP update failed: ${describeWpError(res)}`);
  }

  return ok({
    ok: true,
    id: postId,
    ref: res.data.link,
    editUrl: `${creds.base}/wp-admin/post.php?post=${postId}&action=edit`,
    message: `Updated post #${postId}`
  });
}

async function handleListPosts(creds, body) {
  const q = body.q || '';
  const params = new URLSearchParams({
    per_page: String(body.per_page || 20),
    status: body.status || 'publish,draft',
    _fields: 'id,title,link,status,date'
  });
  if (q) params.set('search', q);
  const res = await wpFetch(creds, `/wp/v2/posts?${params.toString()}`);
  if (!res.ok) return bad(res.status, `WP list failed: ${describeWpError(res)}`);
  const items = (res.data || []).map(p => ({
    id: p.id,
    title: p.title?.rendered || '',
    link: p.link,
    status: p.status,
    date: p.date
  }));
  return ok({ items });
}

async function handleGetPost(creds, body) {
  if (!body.postId) return bad(400, 'postId required');
  const res = await wpFetch(creds, `/wp/v2/posts/${body.postId}?context=edit`);
  if (!res.ok) return bad(res.status, `WP get failed: ${describeWpError(res)}`);
  return ok({ post: res.data });
}

// ---- helpers ----------------------------------------------------------------

function buildSeoMeta(p) {
  const meta = {};
  // Yoast
  if (p.title)       meta._yoast_wpseo_title = p.title;
  if (p.description) meta._yoast_wpseo_metadesc = p.description;
  if (p.targetKeyword) meta._yoast_wpseo_focuskw = p.targetKeyword;
  // Rank Math
  if (p.title)       meta.rank_math_title = p.title;
  if (p.description) meta.rank_math_description = p.description;
  if (p.targetKeyword) meta.rank_math_focus_keyword = p.targetKeyword;
  // SEOPress (a third common option, keeping the door open)
  if (p.title)       meta._seopress_titles_title = p.title;
  if (p.description) meta._seopress_titles_desc = p.description;
  // JSON-LD if a custom schema field is being used
  if (p.schema) meta._seo_custom_schema = typeof p.schema === 'string' ? p.schema : JSON.stringify(p.schema);
  return meta;
}

async function findPostByUrl(creds, url) {
  // WP gives us a slug-based lookup. Extract slug from URL.
  let slug;
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/\/+$/, '').split('/');
    slug = parts[parts.length - 1];
  } catch (_) {
    slug = url.replace(/\/+$/, '').split('/').pop();
  }
  if (!slug) return null;
  const res = await wpFetch(creds, `/wp/v2/posts?slug=${encodeURIComponent(slug)}&_fields=id,link,slug`);
  if (!res.ok || !Array.isArray(res.data) || !res.data.length) {
    // Try pages too
    const r2 = await wpFetch(creds, `/wp/v2/pages?slug=${encodeURIComponent(slug)}&_fields=id,link,slug`);
    if (r2.ok && Array.isArray(r2.data) && r2.data.length) return r2.data[0];
    return null;
  }
  return res.data[0];
}

function describeWpError(res) {
  if (!res.data) return `HTTP ${res.status}`;
  if (res.data.message) return res.data.message;
  if (res.data.code) return `${res.data.code} (HTTP ${res.status})`;
  return `HTTP ${res.status}`;
}
