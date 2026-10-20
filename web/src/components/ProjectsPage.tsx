import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CalendarDays, Plus, Star } from 'lucide-react';
import { ROLE_RANK, type Project, type Task } from '../api';
import { dueInfo, shortDay, todayISO } from '../dates';
import { useAllTasks, useInvalidateTasks, useWorkspace } from '../hooks';
import { toastError } from '../toast';
import { useI18n, type MessageKey } from '../i18n';
import { isOpen } from '../metrics';
import { Avatar } from './ui';

type Filter = 'all' | 'active' | 'late' | 'done';
type Health = 'done' | 'late' | 'behind' | 'active' | 'empty';

const DAY = 24 * 60 * 60 * 1000;
const SWATCHES = ['#3b5bfd', '#16a34a', '#ff8a5b', '#8b7cff', '#ff7eb6', '#14b8a6'];

function readPins(): number[] {
  try {
    return JSON.parse(localStorage.getItem('tl-pins') ?? '[]');
  } catch {
    return [];
  }
}

/** Same status rule as the project page, so the card and the page always agree. */
export function projectHealth(project: Project, tasks: Task[], today = todayISO()): Health {
  if (!tasks.length) return 'empty';
  const done = tasks.filter((task) => task.status === 'done').length;
  if (done === tasks.length) return 'done';
  if (project.dueDate && project.dueDate < today) return 'late';
  if (project.startDate && project.dueDate) {
    const span = Math.max(1, (new Date(project.dueDate).getTime() - new Date(project.startDate).getTime()) / DAY);
    const elapsed = Math.min(1, Math.max(0, (new Date(today).getTime() - new Date(project.startDate).getTime()) / DAY / span));
    if (done / tasks.length + 0.15 < elapsed) return 'behind';
  }
  return 'active';
}

const HEALTH_KEY: Record<Health, MessageKey> = {
  done: 'project.statusDone',
  late: 'project.statusLate',
  behind: 'project.statusBehind',
  active: 'project.statusActive',
  empty: 'projects.empty',
};
const HEALTH_PILL: Record<Health, string> = {
  done: 'statusDone',
  late: 'statusLate',
  behind: 'statusBehind',
  active: 'statusActive',
  empty: 'statusEmpty',
};

