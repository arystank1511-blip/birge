import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Plus } from 'lucide-react';
import { ROLE_RANK, STATUSES, type ProjectInput } from '../api';
import { dueInfo, longDate, shortDay, todayISO } from '../dates';
import { useAllTasks, useWorkspace } from '../hooks';
import { useI18n, type MessageKey } from '../i18n';
import { addDays, burnUp, isOpen, localDay } from '../metrics';
import { toastError } from '../toast';
import { LineChart } from './charts';
import { Avatar, Select, STATUS_COLOR } from './ui';

const DAY = 24 * 60 * 60 * 1000;
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY);

export function ProjectPage({ id }: { id: number }) {
  const { t } = useI18n();
  const { workspace, api, projects, members, online, navigate, openTask, newTask } = useWorkspace();
  const { data: allTasks = [] } = useAllTasks();
  const qc = useQueryClient();
  const project = projects.find((p) => p.id === id);
  const canEdit = ROLE_RANK[workspace.role] >= ROLE_RANK.admin;
  const today = todayISO();

  const update = useMutation({
    mutationFn: (patch: ProjectInput) => api.updateProject(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
    onError: toastError,
  });

  const tasks = useMemo(() => allTasks.filter((task) => task.projectId === id), [allTasks, id]);

  const chart = useMemo(() => {
    if (!project) return null;
    const firstDay = [project.startDate, ...tasks.map((task) => localDay(task.createdAt))]
      .filter((d): d is string => Boolean(d))
      .sort()[0] ?? today;
    const span = Math.min(120, Math.max(7, daysBetween(firstDay, today) + 1));
    const days = Array.from({ length: span }, (_, i) => addDays(today, i - (span - 1)));
    return { days, ...burnUp(tasks, days) };
  }, [project, tasks, today]);

  if (!project) {
    return (
      <div className="empty glass">
        {t('error.notFound')}{' '}
        <button className="link" onClick={() => navigate({ page: 'home' })}>
          {t('nav.home')}
        </button>
      </div>
    );
  }

  const done = tasks.length - tasks.filter(isOpen).length;
  const progress = tasks.length ? done / tasks.length : 0;
  const daysLeft = project.dueDate ? daysBetween(today, project.dueDate) : null;
  const lead = members.find((m) => m.id === project.leadId);

  // Where today sits between start and due, for the timeline marker.
  const timeline =
    project.startDate && project.dueDate
      ? Math.min(1, Math.max(0, daysBetween(project.startDate, today) / Math.max(1, daysBetween(project.startDate, project.dueDate))))
      : null;

  let statusKey: MessageKey = 'project.statusActive';
  if (tasks.length && done === tasks.length) statusKey = 'project.statusDone';
  else if (daysLeft !== null && daysLeft < 0) statusKey = 'project.statusLate';
  else if (timeline !== null && progress + 0.15 < timeline) statusKey = 'project.statusBehind';

  const people = members
    .map((m) => ({ member: m, open: tasks.filter((task) => isOpen(task) && task.assigneeId === m.id).length }))
    .filter((row) => row.open > 0 || row.member.id === project.leadId)
    .sort((a, b) => b.open - a.open);

  return (
    <div className="page-scroll">
      <header className="page-head reveal">
        <button className="icon-btn" onClick={() => history.back()} aria-label={t('project.back')}>
          <ArrowLeft size={18} />
        </button>
        <span className="project-badge" style={{ background: project.color }} aria-hidden="true">
          {project.name.charAt(0).toUpperCase()}
        </span>
        <div className="page-title">
          <h1>{project.name}</h1>
          {canEdit ? (
            <input
              key={project.id}
              className="inline-edit page-sub"
              defaultValue={project.description}
              placeholder={t('project.descPlaceholder')}
              maxLength={500}
              aria-label={t('task.description')}
              onBlur={(e) => {
                if (e.target.value.trim() !== project.description) update.mutate({ description: e.target.value.trim() });
              }}
            />
          ) : (
            <p className="page-sub">{project.description}</p>
          )}
        </div>
        <span className="spacer" />
        <button className="btn btn-accent" onClick={() => newTask({ projectId: project.id })}>
          <Plus size={17} /> <span className="hide-sm">{t('head.newTask')}</span>
        </button>
      </header>

      <section className="chips-row reveal">
        <div className="mini-stat glass">
          <span>{t('project.progress')}</span>
          <strong className="mono">{Math.round(progress * 100)}%</strong>
        </div>
        <div className="mini-stat glass">
          <span>{t('stats.open')}</span>
          <strong className="mono">{tasks.length - done}</strong>
        </div>
        <div className="mini-stat glass">
          <span>{t('status.done')}</span>
          <strong className="mono">{done}</strong>
        </div>
        <div className={`mini-stat glass${daysLeft !== null && daysLeft < 0 ? ' mini-stat-danger' : ''}`}>
          <span>{t('project.daysLeft')}</span>
          <strong className="mono">{daysLeft === null ? '–' : daysLeft}</strong>
        </div>
      </section>

      <section className="project-grid">
        <article className="panel glass reveal">
          <header className="panel-head">
            <h2>{t('project.overview')}</h2>
          </header>
          <div className="overview-boxes">
            <div className="overview-box">
              <span className="muted small">{t('project.lead')}</span>
              {canEdit ? (
                <Select
                  value={project.leadId ?? ''}
                  onChange={(e) => update.mutate({ leadId: e.target.value ? Number(e.target.value) : null })}
                  aria-label={t('project.lead')}
                  icon={<Avatar user={lead} size={18} />}
                >
                  <option value="">{t('board.unassigned')}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <strong>{lead?.name ?? t('board.unassigned')}</strong>
              )}
            </div>
            <div className="overview-box">
              <span className="muted small">{t('task.status')}</span>
              <span className={`status-pill status-pill-${statusKey.split('.')[1]}`}>{t(statusKey)}</span>
            </div>
          </div>

          <div className="timeline">
            <div className="timeline-track">
              <span className="timeline-fill" style={{ width: `${progress * 100}%` }} />
              {timeline !== null && (
                <span className="timeline-today" style={{ left: `${timeline * 100}%` }}>
                  <em>{t('time.today')}</em>
                </span>
              )}
            </div>
            <div className="timeline-ends">
              <label>
                <span className="muted small">{t('project.start')}</span>
                {canEdit ? (
                  <input
                    type="date"
                    className="input-plain"
                    value={project.startDate ?? ''}
                    onChange={(e) => update.mutate({ startDate: e.target.value || null })}
                  />
                ) : (
                  <strong>{project.startDate ? longDate(project.startDate) : '–'}</strong>
                )}
              </label>
              <label className="timeline-end">
                <span className="muted small">{t('task.dueDate')}</span>
                {canEdit ? (
                  <input
                    type="date"
                    className="input-plain"
                    value={project.dueDate ?? ''}
                    onChange={(e) => update.mutate({ dueDate: e.target.value || null })}
                  />
                ) : (
                  <strong>{project.dueDate ? longDate(project.dueDate) : '–'}</strong>
                )}
              </label>
            </div>
          </div>

          <h3 className="sub-heading">
            {t('project.people')} <span className="count mono">{people.length}</span>
          </h3>
          <ul className="people-list">
            {people.map(({ member, open }) => (
              <li key={member.id}>
                <span className="avatar-wrap">
                  <Avatar user={member} size={30} />
                  {online.includes(member.id) && <span className="online-dot" />}
                </span>
                <div className="load-text">
                  <strong className="truncate">{member.name}</strong>
                  <span className="muted small">
                    {member.id === project.leadId ? `${t('project.lead')} · ` : ''}
                    {t('project.openCount', { n: open })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel glass reveal">
          <header className="panel-head">
            <div>
              <h2>{t('project.burnup')}</h2>
              <p className="muted small">{t('project.burnupHint')}</p>
            </div>
            <ul className="legend">
              <li>
                <i className="legend-line" /> {t('status.done')}
              </li>
              <li>
                <i className="legend-line legend-dashed" /> {t('project.total')}
              </li>
            </ul>
          </header>
          {chart && (
            <LineChart
              label={t('project.burnup')}
              labels={chart.days.map(shortDay)}
              series={[
                { name: 'total', values: chart.total, color: 'var(--muted)', dashed: true },
                { name: 'done', values: chart.done, color: project.color, area: true },
              ]}
            />
          )}
        </article>

        <article className="panel glass reveal project-tasks">
          <header className="panel-head">
            <div>
              <h2>{t('nav.tasks')}</h2>
              <p className="muted small">{t('project.tasksHint', { open: tasks.length - done, done })}</p>
            </div>
            <button className="btn btn-sm btn-ghost-glass" onClick={() => newTask({ projectId: project.id })}>
              <Plus size={15} /> {t('project.addTask')}
            </button>
          </header>
          {STATUSES.map((status) => {
            const rows = tasks.filter((task) => task.status === status).sort((a, b) => a.position - b.position);
            if (!rows.length) return null;
            return (
              <div key={status} className="project-status-group">
                <h3 className="list-heading">
                  <i style={{ background: STATUS_COLOR[status] }} />
                  {t(`status.${status}`)}
                  <span className="count mono">{rows.length}</span>
                </h3>
                <ul className="compact-list">
                  {rows.slice(0, status === 'done' ? 5 : 20).map((task) => {
                    const due = dueInfo(task.dueDate, task.status === 'done');
                    const who = members.find((m) => m.id === task.assigneeId);
                    return (
                      <li key={task.id}>
                        <button onClick={() => openTask(task.id)} className={task.status === 'done' ? 'is-done' : ''}>
                          <span className={`prio-dot prio-dot-${task.priority}`} />
                          <span className="truncate">{task.title}</span>
                          {due && (
                            <span className={`due due-${due.tone}`}>
                              <CalendarDays size={13} />
                              {due.label}
                            </span>
                          )}
                          <Avatar user={who} size={22} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {!tasks.length && <p className="empty-note">{t('project.noTasks')}</p>}
        </article>
      </section>
    </div>
  );
}
