// netlify/functions/tech-tasks.js
// Developer kanban for Technical SEO tab.
//
// GET    /api/tech-tasks?brand=pickl        — list tasks for brand
// POST   /api/tech-tasks                    — create task (from Action Engine or manual)
// PATCH  /api/tech-tasks?id=<id>           — update status (todo/inprogress/done)
// DELETE /api/tech-tasks?id=<id>           — delete task (admin only)

const { getSetting, setSetting, ok, bad, preflight, parseBody, newId } = require('./_lib/store');

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

  // ── POST: create task ────────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    try {
      const body  = parseBody(event) || {};
      const { title, description, brand, priority, source } = body;
      if (!title?.trim()) return bad(400, 'title required');
      if (!brand)         return bad(400, 'brand required');
      const id   = newId('tech');
      const task = {
        id, title: title.trim(), description: description || '',
        brand, priority: priority || 'medium', status: 'todo',
        source: source || 'action_engine',
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      await setSetting(`techTask:${id}`, task);
      const index = await getSetting(`techTaskIndex:${brand}`).catch(() => []);
      await setSetting(`techTaskIndex:${brand}`, [...(index || []), id]);
      return ok({ task });
    } catch (e) { return bad(500, e.message); }
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
