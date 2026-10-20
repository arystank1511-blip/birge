import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Menu, Moon, Plus, Search, Sun } from 'lucide-react';
import { api, workspaceApi, type Status, type User, type Workspace as WorkspaceInfo } from '../api';
import { WorkspaceContext, isTypingTarget, useAllTasks, useAppearanceContext, useWorkspace } from '../hooks';
import { translate, useI18n } from '../i18n';
import { getPrefs } from '../prefs';
import { toast } from '../toast';
import { todayISO } from '../dates';
import { useRealtime } from '../realtime';
import { routeKey, useRoute, type Route } from '../router';
import { CalendarPage } from './CalendarPage';
import { CommandPalette } from './CommandPalette';
import { FocusIsland } from './FocusUi';
import { MemberPanel } from './MemberPanel';
import { ProjectsPage } from './ProjectsPage';
import { HomePage } from './HomePage';
import { InsightsPage } from './InsightsPage';
import { NewTaskModal } from './NewTaskModal';
import { ProjectPage } from './ProjectPage';
import { SettingsPage } from './SettingsPage';
import { Sidebar } from './Sidebar';
import { TaskDrawer } from './TaskDrawer';
import { TasksPage } from './TasksPage';
import { TeamPage } from './TeamPage';
import { Avatar } from './ui';

interface Props {
  me: User;
  workspace: WorkspaceInfo;
  workspaces: WorkspaceInfo[];
  onSwitch: (id: number) => void;
  onLostAccess: (message: string) => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function Workspace({ me, workspace, workspaces, onSwitch, onLostAccess }: Props) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { theme, setTheme } = useAppearanceContext();
  const wsApi = useMemo(() => workspaceApi(workspace.id), [workspace.id]);
  const ws = workspace.id;

  const [route, navigate] = useRoute();
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  const [newTaskPreset, setNewTaskPreset] = useState<{ status?: Status; projectId?: number } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [memberId, setMemberId] = useState<number | null>(null);

  const projects = useQuery({ queryKey: ['projects', ws], queryFn: wsApi.projects });
  const members = useQuery({ queryKey: ['members', ws], queryFn: wsApi.members });

  const { online, connected } = useRealtime({
    url: wsApi.eventsUrl,
    workspaceName: workspace.name,
    meId: me.id,
    onLostAccess,
  });

  const go = useCallback(
    (next: Route) => {
      navigate(next);
      setSidebarOpen(false);
    },
    [navigate],
  );
  const openTask = useCallback((id: number) => {
    setMemberId(null);
    setOpenTaskId(id);
  }, []);
  const openMember = useCallback((id: number) => setMemberId(id), []);
  // A profile belongs to the page it was opened from: any navigation (links, back button) closes it.
  const currentRoute = routeKey(route);
  useEffect(() => setMemberId(null), [currentRoute]);

