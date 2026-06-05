// netlify/functions/calendar-media.js
// Media upload and serving for Content Calendar posts.
//
// POST   { filename, mimeType, data: base64, postId? } — upload image (max 5MB)
// GET    ?id=<mediaId>                                  — serve binary file
// DELETE ?id=<mediaId>                                  — delete a single media item
// GET    ?scan=1                                        — list all media + orphan detection
// POST   { action:'purge_orphans' }                     — delete media not referenced by any post
//
// Supported types: JPEG, PNG, GIF, WebP, HEIC
// Blobs: calendarMedia:<mediaId> (binary), calendarMediaMeta:<mediaId> (JSON metadata)

const { getStore } = require('@netlify/blobs');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};
const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' };

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB (base64 inflates ~33% so enforce on decoded size)

function getS() {
  return getStore({
    name:   'seo-tool',
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });
}

function newId() {
  return 'med_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const s = getS();

  // ── GET: serve image ──────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const mediaId = event.queryStringParameters?.id;
    if (!mediaId) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'id required' }) };

    const meta = await s.get(`calendarMediaMeta:${mediaId}`, { type: 'json' }).catch(() => null);
    if (!meta) return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Not found' }) };

    const buf = await s.get(`calendarMedia:${mediaId}`, { type: 'arrayBuffer' }).catch(() => null);
    if (!buf) return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Media data not found' }) };

    return {
      statusCode:       200,
      isBase64Encoded:  true,
      headers: {
        'Content-Type':        meta.mimeType,
        'Cache-Control':       'public, max-age=86400',
        'Content-Disposition': `inline; filename="${meta.filename}"`,
        ...CORS,
      },
      body: Buffer.from(buf).toString('base64'),
    };
  }

  // ── DELETE: remove a single media item ────────────────────────────────────
  if (event.httpMethod === 'DELETE') {
    const mediaId = event.queryStringParameters?.id;
    if (!mediaId) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'id required' }) };
    await Promise.all([
      s.delete(`calendarMedia:${mediaId}`).catch(() => null),
      s.delete(`calendarMediaMeta:${mediaId}`).catch(() => null),
    ]);
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true }) };
  }

  // ── GET ?scan=1: list all media + orphan detection ─────────────────────────
  if (event.httpMethod === 'GET' && event.queryStringParameters?.scan === '1') {
    // List all meta keys
    const listed = await s.list({ prefix: 'calendarMediaMeta:' }).catch(() => ({ blobs: [] }));
    const allMedia = await Promise.all(
      (listed.blobs || []).map(async b => {
        const mediaId = b.key.replace('calendarMediaMeta:', '');
        const meta = await s.get(b.key, { type: 'json' }).catch(() => null);
        return { mediaId, ...(meta || {}), key: b.key };
      })
    );
    // Count total size
    const totalBytes = allMedia.reduce((sum, m) => sum + (m.size || 0), 0);
    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ ok: true, count: allMedia.length, totalBytes, media: allMedia }),
    };
  }

  // ── POST action:purge_orphans — delete media not linked to any post ────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch (_) { return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    if (body.action === 'purge_orphans') {
      // Collect all referenced mediaIds from all posts across all brands
      const ALL_BRANDS = ['pickl', 'bonbird', 'southpour', 'shadowburg', 'shadowbird'];
      const referencedIds = new Set();
      for (const brand of ALL_BRANDS) {
        const ids = await s.get(`calendarIndex:${brand}`, { type: 'json' }).catch(() => []) || [];
        for (const postId of ids) {
          const post = await s.get(`calendarPost:${postId}`, { type: 'json' }).catch(() => null);
          if (post) (post.mediaFiles || []).forEach(f => referencedIds.add(f.id));
        }
      }
      // List all media
      const listed = await s.list({ prefix: 'calendarMediaMeta:' }).catch(() => ({ blobs: [] }));
      const orphans = (listed.blobs || []).filter(b => {
        const mediaId = b.key.replace('calendarMediaMeta:', '');
        return !referencedIds.has(mediaId);
      });
      // Delete orphans
      let deleted = 0;
      let freedBytes = 0;
      for (const b of orphans) {
        const mediaId = b.key.replace('calendarMediaMeta:', '');
        const meta = await s.get(b.key, { type: 'json' }).catch(() => null);
        freedBytes += meta?.size || 0;
        await Promise.all([
          s.delete(`calendarMedia:${mediaId}`).catch(() => null),
          s.delete(b.key).catch(() => null),
        ]);
        deleted++;
      }
      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({ ok: true, deleted, freedBytes }),
      };
    }

    // ── POST: upload image (existing logic) ──────────────────────────────────
    const { filename, mimeType, data, postId } = body;

    if (!filename || !mimeType || !data)
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'filename, mimeType, data required' }) };

    if (!ALLOWED_TYPES.has(mimeType))
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: `${mimeType} not supported. Upload images (JPEG, PNG, GIF, WebP). For videos use a URL link.` }) };

    let buf;
    try { buf = Buffer.from(data, 'base64'); }
    catch (_) { return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Invalid base64 data' }) }; }

    if (buf.length > MAX_BYTES)
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: `File too large: ${(buf.length / 1048576).toFixed(1)}MB. Maximum is 5MB.` }) };

    const mediaId = newId();
    await s.set(`calendarMedia:${mediaId}`, buf);
    await s.setJSON(`calendarMediaMeta:${mediaId}`, {
      filename, mimeType, size: buf.length,
      postId:     postId || null,
      uploadedAt: new Date().toISOString(),
    });

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ ok: true, mediaId, filename, mimeType, size: buf.length }),
    };
  }

  return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
};
