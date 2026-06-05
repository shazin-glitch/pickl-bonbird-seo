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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...data }),
    });
  } catch (e) { console.warn('[calendar] Slack notify failed:', e.message); }
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  const s = getS();

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
      const allBrands = ['pickl', 'bonbird', 'southpour', 'shadowburg', 'shadowbird'];
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
  const actor      = body.actor      || 'unknown';
  const actorEmail = body.actorEmail || '';
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
      for (const approver of (p.requiredApprovers || [])) {
        await notifySlack('calendar_review_needed', {
          brand: p.brand, market: p.market, postId: postId,
          caption: (p.caption || '').slice(0, 200),
          scheduledDate: p.scheduledDate, scheduledTime: p.scheduledTime,
          submittedBy: actor, approverName: approver.name,
          platforms: p.platforms || [], postType: p.postType || 'static',
          imageUrl: p.imageUrl || '',
        });
      }
      submitted++;
    }
    return ok({ ok: true, submitted });
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

    for (const approver of (post.requiredApprovers || [])) {
      await notifySlack('calendar_review_needed', {
        brand: post.brand, market: post.market, postId: id,
        caption: (post.caption || '').slice(0, 200),
        scheduledDate: post.scheduledDate, scheduledTime: post.scheduledTime,
        submittedBy: actor, approverName: approver.name,
        platforms: post.platforms || [], postType: post.postType || 'static',
        imageUrl: post.imageUrl || '',
      });
    }
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
        imageUrl: post.imageUrl || '',
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
      imageUrl: post.imageUrl || '',
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
      // Convert market local time → UTC using IANA timezone (handles DST correctly)
      const schedUnix = marketLocalToUnix(post.scheduledDate, post.scheduledTime || '10:00', post.market || 'UAE');
      const fullText  = [post.caption, post.hashtags].filter(Boolean).join('\n\n');

      // Build payload — include images for SocialPilot to attach
      const payload = {
        accounts:      accountIds,
        text:          fullText,
        schedule_time: schedUnix,
      };

      // Attach images — single image or carousel slides
      const imageUrls = [];
      if (post.imageUrl)  imageUrls.push(post.imageUrl);
      if ((post.mediaFiles || []).length) {
        for (const f of post.mediaFiles) {
          const url = f.url || (f.id ? `${SITE_URL}/api/calendar-media?id=${f.id}` : null);
          if (url) imageUrls.push(url);
        }
      }
      if (imageUrls.length) payload.images = imageUrls;

      // Video URL for reels
      if (post.videoUrl && post.postType === 'reel') payload.video_url = post.videoUrl;

      // Try multiple auth approaches to find what SocialPilot accepts
      // Log payload (without sensitive data) for debugging
      console.log('[SP push] accounts:', payload.accounts, 'schedule_time:', payload.schedule_time);

      // Try 1: Bearer header on their panel API
      let spRes = await fetch('https://panel.socialpilot.co/oauth/1.0/apicall/add_post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
      });
      let spData;
      try { spData = await spRes.json(); } catch (_) { spData = {}; }
      console.log('[SP push] Try1 (Bearer/panel):', spRes.status, JSON.stringify(spData));

      // Try 2: Token as query param on panel API
      if (spRes.status === 401 || spRes.status === 403) {
        spRes = await fetch(`https://panel.socialpilot.co/oauth/1.0/apicall/add_post?access_token=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        try { spData = await spRes.json(); } catch (_) { spData = {}; }
        console.log('[SP push] Try2 (query param/panel):', spRes.status, JSON.stringify(spData));
      }

      // Try 3: Bearer header on their newer API endpoint
      if (spRes.status === 401 || spRes.status === 403) {
        spRes = await fetch('https://api.socialpilot.co/v1/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify(payload),
        });
        try { spData = await spRes.json(); } catch (_) { spData = {}; }
        console.log('[SP push] Try3 (Bearer/api.v1):', spRes.status, JSON.stringify(spData));
      }

      if (!spRes.ok) throw new Error(
        spData.message || spData.error || spData.msg ||
        (typeof spData === 'string' ? spData.slice(0, 200) : `SocialPilot API returned ${spRes.status} on all attempts`)
      );

      const spPostId = spData.post_id || spData.id || null;
      const note = [
        `SP Post ID: ${spPostId}`,
        `Accounts: ${accountIds.join(', ')}`,
        missingPlatforms.length ? `⚠ No SP account for: ${missingPlatforms.join(', ')}` : '',
      ].filter(Boolean).join(' · ');

      const updated = { ...post, status: 'scheduled', socialPilotPostId: spPostId, updatedAt: now,
        history: [...(post.history || []), { at: now, actor, action: 'pushed_to_socialpilot', note }] };
      await savePost(s, updated);
      return ok({ ok: true, post: updated, accountIds, missingPlatforms, spResponse: spData });

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
