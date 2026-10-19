import { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Task } from '../api';
import { isoDate, longDate, monthTitle, todayISO, weekdayShort } from '../dates';
import { useAllTasks, useToggleDone, useWorkspace } from '../hooks';
import { useI18n } from '../i18n';
import { addDays, isOverdue, weekOf } from '../metrics';

const MAX_IN_CELL = 3;

/** Month grid of due dates. Weeks start on Monday, as in Russia and Kazakhstan. */
export function CalendarPage() {
  const { t } = useI18n();
  const { projects, openTask, newTask } = useWorkspace();
  const toggleDone = useToggleDone();
  const { data: tasks = [] } = useAllTasks();
  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selected, setSelected] = useState(today);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const list = map.get(task.dueDate) ?? [];
      list.push(task);
      map.set(task.dueDate, list);
    }
    // Open work first, then by priority weight.
    const weight = { urgent: 0, high: 1, medium: 2, low: 3 };
    map.forEach((list) =>
      list.sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || weight[a.priority] - weight[b.priority]),
    );
    return map;
  }, [tasks]);

  // Six Monday-first weeks covering the month.
  const first = isoDate(new Date(cursor.year, cursor.month, 1));
  const gridStart = weekOf(first)[0];
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const weekdays = weekOf(today).map(weekdayShort);
  const monthPrefix = first.slice(0, 7);

  const shift = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const selectedTasks = byDay.get(selected) ?? [];
  const overdue = tasks.filter((task) => isOverdue(task, today)).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));

  return (
    <div className="calendar-layout">
      <div className="calendar-main">
        <header className="page-head reveal">
          <div className="page-title">
            <h1>{monthTitle(cursor.year, cursor.month)}</h1>
            <p className="page-sub">{t('calendar.subtitle')}</p>
          </div>
          <span className="spacer" />
          <div className="segmented">
            <button onClick={() => shift(-1)} aria-label={t('calendar.prev')}>
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => {
                const d = new Date();
                setCursor({ year: d.getFullYear(), month: d.getMonth() });
                setSelected(today);
              }}
            >
              {t('time.today')}
            </button>
            <button onClick={() => shift(1)} aria-label={t('calendar.next')}>
              <ChevronRight size={16} />
            </button>
          </div>
        </header>

        <section className="month glass reveal reveal-fill" role="grid" aria-label={monthTitle(cursor.year, cursor.month)}>
          {weekdays.map((w) => (
            <div key={w} className="month-weekday" role="columnheader">
              {w}
            </div>
          ))}
          {cells.map((day) => {
            const list = byDay.get(day) ?? [];
            const outside = !day.startsWith(monthPrefix);
            return (
              <div
                key={day}
                role="gridcell"
                tabIndex={0}
                aria-selected={day === selected}
                className={`day${outside ? ' day-outside' : ''}${day === today ? ' day-today' : ''}${day === selected ? ' day-selected' : ''}`}
                onClick={() => setSelected(day)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected(day);
                  }
                }}
              >
                <span className="day-num mono">{Number(day.slice(8))}</span>
                {list.slice(0, MAX_IN_CELL).map((task) => (
                  <button
                    key={task.id}
                    className={`day-task${task.status === 'done' ? ' is-done' : ''}`}
                    style={{ ['--tag' as string]: projectMap.get(task.projectId)?.color }}
                    onClick={(e) => {
                      e.stopPropagation();
                      openTask(task.id);
                    }}
                    title={task.title}
                  >
                    {task.title}
                  </button>
                ))}
                {list.length > MAX_IN_CELL && (
                  <span className="day-more">{t('calendar.more', { n: list.length - MAX_IN_CELL })}</span>
                )}
              </div>
            );
          })}
        </section>
      </div>

      <aside className="calendar-side glass reveal">
        <header className="panel-head">
          <div>
            <h2 className="cap">{selected === today ? t('time.today') : longDate(selected)}</h2>
            <p className="muted small">{t('calendar.dueCount', { n: selectedTasks.length })}</p>
          </div>
          <button className="icon-btn" onClick={() => newTask()} aria-label={t('head.newTask')}>
            <Plus size={17} />
          </button>
        </header>
        {selectedTasks.length ? (
          <ul className="my-list">
            {selectedTasks.map((task) => (
              <li key={task.id} className={task.status === 'done' ? 'is-done' : ''}>
                <button
                  className={`check${task.status === 'done' ? ' checked' : ''}`}
                  onClick={() => toggleDone(task)}
                  aria-label={t(task.status === 'done' ? 'board.reopen' : 'board.complete', { title: task.title })}
                >
                  <Check size={13} strokeWidth={3} />
                </button>
                <button className="my-title" onClick={() => openTask(task.id)}>
                  <span className="truncate">{task.title}</span>
                  <span className="my-meta">
                    <span className="tag" style={{ ['--tag' as string]: projectMap.get(task.projectId)?.color }}>
                      <i />
                      {projectMap.get(task.projectId)?.name}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-note">{t('calendar.free')}</p>
        )}

        {overdue.length > 0 && (
          <>
            <h3 className="sub-heading">{t('stats.overdue')}</h3>
            <ul className="my-list">
              {overdue.slice(0, 6).map((task) => (
                <li key={task.id}>
                  <button className="check" onClick={() => toggleDone(task)} aria-label={t('board.complete', { title: task.title })}>
                    <Check size={13} strokeWidth={3} />
                  </button>
                  <button className="my-title" onClick={() => openTask(task.id)}>
                    <span className="truncate">{task.title}</span>
                    <span className="my-meta">
                      <span className="due due-overdue">{longDate(task.dueDate!)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}
