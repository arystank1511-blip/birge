import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Member, User, Workspace, WorkspaceApi } from './api';

export interface WorkspaceContextValue {
  workspace: Workspace;
  api: WorkspaceApi;
  me: User;
  members: Member[];
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

/** Theme (light/dark) and accent palette, applied as data attributes on <html>. */
export function useAppearance() {
  const [theme, setTheme] = useState<Theme>(() => readPref('tl-theme', ['dark', 'light'], 'light'));
  const [palette, setPalette] = useState<Palette>(() => readPref('tl-palette', PALETTES, 'cobalt'));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writePref('tl-theme', theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.palette = palette;
    writePref('tl-palette', palette);
  }, [palette]);

  return { theme, setTheme, palette, setPalette };
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
