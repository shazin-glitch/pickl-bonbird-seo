// netlify/functions/perch.js
// The Perch — marketing team kanban task management.
//
// GET  /api/perch           — list tasks visible to current user
// POST /api/perch           — create task
// PATCH /api/perch?id=<id>  — update task (status, fields, add comment)
// DELETE /api/perch?id=<id> — delete task (admin or creator only)
//
// Visibility rules:
//   Admin    → sees everything
//   Manager  → sees all tasks for their brand(s) + dark kitchen siblings
//   Others   → sees tasks in their brand + department + dark kitchen sibling
//              + any task they created, are assigned to, or are a collaborator on
//
// Dark kitchen sibling rule:
//   Pickl team    → also sees Shadowburg
//   Bonbird team  → also sees Shadowbird
//   Southpour     → standalone, no sibling

const { getStore } = require('@netlify/blobs');
const { newId, getSetting, setSetting, logAudit, ok, bad, preflight, parseBody, CORS } = require('./_lib/store');

const SITE_URL = process.env.URL || 'https://yolkseo.netlify.app';

// ── Fire-and-forget Slack notification ──────────────────────────────────────
async function notifySlack(type, data) {
  try {
    await fetch(`${SITE_URL}/.netlify/functions/slack-notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...data }),
    });
  } catch (e) {
    console.warn('[perch] Slack notify failed:', e.message);
  }
}

const BOOTSTRAP_ADMINS = ['shazin@yolkbrands.com', 'steve@yolkbrands.com'];

const BRAND_SIBLINGS = {
  pickl:      ['pickl', 'shadowburg'],
  bonbird:    ['bonbird', 'shadowbird'],
  southpour:  ['southpour'],
  shadowburg: ['pickl', 'shadowburg'],
  shadowbird: ['bonbird', 'shadowbird'],
};

function getVisibleBrands(brand) {
  return BRAND_SIBLINGS[brand] || (brand ? [brand] : []);
}

function getUserBrands(user) {
  // Support new brands array and old single brand string
  if (Array.isArray(user.brands) && user.brands.length) return user.brands;
  if (user.brand) return [user.brand];
  return [];
}

function canSeeTask(task, user) {
  if (user.role === 'admin') return true;

  const userBrands   = getUserBrands(user);
  const allBrands    = userBrands.includes('all');
  const allDepts     = user.department === 'all';

  // Build visible brand list (including dark kitchen siblings)
  const visibleBrands = allBrands
    ? null
    : [...new Set(userBrands.flatMap(b => getVisibleBrands(b)))];

  if (user.role === 'manager') {
    if (allBrands) return true;
    return visibleBrands.includes(task.brand) || task.brand === 'all';
  }

  const brandOk = allBrands || (visibleBrands && (visibleBrands.includes(task.brand) || task.brand === 'all'));
  const deptOk  = allDepts  || task.department === user.department;
  if (brandOk && deptOk) return true;

  return task.assignee === user.email
    || task.createdBy === user.email
    || (task.collaborators || []).includes(user.email);
}

function canEditTask(task, user) {
  if (user.role === 'admin') return true;
  if (user.role === 'manager') return true;
  return task.createdBy === user.email || task.assignee === user.email;
}

// ── Read session cookie and return full user object ───────────────────────────
async function getCurrentUser(event) {
  try {
    const cookieStr = event.headers?.cookie || '';
    const cookies   = Object.fromEntries(
      cookieStr.split(';')
        .map(c => c.trim())
        .filter(Boolean)
        .map(c => { const i = c.indexOf('='); return [c.slice(0,i), c.slice(i+1)]; })
    );
    const token = cookies['yolk_session'];
    if (!token) return null;

    const store = getStore({ name: 'seo-tool', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    const session = await store.get(`userSession:${token}`, { type: 'json' });
    if (!session?.email) return null;

    const email = session.email;

    let role = 'viewer';
    if (BOOTSTRAP_ADMINS.includes(email)) {
      role = 'admin';
    } else {
      try {
        const rec = await store.get(`userRole:${email}`, { type: 'json' });
        role = rec?.role || 'viewer';
      } catch { /* viewer */ }
    }

    let brand = null, department = null, brands = null;
    try {
      const profile = await store.get(`userProfile:${email}`, { type: 'json' });
      brands     = profile?.brands     || (profile?.brand ? [profile.brand] : null);
      brand      = profile?.brand      || null;
      department = profile?.department || null;
    } catch { /* null */ }

    return { email, name: session.name, role, brand, brands, department };
  } catch (e) {
    console.error('[perch] Auth error:', e.message);
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  const user = await getCurrentUser(event);
  if (!user) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Not authenticated' }) };

  // ── GET: list tasks visible to this user ───────────────────────────────────
  if (event.httpMethod === 'GET') {
    try {
      const index   = await getSetting('perchIndex').catch(() => []);
      const ids     = index || [];

      // Fetch all tasks in parallel — sequential await was causing N × latency slowness
      const settled = await Promise.all(
        ids.map(id => getSetting('perchTask:' + id).catch(() => null))
      );
      const tasks = settled.filter(t => t && canSeeTask(t, user));

      // Sort by createdAt desc
      tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      return ok({ tasks, currentUser: { email: user.email, role: user.role, brand: user.brand, department: user.department } });
    } catch (e) {
      return bad(500, e.message);
    }
  }

  // ── POST: create task ──────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    try {
      const body = parseBody(event) || {};
      const { title, description, brand, department, assignee, dueDate, priority, collaborators, source, sourceId } = body;

      if (!title?.trim()) return bad(400, 'title is required');

      const id   = newId('task');
      const task = {
        id,
        title:         title.trim(),
        description:   description || '',
        brand:         brand        || user.brand || 'all',
        department:    department   || user.department || 'seo',
        assignee:      assignee     || user.email,
        collaborators: collaborators || [],
        dueDate:       dueDate      || null,
        priority:      priority     || 'medium',
        status:        'todo',
        createdBy:     user.email,
        createdAt:     Date.now(),
        updatedAt:     Date.now(),
        source:        source       || 'manual',
        sourceId:      sourceId     || null,
        comments:      [],
        auditLog:      [{ action: 'created', actor: user.email, actorName: user.name, timestamp: Date.now() }],
      };

      await setSetting('perchTask:' + id, task);
      const index = await getSetting('perchIndex').catch(() => []);
      await setSetting('perchIndex', [...(index || []), id]);
      await logAudit({ action: 'perch_task_created', actor: user.email, details: { id, title: task.title, brand: task.brand, department: task.department } });

      // Slack: notify if assigned to someone other than the creator
      if (task.assignee && task.assignee !== user.email) {
        notifySlack('perch_assigned', { task, assignedBy: user.name || user.email }).catch(() => {});
      }

      return ok({ task });
    } catch (e) {
      return bad(500, e.message);
    }
  }

  // ── PATCH: update task ─────────────────────────────────────────────────────
  if (event.httpMethod === 'PATCH') {
    try {
      const id   = event.queryStringParameters?.id;
      const body = parseBody(event) || {};
      if (!id) return bad(400, 'id required');

      const task = await getSetting('perchTask:' + id).catch(() => null);
      if (!task)                        return bad(404, 'Task not found');
      if (!canSeeTask(task, user))      return bad(403, 'Access denied');
      if (!canEditTask(task, user))     return bad(403, 'Only admin, creator, or assignee can edit this task');

      const EDITABLE = ['title', 'description', 'brand', 'department', 'assignee', 'dueDate', 'priority', 'status', 'collaborators', 'labels'];
      const changes  = Object.fromEntries(Object.entries(body).filter(([k]) => EDITABLE.includes(k)));

      const updatedTask = {
        ...task,
        ...changes,
        updatedAt: Date.now(),
        auditLog:  [...(task.auditLog || []), {
          action:     'updated',
          actor:       user.email,
          actorName:   user.name,
          changes:     Object.keys(changes),
          timestamp:   Date.now(),
        }],
      };

      // Append comment if provided
      if (body.comment?.trim()) {
        updatedTask.comments = [...(task.comments || []), {
          author:     user.email,
          authorName: user.name,
          text:       body.comment.trim(),
          timestamp:  Date.now(),
        }];
      }

      await setSetting('perchTask:' + id, updatedTask);
      await logAudit({ action: 'perch_task_updated', actor: user.email, details: { id, changes: Object.keys(changes) } });

      // Slack: notify on assignee change (new assignee gets pinged)
      if (changes.assignee && changes.assignee !== task.assignee && changes.assignee !== user.email) {
        notifySlack('perch_assigned', { task: updatedTask, assignedBy: user.name || user.email }).catch(() => {});
      }
      // Slack: notify on status change to 'done'
      if (changes.status === 'done' && task.status !== 'done') {
        notifySlack('perch_done', { task: updatedTask, completedBy: user.name || user.email }).catch(() => {});
      }

      return ok({ task: updatedTask });
    } catch (e) {
      return bad(500, e.message);
    }
  }

  // ── DELETE: remove task ────────────────────────────────────────────────────
  if (event.httpMethod === 'DELETE') {
    try {
      const id = event.queryStringParameters?.id;
      if (!id) return bad(400, 'id required');

      const task = await getSetting('perchTask:' + id).catch(() => null);
      if (!task) return bad(404, 'Task not found');

      if (user.role !== 'admin' && task.createdBy !== user.email) {
        return bad(403, 'Only admin or creator can delete this task');
      }

      const index = await getSetting('perchIndex').catch(() => []);
      await store().delete('perchTask:' + id).catch(() => {});
      await setSetting('perchIndex', (index || []).filter(i => i !== id));
      await logAudit({ action: 'perch_task_deleted', actor: user.email, details: { id, title: task.title } });

      return ok({ deleted: true });
    } catch (e) {
      return bad(500, e.message);
    }
  }

  return bad(405, 'Method not allowed');
};
