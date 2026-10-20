import { CalendarDays, Clock, Mail, X } from 'lucide-react';
import { dueInfo, todayISO, weekdayShort } from '../dates';
import { useAllTasks, useEscape, useWorkspace } from '../hooks';
import { useI18n } from '../i18n';
import { addDays, completedBetween, isOpen, lastDays, workload } from '../metrics';
import { presenceOf } from './FocusUi';
import { Avatar } from './ui';

/** Weekly capacity in workload points (urgent = 3, high = 2, others = 1), used for the load ring. */
export const CAPACITY = 12;

/** "14:05" in the given zone, plus how far it is from the viewer's own clock. */
export function localTime(timeZone: string | null | undefined) {
  if (!timeZone) return null;
  try {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone });
    const there = new Date(now.toLocaleString('en-US', { timeZone }));
    const here = new Date(now.toLocaleString('en-US'));
    const diffHours = Math.round(((there.getTime() - here.getTime()) / 3_600_000) * 2) / 2;
    const city = timeZone.split('/').pop()?.replace(/_/g, ' ') ?? timeZone;
    return { time, diffHours, city };
  } catch {
    return null;
  }
}

export function MemberPanel({ memberId, onClose }: { memberId: number; onClose: () => void }) {
  const { t } = useI18n();
  const { members, online, me, projects, openTask } = useWorkspace();
  const { data: tasks = [] } = useAllTasks();
  useEscape(onClose);

  const member = members.find((m) => m.id === memberId);
  if (!member) return null;

  const theirs = tasks.filter((task) => task.assigneeId === member.id);
  const open = theirs.filter(isOpen).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const load = workload(theirs);
  const loadPct = Math.min(1, load / CAPACITY);
  const week = lastDays(7, todayISO());
  const doneWeek = completedBetween(theirs, week[0], week[6]).length;
  const today = todayISO();
  const weekAhead = open.filter((task) => task.dueDate && task.dueDate >= today && task.dueDate <= addDays(today, 6));
  const kind = presenceOf(member, online);
  const zone = localTime(member.timezone);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const r = 30;
  const c = 2 * Math.PI * r;

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <aside className="drawer member-panel glass" role="dialog" aria-modal="true" aria-label={member.name}>
        <button className="icon-btn member-close" onClick={onClose} aria-label={t('task.close')}>
          <X size={18} />
        </button>

        <header className="member-hero" style={{ ['--hero' as string]: member.color }}>
          <span className="avatar-wrap">
            <Avatar user={member} size={72} />
            <span className={`presence-dot presence-${kind}`} />
          </span>
          <div className="member-hero-text">
            <h2>
              {member.name} {member.id === me.id && <span className="muted">{t('task.you')}</span>}
            </h2>
            <div className="member-tags">
              <span className={`role-badge role-${member.role}`}>{t(`role.${member.role}`)}</span>
              <span className="member-status">
                <span className={`status-dot status-${kind}`} />
                {kind === 'focus'
                  ? t('now.focusUntil', {
                      time: new Date(member.focusUntil!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    })
                  : kind === 'online'
                    ? t('team.onlineNow')
                    : t('now.offline')}
              </span>
            </div>
          </div>
        </header>

        <div className="member-body">
          <div className="member-tiles">
            <div className="member-tile">
              <span className="muted small">{t('auth.email')}</span>
              <span className="member-tile-value truncate">
                <Mail size={14} /> {member.email}
              </span>
            </div>
            <div className="member-tile">
              <span className="muted small">{t('member.localTime')}</span>
              <span className="member-tile-value truncate">
                <Clock size={14} /> {zone ? `${zone.time} · ${zone.city}` : '–'}
              </span>
            </div>
          </div>

          <div className="member-load">
            <div className="member-ring" aria-hidden="true">
              <svg viewBox="0 0 72 72">
                <circle cx="36" cy="36" r={r} className="focus-track" />
                <circle
                  cx="36"
                  cy="36"
                  r={r}
                  className={`member-ring-arc${loadPct >= 1 ? ' over' : ''}`}
                  strokeDasharray={c}
                  strokeDashoffset={c * (1 - loadPct)}
                  transform="rotate(-90 36 36)"
                />
              </svg>
              <span className="mono">{Math.round(loadPct * 100)}%</span>
            </div>
            <dl className="member-load-list">
              <div>
                <dt>{t('team.workload')}</dt>
                <dd className="mono">
                  {load}
                  <small> / {CAPACITY}</small>
                </dd>
              </div>
              <div>
                <dt>{t('team.doneWeek')}</dt>
                <dd className="mono">{doneWeek}</dd>
              </div>
              <div>
                <dt>{t('member.openTasks')}</dt>
                <dd className="mono">{open.length}</dd>
              </div>
            </dl>
          </div>

          <section className="member-section">
            <h3 className="sub-heading">
              {t('member.openTasks')} <span className="count mono">{open.length}</span>
            </h3>
            {open.length ? (
              <ul className="member-tasks">
                {open.slice(0, 6).map((task) => {
                  const project = projectById.get(task.projectId);
                  const due = dueInfo(task.dueDate, false);
                  return (
                    <li key={task.id}>
                      <button onClick={() => openTask(task.id)}>
                        <span className="project-chip" style={{ background: project?.color }}>
                          {project?.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="member-task-text">
                          <strong className="truncate">{task.title}</strong>
                          <span className="muted small truncate">
                            {due ? `${due.label} · ` : ''}
                            {project?.name}
                          </span>
                        </span>
                        {(task.priority === 'high' || task.priority === 'urgent') && (
                          <span className={`prio-badge prio-badge-${task.priority}`}>{t(`priority.${task.priority}`)}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="empty-note">{t('home.allClear')}</p>
            )}
          </section>

          <section className="member-section">
            <h3 className="sub-heading">
              {t('member.weekAhead')} <span className="count mono">{weekAhead.length}</span>
            </h3>
            {weekAhead.length ? (
              <ul className="member-week">
                {weekAhead.map((task) => (
                  <li key={task.id}>
                    <button onClick={() => openTask(task.id)}>
                      <span className="date-chip">
                        <small>{weekdayShort(task.dueDate!)}</small>
                        <strong className="mono">{Number(task.dueDate!.slice(8))}</strong>
                      </span>
                      <span className="member-task-text">
                        <strong className="truncate">{task.title}</strong>
                        <span className="muted small truncate">
                          <CalendarDays size={12} /> {dueInfo(task.dueDate, false)?.label} · {projectById.get(task.projectId)?.name}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-note">{t('member.nothingThisWeek')}</p>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
