// netlify/functions/slack-callback.js
// Handles Slack interactive component callbacks (button clicks on Slack messages).
// When a user clicks "Approve" or "Dismiss" on a Slack notification, Slack POSTs here.
//
// Setup required in your Slack App:
//   Settings → Interactivity & Shortcuts → Request URL:
//   https://yolkseo.netlify.app/api/slack-callback
//
// Supported actions:
//   approve_item  — approves an SEO approval item
//   dismiss_item  — dismisses/rejects an SEO approval item

const { getSetting, setSetting, getStore } = require('./_lib/store');

const SITE_URL = process.env.URL || 'https://yolkseo.netlify.app';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    // Slack sends the payload as URL-encoded form data: payload=JSON
    const params = new URLSearchParams(event.body);
    const payloadStr = params.get('payload');
    if (!payloadStr) {
      return { statusCode: 400, body: 'Missing payload' };
    }

    const payload = JSON.parse(payloadStr);
    const { actions, user, response_url, message } = payload;
    if (!actions || !actions.length) {
      return { statusCode: 400, body: 'No actions in payload' };
    }

    const action = actions[0];
    const actionId = action.action_id; // 'approve_item' or 'dismiss_item'
    const itemId   = action.value;     // approval item ID

    if (!itemId) {
      await respondToSlack(response_url, { text: '⚠️ Could not identify item. Please review in The Nest.' });
      return { statusCode: 200, body: '' };
    }

    // Load the approval item
    const item = await getSetting(`approvals:${itemId}`).catch(() => null);
    if (!item) {
      await respondToSlack(response_url, { text: `⚠️ Item \`${itemId}\` not found — it may have already been processed.` });
      return { statusCode: 200, body: '' };
    }

    const slackUser = user?.name || user?.username || 'Someone';
    const brandLabel = item.brand === 'pickl' ? '🟡 Pickl' : item.brand === 'bonbird' ? '🔴 Bonbird' : item.brand;

    if (actionId === 'approve_item') {
      item.status = 'approved';
      item.approvedAt = Date.now();
      item.approvedBy = slackUser + ' (via Slack)';
      await setSetting(`approvals:${itemId}`, item);

      await respondToSlack(response_url, {
        replace_original: true,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Approved* by ${slackUser}\n*${item.payload?.title || itemId}*\n${brandLabel} · ${formatType(item.type)}`,
            },
          },
          {
            type: 'actions',
            elements: [{ type: 'button', text: { type: 'plain_text', text: 'View in The Nest →' }, url: SITE_URL }],
          },
        ],
      });
    } else if (actionId === 'dismiss_item') {
      item.status = 'rejected';
      item.rejectedAt = Date.now();
      item.rejectedBy = slackUser + ' (via Slack)';
      await setSetting(`approvals:${itemId}`, item);

      await respondToSlack(response_url, {
        replace_original: true,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `❌ *Dismissed* by ${slackUser}\n*${item.payload?.title || itemId}*\n${brandLabel} · ${formatType(item.type)}`,
            },
          },
        ],
      });
    } else if (actionId === 'approve_calendar_post') {
      const res  = await fetch(`${SITE_URL}/api/calendar`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', id: itemId, actor: slackUser + ' (via Slack)', actorEmail: '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await respondToSlack(response_url, { text: `⚠️ Could not approve: ${data.error || res.status}. Open The Nest to approve manually.` });
      } else {
        const post = data.post || {};
        const allDone = data.allApproved;
        await respondToSlack(response_url, {
          replace_original: true,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: allDone
              ? `✅ *Fully approved!* All approvers have signed off.\n*${post.brand?.toUpperCase()} · ${post.market}* — ${post.scheduledDate || ''}`
              : `✅ *Approved* by ${slackUser} (partial — waiting on other approvers)\n*${post.brand?.toUpperCase()} · ${post.market}*` }},
            { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'View in The Nest →' }, url: `${SITE_URL}/?post=${itemId}` }] },
          ],
        });
      }

    } else if (actionId === 'request_changes_calendar_post') {
      // Can't ask for a text input via webhooks alone — redirect to The Nest
      await respondToSlack(response_url, {
        replace_original: false,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `💬 To request changes with a comment, open the post in The Nest.` } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: '✏️ Open post →', emoji: true }, style: 'primary', url: `${SITE_URL}/?post=${itemId}` },
          ]},
        ],
      });

    } else {
      // Unknown action — just acknowledge
      await respondToSlack(response_url, { text: `Received action: ${actionId}` });
    }

    return { statusCode: 200, body: '' };
  } catch (err) {
    console.error('[slack-callback] Error:', err.message);
    // Always return 200 to Slack to avoid retries
    return { statusCode: 200, body: JSON.stringify({ error: err.message }) };
  }
};

async function respondToSlack(responseUrl, payload) {
  if (!responseUrl) return;
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error('[slack-callback] Failed to respond to Slack:', e.message);
  }
}

function formatType(type) {
  const labels = { blog_draft: 'Blog Draft', meta_update: 'Meta Update', page_update: 'Page Update', page_creation: 'New Page', onpage_suggestion: 'On-Page Suggestion' };
  return labels[type] || type;
}
