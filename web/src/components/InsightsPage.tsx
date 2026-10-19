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
  onTimeRate,
  percentChange,
  toCsv,
  workload,
} from '../metrics';
import { Donut, LineChart } from './charts';
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
  const { workspace, projects, members, me } = useWorkspace();
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
      maxLoad: Math.max(1, ...people.map((p) => p.load)),
    };
  }, [tasks, projects, members, range, today]);

  const exportCsv = () => {
    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    const memberName = new Map(members.map((m) => [m.id, m.name]));
    const rows = [
      ['id', 'title', 'project', 'status', 'priority', 'assignee', 'due_date', 'created_at', 'completed_at'],
      ...tasks.map((task) => [
        task.id,
        task.title,
        projectName.get(task.projectId) ?? '',
        task.status,
        task.priority,
        task.assigneeId ? (memberName.get(task.assigneeId) ?? '') : '',
        task.dueDate,
        task.createdAt,
        task.completedAt,
      ]),
    ];
    // BOM so Excel opens Cyrillic and Kazakh text correctly.
    const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `birge-${workspace.name.toLowerCase().replace(/\s+/g, '-')}-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

        <article className="panel glass reveal insights-people">
          <header className="panel-head">
            <div>
              <h2>{t('insights.workload')}</h2>
              <p className="muted small">{t('insights.workloadHint')}</p>
            </div>
          </header>
          <ul className="load-list">
            {data.people.map(({ member, load, open, done }) => (
              <li key={member.id}>
                <Avatar user={member} size={28} />
                <div className="load-text">
                  <strong className="truncate">
                    {member.name} {member.id === me.id && <span className="muted">{t('task.you')}</span>}
                  </strong>
                  <span className="muted small">
                    {t('insights.openDone', { open, done })}
                  </span>
                </div>
                <div className="load-bar" aria-hidden="true">
                  <span style={{ width: `${(load / data.maxLoad) * 100}%` }} />
                </div>
              </li>
            ))}
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
