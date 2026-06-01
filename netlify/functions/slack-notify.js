// netlify/functions/slack-notify.js
// Sends Slack notifications using Block Kit for rich, structured messages.
// Webhook URL: Netlify Blobs (set via Settings tab) or SLACK_WEBHOOK_URL env var.
//
// Message types:
//   queue_summary     — Weekly SEO content batch (grouped by brand/type with per-item detail)
//   international_queue — International SEO items queued
//   perch_assigned    — Perch task assigned to someone
//   perch_done        — Perch task marked complete
//   perch_due_alert   — Daily overdue/due-soon digest

const { getStore } = require('@netlify/blobs');

const SITE_URL = process.env.URL || 'https://yolkseo.netlify.app';

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  // Get webhook URL — Blobs takes priority over env var
  let webhookUrl = process.env.SLACK_WEBHOOK_URL || '';
  try {
    const store = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    const dbData = await store.get('slackWebhookUrl', { type: 'json' });
    if (dbData) webhookUrl = dbData;
  } catch { /* use env var fallback */ }

  if (!webhookUrl) {
    return { statusCode: 200, headers, body: JSON.stringify({ skipped: true, reason: 'No Slack webhook URL configured' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { type } = body;

    let payload;
    if (type === 'queue_summary')       payload = buildQueueSummary(body);
    else if (type === 'international_queue') payload = buildIntlSummary(body);
    else if (type === 'perch_assigned') payload = buildPerchAssigned(body);
    else if (type === 'perch_done')     payload = buildPerchDone(body);
    else if (type === 'perch_due_alert') payload = buildPerchDueAlert(body);
    else                                payload = buildGeneric(body);

    const slackRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!slackRes.ok) throw new Error(`Slack responded ${slackRes.status}`);
    return { statusCode: 200, headers, body: JSON.stringify({ sent: true }) };
  } catch (err) {
    console.error('[slack-notify] Error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

// ─── Queue summary: one message per brand, full per-item detail ──────────────
function buildQueueSummary({ brand, items = [], count }) {
  const brandLabel = brand === 'pickl' ? '🟡 Pickl' : brand === 'bonbird' ? '🔴 Bonbird' : '🟡🔴 All Brands';
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  // Group items by type
  const groups = {};
  for (const item of items) {
    const t = item.type || 'other';
    if (!groups[t]) groups[t] = [];
    groups[t].push(item);
  }

  const typeLabel = {
    blog_draft: { icon: '📝', label: 'Blog Drafts' },
    meta_update: { icon: '✏️', label: 'Meta Updates' },
    page_update: { icon: '🔧', label: 'Page Updates' },
    page_creation: { icon: '📄', label: 'New Pages' },
    onpage_suggestion: { icon: '💡', label: 'On-Page' },
  };

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `🪺 The Nest — ${count} item${count !== 1 ? 's' : ''} queued` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*${brandLabel}* · ${date}` },
    },
    { type: 'divider' },
  ];

  // Per-type groups with item details
  for (const [type, typeItems] of Object.entries(groups)) {
    const cfg = typeLabel[type] || { icon: '📌', label: type };
    const itemLines = typeItems.slice(0, 8).map(item => {
      const kw = item.targetKeyword || item.keyword || '';
      const pos = item.position ? ` · pos ${Math.round(item.position)}` : '';
      const score = item.voiceScore;
      const voiceBadge = score >= 8 ? `🟢 ${score}/10` : score >= 5 ? `🟡 ${score}/10` : score ? `🔴 ${score}/10` : '';
      const tier = item.tier ? ` · ${item.tier}` : '';
      return `• *${item.title || kw}*${kw && kw !== item.title ? `\n  keyword: _${kw}_${pos}${tier}` : pos + tier}${voiceBadge ? `  ${voiceBadge}` : ''}`;
    }).join('\n');
    const more = typeItems.length > 8 ? `\n_...and ${typeItems.length - 8} more_` : '';

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `${cfg.icon} *${cfg.label} (${typeItems.length})*\n${itemLines}${more}` },
    });
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: `Review ${brand === 'pickl' ? 'Pickl' : brand === 'bonbird' ? 'Bonbird' : 'All'} Items →` },
        url: SITE_URL,
        style: 'primary',
      },
    ],
  });

  return { blocks };
}

// ─── International SEO items ─────────────────────────────────────────────────
function buildIntlSummary({ market, language, items = [], count }) {
  const flag = market?.flag || '🌍';
  const label = market?.label || 'International';
  const itemLines = items.slice(0, 6).map(i => `• *${i.title || formatType(i.type)}*`).join('\n');
  const more = count > 6 ? `\n_...and ${count - 6} more_` : '';

  return {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `${flag} International SEO — ${label}` } },
      { type: 'section', text: { type: 'mrkdwn', text: `*${count} item${count !== 1 ? 's' : ''}* queued · ${language?.toUpperCase() || 'EN'}\n${itemLines}${more}` } },
      { type: 'divider' },
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Review in The Nest →' }, url: SITE_URL, style: 'primary' }] },
    ],
  };
}

// ─── Perch: task assigned ─────────────────────────────────────────────────────
function buildPerchAssigned({ task, assignedBy }) {
  const brand = task.brand ? (task.brand === 'pickl' ? '🟡 Pickl' : task.brand === 'bonbird' ? '🔴 Bonbird' : task.brand) : '';
  const priority = task.priority === 'high' ? '🔴 High' : task.priority === 'medium' ? '🟡 Medium' : '🟢 Low';
  const due = task.dueDate ? `*Due:* ${new Date(task.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : '';
  const dept = task.department ? ` · ${task.department}` : '';

  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `📌 *Task assigned to you on The Perch*`,
            '',
            `*${task.title}*`,
            `${brand}${dept} · ${priority}`,
            due,
            assignedBy ? `Assigned by: ${assignedBy}` : '',
            task.description ? `\n_${task.description.slice(0, 120)}${task.description.length > 120 ? '…' : ''}_` : '',
          ].filter(Boolean).join('\n'),
        },
      },
      {
        type: 'actions',
        elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open The Perch →' }, url: SITE_URL, style: 'primary' }],
      },
    ],
  };
}

// ─── Perch: task completed ────────────────────────────────────────────────────
function buildPerchDone({ task, completedBy }) {
  const brand = task.brand ? (task.brand === 'pickl' ? '🟡 Pickl' : task.brand === 'bonbird' ? '🔴 Bonbird' : task.brand) : '';
  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `✅ *Done!* — ${task.title}\n${brand}${completedBy ? ` · completed by ${completedBy}` : ''}`,
        },
      },
    ],
  };
}

