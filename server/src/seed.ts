import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { tx, type DB } from './db';

export const DEMO_EMAIL = 'demo@birge.example';

const USERS = [
  { name: 'Alex Morgan', email: DEMO_EMAIL, color: '#c6f36b' },
  { name: 'Mira Chen', email: 'mira@birge.example', color: '#7ee0d2' },
  { name: 'Theo Walker', email: 'theo@birge.example', color: '#ffb27a' },
  { name: 'Sana Iqbal', email: 'sana@birge.example', color: '#b9a4ff' },
];

const PROJECTS: { name: string; color: string; personal?: boolean }[] = [
  { name: 'Website relaunch', color: '#c6f36b' },
  { name: 'Mobile app 3.0', color: '#7ee0d2' },
  { name: 'Billing service', color: '#ffb27a' },
  { name: 'Hiring sprint', color: '#b9a4ff' },
  { name: 'Side projects', color: '#ff8fa3', personal: true },
];

type SeedTask = {
  p: number;
  title: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due: number | null; // days from today
  who: number | null;
  subs?: [string, boolean][];
  comments?: [number, string][];
  description?: string;
};

const TASKS: SeedTask[] = [
  { p: 0, title: 'Audit the current sitemap', status: 'done', priority: 'medium', due: -5, who: 1, subs: [['Export all URLs', true], ['Flag dead pages', true]] },
  { p: 0, title: 'Wireframes for the pricing page', status: 'review', priority: 'high', due: 1, who: 0, subs: [['Desktop layout', true], ['Mobile layout', true], ['Annual billing toggle', false]], comments: [[2, 'Could we run the annual toggle past five customers before we lock it?']], description: 'Three tiers plus an enterprise row. Keep the comparison table collapsible on mobile.' },
  { p: 0, title: 'Hero copy variants', status: 'in_progress', priority: 'medium', due: 3, who: 2 },
  { p: 0, title: 'Redirect map for the old blog', status: 'todo', priority: 'high', due: 6, who: 1 },
  { p: 0, title: 'Cookie banner compliance check', status: 'todo', priority: 'urgent', due: 0, who: 0, comments: [[3, 'Legal needs this signed off before launch day.']] },
  { p: 0, title: 'Lighthouse pass on the landing page', status: 'todo', priority: 'low', due: 12, who: 3 },
  { p: 0, title: 'Move case studies into the CMS', status: 'in_progress', priority: 'medium', due: 5, who: 3, subs: [['Export from the old CMS', true], ['Map fields', false], ['Import and spot-check', false]] },
  { p: 0, title: 'Launch announcement email', status: 'done', priority: 'medium', due: -2, who: 2 },

  { p: 1, title: 'Offline mode for drafts', status: 'in_progress', priority: 'high', due: 2, who: 0, subs: [['Local queue', true], ['Conflict resolution', false], ['Retry with backoff', false]], comments: [[1, 'Last write wins is fine for v1, we can revisit merges later.']] },
  { p: 1, title: 'Crash in the Android 15 share sheet', status: 'review', priority: 'urgent', due: 0, who: 1, comments: [[1, 'Only reproduces on Pixel devices, steps are in the ticket.']] },
  { p: 1, title: 'Dark mode QA pass', status: 'todo', priority: 'medium', due: 8, who: 3 },
  { p: 1, title: 'Push notification opt-in screen', status: 'todo', priority: 'high', due: 4, who: 2 },
  { p: 1, title: 'App Store screenshots', status: 'todo', priority: 'low', due: 14, who: 2 },
  { p: 1, title: 'Face ID / fingerprint login', status: 'done', priority: 'high', due: -4, who: 0, subs: [['iOS', true], ['Android', true]] },
  { p: 1, title: 'Cold start under 1.5 seconds', status: 'in_progress', priority: 'urgent', due: -1, who: 1 },
  { p: 1, title: 'Release notes for 3.0', status: 'todo', priority: 'medium', due: 9, who: 0 },

  { p: 2, title: 'Retry policy for payment webhooks', status: 'review', priority: 'high', due: 2, who: 1, subs: [['Idempotency keys', true], ['Dead letter queue', true], ['Alerting', false]], comments: [[0, 'Looks good, just add a metric for the DLQ size.']] },
  { p: 2, title: 'Invoice PDF template', status: 'in_progress', priority: 'medium', due: 6, who: 3 },
  { p: 2, title: 'Proration for plan changes', status: 'todo', priority: 'urgent', due: 3, who: 1, subs: [['Upgrade mid-cycle', false], ['Downgrade at renewal', false], ['Edge case tests', false]] },
  { p: 2, title: 'EU VAT number validation', status: 'todo', priority: 'medium', due: 11, who: 0 },
  { p: 2, title: 'Failed payment email sequence', status: 'done', priority: 'medium', due: -3, who: 2 },
  { p: 2, title: 'Spike: usage-based metering', status: 'todo', priority: 'low', due: null, who: null },
  { p: 2, title: 'Refund flow in the admin panel', status: 'review', priority: 'medium', due: 5, who: 0 },

  { p: 3, title: 'Frontend engineer job post', status: 'done', priority: 'medium', due: -6, who: 0 },
  { p: 3, title: 'Rubric for take-home reviews', status: 'in_progress', priority: 'high', due: 1, who: 3, comments: [[0, 'Weight code clarity higher than feature count.']] },
  { p: 3, title: 'Schedule onsite interview loops', status: 'todo', priority: 'medium', due: 7, who: 2 },
  { p: 3, title: 'Reference checks for the backend hire', status: 'todo', priority: 'high', due: 2, who: 0 },
  { p: 3, title: 'Refresh the careers page', status: 'done', priority: 'low', due: -1, who: 3 },

  { p: 4, title: 'Write the portfolio case study', status: 'in_progress', priority: 'high', due: 4, who: 0, subs: [['Problem and constraints', true], ['Architecture diagram', false], ['Lessons learned', false]] },
  { p: 4, title: 'Record a 60-second demo video', status: 'todo', priority: 'medium', due: 6, who: 0 },
  { p: 4, title: 'Deploy to a custom domain', status: 'todo', priority: 'low', due: null, who: 0 },
];

