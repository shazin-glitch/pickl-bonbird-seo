// netlify/functions/calendar.js
// Content Calendar — social media post planning, approval workflow, SocialPilot push.
//
// GET  ?brand=&month=YYYY-MM  — list posts (filtered by month, market, platform, status)
// GET  ?id=<postId>           — single post with full details
// POST { action, ... }        — create | update | submit | approve | request_changes |
//                               comment | resolve_comment | delete | push_socialpilot | mark_published
//
// Post lifecycle: draft → in_review → changes_requested ↔ in_review → approved → scheduled → published
//
// Blobs: calendarPost:<id>, calendarIndex:<brand>, calendarMedia:<mediaId>, calendarMediaMeta:<mediaId>

const { getStore } = require('@netlify/blobs');
const { newId, ok, bad, preflight, parseBody, CORS } = require('./_lib/store');
const { authorize, denied, internalHeaders } = require('./_lib/auth');
const { getBrandSlugs } = require('./_lib/brands-config');

const SITE_URL = process.env.URL || 'https://yolkseo.netlify.app';

// ── Market timezone map (IANA) ────────────────────────────────────────────────
// All scheduled times are stored as the LOCAL time for that market.
// When pushing to SocialPilot, convert to UTC using this map.
// ⚠️ ADDING A NEW MARKET? You MUST add its IANA timezone here.
//    Full list: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
const MARKET_TIMEZONES = {
  UAE:      'Asia/Dubai',     // UTC+4, no DST
  KSA:      'Asia/Riyadh',    // UTC+3, no DST
  Bahrain:  'Asia/Bahrain',   // UTC+3, no DST
  Qatar:    'Asia/Qatar',     // UTC+3, no DST
  Egypt:    'Africa/Cairo',   // UTC+2, no DST (Egypt stopped DST 2015)
  Jordan:   'Asia/Amman',     // UTC+3, no DST (Jordan stopped DST 2022)
  Oman:     'Asia/Muscat',    // UTC+4, no DST
  Pakistan: 'Asia/Karachi',   // UTC+5, no DST
  UK:       'Europe/London',  // UTC+0 winter / UTC+1 summer — DST auto-handled
};

