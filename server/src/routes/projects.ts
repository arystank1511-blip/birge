import { Router } from 'express';
import { z } from 'zod';
import { nowISO, type DB } from '../db';
import { HttpError, ctx, idParam, parse, requireRole } from '../http';
import type { Realtime } from '../realtime';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a hex color like #aabbcc');
const createSchema = z.object({ name: z.string().trim().min(1).max(60), color: hexColor });
const updateSchema = createSchema.partial();

interface ProjectRow {
  id: number;
  name: string;
  color: string;
  task_count: number;
  open_count: number;
}

const toProject = (r: ProjectRow) => ({
  id: r.id,
  name: r.name,
  color: r.color,
  taskCount: r.task_count,
  openCount: r.open_count,
});

const SELECT_PROJECT = `
  SELECT p.id, p.name, p.color,
         COUNT(t.id) AS task_count,
         COALESCE(SUM(CASE WHEN t.status != 'done' THEN 1 ELSE 0 END), 0) AS open_count
  FROM projects p
  LEFT JOIN tasks t ON t.project_id = p.id`;

export function projectsRouter(db: DB, realtime: Realtime): Router {
  const r = Router({ mergeParams: true });
  const getProject = (id: number, workspaceId: number) => {
    const row = db
      .prepare(`${SELECT_PROJECT} WHERE p.id = ? AND p.workspace_id = ? GROUP BY p.id`)
      .get(id, workspaceId) as ProjectRow | undefined;
    if (!row) throw new HttpError(404, 'Project not found');
    return toProject(row);
  };

  r.get('/', (_req, res) => {
    const rows = db
      .prepare(`${SELECT_PROJECT} WHERE p.workspace_id = ? GROUP BY p.id ORDER BY p.created_at, p.id`)
      .all(ctx(res).workspaceId) as unknown as ProjectRow[];
    res.json(rows.map(toProject));
  });

  r.post('/', requireRole('admin'), (req, res) => {
    const body = parse(createSchema, req.body);
    const { workspaceId, userId } = ctx(res);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO projects (workspace_id, name, color, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(workspaceId, body.name, body.color, userId, nowISO());
    const project = getProject(Number(lastInsertRowid), workspaceId);
    realtime.emit(req, res, { type: 'project', action: 'created', projectId: project.id, name: project.name });
    res.status(201).json(project);
  });

  r.patch('/:id', requireRole('admin'), (req, res) => {
    const id = idParam(req);
    const { workspaceId } = ctx(res);
    getProject(id, workspaceId);
    const body = parse(updateSchema, req.body);
    if (body.name !== undefined) db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(body.name, id);
    if (body.color !== undefined) db.prepare('UPDATE projects SET color = ? WHERE id = ?').run(body.color, id);
    const project = getProject(id, workspaceId);
    realtime.emit(req, res, { type: 'project', action: 'updated', projectId: id, name: project.name });
    res.json(project);
  });

  r.delete('/:id', requireRole('admin'), (req, res) => {
    const id = idParam(req);
    const { changes } = db.prepare('DELETE FROM projects WHERE id = ? AND workspace_id = ?').run(id, ctx(res).workspaceId);
    if (!changes) throw new HttpError(404, 'Project not found');
    realtime.emit(req, res, { type: 'project', action: 'deleted', projectId: id });
    res.status(204).end();
  });

  return r;
}