  // Keep the profile's home time zone in sync with this device, so teammates see the right local time.
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone && me.timezone !== zone) {
      api.updateMe({ timezone: zone }).then((user) => qc.setQueryData(['me'], user), () => undefined);
    }
  }, [me.timezone, qc]);
  const newTask = useCallback((preset?: { status?: Status; projectId?: number }) => setNewTaskPreset(preset ?? {}), []);

  // Global shortcuts: Ctrl/⌘+K opens the palette, N creates a task.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === 'n' && openTaskId === null && newTaskPreset === null && !paletteOpen) {
        e.preventDefault();
        setNewTaskPreset({});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openTaskId, newTaskPreset, paletteOpen]);

  const logout = async () => {
    await api.logout().catch(() => undefined);
    qc.clear();
    qc.setQueryData(['me'], null);
  };

  const memberList = members.data ?? [];
  const onlineMembers = online.map((id) => memberList.find((m) => m.id === id)).filter((m) => m !== undefined);

  let page;
  switch (route.page) {
    case 'tasks':
      page = <TasksPage assignee={route.assignee} />;
      break;
    case 'calendar':
      page = <CalendarPage />;
      break;
    case 'projects':
      page = <ProjectsPage />;
      break;
    case 'insights':
      page = <InsightsPage />;
      break;
    case 'team':
      page = <TeamPage />;
      break;
    case 'settings':
      page = <SettingsPage onLogout={logout} />;
      break;
    case 'project':
      page = <ProjectPage id={route.id} />;
      break;
    default:
      page = <HomePage />;
  }

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        api: wsApi,
        me,
        members: memberList,
        projects: projects.data ?? [],
        online,
        navigate: go,
        openTask,
        openMember,
        newTask,
      }}
    >
      <div className="shell">
        <Sidebar
          route={route}
          workspaces={workspaces}
          open={sidebarOpen}
          live={connected}
          onSwitchWorkspace={onSwitch}
          onNavigate={go}
          onLogout={logout}
        />
        {sidebarOpen && <div className="backdrop backdrop-mobile" onClick={() => setSidebarOpen(false)} />}

        <main className="main">
          <div className="topbar">
            <button className="icon-btn mobile-only" onClick={() => setSidebarOpen(true)} aria-label={t('nav.openMenu')}>
              <Menu size={18} />
            </button>
            <span className="spacer" />
            <FocusIsland />
            <div className="topbar-pill glass">
              <button className="topbar-search" onClick={() => setPaletteOpen(true)}>
                <Search size={15} />
                <span className="hide-sm">{t('palette.search')}</span>
                <kbd className="hide-sm">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
              </button>
              <span className="presence-inline" title={connected ? t('head.liveHint') : t('head.reconnecting')}>
                <span className={`live-dot${connected ? ' on' : ''}`} />
                {onlineMembers.length > 0 && (
                  <span className="avatar-stack" aria-label={`${t('head.online')}: ${onlineMembers.map((u) => u.name).join(', ')}`}>
                    {onlineMembers.slice(0, 3).map((u) => (
                      <Avatar key={u.id} user={u} size={24} />
                    ))}
                  </span>
                )}
              </span>
              <button className="icon-btn" onClick={() => newTask()} aria-label={t('head.newTask')} title={t('head.newTask')}>
                <Plus size={17} />
              </button>
              <button
                className="icon-btn"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                aria-label={theme === 'dark' ? t('palette.toLight') : t('palette.toDark')}
                title={theme === 'dark' ? t('palette.toLight') : t('palette.toDark')}
              >
                {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              </button>
            </div>
          </div>

          {/* Keyed by route so each navigation replays one orchestrated entrance. */}
          <div className="page" key={routeKey(route)}>
            {page}
          </div>
        </main>

        {openTaskId !== null && (
          <TaskDrawer taskId={openTaskId} projects={projects.data ?? []} onClose={() => setOpenTaskId(null)} />
        )}
        {newTaskPreset !== null && (
          <NewTaskModal
            initialStatus={newTaskPreset.status ?? 'todo'}
            defaultProjectId={newTaskPreset.projectId}
            projects={projects.data ?? []}
            onClose={() => setNewTaskPreset(null)}
          />
        )}
        {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
        {memberId !== null && <MemberPanel memberId={memberId} onClose={() => setMemberId(null)} />}
        <DueReminder />
      </div>
    </WorkspaceContext.Provider>
  );
}

/** Once a day per workspace, a nudge when you have tasks due today (can be switched off in Settings). */
function DueReminder() {
  const { me, workspace } = useWorkspace();
  const { data: tasks } = useAllTasks();
  useEffect(() => {
    if (!tasks || !getPrefs().dueReminder) return;
    const today = todayISO();
    const key = `tl-reminded-${workspace.id}`;
    try {
      if (localStorage.getItem(key) === today) return;
      localStorage.setItem(key, today);
    } catch {
      return;
    }
    const due = tasks.filter((task) => task.assigneeId === me.id && task.status !== 'done' && task.dueDate === today).length;
    if (due > 0) toast(translate('reminder.dueToday', { n: due }), 'live');
  }, [tasks, me.id, workspace.id]);
  return null;
}
