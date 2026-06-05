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

    const updated = { ...post, status: 'in_review', updatedAt: now,
      history: [...(post.history || []), { at: now, actor, action: 'submitted_for_review' }] };
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
      const schedDt   = new Date(`${post.scheduledDate}T${post.scheduledTime || '10:00'}:00`);
      const schedUnix = Math.floor(schedDt.getTime() / 1000);
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

      const spRes  = await fetch('https://panel.socialpilot.co/oauth/1.0/apicall/add_post', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body:    JSON.stringify(payload),
      });
      const spData = await spRes.json();
      if (!spRes.ok) throw new Error(spData.message || spData.error || `SocialPilot API ${spRes.status}`);

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

  // ── mark published ────────────────────────────────────────────────────────
  if (action === 'mark_published') {
    const updated = { ...post, status: 'published', updatedAt: now,
      history: [...(post.history || []), { at: now, actor, action: 'marked_published' }] };
    await savePost(s, updated);
    return ok({ ok: true, post: updated });
  }

  return bad(400, `Unknown action: ${action}`);
};
