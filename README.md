# Birge

*Birge* means “together” in Kazakh. The dot over the i in the logo is a live status light: it pulses while you're connected to your team in real time.

A real-time kanban tracker for small teams: workspaces with roles and invite links, live updates and presence, a drag-and-drop board, and a UI in English, Russian and Kazakh.

**Live demo: [birge-kp0v.onrender.com](https://birge-kp0v.onrender.com)**. Click **Explore the demo workspace**, no sign-up needed. To see real-time sync, open it in two windows and drag a card in one.

> Hosted on Render's free plan: after 15 minutes without visitors the server sleeps, so the first load can take up to a minute. The demo data resets on every restart.

## Features

- **Teams.** Every account gets a personal workspace and can create more. Owners and admins invite people with expiring links (`/join/:token`). Roles are owner, admin and member, and the server enforces them. Removing someone unassigns their tasks and closes their live connection.
- **Real time.** Changes stream over Server-Sent Events. Other members' boards update instantly, a toast says who did what, and the header shows who's online. Each tab ignores its own echoes, and after a reconnect the app resyncs.
- **Board and list views.** Drag cards between columns and reorder them. Moves update optimistically and persist on the server. Keyboard: <kbd>Space</kbd> picks a card up, arrows move it, <kbd>Enter</kbd> opens it.
- **Task details**: status, project, priority, assignee, due date, description, subtasks, comments.
- **Filters and stats**: "assigned to me", priority, full-text search, plus counters for open, due this week, overdue and done in 7 days.
- **Three languages.** English, Russian and Kazakh are translated by hand, with proper plural forms (Intl.PluralRules) and localized dates. Many browsers lack Kazakh locale data, so Kazakh dates are formatted from built-in tables.
- **Six color palettes** (Cobalt "paper", Lime, Indigo, Ocean, Sunset, Rose), each with light and dark variants. Language, theme and palette are remembered per browser.
- **Auth**: email and password (bcrypt), JWT in an `httpOnly` cookie, rate-limited login, one-click demo login.

## Stack

| Layer    | Tech |
|----------|------|
| Frontend | React 19, TypeScript, Vite, TanStack Query, dnd-kit, lucide icons, hand-written CSS with design tokens |
| Backend  | Node 22+, Express 5, Zod, built-in `node:sqlite` (no native build step), Server-Sent Events |
| Auth     | bcryptjs, jsonwebtoken, httpOnly cookies |
| Tests    | `node:test` + supertest: 17 API scenarios covering auth, tasks, workspace isolation, roles, invites, migration and the live stream |

## Getting started

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

- Web app: http://localhost:5173
- API: http://localhost:4000 (Vite proxies `/api`)

The SQLite database is created at `server/data/birge.db` and seeded with demo data on first start: a 4-person team workspace and a personal one. To reset it, run `npm run seed`.

```bash
npm test            # API tests
npm run typecheck   # server + web
npm run build       # production build of the web app
npm start           # API that also serves web/dist
```

## Project structure

```
server/src/
  app.ts               Express app factory (used by tests and index.ts)
  auth.ts              register / login / demo / logout / me, session middleware
  db.ts                schema, transactions, migration from the pre-workspace schema
  realtime.ts          SSE hub: one room per workspace, presence, heartbeats
  routes/workspaces.ts workspaces, members, roles, invites, event stream
  routes/              projects, tasks (+ subtasks, comments), stats
web/src/
  api.ts               typed API client, error → localized message
  i18n.tsx             EN / RU / KK dictionaries, plurals, provider
  realtime.ts          EventSource hook → cache invalidation, toasts, presence
  dates.ts             localized due dates and relative times
  components/          Board, TaskDrawer, MembersPage, JoinScreen, Sidebar, SettingsMenu…
  styles.css, themes.css  design tokens, themes and palettes
```

## Design decisions

- **Workspace scoping at the router.** Every workspace route sits under `/api/workspaces/:id`, behind one `requireMember` middleware that loads the caller's role. Each query joins through `projects.workspace_id`, so an id from another workspace returns 404 instead of leaking data. Tests cover that cross-workspace access fails.
- **SSE instead of WebSockets.** Clients write through REST and only need server → client pushes. SSE runs over plain HTTP, reconnects on its own and needs no extra library. Events are hints: the client invalidates React Query caches and refetches, so the server stays the source of truth. The hub lives in memory, which fits a single instance. Scaling out means swapping it for Redis pub/sub.
- **Invite tokens are hashed.** Only a SHA-256 of each token is stored, and the raw link is shown once at creation. Links expire and can be revoked.
- **Reordering by neighbours, not index.** A move sends `afterId`/`beforeId`, so ordering stays correct when the client sees a filtered board.
- **No silent translations.** The server returns English errors. The client maps them by status and known message to localized text, so users never see raw exception strings.

## API

Auth and invite preview are public. Everything else needs the session cookie.

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/auth/register` · `/login` · `/demo` · `/logout` | register creates a personal workspace |
| GET  | `/api/auth/me` | |
| GET/POST | `/api/workspaces` | your workspaces with your role |
| GET/PATCH/DELETE | `/api/workspaces/:ws` | rename: admin+, delete: owner |
| GET | `/api/workspaces/:ws/members` | |
| PATCH/DELETE | `/api/workspaces/:ws/members/:userId` | change role: owner. Remove or leave |
| GET/POST | `/api/workspaces/:ws/invites` · DELETE `…/invites/:id` | admin+. Only owners can invite admins |
| GET | `/api/invites/:token` · POST `/api/invites/:token/accept` | preview is public |
| GET | `/api/workspaces/:ws/events?clientId=` | Server-Sent Events stream |
| GET/POST | `/api/workspaces/:ws/projects` · PATCH/DELETE `…/projects/:id` | writes: admin+ |
| GET/POST | `/api/workspaces/:ws/tasks?projectId&assignee=me&priority&status&q` | |
| GET/PATCH/DELETE | `/api/workspaces/:ws/tasks/:id` · POST `…/move` | |
| POST | `/api/workspaces/:ws/tasks/:id/subtasks` · `/comments` | |
| GET | `/api/workspaces/:ws/stats?today=YYYY-MM-DD` | |

## Deploying

Build the web app and run the API. It serves `web/dist` itself, so you deploy a single service:

```bash
npm install && npm run build
NODE_ENV=production JWT_SECRET=... npm start
```

Mount a persistent volume for `DB_FILE` (Railway, Fly.io, Render or a VPS). If you run behind nginx, keep response buffering off for `/events`. The server sends `X-Accel-Buffering: no` for that. See `server/.env.example` for all variables.

## Roadmap

- Activity log per task
- Email invites (the link flow is already in place)
- Playwright end-to-end tests and GitHub Actions CI
