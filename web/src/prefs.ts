import { useSyncExternalStore } from 'react';

/** Per-device preferences: which nudges to show and the default focus lengths. Stored in localStorage. */
export interface Prefs {
  /** Toasts when teammates change things in real time. */
  liveToasts: boolean;
  /** A reminder on first open each day when you have tasks due today. */
  dueReminder: boolean;
  /** A toast and a soft chime when a focus session ends. */
  focusDone: boolean;
  focusMinutes: number;
  breakMinutes: number;
}

const DEFAULTS: Prefs = { liveToasts: true, dueReminder: true, focusDone: true, focusMinutes: 25, breakMinutes: 5 };
const KEY = 'tl-prefs';

function read(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

let current = read();
const listeners = new Set<() => void>();

export const getPrefs = () => current;

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable: the change still applies for this visit.
  }
  listeners.forEach((l) => l());
}

export function usePrefs() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getPrefs,
  );
}
