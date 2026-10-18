import { translate, type MessageKey } from './i18n';

export type Status = 'todo' | 'in_progress' | 'review' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type Role = 'owner' | 'admin' | 'member';

export const STATUSES: Status[] = ['todo', 'in_progress', 'review', 'done'];
export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];
export const ROLE_RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

export interface User {
  id: number;
  name: string;
  email: string;
  color: string;
}

export interface Member extends User {
  role: Role;
  joinedAt: string;
}

export interface Workspace {
  id: number;
  name: string;
  role: Role;
  memberCount: number;
}

export interface Invite {
  id: number;
  role: Role;
  createdAt: string;
  expiresAt: string;
  uses: number;
  createdBy: string | null;
  token?: string;
}

export interface InvitePreview {
  workspace: { id: number; name: string; memberCount: number };
  role: Role;
  invitedBy: string | null;
  expiresAt: string;
}

export interface Project {
  id: number;
  name: string;
  color: string;
  taskCount: number;
  openCount: number;
}

export interface Task {
  id: number;
  projectId: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  dueDate: string | null;
  assigneeId: number | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  subtasks: { done: number; total: number };
  commentCount: number;
}

export interface Subtask {
  id: number;
  title: string;
  done: boolean;
}

export interface Comment {
  id: number;
  body: string;
  createdAt: string;
  author: Pick<User, 'id' | 'name' | 'color'> | null;
}

export interface TaskDetail extends Task {
  subtaskList: Subtask[];
  comments: Comment[];
}

export interface Stats {
  open: number;
  dueThisWeek: number;
  overdue: number;
  doneThisWeek: number;
}

export interface TaskFilters {
  projectId?: number;
  mine?: boolean;
  priority?: Priority;
  q?: string;
}

export type TaskInput = Partial<Pick<Task, 'title' | 'description' | 'projectId' | 'status' | 'priority' | 'dueDate' | 'assigneeId'>>;

/** Identifies this browser tab so it can ignore real-time echoes of its own writes. */
export const CLIENT_ID = Math.random().toString(36).slice(2, 12);

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Known server messages that deserve a specific translation rather than a status-code fallback.
const SERVER_MESSAGES: Record<string, MessageKey> = {
  'Invalid email or password': 'error.invalidLogin',
  'An account with this email already exists': 'error.emailTaken',
  'Make someone else an owner before you leave': 'error.lastOwner',
};

/** Turns any thrown value into a sentence in the current language. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const known = SERVER_MESSAGES[err.message];
    if (known) return translate(known);
    if (err.status === 400) return translate('error.validation');
    if (err.status === 403) return translate('error.forbidden');
    if (err.status === 404) return translate('error.notFound');
    if (err.status === 429) return translate('error.tooMany');
    return translate('error.generic');
  }
  if (err instanceof TypeError) return translate('error.network');
  return translate('error.generic');
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'X-Client-Id': CLIENT_ID };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
  return data as T;
}

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

const filterParams = (f: TaskFilters) => ({
  projectId: f.projectId,
  assignee: f.mine ? 'me' : undefined,
  priority: f.priority,
  q: f.q?.trim(),
});

export const api = {
  me: () => request<User>('GET', '/auth/me'),
  login: (email: string, password: string) => request<User>('POST', '/auth/login', { email, password }),
  register: (name: string, email: string, password: string) =>
    request<User>('POST', '/auth/register', { name, email, password }),
  demo: () => request<User>('POST', '/auth/demo'),
  logout: () => request<void>('POST', '/auth/logout'),

  workspaces: () => request<Workspace[]>('GET', '/workspaces'),
  createWorkspace: (name: string) => request<Workspace>('POST', '/workspaces', { name }),

  invitePreview: (token: string) => request<InvitePreview>('GET', `/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string) =>
    request<{ workspace: Workspace; alreadyMember: boolean }>('POST', `/invites/${encodeURIComponent(token)}/accept`),
};

/** Endpoints scoped to one workspace. */
export function workspaceApi(workspaceId: number) {
  const base = `/workspaces/${workspaceId}`;
  return {
    id: workspaceId,
    eventsUrl: `/api${base}/events?clientId=${CLIENT_ID}`,

    get: () => request<Workspace>('GET', base),
    rename: (name: string) => request<Workspace>('PATCH', base, { name }),
    remove: () => request<void>('DELETE', base),

    members: () => request<Member[]>('GET', `${base}/members`),
    setRole: (userId: number, role: Role) => request<void>('PATCH', `${base}/members/${userId}`, { role }),
    removeMember: (userId: number) => request<void>('DELETE', `${base}/members/${userId}`),

    invites: () => request<Invite[]>('GET', `${base}/invites`),
    createInvite: (role: Role, expiresInDays: number) =>
      request<Invite>('POST', `${base}/invites`, { role, expiresInDays }),
    revokeInvite: (id: number) => request<void>('DELETE', `${base}/invites/${id}`),

    projects: () => request<Project[]>('GET', `${base}/projects`),
    createProject: (name: string, color: string) => request<Project>('POST', `${base}/projects`, { name, color }),

    tasks: (f: TaskFilters) => request<Task[]>('GET', `${base}/tasks${query(filterParams(f))}`),
    stats: (f: TaskFilters, today: string) => request<Stats>('GET', `${base}/stats${query({ ...filterParams(f), today })}`),
    task: (id: number) => request<TaskDetail>('GET', `${base}/tasks/${id}`),
    createTask: (input: TaskInput) => request<Task>('POST', `${base}/tasks`, input),
    updateTask: (id: number, patch: TaskInput) => request<Task>('PATCH', `${base}/tasks/${id}`, patch),
    moveTask: (id: number, status: Status, afterId: number | null, beforeId: number | null) =>
      request<Task>('POST', `${base}/tasks/${id}/move`, { status, afterId, beforeId }),
    deleteTask: (id: number) => request<void>('DELETE', `${base}/tasks/${id}`),

    addSubtask: (taskId: number, title: string) => request<Subtask>('POST', `${base}/tasks/${taskId}/subtasks`, { title }),
    updateSubtask: (id: number, patch: Partial<Omit<Subtask, 'id'>>) =>
      request<Subtask>('PATCH', `${base}/subtasks/${id}`, patch),
    deleteSubtask: (id: number) => request<void>('DELETE', `${base}/subtasks/${id}`),

    addComment: (taskId: number, body: string) => request<Comment>('POST', `${base}/tasks/${taskId}/comments`, { body }),
    deleteComment: (id: number) => request<void>('DELETE', `${base}/comments/${id}`),
  };
}

export type WorkspaceApi = ReturnType<typeof workspaceApi>;