// ─── Perch: due date alert digest ────────────────────────────────────────────
function buildPerchDueAlert({ overdue = [], dueToday = [], dueSoon = [] }) {
  const total = overdue.length + dueToday.length + dueSoon.length;
  if (total === 0) return { text: 'No overdue or upcoming tasks today.' };

  const fmtTask = t => {
    const due = t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
    const brand = t.brand === 'pickl' ? '🟡' : t.brand === 'bonbird' ? '🔴' : '📌';
    return `${brand} *${t.title}*${t.assigneeName ? ` — ${t.assigneeName}` : ''}${due ? ` (${due})` : ''}`;
  };

  const sections = [];
  if (overdue.length) sections.push(`🚨 *Overdue (${overdue.length}):*\n${overdue.map(fmtTask).join('\n')}`);
  if (dueToday.length) sections.push(`⏰ *Due Today (${dueToday.length}):*\n${dueToday.map(fmtTask).join('\n')}`);
  if (dueSoon.length) sections.push(`📅 *Due This Week (${dueSoon.length}):*\n${dueSoon.map(fmtTask).join('\n')}`);

  return {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🪺 The Perch — Due Date Digest' } },
      { type: 'section', text: { type: 'mrkdwn', text: sections.join('\n\n') } },
      { type: 'divider' },
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open The Perch →' }, url: SITE_URL, style: 'primary' }] },
    ],
  };
}

// ─── Generic fallback ────────────────────────────────────────────────────────
function buildGeneric(body) {
  return { text: `*🪺 The Nest*\n${JSON.stringify(body, null, 2).slice(0, 500)}` };
}

function formatType(type) {
  const labels = { blog_draft: 'Blog Draft', meta_update: 'Meta Update', page_update: 'Page Update', page_creation: 'New Page', onpage_suggestion: 'On-Page Suggestion' };
  return labels[type] || type;
}
