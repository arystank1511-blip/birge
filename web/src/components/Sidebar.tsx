import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, LayoutGrid, LogOut, Plus, Users } from 'lucide-react';
import { ROLE_RANK, api, type Project, type Workspace } from '../api';
import { useInvalidateTasks, useWorkspace } from '../hooks';
import { useI18n } from '../i18n';
import { toastError } from '../toast';
import { SettingsMenu } from './SettingsMenu';
import { Avatar, Logo, Ring } from './ui';
import type { Page } from './Workspace';

const SWATCHES = ['#3b5bfd', '#16a34a', '#ff8a5b', '#8b7cff', '#ff7eb6', '#14b8a6'];

interface Props {
  projects: Project[];
  workspaces: Workspace[];
  selectedProject?: number;
  page: Page;
  open: boolean;
  onSwitchWorkspace: (id: number) => void;
  onSelectProject: (id: number | undefined) => void;
  onOpenMembers: () => void;
  onLogout: () => void;
}

export function Sidebar({
  projects,
  workspaces,
  selectedProject,
  page,
  open,
  onSwitchWorkspace,
  onSelectProject,
  onOpenMembers,
  onLogout,
}: Props) {
  const { t } = useI18n();
  const { workspace, api: wsApi, me } = useWorkspace();
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
      onSelectProject(project.id);
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
      <Logo />
      <WorkspaceSwitcher workspaces={workspaces} onSwitch={onSwitchWorkspace} />

      <nav className="nav">
        <button
          className={`nav-item${page === 'tasks' && selectedProject === undefined ? ' active' : ''}`}
          onClick={() => onSelectProject(undefined)}
        >
          <LayoutGrid size={17} />
          <span>{t('nav.allTasks')}</span>
          <span className="nav-count mono">{totalOpen}</span>
        </button>
        <button className={`nav-item${page === 'members' ? ' active' : ''}`} onClick={onOpenMembers}>
          <Users size={17} />
          <span>{t('nav.members')}</span>
          <span className="nav-count mono">{workspace.memberCount}</span>
        </button>
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
            className={`nav-item${page === 'tasks' && selectedProject === p.id ? ' active' : ''}`}
            onClick={() => onSelectProject(p.id)}
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
          <SettingsMenu />
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
