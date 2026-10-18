import type { Request, Response } from 'express';
import { ctx } from './http';

/**
 * Server-Sent Events hub, one room per workspace.
 * Writes go through REST; this only pushes "something changed" so clients can refetch.
 * In-memory, so it assumes a single server instance (swap for Redis pub/sub to scale out).
 */
export interface RealtimeEvent {
  type: 'task' | 'project' | 'members' | 'workspace' | 'presence';
  [key: string]: unknown;
}

interface Client {
  res: Response;
  userId: number;
  clientId: string;
}

export class Realtime {
  private rooms = new Map<number, Set<Client>>();
  private timer: NodeJS.Timeout;

  constructor(heartbeatMs = 25_000) {
    // Comment lines keep proxies from closing idle connections.
    this.timer = setInterval(() => this.each((c) => c.res.write(': ping\n\n')), heartbeatMs);
    this.timer.unref();
  }

  subscribe(workspaceId: number, client: Client) {
    let room = this.rooms.get(workspaceId);
    if (!room) this.rooms.set(workspaceId, (room = new Set()));
    room.add(client);
    this.broadcastPresence(workspaceId);
    return () => {
      room.delete(client);
      if (!room.size) this.rooms.delete(workspaceId);
      this.broadcastPresence(workspaceId);
    };
  }

  /** Publish to everyone in the workspace. `origin` lets the sending tab skip its own echo. */
  publish(workspaceId: number, event: RealtimeEvent, origin?: string) {
    const data = `data: ${JSON.stringify({ ...event, origin: origin ?? null })}\n\n`;
    this.rooms.get(workspaceId)?.forEach((c) => c.res.write(data));
  }

  /** Convenience for route handlers: fills in workspace, actor and origin from the request. */
  emit(req: Request, res: Response, event: RealtimeEvent) {
    const { workspaceId, userId, userName } = ctx(res);
    this.publish(workspaceId, { ...event, actor: { id: userId, name: userName } }, req.get('x-client-id'));
  }

  online(workspaceId: number) {
    return [...new Set([...(this.rooms.get(workspaceId) ?? [])].map((c) => c.userId))];
  }

  /** Close a user's streams after they lose access (removed or workspace deleted). */
  disconnect(workspaceId: number, userId?: number) {
    const room = this.rooms.get(workspaceId);
    if (!room) return;
    for (const c of [...room]) {
      if (userId === undefined || c.userId === userId) {
        room.delete(c);
        c.res.end();
      }
    }
    if (!room.size) this.rooms.delete(workspaceId);
    else this.broadcastPresence(workspaceId);
  }

  close() {
    clearInterval(this.timer);
    this.each((c) => c.res.end());
    this.rooms.clear();
  }

  private broadcastPresence(workspaceId: number) {
    this.publish(workspaceId, { type: 'presence', online: this.online(workspaceId) });
  }

  private each(fn: (c: Client) => void) {
    this.rooms.forEach((room) => room.forEach(fn));
  }
}
