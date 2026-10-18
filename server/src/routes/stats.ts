import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db';
import { ctx, parse } from '../http';
import { TASK_FROM, buildWhere, filterSchema } from './tasks';

// The client sends its own "today" so due-date buckets match the viewer's timezone.
const statsQuery = filterSchema.extend({
  today: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

function localISODate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function statsRouter(db: DB): Router {
  const r = Router({ mergeParams: true });

  r.get('/', (req, res) => {
    const { today: todayParam, ...filters } = parse(statsQuery, req.query);
    const today = todayParam ?? localISODate(new Date());
    const [y, m, d] = today.split('-').map(Number);
    const weekEnd = localISODate(new Date(y, m - 1, d + 7));
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { workspaceId, userId } = ctx(res);
    const where = buildWhere(filters, workspaceId, userId);
    const row = db
      .prepare(
        `SELECT
           SUM(CASE WHEN t.status != 'done' THEN 1 ELSE 0 END) AS open,
           SUM(CASE WHEN t.status != 'done' AND t.due_date >= ? AND t.due_date <= ? THEN 1 ELSE 0 END) AS due_soon,
           SUM(CASE WHEN t.status != 'done' AND t.due_date < ? THEN 1 ELSE 0 END) AS overdue,
           SUM(CASE WHEN t.status = 'done' AND t.completed_at >= ? THEN 1 ELSE 0 END) AS done_week
         ${TASK_FROM} ${where.sql}`,
      )
      .get(today, weekEnd, today, weekAgo, ...where.params) as Record<string, number | null>;

    res.json({
      open: row.open ?? 0,
      dueThisWeek: row.due_soon ?? 0,
      overdue: row.overdue ?? 0,
      doneThisWeek: row.done_week ?? 0,
    });
  });

  return r;
}
