import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, CircleDot, Columns3, Flag, List, Menu, Plus, Search, Trophy, UserRound } from 'lucide-react';
import {
  PRIORITIES,
  STATUSES,
  api,
  workspaceApi,
  type Priority,
  type Status,
  type Task,
  type TaskFilters,
  type User,
  type Workspace as WorkspaceInfo,
} from '../api';
import { todayISO } from '../dates';
import { WorkspaceContext, isTypingTarget, useDebounced, useInvalidateTasks } from '../hooks';
import { useI18n } from '../i18n';
import { useRealtime } from '../realtime';
import { toastError } from '../toast';
import { Board, type Layout } from './Board';
import { ListView } from './ListView';
import { MembersPage } from './MembersPage';
import { NewTaskModal } from './NewTaskModal';
import { Sidebar } from './Sidebar';
import { TaskDrawer } from './TaskDrawer';
import { Avatar, Select } from './ui';

type View = 'board' | 'list';
export type Page = 'tasks' | 'members';

function loadView(): View {
  try {
    return localStorage.getItem('tl-view') === 'list' ? 'list' : 'board';
  } catch {
    return 'board';
  }
}

interface Props {
  me: User;
  workspace: WorkspaceInfo;
  workspaces: WorkspaceInfo[];
  onSwitch: (id: number) => void;
  onLostAccess: (message: string) => void;
}

