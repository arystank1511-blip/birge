import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, CircleDot, Columns3, Flag, FolderKanban, List, Plus, Search, Trophy, UserRound, X } from 'lucide-react';
import { PRIORITIES, STATUSES, type Priority, type Status, type Task, type TaskFilters } from '../api';
import { todayISO } from '../dates';
import { isTypingTarget, useDebounced, useInvalidateTasks, useToggleDone, useWorkspace } from '../hooks';
import { translate, useI18n } from '../i18n';
import { toast, toastError } from '../toast';
import { Board, type Layout } from './Board';
import { ListView } from './ListView';
import { Avatar, Select } from './ui';

type View = 'board' | 'list';

function loadView(): View {
  try {
    return localStorage.getItem('tl-view') === 'list' ? 'list' : 'board';
  } catch {
    return 'board';
  }
}

export function TasksPage({ assignee }: { assignee?: number }) {
  const { t } = useI18n();
  const { workspace, api, projects, members, navigate, openTask, newTask } = useWorkspace();
  const qc = useQueryClient();
  const invalidate = useInvalidateTasks();
  const toggleDone = useToggleDone();
  const searchRef = useRef<HTMLInputElement>(null);
  const ws = workspace.id;

  const [projectId, setProjectId] = useState<number | undefined>();
  const [mine, setMine] = useState(false);
  const [priority, setPriority] = useState<Priority | undefined>();
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [view, setView] = useState<View>(loadView);

  const person = assignee ? members.find((m) => m.id === assignee) : undefined;
  const filters: TaskFilters = useMemo(
    () => ({ projectId, mine, assigneeId: assignee, priority, q }),
    [projectId, mine, assignee, priority, q],
  );
  const tasksKey = ['tasks', ws, filters];
  const tasks = useQuery({ queryKey: tasksKey, queryFn: () => api.tasks(filters), placeholderData: keepPreviousData });
  const stats = useQuery({
    queryKey: ['stats', ws, filters],
    queryFn: () => api.stats(filters, todayISO()),
    placeholderData: keepPreviousData,
  });

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const userMap = useMemo(() => new Map(members.map((u) => [u.id, u])), [members]);

  useEffect(() => {
    try {
      localStorage.setItem('tl-view', view);
    } catch {
      // Not critical.
    }
  }, [view]);

  // "/" focuses the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !isTypingTarget(e.target) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const move = useMutation({
    mutationFn: ({ id, status, afterId, beforeId }: { id: number; status: Status; afterId: number | null; beforeId: number | null }) =>
      api.moveTask(id, status, afterId, beforeId),
    onError: toastError,
    onSettled: invalidate,
  });

  const handleMove = (id: number, status: Status, layout: Layout) => {
    const before = tasks.data?.find((task) => task.id === id);
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
    move.mutate(
      { id, status, afterId: column[i - 1] ?? null, beforeId: column[i + 1] ?? null },
      {
        onSuccess: () => {
          if (before && status === 'done' && before.status !== 'done') {
            toast(translate('undo.done', { title: before.title }), 'success', {
              label: translate('undo.action'),
              run: () => api.updateTask(id, { status: before.status }).then(invalidate, toastError),
            });
          }
        },
      },
    );
  };

  const s = stats.data;
  const statTiles = [
    { label: t('stats.open'), value: s?.open, icon: <CircleDot size={16} />, tone: '' },
    { label: t('stats.dueWeek'), value: s?.dueThisWeek, icon: <CalendarClock size={16} />, tone: 'soon' },
    { label: t('stats.overdue'), value: s?.overdue, icon: <AlertTriangle size={16} />, tone: s?.overdue ? 'danger' : '' },
    { label: t('stats.done7'), value: s?.doneThisWeek, icon: <Trophy size={16} />, tone: 'accent' },
  ];
  const hasFilters = projectId || mine || priority || search || assignee;

  return (
    <>
      <header className="page-head reveal">
        <div className="page-title">
          <h1>{t('nav.tasks')}</h1>
          <p className="page-sub">{t('tasks.subtitle', { open: s?.open ?? 0, projects: projects.length })}</p>
        </div>
        <span className="spacer" />
        <div className="segmented" role="tablist" aria-label={t('head.view')}>
          <button role="tab" aria-selected={view === 'board'} className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>
            <Columns3 size={15} /> <span className="hide-sm">{t('head.board')}</span>
          </button>
          <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
            <List size={15} /> <span className="hide-sm">{t('head.list')}</span>
          </button>
        </div>
        <button className="btn btn-accent" onClick={() => newTask({ projectId })} aria-label={t('head.newTask')}>
          <Plus size={17} /> <span className="hide-sm">{t('head.newTask')}</span>
          <kbd className="hide-sm">N</kbd>
        </button>
      </header>

      <section className="stats reveal">
        {statTiles.map((tile) => (
          <div key={tile.label} className={`stat glass stat-${tile.tone}`}>
            <span className="stat-icon">{tile.icon}</span>
            <span className="stat-label">{tile.label}</span>
            <strong className="stat-value mono">{tile.value ?? '–'}</strong>
          </div>
        ))}
      </section>

      <section className="filters glass reveal">
        <Select
          className="chip-select"
          value={projectId ?? ''}
          onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : undefined)}
          aria-label={t('task.project')}
          icon={<FolderKanban size={15} />}
        >
          <option value="">{t('filter.allProjects')}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        {person ? (
          <button className="chip chip-on" onClick={() => navigate({ page: 'tasks' })} aria-label={t('filter.clearPerson')}>
            <Avatar user={person} size={18} /> {person.name} <X size={14} />
          </button>
        ) : (
          <button className={`chip${mine ? ' chip-on' : ''}`} onClick={() => setMine((v) => !v)} aria-pressed={mine}>
            <UserRound size={15} /> {t('filter.mine')}
          </button>
        )}
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
              setProjectId(undefined);
              setMine(false);
              setPriority(undefined);
              setSearch('');
              if (assignee) navigate({ page: 'tasks' });
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
        <div className="reveal reveal-fill">
          <Board
            tasks={tasks.data}
            projects={projectMap}
            users={userMap}
            onOpen={openTask}
            onAdd={(status) => newTask({ status, projectId })}
            onMove={handleMove}
          />
        </div>
      ) : (
        <div className="reveal reveal-fill">
          <ListView tasks={tasks.data} projects={projectMap} users={userMap} onOpen={openTask} onToggleDone={toggleDone} />
        </div>
      )}
    </>
  );
}
