// netlify/functions/calendar-media.js
// Media upload + serving for Content Calendar posts.
//
// POST   { filename, mimeType, data: base64 }  — upload image → GCS (if configured) or Blobs fallback
//                                                 always returns { ok, url } — a publicly accessible URL
// GET    ?id=<mediaId>                           — serve legacy Blob image
// DELETE ?id=<mediaId>                           — delete legacy Blob image
// GET    ?scan=1                                 — list all Blob media (legacy)
// POST   { action:'purge_orphans' }              — delete unreferenced Blobs (legacy cleanup)
//
// GCS env vars: GCS_BUCKET_NAME, GCS_SERVICE_ACCOUNT_KEY (full JSON string)
// When GCS is configured, uploads go to GCS and a public storage.googleapis.com URL is returned.
// Without GCS, uploads fall back to Netlify Blobs (served via this function).

const crypto    = require('crypto');
const { getStore } = require('@netlify/blobs');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};
const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' };

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  // Short video clips (Stories) — max 10MB enforced below
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v',
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB decoded

// ── GCS helpers ───────────────────────────────────────────────────────────────

async function getGCSToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/devstorage.read_write',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  })).toString('base64url');
  const toSign = `${header}.${payload}`;
  const sig    = crypto.createSign('RSA-SHA256').update(toSign).sign(sa.private_key, 'base64url');
  const jwt    = `${toSign}.${sig}`;

  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'GCS token error');
  return data.access_token;
}

async function gcsUpload(bucket, objectName, buf, mimeType, token) {
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`
    + `?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const res  = await fetch(url, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': mimeType },
    body:    buf,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `GCS upload ${res.status}`);
  return `https://storage.googleapis.com/${bucket}/${objectName}`;
}

// ── Blobs helpers ─────────────────────────────────────────────────────────────

