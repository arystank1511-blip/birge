import { Router } from 'express';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { nowISO, tx, type DB } from '../db';
import { HttpError, ctx, idParam, parse } from '../http';
import type { Realtime } from '../realtime';

export const STATUSES = ['todo', 'in_progress', 'review', 'done'] as const;
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
type Status = (typeof STATUSES)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const id = z.number().int().positive();

const fields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000),
  projectId: id,
  status: z.enum(STATUSES),
  priority: z.enum(PRIORITIES),
  dueDate: isoDate.nullable(),
  assigneeId: id.nullable(),
};
// No .default() here: in zod 4 defaults also fire inside .partial(), which would clobber PATCH payloads.
const createSchema = z.object(fields).partial().required({ title: true, projectId: true });
const updateSchema = z
  .object(fields)
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');
const moveSchema = z.object({
  status: z.enum(STATUSES),
  afterId: id.nullable().optional(),
  beforeId: id.nullable().optional(),
});

export const filterSchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  assignee: z.union([z.literal('me'), z.coerce.number().int().positive()]).optional(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
});
export type TaskFilters = z.output<typeof filterSchema>;

/** WHERE clause over aliases t (tasks), p (projects), u (assignee). Always scoped to one workspace. */
export function buildWhere(f: TaskFilters, workspaceId: number, userId: number) {
  const clauses = ['p.workspace_id = ?'];
  const params: SQLInputValue[] = [workspaceId];
  if (f.projectId) {
    clauses.push('t.project_id = ?');
    params.push(f.projectId);
  }
  if (f.assignee !== undefined) {
    clauses.push('t.assignee_id = ?');
    params.push(f.assignee === 'me' ? userId : f.assignee);
  }
  if (f.priority) {
    clauses.push('t.priority = ?');
    params.push(f.priority);
  }
  if (f.status) {
    clauses.push('t.status = ?');
    params.push(f.status);
  }
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    clauses.push(`(t.title LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\')`);
    params.push(like, like, like);
  }
  return { sql: `WHERE ${clauses.join(' AND ')}`, params };
}

export const TASK_FROM = `FROM tasks t
  JOIN projects p ON p.id = t.project_id
  LEFT JOIN users u ON u.id = t.assignee_id`;

const SELECT_TASK = `
  SELECT t.*,
    (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) AS subtask_total,
    (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.done = 1) AS subtask_done,
    (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) AS comment_count
  ${TASK_FROM}`;

interface TaskRow {
  id: number;
  project_id: number;
  title: string;
  description: string;
  status: Status;
  priority: string;
  due_date: string | null;
  assignee_id: number | null;
  position: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  subtask_total: number;
  subtask_done: number;
  comment_count: number;
}

const toTask = (r: TaskRow) => ({
  id: r.id,
  projectId: r.project_id,
  title: r.title,
  description: r.description,
  status: r.status,
  priority: r.priority,
  dueDate: r.due_date,
  assigneeId: r.assignee_id,
  position: r.position,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  completedAt: r.completed_at,
  subtasks: { done: r.subtask_done, total: r.subtask_total },
  commentCount: r.comment_count,
});

