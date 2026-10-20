import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Member, Project, Status, Task, User, Workspace, WorkspaceApi } from './api';
import { translate } from './i18n';
import type { Route } from './router';
import { toast, toastError } from './toast';

export interface WorkspaceContextValue {
  workspace: Workspace;
  api: WorkspaceApi;
  me: User;
  members: Member[];
  projects: Project[];
  /** User ids with a live connection to this workspace right now. */
  online: number[];
  navigate: (route: Route) => void;
  openTask: (id: number) => void;
  /** Opens a teammate's profile panel. */
  openMember: (id: number) => void;
  newTask: (preset?: { status?: Status; projectId?: number }) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside a workspace');
  return value;
}

/** Refresh everything derived from tasks after a write. Keys are [name, workspaceId, ...]. */
export function useInvalidateTasks() {
  const qc = useQueryClient();
  return useCallback(() => {
    for (const key of ['tasks', 'stats', 'projects', 'task']) qc.invalidateQueries({ queryKey: [key] });
  }, [qc]);
}

/** Every task in the workspace, unfiltered. Shared by the dashboard, calendar, insights, team and project pages. */
export function useAllTasks() {
  const { workspace, api } = useWorkspace();
  return useQuery({ queryKey: ['tasks', workspace.id, 'all'], queryFn: () => api.tasks({}) });
}

/**
 * Toggles a task between done and its previous state. Completing shows a toast with Undo,
 * which puts the task back exactly where it was.
 */
export function useToggleDone() {
  const { api } = useWorkspace();
  const invalidate = useInvalidateTasks();
  return useCallback(
    async (task: Task) => {
      const previous = task.status;
      const next: Status = previous === 'done' ? 'todo' : 'done';
      try {
        await api.updateTask(task.id, { status: next });
        invalidate();
        if (next === 'done') {
          toast(translate('undo.done', { title: task.title }), 'success', {
            label: translate('undo.action'),
            run: () => {
              api.updateTask(task.id, { status: previous }).then(invalidate, toastError);
            },
          });
        }
      } catch (err) {
        toastError(err);
      }
    },
    [api, invalidate],
  );
}

export function useDebounced<T>(value: T, ms = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export type Theme = 'dark' | 'light';
export const PALETTES = ['cobalt', 'lime', 'indigo', 'ocean', 'sunset', 'rose'] as const;
export type Palette = (typeof PALETTES)[number];

function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    if (value && (allowed as readonly string[]).includes(value)) return value as T;
  } catch {
    // Storage unavailable.
  }
  return fallback;
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable; the choice still applies for this visit.
  }
}

export const WALLPAPERS = ['paper', 'mist', 'sage', 'tide', 'bloom', 'dusk'] as const;
export type Wallpaper = (typeof WALLPAPERS)[number];
export type Glass = 'clear' | 'tinted';

/**
 * Appearance preferences, each applied as a data attribute on <html> so CSS does the work:
 * theme (light/dark), accent palette, wallpaper behind the glass, glass style, and solid surfaces.
 */
export function useAppearance() {
  const [theme, setTheme] = useState<Theme>(() => readPref('tl-theme', ['dark', 'light'], 'light'));
  const [palette, setPalette] = useState<Palette>(() => readPref('tl-palette', PALETTES, 'cobalt'));
  const [wallpaper, setWallpaper] = useState<Wallpaper>(() => readPref('tl-wallpaper', WALLPAPERS, 'paper'));
  const [glass, setGlass] = useState<Glass>(() => readPref('tl-glass', ['clear', 'tinted'], 'clear'));
  const [solid, setSolid] = useState<boolean>(() => readPref('tl-solid', ['on', 'off'], 'off') === 'on');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writePref('tl-theme', theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.palette = palette;
    writePref('tl-palette', palette);
  }, [palette]);
  useEffect(() => {
    document.documentElement.dataset.wallpaper = wallpaper;
    writePref('tl-wallpaper', wallpaper);
  }, [wallpaper]);
  useEffect(() => {
    document.documentElement.dataset.glass = glass;
    writePref('tl-glass', glass);
  }, [glass]);
  useEffect(() => {
    document.documentElement.dataset.solid = solid ? 'on' : 'off';
    writePref('tl-solid', solid ? 'on' : 'off');
  }, [solid]);

  return { theme, setTheme, palette, setPalette, wallpaper, setWallpaper, glass, setGlass, solid, setSolid };
}

export const AppearanceContext = createContext<ReturnType<typeof useAppearance> | null>(null);

export function useAppearanceContext() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearanceContext must be used inside AppearanceContext');
  return value;
}

export function useEscape(onEscape: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEscape]);
}

export const isTypingTarget = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
