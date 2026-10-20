import { Router, type RequestHandler } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { nowISO, tx, type DB } from '../db';
import { HttpError, ctx, currentUserId, idParam, outranks, parse, rateLimit, requireRole, type Role } from '../http';
import type { Realtime } from '../realtime';
import { publicUser, type UserRow } from '../auth';

const nameSchema = z.object({ name: z.string().trim().min(1).max(60) });
const roleSchema = z.object({ role: z.enum(['owner', 'admin', 'member']) });
const inviteSchema = z.object({
  role: z.enum(['admin', 'member']).optional(),
  expiresInDays: z.number().int().min(1).max(30).optional(),
});

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function createWorkspace(db: DB, name: string, ownerId: number) {
  const now = nowISO();
  const id = Number(
    db.prepare('INSERT INTO workspaces (name, created_by, created_at) VALUES (?, ?, ?)').run(name, ownerId, now)
      .lastInsertRowid,
  );
  db.prepare('INSERT INTO memberships (workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(
    id,
    ownerId,
    'owner',
    now,
  );
  return id;
}

interface WorkspaceRow {
  id: number;
  name: string;
  role: Role;
  member_count: number;
}

const toWorkspace = (r: WorkspaceRow) => ({ id: r.id, name: r.name, role: r.role, memberCount: r.member_count });

function getWorkspace(db: DB, workspaceId: number, userId: number) {
  const row = db
    .prepare(
      `SELECT w.id, w.name, m.role,
              (SELECT COUNT(*) FROM memberships x WHERE x.workspace_id = w.id) AS member_count
       FROM workspaces w JOIN memberships m ON m.workspace_id = w.id AND m.user_id = ?
       WHERE w.id = ?`,
    )
    .get(userId, workspaceId) as WorkspaceRow | undefined;
  return row && toWorkspace(row);
}

