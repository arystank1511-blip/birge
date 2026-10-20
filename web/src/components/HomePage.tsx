import { ArrowUpRight, CalendarDays, Check, Plus } from 'lucide-react';
import { dueInfo, longDate, todayISO, weekdayShort } from '../dates';
import { useAllTasks, useToggleDone, useWorkspace } from '../hooks';
import { useI18n, type MessageKey } from '../i18n';
import { addDays, completedBetween, countByDay, isOpen, isOverdue, localDay, percentChange, weekOf } from '../metrics';
import { Bars, Rings } from './charts';
import { FocusCard, RightNowCard } from './FocusUi';
import { Ring } from './ui';

function greetingKey(hour: number): MessageKey {
  if (hour >= 5 && hour < 12) return 'home.morning';
  if (hour >= 12 && hour < 18) return 'home.afternoon';
  if (hour >= 18 && hour < 23) return 'home.evening';
  return 'home.night';
}

export function HomePage() {
  const { t } = useI18n();
  const { me, projects, navigate, openTask, newTask } = useWorkspace();
  const toggleDone = useToggleDone();
  const { data: tasks = [] } = useAllTasks();

  const today = todayISO();
  const firstName = me.name.split(/\s+/)[0];
  const mine = tasks.filter((task) => task.assigneeId === me.id);
  const mineOpen = mine.filter(isOpen);

  const doneToday = mine.filter((task) => task.completedAt && localDay(task.completedAt) === today).length;
  const dueToday = mineOpen.filter((task) => task.dueDate === today).length;
  const overdue = mineOpen.filter((task) => isOverdue(task, today)).length;

  const week = weekOf(today);
  const weekCounts = countByDay(tasks, week);
  const weekTotal = weekCounts.reduce((s, v) => s + v, 0);
  const lastWeekTotal = completedBetween(tasks, addDays(week[0], -7), addDays(week[6], -7)).length;
  const change = percentChange(weekTotal, lastWeekTotal);
  const weekdayLabels = week.map(weekdayShort);

  const weekDue = tasks.filter((task) => task.dueDate && task.dueDate >= week[0] && task.dueDate <= week[6]);
  const weekDueDone = weekDue.filter((task) => task.status === 'done').length;
  const subTotal = mineOpen.reduce((s, task) => s + task.subtasks.total, 0);
  const subDone = mineOpen.reduce((s, task) => s + task.subtasks.done, 0);

  // Overdue first, then by due date; undated tasks last.
  const upNext = [...mineOpen]
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    .slice(0, 4);
  const myList = [...mineOpen].sort((a, b) => b.position - a.position).slice(0, 6);

  const dateLine = longDate(today);
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  return (
    <div className="page-scroll">
      <header className="page-head reveal">
        <div className="page-title">
          <h1>{t(greetingKey(new Date().getHours()), { name: firstName })}</h1>
          <p className="page-sub">
            <span className="cap">{dateLine}</span> · {t('home.summary', { due: dueToday, open: mineOpen.length })}
          </p>
        </div>
        <span className="spacer" />
        <button className="btn btn-accent" onClick={() => newTask()}>
          <Plus size={17} /> <span className="hide-sm">{t('head.newTask')}</span>
        </button>
      </header>

      <section className="chips-row reveal">
        <div className="mini-stat glass">
          <span>{t('home.doneToday')}</span>
          <strong className="mono">{doneToday}</strong>
        </div>
        <div className="mini-stat glass">
          <span>{t('home.dueToday')}</span>
          <strong className="mono">{dueToday}</strong>
        </div>
        <div className={`mini-stat glass${overdue ? ' mini-stat-danger' : ''}`}>
          <span>{t('stats.overdue')}</span>
          <strong className="mono">{overdue}</strong>
        </div>
      </section>

      <section className="dash-grid">
        <article className="panel glass reveal dash-today">
          <header className="panel-head">
            <div>
              <h2>{t('home.today')}</h2>
              <p className="muted small">{t('home.todayHint')}</p>
            </div>
          </header>
          <div className="today-body">
            <Rings
              label={t('home.today')}
              rings={[
                { value: doneToday, total: doneToday + dueToday || 1, color: 'var(--accent)' },
                { value: weekDueDone, total: weekDue.length || 1, color: 'var(--teal)' },
                { value: subDone, total: subTotal || 1, color: 'var(--prio-high)' },
              ]}
            />
            <ul className="ring-legend">
              <li style={{ ['--c' as string]: 'var(--accent)' }}>
                <span>{t('home.ringToday')}</span>
                <strong className="mono">
                  {doneToday}
                  <small>/{doneToday + dueToday}</small>
                </strong>
              </li>
              <li style={{ ['--c' as string]: 'var(--teal)' }}>
                <span>{t('home.ringWeek')}</span>
                <strong className="mono">
                  {weekDueDone}
                  <small>/{weekDue.length}</small>
                </strong>
              </li>
              <li style={{ ['--c' as string]: 'var(--prio-high)' }}>
                <span>{t('home.ringSubtasks')}</span>
                <strong className="mono">
                  {subDone}
                  <small>/{subTotal}</small>
                </strong>
              </li>
            </ul>
          </div>
        </article>
        <article className="panel glass reveal dash-next">
          <header className="panel-head">
            <div>
              <h2>{t('home.upNext')}</h2>
              <p className="muted small">{t('home.upNextHint')}</p>
            </div>
            <button className="link" onClick={() => navigate({ page: 'calendar' })}>
              {t('nav.calendar')}
            </button>
          </header>
          {upNext.length ? (
            <ul className="next-list">
              {upNext.map((task, i) => {
                const due = dueInfo(task.dueDate, false);
                const project = projectMap.get(task.projectId);
                return (
                  <li key={task.id}>
                    <button className={`next-item${i === 0 ? ' next-first' : ''}`} onClick={() => openTask(task.id)}>
                      <i style={{ background: project?.color }} />
                      <span className="next-title truncate">{task.title}</span>
                      {due && (
                        <span className={`due due-${due.tone}`}>
                          <CalendarDays size={13} />
                          {due.label}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty-note">{t('home.allClear')}</p>
          )}
        </article>
        <FocusCard />
        <article className="panel glass reveal dash-mine">
          <header className="panel-head">
            <div>
              <h2>{t('home.myTasks')}</h2>
              <p className="muted small">{t('home.myTasksHint', { n: mineOpen.length })}</p>
            </div>
            <button className="link" onClick={() => navigate({ page: 'tasks', assignee: me.id })}>
              {t('home.allTasks')} <ArrowUpRight size={14} />
            </button>
          </header>
          {myList.length ? (
            <ul className="my-list">
              {myList.map((task) => {
                const due = dueInfo(task.dueDate, false);
                const project = projectMap.get(task.projectId);
                return (
                  <li key={task.id}>
                    <button className="check" onClick={() => toggleDone(task)} aria-label={t('board.complete', { title: task.title })}>
                      <Check size={13} strokeWidth={3} />
                    </button>
                    <button className="my-title" onClick={() => openTask(task.id)}>
                      <span className="truncate">{task.title}</span>
                      <span className="my-meta">
                        {project && (
                          <span className="tag" style={{ ['--tag' as string]: project.color }}>
                            <i />
                            {project.name}
                          </span>
                        )}
                        {due && <span className={`due due-${due.tone}`}>{due.label}</span>}
                      </span>
                    </button>
                    {(task.priority === 'high' || task.priority === 'urgent') && (
                      <span className={`prio-badge prio-badge-${task.priority}`}>{t(`priority.${task.priority}`)}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty-note">{t('home.allClear')}</p>
          )}
        </article>
        <article className="panel glass reveal dash-week">
          <header className="panel-head">
            <div>
              <h2>{t('home.thisWeek')}</h2>
              <p className="muted small">{t('home.thisWeekHint')}</p>
            </div>
            <button className="link" onClick={() => navigate({ page: 'insights' })}>
              {t('nav.insights')} <ArrowUpRight size={14} />
            </button>
          </header>
          <p className="big-number">
            <strong className="mono">{weekTotal}</strong>
            <span className="muted">{t('home.finished')}</span>
            {change !== null && (
              <span className={`delta ${change >= 0 ? 'delta-up' : 'delta-down'}`}>
                {change >= 0 ? '+' : ''}
                {Math.round(change * 100)}% {t('home.vsLastWeek')}
              </span>
            )}
          </p>
          <Bars
            values={weekCounts}
            labels={weekdayLabels}
            highlight={week.indexOf(today)}
            label={t('home.thisWeek')}
          />
        </article>
        <article className="panel glass reveal dash-projects">
          <header className="panel-head">
            <div>
              <h2>{t('nav.projects')}</h2>
              <p className="muted small">{t('home.projectsHint')}</p>
            </div>
          </header>
          <ul className="project-progress">
            {projects.map((p) => {
              const done = p.taskCount - p.openCount;
              return (
                <li key={p.id}>
                  <button onClick={() => navigate({ page: 'project', id: p.id })}>
                    <Ring value={done} total={Math.max(p.taskCount, 1)} color={p.color} size={22} />
                    <span className="truncate">{p.name}</span>
                    <span className="mono muted">{p.taskCount ? Math.round((done / p.taskCount) * 100) : 0}%</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </article>
        <RightNowCard />
      </section>
    </div>
  );
}
