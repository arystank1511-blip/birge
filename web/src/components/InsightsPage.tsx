import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { STATUSES } from '../api';
import { shortDay, todayISO } from '../dates';
import { useAllTasks, useWorkspace } from '../hooks';
import { useI18n } from '../i18n';
import {
  addDays,
  avgCycleDays,
  completedBetween,
  countByDay,
  isOpen,
  isOverdue,
  lastDays,
  localDay,
  onTimeRate,
  percentChange,
  workload,
} from '../metrics';
import { exportTasksCsv } from '../csv';
import { Donut, LineChart } from './charts';
import { CAPACITY } from './MemberPanel';
import { Avatar, STATUS_COLOR } from './ui';

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

function Delta({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null || !Number.isFinite(value)) return null;
  const good = invert ? value <= 0 : value >= 0;
  return (
    <span className={`delta ${good ? 'delta-up' : 'delta-down'}`}>
      {value >= 0 ? '+' : ''}
      {Math.round(value * 100)}%
    </span>
  );
}

export function InsightsPage() {
  const { t } = useI18n();
  const { workspace, projects, members, me, openTask, openMember } = useWorkspace();
  const { data: tasks = [] } = useAllTasks();
  const [range, setRange] = useState<Range>(30);
  const today = todayISO();

  const data = useMemo(() => {
    const days = lastDays(range, today);
    const prevDays = lastDays(range, addDays(days[0], -1));
    const done = completedBetween(tasks, days[0], today);
    const prevDone = completedBetween(tasks, prevDays[0], prevDays[prevDays.length - 1]);
    const onTime = onTimeRate(done);
    const prevOnTime = onTimeRate(prevDone);
    const cycle = avgCycleDays(done);
    const prevCycle = avgCycleDays(prevDone);

    const byProject = projects
      .map((p) => ({ project: p, value: done.filter((task) => task.projectId === p.id).length }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);

    const people = members
      .map((m) => {
        const theirs = tasks.filter((task) => task.assigneeId === m.id);
        return { member: m, load: workload(theirs), open: theirs.filter(isOpen).length, done: done.filter((task) => task.assigneeId === m.id).length };
      })
      .sort((a, b) => b.load - a.load);

    return {
      days,
      current: countByDay(tasks, days),
      previous: countByDay(tasks, prevDays),
      done,
      doneChange: percentChange(done.length, prevDone.length),
      onTime,
      onTimeChange: onTime !== null && prevOnTime !== null ? onTime - prevOnTime : null,
      cycle,
      cycleChange: cycle !== null && prevCycle ? (cycle - prevCycle) / prevCycle : null,
      overdue: tasks.filter((task) => isOverdue(task, today)).length,
      byProject,
      people,
      over: people.filter((p) => p.load > CAPACITY).length,
      onTimeCount: done.filter((task) => task.dueDate && task.completedAt && localDay(task.completedAt) <= task.dueDate).length,
      lateCount: done.filter((task) => task.dueDate && task.completedAt && localDay(task.completedAt) > task.dueDate).length,
      // Open work that has waited longest: overdue days if late, otherwise age since creation.
      slowest: tasks
        .filter(isOpen)
        .map((task) => {
          const age = Math.floor((Date.parse(today) - Date.parse(localDay(task.createdAt))) / 86_400_000);
          const late = task.dueDate && task.dueDate < today ? Math.floor((Date.parse(today) - Date.parse(task.dueDate)) / 86_400_000) : 0;
          return { task, age, late };
        })
        .sort((a, b) => b.late - a.late || b.age - a.age)
        .slice(0, 3),
    };
  }, [tasks, projects, members, range, today]);

  const exportCsv = () => exportTasksCsv(tasks, projects, members, workspace.name);

  const labels = data.days.map(shortDay);
  const total = data.done.length;

  return (
    <div className="page-scroll">
      <header className="page-head reveal">
        <div className="page-title">
          <h1>{t('nav.insights')}</h1>
          <p className="page-sub">{t('insights.subtitle', { n: range })}</p>
        </div>
        <span className="spacer" />
        <div className="segmented" role="tablist" aria-label={t('insights.range')}>
          {RANGES.map((r) => (
            <button key={r} role="tab" aria-selected={range === r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>
              {t('insights.days', { n: r })}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost-glass" onClick={exportCsv}>
          <Download size={16} /> <span className="hide-sm">{t('insights.export')}</span>
        </button>
      </header>

      <section className="chips-row reveal">
        <div className="mini-stat glass">
          <span>{t('insights.completed')}</span>
          <strong className="mono">
            {total} <Delta value={data.doneChange} />
          </strong>
        </div>
        <div className="mini-stat glass">
          <span>{t('insights.onTime')}</span>
          <strong className="mono">
            {data.onTime === null ? '–' : `${Math.round(data.onTime * 100)}%`} <Delta value={data.onTimeChange} />
          </strong>
        </div>
        <div className="mini-stat glass">
          <span>{t('insights.cycle')}</span>
          <strong className="mono">
            {data.cycle === null ? '–' : t('insights.daysShort', { n: data.cycle.toFixed(1) })} <Delta value={data.cycleChange} invert />
          </strong>
        </div>
        <div className={`mini-stat glass${data.overdue ? ' mini-stat-danger' : ''}`}>
          <span>{t('stats.overdue')}</span>
          <strong className="mono">{data.overdue}</strong>
        </div>
      </section>

      <section className="insights-grid">
        <article className="panel glass reveal insights-throughput">
          <header className="panel-head">
            <div>
              <h2>{t('insights.throughput')}</h2>
              <p className="muted small">{t('insights.throughputHint')}</p>
            </div>
            <ul className="legend">
              <li>
                <i className="legend-line" /> {t('insights.thisPeriod')}
              </li>
              <li>
                <i className="legend-line legend-dashed" /> {t('insights.prevPeriod')}
              </li>
            </ul>
          </header>
          <LineChart
            label={t('insights.throughput')}
            labels={labels}
            series={[
              { name: 'previous', values: data.previous, color: 'var(--muted)', dashed: true },
              { name: 'current', values: data.current, color: 'var(--accent)', area: true },
            ]}
          />
        </article>

        <article className="panel glass reveal insights-projects">
          <header className="panel-head">
            <div>
              <h2>{t('insights.byProject')}</h2>
              <p className="muted small">{t('insights.byProjectHint')}</p>
            </div>
          </header>
          <div className="by-project">
            <Donut
              label={t('insights.byProject')}
              center={String(total)}
              caption={t('insights.finished')}
              parts={data.byProject.map((row) => ({ value: row.value, color: row.project.color }))}
            />
            <ul className="donut-legend">
              {data.byProject.map((row) => (
                <li key={row.project.id}>
                  <i style={{ background: row.project.color }} />
                  <span className="truncate">{row.project.name}</span>
                  <span className="mono">{row.value}</span>
                  <span className="mono muted">{total ? Math.round((row.value / total) * 100) : 0}%</span>
                </li>
              ))}
              {!data.byProject.length && <li className="muted">{t('insights.nothingYet')}</li>}
            </ul>
          </div>
        </article>

        <article className="panel glass reveal insights-ontime">
          <header className="panel-head">
            <div>
              <h2>{t('insights.onTime')}</h2>
              <p className="muted small">{t('insights.onTimeHint', { n: range })}</p>
            </div>
          </header>
          <p className="big-number">
            <strong className="mono">{data.onTime === null ? '–' : Math.round(data.onTime * 100)}</strong>
            <span className="muted">{t('insights.onTimeOf')}</span>
          </p>
          <div className="ontime-bar" aria-hidden="true">
            <span className="ontime-good" style={{ flexGrow: data.onTimeCount || 0.0001 }} />
            <span className="ontime-late" style={{ flexGrow: data.lateCount }} />
          </div>
          <p className="ontime-legend small">
            <span>
              <i className="dot-good" /> <strong className="mono">{data.onTimeCount}</strong> {t('insights.inTime')}
            </span>
            <span>
              <i className="dot-late" /> <strong className="mono">{data.lateCount}</strong> {t('insights.late')}
            </span>
          </p>
          <h3 className="sub-heading">{t('insights.slowest')}</h3>
          <ul className="slow-list">
            {data.slowest.map(({ task, age, late }) => {
              const who = members.find((m) => m.id === task.assigneeId);
              const project = projects.find((p) => p.id === task.projectId);
              return (
                <li key={task.id}>
                  <Avatar user={who} size={28} />
                  <button className="load-text" onClick={() => openTask(task.id)}>
                    <strong className="truncate">{task.title}</strong>
                    <span className="muted small truncate">
                      {project?.name}
                      {who ? ` · ${who.name.split(' ')[0]}` : ''}
                    </span>
                  </button>
                  <span className={`slow-age mono${late ? ' is-late' : ''}`}>
                    <strong>{t('insights.daysShort', { n: late || age })}</strong>
                    <small>{late ? t('insights.lateWord') : t('insights.openWord')}</small>
                  </span>
                </li>
              );
            })}
          </ul>
        </article>

        <article className="panel glass reveal insights-people">
          <header className="panel-head">
            <div>
              <h2>{t('insights.workload')}</h2>
              <p className="muted small">{t('insights.capacityHint', { n: CAPACITY })}</p>
            </div>
            <span className={`status-pill ${data.over ? 'status-pill-statusLate' : 'status-pill-statusActive'}`}>
              {data.over ? t('insights.overCapacity', { n: data.over }) : t('insights.withinCapacity')}
            </span>
          </header>
          <ul className="load-list capacity-list">
            {data.people.map(({ member, load, open, done }) => {
              // The bar spans 1.5× capacity so overload stays visible; the tick marks 100%.
              const scale = CAPACITY * 1.5;
              return (
                <li key={member.id}>
                  <Avatar user={member} size={28} />
                  <button className="load-text" onClick={() => openMember(member.id)}>
                    <strong className="truncate">
                      {member.name} {member.id === me.id && <span className="muted">{t('task.you')}</span>}
                    </strong>
                    <span className="muted small">{t('insights.openDone', { open, done })}</span>
                  </button>
                  <div className="capacity-bar" aria-label={`${load} / ${CAPACITY}`}>
                    <span className={load > CAPACITY ? 'over' : ''} style={{ width: `${Math.min(1, load / scale) * 100}%` }} />
                    <i style={{ left: `${(CAPACITY / scale) * 100}%` }} />
                  </div>
                  <span className="mono small capacity-num">
                    <strong>{load}</strong>/{CAPACITY}
                  </span>
                </li>
              );
            })}
          </ul>
        </article>

        <article className="panel glass reveal insights-status">
          <header className="panel-head">
            <div>
              <h2>{t('insights.byStatus')}</h2>
              <p className="muted small">{t('insights.byStatusHint')}</p>
            </div>
          </header>
          <ul className="status-split">
            {STATUSES.map((status) => {
              const n = tasks.filter((task) => task.status === status).length;
              return (
                <li key={status} style={{ ['--col' as string]: STATUS_COLOR[status] }}>
                  <span>{t(`status.${status}`)}</span>
                  <div className="split-bar">
                    <span style={{ width: `${tasks.length ? (n / tasks.length) * 100 : 0}%` }} />
                  </div>
                  <strong className="mono">{n}</strong>
                </li>
              );
            })}
          </ul>
        </article>
      </section>
    </div>
  );
}
