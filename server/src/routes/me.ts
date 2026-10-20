import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db';
import { PUBLIC_USER_COLUMNS, publicUser, type UserRow } from '../auth';
import { HttpError, currentUserId, parse } from '../http';
import type { Realtime } from '../realtime';

// A resized photo from the client is ~10–40 KB; the cap keeps rows small and stops abuse.
const MAX_AVATAR_CHARS = 300_000;
const avatar = z
  .string()
  .max(MAX_AVATAR_CHARS, 'Image is too large')
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Expected a PNG, JPEG or WebP image')
  .nullable();

const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    avatar,
    timezone: z
      .string()
      .max(64)
      .refine((tz) => {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      }, 'Unknown time zone'),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');

const focusSchema = z.object({ minutes: z.number().int().min(0).max(180) });

/** /api/me — the signed-in user's own profile and focus status. Changes are pushed to every workspace they're in. */
export function meRouter(db: DB, realtime: Realtime): Router {
  const r = Router();

  const load = (userId: number) => db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`).get(userId) as unknown as UserRow;

  const broadcast = (userId: number, action: 'profile' | 'focus') => {
    const user = load(userId);
    const workspaces = db.prepare('SELECT workspace_id FROM memberships WHERE user_id = ?').all(userId) as {
      workspace_id: number;
    }[];
    for (const { workspace_id } of workspaces) {
      realtime.publish(workspace_id, { type: 'members', action, userId, actor: { id: userId, name: user.name } });
    }
  };

  r.patch('/', (req, res) => {
    const userId = currentUserId(res);
    const body = parse(profileSchema, req.body);
    if (body.name !== undefined) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(body.name, userId);
    if (body.avatar !== undefined) db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(body.avatar, userId);
    if (body.timezone !== undefined) db.prepare('UPDATE users SET timezone = ? WHERE id = ?').run(body.timezone, userId);
    // A timezone sync on sign-in is silent; visible changes are announced to teammates.
    if (body.name !== undefined || body.avatar !== undefined) broadcast(userId, 'profile');
    res.json(publicUser(load(userId)));
  });

  /** Start (minutes > 0) or end (0) a focus session. Teammates see "in focus until …". */
  r.put('/focus', (req, res) => {
    const userId = currentUserId(res);
    const { minutes } = parse(focusSchema, req.body);
    const until = minutes > 0 ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
    db.prepare('UPDATE users SET focus_until = ? WHERE id = ?').run(until, userId);
    broadcast(userId, 'focus');
    res.json(publicUser(load(userId)));
  });

  r.use(() => {
    throw new HttpError(404, 'Not found');
  });

  return r;
}
