import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { api, type User } from '../api';
import { useI18n } from '../i18n';
import { toast, toastError } from '../toast';
import { Logo } from './ui';
import { Workspace } from './Workspace';

const STORAGE_KEY = 'tl-ws';

export function rememberWorkspace(id: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    // Not critical: we fall back to the first workspace.
  }
}

function storedWorkspace() {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || undefined;
  } catch {
    return undefined;
  }
}

/** Loads the user's workspaces and renders the selected one. */
export function WorkspaceGate({ me }: { me: User }) {
  const qc = useQueryClient();
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: api.workspaces });
  const [selected, setSelected] = useState<number | undefined>(storedWorkspace);
  // Workspaces we just lost access to, hidden until the list refetches.
  const [gone, setGone] = useState<number[]>([]);

  const select = (id: number) => {
    rememberWorkspace(id);
    setSelected(id);
  };

  if (!workspaces.data) {
    return (
      <div className="splash">
        <Logo pulse />
      </div>
    );
  }

  const available = workspaces.data.filter((w) => !gone.includes(w.id));
  const current = available.find((w) => w.id === selected) ?? available[0];
  if (!current) return <CreateFirstWorkspace onCreated={select} />;

  return (
    <Workspace
      key={current.id}
      me={me}
      workspace={current}
      workspaces={available}
      onSwitch={select}
      onLostAccess={(message) => {
        toast(message, 'error');
        setGone((ids) => [...ids, current.id]);
        qc.invalidateQueries({ queryKey: ['workspaces'] });
      }}
    />
  );
}

function CreateFirstWorkspace({ onCreated }: { onCreated: (id: number) => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => api.createWorkspace(name.trim()),
    onSuccess: (ws) => {
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      onCreated(ws.id);
    },
    onError: toastError,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) create.mutate();
  };

  return (
    <main className="auth">
      <form className="auth-card glass" onSubmit={submit}>
        <Logo />
        <div className="join-icon">
          <Users size={22} />
        </div>
        <h1>{t('ws.emptyTitle')}</h1>
        <p className="muted">{t('ws.emptyBody')}</p>
        <label className="field">
          <span>{t('ws.name')}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus required />
        </label>
        <button className="btn btn-primary btn-block" disabled={!name.trim() || create.isPending}>
          {t('ws.create')}
        </button>
      </form>
    </main>
  );
}
