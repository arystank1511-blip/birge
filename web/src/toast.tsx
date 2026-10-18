import { useEffect, useState } from 'react';
import { AlertCircle, Check, Radio } from 'lucide-react';
import { errorMessage } from './api';

type Kind = 'error' | 'success' | 'live';
type Toast = { id: number; message: string; kind: Kind };
type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(toasts));

export function toast(message: string, kind: Kind = 'success') {
  const id = nextId++;
  toasts = [...toasts, { id, message, kind }].slice(-3);
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, kind === 'live' ? 4500 : 3500);
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
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <Icon size={16} />
            {t.message}
          </div>
        );
      })}
    </div>
  );
}