function getS() {
  return getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
}
function newId() {
  return 'med_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  // ── GET ?id= : serve legacy Blob image ───────────────────────────────────
  if (event.httpMethod === 'GET' && event.queryStringParameters?.id) {
    const s       = getS();
    const mediaId = event.queryStringParameters.id;
    const meta    = await s.get(`calendarMediaMeta:${mediaId}`, { type: 'json' }).catch(() => null);
    if (!meta) return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Not found' }) };
    const buf = await s.get(`calendarMedia:${mediaId}`, { type: 'arrayBuffer' }).catch(() => null);
    if (!buf) return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Data not found' }) };
    return {
      statusCode: 200, isBase64Encoded: true,
      headers: { 'Content-Type': meta.mimeType, 'Cache-Control': 'public, max-age=86400',
                 'Content-Disposition': `inline; filename="${meta.filename}"`, ...CORS },
      body: Buffer.from(buf).toString('base64'),
    };
  }

  // ── GET ?scan=1 : list Blob media ─────────────────────────────────────────
  if (event.httpMethod === 'GET' && event.queryStringParameters?.scan === '1') {
    const s      = getS();
    const listed = await s.list({ prefix: 'calendarMediaMeta:' }).catch(() => ({ blobs: [] }));
    const media  = await Promise.all((listed.blobs || []).map(async b => {
      const mediaId = b.key.replace('calendarMediaMeta:', '');
      const meta    = await s.get(b.key, { type: 'json' }).catch(() => null);
      return { mediaId, ...(meta || {}) };
    }));
    const totalBytes = media.reduce((sum, m) => sum + (m.size || 0), 0);
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true, count: media.length, totalBytes, media }) };
  }

  // ── GET ?config=1 : report GCS status ────────────────────────────────────
  if (event.httpMethod === 'GET' && event.queryStringParameters?.config === '1') {
    const ready = !!(process.env.GCS_BUCKET_NAME && process.env.GCS_SERVICE_ACCOUNT_KEY);
    return { statusCode: 200, headers: JSON_HEADERS,
      body: JSON.stringify({ provider: 'gcs', ready, bucket: process.env.GCS_BUCKET_NAME || null }) };
  }

  // ── DELETE ?id= : remove legacy Blob ─────────────────────────────────────
  if (event.httpMethod === 'DELETE') {
    const s       = getS();
    const mediaId = event.queryStringParameters?.id;
    if (!mediaId) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'id required' }) };
    await Promise.all([
      s.delete(`calendarMedia:${mediaId}`).catch(() => null),
      s.delete(`calendarMediaMeta:${mediaId}`).catch(() => null),
    ]);
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true }) };
  }

  // ── POST ──────────────────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch (_) { return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    // ── purge_orphans (legacy Blob cleanup) ───────────────────────────────
    if (body.action === 'purge_orphans') {
      const s = getS();
      const ALL_BRANDS = ['pickl', 'bonbird', 'southpour', 'shadowburg', 'shadowbird'];
      const refIds = new Set();
      for (const brand of ALL_BRANDS) {
        const ids = await s.get(`calendarIndex:${brand}`, { type: 'json' }).catch(() => []) || [];
        for (const postId of ids) {
          const post = await s.get(`calendarPost:${postId}`, { type: 'json' }).catch(() => null);
          if (post) (post.mediaFiles || []).forEach(f => { if (f.id) refIds.add(f.id); });
        }
      }
      const listed = await s.list({ prefix: 'calendarMediaMeta:' }).catch(() => ({ blobs: [] }));
      const orphans = (listed.blobs || []).filter(b => !refIds.has(b.key.replace('calendarMediaMeta:', '')));
      let deleted = 0, freedBytes = 0;
      for (const b of orphans) {
        const mediaId = b.key.replace('calendarMediaMeta:', '');
        const meta = await s.get(b.key, { type: 'json' }).catch(() => null);
        freedBytes += meta?.size || 0;
        await Promise.all([s.delete(`calendarMedia:${mediaId}`).catch(() => null), s.delete(b.key).catch(() => null)]);
        deleted++;
      }
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true, deleted, freedBytes }) };
    }

    // ── GCS signed URL for large video direct uploads ────────────────────
    // Browser uploads directly to GCS, bypassing the 10MB Netlify function limit.
    // Requires GCS CORS to be configured: gsutil cors set cors.json gs://BUCKET
    if (body.action === 'signedUrl') {
      const { filename, mimeType } = body;
      if (!filename || !mimeType) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'filename and mimeType required' }) };
      const gcsBucket = process.env.GCS_BUCKET_NAME;
      const gcsKeyStr = process.env.GCS_SERVICE_ACCOUNT_KEY;
      if (!gcsBucket || !gcsKeyStr) return { statusCode: 503, headers: JSON_HEADERS, body: JSON.stringify({ error: 'GCS not configured' }) };
      try {
        const sa         = JSON.parse(gcsKeyStr);
        const token      = await gcsGetToken(sa);
        const objectName = `calendar/${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        // Initiate a resumable upload session — returns Location URL for direct browser upload
        const initRes = await fetch(
          `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(gcsBucket)}/o?uploadType=resumable&name=${encodeURIComponent(objectName)}`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Upload-Content-Type': mimeType },
            body: JSON.stringify({ contentType: mimeType }),
          }
        );
        if (!initRes.ok) throw new Error(`GCS init failed: ${initRes.status}`);
        const uploadUrl = initRes.headers.get('Location');
        const publicUrl = `https://storage.googleapis.com/${gcsBucket}/${objectName}`;
        return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true, uploadUrl, publicUrl }) };
      } catch (e) {
        return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: e.message }) };
      }
    }

    // ── upload image/video (base64, max 10 MB) ────────────────────────────
    const { filename, mimeType, data } = body;
    if (!filename || !mimeType || !data)
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'filename, mimeType, data required' }) };
    if (!ALLOWED_TYPES.has(mimeType))
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: `${mimeType} not supported. Images: JPEG, PNG, GIF, WebP. Videos: MP4, MOV, WebM (max 10 MB — for larger videos use the URL field).` }) };

    let buf;
    try { buf = Buffer.from(data, 'base64'); }
    catch (_) { return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Invalid base64 data' }) }; }
    if (buf.length > MAX_BYTES)
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: `File too large: ${(buf.length/1048576).toFixed(1)} MB. Maximum is 10 MB.` }) };

    // ── Try GCS first ────────────────────────────────────────────────────
    const gcsBucket = process.env.GCS_BUCKET_NAME;
    const gcsKeyStr = process.env.GCS_SERVICE_ACCOUNT_KEY;

    if (!gcsBucket || !gcsKeyStr)
      return { statusCode: 503, headers: JSON_HEADERS, body: JSON.stringify({ error: 'GCS not configured. Add GCS_BUCKET_NAME and GCS_SERVICE_ACCOUNT_KEY to Netlify env vars.' }) };

    const sa         = JSON.parse(gcsKeyStr);
    const token      = await getGCSToken(sa);
    const ext        = (filename.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const now        = new Date();
    const ym         = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const objectName = `calendar/${ym}/${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}.${ext}`;
    const publicUrl  = await gcsUpload(gcsBucket, objectName, buf, mimeType, token);
    return { statusCode: 200, headers: JSON_HEADERS,
      body: JSON.stringify({ ok: true, url: publicUrl, provider: 'gcs' }) };
  }

  return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
};
