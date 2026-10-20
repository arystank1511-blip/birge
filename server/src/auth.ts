import { Router, type RequestHandler, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { nowISO, tx, type DB } from './db';
import { HttpError, currentUserId, parse, rateLimit } from './http';
import { DEMO_EMAIL } from './seed';
import { createWorkspace } from './routes/workspaces';

export const SESSION_COOKIE = 'tl_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const AVATAR_COLORS =['#c6f36b', '#7ee0d2', '#ffb27a', '#b9a4ff', '#ff8fa3', '#8fc8ff'];

export interface AuthOptions {
  jwtSecret: string;
  secureCookies: boolean;
  allowDemo: boolean;
  authRateLimit: number;
}

export interface UserRow {
  id: number;
  name: string;
  email: string;
  color: string;
  password_hash: string;
  avatar?: string | null;
  timezone?: string | null;
  focus_until?: string | null;
}

export const PUBLIC_USER_COLUMNS = 'id, name, email, color, avatar, timezone, focus_until';

export const publicUser = (u: Pick<UserRow, 'id' | 'name' | 'email' | 'color' | 'avatar' | 'timezone' | 'focus_until'>) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  color: u.color,
  avatar: u.avatar ?? null,
  timezone: u.timezone ?? null,
  // Only report focus while it is still running.
  focusUntil: u.focus_until && u.focus_until > new Date().toISOString() ? u.focus_until : null,
});

const email = z.string().trim().toLowerCase().email().max(200);
const loginSchema = z.object({ email, password: z.string().min(1).max(200) });
const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email,
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

export function requireAuth(db: DB, jwtSecret: string): RequestHandler {
  const findUser = db.prepare('SELECT name FROM users WHERE id = ?');
  return (req, res, next) => {
    const token: string | undefined = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new HttpError(401, 'Not signed in');
    let userId: number;
    try {
      const payload = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
      userId = Number(payload.sub);
    } catch {
      throw new HttpError(401, 'Session expired');
    }
    const user = findUser.get(userId) as { name: string } | undefined;
    if (!user) throw new HttpError(401, 'Not signed in');
    res.locals.userId = userId;
    res.locals.userName = user.name;
    next();
  };
}

export function authRouter(db: DB, opts: AuthOptions): Router {
  const r = Router();
  const limiter = rateLimit(opts.authRateLimit, 10 * 60 * 1000);

  const startSession = (res: Response, userId: number) => {
    const token = jwt.sign({}, opts.jwtSecret, { subject: String(userId), expiresIn: '7d' });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: opts.secureCookies,
      maxAge: SESSION_TTL_MS,
      path: '/',
    });
  };

  r.post('/register', limiter, async (req, res) => {
    const body = parse(registerSchema, req.body);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email)) {
      throw new HttpError(409, 'An account with this email already exists');
    }
    const hash = await bcrypt.hash(body.password, 10);
    const count = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
    const color = AVATAR_COLORS[count % AVATAR_COLORS.length];
    // Every account starts with its own workspace so the app is usable before anyone invites them.
    const id = tx(db, () => {
      const now = nowISO();
      const userId = Number(
        db
          .prepare('INSERT INTO users (name, email, password_hash, color, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(body.name, body.email, hash, color, now).lastInsertRowid,
      );
      const firstName = body.name.split(/\s+/)[0];
      createWorkspace(db, `${firstName}'s workspace`, userId);
      return userId;
    });
    startSession(res, id);
    res.status(201).json(publicUser({ id, name: body.name, email: body.email, color }));
  });

  r.post('/login', limiter, async (req, res) => {
    const body = parse(loginSchema, req.body);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(body.email) as UserRow | undefined;
    // Compare against a dummy hash when the user is missing so timing doesn't leak which emails exist.
    const ok = await bcrypt.compare(body.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, 'Invalid email or password');
    startSession(res, user.id);
    res.json(publicUser(user));
  });

  r.post('/demo', limiter, (_req, res) => {
    if (!opts.allowDemo) throw new HttpError(404, 'Demo login is disabled');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(DEMO_EMAIL) as UserRow | undefined;
    if (!user) throw new HttpError(404, 'Demo data is not seeded');
    startSession(res, user.id);
    res.json(publicUser(user));
  });

  r.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  r.get('/me', requireAuth(db, opts.jwtSecret), (_req, res) => {
    const user = db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`).get(currentUserId(res)) as unknown as UserRow;
    res.json(publicUser(user));
  });

  return r;
}
