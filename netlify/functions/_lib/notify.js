// netlify/functions/_lib/notify.js
// Fan-out notifier for approval-queue events.
// Supports Slack incoming-webhooks and Resend (email).
// Both are optional. If env vars aren't set, that channel is silently skipped
// — the caller never has to care which channels are wired up.
//
// Env vars used (set these in Netlify → Site settings → Environment variables):
//   SLACK_WEBHOOK_URL    Incoming-webhook URL from Slack
//   RESEND_API_KEY       API key from resend.com (free tier: 3k emails/mo)
//   NOTIFY_EMAIL_TO      Comma-separated list of recipient emails
//   NOTIFY_EMAIL_FROM    Verified sender, e.g. "SEO Bot <bot@yourdomain.com>"
//                        (Resend requires a verified domain for production.
//                         For testing, use "onboarding@resend.dev")

const SITE_URL = process.env.URL || 'https://yolkseo.netlify.app';

async function sendSlack(payload) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return { skipped: 'no_webhook' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function sendEmail(subject, html, text) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL_TO;
  const from = process.env.NOTIFY_EMAIL_FROM || 'onboarding@resend.dev';
  if (!key || !to) return { skipped: 'no_email_config' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        from,
        to: to.split(',').map(s => s.trim()),
        subject,
        html,
        text
      })
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, id: data.id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Higher-level helpers --------------------------------------------------------

function brandLabel(b) {
  if (b === 'pickl') return 'Pickl';
  if (b === 'bonbird') return 'Bonbird';
  return b || '—';
}

function typeLabel(t) {
  return ({
    blog_draft: 'Blog draft',
    meta_update: 'Meta update',
    onpage_suggestion: 'On-page suggestion',
    review_response: 'Review response',
    schema_update: 'Schema update'
  })[t] || t;
}

async function notifyQueued(items) {
  // Accepts a single item or an array of items just queued.
  if (!Array.isArray(items)) items = [items];
  if (!items.length) return { sent: 0 };

  const grouped = items.reduce((acc, it) => {
    const k = `${brandLabel(it.brand)} · ${typeLabel(it.type)}`;
    (acc[k] = acc[k] || []).push(it);
    return acc;
  }, {});

  const lines = Object.entries(grouped).map(([k, arr]) =>
    `• *${k}* — ${arr.length} item${arr.length > 1 ? 's' : ''}`
  );

  const slackText = items.length === 1
    ? `New approval queued — ${brandLabel(items[0].brand)} · ${typeLabel(items[0].type)}: ${items[0].title || items[0].reason || ''}`
    : `${items.length} new approvals queued`;

  const slackPayload = {
    text: slackText,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${slackText}*\n${lines.join('\n')}` }
      },
      {
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: 'Open approval queue' },
          url: `${SITE_URL}/?tab=approvals`,
          style: 'primary'
        }]
      }
    ]
  };

  const subject = items.length === 1
    ? `[SEO] New approval — ${typeLabel(items[0].type)} for ${brandLabel(items[0].brand)}`
    : `[SEO] ${items.length} new approvals queued`;

  const itemRows = items.map(it => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${brandLabel(it.brand)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${typeLabel(it.type)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(it.title || '')}</td>
    </tr>`).join('');

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1915;max-width:560px">
      <h2 style="font-size:16px;font-weight:500;margin:0 0 12px">${escapeHtml(slackText)}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
        <thead><tr style="text-align:left;color:#6b6b67;font-size:11px">
          <th style="padding:6px 12px">Brand</th><th style="padding:6px 12px">Type</th><th style="padding:6px 12px">Title</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <p><a href="${SITE_URL}/?tab=approvals"
        style="display:inline-block;background:#185FA5;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none;font-size:13px">
        Open approval queue →
      </a></p>
    </div>`;

  const text = `${slackText}\n\n${lines.join('\n')}\n\nOpen: ${SITE_URL}/?tab=approvals`;

  const [slack, email] = await Promise.all([
    sendSlack(slackPayload),
    sendEmail(subject, html, text)
  ]);
  return { slack, email, sent: items.length };
}

async function notifyPushFailed(item, err) {
  const subject = `[SEO] Push failed — ${typeLabel(item.type)} for ${brandLabel(item.brand)}`;
  const msg = `Push failed for *${typeLabel(item.type)}* (${brandLabel(item.brand)}): ${err}`;
  await sendSlack({
    text: subject,
    blocks: [{
      type: 'section',
      text: { type: 'mrkdwn', text: `:warning: ${msg}\n\nItem: ${item.title || item.id}` }
    }]
  });
  await sendEmail(
    subject,
    `<p>${escapeHtml(msg)}</p><p>Item: ${escapeHtml(item.title || item.id)}</p>`,
    `${msg}\nItem: ${item.title || item.id}`
  );
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = { notifyQueued, notifyPushFailed, sendSlack, sendEmail };
