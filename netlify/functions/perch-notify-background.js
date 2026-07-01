// netlify/functions/perch-notify-background.js
// Daily Perch due date digest. Runs every morning at 5am UTC (9am Dubai).
// Checks all open tasks for:
//   - Overdue (dueDate < today, status !== done)
//   - Due today
//   - Due in the next 3 days (due soon)
//
// Also checks for Story/Reel calendar posts scheduled for today that are approved
// but not yet published, and sends a manual-post reminder.
//
// Sends one grouped Slack notification covering all three buckets.
// Skips silently if no Slack webhook is configured.

const { getSetting } = require('./_lib/store');
const { internalHeaders, authorizeJob } = require('./_lib/auth');

const SITE_URL = process.env.URL || 'https://yolkseo.netlify.app';
const BRANDS   = ['pickl', 'bonbird', 'southpour', 'shadowburg', 'shadowbird'];

exports.handler = async (event) => {
  const _job = await authorizeJob(event);
  if (!_job.ok) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not authenticated' }) };
  try {
    // ── Story/Reel manual post reminder ──────────────────────────────────────
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const manualDue = [];
    for (const brand of BRANDS) {
      const calIndex = await getSetting(`calendarIndex:${brand}`).catch(() => []);
      if (!calIndex || !calIndex.length) continue;
      for (const id of calIndex) {
        try {
          const post = await getSetting(`calendarPost:${id}`);
          if (!post) continue;
          if (post.status !== 'approved') continue;
          if (post.postType !== 'story' && post.postType !== 'reel') continue;
          if (post.scheduledDate !== todayStr) continue;
          manualDue.push(post);
        } catch { /* skip missing */ }
      }
    }
    if (manualDue.length) {
      await fetch(`${SITE_URL}/.netlify/functions/slack-notify`, {
        method: 'POST',
        headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ type: 'calendar_manual_reminder', posts: manualDue }),
      });
      console.log(`[perch-notify] Sent manual reminder for ${manualDue.length} story/reel post(s).`);
    }

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
      headers: internalHeaders({ 'Content-Type': 'application/json' }),
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