export function tasksRouter(db: DB, realtime: Realtime): Router {
  const r = Router({ mergeParams: true });

  const requireTask = (taskId: number, workspaceId: number) => {
    const row = db.prepare(`${SELECT_TASK} WHERE t.id = ? AND p.workspace_id = ?`).get(taskId, workspaceId) as
      | TaskRow
      | undefined;
    if (!row) throw new HttpError(404, 'Task not found');
    return row;
  };
  const ensureProject = (projectId: number, workspaceId: number) => {
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ? AND workspace_id = ?').get(projectId, workspaceId)) {
      throw new HttpError(400, 'Unknown project');
    }
  };
  const ensureMember = (userId: number | null | undefined, workspaceId: number) => {
    if (userId != null && !db.prepare('SELECT 1 FROM memberships WHERE user_id = ? AND workspace_id = ?').get(userId, workspaceId)) {
      throw new HttpError(400, 'Assignee is not a member of this workspace');
    }
  };
  const nextPosition = (status: Status, workspaceId: number) =>
    (
      db
        .prepare(
          `SELECT COALESCE(MAX(t.position), -1) + 1 AS p FROM tasks t JOIN projects p ON p.id = t.project_id
           WHERE t.status = ? AND p.workspace_id = ?`,
        )
        .get(status, workspaceId) as { p: number }
    ).p;
  const completedAt = (status: Status) => (status === 'done' ? nowISO() : null);
  const touch = (taskId: number) => db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(nowISO(), taskId);

  /** Loads a subtask or comment and checks it belongs to a task in this workspace. */
  const requireChild = (table: 'subtasks' | 'comments', childId: number, workspaceId: number) => {
    const row = db
      .prepare(
        `SELECT c.*, t.title AS task_title FROM ${table} c
         JOIN tasks t ON t.id = c.task_id JOIN projects p ON p.id = t.project_id
         WHERE c.id = ? AND p.workspace_id = ?`,
      )
      .get(childId, workspaceId) as Record<string, SQLInputValue> | undefined;
    if (!row) throw new HttpError(404, `${table === 'subtasks' ? 'Subtask' : 'Comment'} not found`);
    return row;
  };

  r.get('/tasks', (req, res) => {
    const { workspaceId, userId } = ctx(res);
    const where = buildWhere(parse(filterSchema, req.query), workspaceId, userId);
    const rows = db
      .prepare(`${SELECT_TASK} ${where.sql} ORDER BY t.status, t.position, t.id`)
      .all(...where.params) as unknown as TaskRow[];
    res.json(rows.map(toTask));
  });

  r.post('/tasks', (req, res) => {
    const { workspaceId, userId } = ctx(res);
    const body = parse(createSchema, req.body);
    ensureProject(body.projectId, workspaceId);
    ensureMember(body.assigneeId, workspaceId);
    const status = body.status ?? 'todo';
    const now = nowISO();
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO tasks (project_id, title, description, status, priority, due_date, assignee_id,
                            position, created_by, created_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        body.projectId,
        body.title,
        body.description ?? '',
        status,
        body.priority ?? 'medium',
        body.dueDate ?? null,
        body.assigneeId ?? null,
        nextPosition(status, workspaceId),
        userId,
        now,
        now,
        completedAt(status),
      );
    const task = toTask(requireTask(Number(lastInsertRowid), workspaceId));
    realtime.emit(req, res, { type: 'task', action: 'created', taskId: task.id, title: task.title });
    res.status(201).json(task);
  });

  r.get('/tasks/:id', (req, res) => {
    const taskId = idParam(req);
    const task = toTask(requireTask(taskId, ctx(res).workspaceId));
    const subtaskList = (
      db.prepare('SELECT id, title, done FROM subtasks WHERE task_id = ? ORDER BY position, id').all(taskId) as {
        id: number;
        title: string;
        done: number;
      }[]
    ).map((s) => ({ id: s.id, title: s.title, done: s.done === 1 }));
    const comments = (
      db
        .prepare(
          `SELECT c.id, c.body, c.created_at, u.id AS user_id, u.name, u.color
           FROM comments c LEFT JOIN users u ON u.id = c.user_id
           WHERE c.task_id = ? ORDER BY c.created_at, c.id`,
        )
        .all(taskId) as {
        id: number;
        body: string;
        created_at: string;
        user_id: number | null;
        name: string | null;
        color: string | null;
      }[]
    ).map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.created_at,
      author: c.user_id ? { id: c.user_id, name: c.name, color: c.color } : null,
    }));
    res.json({ ...task, subtaskList, comments });
  });

  r.patch('/tasks/:id', (req, res) => {
    const taskId = idParam(req);
    const { workspaceId } = ctx(res);
    const current = requireTask(taskId, workspaceId);
    const body = parse(updateSchema, req.body);
    if (body.projectId !== undefined) ensureProject(body.projectId, workspaceId);
    ensureMember(body.assigneeId, workspaceId);

    const columns = {
      title: 'title',
      description: 'description',
      projectId: 'project_id',
      priority: 'priority',
      dueDate: 'due_date',
      assigneeId: 'assignee_id',
    } as const;
    const sets: string[] = [];
    const params: SQLInputValue[] = [];
    for (const [key, column] of Object.entries(columns)) {
      const value = body[key as keyof typeof columns];
      if (value !== undefined) {
        sets.push(`${column} = ?`);
        params.push(value);
      }
    }
    const statusChanged = body.status !== undefined && body.status !== current.status;
    if (statusChanged) {
      sets.push('status = ?', 'position = ?', 'completed_at = ?');
      params.push(body.status!, nextPosition(body.status!, workspaceId), completedAt(body.status!));
    }
    sets.push('updated_at = ?');
    params.push(nowISO());
    db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params, taskId);
    const task = toTask(requireTask(taskId, workspaceId));
    realtime.emit(req, res, {
      type: 'task',
      action: statusChanged ? 'moved' : 'updated',
      taskId,
      title: task.title,
      status: task.status,
    });
    res.json(task);
  });

  // Reorder by neighbours rather than index so moves stay correct while the client shows a filtered board.
  r.post('/tasks/:id/move', (req, res) => {
    const taskId = idParam(req);
    const { workspaceId } = ctx(res);
    const current = requireTask(taskId, workspaceId);
    const { status, afterId, beforeId } = parse(moveSchema, req.body);

    tx(db, () => {
      const ids = (
        db
          .prepare(
            `SELECT t.id FROM tasks t JOIN projects p ON p.id = t.project_id
             WHERE t.status = ? AND t.id != ? AND p.workspace_id = ? ORDER BY t.position, t.id`,
          )
          .all(status, taskId, workspaceId) as { id: number }[]
      ).map((row) => row.id);
      let index = ids.length;
      if (afterId != null && ids.includes(afterId)) index = ids.indexOf(afterId) + 1;
      else if (beforeId != null && ids.includes(beforeId)) index = ids.indexOf(beforeId);
      ids.splice(index, 0, taskId);

      const setPosition = db.prepare('UPDATE tasks SET position = ? WHERE id = ?');
      ids.forEach((tid, i) => setPosition.run(i, tid));
      if (status !== current.status) {
        db.prepare('UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?').run(
          status,
          completedAt(status),
          nowISO(),
          taskId,
        );
      }
    });
    const task = toTask(requireTask(taskId, workspaceId));
    realtime.emit(req, res, {
      type: 'task',
      action: status !== current.status ? 'moved' : 'reordered',
      taskId,
      title: task.title,
      status,
    });
    res.json(task);
  });

  r.delete('/tasks/:id', (req, res) => {
    const taskId = idParam(req);
    const task = requireTask(taskId, ctx(res).workspaceId);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
    realtime.emit(req, res, { type: 'task', action: 'deleted', taskId, title: task.title });
    res.status(204).end();
  });

  // Subtasks
  const subtaskCreate = z.object({ title: z.string().trim().min(1).max(200) });
  const subtaskUpdate = z
    .object({ title: z.string().trim().min(1).max(200), done: z.boolean() })
    .partial()
    .refine((o) => Object.keys(o).length > 0, 'Nothing to update');

  r.post('/tasks/:id/subtasks', (req, res) => {
    const taskId = idParam(req);
    const task = requireTask(taskId, ctx(res).workspaceId);
    const { title } = parse(subtaskCreate, req.body);
    const position = (db.prepare('SELECT COUNT(*) AS n FROM subtasks WHERE task_id = ?').get(taskId) as { n: number }).n;
    const { lastInsertRowid } = db
      .prepare('INSERT INTO subtasks (task_id, title, done, position) VALUES (?, ?, 0, ?)')
      .run(taskId, title, position);
    touch(taskId);
    realtime.emit(req, res, { type: 'task', action: 'subtask', taskId, title: task.title });
    res.status(201).json({ id: Number(lastInsertRowid), title, done: false });
  });

  r.patch('/subtasks/:id', (req, res) => {
    const subtaskId = idParam(req);
    const body = parse(subtaskUpdate, req.body);
    const row = requireChild('subtasks', subtaskId, ctx(res).workspaceId);
    const title = body.title ?? (row.title as string);
    const done = body.done ?? row.done === 1;
    db.prepare('UPDATE subtasks SET title = ?, done = ? WHERE id = ?').run(title, done ? 1 : 0, subtaskId);
    touch(row.task_id as number);
    realtime.emit(req, res, { type: 'task', action: 'subtask', taskId: row.task_id, title: row.task_title });
    res.json({ id: subtaskId, title, done });
  });

  r.delete('/subtasks/:id', (req, res) => {
    const subtaskId = idParam(req);
    const row = requireChild('subtasks', subtaskId, ctx(res).workspaceId);
    db.prepare('DELETE FROM subtasks WHERE id = ?').run(subtaskId);
    realtime.emit(req, res, { type: 'task', action: 'subtask', taskId: row.task_id, title: row.task_title });
    res.status(204).end();
  });

  // Comments
  const commentCreate = z.object({ body: z.string().trim().min(1).max(2000) });

  r.post('/tasks/:id/comments', (req, res) => {
    const taskId = idParam(req);
    const { workspaceId, userId } = ctx(res);
    const task = requireTask(taskId, workspaceId);
    const { body } = parse(commentCreate, req.body);
    const createdAt = nowISO();
    const { lastInsertRowid } = db
      .prepare('INSERT INTO comments (task_id, user_id, body, created_at) VALUES (?, ?, ?, ?)')
      .run(taskId, userId, body, createdAt);
    const author = db.prepare('SELECT id, name, color FROM users WHERE id = ?').get(userId);
    realtime.emit(req, res, { type: 'task', action: 'commented', taskId, title: task.title });
    res.status(201).json({ id: Number(lastInsertRowid), body, createdAt, author });
  });

  r.delete('/comments/:id', (req, res) => {
    const commentId = idParam(req);
    const { workspaceId, userId } = ctx(res);
    const row = requireChild('comments', commentId, workspaceId);
    if (row.user_id !== userId) throw new HttpError(403, 'You can only delete your own comments');
    db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
    realtime.emit(req, res, { type: 'task', action: 'comment-deleted', taskId: row.task_id, title: row.task_title });
    res.status(204).end();
  });

  return r;
}