function localISODate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isEmpty(db: DB) {
  return (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n === 0;
}

export function reset(db: DB) {
  db.exec(
    'DELETE FROM comments; DELETE FROM subtasks; DELETE FROM tasks; DELETE FROM projects; ' +
      'DELETE FROM invites; DELETE FROM memberships; DELETE FROM workspaces; DELETE FROM users;',
  );
}

export function seed(db: DB) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const today = new Date();
  const dueDate = (offset: number | null) =>
    offset === null ? null : localISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset));

  tx(db, () => {
    const createdAt = new Date(now - 30 * day).toISOString();
    const userIds = USERS.map((u) => {
      // Only the demo account is reachable (via the demo login button); teammates get unusable random passwords.
      const hash = bcrypt.hashSync(randomBytes(24).toString('hex'), 10);
      return Number(
        db
          .prepare('INSERT INTO users (name, email, password_hash, color, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(u.name, u.email, hash, u.color, createdAt).lastInsertRowid,
      );
    });
    // A shared team workspace plus a personal one, so the switcher has something to switch between.
    const insertWorkspace = db.prepare('INSERT INTO workspaces (name, created_by, created_at) VALUES (?, ?, ?)');
    const team = Number(insertWorkspace.run('Northwind Studio', userIds[0], createdAt).lastInsertRowid);
    const personal = Number(insertWorkspace.run('Personal', userIds[0], createdAt).lastInsertRowid);
    const join = db.prepare('INSERT INTO memberships (workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)');
    const teamRoles = ['owner', 'admin', 'member', 'member'];
    userIds.forEach((uid, i) => join.run(team, uid, teamRoles[i], createdAt));
    join.run(personal, userIds[0], 'owner', createdAt);

    const projectIds = PROJECTS.map((p) =>
      Number(
        db
          .prepare('INSERT INTO projects (workspace_id, name, color, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(p.personal ? personal : team, p.name, p.color, userIds[0], createdAt).lastInsertRowid,
      ),
    );

    const positions: Record<string, number> = {};
    const insertTask = db.prepare(
      `INSERT INTO tasks (project_id, title, description, status, priority, due_date, assignee_id, position,
                          created_by, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertSub = db.prepare('INSERT INTO subtasks (task_id, title, done, position) VALUES (?, ?, ?, ?)');
    const insertComment = db.prepare('INSERT INTO comments (task_id, user_id, body, created_at) VALUES (?, ?, ?, ?)');

    TASKS.forEach((t, i) => {
      const position = (positions[t.status] = (positions[t.status] ?? -1) + 1);
      const created = new Date(now - (20 - (i % 10)) * day).toISOString();
      const completed = t.status === 'done' ? new Date(now - Math.abs(t.due ?? 1) * day).toISOString() : null;
      const taskId = Number(
        insertTask.run(
          projectIds[t.p],
          t.title,
          t.description ?? '',
          t.status,
          t.priority,
          dueDate(t.due),
          t.who === null ? null : userIds[t.who],
          position,
          userIds[0],
          created,
          created,
          completed,
        ).lastInsertRowid,
      );
      t.subs?.forEach(([title, done], j) => insertSub.run(taskId, title, done ? 1 : 0, j));
      t.comments?.forEach(([who, body], j) =>
        insertComment.run(taskId, userIds[who], body, new Date(now - (3 - j) * day).toISOString()),
      );
    });
  });
}
