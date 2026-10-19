import { Router } from 'express';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { nowISO, type DB } from '../db';
import { HttpError, ctx, idParam, parse, requireRole } from '../http';
import type { Realtime } from '../realtime';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a hex color like #aabbcc');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const fields = {
  name: z.string().trim().min(1).max(60),
  color: hexColor,
  description: z.string().trim().max(500),
  leadId: z.number().int().positive().nullable(),
  startDate: isoDate.nullable(),
  dueDate: isoDate.nullable(),
};
const createSchema = z.object(fields).partial().required({ name: true, color: true });
const updateSchema = z
  .object(fields)
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');

interface ProjectRow {
  id: number;
  name: string;
  color: string;
  description: string;
  lead_id: number | null;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
  task_count: number;
  open_count: number;
}

const toProject = (r: ProjectRow) => ({
  id: r.id,
  name: r.name,
  color: r.color,
  description: r.description,
  leadId: r.lead_id,
  startDate: r.start_date,
  dueDate: r.due_date,
  createdAt: r.created_at,
  taskCount: r.task_count,
  openCount: r.open_count,
});

const SELECT_PROJECT = `
  SELECT p.id, p.name, p.color, p.description, p.lead_id, p.start_date, p.due_date, p.created_at,
         COUNT(t.id) AS task_count,
         COALESCE(SUM(CASE WHEN t.status != 'done' THEN 1 ELSE 0 END), 0) AS open_count
  FROM projects p
  LEFT JOIN tasks t ON t.project_id = p.id`;

const COLUMNS = {
  name: 'name',
  color: 'color',
  description: 'description',
  leadId: 'lead_id',
  startDate: 'start_date',
  dueDate: 'due_date',
} as const;

export function projectsRouter(db: DB, realtime: Realtime): Router {
  const r = Router({ mergeParams: true });
  const getProject = (id: number, workspaceId: number) => {
    const row = db
      .prepare(`${SELECT_PROJECT} WHERE p.id = ? AND p.workspace_id = ? GROUP BY p.id`)
      .get(id, workspaceId) as ProjectRow | undefined;
    if (!row) throw new HttpError(404, 'Project not found');
    return toProject(row);
  };
  const ensureLead = (leadId: number | null | undefined, workspaceId: number) => {
    if (leadId != null && !db.prepare('SELECT 1 FROM memberships WHERE user_id = ? AND workspace_id = ?').get(leadId, workspaceId)) {
      throw new HttpError(400, 'Lead is not a member of this workspace');
    }
  };
  const ensureWindow = (start: string | null | undefined, due: string | null | undefined) => {
    if (start && due && start > due) throw new HttpError(400, 'Start date must be before the due date');
  };

  r.get('/', (_req, res) => {
    const rows = db
      .prepare(`${SELECT_PROJECT} WHERE p.workspace_id = ? GROUP BY p.id ORDER BY p.created_at, p.id`)
      .all(ctx(res).workspaceId) as unknown as ProjectRow[];
    res.json(rows.map(toProject));
  });

  r.get('/:id', (req, res) => {
    res.json(getProject(idParam(req), ctx(res).workspaceId));
  });

  r.post('/', requireRole('admin'), (req, res) => {
    const body = parse(createSchema, req.body);
    const { workspaceId, userId } = ctx(res);
    ensureLead(body.leadId, workspaceId);
    ensureWindow(body.startDate, body.dueDate);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO projects (workspace_id, name, color, description, lead_id, start_date, due_date, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        workspaceId,
        body.name,
        body.color,
        body.description ?? '',
        body.leadId ?? null,
        body.startDate ?? null,
        body.dueDate ?? null,
        userId,
        nowISO(),
      );
    const project = getProject(Number(lastInsertRowid), workspaceId);
    realtime.emit(req, res, { type: 'project', action: 'created', projectId: project.id, name: project.name });
    res.status(201).json(project);
  });

  r.patch('/:id', requireRole('admin'), (req, res) => {
    const id = idParam(req);
    const { workspaceId } = ctx(res);
    const current = getProject(id, workspaceId);
    const body = parse(updateSchema, req.body);
    ensureLead(body.leadId, workspaceId);
    ensureWindow(
      body.startDate !== undefined ? body.startDate : current.startDate,
      body.dueDate !== undefined ? body.dueDate : current.dueDate,
    );

    const sets: string[] = [];
    const params: SQLInputValue[] = [];
    for (const [key, column] of Object.entries(COLUMNS)) {
      const value = body[key as keyof typeof COLUMNS];
      if (value !== undefined) {
        sets.push(`${column} = ?`);
        params.push(value);
      }
    }
    db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
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
