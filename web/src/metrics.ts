import type { Task } from './api';
import { isoDate, todayISO } from './dates';

/** Pure helpers that turn the task list into numbers for the dashboards. All dates are the viewer's local days. */

const DAY = 24 * 60 * 60 * 1000;

export const localDay = (iso: string) => isoDate(new Date(iso));

export function addDays(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + n));
}

/** The last `n` days ending today, oldest first. */
export function lastDays(n: number, end = todayISO()) {
  return Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)));
}

/** Monday-first week containing `day`. */
export function weekOf(day = todayISO()) {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7; // 0 = Monday
  return Array.from({ length: 7 }, (_, i) => addDays(day, i - weekday));
}

export function countByDay(tasks: Task[], days: string[], field: 'completedAt' | 'createdAt' = 'completedAt') {
  const index = new Map(days.map((d, i) => [d, i]));
  const counts = new Array(days.length).fill(0);
  for (const t of tasks) {
    const value = t[field];
    if (!value) continue;
    const i = index.get(localDay(value));
    if (i !== undefined) counts[i] += 1;
  }
  return counts as number[];
}

export const isOpen = (t: Task) => t.status !== 'done';
export const isOverdue = (t: Task, today = todayISO()) => isOpen(t) && t.dueDate !== null && t.dueDate < today;

export function completedBetween(tasks: Task[], from: string, to: string) {
  return tasks.filter((t) => t.completedAt && localDay(t.completedAt) >= from && localDay(t.completedAt) <= to);
}

/** Share of finished tasks with a due date that were done on or before it. Null when there's nothing to measure. */
export function onTimeRate(done: Task[]) {
  const dated = done.filter((t) => t.dueDate && t.completedAt);
  if (!dated.length) return null;
  const onTime = dated.filter((t) => localDay(t.completedAt!) <= t.dueDate!).length;
  return onTime / dated.length;
}

/** Average days from creation to completion. */
export function avgCycleDays(done: Task[]) {
  const spans = done
    .filter((t) => t.completedAt)
    .map((t) => (new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime()) / DAY);
  if (!spans.length) return null;
  return spans.reduce((s, v) => s + v, 0) / spans.length;
}

/** Running totals: how many tasks existed vs. how many were done on each day. */
export function burnUp(tasks: Task[], days: string[]) {
  const total: number[] = [];
  const done: number[] = [];
  for (const day of days) {
    total.push(tasks.filter((t) => localDay(t.createdAt) <= day).length);
    done.push(tasks.filter((t) => t.completedAt && localDay(t.completedAt) <= day).length);
  }
  return { total, done };
}

export function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

/** Simple weighted load: urgent counts triple, high double. Used to compare teammates, not as hours. */
export const PRIORITY_WEIGHT = { low: 1, medium: 1, high: 2, urgent: 3 } as const;
export function workload(tasks: Task[]) {
  return tasks.filter(isOpen).reduce((s, t) => s + PRIORITY_WEIGHT[t.priority], 0);
}

export function toCsv(rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}
