// netlify/functions/tech-tasks.js
// Developer kanban for Technical SEO tab.
// Tasks are auto-created by technical-seo-background.js — never manually.
//
// GET  /api/tech-tasks?brand=pickl         — list tasks for brand
// PATCH /api/tech-tasks?id=<id>            — update status (todo/inprogress/done)
// DELETE /api/tech-tasks?id=<id>           — delete task (admin only)

const { getSetting, setSetting, ok, bad, preflight, parseBody } = require('./_lib/store');

const VALID_STATUSES = ['todo', 'inprogress', 'done'];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  if (event.httpMethod === 'GET') {
    const brand = event.queryStringParameters?.brand;
    if (!brand) return bad(400, 'brand required');

    try {
      const index = await getSetting(`techTaskIndex:${brand}`).catch(() => []);
      const tasks = [];
      for (const id of (index || [])) {
        try {
          const task = await getSetting(`techTask:${id}`);
          if (task) tasks.push(task);
        } catch { /* skip */ }
      }
      tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return ok({ tasks });
    } catch (e) {
      return bad(500, e.message);
    }
  }

  if (event.httpMethod === 'PATCH') {
    const id   = event.queryStringParameters?.id;
    const body = parseBody(event) || {};
    if (!id) return bad(400, 'id required');

    try {
      const task = await getSetting(`techTask:${id}`).catch(() => null);
      if (!task) return bad(404, 'Task not found');

      if (body.status && !VALID_STATUSES.includes(body.status)) return bad(400, 'Invalid status');

      const updated = { ...task, ...Object.fromEntries(Object.entries(body).filter(([k]) => ['status','notes'].includes(k))), updatedAt: Date.now() };
      await setSetting(`techTask:${id}`, updated);
      return ok({ task: updated });
    } catch (e) {
      return bad(500, e.message);
    }
  }

  if (event.httpMethod === 'DELETE') {
    const id = event.queryStringParameters?.id;
    if (!id) return bad(400, 'id required');

    try {
      const task = await getSetting(`techTask:${id}`).catch(() => null);
      if (!task) return bad(404, 'Task not found');

      const index   = await getSetting(`techTaskIndex:${task.brand}`).catch(() => []);
      await setSetting(`techTaskIndex:${task.brand}`, (index || []).filter(i => i !== id));
      return ok({ deleted: true });
    } catch (e) {
      return bad(500, e.message);
    }
  }

  return bad(405, 'Method not allowed');
};
