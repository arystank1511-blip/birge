import { useEffect, useState, useSyncExternalStore } from 'react';
import { api } from './api';
import { translate } from './i18n';
import { getPrefs } from './prefs';
import { toast, toastError } from './toast';

/**
 * One focus session for this browser. Kept in localStorage so it survives reloads, and mirrored to the server
 * (PUT /api/me/focus) so teammates see "in focus until …" in real time.
 */
export interface FocusSession {
  startedAt: number;
  endsAt: number;
  minutes: number;
  taskId: number | null;
  taskTitle: string | null;
  /** Set while paused: milliseconds that were left when the pause began. */
  pausedLeft: number | null;
}

const KEY = 'tl-focus';
let session: FocusSession | null = load();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function load(): FocusSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as FocusSession | null;
    if (value && (value.pausedLeft !== null || value.endsAt > Date.now())) return value;
  } catch {
    // Ignore a corrupt or missing entry.
  }
  return null;
}

function save(next: FocusSession | null) {
  session = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: the session still runs for this tab.
  }
  schedule();
  listeners.forEach((l) => l());
}

/** Fires the "session finished" moment when the timer runs out, even if no widget is on screen. */
function schedule() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!session || session.pausedLeft !== null) return;
  timer = setTimeout(finish, Math.max(0, session.endsAt - Date.now()));
}

function chime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1);
  } catch {
    // Audio can be blocked until the user interacts; the toast is enough.
  }
}

function finish() {
  const done = session;
  save(null);
  api.setFocus(0).catch(() => undefined);
  if (done && getPrefs().focusDone) {
    chime();
    toast(translate('focus.finishedToast', { n: done.minutes, break: getPrefs().breakMinutes }), 'success');
  }
}

export function startFocus(minutes: number, task?: { id: number; title: string } | null) {
  const now = Date.now();
  save({ startedAt: now, endsAt: now + minutes * 60_000, minutes, taskId: task?.id ?? null, taskTitle: task?.title ?? null, pausedLeft: null });
  api.setFocus(minutes).catch(toastError);
}

export function pauseFocus() {
  if (!session || session.pausedLeft !== null) return;
  save({ ...session, pausedLeft: Math.max(0, session.endsAt - Date.now()) });
  api.setFocus(0).catch(() => undefined);
}

export function resumeFocus() {
  if (!session || session.pausedLeft === null) return;
  const left = session.pausedLeft;
  save({ ...session, endsAt: Date.now() + left, pausedLeft: null });
  api.setFocus(Math.max(1, Math.round(left / 60_000))).catch(toastError);
}

export function endFocus() {
  if (!session) return;
  save(null);
  api.setFocus(0).catch(() => undefined);
}

schedule();

export function useFocusSession() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => session,
  );
}

/** Milliseconds left in the session, ticking once a second while it runs. */
export function useFocusLeft(s: FocusSession | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!s || s.pausedLeft !== null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [s]);
  if (!s) return 0;
  return s.pausedLeft !== null ? s.pausedLeft : Math.max(0, s.endsAt - now);
}

export const formatClock = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
