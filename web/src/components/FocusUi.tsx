import { useState } from 'react';
import { Pause, Play, Square, Timer } from 'lucide-react';
import type { Member } from '../api';
import { endFocus, formatClock, pauseFocus, resumeFocus, startFocus, useFocusLeft, useFocusSession } from '../focus';
import { isOpen } from '../metrics';
import { useAllTasks, useWorkspace } from '../hooks';
import { useI18n } from '../i18n';
import { usePrefs } from '../prefs';
import { Avatar } from './ui';

const PRESETS = [15, 25, 50];

/** Home card: pick a length and (optionally) one of your tasks, then focus. */
export function FocusCard() {
  const { t } = useI18n();
  const { me } = useWorkspace();
  const prefs = usePrefs();
  const session = useFocusSession();
  const left = useFocusLeft(session);
  const { data: tasks = [] } = useAllTasks();
  const [minutes, setMinutes] = useState(PRESETS.includes(prefs.focusMinutes) ? prefs.focusMinutes : 25);
  const [taskId, setTaskId] = useState<number | ''>('');
  const mine = tasks.filter((task) => task.assigneeId === me.id && isOpen(task));

  const total = (session?.minutes ?? minutes) * 60_000;
  const shown = session ? left : total;
  const r = 52;
  const c = 2 * Math.PI * r;
  const progress = session ? 1 - left / total : 0;

  return (
    <article className="panel glass reveal dash-focus">
      <header className="panel-head">
        <div>
          <h2>{t('focus.title')}</h2>
          <p className="muted small">{t('focus.hint')}</p>
        </div>
        {!session && (
          <div className="segmented segmented-sm" role="radiogroup" aria-label={t('focus.length')}>
            {PRESETS.map((p) => (
              <button key={p} role="radio" aria-checked={minutes === p} className={minutes === p ? 'on' : ''} onClick={() => setMinutes(p)}>
                {p}
                {t('focus.minShort')}
              </button>
            ))}
          </div>
        )}
      </header>
      <div className="focus-body">
        <div className="focus-dial" role="timer" aria-live="off" aria-label={formatClock(shown)}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r={r} className="focus-track" />
            <circle
              cx="60"
              cy="60"
              r={r}
              className="focus-arc"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - progress)}
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="focus-time">
            <strong className="mono">{formatClock(shown)}</strong>
            <span>{session ? (session.pausedLeft !== null ? t('focus.paused') : t('focus.running')) : t('focus.ready')}</span>
          </div>
        </div>
        <div className="focus-side">
          {session ? (
            <>
              <span className="muted small">{t('focus.on')}</span>
              <strong className="truncate">{session.taskTitle ?? t('focus.noTask')}</strong>
              <div className="focus-buttons">
                {session.pausedLeft !== null ? (
                  <button className="btn btn-sm btn-accent" onClick={resumeFocus}>
                    <Play size={14} /> {t('focus.resume')}
                  </button>
                ) : (
                  <button className="btn btn-sm btn-ghost-glass" onClick={pauseFocus}>
                    <Pause size={14} /> {t('focus.pause')}
                  </button>
                )}
                <button className="btn btn-sm btn-ghost-glass" onClick={endFocus}>
                  <Square size={13} /> {t('focus.end')}
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="field">
                <span>{t('focus.on')}</span>
                <select className="input" value={taskId} onChange={(e) => setTaskId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">{t('focus.noTask')}</option>
                  {mine.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn btn-accent btn-block"
                onClick={() => {
                  const task = mine.find((x) => x.id === taskId);
                  startFocus(minutes, task ? { id: task.id, title: task.title } : null);
                }}
              >
                <Play size={15} /> {t('focus.start')}
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

/** The pill in the top bar while a session runs: always visible, wherever you are. */
export function FocusIsland() {
  const { t } = useI18n();
  const session = useFocusSession();
  const left = useFocusLeft(session);
  if (!session) return null;
  const paused = session.pausedLeft !== null;
  return (
    <div className={`focus-island${paused ? ' paused' : ''}`} role="status" aria-label={`${t('focus.title')}: ${formatClock(left)}`}>
      <Timer size={14} />
      <span className="truncate">{session.taskTitle ?? t('focus.title')}</span>
      <strong className="mono">{formatClock(left)}</strong>
      <button className="island-btn" onClick={paused ? resumeFocus : pauseFocus} aria-label={paused ? t('focus.resume') : t('focus.pause')}>
        {paused ? <Play size={12} /> : <Pause size={12} />}
      </button>
    </div>
  );
}

export type PresenceKind = 'focus' | 'online' | 'offline';

export function presenceOf(member: Pick<Member, 'id' | 'focusUntil'>, online: number[]): PresenceKind {
  if (member.focusUntil && member.focusUntil > new Date().toISOString()) return 'focus';
  return online.includes(member.id) ? 'online' : 'offline';
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Home card: who's around right now, people in focus first. */
export function RightNowCard() {
  const { t } = useI18n();
  const { members, online, me, navigate } = useWorkspace();
  const order: Record<PresenceKind, number> = { focus: 0, online: 1, offline: 2 };
  const people = [...members].sort((a, b) => order[presenceOf(a, online)] - order[presenceOf(b, online)] || a.name.localeCompare(b.name));

  return (
    <article className="panel glass reveal dash-now">
      <header className="panel-head">
        <div>
          <h2>{t('now.title')}</h2>
          <p className="muted small">{t('now.hint', { n: people.filter((m) => presenceOf(m, online) !== 'offline').length })}</p>
        </div>
        <button className="link" onClick={() => navigate({ page: 'team' })}>
          {t('nav.team')}
        </button>
      </header>
      <ul className="now-list">
        {people.map((m) => {
          const kind = presenceOf(m, online);
          return (
            <li key={m.id}>
              <span className="avatar-wrap">
                <Avatar user={m} size={32} />
                <span className={`presence-dot presence-${kind}`} />
              </span>
              <div className="load-text">
                <strong className="truncate">
                  {m.name} {m.id === me.id && <span className="muted">{t('task.you')}</span>}
                </strong>
                <span className="muted small truncate">
                  {kind === 'focus'
                    ? t('now.focusUntil', { time: clock(m.focusUntil!) })
                    : kind === 'online'
                      ? t('team.onlineNow')
                      : t('now.offline')}
                  {' · '}
                  {t(`role.${m.role}`)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
