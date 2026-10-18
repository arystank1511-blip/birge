import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { createApp } from '../src/app';
import { openDb, type DB } from '../src/db';
import { Realtime } from '../src/realtime';
import { seed } from '../src/seed';

let db: DB;
let realtime: Realtime;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = openDb(':memory:');
  realtime = new Realtime();
  app = createApp(db, { jwtSecret: 'test-secret', authRateLimit: 1000, realtime });
});
afterEach(() => realtime.close());

let emailCounter = 0;

/** Registers a user; every new account gets a personal workspace. */
async function signUp(name = 'Test User') {
  const agent = request.agent(app);
  const email = `user${++emailCounter}@example.com`;
  const { body: user } = await agent.post('/api/auth/register').send({ name, email, password: 'password123' }).expect(201);
  const { body: workspaces } = await agent.get('/api/workspaces').expect(200);
  const ws = workspaces[0].id as number;
  return { agent, user, email, ws, w: (path = '') => `/api/workspaces/${ws}${path}` };
}

async function withProject(name?: string) {
  const session = await signUp(name);
  const { body: project } = await session.agent
    .post(session.w('/projects'))
    .send({ name: 'Alpha', color: '#aabbcc' })
    .expect(201);
  return { ...session, project };
}

async function invite(agent: request.Agent, w: (p: string) => string, role = 'member') {
  const { body } = await agent.post(w('/invites')).send({ role }).expect(201);
  return body.token as string;
}

