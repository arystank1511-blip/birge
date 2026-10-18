import express, { Router } from 'express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './db';
import { authRouter, requireAuth, type AuthOptions } from './auth';
import { HttpError, errorHandler } from './http';
import { Realtime } from './realtime';
import { projectsRouter } from './routes/projects';
import { statsRouter } from './routes/stats';
import { tasksRouter } from './routes/tasks';
import { invitesRouter, requireMember, workspaceRouter, workspacesRouter } from './routes/workspaces';

export interface AppOptions extends Partial<AuthOptions> {
  jwtSecret: string;
  /** Built frontend to serve in production (web/dist). */
  staticDir?: string;
  realtime?: Realtime;
}

export function createApp(db: DB, opts: AppOptions) {
  const auth: AuthOptions = {
    jwtSecret: opts.jwtSecret,
    secureCookies: opts.secureCookies ?? false,
    allowDemo: opts.allowDemo ?? true,
    authRateLimit: opts.authRateLimit ?? 30,
  };
  const realtime = opts.realtime ?? new Realtime();
  const authenticate = requireAuth(db, auth.jwtSecret);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', authRouter(db, auth));
  app.use('/api/invites', invitesRouter(db, realtime, authenticate));

  app.use('/api', authenticate);
  app.use('/api/workspaces', workspacesRouter(db));

  // Everything below is scoped to one workspace the caller belongs to.
  const scoped = Router({ mergeParams: true });
  scoped.use(requireMember(db));
  scoped.use(workspaceRouter(db, realtime));
  scoped.use('/projects', projectsRouter(db, realtime));
  scoped.use('/stats', statsRouter(db));
  scoped.use(tasksRouter(db, realtime));
  app.use('/api/workspaces/:workspaceId', scoped);

  app.use('/api', () => {
    throw new HttpError(404, 'Not found');
  });

  if (opts.staticDir && existsSync(opts.staticDir)) {
    const staticDir = opts.staticDir;
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(join(staticDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
