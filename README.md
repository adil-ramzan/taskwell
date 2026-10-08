# Taskwell

Taskwell is a team task-management web app: projects, tasks, a Kanban board, a calendar, reports, teams and in-app notifications, behind a marketing homepage with a mailing-list signup. It is a single Next.js application backed by PostgreSQL.

The dashboard is documented in depth (data model, every API endpoint, access rules, UI conventions) in [DASHBOARD.md](DASHBOARD.md). This file covers what the project is and how to run it.

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database and migrations](#database-and-migrations)
- [Development commands](#development-commands)
- [Production build](#production-build)
- [Run with Docker](#run-with-docker)
- [File storage](#file-storage)
- [Security notes](#security-notes)
- [Current limitations](#current-limitations)

## Features

**Workspace**

- **Projects**: personal projects, or projects shared with a team.
- **Tasks**: status, priority, assignee, due date and time, description; list, Kanban board (drag and drop, or a keyboard alternative) and "My tasks" views with filters and pagination.
- **Subtasks and dependencies**: one level of subtasks with progress; "blocked by / blocks" links with cycle prevention.
- **Labels**: colored labels per personal or team workspace, with any/all filtering.
- **Recurring tasks**: daily, weekly or monthly schedules; the next occurrence is created when the current one is completed.
- **Reminders**: personal reminders before a due date, delivered as in-app notifications.
- **Task templates**: reusable starting points, including labels, a due-date offset and subtasks.
- **Time tracking**: a start/stop timer (one per person) and manual entries, with totals per task.
- **Attachments**: files on tasks (images, PDF, text, Office documents, ZIP; up to 10 MB each), stored on the server and served only after an access check.
- **Comments and activity**: comments with @mentions, and a history of every change to a task.

**Overview and planning**

- **Dashboard**: task statistics, monthly activity, status and priority distribution, project progress, a review list.
- **Calendar**: month, week, day and agenda views of tasks by due date.
- **Reports**: figures and breakdowns for a date range and filters, time tracked, and CSV export.
- **Command palette** (Ctrl/Cmd+K): jump to pages, create tasks and projects, search tasks, projects and teams.

**Teams and accounts**

- **Teams**: owner, admin and member roles; invitations by link and, optionally, by email.
- **Notifications**: in-app notifications for assignments, comments, mentions, invitations and reminders.
- **Accounts**: email and password sign-in, profile picture, time zone, password change, "sign out other devices", optional two-factor sign-in (TOTP) with recovery codes, account deletion.
- **Light and dark themes**, responsive from phones to desktops, keyboard accessible.

**Marketing site**

- A homepage with a mailing-list signup stored in the database (no confirmation email is sent).

## Tech stack

| Area | Technology |
| --- | --- |
| Framework | Next.js 14 (App Router), React 18 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS 3, `lucide-react` icons, Bricolage Grotesque and Inter via `next/font` |
| Database | PostgreSQL 16, Prisma 6 |
| Authentication | NextAuth v4 (Credentials provider, JWT sessions), bcryptjs |
| Images | sharp (profile pictures) |
| Email (optional) | Resend, for team invitation emails |
| Containers | Docker and Docker Compose |

There is no separate backend service: API routes under `app/api/` and server-only modules under `lib/` talk to the database through Prisma.

## Project structure

| Path | Contents |
| --- | --- |
| `app/` | Pages (`/`, `/login`, `/signup`, `/dashboard/...`) and API routes (`app/api/...`) |
| `components/` | Marketing components; `components/dashboard/` holds the dashboard UI |
| `lib/` | Server-side data layer, access rules and shared validation |
| `prisma/` | `schema.prisma` and the SQL migrations |
| `auth.ts`, `middleware.ts` | NextAuth configuration and the `/dashboard` route guard |
| `instrumentation.ts` | Starts the reminder scheduler with the server |
| `Dockerfile`, `docker-compose.yml` | Container image and the app + database setup |

## Getting started

Requirements: Node.js 18.18 or newer (developed on Node 22), npm, and PostgreSQL 16 (the Docker Compose file provides one).

```bash
# 1. Install dependencies (also generates the Prisma client)
npm install

# 2. Create your environment file and fill it in (see the next section)
cp .env.example .env

# 3. Start a database (skip if you already have PostgreSQL running)
docker compose up -d db

# 4. Create the tables
npm run db:deploy

# 5. Start the app
npm run dev
```

Open http://localhost:3000, create an account at `/signup`, and sign in.

Run only one `next dev` per project folder, and restart it after any change to `prisma/schema.prisma`.

## Environment variables

Copy `.env.example` to `.env` and set the values. `.env` is ignored by Git; never commit it.

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection URL used by Prisma, e.g. `postgresql://USER:PASSWORD@localhost:5432/DBNAME?schema=public`. |
| `AUTH_SECRET` | Yes | Secret that signs session tokens. Generate one with `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | Yes | The app's public URL, e.g. `http://localhost:3000`. Links in invitation emails are built from it. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | For Docker Compose | Credentials and database name for the Compose `db` service. They must match `DATABASE_URL` when the app runs on the host. |
| `TWO_FACTOR_ENCRYPTION_KEY` | For 2FA | 32 random bytes, base64 or hex (`openssl rand -base64 32`), used to encrypt authenticator secrets. Without it two-factor sign-in can't be turned on. Don't change it once accounts use 2FA. |
| `RESEND_API_KEY` | Optional | Resend API key for invitation emails. Without it invitations still work through their link, and the app says no email was sent. |
| `EMAIL_FROM` | Optional | Sender address on a domain verified in Resend, e.g. `Taskwell <invites@example.com>`. |
| `APP_PORT` | Optional | Host port for the Compose app container (default `3000`). |
| `REMINDER_POLL_MS` | Optional | How often the server looks for due reminders, in milliseconds (default `20000`, minimum `1000`). |
| `REMINDER_SCHEDULER` | Optional | `off` runs a server process without the reminder timer. |

All of these are read on the server only; none is exposed to the browser.

## Database and migrations

The schema is in `prisma/schema.prisma` and the migrations in `prisma/migrations/`. They are plain SQL and only ever add to the schema.

```bash
npm run db:deploy            # apply the checked-in migrations (setup and production)
npm run db:migrate           # development: apply migrations and create a new one after a schema change
npx prisma migrate status    # show which migrations are applied
npx prisma generate          # regenerate the Prisma client
npx prisma validate          # validate the schema
```

Use `db:deploy` for an existing database: it applies pending migrations and never resets data.

## Development commands

```bash
npm run dev          # development server on http://localhost:3000
npm run lint         # ESLint (next/core-web-vitals)
npx tsc --noEmit     # TypeScript check
npm run build        # production build (also type-checks)
npm run start        # serve the production build
```

The repository has no test command; the checks above are what `npm` runs.

## Production build

```bash
npm ci
npm run db:deploy    # apply migrations to the production database
npm run build
npm run start        # serves on port 3000 (set PORT to change it)
```

Set the environment variables in your hosting platform's secret store rather than in a file, use the real public origin for `NEXTAUTH_URL`, serve the app over HTTPS, and keep `storage/` on a persistent disk (see [File storage](#file-storage)).

## Run with Docker

```bash
cp .env.example .env     # set POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB and AUTH_SECRET
docker compose up --build
```

The app is served at http://localhost:3000 (change the host port with `APP_PORT`) and PostgreSQL on port 5432. The app container waits for the database, runs `prisma migrate deploy`, then starts. Inside Compose the app builds its own `DATABASE_URL` from the `POSTGRES_*` values.

To run only the database in Docker and the app on the host:

```bash
docker compose up -d db
npm run db:deploy
npm run dev
```

`docker compose down` stops the containers and keeps the named volumes. Removing the volumes deletes the database and the uploaded files.

## File storage

Uploaded profile pictures and task attachments are files on the server's disk, not database rows:

| Folder | Docker volume | Contents |
| --- | --- | --- |
| `storage/avatars/` | `avatar-data` | Profile pictures |
| `storage/attachments/` | `attachment-data` | Files attached to tasks |

`storage/` is ignored by Git. Keep both volumes when recreating the app container, and back them up together with the database (`db-data` volume).

## Security notes

- Identity always comes from the server-side session; IDs sent by the browser are never trusted for access.
- A project is reachable by its owner (personal) or its team's members (team); tasks and everything on them inherit that rule. Something outside your reach answers the same `404` as something that doesn't exist.
- Passwords are hashed with bcrypt; sign-in and password checks are throttled per account; two-factor secrets are encrypted at rest.
- Uploaded files are stored under random server-generated names, checked against their real content, and served only through authenticated routes.
- No secret belongs in the repository: configuration is read from environment variables only.

## Current limitations

- No email verification or password reset, and email is sent only for team invitations.
- Request throttling covers sign-in and password checks; the public signup endpoints (`/api/register`, `/api/subscribe`) have no rate limit of their own. Put the app behind a reverse proxy or platform that provides one before exposing it publicly.
- Uploaded files live on the server's local disk, so running several app instances needs shared storage; there is no virus scanning.
- The reminder scheduler runs inside the app process; reminders are in-app notifications only.
- The marketing homepage's testimonials, pricing and product mockup are sample content.

The dashboard's detailed limitations are listed in [DASHBOARD.md](DASHBOARD.md#current-limitations).