// Convert "YYYY-MM-DD HH:MM" local market time → UTC Unix timestamp
// Uses a two-pass Intl trick that handles DST correctly without external packages.
function marketLocalToUnix(dateStr, timeStr, market) {
  const tz = MARKET_TIMEZONES[market] || 'Asia/Dubai';
  const [year, month, day]   = dateStr.split('-').map(Number);
  const [hour, minute]       = (timeStr || '10:00').split(':').map(Number);
  const approxMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  // Format that UTC epoch in the target timezone to find out the offset
  const tzStr = new Date(approxMs).toLocaleString('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const [datePart, timePart] = tzStr.split(', ');
  const tzMs = new Date(`${datePart}T${timePart}Z`).getTime();
  // Formula: actual UTC = 2 × approxMs − tzMs  (mathematically eliminates the offset)
  return Math.floor((2 * approxMs - tzMs) / 1000);
}

function getS() {
  return getStore({
    name:   'seo-tool',
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });
}

async function getIndex(s, brand) {
  return (await s.get(`calendarIndex:${brand}`, { type: 'json' }).catch(() => null)) || [];
}
async function saveIndex(s, brand, ids) { await s.setJSON(`calendarIndex:${brand}`, ids); }
async function getPost(s, id) { return s.get(`calendarPost:${id}`, { type: 'json' }).catch(() => null); }
async function savePost(s, post) { await s.setJSON(`calendarPost:${post.id}`, post); }

async function notifySlack(type, data) {
  try {
    await fetch(`${SITE_URL}/.netlify/functions/slack-notify`, {
      method: 'POST',
      headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ type, ...data }),
    });
  } catch (e) { console.warn('[calendar] Slack notify failed:', e.message); }
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  const s = getS();

  // Auth gate on ALL methods (#11): GET returns the whole social calendar (captions,
  // media URLs, approver emails, all brands/markets) — gate it, not just POST.
  // slack-callback (calendar approve) passes x-nest-internal; browser uses session.
  const auth = await authorize(event);
  if (!auth.ok) return denied();

  // ── GET ───────────────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const q = event.queryStringParameters || {};

    if (q.id) {
      const post = await getPost(s, q.id);
      if (!post) return bad(404, 'Post not found');
      return ok(post);
    }

    // List — pending_my_approval shortcut for badge count
    if (q.pending_approver) {
      const email = q.pending_approver;
      const allBrands = await getBrandSlugs();
      let total = 0;
      for (const brand of allBrands) {
        const ids   = await getIndex(s, brand);
        const posts = (await Promise.all(ids.map(id => getPost(s, id)))).filter(Boolean);
        total += posts.filter(p =>
          p.status === 'in_review' &&
          (p.requiredApprovers || []).some(a => a.email === email) &&
          !(p.approvals || []).some(a => a.email === email)
        ).length;
      }
      return ok({ count: total });
    }

    // Hashtag presets
    if (q.hashtag_presets && q.brand) {
      const presets = await s.get(`calHashtagPresets:${q.brand}`, { type: 'json' }).catch(() => []) || [];
      return ok({ presets });
    }

    // SocialPilot connection test
    if (q.sp_test === '1') {
      const apiKey = process.env.SOCIALPILOT_API_KEY;
      if (!apiKey) return ok({ ok: false, error: 'SOCIALPILOT_API_KEY not set in Netlify env vars' });
      // Just confirm the key is present — actual push will validate it against the real API
      return ok({ ok: true, message: `API key configured (${apiKey.length} chars)` });
    }

    const brand = q.brand;
    if (!brand) return bad(400, 'brand required');

    const ids   = await getIndex(s, brand);
    const posts = (await Promise.all(ids.map(id => getPost(s, id)))).filter(Boolean);

    let filtered = posts;
    if (q.month)    filtered = filtered.filter(p => p.scheduledDate?.startsWith(q.month));
    if (q.market)   filtered = filtered.filter(p => p.market === q.market);
    if (q.platform) filtered = filtered.filter(p => (p.platforms || []).includes(q.platform));
    if (q.status)   filtered = filtered.filter(p => p.status === q.status);

    return ok({
      posts: filtered.sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || '')),
    });
  }

  // ── POST ──────────────────────────────────────────────────────────────────
  if (event.httpMethod !== 'POST') return bad(405, 'Method not allowed');

  const body = parseBody(event);
  if (!body) return bad(400, 'Invalid JSON');

  const { action } = body;
  // Prefer the verified session identity over client-supplied values so the
  // calendar approver model + audit trail can't be forged. Internal/service
  // calls keep their stated actor (e.g. Slack approvals).
  const actor      = auth.via === 'session' ? (auth.user.name || auth.user.email) : (body.actor || 'system');
  const actorEmail = auth.via === 'session' ? auth.user.email : (body.actorEmail || '');
  const now        = new Date().toISOString();

  // ── create ────────────────────────────────────────────────────────────────
  if (action === 'create') {
    const { brand, market, platforms, postType, scheduledDate, scheduledTime,
            caption, hashtags, visualNotes, videoUrl, imageUrl, mediaFiles,
            assignedTo, assignedName, requiredApprovers } = body;
    if (!brand)         return bad(400, 'brand required');
    if (!scheduledDate) return bad(400, 'scheduledDate required');

    const id = newId('cal');
    const post = {
      id, brand, market: market || 'UAE',
      platforms: platforms || [],
      postType:  postType  || 'static',
      status:    'draft',
      scheduledDate,
      scheduledTime: scheduledTime || '10:00',
      caption:    caption    || '',
      hashtags:   hashtags   || '',
      visualNotes: visualNotes || '',
      videoUrl:   videoUrl   || '',
      imageUrl:   imageUrl   || '',
      mediaFiles: mediaFiles || [],
      assignedTo:   assignedTo   || actorEmail,
      assignedName: assignedName || actor,
      requiredApprovers: requiredApprovers || [],
      approvals: [],
      comments:  [],
      socialPilotPostId: null,
      createdAt: now, updatedAt: now,
      createdBy: actorEmail, createdByName: actor,
      history: [{ at: now, actor, action: 'created' }],
    };

    await savePost(s, post);
    const idx = await getIndex(s, brand);
    idx.unshift(id);
    if (idx.length > 1000) idx.length = 1000;
    await saveIndex(s, brand, idx);
    return ok({ ok: true, post });
  }

  // ── hashtag presets ───────────────────────────────────────────────────────────
  if (action === 'save_hashtag_preset') {
    const { brand, name, hashtags: ht } = body;
    if (!brand || !name) return bad(400, 'brand and name required');
    const presets = await s.get(`calHashtagPresets:${brand}`, { type: 'json' }).catch(() => []) || [];
    presets.push({ id: newId('htp'), name, hashtags: ht || '', createdAt: now });
    await s.setJSON(`calHashtagPresets:${brand}`, presets);
    return ok({ ok: true, presets });
  }
  if (action === 'delete_hashtag_preset') {
    const { brand, presetId } = body;
    if (!brand || !presetId) return bad(400, 'brand and presetId required');
    const presets = (await s.get(`calHashtagPresets:${brand}`, { type: 'json' }).catch(() => [])) || [];
    await s.setJSON(`calHashtagPresets:${brand}`, presets.filter(p => p.id !== presetId));
    return ok({ ok: true });
  }

  // Helper: get best preview image for a post (imageUrl or first carousel slide)
  function postPreviewImage(p) {
    if (p.imageUrl) return p.imageUrl;
    const slides = p.mediaFiles || [];
    return slides.find(f => f.url)?.url || '';
  }

  // ── submit_calendar — submit all drafts + send one Slack summary ──────────
  if (action === 'submit_calendar') {
    const { ids, brand: calBrand, market: calMarket, month: calMonth } = body;
    if (!ids?.length) return bad(400, 'ids required');
    let submitted = 0;
    for (const postId of ids) {
      const p = await getPost(s, postId);
      if (!p || !['draft','changes_requested'].includes(p.status)) continue;
      const updated = { ...p, status: 'in_review', updatedAt: now,
        history: [...(p.history || []), { at: now, actor, action: 'submitted_for_review' }] };
      await savePost(s, updated);
      submitted++;
    }
    // One Slack notification for the whole calendar
    await notifySlack('calendar_submitted', {
      brand: calBrand, market: calMarket, month: calMonth,
      count: submitted, submittedBy: actor,
      presentUrl: `${SITE_URL}/?tab=calendar&brand=${encodeURIComponent(calBrand || '')}&market=${encodeURIComponent(calMarket || '')}`,
    });
    return ok({ ok: true, submitted });
  }

  // ── bulk_submit — submit multiple posts for review at once ──────────────────
  if (action === 'bulk_submit') {
    const { ids } = body;
    if (!ids?.length) return bad(400, 'ids required');
    let submitted = 0;
    for (const postId of ids) {
      const p = await getPost(s, postId);
      if (!p || !['draft','changes_requested'].includes(p.status)) continue;
      const updated = { ...p, status: 'in_review', updatedAt: now,
        history: [...(p.history || []), { at: now, actor, action: 'submitted_for_review' }] };
      await savePost(s, updated);
      submitted++;
    }
    return ok({ ok: true, submitted });
  }

  // ── bulk_reschedule — change scheduled date/time for multiple posts ─────────
  if (action === 'bulk_reschedule') {
    const { ids, scheduledDate, scheduledTime } = body;
    if (!ids?.length) return bad(400, 'ids required');
    if (!scheduledDate) return bad(400, 'scheduledDate required');
    let rescheduled = 0;
    for (const postId of ids) {
      const p = await getPost(s, postId);
      if (!p) continue;
      const patch = { scheduledDate, updatedAt: now,
        history: [...(p.history || []), { at: now, actor, action: 'rescheduled',
          note: `Moved to ${scheduledDate}${scheduledTime ? ' ' + scheduledTime : ''}` }] };
      if (scheduledTime !== undefined) patch.scheduledTime = scheduledTime;
      await savePost(s, { ...p, ...patch });
      rescheduled++;
    }
    return ok({ ok: true, rescheduled });
  }

  // All remaining actions need an existing post
  const { id } = body;
  if (!id) return bad(400, 'id required');
  const post = await getPost(s, id);
  if (!post) return bad(404, 'Post not found');

  // ── update ────────────────────────────────────────────────────────────────
  if (action === 'update') {
    const fields = ['platforms','postType','scheduledDate','scheduledTime','market',
                    'caption','hashtags','visualNotes','videoUrl','imageUrl','mediaFiles',
                    'assignedTo','assignedName','requiredApprovers'];
    const patch  = {};
    for (const k of fields) if (k in body) patch[k] = body[k];
    patch.updatedAt = now;
    patch.history = [...(post.history || []), { at: now, actor, action: 'updated' }];
    const updated = { ...post, ...patch };
    await savePost(s, updated);
    return ok({ ok: true, post: updated });
  }

  // ── submit for review ─────────────────────────────────────────────────────
  if (action === 'submit') {
    if (!['draft', 'changes_requested'].includes(post.status))
      return bad(400, `Cannot submit from status: ${post.status}`);

    // Reset approvals when resubmitting after changes_requested
    const resetApprovals = post.status === 'changes_requested';
    const updated = { ...post, status: 'in_review', updatedAt: now,
      approvals: resetApprovals ? [] : (post.approvals || []),
      history: [...(post.history || []), { at: now, actor, action: 'submitted_for_review',
        note: resetApprovals ? 'Resubmitted after changes — approvals reset' : '' }] };
    await savePost(s, updated);

    // Per-post Slack removed — notifications now sent via "Submit Calendar" bulk action only
    return ok({ ok: true, post: updated });
  }

  // ── revert_to_draft — allow editing approved posts ───────────────────────
  if (action === 'revert_to_draft') {
    const updated = { ...post,
      status: 'draft', approvals: [], updatedAt: now,
      history: [...(post.history || []), { at: now, actor, action: 'reverted_to_draft',
        note: 'Reverted to draft for editing' }] };
    await savePost(s, updated);
    return ok({ ok: true, post: updated });
  }

  // ── approve ───────────────────────────────────────────────────────────────
  if (action === 'approve') {
    if (post.status !== 'in_review') return bad(400, 'Post is not in review');

    const existingApprovals = post.approvals || [];
    if (existingApprovals.some(a => a.email === actorEmail))
      return bad(400, 'Already approved by this user');

    const approvals = [...existingApprovals,
      { email: actorEmail, name: actor, approvedAt: now, comment: body.comment || '' }];

    const allApproved = (post.requiredApprovers || []).length === 0 ||
      (post.requiredApprovers || []).every(req => approvals.some(a => a.email === req.email));

    const newStatus = allApproved ? 'approved' : 'in_review';
    const updated = { ...post, approvals, status: newStatus, updatedAt: now,
      history: [...(post.history || []), {
        at: now, actor, action: allApproved ? 'fully_approved' : 'approved_partial',
        note: body.comment || '',
      }] };
    await savePost(s, updated);

    if (allApproved) {
      await notifySlack('calendar_approved', {
        brand: post.brand, market: post.market, postId: id,
        caption: (post.caption || '').slice(0, 120),
        scheduledDate: post.scheduledDate, approvedBy: actor,
        platforms: post.platforms || [], postType: post.postType || 'static',
        imageUrl: postPreviewImage(post),
        slideCount: post.postType === 'carousel' ? (post.mediaFiles||[]).filter(f=>f.url).length : null,
      });
    }
    return ok({ ok: true, post: updated, allApproved });
  }

  // ── request changes ───────────────────────────────────────────────────────
  if (action === 'request_changes') {
    if (post.status !== 'in_review') return bad(400, 'Post is not in review');
    const text = (body.comment || '').trim();
    if (!text) return bad(400, 'comment required when requesting changes');

    const cmt = { id: newId('cmt'), author: actor, email: actorEmail,
      text, createdAt: now, resolved: false, type: 'change_request' };
    const updated = { ...post,
      status: 'changes_requested', approvals: [], updatedAt: now,
      comments:  [...(post.comments  || []), cmt],
      history:   [...(post.history   || []), { at: now, actor, action: 'changes_requested', note: text }],
    };
    await savePost(s, updated);

    await notifySlack('calendar_changes_requested', {
      brand: post.brand, market: post.market, postId: id,
      caption: (post.caption || '').slice(0, 120),
      scheduledDate: post.scheduledDate,
      requestedBy: actor, assignedTo: post.assignedName, comment: text,
      platforms: post.platforms || [], postType: post.postType || 'static',
      imageUrl: postPreviewImage(post),
      slideCount: post.postType === 'carousel' ? (post.mediaFiles||[]).filter(f=>f.url).length : null,
    });
    return ok({ ok: true, post: updated });
  }

  // ── add comment ───────────────────────────────────────────────────────────
  if (action === 'comment') {
    const text = (body.text || '').trim();
    if (!text) return bad(400, 'text required');
    const cmt = { id: newId('cmt'), author: actor, email: actorEmail,
      text, createdAt: now, resolved: false };
    const updated = { ...post,
      comments: [...(post.comments || []), cmt], updatedAt: now };
    await savePost(s, updated);
    return ok({ ok: true, post: updated });
  }

  // ── resolve comment ───────────────────────────────────────────────────────
  if (action === 'resolve_comment') {
    const comments = (post.comments || []).map(c =>
      c.id === body.commentId ? { ...c, resolved: true } : c);
    const updated = { ...post, comments, updatedAt: now };
    await savePost(s, updated);
    return ok({ ok: true, post: updated });
  }

  // ── delete ────────────────────────────────────────────────────────────────
  if (action === 'delete') {
    // Delete all associated media blobs first
    for (const f of (post.mediaFiles || [])) {
      await Promise.all([
        s.delete(`calendarMedia:${f.id}`).catch(() => null),
        s.delete(`calendarMediaMeta:${f.id}`).catch(() => null),
      ]);
    }
    await s.delete(`calendarPost:${id}`).catch(() => null);
    const idx = await getIndex(s, post.brand);
    await saveIndex(s, post.brand, idx.filter(x => x !== id));
    return ok({ ok: true, mediaDeleted: (post.mediaFiles || []).length });
  }

  // ── push to SocialPilot ───────────────────────────────────────────────────
  if (action === 'push_socialpilot') {
    if (post.status !== 'approved') return bad(400, 'Post must be approved before scheduling');

    const apiKey = process.env.SOCIALPILOT_API_KEY;
    if (!apiKey) return bad(503, 'SOCIALPILOT_API_KEY not configured — add it to Netlify env vars.');

    // ── Account ID mapping (brand → market → platform → SocialPilot page ID) ─
    // "Mena" accounts are used for UAE market for both Pickl and Bonbird.
    // KSA = Saudi Arabia in SocialPilot labelling.
    const SP_ACCOUNTS = {
      pickl: {
        UAE:     { youtube: 2543471, facebook: 2445831, instagram: 2445847, tiktok: 2445864, linkedin: 2445851 },
        Bahrain: { facebook: 2445833, instagram: 2445841 },
        Egypt:   { facebook: 2445838, instagram: 2445843, tiktok: 2445867 },
        Jordan:  { facebook: 2537712, instagram: 2537716 },
        KSA:     { facebook: 2445835, instagram: 2445842, tiktok: 2445868 },
        Oman:    { facebook: 2597955, instagram: 2597956 },
        Qatar:   { facebook: 2445836, instagram: 2445846 },
      },
      bonbird: {
        UAE:      { youtube: 2543578, facebook: 2445839, instagram: 2445848, linkedin: 2445852, tiktok: 2445866 },
        Oman:     { facebook: 2445830, instagram: 2445840 },
        Pakistan: { facebook: 2445832, instagram: 2445844 },
        Qatar:    { facebook: 2445834, instagram: 2445845 },
        UK:       { facebook: 2573342, instagram: 2573342, tiktok: 2573342 },
      },
      yolk: {
        UAE: { facebook: 2445927, instagram: 2445926, linkedin: 2445853 },
      },
      southpour: {
        UAE: { facebook: 2445837, instagram: 2445849 },
      },
    };

    // Resolve account IDs from post's brand + market + platforms
    const marketMap   = SP_ACCOUNTS[post.brand]?.[post.market] || {};
    const accountIds  = (post.platforms || []).map(p => marketMap[p]).filter(Boolean).map(String);
    const missingPlatforms = (post.platforms || []).filter(p => !marketMap[p]);

    if (!accountIds.length) {
      return bad(400,
        `No SocialPilot accounts found for ${post.brand} · ${post.market} ` +
        `on platforms: ${(post.platforms||[]).join(', ')}. ` +
        `Check the account mapping or push manually from SocialPilot.`
      );
    }

    try {
      // ── SocialPilot via MCP server ────────────────────────────────────────
      // SocialPilot exposes an MCP server at https://mcp.socialpilot.co/{API_KEY}/mcp
      // This is available on current plan (REST API requires Enterprise).
      // We call it using JSON-RPC 2.0 over HTTP (StreamableHTTP MCP transport).
      // Zapier fallback: if ZAPIER_WEBHOOK_URL is set, POST to it instead.

      const zapierUrl = process.env.ZAPIER_WEBHOOK_URL;

      if (zapierUrl) {
        // ── Zapier webhook path ─────────────────────────────────────────────
        const zRes = await fetch(zapierUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brand: post.brand, market: post.market,
            platforms: post.platforms, postType: post.postType,
            caption: post.caption, hashtags: post.hashtags,
            imageUrl: post.imageUrl, videoUrl: post.videoUrl,
            scheduledDate: post.scheduledDate, scheduledTime: post.scheduledTime,
            mediaFiles: (post.mediaFiles || []).map(f => f.url).filter(Boolean),
            accountIds,
          }),
        });
        if (!zRes.ok) throw new Error(`Zapier webhook returned ${zRes.status}`);
        console.log('[SP] Zapier webhook fired OK');

      } else {
        // ── SocialPilot MCP server (available on current plan) ─────────────
        // MCP endpoint: https://mcp.socialpilot.co/{API_KEY}/mcp
        // Uses JSON-RPC 2.0 over HTTP (StreamableHTTP MCP transport)
        const MCP_URL = `https://mcp.socialpilot.co/${encodeURIComponent(apiKey)}/mcp`;
        let mcpSessionId = null;

        function parseMcpText(res, text) {
          // 1. Check response header first (MCP spec says session ID comes here)
          const hdr = res.headers.get('mcp-session-id') || res.headers.get('Mcp-Session-Id');
          if (hdr) { mcpSessionId = hdr; }
          // 2. Fallback: SSE id: line
          const lines   = text.split('\n');
          const idLine  = lines.find(l => l.startsWith('id:'));
          if (idLine && !mcpSessionId) mcpSessionId = idLine.replace(/^id:\s*/, '').trim();
          // 3. Parse JSON from data: line or raw body
          const dataLine = lines.find(l => l.startsWith('data: ') || (l.trim().startsWith('{') && l.includes('"jsonrpc"')));
          try { return JSON.parse(dataLine ? dataLine.replace(/^data:\s*/, '') : text); }
          catch { return { rawError: text.slice(0, 200) }; }
        }

        async function mcpCall(method, params, id) {
          const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };
          if (mcpSessionId) headers['Mcp-Session-Id'] = mcpSessionId;
          const res  = await fetch(MCP_URL, {
            method: 'POST', headers,
            body: JSON.stringify({ jsonrpc: '2.0', id: id || 1, method, params: params || {} }),
          });
          const text = await res.text();
          // Log headers for debugging
          const allHdrs = [...res.headers.entries()].map(([k,v])=>`${k}:${v}`).join(' | ');
          console.log(`[SP MCP] ${method} ${res.status} session=${mcpSessionId?.slice(0,16)||'none'} hdrs=${allHdrs.slice(0,150)}: ${text.slice(0,250)}`);
          return parseMcpText(res, text);
        }

        // Step 1: Initialize
        const init = await mcpCall('initialize', {
          protocolVersion: '2024-11-05',
          capabilities:    {},
          clientInfo:      { name: 'the-nest', version: '1.0' },
        }, 1);
        if (init.rawError || init.error) throw new Error('MCP init failed: ' + JSON.stringify(init.error || init.rawError));
        if (!mcpSessionId) throw new Error('MCP init: no session ID in headers or SSE id: line');
        console.log('[SP MCP] session:', mcpSessionId);

        // Step 2: Send initialized notification (required by MCP spec before further calls)
        await mcpCall('notifications/initialized', {}, 2);

        // Discover tools
        const toolsList = await mcpCall('tools/list', {}, 2);
        const tools     = toolsList.result?.tools || [];
        console.log('[SP MCP] available tools:', tools.map(t => t.name).join(', ') || '(none listed)');

        // Tool confirmed: CreatePost
        const caption   = [post.caption, post.hashtags].filter(Boolean).join('\n\n');
        const imageUrls = [];
        if (post.imageUrl) imageUrls.push(post.imageUrl);
        if (post.postType === 'carousel') {
          for (const f of post.mediaFiles || []) { if (f.url) imageUrls.push(f.url); }
        }

        // SocialPilot MCP confirmed: only text/image/article/document supported
        // Reels, Stories, TikTok videos, YouTube videos NOT supported in MCP
        if (['reel', 'story'].includes(post.postType)) {
          return bad(400, `${post.postType === 'reel' ? 'Reel' : 'Story'} posts cannot be pushed via SocialPilot MCP — video and story content types are not yet supported. Use "📥 Export CSV" to schedule manually in SocialPilot.`);
        }
        const postType = imageUrls.length ? 'image' : 'text';

        // scheduleDateTime = "YYYY-MM-DD HH:mm" in market local time — SP handles timezone from account settings
        const schedDT = `${post.scheduledDate} ${post.scheduledTime || '10:00'}`;

        // Build args per schema:
        // - image posts: caption in image.postDescription, text object unused
        // - text posts: caption in text.postDescription
        // - shareType 3 = schedule for specified time (0=queue, 1=now, 2=next, 3=scheduled)
        const toolArgs = {
          type:             postType,
          loginIds:         accountIds.map(Number),
          scheduleDateTime: [schedDT],
          shareType:        3,
          ...(postType === 'image' ? { image: { images: imageUrls, postDescription: caption } } : {}),
          ...(postType === 'text'  ? { text:  { postDescription: caption } } : {}),
        };

        console.log('[SP MCP] args:', JSON.stringify({ type: toolArgs.type, loginIds: toolArgs.loginIds, scheduleDateTime: toolArgs.scheduleDateTime, caption: caption.slice(0,60) }));

        const callRes = await mcpCall('tools/call', { name: 'CreatePost', arguments: toolArgs }, 3);
        if (callRes.error || callRes.result?.isError) {
          throw new Error('MCP tool error: ' + JSON.stringify(callRes.error || callRes.result?.content));
        }
        console.log('[SP MCP] scheduled OK:', JSON.stringify(callRes.result).slice(0, 300));
      }

      const spPostId = null;
      const note = [
        zapierUrl ? 'Sent via Zapier' : 'Pushed directly to SocialPilot',
        `Accounts: ${accountIds.join(', ')}`,
        missingPlatforms.length ? `⚠ No SP account for: ${missingPlatforms.join(', ')}` : '',
      ].filter(Boolean).join(' · ');

      const updated = { ...post, status: 'scheduled', socialPilotPostId: spPostId, updatedAt: now,
        history: [...(post.history || []), { at: now, actor, action: 'pushed_to_socialpilot', note }] };
      await savePost(s, updated);
      return ok({ ok: true, post: updated, accountIds, missingPlatforms });

    } catch (e) {
      console.error('[calendar] SocialPilot error:', e.message);
      return bad(500, e.message);
    }
  }

  // ── duplicate post ────────────────────────────────────────────────────────
  if (action === 'duplicate') {
    const copy = {
      ...post,
      id: newId('cal'),
      status: 'draft',
      approvals: [], comments: [], socialPilotPostId: null,
      createdAt: now, updatedAt: now,
      createdBy: actorEmail, createdByName: actor,
      history: [{ at: now, actor, action: 'created', note: `Duplicated from post ${id}` }],
    };
    await savePost(s, copy);
    const idx = await getIndex(s, copy.brand);
    idx.unshift(copy.id);
    if (idx.length > 1000) idx.length = 1000;
    await saveIndex(s, copy.brand, idx);
    return ok({ ok: true, post: copy });
  }

  // ── copy to other markets ─────────────────────────────────────────────────
  if (action === 'copy_to_markets') {
    const { markets: targetMarkets } = body;
    if (!targetMarkets?.length) return bad(400, 'markets required');
    const created = [];
    for (const market of targetMarkets) {
      if (market === post.market) continue; // skip same market
      const copy = {
        ...post,
        id: newId('cal'),
        market,
        status: 'draft',
        approvals: [], comments: [], socialPilotPostId: null,
        createdAt: now, updatedAt: now,
        createdBy: actorEmail, createdByName: actor,
        history: [{ at: now, actor, action: 'created',
          note: `Copied from ${post.market} (post ${id})` }],
      };
      await savePost(s, copy);
      const idx = await getIndex(s, copy.brand);
      idx.unshift(copy.id);
      if (idx.length > 1000) idx.length = 1000;
      await saveIndex(s, copy.brand, idx);
      created.push({ id: copy.id, market });
    }
    return ok({ ok: true, created, count: created.length });
  }

  // ── mark published ────────────────────────────────────────────────────────
  if (action === 'mark_published') {
    const updated = { ...post, status: 'published', updatedAt: now,
      history: [...(post.history || []), { at: now, actor, action: 'marked_published' }] };
    await savePost(s, updated);
    return ok({ ok: true, post: updated });
  }

  return bad(400, `Unknown action: ${action}`);
};
