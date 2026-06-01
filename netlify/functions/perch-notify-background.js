// netlify/functions/perch-notify-background.js
// Daily Perch due date digest. Runs every morning at 5am UTC (9am Dubai).
// Checks all open tasks for:
//   - Overdue (dueDate < today, status !== done)
//   - Due today
//   - Due in the next 3 days (due soon)
//
// Sends one grouped Slack notification covering all three buckets.
// Skips silently if no Slack webhook is configured.

const { getSetting } = require('./_lib/store');

const SITE_URL = process.env.URL || 'https://yolkseo.netlify.app';

exports.handler = async () => {
  try {
    const index = await getSetting('perchIndex').catch(() => []);
    if (!index || !index.length) return;

    const now     = Date.now();
    const today   = startOfDay(now);
    const in3days = today + 3 * 24 * 60 * 60 * 1000;

    const overdue  = [];
    const dueToday = [];
    const dueSoon  = [];

    for (const id of index) {
      try {
        const task = await getSetting('perchTask:' + id);
        if (!task || task.status === 'done' || !task.dueDate) continue;

        const due = new Date(task.dueDate).getTime();
        const dueDay = startOfDay(due);

        const enriched = {
          ...task,
          assigneeName: task.assignee?.split('@')[0] || null,
        };

        if (dueDay < today) {
          overdue.push(enriched);
        } else if (dueDay === today) {
          dueToday.push(enriched);
        } else if (dueDay <= in3days) {
          dueSoon.push(enriched);
        }
      } catch { /* skip missing tasks */ }
    }

    const total = overdue.length + dueToday.length + dueSoon.length;
    if (total === 0) {
      console.log('[perch-notify] No due date alerts today.');
      return;
    }

    // Sort each group by due date (oldest first)
    const byDue = (a, b) => new Date(a.dueDate) - new Date(b.dueDate);
    overdue.sort(byDue);
    dueToday.sort(byDue);
    dueSoon.sort(byDue);

    await fetch(`${SITE_URL}/.netlify/functions/slack-notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'perch_due_alert',
        overdue,
        dueToday,
        dueSoon,
      }),
    });

    console.log(`[perch-notify] Sent due alert: ${overdue.length} overdue, ${dueToday.length} today, ${dueSoon.length} soon.`);
  } catch (e) {
    console.error('[perch-notify] Error:', e.message);
  }
};

// Returns midnight (UTC) timestamp for a given timestamp
function startOfDay(ts) {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
