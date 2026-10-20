import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CLIENT_ID, type Status } from './api';
import { translate } from './i18n';
import { getPrefs } from './prefs';
import { toast } from './toast';

interface LiveEvent {
  type: 'task' | 'project' | 'members' | 'workspace' | 'presence';
  action?: string;
  origin?: string | null;
  actor?: { id: number; name: string };
  userId?: number;
  title?: string;
  status?: Status;
  online?: number[];
}

interface Options {
  url: string;
  workspaceName: string;
  meId: number;
  /** Called when this user loses access (removed, or the workspace was deleted). */
  onLostAccess: (message: string) => void;
}

/**
 * Subscribes to the workspace's Server-Sent Events stream.
 * Events are hints: we invalidate React Query caches and let them refetch, so the server stays the source of truth.
 */
export function useRealtime({ url, workspaceName, meId, onLostAccess }: Options) {
  const qc = useQueryClient();
  const [online, setOnline] = useState<number[]>([]);
  const [connected, setConnected] = useState(false);
  const latest = useRef({ workspaceName, meId, onLostAccess });
  latest.current = { workspaceName, meId, onLostAccess };

  useEffect(() => {
    const source = new EventSource(url);
    let everConnected = false;
    const refresh = (...keys: string[]) => keys.forEach((key) => qc.invalidateQueries({ queryKey: [key] }));

    source.onopen = () => {
      setConnected(true);
      // After a dropped connection we may have missed events, so resync everything once.
      if (everConnected) refresh('tasks', 'stats', 'projects', 'task', 'members', 'workspaces');
      everConnected = true;
    };
    source.onerror = () => setConnected(false);

    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as LiveEvent;
      const { meId, workspaceName, onLostAccess } = latest.current;

      if (event.type === 'presence') {
        setOnline(event.online ?? []);
        return;
      }
      if (event.type === 'members' && (event.action === 'removed' || event.action === 'left') && event.userId === meId) {
        source.close();
        if (event.action === 'removed') onLostAccess(translate('live.removedYou', { workspace: workspaceName }));
        return;
      }
      if (event.type === 'workspace' && event.action === 'deleted') {
        source.close();
        if (event.origin !== CLIENT_ID) onLostAccess(translate('live.wsDeleted', { workspace: workspaceName }));
        return;
      }

      // Our own writes already refreshed the cache, so skip their echo.
      if (event.origin === CLIENT_ID) return;

      if (event.type === 'task') refresh('tasks', 'stats', 'projects', 'task');
      if (event.type === 'project') refresh('projects', 'tasks', 'stats');
      if (event.type === 'members') refresh('members', 'workspaces', 'tasks');
      if (event.type === 'members' && event.userId === meId) refresh('me');
      if (event.type === 'workspace') refresh('workspaces');
      // Profile and focus updates only refresh data; they never pop a toast.
      if (event.type === 'members' && (event.action === 'profile' || event.action === 'focus')) return;
      if (!getPrefs().liveToasts) return;

      const actor = event.actor?.name ?? '';
      const title = event.title ?? '';
      if (event.type === 'task' && event.action === 'created') toast(translate('live.created', { actor, title }), 'live');
      if (event.type === 'task' && event.action === 'moved' && event.status) {
        toast(translate('live.moved', { actor, title, status: translate(`status.${event.status}`) }), 'live');
      }
      if (event.type === 'task' && event.action === 'deleted') toast(translate('live.deleted', { actor, title }), 'live');
      if (event.type === 'task' && event.action === 'commented') toast(translate('live.commented', { actor, title }), 'live');
      if (event.type === 'members' && event.action === 'joined') toast(translate('live.joined', { actor }), 'live');
    };

    return () => {
      source.close();
      setConnected(false);
    };
  }, [url, qc]);

  return { online, connected };
}