/** GET/POST /api/workspaces — the signed-in user's workspaces. */
export function workspacesRouter(db: DB): Router {
  const r = Router();

  r.get('/', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT w.id, w.name, m.role,
                (SELECT COUNT(*) FROM memberships x WHERE x.workspace_id = w.id) AS member_count
         FROM workspaces w JOIN memberships m ON m.workspace_id = w.id
         WHERE m.user_id = ? ORDER BY w.created_at, w.id`,
      )
      .all(currentUserId(res)) as unknown as WorkspaceRow[];
    res.json(rows.map(toWorkspace));
  });

  r.post('/', (req, res) => {
    const { name } = parse(nameSchema, req.body);
    const userId = currentUserId(res);
    const id = tx(db, () => createWorkspace(db, name, userId));
    res.status(201).json(getWorkspace(db, id, userId));
  });

  return r;
}

/** Guards /api/workspaces/:workspaceId/* and loads the caller's role. 404 rather than 403 so ids don't leak. */
export function requireMember(db: DB): RequestHandler {
  const membership = db.prepare('SELECT role FROM memberships WHERE workspace_id = ? AND user_id = ?');
  return (req, res, next) => {
    const workspaceId = idParam(req, 'workspaceId');
    const row = membership.get(workspaceId, currentUserId(res)) as { role: Role } | undefined;
    if (!row) throw new HttpError(404, 'Workspace not found');
    res.locals.workspaceId = workspaceId;
    res.locals.role = row.role;
    next();
  };
}

/** Workspace settings, members, invites and the live event stream. Mounted under requireMember. */
export function workspaceRouter(db: DB, realtime: Realtime): Router {
  const r = Router({ mergeParams: true });

  r.get('/', (_req, res) => {
    const { workspaceId, userId } = ctx(res);
    res.json(getWorkspace(db, workspaceId, userId));
  });

  r.patch('/', requireRole('admin'), (req, res) => {
    const { name } = parse(nameSchema, req.body);
    const { workspaceId, userId } = ctx(res);
    db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(name, workspaceId);
    realtime.emit(req, res, { type: 'workspace', action: 'renamed', name });
    res.json(getWorkspace(db, workspaceId, userId));
  });

  r.delete('/', requireRole('owner'), (req, res) => {
    const { workspaceId } = ctx(res);
    db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspaceId);
    realtime.emit(req, res, { type: 'workspace', action: 'deleted' });
    realtime.disconnect(workspaceId);
    res.status(204).end();
  });

  // Members
  r.get('/members', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.color, u.avatar, u.timezone, u.focus_until, m.role, m.joined_at
         FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.workspace_id = ?
         ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.name`,
      )
      .all(ctx(res).workspaceId) as unknown as (UserRow & { role: Role; joined_at: string })[];
    res.json(rows.map((m) => ({ ...publicUser(m), role: m.role, joinedAt: m.joined_at })));
  });

  const memberRole = (workspaceId: number, userId: number) => {
    const row = db.prepare('SELECT role FROM memberships WHERE workspace_id = ? AND user_id = ?').get(workspaceId, userId) as
      | { role: Role }
      | undefined;
    if (!row) throw new HttpError(404, 'Member not found');
    return row.role;
  };
  const ownerCount = (workspaceId: number) =>
    (db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE workspace_id = ? AND role = 'owner'").get(workspaceId) as {
      n: number;
    }).n;

  r.patch('/members/:userId', requireRole('owner'), (req, res) => {
    const { workspaceId, userId } = ctx(res);
    const targetId = idParam(req, 'userId');
    const { role } = parse(roleSchema, req.body);
    if (targetId === userId) throw new HttpError(400, "You can't change your own role");
    memberRole(workspaceId, targetId);
    db.prepare('UPDATE memberships SET role = ? WHERE workspace_id = ? AND user_id = ?').run(role, workspaceId, targetId);
    realtime.emit(req, res, { type: 'members', action: 'role', userId: targetId, role });
    res.status(204).end();
  });

  r.delete('/members/:userId', (req, res) => {
    const { workspaceId, userId, role } = ctx(res);
    const targetId = idParam(req, 'userId');
    const targetRole = memberRole(workspaceId, targetId);
    const leaving = targetId === userId;

    if (leaving) {
      if (role === 'owner' && ownerCount(workspaceId) === 1) {
        throw new HttpError(400, 'Make someone else an owner before you leave');
      }
    } else if (role !== 'owner' && !outranks(role, targetRole)) {
      throw new HttpError(403, "You don't have permission to remove this member");
    }

    tx(db, () => {
      db.prepare('DELETE FROM memberships WHERE workspace_id = ? AND user_id = ?').run(workspaceId, targetId);
      db.prepare(
        `UPDATE tasks SET assignee_id = NULL
         WHERE assignee_id = ? AND project_id IN (SELECT id FROM projects WHERE workspace_id = ?)`,
      ).run(targetId, workspaceId);
    });
    realtime.emit(req, res, { type: 'members', action: leaving ? 'left' : 'removed', userId: targetId });
    realtime.disconnect(workspaceId, targetId);
    res.status(204).end();
  });

  // Invites
  r.get('/invites', requireRole('admin'), (_req, res) => {
    const rows = db
      .prepare(
        `SELECT i.id, i.role, i.created_at, i.expires_at, i.uses, u.name AS created_by
         FROM invites i LEFT JOIN users u ON u.id = i.created_by
         WHERE i.workspace_id = ? AND i.revoked_at IS NULL AND i.expires_at > ?
         ORDER BY i.created_at DESC`,
      )
      .all(ctx(res).workspaceId, nowISO()) as {
      id: number;
      role: string;
      created_at: string;
      expires_at: string;
      uses: number;
      created_by: string | null;
    }[];
    res.json(
      rows.map((i) => ({
        id: i.id,
        role: i.role,
        createdAt: i.created_at,
        expiresAt: i.expires_at,
        uses: i.uses,
        createdBy: i.created_by,
      })),
    );
  });

  r.post('/invites', requireRole('admin'), (req, res) => {
    const { workspaceId, userId, role } = ctx(res);
    const body = parse(inviteSchema, req.body);
    const inviteRole = body.role ?? 'member';
    if (inviteRole === 'admin' && role !== 'owner') throw new HttpError(403, 'Only owners can invite admins');

    const token = randomBytes(24).toString('base64url');
    const createdAt = nowISO();
    const expiresAt = new Date(Date.now() + (body.expiresInDays ?? 7) * 24 * 60 * 60 * 1000).toISOString();
    const { lastInsertRowid } = db
      .prepare(
        'INSERT INTO invites (workspace_id, token_hash, role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(workspaceId, hashToken(token), inviteRole, userId, createdAt, expiresAt);
    // The raw token is only ever returned here.
    res.status(201).json({
      id: Number(lastInsertRowid),
      role: inviteRole,
      createdAt,
      expiresAt,
      uses: 0,
      createdBy: ctx(res).userName,
      token,
    });
  });

  r.delete('/invites/:inviteId', requireRole('admin'), (req, res) => {
    const { changes } = db
      .prepare('UPDATE invites SET revoked_at = ? WHERE id = ? AND workspace_id = ? AND revoked_at IS NULL')
      .run(nowISO(), idParam(req, 'inviteId'), ctx(res).workspaceId);
    if (!changes) throw new HttpError(404, 'Invite not found');
    res.status(204).end();
  });

  // Live updates over Server-Sent Events
  r.get('/events', (req, res) => {
    const { workspaceId, userId } = ctx(res);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId.slice(0, 64) : '';
    const unsubscribe = realtime.subscribe(workspaceId, { res, userId, clientId });
    req.on('close', unsubscribe);
  });

  return r;
}