export function Workspace({ me, workspace, workspaces, onSwitch, onLostAccess }: Props) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const invalidate = useInvalidateTasks();
  const searchRef = useRef<HTMLInputElement>(null);
  const wsApi = useMemo(() => workspaceApi(workspace.id), [workspace.id]);
  const ws = workspace.id;

  const [page, setPage] = useState<Page>('tasks');
  const [projectId, setProjectId] = useState<number | undefined>();
  const [mine, setMine] = useState(false);
  const [priority, setPriority] = useState<Priority | undefined>();
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [view, setView] = useState<View>(loadView);
  const [openTask, setOpenTask] = useState<number | null>(null);
  const [newTask, setNewTask] = useState<Status | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const filters: TaskFilters = useMemo(() => ({ projectId, mine, priority, q }), [projectId, mine, priority, q]);
  const tasksKey = ['tasks', ws, filters];

  const projects = useQuery({ queryKey: ['projects', ws], queryFn: wsApi.projects });
  const members = useQuery({ queryKey: ['members', ws], queryFn: wsApi.members });
  const tasks = useQuery({ queryKey: tasksKey, queryFn: () => wsApi.tasks(filters), placeholderData: keepPreviousData });
  const stats = useQuery({
    queryKey: ['stats', ws, filters],
    queryFn: () => wsApi.stats(filters, todayISO()),
    placeholderData: keepPreviousData,
  });

  const { online, connected } = useRealtime({
    url: wsApi.eventsUrl,
    workspaceName: workspace.name,
    meId: me.id,
    onLostAccess,
  });

  const projectMap = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, p])), [projects.data]);
  const userMap = useMemo(() => new Map((members.data ?? []).map((u) => [u.id, u])), [members.data]);
  const current = projectId ? projectMap.get(projectId) : undefined;
  const onlineMembers = online.map((id) => userMap.get(id)).filter((u) => u !== undefined);

  // The selected project may disappear (deleted by a teammate).
  useEffect(() => {
    if (projectId && projects.data && !projectMap.has(projectId)) setProjectId(undefined);
  }, [projectId, projects.data, projectMap]);

  useEffect(() => {
    try {
      localStorage.setItem('tl-view', view);
    } catch {
      // Not critical.
    }
  }, [view]);

  // Keyboard shortcuts: "/" focuses search, "n" opens the new task dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey || page !== 'tasks') return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key.toLowerCase() === 'n' && openTask === null && newTask === null) {
        e.preventDefault();
        setNewTask('todo');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openTask, newTask, page]);

  const move = useMutation({
    mutationFn: ({ id, status, afterId, beforeId }: { id: number; status: Status; afterId: number | null; beforeId: number | null }) =>
      wsApi.moveTask(id, status, afterId, beforeId),
    onError: toastError,
    onSettled: invalidate,
  });

  const handleMove = (id: number, status: Status, layout: Layout) => {
    // Optimistically apply the new layout so the card doesn't jump back while the request is in flight.
    qc.cancelQueries({ queryKey: tasksKey });
    qc.setQueryData<Task[]>(tasksKey, (old) =>
      old?.map((task) => {
        for (const s of STATUSES) {
          const index = layout[s].indexOf(task.id);
          if (index >= 0) return { ...task, status: s, position: index };
        }
        return task;
      }),
    );
    const column = layout[status];
    const i = column.indexOf(id);
    move.mutate({ id, status, afterId: column[i - 1] ?? null, beforeId: column[i + 1] ?? null });
  };

  const toggleDone = useMutation({
    mutationFn: (task: Task) => wsApi.updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' }),
    onSuccess: invalidate,
    onError: toastError,
  });

  const logout = async () => {
    await api.logout().catch(() => undefined);
    qc.clear();
    qc.setQueryData(['me'], null);
  };

  const s = stats.data;
  const statTiles = [
    { label: t('stats.open'), value: s?.open, icon: <CircleDot size={16} />, tone: '' },
    { label: t('stats.dueWeek'), value: s?.dueThisWeek, icon: <CalendarClock size={16} />, tone: 'soon' },
    { label: t('stats.overdue'), value: s?.overdue, icon: <AlertTriangle size={16} />, tone: s?.overdue ? 'danger' : '' },
    { label: t('stats.done7'), value: s?.doneThisWeek, icon: <Trophy size={16} />, tone: 'accent' },
  ];
  const hasFilters = mine || priority || search;

  const presence = (
    <div className="presence" title={connected ? t('head.liveHint') : t('head.reconnecting')}>
      <span className={`live-dot${connected ? ' on' : ''}`} />
      <span className="live-label hide-sm">{connected ? t('head.live') : t('head.reconnecting')}</span>
      {onlineMembers.length > 0 && (
        <div className="avatar-stack" aria-label={`${t('head.online')}: ${onlineMembers.map((u) => u.name).join(', ')}`}>
          {onlineMembers.slice(0, 4).map((u) => (
            <Avatar key={u.id} user={u} size={26} />
          ))}
          {onlineMembers.length > 4 && <span className="avatar avatar-more">+{onlineMembers.length - 4}</span>}
        </div>
      )}
    </div>
  );

  return (
    <WorkspaceContext.Provider value={{ workspace, api: wsApi, me, members: members.data ?? [] }}>
      <div className="shell">
        <Sidebar
          projects={projects.data ?? []}
          workspaces={workspaces}
          selectedProject={projectId}
          page={page}
          open={sidebarOpen}
          onSwitchWorkspace={onSwitch}
          onSelectProject={(id) => {
            setProjectId(id);
            setPage('tasks');
            setSidebarOpen(false);
          }}
          onOpenMembers={() => {
            setPage('members');
            setSidebarOpen(false);
          }}
          onLogout={logout}
        />
        {sidebarOpen && <div className="backdrop backdrop-mobile" onClick={() => setSidebarOpen(false)} />}

        <main className="main">
          <header className="page-head">
            <button className="icon-btn mobile-only" onClick={() => setSidebarOpen(true)} aria-label={t('nav.openMenu')}>
              <Menu size={18} />
            </button>
            <div className="page-title">
              <p className="eyebrow">
                {page === 'tasks' && current ? (
                  <>
                    <i style={{ background: current.color }} /> {t('head.project')}
                  </>
                ) : (
                  workspace.name
                )}
              </p>
              <h1>{page === 'members' ? t('members.title') : (current?.name ?? t('nav.allTasks'))}</h1>
            </div>
            <span className="spacer" />
            {presence}
            {page === 'tasks' && (
              <>
                <div className="segmented" role="tablist" aria-label={t('head.view')}>
                  <button role="tab" aria-selected={view === 'board'} className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>
                    <Columns3 size={15} /> <span className="hide-sm">{t('head.board')}</span>
                  </button>
                  <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
                    <List size={15} /> <span className="hide-sm">{t('head.list')}</span>
                  </button>
                </div>
                <button className="btn btn-accent" onClick={() => setNewTask('todo')} aria-label={t('head.newTask')}>
                  <Plus size={17} /> <span className="hide-sm">{t('head.newTask')}</span>
                  <kbd className="hide-sm">N</kbd>
                </button>
              </>
            )}
          </header>

          {page === 'members' ? (
            <MembersPage online={online} />
          ) : (
            <>
              <section className="stats">
                {statTiles.map((tile) => (
                  <div key={tile.label} className={`stat glass stat-${tile.tone}`}>
                    <span className="stat-icon">{tile.icon}</span>
                    <span className="stat-label">{tile.label}</span>
                    <strong className="stat-value mono">{tile.value ?? '–'}</strong>
                  </div>
                ))}
              </section>

              <section className="filters glass">
                <button className={`chip${mine ? ' chip-on' : ''}`} onClick={() => setMine((v) => !v)} aria-pressed={mine}>
                  <UserRound size={15} /> {t('filter.mine')}
                </button>
                <Select
                  className="chip-select"
                  value={priority ?? ''}
                  onChange={(e) => setPriority((e.target.value || undefined) as Priority | undefined)}
                  aria-label={t('task.priority')}
                  icon={<Flag size={15} />}
                >
                  <option value="">{t('filter.anyPriority')}</option>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {t(`priority.${p}`)}
                    </option>
                  ))}
                </Select>
                <label className="search">
                  <Search size={16} />
                  <input
                    ref={searchRef}
                    type="search"
                    placeholder={t('filter.search')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label={t('filter.search')}
                  />
                  <kbd>/</kbd>
                </label>
                {hasFilters && (
                  <button
                    className="link link-muted"
                    onClick={() => {
                      setMine(false);
                      setPriority(undefined);
                      setSearch('');
                    }}
                  >
                    {t('filter.clear')}
                  </button>
                )}
              </section>

              {tasks.isError ? (
                <div className="empty glass">
                  {t('filter.loadError')}{' '}
                  <button className="link" onClick={() => tasks.refetch()}>
                    {t('filter.retry')}
                  </button>
                </div>
              ) : !tasks.data ? (
                <div className="board">
                  {STATUSES.map((status) => (
                    <div key={status} className="column skeleton" />
                  ))}
                </div>
              ) : view === 'board' ? (
                <Board
                  tasks={tasks.data}
                  projects={projectMap}
                  users={userMap}
                  onOpen={setOpenTask}
                  onAdd={setNewTask}
                  onMove={handleMove}
                />
              ) : (
                <ListView
                  tasks={tasks.data}
                  projects={projectMap}
                  users={userMap}
                  onOpen={setOpenTask}
                  onToggleDone={(task) => toggleDone.mutate(task)}
                />
              )}
            </>
          )}
        </main>

        {openTask !== null && <TaskDrawer taskId={openTask} projects={projects.data ?? []} onClose={() => setOpenTask(null)} />}
        {newTask !== null && (
          <NewTaskModal
            initialStatus={newTask}
            defaultProjectId={projectId}
            projects={projects.data ?? []}
            onClose={() => setNewTask(null)}
          />
        )}
      </div>
    </WorkspaceContext.Provider>
  );
}
