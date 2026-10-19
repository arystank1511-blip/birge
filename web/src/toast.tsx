import { useEffect, useState } from 'react';
import { AlertCircle, Check, Radio } from 'lucide-react';
import { errorMessage } from './api';

type Kind = 'error' | 'success' | 'live';
type Action = { label: string; run: () => void };
type Toast = { id: number; message: string; kind: Kind; action?: Action };
type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(toasts));

const dismiss = (id: number) => {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
};

/** Shows a toast. With an `action` (e.g. Undo) it stays longer so there's time to use it. */
export function toast(message: string, kind: Kind = 'success', action?: Action) {
  const id = nextId++;
  toasts = [...toasts, { id, message, kind, action }].slice(-3);
  emit();
  setTimeout(() => dismiss(id), action ? 6000 : kind === 'live' ? 4500 : 3500);
}

export const toastError = (err: unknown) => toast(errorMessage(err), 'error');

const ICONS = { error: AlertCircle, success: Check, live: Radio };

export function Toaster() {
  const [items, setItems] = useState<Toast[]>(toasts);
  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div key={t.id} className={`toast toast-${t.kind}${t.action ? ' toast-has-action' : ''}`}>
            <span className="toast-icon">
              <Icon size={15} strokeWidth={2.6} />
            </span>
            <span className="toast-text">{t.message}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