export function ProjectsPage() {
  const { t } = useI18n();
  const { workspace, api, projects, members, navigate, newTask } = useWorkspace();
  const invalidate = useInvalidateTasks();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[0]);
  const create = useMutation({
    mutationFn: () => api.createProject(name.trim(), color),
    onSuccess: (project) => {
      invalidate();
      setCreating(false);
      setName('');
      navigate({ page: 'project', id: project.id });
    },
    onError: toastError,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) create.mutate();
  };
  const { data: tasks = [] } = useAllTasks();
  const [filter, setFilter] = useState<Filter>('all');
  const [pins, setPins] = useState<number[]>(readPins);
  const today = todayISO();
  const canCreate = ROLE_RANK[workspace.role] >= ROLE_RANK.admin;

  const togglePin = (id: number) => {
    const next = pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id];
    setPins(next);
    try {
      localStorage.setItem('tl-pins', JSON.stringify(next));
    } catch {
      // Not critical: pins last for this visit.
    }
  };

  const rows = projects.map((project) => {
    const own = tasks.filter((task) => task.projectId === project.id);
    const health = projectHealth(project, own, today);
    // The next deadline among the project's open tasks works as its "next milestone".
    const next = own.filter((task) => isOpen(task) && task.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0];
    const people = [...new Set(own.filter(isOpen).map((task) => task.assigneeId).filter((id): id is number => id !== null))]
      .map((id) => members.find((m) => m.id === id))
      .filter((m) => m !== undefined);
    const done = own.length - own.filter(isOpen).length;
    return { project, own, health, next, people, done };
  });

  const shown = rows
    .filter((row) => {
      if (filter === 'active') return row.health === 'active' || row.health === 'behind';
      if (filter === 'late') return row.health === 'late' || row.health === 'behind';
      if (filter === 'done') return row.health === 'done';
      return true;
    })
    .sort((a, b) => Number(pins.includes(b.project.id)) - Number(pins.includes(a.project.id)));

  const monthEnd = `${today.slice(0, 7)}-31`;
  const counts = {
    active: rows.filter((r) => r.health === 'active' || r.health === 'behind').length,
    done: rows.filter((r) => r.health === 'done').length,
    onTrack: rows.length ? rows.filter((r) => r.health === 'active' || r.health === 'done').length / rows.length : 0,
    dueMonth: rows.filter((r) => r.project.dueDate && r.project.dueDate >= today && r.project.dueDate <= monthEnd).length,
  };

  return (
    <div className="page-scroll">
      <header className="page-head reveal">
        <div className="page-title">
          <h1>{t('nav.projects')}</h1>
          <p className="page-sub">{t('projects.subtitle', { active: counts.active, done: counts.done })}</p>
        </div>
        <div className="segmented" role="tablist" aria-label={t('nav.projects')}>
          {(['all', 'active', 'late', 'done'] as Filter[]).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {t(`projects.filter.${f}`)}
            </button>
          ))}
        </div>
        {canCreate && (
          <button className="btn btn-accent" onClick={() => setCreating((v) => !v)} aria-expanded={creating}>
            <Plus size={16} /> <span className="hide-sm">{t('nav.newProject')}</span>
          </button>
        )}
      </header>

      {creating && (
        <form className="panel glass new-project" onSubmit={submit}>
          <label className="field field-grow">
            <span>{t('nav.projectName')}</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus required />
          </label>
          <div className="swatches" role="radiogroup" aria-label={t('nav.projectColor')}>
            {SWATCHES.map((s) => (
              <button
                type="button"
                key={s}
                role="radio"
                aria-checked={color === s}
                aria-label={s}
                className={`swatch${color === s ? ' active' : ''}`}
                style={{ background: s }}
                onClick={() => setColor(s)}
              />
            ))}
          </div>
          <button className="btn btn-primary" disabled={!name.trim() || create.isPending}>
            {t('nav.addProject')}
          </button>
        </form>
      )}

      <section className="chips-row reveal">
        <div className="mini-stat glass">
          <span>{t('projects.active')}</span>
          <strong className="mono">{counts.active}</strong>
        </div>
        <div className="mini-stat glass">
          <span>{t('project.statusDone')}</span>
          <strong className="mono">{counts.done}</strong>
        </div>
        <div className="mini-stat glass">
          <span>{t('project.statusActive')}</span>
          <strong className="mono">{Math.round(counts.onTrack * 100)}%</strong>
        </div>
        <div className="mini-stat glass">
          <span>{t('projects.dueMonth')}</span>
          <strong className="mono">{counts.dueMonth}</strong>
        </div>
      </section>

      <section className="projects-grid">
        {shown.map(({ project, own, health, next, people, done }) => {
          const pct = own.length ? done / own.length : 0;
          const r = 22;
          const c = 2 * Math.PI * r;
          const nextDue = next ? dueInfo(next.dueDate, false) : null;
          const pinned = pins.includes(project.id);
          return (
            <article key={project.id} className="project-card glass reveal" style={{ ['--tag' as string]: project.color }}>
              <header className="project-card-head">
                <span className="project-badge project-badge-sm" style={{ background: project.color }} aria-hidden="true">
                  {project.name.charAt(0).toUpperCase()}
                </span>
                <div className="project-card-title">
                  <button className="project-card-name truncate" onClick={() => navigate({ page: 'project', id: project.id })}>
                    {project.name}
                  </button>
                  <span className={`status-pill status-pill-${HEALTH_PILL[health]}`}>{t(HEALTH_KEY[health])}</span>
                </div>
                <button
                  className={`icon-btn pin${pinned ? ' on' : ''}`}
                  onClick={() => togglePin(project.id)}
                  aria-pressed={pinned}
                  aria-label={pinned ? t('projects.unpin') : t('projects.pin')}
                  title={pinned ? t('projects.unpin') : t('projects.pin')}
                >
                  <Star size={16} />
                </button>
              </header>
              {project.description && <p className="project-card-desc">{project.description}</p>}
              <div className="project-next">
                <div className="project-next-ring" aria-hidden="true">
                  <svg viewBox="0 0 52 52">
                    <circle cx="26" cy="26" r={r} className="focus-track" />
                    <circle
                      cx="26"
                      cy="26"
                      r={r}
                      fill="none"
                      stroke={project.color}
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={c}
                      strokeDashoffset={c * (1 - pct)}
                      transform="rotate(-90 26 26)"
                    />
                  </svg>
                  <span className="mono">{Math.round(pct * 100)}%</span>
                </div>
                <div className="project-next-text">
                  <span className="muted small">{next ? t('projects.nextDeadline') : t('projects.noDeadlines')}</span>
                  {next ? (
                    <>
                      <strong className="truncate">{next.title}</strong>
                      <span className={`small due due-${nextDue?.tone}`}>{nextDue?.label}</span>
                    </>
                  ) : (
                    <button className="link small" onClick={() => newTask({ projectId: project.id })}>
                      {t('project.addTask')}
                    </button>
                  )}
                </div>
              </div>
              <footer className="project-card-foot">
                <span className="avatar-stack">
                  {people.slice(0, 4).map((m) => (
                    <Avatar key={m.id} user={m} size={24} />
                  ))}
                  {people.length > 4 && <span className="avatar avatar-more">+{people.length - 4}</span>}
                </span>
                <span className="muted small mono">{t('projects.tasksDone', { done, total: own.length })}</span>
                <span className="spacer" />
                {project.dueDate && (
                  <span className="muted small">
                    <CalendarDays size={13} /> {shortDay(project.dueDate)}
                  </span>
                )}
              </footer>
            </article>
          );
        })}
        {!shown.length && <p className="empty-note">{t('projects.none')}</p>}
      </section>
    </div>
  );
}