/** /api/invites/:token — preview is public so the join page can show who invited you before sign-in. */
export function invitesRouter(db: DB, realtime: Realtime, requireAuth: RequestHandler): Router {
  const r = Router();
  const limiter = rateLimit(60, 10 * 60 * 1000);

  const findInvite = (token: string) => {
    const invite = db
      .prepare(
        `SELECT i.id, i.workspace_id, i.role, i.expires_at, i.revoked_at, w.name AS workspace_name, u.name AS invited_by,
                (SELECT COUNT(*) FROM memberships m WHERE m.workspace_id = i.workspace_id) AS member_count
         FROM invites i
         JOIN workspaces w ON w.id = i.workspace_id
         LEFT JOIN users u ON u.id = i.created_by
         WHERE i.token_hash = ?`,
      )
      .get(hashToken(token)) as
      | {
          id: number;
          workspace_id: number;
          role: Role;
          expires_at: string;
          revoked_at: string | null;
          workspace_name: string;
          invited_by: string | null;
          member_count: number;
        }
      | undefined;
    if (!invite) throw new HttpError(404, 'This invite link is not valid');
    if (invite.revoked_at || invite.expires_at <= nowISO()) throw new HttpError(410, 'This invite link has expired');
    return invite;
  };

  r.get('/:token', limiter, (req, res) => {
    const invite = findInvite(String(req.params.token));
    res.json({
      workspace: { id: invite.workspace_id, name: invite.workspace_name, memberCount: invite.member_count },
      role: invite.role,
      invitedBy: invite.invited_by,
      expiresAt: invite.expires_at,
    });
  });

  r.post('/:token/accept', limiter, requireAuth, (req, res) => {
    const invite = findInvite(String(req.params.token));
    const userId = currentUserId(res);
    const existing = db
      .prepare('SELECT 1 FROM memberships WHERE workspace_id = ? AND user_id = ?')
      .get(invite.workspace_id, userId);
    if (!existing) {
      tx(db, () => {
        db.prepare('INSERT INTO memberships (workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(
          invite.workspace_id,
          userId,
          invite.role,
          nowISO(),
        );
        db.prepare('UPDATE invites SET uses = uses + 1 WHERE id = ?').run(invite.id);
      });
      realtime.publish(invite.workspace_id, {
        type: 'members',
        action: 'joined',
        userId,
        actor: { id: userId, name: res.locals.userName },
      });
    }
    res.json({ workspace: getWorkspace(db, invite.workspace_id, userId), alreadyMember: Boolean(existing) });
  });

  return r;
}