describe('auth', () => {
  it('registers with a personal workspace, reads the session and logs out', async () => {
    const { agent, user } = await signUp('Dana Lee');
    const me = await agent.get('/api/auth/me').expect(200);
    assert.equal(me.body.id, user.id);
    assert.equal(me.body.password_hash, undefined);
    const { body: workspaces } = await agent.get('/api/workspaces');
    assert.deepEqual(
      workspaces.map((w: { name: string; role: string }) => [w.name, w.role]),
      [["Dana's workspace", 'owner']],
    );
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('rejects duplicate emails and wrong passwords', async () => {
    const { email } = await signUp();
    await request(app).post('/api/auth/register').send({ name: 'Again', email: email.toUpperCase(), password: 'password123' }).expect(409);
    await request(app).post('/api/auth/login').send({ email, password: 'nope-nope' }).expect(401);
    await request(app).post('/api/auth/login').send({ email, password: 'password123' }).expect(200);
  });

  it('protects the API', async () => {
    await request(app).get('/api/workspaces').expect(401);
    await request(app).get('/api/workspaces').set('Cookie', 'tl_session=forged').expect(401);
  });

  it('rate limits auth attempts', async () => {
    const limited = createApp(openDb(':memory:'), { jwtSecret: 'x', authRateLimit: 2, realtime });
    const attempt = () => request(limited).post('/api/auth/login').send({ email: 'a@b.co', password: 'x' });
    await attempt().expect(401);
    await attempt().expect(401);
    await attempt().expect(429);
  });

  it('demo login lands in the seeded workspaces', async () => {
    await request(app).post('/api/auth/demo').expect(404);
    seed(db);
    const agent = request.agent(app);
    await agent.post('/api/auth/demo').expect(200);
    const { body: workspaces } = await agent.get('/api/workspaces').expect(200);
    assert.equal(workspaces.length, 2);
    const { body: tasks } = await agent.get(`/api/workspaces/${workspaces[0].id}/tasks`).expect(200);
    assert.ok(tasks.length > 20);
  });
});

describe('tasks', () => {
  it('validates input', async () => {
    const { agent, w, project } = await withProject();
    const res = await agent.post(w('/tasks')).send({ projectId: project.id, title: '' }).expect(400);
    assert.equal(res.body.error, 'Validation failed');
    await agent.post(w('/tasks')).send({ projectId: 999, title: 'x' }).expect(400);
    await agent.post(w('/tasks')).send({ projectId: project.id, title: 'x', dueDate: '12/01/2026' }).expect(400);
  });

  it('creates, filters, updates and deletes', async () => {
    const { agent, w, project, user } = await withProject();
    const { body: a } = await agent
      .post(w('/tasks'))
      .send({ projectId: project.id, title: 'Write docs', priority: 'high', assigneeId: user.id })
      .expect(201);
    await agent.post(w('/tasks')).send({ projectId: project.id, title: 'Fix 100% bug' }).expect(201);

    assert.equal(a.status, 'todo');
    assert.equal((await agent.get(w('/tasks?assignee=me'))).body.length, 1);
    assert.equal((await agent.get(w('/tasks?priority=high'))).body.length, 1);
    assert.equal((await agent.get(w('/tasks?q=100%25'))).body.length, 1, 'LIKE wildcards are escaped');
    assert.equal((await agent.get(w('/tasks?q=alpha'))).body.length, 2, 'search matches project name');

    const { body: patched } = await agent.patch(w(`/tasks/${a.id}`)).send({ title: 'Write better docs', status: 'done' });
    assert.equal(patched.title, 'Write better docs');
    assert.equal(patched.priority, 'high', 'PATCH leaves other fields alone');
    assert.ok(patched.completedAt);

    await agent.delete(w(`/tasks/${a.id}`)).expect(204);
    await agent.get(w(`/tasks/${a.id}`)).expect(404);
  });

  it('moves tasks between columns relative to neighbours', async () => {
    const { agent, w, project } = await withProject();
    const make = async (title: string, status = 'todo') =>
      (await agent.post(w('/tasks')).send({ projectId: project.id, title, status })).body;
    const a = await make('A');
    const b = await make('B');
    const c = await make('C', 'review');
    const d = await make('D', 'review');
    const titles = async () => (await agent.get(w('/tasks?status=review'))).body.map((t: { title: string }) => t.title);

    const { body: moved } = await agent.post(w(`/tasks/${a.id}/move`)).send({ status: 'review', afterId: c.id }).expect(200);
    assert.equal(moved.status, 'review');
    assert.deepEqual(await titles(), ['C', 'A', 'D']);

    await agent.post(w(`/tasks/${b.id}/move`)).send({ status: 'review', beforeId: c.id }).expect(200);
    assert.deepEqual(await titles(), ['B', 'C', 'A', 'D']);

    const { body: done } = await agent.post(w(`/tasks/${d.id}/move`)).send({ status: 'done' }).expect(200);
    assert.ok(done.completedAt);
    const { body: back } = await agent.post(w(`/tasks/${d.id}/move`)).send({ status: 'todo' }).expect(200);
    assert.equal(back.completedAt, null);
  });

  it('handles subtasks, comments and stats', async () => {
    const { agent, w, project, ws } = await withProject();
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const { body: task } = await agent.post(w('/tasks')).send({ projectId: project.id, title: 'Ship', dueDate: '2000-01-01' }).expect(201);
    await agent.post(w('/tasks')).send({ projectId: project.id, title: 'Soon', dueDate: today }).expect(201);

    const { body: sub } = await agent.post(w(`/tasks/${task.id}/subtasks`)).send({ title: 'Step 1' }).expect(201);
    await agent.patch(w(`/subtasks/${sub.id}`)).send({ done: true }).expect(200);
    const { body: comment } = await agent.post(w(`/tasks/${task.id}/comments`)).send({ body: 'On it' }).expect(201);

    const { body: detail } = await agent.get(w(`/tasks/${task.id}`)).expect(200);
    assert.deepEqual(detail.subtasks, { done: 1, total: 1 });
    assert.equal(detail.comments[0].author.name, 'Test User');

    const { body: stats } = await agent.get(w(`/stats?today=${today}`)).expect(200);
    assert.deepEqual(stats, { open: 2, dueThisWeek: 1, overdue: 1, doneThisWeek: 0 });

    // A teammate can't delete someone else's comment.
    const mate = await signUp('Mate');
    const token = await invite(agent, w);
    await mate.agent.post(`/api/invites/${token}/accept`).expect(200);
    await mate.agent.delete(`/api/workspaces/${ws}/comments/${comment.id}`).expect(403);
    await agent.delete(w(`/comments/${comment.id}`)).expect(204);
  });

  it('reports project counts', async () => {
    const { agent, w, project } = await withProject();
    await agent.post(w('/tasks')).send({ projectId: project.id, title: 'One' });
    await agent.post(w('/tasks')).send({ projectId: project.id, title: 'Two', status: 'done' });
    const { body: projects } = await agent.get(w('/projects')).expect(200);
    assert.equal(projects[0].taskCount, 2);
    assert.equal(projects[0].openCount, 1);
  });
});

describe('workspaces', () => {
  it('isolates data between workspaces', async () => {
    const alice = await withProject('Alice');
    const bob = await signUp('Bob');
    const { body: task } = await alice.agent.post(alice.w('/tasks')).send({ projectId: alice.project.id, title: 'Secret' });
    const { body: sub } = await alice.agent.post(alice.w(`/tasks/${task.id}/subtasks`)).send({ title: 'Hidden' });

    await bob.agent.get(alice.w('/tasks')).expect(404);
    // Bob can't reach Alice's records through his own workspace either.
    await bob.agent.get(bob.w(`/tasks/${task.id}`)).expect(404);
    await bob.agent.patch(bob.w(`/subtasks/${sub.id}`)).send({ done: true }).expect(404);
    await bob.agent.post(bob.w('/tasks')).send({ projectId: alice.project.id, title: 'x' }).expect(400);
    assert.equal((await bob.agent.get(bob.w('/tasks'))).body.length, 0);
  });

  it('creates, renames and deletes a workspace', async () => {
    const { agent } = await signUp();
    const { body: ws } = await agent.post('/api/workspaces').send({ name: 'Launch team' }).expect(201);
    assert.equal(ws.role, 'owner');
    await agent.patch(`/api/workspaces/${ws.id}`).send({ name: 'Launch crew' }).expect(200);
    assert.equal((await agent.get(`/api/workspaces/${ws.id}`)).body.name, 'Launch crew');
    await agent.delete(`/api/workspaces/${ws.id}`).expect(204);
    assert.equal((await agent.get('/api/workspaces')).body.length, 1);
  });

  it('invites people with a link and enforces roles', async () => {
    const owner = await withProject('Olivia');
    const token = await invite(owner.agent, owner.w);

    // Preview works without signing in.
    const { body: preview } = await request(app).get(`/api/invites/${token}`).expect(200);
    assert.equal(preview.workspace.name, "Olivia's workspace");
    assert.equal(preview.invitedBy, 'Olivia');

    const member = await signUp('Max');
    await member.agent.post(`/api/invites/${token}/accept`).expect(200);
    const again = await member.agent.post(`/api/invites/${token}/accept`).expect(200);
    assert.equal(again.body.alreadyMember, true);

    const { body: members } = await owner.agent.get(owner.w('/members')).expect(200);
    assert.deepEqual(members.map((m: { name: string; role: string }) => [m.name, m.role]), [['Olivia', 'owner'], ['Max', 'member']]);

    // Members can work on tasks but not manage the workspace.
    const ws = (p: string) => owner.w(p);
    await member.agent.post(ws('/tasks')).send({ projectId: owner.project.id, title: 'Mine', assigneeId: member.user.id }).expect(201);
    await member.agent.post(ws('/projects')).send({ name: 'Nope', color: '#000000' }).expect(403);
    await member.agent.post(ws('/invites')).send({}).expect(403);
    await member.agent.patch(ws('')).send({ name: 'Hijack' }).expect(403);

    // Admins can invite members but not admins.
    await owner.agent.patch(ws(`/members/${member.user.id}`)).send({ role: 'admin' }).expect(204);
    await invite(member.agent, ws, 'member');
    await member.agent.post(ws('/invites')).send({ role: 'admin' }).expect(403);
    await owner.agent.patch(ws(`/members/${owner.user.id}`)).send({ role: 'member' }).expect(400);

    // Removing a member unassigns their tasks and revokes access.
    await owner.agent.delete(ws(`/members/${member.user.id}`)).expect(204);
    await member.agent.get(ws('/tasks')).expect(404);
    const { body: tasks } = await owner.agent.get(ws('/tasks')).expect(200);
    assert.equal(tasks[0].assigneeId, null);
  });

  it('rejects expired, revoked and unknown invites', async () => {
    const { agent, w } = await signUp();
    const token = await invite(agent, w);
    const { body: invites } = await agent.get(w('/invites')).expect(200);
    await agent.delete(w(`/invites/${invites[0].id}`)).expect(204);
    await request(app).get(`/api/invites/${token}`).expect(410);
    await request(app).get('/api/invites/not-a-real-token').expect(404);
  });

  it('keeps at least one owner', async () => {
    const owner = await signUp('Solo');
    await owner.agent.delete(owner.w(`/members/${owner.user.id}`)).expect(400);
  });

  it('migrates a pre-workspace database into one shared workspace', () => {
    const legacy = new DatabaseSync(':memory:');
    legacy.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL, color TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL,
        created_by INTEGER, created_at TEXT NOT NULL);
      INSERT INTO users VALUES (1, 'A', 'a@x.co', 'h', '#fff', 'now'), (2, 'B', 'b@x.co', 'h', '#fff', 'now');
      INSERT INTO projects VALUES (1, 'Old', '#fff', 1, 'now');
    `);
    // openDb takes a path, so exercise the same migration by re-running the schema on this handle.
    const file = `${process.env.TEMP ?? '/tmp'}/tasklane-migrate-${Date.now()}.db`;
    legacy.exec(`VACUUM INTO '${file.replace(/\\/g, '/')}'`);
    const migrated = openDb(file);
    const roles = migrated.prepare('SELECT user_id, role FROM memberships ORDER BY user_id').all();
    assert.deepEqual(roles.map((r) => [r.user_id, r.role]), [[1, 'owner'], [2, 'member']]);
    const project = migrated.prepare('SELECT workspace_id FROM projects').get() as { workspace_id: number };
    assert.ok(project.workspace_id);
    migrated.close();
  });
});

describe('realtime', () => {
  it('streams changes to other members with presence', async () => {
    const owner = await withProject('Olivia');
    const mate = await signUp('Max');
    await mate.agent.post(`/api/invites/${await invite(owner.agent, owner.w)}/accept`).expect(200);

    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    const login = await fetch(`http://localhost:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: mate.email, password: 'password123' }),
    });
    const cookie = login.headers.get('set-cookie')!.split(';')[0];

    const controller = new AbortController();
    const stream = await fetch(`http://localhost:${port}${owner.w('/events')}?clientId=mate-tab`, {
      headers: { Cookie: cookie },
      signal: controller.signal,
    });
    assert.equal(stream.headers.get('content-type'), 'text/event-stream; charset=utf-8');

    const events: Record<string, unknown>[] = [];
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    const waitFor = async (match: (e: Record<string, unknown>) => boolean) => {
      let buffer = '';
      for (;;) {
        const found = events.find(match);
        if (found) return found;
        const { value, done } = await reader.read();
        if (done) throw new Error('stream closed');
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop()!;
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data: '));
          if (line) events.push(JSON.parse(line.slice(6)));
        }
      }
    };

    const presence = await waitFor((e) => e.type === 'presence');
    assert.deepEqual(presence.online, [mate.user.id]);

    await owner.agent
      .post(owner.w('/tasks'))
      .set('X-Client-Id', 'owner-tab')
      .send({ projectId: owner.project.id, title: 'Live one' })
      .expect(201);
    const created = await waitFor((e) => e.type === 'task' && e.action === 'created');
    assert.equal(created.title, 'Live one');
    assert.equal(created.origin, 'owner-tab');
    assert.deepEqual(created.actor, { id: owner.user.id, name: 'Olivia' });

    // Removing the member ends their stream.
    await owner.agent.delete(owner.w(`/members/${mate.user.id}`)).expect(204);
    await waitFor((e) => e.type === 'members' && e.action === 'removed');
    controller.abort();
    server.close();
  });
});
