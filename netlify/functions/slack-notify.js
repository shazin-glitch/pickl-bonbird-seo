// netlify/functions/slack-notify.js
// Sends a Slack notification to the configured webhook URL.
// Webhook URL is read from Netlify Blobs (set via Settings tab) or SLACK_WEBHOOK_URL env var.

const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // Get webhook URL — Blobs takes priority over env var
  let webhookUrl = process.env.SLACK_WEBHOOK_URL || '';
  try {
    const store = getStore({
      name:   'seo-tool',
      siteID: process.env.NETLIFY_SITE_ID,
      token:  process.env.NETLIFY_AUTH_TOKEN,
    });
    const dbData = await store.get('slackWebhookUrl', { type: 'json' });
    if (dbData) webhookUrl = dbData;
  } catch { /* use env var fallback */ }

  if (!webhookUrl) {
    return { statusCode: 200, headers, body: JSON.stringify({ skipped: true, reason: 'No Slack webhook URL configured' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { type, brand, items = [], count, market, language } = body;

    let message = '';

    if (type === 'queue_summary') {
      // Weekly scheduler summary
      const brandLabel = brand === 'pickl' ? '🟡 Pickl' : brand === 'bonbird' ? '🔴 Bonbird' : '🟡🔴 Pickl & Bonbird';
      message = buildQueueSummary(brandLabel, items, count);
    } else if (type === 'international_queue') {
      // International SEO items queued
      const flag  = market?.flag || '🌍';
      const label = market?.label || 'International';
      message = buildIntlSummary(flag, label, language, items, count);
    } else {
      message = buildGenericNotification(body);
    }

    const slackRes = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text: message }),
    });

    if (!slackRes.ok) {
      throw new Error(`Slack responded ${slackRes.status}`);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ sent: true }) };

  } catch (err) {
    console.error('[slack-notify] Error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

function buildQueueSummary(brandLabel, items, count) {
  const typeGroups = {};
  for (const item of items) {
    const t = item.type || 'other';
    typeGroups[t] = (typeGroups[t] || 0) + 1;
  }

  const breakdown = Object.entries(typeGroups)
    .map(([type, n]) => `• ${n} ${formatType(type)}`)
    .join('\n');

  return [
    `*🚀 Yolk SEO — ${count} new action${count !== 1 ? 's' : ''} queued*`,
    `Brand: ${brandLabel}`,
    '',
    breakdown,
    '',
    `<https://yolkseo.netlify.app|Review in SEO Command Center →>`,
  ].join('\n');
}

function buildIntlSummary(flag, label, language, items, count) {
  return [
    `*${flag} International SEO — ${label} ${language?.toUpperCase() || ''}*`,
    `${count} item${count !== 1 ? 's' : ''} queued for review`,
    '',
    ...items.slice(0, 5).map(i => `• ${formatType(i.type)}: ${i.title || ''}`),
    count > 5 ? `• ...and ${count - 5} more` : '',
    '',
    `<https://yolkseo.netlify.app|Review in SEO Command Center →>`,
  ].filter(l => l !== undefined).join('\n');
}

function buildGenericNotification(body) {
  return `*Yolk SEO Notification*\n${JSON.stringify(body, null, 2).slice(0, 500)}`;
}

function formatType(type) {
  const labels = {
    blog_draft:        'Blog Drafts',
    meta_update:       'Meta Updates',
    page_update:       'Page Updates',
    page_creation:     'New Pages',
    onpage_suggestion: 'On-Page Suggestions',
    review_response:   'Review Responses',
  };
  return labels[type] || type;
}
