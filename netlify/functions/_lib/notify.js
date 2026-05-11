// netlify/functions/_lib/notify.js
// Sends to Slack (webhook) and/or email (Resend) when approvals are queued or pushes fail.
// Both channels are optional. Missing env vars = that channel silently skipped.
//
// Env vars:
//   SLACK_WEBHOOK_URL   — Slack incoming webhook URL
//   RESEND_API_KEY      — resend.com API key
//   NOTIFY_EMAIL_TO     — comma-separated recipient addresses
//   NOTIFY_EMAIL_FROM   — verified sender e.g. "SEO Bot <bot@yourdomain.com>"

const SITE_URL = process.env.URL || 'https://yolkseo.netlify.app';

function brandLabel(b) { return b === 'pickl' ? 'Pickl' : b === 'bonbird' ? 'Bonbird' : b || '—'; }
function typeLabel(t) {
  return ({ blog_draft: 'Blog draft', meta_update: 'Meta update', onpage_suggestion: 'On-page suggestion', review_response: 'Review response', schema_update: 'Schema update' })[t] || t;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function sendSlack(payload) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return { skipped: 'no_webhook' };
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return { ok: res.ok, status: res.status };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function sendEmail(subject, html, text) {
  const key  = process.env.RESEND_API_KEY;
  const to   = process.env.NOTIFY_EMAIL_TO;
  const from = process.env.NOTIFY_EMAIL_FROM || 'onboarding@resend.dev';
  if (!key || !to) return { skipped: 'no_email_config' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ from, to: to.split(',').map(s => s.trim()), subject, html, text }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, id: data.id };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function notifyQueued(items) {
  if (!Array.isArray(items)) items = [items];
  if (!items.length) return { sent: 0 };

  const summary = items.length === 1
    ? `New approval: ${typeLabel(items[0].type)} for ${brandLabel(items[0].brand)}`
    : `${items.length} new approvals queued`;

  const lines = items.map(it => `• *${brandLabel(it.brand)}* — ${typeLabel(it.type)}: ${it.title || ''}`);

  const slackPayload = {
    text: summary,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*${summary}*\n${lines.join('\n')}` } },
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open approval queue' }, url: `${SITE_URL}/?tab=approvals`, style: 'primary' }] },
    ],
  };

  const subject = items.length === 1
    ? `[SEO] New approval — ${typeLabel(items[0].type)} for ${brandLabel(items[0].brand)}`
    : `[SEO] ${items.length} new approvals queued`;

  const rows = items.map(it => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${brandLabel(it.brand)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${typeLabel(it.type)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${esc(it.title || '')}</td></tr>`).join('');
  const html = `<div style="font-family:sans-serif;color:#111;max-width:560px"><h2 style="font-size:16px;font-weight:500;margin:0 0 12px">${esc(summary)}</h2><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="color:#6b7280;font-size:11px"><th style="padding:6px 12px;text-align:left">Brand</th><th style="padding:6px 12px;text-align:left">Type</th><th style="padding:6px 12px;text-align:left">Title</th></tr></thead><tbody>${rows}</tbody></table><p style="margin-top:16px"><a href="${SITE_URL}" style="background:#2563eb;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none;font-size:13px">Open approval queue →</a></p></div>`;
  const plainText = `${summary}\n\n${lines.join('\n')}\n\nOpen: ${SITE_URL}`;

  const [slack, email] = await Promise.all([sendSlack(slackPayload), sendEmail(subject, html, plainText)]);
  return { slack, email, sent: items.length };
}

async function notifyPushFailed(item, errMsg) {
  const subject = `[SEO] Push failed — ${typeLabel(item.type)} for ${brandLabel(item.brand)}`;
  const msg = `Push failed for *${typeLabel(item.type)}* (${brandLabel(item.brand)}): ${errMsg}`;
  await sendSlack({ text: subject, blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `:warning: ${msg}\nItem: ${item.title || item.id}` } }] });
  await sendEmail(subject, `<p>${esc(msg)}</p><p>Item: ${esc(item.title || item.id)}</p>`, `${msg}\nItem: ${item.title || item.id}`);
}

module.exports = { notifyQueued, notifyPushFailed, sendSlack, sendEmail };
