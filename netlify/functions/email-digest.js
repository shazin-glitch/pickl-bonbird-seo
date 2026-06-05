// netlify/functions/email-digest.js
// Weekly email digest — Monday summary of SEO pipeline activity.
//
// POST { brand?, to? } — sends digest email via Resend API
// GET                  — returns last sent digest metadata
//
// Requires env vars:
//   RESEND_API_KEY     — Resend API key (resend.com)
//   DIGEST_FROM_EMAIL  — verified sender address (e.g. digest@yolkbrands.com)
//   DIGEST_TO_EMAIL    — default recipient (e.g. shazin@yolkbrands.com)

const { getStore } = require('@netlify/blobs');

const RESEND_API = 'https://api.resend.com/emails';

const BRAND_CONFIG = {
  pickl:   { name: 'Pickl',   gscKey: 'gscCache:https://eatpickl.com/',            color: '#f59e0b' },
  bonbird: { name: 'Bonbird', gscKey: 'gscCache:sc-domain:bonbirdchicken.com',      color: '#ef4444' },
};

async function buildDigestData(brand, store) {
  const cfg = BRAND_CONFIG[brand];

  // GSC data
  const gscCache = await store.get(cfg.gscKey, { type: 'json' }).catch(() => null);
  const rows     = gscCache?.rows || [];
  const BRAND_TERMS = brand === 'pickl' ? ['pickl'] : ['bonbird'];
  const nonBranded = rows.filter(r => r.keyword && !BRAND_TERMS.some(t => r.keyword.toLowerCase().includes(t)));

  const top10     = nonBranded.filter(r => r.position <= 10).length;
  const quickWins = nonBranded.filter(r => r.position >= 11 && r.position <= 20).length;
  const top3Opps  = nonBranded.sort((a, b) => (b.impressions || 0) - (a.impressions || 0)).slice(0, 3);

  // Approvals queue
  const approvalIndex = await store.get('approvals:index', { type: 'json' }).catch(() => []) || [];
  const recentIds     = approvalIndex.slice(-50);
  const items = await Promise.all(
    recentIds.map(id => store.get(`approvals:${id}`, { type: 'json' }).catch(() => null))
  ).then(arr => arr.filter(Boolean));

  const brandItems  = items.filter(i => i.brand === brand);
  const pending     = brandItems.filter(i => i.status === 'pending').length;
  const approved    = brandItems.filter(i => i.status === 'approved' || i.status === 'published').length;
  const published   = brandItems.filter(i => i.status === 'published').length;

  // AI Overview data
  const aiData    = await store.get(`aiOverviewData:${brand}`, { type: 'json' }).catch(() => []) || [];
  const aiCount   = aiData.filter(r => r.hasAiOverview).length;
  const aiTotal   = aiData.length;

  return { cfg, top10, quickWins, top3Opps, pending, approved, published, aiCount, aiTotal };
}

function buildHtml(brands) {
  const date   = new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const sections = brands.map(d => {
    const { cfg, top10, quickWins, top3Opps, pending, approved, published, aiCount, aiTotal } = d;
    const kws = top3Opps.map(r =>
      `<tr><td style="padding:6px 12px;font-size:13px">${r.keyword}</td><td style="padding:6px 12px;text-align:center;font-size:13px">#${Math.round(r.position)}</td><td style="padding:6px 12px;text-align:center;font-size:13px">${(r.impressions||0).toLocaleString()}</td></tr>`
    ).join('');

    return `
      <div style="margin-bottom:32px">
        <div style="background:${cfg.color};color:#fff;font-weight:700;font-size:16px;padding:10px 16px;border-radius:8px 8px 0 0">${cfg.name}</div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:16px">

          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:12px;text-align:center">
              <div style="font-size:22px;font-weight:800;color:#1e293b">${top10}</div>
              <div style="font-size:11px;color:#64748b">Non-branded keywords in top 10</div>
            </div>
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:12px;text-align:center">
              <div style="font-size:22px;font-weight:800;color:#f59e0b">${quickWins}</div>
              <div style="font-size:11px;color:#64748b">Quick wins (pos 11–20)</div>
            </div>
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:12px;text-align:center">
              <div style="font-size:22px;font-weight:800;color:#6366f1">${pending}</div>
              <div style="font-size:11px;color:#64748b">Items pending approval</div>
            </div>
          </div>

          <div style="margin-bottom:12px">
            <div style="font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">Pipeline this week</div>
            <div style="font-size:13px;color:#334155">
              ${approved} items approved &nbsp;·&nbsp; ${published} published to WordPress
              ${aiTotal > 0 ? `&nbsp;·&nbsp; ${aiCount}/${aiTotal} keywords have AI Overview` : ''}
            </div>
          </div>

          ${kws ? `
          <div>
            <div style="font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">Top 3 keyword opportunities</div>
            <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
              <thead><tr style="background:#f1f5f9">
                <th style="padding:6px 12px;text-align:left;font-size:11px;color:#64748b">Keyword</th>
                <th style="padding:6px 12px;text-align:center;font-size:11px;color:#64748b">Position</th>
                <th style="padding:6px 12px;text-align:center;font-size:11px;color:#64748b">Impressions</th>
              </tr></thead>
              <tbody>${kws}</tbody>
            </table>
          </div>` : ''}
        </div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#0f172a;color:#f1f5f9;padding:20px 24px;border-radius:8px;margin-bottom:24px">
      <div style="font-size:20px;font-weight:800">🪺 The Nest — Weekly Digest</div>
      <div style="font-size:13px;color:#94a3b8;margin-top:4px">${date}</div>
    </div>
    ${sections}
    <div style="text-align:center;font-size:11px;color:#94a3b8;margin-top:24px">
      Sent by The Nest · <a href="https://yolkseo.netlify.app" style="color:#6366f1">Open dashboard</a>
    </div>
  </div>
</body>
</html>`;
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const store = getStore({
    name:   'seo-tool',
    siteID: process.env.NETLIFY_SITE_ID,
    token:  process.env.NETLIFY_AUTH_TOKEN,
  });

  // GET — return last digest metadata
  if (event.httpMethod === 'GET') {
    const meta = await store.get('digestLastSent', { type: 'json' }).catch(() => null);
    return { statusCode: 200, headers, body: JSON.stringify(meta || { lastSent: null }) };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'RESEND_API_KEY not set in Netlify env vars' }) };
  }

  const body    = JSON.parse(event.body || '{}');
  const to      = body.to || process.env.DIGEST_TO_EMAIL || 'shazin@yolkbrands.com';
  const from    = process.env.DIGEST_FROM_EMAIL || 'digest@yolkbrands.com';
  const brands  = ['pickl', 'bonbird'];

  try {
    const brandData = await Promise.all(brands.map(b => buildDigestData(b, store)));
    const html      = buildHtml(brandData);
    const subject   = `🪺 Weekly SEO Digest — ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short' })}`;

    const res  = await fetch(RESEND_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({ from, to, subject, html }),
    });
    const result = await res.json();

    if (!res.ok) throw new Error(result.message || `Resend error ${res.status}`);

    const meta = { lastSent: new Date().toISOString(), to, messageId: result.id };
    await store.set('digestLastSent', JSON.stringify(meta));

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ...meta }) };

  } catch (err) {
    console.error('[email-digest] Error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
