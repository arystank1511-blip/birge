import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart3, CalendarDays, Check, CheckSquare, ChevronsUpDown, FolderKanban, Home, LogOut, Plus, Settings, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { ROLE_RANK, api, type Workspace } from '../api';
import { useInvalidateTasks, useWorkspace } from '../hooks';
import { useI18n, type MessageKey } from '../i18n';
import type { Route } from '../router';
import { toastError } from '../toast';
import { Avatar, Logo, Ring } from './ui';

const SWATCHES = ['#3b5bfd', '#16a34a', '#ff8a5b', '#8b7cff', '#ff7eb6', '#14b8a6'];

type NavPage = Exclude<Route['page'], 'project'>;
const NAV: { page: NavPage; key: MessageKey; icon: ReactNode }[] = [
  { page: 'home', key: 'nav.home', icon: <Home size={17} /> },
  { page: 'tasks', key: 'nav.tasks', icon: <CheckSquare size={17} /> },
  { page: 'calendar', key: 'nav.calendar', icon: <CalendarDays size={17} /> },
  { page: 'projects', key: 'nav.projects', icon: <FolderKanban size={17} /> },
  { page: 'insights', key: 'nav.insights', icon: <BarChart3 size={17} /> },
  { page: 'team', key: 'nav.team', icon: <Users size={17} /> },
  { page: 'settings', key: 'nav.settings', icon: <Settings size={17} /> },
];

interface Props {
  route: Route;
  workspaces: Workspace[];
  open: boolean;
  /** Real-time connection state, shown by the logo's dot. */
  live: boolean;
  onSwitchWorkspace: (id: number) => void;
  onNavigate: (route: Route) => void;
  onLogout: () => void;
}

export function Sidebar({ route, workspaces, open, live, onSwitchWorkspace, onNavigate, onLogout }: Props) {
  const { t } = useI18n();
  const { workspace, api: wsApi, me, projects } = useWorkspace();
  const invalidate = useInvalidateTasks();
  const canManage = ROLE_RANK[workspace.role] >= ROLE_RANK.admin;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[0]);

  const create = useMutation({
    mutationFn: () => wsApi.createProject(name.trim(), color),
    onSuccess: (project) => {
      invalidate();
      setAdding(false);
      setName('');
      onNavigate({ page: 'project', id: project.id });
    },
    onError: toastError,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) create.mutate();
  };

  const totalOpen = projects.reduce((sum, p) => sum + p.openCount, 0);

  return (
    <aside className={`sidebar glass${open ? ' sidebar-open' : ''}`}>
      <Logo pulse={live} idle={!live} />
      <WorkspaceSwitcher workspaces={workspaces} onSwitch={onSwitchWorkspace} />

      <nav className="nav" aria-label={t('nav.main')}>
        {NAV.map((item) => (
          <button
            key={item.page}
            className={`nav-item${route.page === item.page ? ' active' : ''}`}
            aria-current={route.page === item.page ? 'page' : undefined}
            onClick={() => onNavigate({ page: item.page } as Route)}
          >
            {item.icon}
            <span>{t(item.key)}</span>
            {item.page === 'tasks' && <span className="nav-count mono">{totalOpen}</span>}
            {item.page === 'team' && <span className="nav-count mono">{workspace.memberCount}</span>}
          </button>
        ))}
      </nav>

      <div className="nav-section">
        <span>{t('nav.projects')}</span>
        {canManage && (
          <button className="icon-btn icon-btn-sm" onClick={() => setAdding((v) => !v)} aria-label={t('nav.newProject')}>
            <Plus size={15} />
          </button>
        )}
      </div>

      {adding && (
        <form className="project-form" onSubmit={submit}>
          <input
            className="input"
            placeholder={t('nav.projectName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
          />
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
          <button className="btn btn-primary btn-sm btn-block" disabled={!name.trim() || create.isPending}>
            {t('nav.addProject')}
          </button>
        </form>
      )}

      <nav className="nav nav-projects">
        {projects.map((p) => (
          <button
            key={p.id}
            className={`nav-item${route.page === 'project' && route.id === p.id ? ' active' : ''}`}
            aria-current={route.page === 'project' && route.id === p.id ? 'page' : undefined}
            onClick={() => onNavigate({ page: 'project', id: p.id })}
            style={{ ['--tag' as string]: p.color }}
          >
            <Ring value={p.taskCount - p.openCount} total={p.taskCount} color={p.color} size={17} />
            <span className="truncate">{p.name}</span>
            <span className="nav-count mono">{p.openCount}</span>
          </button>
        ))}
        {projects.length === 0 && !adding && <p className="muted small nav-empty">{t('nav.noProjects')}</p>}
      </nav>

      <div className="sidebar-foot">
        <div className="me">
          <Avatar user={me} size={30} />
          <div className="me-text">
            <strong className="truncate">{me.name}</strong>
            <span className="muted truncate">{t(`role.${workspace.role}`)}</span>
          </div>
        </div>
        <div className="foot-actions">
          <button className="icon-btn" onClick={onLogout} aria-label={t('nav.signOut')} title={t('nav.signOut')}>
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function WorkspaceSwitcher({ workspaces, onSwitch }: { workspaces: Workspace[]; onSwitch: (id: number) => void }) {
  const { t } = useI18n();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const create = useMutation({
    mutationFn: () => api.createWorkspace(name.trim()),
    onSuccess: (ws) => {
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      setName('');
      setCreating(false);
      setOpen(false);
      onSwitch(ws.id);
    },
    onError: toastError,
  });

  return (
    <div className="switcher" ref={ref}>
      <button className="switcher-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="listbox">
        <span className="ws-badge">{workspace.name.charAt(0).toUpperCase()}</span>
        <span className="switcher-text">
          <strong className="truncate">{workspace.name}</strong>
          <span className="muted truncate">{t('ws.memberCount', { n: workspace.memberCount })}</span>
        </span>
        <ChevronsUpDown size={15} className="muted" />
      </button>
      {open && (
        <div className="popover glass switcher-pop">
          <p className="pop-label">{t('ws.workspaces')}</p>
          <ul role="listbox" aria-label={t('ws.workspaces')}>
            {workspaces.map((w) => (
              <li key={w.id}>
                <button
                  role="option"
                  aria-selected={w.id === workspace.id}
                  className="pop-item"
                  onClick={() => {
                    setOpen(false);
                    onSwitch(w.id);
                  }}
                >
                  <span className="ws-badge ws-badge-sm">{w.name.charAt(0).toUpperCase()}</span>
                  <span className="truncate">{w.name}</span>
                  <span className="muted small">{t(`role.${w.role}`)}</span>
                  {w.id === workspace.id && <Check size={14} />}
                </button>
              </li>
            ))}
          </ul>
          {creating ? (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) create.mutate();
              }}
            >
              <input
                className="input"
                placeholder={t('ws.name')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                autoFocus
              />
              <button className="btn btn-primary btn-sm" disabled={!name.trim() || create.isPending}>
                {t('ws.create')}
              </button>
            </form>
          ) : (
            <button className="pop-item pop-item-action" onClick={() => setCreating(true)}>
              <Plus size={15} /> {t('ws.new')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
