import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  color         TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  joined_at    TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);

-- Invite links. Only a SHA-256 of the token is stored, so a DB leak doesn't hand out working links.
CREATE TABLE IF NOT EXISTS invites (
  id           INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  role         TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  uses         INTEGER NOT NULL DEFAULT 0,
  revoked_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_invites_workspace ON invites(workspace_id);

CREATE TABLE IF NOT EXISTS projects (
  id           INTEGER PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  lead_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  start_date   TEXT,
  due_date     TEXT,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
  priority     TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date     TEXT,
  assignee_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  position     REAL NOT NULL,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_status_position ON tasks(status, position);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);

CREATE TABLE IF NOT EXISTS subtasks (
  id       INTEGER PRIMARY KEY,
  task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title    TEXT NOT NULL,
  done     INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id);
`;

export function openDb(file: string): DB {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Upgrades databases created before workspaces existed: everything moves into one shared workspace. */
function migrate(db: DB) {
  const columns = db.prepare('PRAGMA table_info(projects)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'workspace_id')) {
    tx(db, () => {
      db.exec('ALTER TABLE projects ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE');
      const users = db.prepare('SELECT id FROM users ORDER BY id').all() as { id: number }[];
      if (!users.length) return;
      const now = nowISO();
      const workspaceId = Number(
        db
          .prepare('INSERT INTO workspaces (name, created_by, created_at) VALUES (?, ?, ?)')
          .run('Team workspace', users[0].id, now).lastInsertRowid,
      );
      const join = db.prepare('INSERT INTO memberships (workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)');
      users.forEach((u, i) => join.run(workspaceId, u.id, i === 0 ? 'owner' : 'member', now));
      db.prepare('UPDATE projects SET workspace_id = ?').run(workspaceId);
    });
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id)');

  // Project details added later: description, lead and a start/due window.
  const projectColumns = new Set((db.prepare('PRAGMA table_info(projects)').all() as { name: string }[]).map((c) => c.name));
  const added: Record<string, string> = {
    description: "TEXT NOT NULL DEFAULT ''",
    lead_id: 'INTEGER REFERENCES users(id) ON DELETE SET NULL',
    start_date: 'TEXT',
    due_date: 'TEXT',
  };
  for (const [column, type] of Object.entries(added)) {
    if (!projectColumns.has(column)) db.exec(`ALTER TABLE projects ADD COLUMN ${column} ${type}`);
  }
}

export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const nowISO = () => new Date().toISOString();
