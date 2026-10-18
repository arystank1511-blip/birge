import type { ErrorRequestHandler, Request, RequestHandler } from 'express';
import { z } from 'zod';

export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, 'Validation failed', z.flattenError(result.error));
  }
  return result.data;
}

export function idParam(req: Request, name = 'id'): number {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `Invalid ${name}`);
  return id;
}

export type Role = 'owner' | 'admin' | 'member';
const ROLE_RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };
export const outranks = (a: Role, b: Role) => ROLE_RANK[a] > ROLE_RANK[b];

type Locals = { locals: Record<string, unknown> };

export function currentUserId(res: Locals): number {
  return res.locals.userId as number;
}

/** Set by requireMember for every /api/workspaces/:workspaceId/* request. */
export function ctx(res: Locals) {
  return {
    userId: res.locals.userId as number,
    userName: res.locals.userName as string,
    workspaceId: res.locals.workspaceId as number,
    role: res.locals.role as Role,
  };
}

export function requireRole(min: Role): RequestHandler {
  return (_req, res, next) => {
    if (ROLE_RANK[ctx(res).role] < ROLE_RANK[min]) throw new HttpError(403, `Only ${min}s can do that`);
    next();
  };
}

/** Fixed-window limiter, kept in memory. Good enough for a single instance. */
export function rateLimit(max: number, windowMs: number): RequestHandler {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.reset < now) {
      if (hits.size > 10_000) hits.clear();
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      throw new HttpError(429, 'Too many attempts, try again later');
    }
    next();
  };
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
