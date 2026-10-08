# Taskwell Dashboard Guide

This document covers everything about the authenticated Taskwell dashboard: routes, access control, layout, the overview page, Projects, Tasks, Settings, data model, APIs, UI conventions, and how to run and verify it. For the marketing site, general API, and deployment documentation, see [README.md](README.md).

## Contents

1. [Overview](#overview)
2. [Getting started](#getting-started)
3. [Routes](#routes)
4. [Authentication and access control](#authentication-and-access-control)
5. [Shared layout and navigation](#shared-layout-and-navigation)
6. [Dashboard overview (`/dashboard`)](#dashboard-overview-dashboard)
7. [Projects (`/dashboard/projects`)](#projects-dashboardprojects)
8. [Tasks (`/dashboard/tasks`)](#tasks-dashboardtasks)
9. [Calendar (`/dashboard/calendar`)](#calendar-dashboardcalendar)
10. [Reports (`/dashboard/reports`)](#reports-dashboardreports)
11. [Notifications and email](#notifications-and-email)
12. [Settings (`/dashboard/settings`)](#settings-dashboardsettings)
13. [Data model](#data-model)
14. [API reference](#api-reference)
15. [Server data layer](#server-data-layer)
16. [Loading, empty, and error states](#loading-empty-and-error-states)
17. [Design system and accessibility](#design-system-and-accessibility)
18. [File map](#file-map)
19. [Troubleshooting](#troubleshooting)
20. [Current limitations](#current-limitations)

## Overview

The dashboard is a protected, responsive workspace for Taskwell users. A signed-in user can:

- see a workspace overview with real task statistics, charts and a review list;
- create, list, open, edit, and delete **projects**, personal or shared with a team;
- create, list, open, edit, and delete **tasks**, move them on a Kanban board, assign them, give them due dates, labels, subtasks, dependencies, repeat schedules, reminders, time entries and attachments, and discuss them in comments;
- reuse **templates** for tasks they create again and again;
- see tasks on a **calendar**, run **reports** with CSV export, and find anything with the command palette;
- create **teams**, invite people, manage member roles, and share team projects (and their tasks) with every member;
- get in-app **notifications**, and manage their account, picture, time zone, password and two-factor sign-in in Settings.

All data is stored in PostgreSQL through Prisma. A project is either **personal** (only its owner has access) or belongs to a **team** (the team's members have access); every task belongs to one project. A user can only see or change what they have access to; identity is always taken from the server-side session, never from the browser.

## Getting started

Prerequisites: Node.js, npm, and the PostgreSQL database from `docker-compose.yml` (or any PostgreSQL that `DATABASE_URL` points to).

1. Configure `.env` (see `.env.example`). The dashboard needs:

   | Variable | Purpose |
   | --- | --- |
   | `DATABASE_URL` | PostgreSQL connection used by Prisma |
   | `AUTH_SECRET` | Signs NextAuth session tokens (used by `auth.ts` and `middleware.ts`) |
   | `NEXTAUTH_URL` | Public URL of the app, e.g. `http://localhost:3000` |
   | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Credentials for the Docker `db` service; must match `DATABASE_URL` |

2. Start the database: `docker compose up -d db`
3. Install dependencies (also runs `prisma generate`): `npm install`
4. Apply migrations: `npm run db:deploy`
5. Start the app: `npm run dev`, then register at `/signup` and sign in at `/login`.

Run only **one** `next dev` per project folder. Two dev servers share the `.next` folder and can break each other.

After any change to `prisma/schema.prisma`, run `npx prisma generate` **and restart the dev server**. See [Troubleshooting](#troubleshooting).

### Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Production build (includes type checking) |
| `npm run lint` | ESLint (`next lint`) |
| `npx tsc --noEmit -p .` | Type check only |
| `npx prisma validate` | Validate the Prisma schema |
| `npx prisma generate` | Regenerate Prisma Client after schema changes |
| `npm run db:deploy` | Apply pending migrations (`prisma migrate deploy`) |
| `npx prisma migrate status` | Show which migrations are applied |

## Routes

| Route | Behavior |
| --- | --- |
| `/dashboard` | Workspace overview: task statistics, monthly activity, status and priority distribution, project progress, review list, New task |
| `/dashboard/projects` | The user's projects with search, sorting, and Create Project |
| `/dashboard/projects/[projectId]` | One project: details, its tasks, Add task, Edit, Delete |
| `/dashboard/tasks` | The user's tasks with status and project filters, and Create Task |
| `/dashboard/tasks/board` | Kanban board: one column per status, drag and drop, filters, Create Task |
| `/dashboard/tasks/my` | Tasks assigned to the signed-in user |
| `/dashboard/tasks/[taskId]` | One task: details, Edit, Delete, comments, activity history |
| `/dashboard/templates` | Task templates: create, edit, duplicate, delete, and "Use template" |
| `/dashboard/calendar` | Tasks on their due dates: month, week, day and agenda views, scope and filters, New task |
| `/dashboard/reports` | Figures, breakdowns and a task list for a date range and filters, with CSV export |
| `/dashboard/teams` | The user's teams, invitations addressed to them, and Create Team |
| `/dashboard/teams/[teamId]` | Team overview: counts, the user's role, members preview, team projects |
| `/dashboard/teams/[teamId]/members` | Members, roles, removal; invitations (owner/admin) |
| `/dashboard/teams/[teamId]/settings` | Team name/description (owner/admin); delete team (owner) |
| `/dashboard/teams/invitations/[token]` | Where an invitation link lands: accept or decline |
| `/dashboard/settings` | Profile and picture, appearance and time zone, password, sessions, two-factor sign-in, account deletion |

All dashboard routes live under `app/dashboard/` and share `app/dashboard/layout.tsx`.

## Authentication and access control

Authentication uses NextAuth v4 with a Credentials provider (email + password, bcrypt hashes) and the JWT session strategy, configured in `auth.ts`.

Dashboard routes are protected twice:

1. **Middleware**: `middleware.ts` applies NextAuth middleware to `/dashboard/:path*` and redirects signed-out visitors to `/login?callbackUrl=<requested path>`.
2. **Server check**: `requireDashboardUser(callbackPath)` in `lib/dashboard.ts` calls `getServerSession(authOptions)`, requires a user ID, and redirects to login otherwise. The layout and every page call it.

After signing in, `/login` returns the user to `callbackUrl`. Only same-origin paths are accepted, so it can't be used as an open redirect.

**Session versions (signing out everywhere)**

`User.sessionVersion` (an integer, 0 for every account until its first password change) is written into the encrypted session token at sign-in. The `jwt` callback in `auth.ts` runs on every server-side session lookup, which every dashboard page (`requireDashboardUser`) and API route (`getSessionUserId`) goes through, and compares it with the account's current value (`getSessionVersion` in `lib/users.ts`, one small query, deduplicated per request). A token from an older version, or for an account that no longer exists, is emptied: the session then has no user, so pages redirect to login and APIs answer `401`, on every browser and device holding it. A password change raises the version, which is how it signs the account out everywhere. "Sign out other devices" and turning on two-factor sign-in raise it too, and in the same response re-issue the current browser's cookie with the new version (`lib/session-cookie.ts`), so only the other sessions end. Deleting an account ends all of its sessions, because a token for an account that doesn't exist is rejected. Tokens issued before this existed carry no version and count as 0, so existing logins survived the upgrade. If the database can't be reached for the check, the request is neither let in nor treated as signed out: see [database outages](#database-outages). The version is never put in the session the browser can read. The middleware only checks that the token is genuine; the version check happens on the server page or API.

**Authorization rules**

- The user's ID always comes from the server session. Any `ownerId`, `userId`, or similar value sent by the browser is ignored.
- Project access is defined once, in `lib/access.ts`: a personal project (`teamId` is null) is accessible to its `ownerId`; a team project is accessible to members of its team, whoever created it (its `ownerId` is only the creator, and is null once that account has been deleted). Editing or deleting a team project additionally requires the team's owner or admin role.
- Tasks have no owner column; access is derived through the task's project with the same rule. Any team member can create, edit, move, and delete tasks in a team project.
- A task in a team project can have an assignee, who must be a member of that project's team. Only the team's owner and admins can set, change, or clear it; the team is always taken from the task's project on the server (`checkAssignment` in `lib/tasks.ts`). Being the assignee grants no access by itself.
- Comments and activity use the task's access rule and nothing else: whoever can open the task can read them and add comments. A comment can be edited only by its author, and deleted by its author or, in a team task, by the team's owner or admins. Activity is written only by the server.
- Team operations check the session user's `TeamMember` row and role inside `lib/teams.ts`; the role rules live in `lib/team-validation.ts`.
- Requests for a task, project, or team the user has no access to get the same `404` as a missing one, so IDs can't be probed. A member whose role doesn't allow an action gets `403`.
- No credentials or password hashes are ever sent to dashboard components.

### Database outages

If PostgreSQL can't be reached, a session can't be verified. That is never treated as "signed in", and no longer as "signed out" either:

- **Dashboard pages** redirect to `/unavailable`, which says Taskwell is temporarily unavailable and that the user hasn't been signed out, with a "Try again" link (same-site paths only).
- **APIs** answer `503` with `Retry-After: 30` and one generic message. Every session-checking route is wrapped with `withSessionCheck` (`lib/api.ts`); a request with no session at all is still `401`.
- **Sign-in** reports "temporarily unavailable" instead of "Invalid email or password", and the attempt isn't counted as a failed password.
- No stack trace, SQL, connection string or credential is sent to the browser, and no authentication result is cached to get through an outage.

## Shared layout and navigation

`app/dashboard/layout.tsx` renders the authenticated shell:

- **Sidebar** (`Sidebar.tsx`), `lg` and up: sticky, full height, 260px wide. Taskwell brand link, the **Menu** section, and an **Others** section pinned to the bottom with Settings, a Dark mode switch, and the account card (avatar, name, email, logout).
- **Top bar**, below `lg`: a slim bar with the menu button, the brand link, the search button and the notification bell.
- **Command palette** (`CommandPalette.tsx`): rendered once by the layout; see below.
- **Mobile drawer** (`MobileDrawer.tsx`), below `lg`: the menu button opens the same sidebar as a slide-over drawer with a backdrop. It traps focus, closes with Escape or a backdrop click, restores focus, locks background scrolling, and closes on navigation or when the viewport grows to desktop size. A Create dialog opened from the drawer handles its own Escape and focus.
- **Content area**: centered, max width 1440px, responsive padding.
- **Skip link**: a keyboard-accessible "Skip to main content" link.

### Navigation

The menu is defined in `Sidebar.tsx`:

| Item | Children |
| --- | --- |
| Dashboard | — |
| Projects (expandable) | All projects, Create project (opens the project dialog) |
| Tasks (expandable) | All tasks, Task board, My tasks, Create task (opens the task dialog) |
| Templates | — |
| Calendar | — |
| Reports | — |
| Teams | — |
| Settings (under Others) | — |

A group opens automatically on its own routes. The current page is shown as a pill in the logo's blue (`brand`, `#2F6FED`), as are the selected option of the pill switches (task view, status filter, team sections, calendar view) and the current page number and marked with `aria-current="page"`. The layout loads the user's project options once for the sidebar's Create task dialog; if that query fails the dialog says so instead of breaking the page.

### Command palette

Ctrl+K (Windows/Linux) or Cmd+K (macOS) opens the palette from any dashboard page; the same shortcut closes it. It can also be opened with the **Search** button at the top of the sidebar (`lg` and up), which shows the shortcut, or the search icon in the top bar (below `lg`). The shortcut is registered by `CommandPaletteProvider`, which only the dashboard layout mounts, so it does nothing on the landing, login and signup pages. It is ignored while another dialog or the mobile drawer is open.

| Group | Items | Selecting one |
| --- | --- | --- |
| Recent | Up to 5 tasks, projects or teams last opened from the palette (shown while the field is empty) | Opens the record's page |
| Navigation | Dashboard, Projects, Tasks, My Tasks, Board, Templates, Calendar, Reports, Teams, Settings (`paletteNavItems` in `lib/navigation.ts`) | Client-side navigation; nothing is loaded when that page is already open |
| Actions | Create Task, Create Project | Opens the same `CreateTaskButton` / `CreateProjectButton` dialog as the sidebar, through the dialog's ref handle (`CreateDialogHandle`). There is no second form or endpoint |
| Tasks, Projects, Teams | Results of `GET /api/search`, up to 5 each | Opens `/dashboard/tasks/[taskId]`, `/dashboard/projects/[projectId]` or `/dashboard/teams/[teamId]` |

- **Typing** filters the commands by label and keywords (a label that starts with the text comes first). From 2 characters it also searches the server.
- **Requests** are debounced by 200 ms. Each query owns its request: a new keystroke or closing the palette cancels the timer and aborts the request, and a cancelled request never updates the list, so a slow answer to an older query can't replace newer results.
- **States**: "Searching...", results, "No tasks, projects or teams match", and an error message. A failure is never shown as an empty result: 503 reads "Search is temporarily unavailable", 401 "Your session has ended" with a Sign in link, a network failure "Unable to reach the server", anything else "We couldn't search right now". The text comes from the palette, not from the response body. Commands keep working in every state.
- **Keyboard**: Arrow Up/Down move the highlight and wrap, Enter selects, Escape closes, Home/End jump to the first/last row while the field is empty. Focus stays in the search field; Tab moves between the field and the close button and can't leave the dialog.
- **Dialog**: a native modal `<dialog>` like the Create dialogs, so the page behind is inert and focus returns to where it was on close. After a navigation, focus moves to the main content.
- **Accessibility**: the field is a `combobox` controlling a `listbox` with labelled `group`s and `option`s; the highlighted option is exposed with `aria-activedescendant` / `aria-selected`, and shown with a bar and an Enter mark as well as a tint. A polite live region announces searching, errors and the number of results.
- **Recent** is kept in `localStorage` under `taskwell-recent:<user id>`: kind, ID and name only. It is per browser and per account, isn't cleared on sign-out, and only records what was opened from the palette. An entry whose record was deleted or is no longer accessible leads to that page's normal "not found".
- The server sends records only (IDs and text). Links are built in the browser from the record's kind and ID; no URL from the response or from storage is followed.

### Pagination

Long lists are shown a page at a time with `Pagination.tsx`: what is shown ("26–50 of 129 tasks"), Previous and Next, and from `sm` up the page numbers (first, last, the current page and its neighbours); on phones "page 2 of 6" replaces the numbers. A list that fits one page shows no controls.

| Where | Page size | Page kept in |
| --- | --- | --- |
| Task list (`TasksView.tsx`): Tasks, My tasks, a project's tasks | 25 | The address (`?page=2`) |
| Projects grid (`ProjectsView.tsx`): Projects, a team's projects | 12 | The address (`?page=2`) |
| Each board column (`TaskBoard.tsx`) | 10 | The column, until the filters change or the page is left |
| Reports task table | 25 | The address; this one is paged by the server |

The lists are loaded and scoped to the user on the server as before; pages are cut from the filtered and sorted list in the browser, so filters, search and counts keep working over everything. Changing a filter, the search or the sort order returns to page 1. With the page in the address, a refresh and Back return to the same page; a page number past the end shows the last page. Changing page brings the top of the list back into view. A card dragged onto a board column lands in that column whichever of its pages is showing.

### Theme

Light/dark mode uses the application-wide theme: `ThemeToggle.tsx` toggles the `dark` class on `<html>` and stores the choice in `localStorage` under `taskwell-theme`. An inline script in `app/layout.tsx` applies the saved theme before first paint. The dashboard has no separate theme system; it only uses `dark:` Tailwind variants.

## Dashboard overview (`/dashboard`)

`app/dashboard/page.tsx` is a Server Component. It loads everything with `getDashboardOverview(user.id, scope)` from `lib/dashboard.ts`, which calls `getDashboardAnalytics` in `lib/analytics.ts`. Every number is database-backed; nothing is stored in a separate analytics table and nothing is estimated. It renders, top to bottom:

1. **Header**: "Dashboard" title and subtitle, the **Showing** scope selector (only when the user is in at least one team), and a **New task** button that opens the Create Task dialog.
2. **Statistic cards** (`StatCard.tsx`): Total tasks, In progress, In review, Completed. A user with no tasks sees real zeros.
3. **Monthly activity** (`ActivityChart.tsx`): tasks created and completed in each of the last 6 calendar months, as two bars per month with the number written on each bar (solid blue for created, striped green for completed), a legend, and the same numbers in a table for screen readers. With nothing in the range it shows "No activity to chart" instead of empty bars.
4. **Task status distribution** (`StatusDistribution.tsx`): a donut with the total in the centre and a legend with per-status counts. It uses the same status counts as the cards.
5. **Project progress** (`ProjectStats.tsx`): for the 6 projects with the most tasks, the number of tasks, how many are completed and the percentage, with a link to each project and to all projects. A project with no tasks says "No tasks", not 0%.
6. **Priority distribution** (`PriorityDistribution.tsx`): Low, Medium and High, each with its count and share.
7. **Task review list** (`TaskReviewList.tsx`): the 5 most recently updated tasks whose status is In review (task, project, assignee, priority, last updated), with the total and a link to the full task list.

**Scope**

`?scope=personal` counts only personal projects; `?scope=<teamId>` counts one team's projects; anything else is "All my work". The page resolves the parameter against the signed-in user's own memberships (`resolveAnalyticsScope`), so a team they aren't in, or any other value, falls back to "all". The time range is fixed.

**Data sources**

| Figure | Source |
| --- | --- |
| Status and priority counts | One `task.groupBy` on `(status, priority)` |
| Created per month | `Task.createdAt`, one count per month |
| Completed per month | Tasks that are Completed now, placed in the month of their latest `TASK_STATUS_CHANGED` activity with `to: COMPLETED` |
| Project progress | One `task.groupBy` on `(projectId, status)` plus the project names |
| Review list | Tasks with status `IN_REVIEW`, ordered by `updatedAt` |

All of these run together, a fixed number of queries however much data there is, and all filter on `projectAccessWhere(userId)` from `lib/access.ts` with the user ID from the session. A scope only narrows that filter. No schema change or migration was needed.

**Rules and limits of the monthly chart**

- Months are calendar months in UTC (the server can't know each viewer's time zone); the chart says so and names the range.
- "Created" counts tasks that still exist; a deleted task is no longer counted in the month it was created.
- "Completed" needs a recorded status change. A completed task without one (completed before activity history existed, or created with the status Completed) is not placed in any month; the chart reports them: "N completed tasks have no recorded completion date".
- A task that was reopened and is not completed now is not counted. A task completed more than once counts once, in the month of the latest completion.
- A task moved to another project or team counts where it is now.

**Failures and loading**

If the analytics queries fail, the cause is logged on the server and the cards show "No data yet" and each section says it is unavailable; the rest of the page still works. `app/dashboard/loading.tsx` shows a skeleton of the same layout.

## Projects (`/dashboard/projects`)

`app/dashboard/projects/page.tsx` is a Server Component that loads the user's projects with `listProjectsForOwner(user.id)`.

**Page contents**

- Header: "Projects", the description "Manage and organize your workspace projects.", and a **Create project** button.
- **Search**: filters the already-loaded projects by name or description, case-insensitively, in the browser (no request per keystroke). With no matches it shows "No projects found / Try a different search term." A screen-reader status announces the result count.
- **Sort**: Recently updated (default), Recently created, Name A–Z, Name Z–A (case-insensitive).
- **Project cards** (`ProjectsView.tsx`): name, description (or "No description"), created and updated dates, owner initials and name, **Edit** and **Delete** icon buttons, and an **Open** link to the project's detail page. Edit and Delete use the same dialogs as the detail page and update the list in place; the delete confirmation warns that the project's tasks are deleted with it.
- **Empty state**: "No projects yet / Create your first project to start organizing your work." with a Create project button.
- Layout: 3 columns on wide screens, 2 on tablets, 1 on phones.

**Creating a project**

`CreateProjectButton.tsx` is the only Create Project implementation; the page header, the empty state, and the sidebar all reuse it. It opens a native modal `<dialog>` with:

| Field | Rules |
| --- | --- |
| Project name | Required, trimmed, max 100 characters |
| Description | Optional, trimmed, max 500 characters |

The dialog validates with `lib/project-validation.ts` (the same rules the API uses), posts to `POST /api/projects`, and shows the server's message on failure. On success it closes and refreshes the list in place with `router.refresh()`, with no full page reload; when opened from another page it navigates to `/dashboard/projects`.

**Project detail (`/dashboard/projects/[projectId]`)**

`app/dashboard/projects/[projectId]/page.tsx` loads the project with `getProjectForOwner` and its tasks with `listTasksForProject`. A missing project and one owned by someone else both render the same "Project not found" state. The page shows the name, description (or "No description"), task count, owner, created and updated dates, a **Back to projects** link, and the project's tasks in the same table as the Tasks page (without the project filter and column), or "No tasks in this project yet".

- **Add task** opens the task dialog with this project preselected; the new task appears in place.
- **Edit** opens the same dialog as Create Project, prefilled, and saves with `PATCH /api/projects/:id`. The page refreshes in place.
- **Delete** opens a confirmation (`ConfirmDeleteButton.tsx`) that names the project and states how many tasks are deleted with it, then calls `DELETE /api/projects/:id`. The database removes the tasks through the `Project → Task` cascade. On success the user is sent to `/dashboard/projects`; on failure the dialog stays open with the error.

## Tasks (`/dashboard/tasks`)

`app/dashboard/tasks/page.tsx` is a Server Component that loads, in parallel, the user's tasks (`listTasksForOwner`) and the user's projects (`listProjectOptionsForOwner`, for the dialog and the filter).

**Page contents**

- Header: "Tasks", the description "Track the work across your projects and where each task stands.", and a **Create task** button.
- **Status filter**: All, To do, In progress, In review, Completed, shown as a pill group with live counts. The buttons use `aria-pressed`.
- **Project filter**: "All projects" or any one of the user's projects. The status counts update to match the selected project.
- **Task table** (`TasksView.tsx`): Task (title, linking to the task's detail page, + description), Project, Status badge, Priority badge, Created, Updated, and **Edit** / **Delete** icon buttons per row (the same dialogs as the task detail page; the list and counts update in place). Ordered by most recently updated. On narrow screens the table scrolls horizontally inside its card; the page itself does not overflow.
- **No matches**: "No tasks match these filters / Try a different status or project." with a **Clear filters** button.
- **Empty state**: "No tasks yet" with a Create task button. If the user has no projects, it explains that a project is needed first.

Filtering happens in the browser on tasks the server has already scoped to the user.

**Creating a task**

`CreateTaskButton.tsx` is the only Create Task implementation; the page header, the empty state, the sidebar, and the overview's New task button reuse it. It is built like the Create Project dialog:

| Field | Rules |
| --- | --- |
| Title | Required, trimmed, max 200 characters |
| Description | Optional, trimmed, max 2000 characters |
| Project | Required; lists only the user's own projects (preselected if there is exactly one) |
| Status | To do (default), In progress, In review, Completed |
| Priority | Low, Medium (default), High |

Validation runs in the dialog and again on the server (`lib/task-validation.ts`), and the server also checks that the chosen project belongs to the user. On success the dialog closes and the list refreshes in place; from another page it navigates to `/dashboard/tasks`. If the user has no projects, the dialog explains this and offers a **Go to projects** link instead of the form.

**Task detail (`/dashboard/tasks/[taskId]`)**

`app/dashboard/tasks/[taskId]/page.tsx` loads the task with `getTaskById`, which only finds tasks in the session user's projects. A missing task and one owned by someone else both render the same "Task not found" state. The page shows the title, description (or "No description"), project (linked), status, priority, created and updated dates, and a **Back to tasks** link.

- **Edit** opens the same dialog as Create Task, prefilled (title, description, project, status, priority), validates with the same rules, and saves with `PATCH /api/tasks/:id`. The page refreshes in place.
- **Delete** opens a confirmation that names the task, then calls `DELETE /api/tasks/:id`. On success the user is sent to `/dashboard/tasks`; on failure the task is kept and the dialog shows the error.

After any create, edit, or delete the dialogs call `router.refresh()`, which re-renders the current page from the database and discards cached copies of the other dashboard pages, so lists, filters, and the overview counts stay accurate.

**Task board (`/dashboard/tasks/board`)**

`app/dashboard/tasks/board/page.tsx` loads the same two queries as the list (`listTasksForOwner`, `listProjectOptionsForOwner`) and renders `TaskBoard.tsx`. The **List / Board** switch (`TaskViewSwitch.tsx`) in the header of both pages moves between the two views.

- **Columns**: To do, In progress, In review, Completed, each with a status dot, title, and task count.
- **Cards**: title (links to the task detail page), project, priority badge, updated date, and a **Move to** select.
- **Moving a task**: drag a card onto another column, or use its Move to select (the keyboard and touch alternative). The card moves immediately, the status is saved with `PATCH /api/tasks/:id` (`{ "status": ... }`), and the card is disabled while saving. If saving fails the card returns to its previous column and an error is shown; if the task no longer exists the board reloads. Successful moves are announced to screen readers.
- **Filters**: title search, project, and priority, applied in the browser. A move only ever updates the one task acted on, so filtered-out tasks are never changed.
- **Create task** reuses `CreateTaskButton.tsx`; the new task appears in the column for its status.
- **Layout**: four columns from `xl`, two per row from `md`, and a horizontally scrolling row of columns on phones.

**Assignment**

Tasks in **team projects** can be assigned to one member of that project's team; tasks in personal projects can't be assigned and don't show the field.

- **Who can assign**: the team's owner and admins. Members see the assignee but can't change it.
- **Where**: the Assignee picker on the task detail page (`AssigneeSelect.tsx`, saves immediately through `PATCH /api/tasks/:id`), and the Assignee field in the Create/Edit Task dialog, which appears when the chosen project is a team project the user can assign in and lists only that team's members.
- **Where it shows**: an Assignee column in the task list, the assignee on each board card, and the detail page ("Unassigned" when there is none).
- **Filters**: the task list and the board have an Assignee filter: All assignees, Unassigned, or any member of the teams whose projects are in scope (the selected project's team, or the teams of all listed projects), including members with no tasks. Personal projects add nobody. The members come from one query limited to the signed-in user's own teams (`listTeamMembersByTeam`). On the list it combines with the status and project filters, and the status counts follow it.
- **Moving a task to another project**: the assignee is kept only if they are a member of the new project's team; otherwise the server clears it. Moving to a personal project always clears it.
- **Removing a member** (or a member leaving) unassigns their tasks in that team's projects in the same transaction; the tasks stay. Changing a member's role keeps their assignments. If a user account is deleted, their tasks become unassigned (`onDelete: SetNull`).
- **My tasks** (`/dashboard/tasks/my`): the tasks assigned to the signed-in user (always the session user), in the same table. The List / Board / My tasks switch links the three views.
- **Team workload**: the team overview lists each member's assigned and completed task counts for that team's projects, from one grouped query (`getTeamWorkload`).

The people a user may assign to are loaded once in the dashboard layout (`listAssignableMembersByTeam`) and shared through `AssignmentContext.tsx`. That only decides what the UI offers; the API rejects any assignee who isn't in the project's team.

**Comments and activity**

The task detail page has two sections under the task's details.

- **Comments** (`TaskComments.tsx`): the latest 50, oldest first, with **Load earlier comments** for older ones (50 at a time); the heading shows the total. Each has the author, a relative time ("Just now", "5 minutes ago", "Yesterday"; the exact time is in the tooltip), and "edited" when it was changed. Anyone who can open the task can add a comment (required, trimmed, up to 2000 characters). Authors can edit their own comment inline (Save / Cancel) and delete it after a confirmation. In team tasks the team's owner and admins can also delete other people's comments, but nobody can edit someone else's.
- **Activity** (`TaskActivity.tsx`): the latest 50 events, newest first, with **Load older activity** (50 at a time), as sentences such as "Olivia changed status from To do to In progress", "assigned this task to Sarah", "moved this task to Website", "added a comment".

Activity is recorded by the data layer in the same transaction as the change it describes, with the actor taken from the session; there is no endpoint that accepts an activity. One event is written per kind of change that actually happened (saving without changing anything writes nothing):

| Type | Recorded when | Metadata |
| --- | --- | --- |
| `TASK_CREATED` | A task is created | — |
| `TASK_UPDATED` | Title or description changes | `{ fields }` |
| `TASK_STATUS_CHANGED` | Status changes (edit, board, API) | `{ from, to }` |
| `TASK_PRIORITY_CHANGED` | Priority changes | `{ from, to }` |
| `TASK_PROJECT_CHANGED` | The task moves to another project | `{ fromProjectId, toProjectId }` |
| `TASK_ASSIGNEE_CHANGED` | Assigned, reassigned, unassigned, including the automatic unassignment when a task changes team or its assignee is removed from the team | `{ fromUserId, toUserId }` |
| `TASK_DUE_DATE_CHANGED` | The due date of an existing task is set, changed or removed. Saving the same instant (however it is written) records nothing, and creating a task with a due date records only `TASK_CREATED`. | `{ from, to }` (ISO instants; `null` = no due date) |
| `SUBTASK_ADDED` | Recorded on the **parent** when a subtask is created under it or an existing task is attached | `{ subtaskId }` |
| `SUBTASK_REMOVED` | Recorded on the parent when a subtask is detached, or deleted (`deleted: true`) | `{ subtaskId, deleted? }` |
| `DEPENDENCY_ADDED` | Recorded on **both** tasks; each history words it from its own side ("blocked by …" / "blocking …") | `{ blockerTaskId, blockedTaskId }` |
| `DEPENDENCY_REMOVED` | Recorded on both tasks when a dependency is removed, or on the surviving task when the other one is deleted (`deleted: true`) | `{ blockerTaskId, blockedTaskId, deleted? }` |
| `RECURRENCE_CREATED` | A schedule is saved on a task that had none, or a switched-off one is turned back on ("set this task to repeat every week on Monday") | The rule: `{ frequency, interval, weekdays, monthDay, startDate, endDate, occurrenceLimit }` |
| `RECURRENCE_UPDATED` | An active schedule is changed. Saving the same schedule again records nothing. | The new rule, as above |
| `RECURRENCE_DISABLED` | Repeating is turned off. Turning off what is already off records nothing. | — |
| `RECURRENCE_GENERATED` | Completing a repeating task created the next occurrence. Recorded once on **each** of the two tasks; on the new one it takes the place of `TASK_CREATED`. | `{ fromTaskId, toTaskId }` |
| `TASK_LABELS_ADDED` / `TASK_LABELS_REMOVED` | Labels are put on or taken off a task: one record of each kind per request, also for the labels a move to another workspace takes off. Not recorded for labels chosen at creation, nor on each task when a label is deleted. | `{ labelIds }` |
| `TIME_ENTRY_ADDED` | A timer is stopped, or a time entry is added by hand (`manual: true`). Starting a timer records nothing | `{ entryId, seconds, manual? }` |
| `TIME_ENTRY_UPDATED` | A time entry's start or length is changed (not its note) | `{ entryId, seconds }` |
| `TIME_ENTRY_DELETED` | A finished time entry is deleted. Discarding one's own running timer records nothing | `{ entryId, seconds, authorId }` |
| `ATTACHMENT_ADDED` | A file is attached. The file's name is looked up when the history is read; once the file is deleted it reads "a file that has since been removed" | `{ attachmentId }` |
| `ATTACHMENT_DELETED` | An attachment is deleted | `{ attachmentId, authorId }` |
| `COMMENT_ADDED` / `COMMENT_UPDATED` | A comment is added or edited | `{ commentId }` |
| `COMMENT_DELETED` | A comment is deleted | `{ commentId, authorId }` |

Metadata holds IDs, enum values and due-date instants only, never comment text. Names are looked up when the history is read, and a project's name is shown only if the viewer can access that project. Deleting a task deletes its comments and activity.

- **Older tasks**: a task created before activity history existed has no events, and none are invented. Its Activity section says "This task was created before activity history was enabled" until something changes.
- **Paging**: both lists use an opaque cursor (`nextCursor`, passed back as `?before=`) that encodes only the position of the oldest loaded item, so it keeps working if that item is deleted. The task access check runs on every page; a cursor grants nothing. Items that slide out of the latest page when new ones arrive stay on screen, so the loaded list never has a gap (`useOlderPages.ts`).
- **Moved tasks**: comments and history belong to the task and move with it. Whoever can open the task now can read all of them, including comments written while it was in another project; people who lose access to the task lose access to its comments, including their own. There is no per-comment visibility.
- **Deleted accounts**: activity is an audit trail and is kept. `Activity.actorId` becomes null (`onDelete: SetNull`) and the event reads "Deleted user"; a deleted assignee is shown as "a former member". The deleted user's own comments are removed with the account (`Comment.author` is `onDelete: Cascade`).

**Badges** (`TaskBadges.tsx`)

| Status | Color |
| --- | --- |
| To do | Accent (`#F2A93B`) |
| In progress | Brand (`#2F6FED`) |
| In review | Violet (`#8B5CF6`) |
| Completed | Emerald (`#10B981`) |

Priority badges: Low is neutral, Medium uses the brand tint, High uses red. The status colors are shared with the dashboard donut chart.

### Subtasks

A subtask is an ordinary task whose `parentTaskId` points at another task. It has its own status, priority, assignee, due date, comments and history, appears in the task list, on the board, on the calendar, in search and in reports like any task, and is counted once everywhere.

- **One level.** A parent is always a top-level task: a subtask can't have subtasks, and a task that has subtasks can't become one. A task can't be its own parent.
- **Same project.** A subtask lives in its parent's project. The Add subtask dialog has no project field, and `POST /api/tasks/:id/subtasks` takes the project from the parent whatever the body says.
- **Server-side rules.** All of the above is decided in `lib/tasks.ts` (`checkParent`, and again under a per-project lock just before the write), for the session user. The database adds two last-resort guards: a CHECK that a task isn't its own parent, and the foreign key described under deletion.
- **Progress is derived.** "3 of 5 completed" is counted from the subtasks' statuses each time a task is read (`Task.subtasks`: `{ total, completed }`). Nothing is stored, so it can't go stale.
- **The parent is never completed automatically.** Completing every subtask changes no status but theirs.

On a top-level task's page the **Subtasks** card (`TaskSubtasks.tsx`) shows the progress sentence and bar and, per subtask, a checkbox, the title (a link to its own page), status, priority, assignee (team projects), due date with the overdue label, Edit and Delete. Ticking the box sets the status to Completed and unticking to To do, through the ordinary `PATCH /api/tasks/:id`, so it is recorded in the subtask's history. The tick shows at once and is taken back with a message if the server refuses. **Add subtask** and **Edit** open the existing task dialog (`CreateTaskButton.tsx` with `parent`, or with a task that has one).

A subtask's own page starts with "Subtask of …", linking back to the parent, and **Detach from parent**, which makes it a top-level task again without deleting anything (`PATCH` with `parentTaskId: null`). An existing top-level task without subtasks can be attached through the API the same way (`parentTaskId: "<id>"`); there is no UI for attaching.

In the task list a parent's row shows "2 of 5 subtasks completed" and a subtask's row "Subtask of …"; board cards show the same two lines.

### Dependencies

A dependency is a directional link between two tasks of the same project, stored as one `TaskDependency` row: **blocker → blocked**. "A blocks B" and "B is blocked by A" are the same row seen from either task. The **Dependencies** card on every task page (`TaskDependencies.tsx`) lists **Blocked by** and **Blocks**, each task linking to its page with its status, a Remove button per dependency, and a form to add one (this task "Is blocked by" / "Blocks" + a task of the same project).

- **Planning only.** There is no Blocked status, and a dependency never prevents or causes a status change. A blocked task can be started or completed.
- **Rules** (`lib/dependencies.ts`, all server-side): not the same task; both in one project; both accessible to the session user; not a duplicate; no cycle.
- **Cycle prevention.** Adding "X blocks Y" would close a loop exactly when Y already blocks X, directly or through any number of tasks. Before inserting, the server loads the project's dependency edges in one query and walks them breadth-first from Y, visiting each task once, so the check ends on any graph and catches loops of any length (A → B → C → A). The check and the insert run in one transaction under a per-project advisory lock (`lockProjectRelations`), so two simultaneous requests can't each add half of a loop. Duplicates and cycles answer 409.

### Moving and deleting tasks with relationships

Subtasks and dependencies never cross projects, and nothing is detached or deleted on the user's behalf:

| Action | Result |
| --- | --- |
| Move a subtask to another project | Refused (409): detach it first. Detaching and moving in one request works. |
| Move a task that has subtasks or dependencies | Refused (409): remove them first |
| Delete a task that has subtasks | Refused (409): delete or detach the subtasks first. The delete dialog says so before asking. The parent foreign key is `ON DELETE NO ACTION`, so the database refuses it too. |
| Delete a subtask | Deleted like any task; the parent's history records "deleted a subtask" |
| Delete a task with dependencies | Its dependency rows go with it (`ON DELETE CASCADE` on both sides), and each task at the other end records it in its history. No dependency row can point at a missing task. |
| Delete a project or a team | Its tasks, subtasks and dependencies all go in the same statement |
| Delete an account | Its personal projects go as above. Team projects it created stay with the team, with their subtasks and dependencies; tasks assigned to it are unassigned; its entries in task histories stay as "Deleted user". |

### Labels

A label (tag) has a **name** and a **color** and can be put on any number of tasks; a task can carry up to 20. The data layer is `lib/labels.ts`, the shared rules `lib/label-rules.ts`.

**Workspaces (scope).** A label belongs to exactly one workspace:

| Workspace | Stored as | Used on | Who sees and assigns it | Who can create | Who can rename, recolor, delete |
| --- | --- | --- | --- | --- | --- |
| Personal | `Label.ownerId` | Tasks in that person's personal projects | The owner only | The owner | The owner |
| Team | `Label.teamId` | Tasks in any of that team's projects | Every member | Every member | The team's owner and admins |

A task can only carry labels of **its own project's workspace**. The workspace is always worked out on the server from the task's project (`scopeOfProject`), never taken from the request; a label from any other workspace is answered exactly like one that doesn't exist (`404 Label not found.`). A team project whose creator's account is gone is still the team's workspace.

- **Names**: 1–40 characters, trimmed, inner white space collapsed, no control characters. Unique within a workspace regardless of case and width forms (`nameKey`), so "Bug", "bug " and "ＢＵＧ" are one label; the same name may exist in a personal workspace and in a team.
- **Colors**: one of nine palette keys (`gray`, `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `purple`, `pink`). No free-form color is accepted, so nothing a user types ever reaches a style. Chips always write the name out; color is never the only signal.
- **Limits**: 100 labels per workspace, 20 per task (409 beyond either).

**On tasks.**

- Adding and removing one label at a time (`POST` / `DELETE /api/tasks/:id/labels`) is atomic per label, so two people labelling the same task don't undo each other. Replacing the whole set (`PUT …/labels`, or `labelIds` in `POST` / `PATCH /api/tasks`) goes through `updateTask` in the same transaction as the other fields.
- Editing, completing or reopening a task leaves its labels alone. A subtask has its own labels.
- **Moving** a task to another project keeps the labels that exist in the destination's workspace (another project of the same team, or another personal project of the same owner) and takes the others off, recorded with the move; this is the same rule as an assignee from another team. Moving and choosing destination labels in one request works.
- **Recurring tasks**: the next occurrence carries the same labels as the one just completed (it is in the same project, so the same workspace), together with its reminders as before.
- **Deleting a label** takes it off every task (`ON DELETE CASCADE` on the link); the tasks, their other labels, their Updated dates and their histories are untouched. Deleting a task removes its links, not the labels. Deleting a team or (for personal labels) an account removes its labels.
- Label changes move the task's Updated date and are recorded in its history as `TASK_LABELS_ADDED` / `TASK_LABELS_REMOVED`, one record per request listing the label IDs. Names and colors are looked up when the history is read; a label that has since been deleted reads "a label that has since been deleted". Labels create **no notifications**.
- Concurrency: changes to one task's labels and moves of that task take a per-task advisory lock (`lockTaskLabels`), so a label can't be added while the task moves to a workspace where it doesn't belong, and the 20-label limit can't be passed by simultaneous requests. Duplicate names are refused by the unique indexes even when created at the same instant.

**Where labels show.**

- **Task page**: a Labels section in the task card (between the description and the details) with the chips and **Edit labels**, which opens the picker in place; each tick is saved at once and taken back with the reason if the server refuses.
- **Label picker** (`LabelPicker.tsx`, also in the Create / Edit Task dialog): a search box over the workspace's labels, a checkbox per label, and, when the typed text isn't an existing label, a "New label" row with the nine colors and **Create label** (or Enter). The label is created in the task's workspace and ticked, without leaving the task. In the dialog the list follows the chosen project, and choices that don't exist in a newly chosen project's workspace are dropped.
- **Task list, My tasks, project page, board**: chips under the title, and a **label filter** (`LabelFilter.tsx`): a button that opens a panel with a search box, a checkbox per label and how several combine — **Any of them** (a task with at least one selected label, OR; the default) or **All of them** (a task with every selected label, AND). Like the other filters it works in the browser on tasks already loaded for the user; the status counts, the result announcement, "Clear filters" and pagination follow it. On a project's page only that project's workspace is offered. Two labels with the same name from different workspaces each say whose they are.
- **Manage labels** (`ManageLabels.tsx`, a button beside the filter on the task list and the board): every label the user can use, grouped by workspace with the number of tasks on each; a form to add one (name, workspace, color); and per label, for those allowed, Edit (rename and recolor in place) and Delete (asks first and says how many tasks lose it).
- **Search** (command palette, `/api/search`): a word also matches a task by one of its labels' names. Results keep their shape.
- **Calendar and Reports** are unchanged: labelled tasks appear and are counted as before, and neither has a label filter or column.

### Recurring tasks

A repeating task is an ordinary task plus one `TaskRecurrence` row (its **schedule**). The schedule holds only the rule; the title, project, assignee and the rest stay on the task and are never duplicated. The rule engine is `lib/recurrence-rules.ts` (no server imports, shared with the forms) and the database side is `lib/recurrence.ts`.

**Supported rules**

| Rule | Options | Example |
| --- | --- | --- |
| Daily | every 1–99 days | "every 3 days" |
| Weekly | every 1–99 weeks, on one or more weekdays (ISO numbers, 1 = Monday … 7 = Sunday). Left out, the start date's weekday. Weeks run Monday to Sunday, as on the calendar. | "every 2 weeks on Monday and Thursday" |
| Monthly | every 1–99 months, on day 1–31. Left out, the start date's day. A month with fewer days uses its last day, and the next longer month goes back to the chosen day (31 Jan → 28 Feb → 31 Mar → 30 Apr). | "every month on day 31 (or the month's last day)" |

Every rule also has a **start date** (required; no occurrence falls before it and the interval is counted from it), an optional **end date** (inclusive) and an optional **occurrence limit** (1–999, the first task included). With both, the series stops at whichever comes first.

**When the next occurrence is created.** At exactly one moment: when the task that holds the schedule changes to **Completed** (the Edit dialog, the board, or any `PATCH` with `status: "COMPLETED"`), inside the same database transaction as the status change. Nothing is created ahead of time and there is no background job, so a series has **one open occurrence at a time**. The new task:

- copies the title, description, priority and project, and the assignee if that person is still a member of the project's team (otherwise it is unassigned);
- starts as To do and is top-level;
- is due on the next scheduled day (below);
- does **not** get the old task's subtasks, dependencies, comments or history.

The schedule row then **moves** to the new task (`occurrenceCount` + 1). The completed task is from then on a plain task: reopening and completing it again creates nothing.

**Which day is next.** The first day on the schedule's grid after the completed task's due date, whose due moment is still in the future. So finishing early gives the day after the task's own due date (not today), and finishing late skips the days that have already gone by rather than creating a pile of overdue tasks. If the task has no due date, it is the first scheduled day still ahead. No next occurrence is created when that day would be after the end date, when the occurrence limit is reached, or when repeating is switched off; the last task then keeps its schedule and its card reads "None: this is the last one".

**Duplicate protection.** Generation is idempotent, by three independent means:

1. The schedule belongs to one task (`TaskRecurrence.taskId` is unique) and moves in the same transaction that creates the next task, with a conditional update that only succeeds if it is still on the completed task. A second attempt finds no schedule there.
2. `Task.recurredFromId` (the occurrence a generated task follows) is **unique in the database**, so a task can be followed by at most one generated task no matter how the requests interleave.
3. The status update takes the task's row lock first, so concurrent completions of the same task queue up; the loser of a race is answered with the task as it now is (200), never an error.

Twelve simultaneous completions of one task produce one next occurrence (tested on both servers).

**Time zones and daylight saving.** A schedule has its own IANA zone: the saver's zone from Settings, or, when they have none saved, the zone their browser sends with the request (a schedule with neither is refused; nothing is assumed). Start and end dates are calendar days in that zone, stored as `DATE`. The time of day (`dueTime`, "HH:MM", or null for a date without a time) is taken from the task's own due date and follows it when the task's due time is edited. All arithmetic is on calendar days; a day only becomes an instant at the end, through the Phase 16 helpers in `lib/calendar-dates.ts`, so:

- "daily at 09:00" is 09:00 on the zone's clock on every day, 23 or 25 hours after the previous one across a clock change, never a fixed 24 hours;
- a date without a time stays one (the last second of that local day);
- a time that doesn't exist on a spring-forward day moves to the same time after the jump on that day only, and the next day is back at the stored time (the time is stored on the schedule, so it can't drift);
- a time that happens twice on a fall-back day is the first of the two;
- the day is the schedule zone's day, whatever the UTC date is (00:30 in Karachi and 23:30 in Los Angeles both work).

**Subtasks and dependencies.** Only a **top-level** task can repeat. Saving a schedule on a subtask, creating a subtask with one, and making a repeating task a subtask are each refused with 409 (a task with a switched-off schedule may become a subtask). When a repeating parent is completed, its **subtasks stay with the completed occurrence** and the next one starts with none; **dependencies are not copied** either. The new task is an ordinary top-level task and can be given subtasks and dependencies of its own. This is deliberate: copying a task graph would mean guessing which statuses, assignees and links to reset.

**Turning it off, deleting, moving.**

| Action | Result |
| --- | --- |
| Disable recurrence (`DELETE …/recurrence`, or Repeat: Never in the Edit dialog) | The schedule is kept but switched off (`active = false`). Completing the task creates nothing. Saving the schedule again turns it back on. |
| Delete the task that holds the schedule | The schedule row is deleted with it (`ON DELETE CASCADE`), which ends the series. Earlier occurrences stay as plain tasks. |
| Delete an earlier, completed occurrence | The open occurrence keeps repeating; its `recurredFromId` becomes null (`ON DELETE SET NULL`). |
| Delete the project, team or (for personal projects) account | Tasks and schedules go together; no schedule can exist without its task. |
| Move the repeating task to another project | The schedule goes with it and the next occurrence is created in the new project. |
| A completed task | Can't be given a schedule (409); reopen it first. Setting a schedule and completing in one `PATCH` is allowed and creates the next occurrence. |

**Where it shows.**

- **Create / Edit Task dialog** (`RecurrenceFields.tsx` inside `CreateTaskButton.tsx`): a **Repeat** select (Never, Daily, Weekly, Monthly) and, once one is chosen, Every *n*, the weekday buttons (weekly), Day of the month (monthly), Starts, Ends and Stop after, with a live sentence such as "Repeats every 2 weeks on Monday and Thursday". The start date defaults to the due date in the form, or today. A new task sends the schedule with `POST /api/tasks`; an edit sends `recurrence` only if the section was touched (`null` for Never), in the same `PATCH` as the other fields. Subtask dialogs don't have the section.
- **Task page** (`TaskRecurrence.tsx`): a **Repeat** card between the task and its subtasks with the sentence, the next occurrence's due date, start, end, "Occurrence 2 of 10", the zone, **Edit recurrence** (a dialog with the same fields) and **Disable recurrence**. A subtask's page has no card; a completed task's card explains why it can't be set up.
- **Calendar, lists, board, search**: every occurrence is a normal task and appears like one. Nothing there was changed.
- **Reports**: counted once each like any task. In the task table an occurrence of a series reads "Repeating task" under its title, and the CSV has a **Repeating** column (Yes/No). A task counts as repeating when it holds an active schedule or was generated from another task.
- **Notifications**: a generated task with an assignee sends the existing "assigned to you" notification, unless the assignee is the person who completed the previous one. Nothing else is notified.

### Task templates (`/dashboard/templates`)

A template is a reusable set of **starting values** for a task. The data layer is `lib/task-templates.ts`, the shared rules `lib/template-rules.ts`.

| A template holds | Rules |
| --- | --- |
| Name | 1–100 characters, unique within its workspace regardless of case and spacing (`nameKey`, as for labels). It is the new task's title unless another is given when the template is used |
| Description, status, priority | The same values and limits as a task. Status defaults to To do, priority to Medium |
| Due-date offset (`dueOffsetDays`) | 0–365 days after the day the task is created, or none. 0 is the same day |
| Assignee | Team templates only: a member of that team, set by its owner or an admin (the task rule) |
| Labels | Up to 20 labels of the template's own workspace |
| Subtasks | Up to 20 titles, in order |

A template holds **no** dependencies, reminders, repeat schedule, comments or history. Dependencies link existing tasks of one project, which a template doesn't have, so they are not represented; reminders and a schedule can be chosen in the task dialog when the template is used.

**Workspaces and permissions** are those of labels:

| Workspace | Stored as | Who sees, uses and duplicates it | Who can create | Who can edit and delete |
| --- | --- | --- | --- | --- |
| Personal | `TaskTemplate.ownerId` | The owner only | The owner | The owner |
| Team | `TaskTemplate.teamId` | Every member | Every member | The team's owner and admins |

A template never changes workspace. One the caller can't see is answered exactly like one that doesn't exist (`404 Template not found.`); a member who may see but not change a team's template gets `403`. At most 100 templates per workspace.

**Creating a task from a template** (`createTaskFromTemplate`). The user chooses the destination project, which can be any project they can create tasks in, whatever workspace the template is from. The task is then created by `createTask`, the same function as every new task, for the session user:

- It is a new, independent task: fresh IDs, its own history starting with "created this task", the usual "assigned to you" notification when it gets an assignee. **Nothing links it to the template**, so editing or deleting a template never changes a task, and no template-specific activity or notification type exists.
- **Only what is valid in the destination is used.** Labels: those that exist in the destination project's workspace (so a personal template's labels are left out of a team project, and a team's labels out of any other workspace). Assignee: applied only if that person is a member of the destination project's team *and* the user may assign there (owner or admin); otherwise the task starts unassigned. The response's `skipped` says what was left out, and the "Use template" dialog says it beforehand.
- **Due date**: `dueOffsetDays` calendar days after today **in the user's saved time zone** (Settings), as a date without a time (the end of that day), through `lib/calendar-dates.ts`, so a clock change in between never moves it to another day. With no saved zone the zone sent with the request is used; with neither the request is refused (400) rather than guessed.
- **Subtasks** are created with the task in one transaction (all or nothing), in the template's order, as ordinary subtasks of the new task in the same project: To do, Medium, unassigned, each with its own "created" record, and each recorded on the parent as "added a subtask". Subtasks are one level deep and belong to the new task only, so no cycle or cross-project relationship can arise.
- A request may also give any ordinary task field (`title`, `description`, `status`, `priority`, `assigneeId`, `dueDate`, `labelIds`, `recurrence`, `reminders`). A given field replaces the template's value and is then checked exactly as in `POST /api/tasks` (a label of another workspace is 404, an assignee the user may not set is 403), not silently dropped. IDs, owners and a parent in the body are ignored.
- A template being edited or deleted, or one of its labels being deleted, while it is used can't produce half a task: the template is read as one snapshot, and a label that disappears between the read and the write is left out on a second attempt.

**When a reference goes away.** Deleting a label takes it off the templates that had it. Removing a member from a team clears them as the default assignee of that team's templates (and the assignee is checked again on every use); deleting an account does the same (`ON DELETE SET NULL`) and deletes its personal templates. Deleting a team deletes its templates. None of this touches a task.

**Where it shows.**

- **Templates page** (`TemplatesView.tsx`): a card per template with its workspace, description, status, priority, labels, due date, subtask count and (team templates) assignee, and the actions **Use template** (`UseTemplateButton.tsx`: task title and project; then opens the new task), **Edit** and **Delete** (owner / admins; delete asks first and says existing tasks are kept), and **Duplicate** (a copy named "… (copy)" in the same workspace; the assignee is copied only if the user could have set it).
- **Create / edit template dialog** (`TemplateFormButton.tsx`): name, workspace (new templates only), description, status, priority, "Due after (days)", assignee (team templates, owner / admins), the workspace's labels, and an ordered subtask list with Add, Move up / down and Remove; Enter in a subtask starts the next one.
- **Create Task dialog** (`CreateTaskButton.tsx`): a **Template** select at the top of a new task's form (not when editing, not for a subtask). Choosing one fills in the form, which stays fully editable; saving then creates the task from the template with the form's values, so the template only adds its subtasks.
- **Sidebar and command palette**: a Templates link.

### Time tracking

Every task (subtasks included) has a **Time tracking** card on its page (`TaskTimeTracking.tsx`). The data layer is `lib/time-tracking.ts`, the shared rules `lib/time-rules.ts`.

- **Entries.** A `TaskTimeEntry` is one person's stretch of time on one task: a start, an end, a length in seconds, an optional note. It is made by the **timer** or **added by hand** ("Add time": date, start time, hours and minutes, note).
- **One timer per person.** The entry with no end is its owner's running timer. Starting on a task where it already runs changes nothing; starting on another task stops the first (keeping its time) and starts the new one. The database enforces it with a partial unique index (one row per user without an end); the server also serialises each user's timer changes with a lock, so simultaneous starts and stops leave exactly one result.
- **Durations are worked out on the server.** A timer's start and end are the server's clock; a manual entry's end is its start plus its minutes. An end, a duration or a user sent by the browser is ignored. The running clock on the page counts from the server's start time and corrects for a wrong browser clock; it needs no request while it runs.
- **Limits.** One entry is 1 minute to 24 hours when entered by hand and can't end in the future. A timer left running is closed at 24 hours when it is finally stopped.
- **Time zones.** Entries are instants. "Add time" reads the date and time in the account's zone (Settings), through `lib/calendar-dates.ts`; a length is elapsed time, so an entry across midnight or a clock change is as long as it really was.
- **Who can do what.** Whoever can open the task can track time on it and sees everyone's entries and the task's total. An entry can be **edited only by the person it belongs to** and **deleted by them or, in a team task, by the team's owner and admins** (the rule comments follow). A running timer is stopped, not edited; deleting one's own running timer discards it. A task or entry outside the caller's reach is the same 404 as a missing one.
- **Totals.** The card's total is all finished entries of the task. A subtask's time is its own and is not added to its parent.
- **What never carries time over.** A repeating task's next occurrence and a task created from a template start with no entries. A timer still running on a just-completed occurrence keeps running there until it is stopped.
- **History and notifications.** Stopping a timer or adding time records "tracked 1h 30m" / "logged 1h 30m"; changing or deleting an entry is recorded too. Starting a timer records nothing, and time tracking never creates a notification. Time entries don't change a task's Updated date.
- **Leaving a team** stops that person's timer if it is running on one of the team's tasks; the time so far is kept. Deleting a task deletes its entries; deleting an account deletes that person's entries.
- **Reports.** The summary has **Time tracked in range**, the task table a **Time tracked** column and the CSV a last column **Time tracked (h:mm)**: finished entries on the matching tasks, counted only for the part that falls inside the report's range (in the report's time zone), so a session over midnight is split between the two days and never counted twice. Running timers are not counted.

### Attachments

Every task (subtasks included) has an **Attachments** card on its page (`TaskAttachments.tsx`): attach a file, see the list (name, size, who attached it, when), open or download, delete. The data layer is `lib/attachments.ts`, the disk storage `lib/attachment-store.ts`, the shared rules `lib/attachment-rules.ts`.

- **Storage.** Files are kept on the server's disk in `storage/attachments`, beside the avatars and outside `public/` (the `attachment-data` Docker volume in the container), each under a random UUID the server generates. Nothing from the upload (name, type, path) is ever part of a path, and a file is only ever sent by the attachment API after the task's access check; there is no static URL for it. The database row holds the display name, the size, the type, the storage key and the content's SHA-256 hash; the key and the hash never leave the server.
- **What can be attached.** Images (PNG, JPG, GIF, WebP), PDF, text (TXT, MD, CSV, JSON), Word, Excel, PowerPoint and ZIP, from 1 byte to 10 MB, up to 20 files per task. The type is decided by the **server** from the extension and then checked against the file's first bytes (text must be valid UTF-8 with no NUL bytes); the type the browser sends is ignored. Anything a browser could run (HTML, SVG, scripts, executables) is refused, as is a file whose contents don't match its extension.
- **Names** are cleaned before they are stored: only the last path segment, no control or bidirectional-override characters, no characters a file system or header can't hold, at most 200 characters (the extension is kept).
- **Duplicates.** The same content can't be attached to one task twice, whatever it is called (a unique index on task + hash, which also settles simultaneous uploads). The same file may be on different tasks; each has its own copy.
- **Downloading.** `Content-Type` is the stored type, with `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox` and `Cache-Control: private, no-store`. Images may be shown in a new tab; every other type, PDFs included, is always a download.
- **Who can do what.** Whoever can open the task can list, download and attach. A file can be **deleted by the person who attached it or, in a team task, by the team's owner and admins** (the rule comments and time entries follow). A task or attachment outside the caller's reach, and an attachment addressed through a different task, is the same 404 as a missing one.
- **Files follow their task and nothing else.** An attachment is never copied: a repeating task's next occurrence and a task created from a template start with none. Moving a task to another project takes its files along.
- **Deleting.** Deleting an attachment removes the row and then the file. Deleting a task, a project, a team or (for personal projects) an account removes the rows by cascade and the server then removes the files. A file attached to a team task by an account that is later deleted stays with the task, shown as "Deleted user". When the server starts it also removes stored files that have had no row for over an hour (what a crash mid-upload could leave).
- **History and notifications.** Attaching and deleting are recorded in the task's history; no notification is created. Attachments don't change a task's Updated date.

## Calendar (`/dashboard/calendar`)

The calendar places tasks on their due dates. It shows only tasks that have a due date, from projects the signed-in user can access; nothing on it is sample data.

**Due dates.** A task has one optional `dueDate`, set in the existing Create/Edit task dialog (`CreateTaskButton.tsx`) with a date field and an optional time field, and shown on the task page as **Due**. Anyone who can edit the task can change it; there is no separate permission and no second form.

- With a time, the due date is that minute.
- Without a time, it is stored as the last second of that day (23:59:59) in the time zone it was entered in. No extra column records which kind it is: a due date that reads 23:59:59 in the viewer's zone is shown as a date with no time ("Any time" on the calendar); anything else is shown with its time. A date-only task set by someone in another zone therefore appears to you as a time, which is the real deadline in your zone.
- The dialog only sends the due date when the user changes it, so saving another field never alters it.

**Time zone.** Days, times, "today" and every range boundary use the account's time zone from Settings (`User.timeZone`). When none is saved, the browser's zone is used. `TimeZoneContext.tsx` provides it to the calendar, the task dialog, the task page and the activity list, and to the shared `FormattedDate` and `RelativeTime` components, so created, updated, comment, activity and notification times use the same zone; `lib/calendar-dates.ts` does the arithmetic through `Intl`, so daylight-saving changes follow the zone's own rules (a day can be 23 or 25 hours long). The database keeps plain UTC instants.

**Overdue** is derived, never stored: a task is overdue when its due instant has passed and its status isn't Completed. It is shown as a written "Overdue" label with an icon. No status is changed, nothing is saved, and no activity is recorded. Completed tasks stay on the calendar, struck through.

**Views** (`CalendarView.tsx`). Weeks run Monday to Sunday.

| View | Shows |
| --- | --- |
| Month | A grid of whole weeks, including the neighbouring months' days. Up to three tasks per day, then "+N more", which opens that day. On phones a cell shows the day and a count (with "!" when something is overdue) and opens the day when tapped. |
| Week | Seven columns from 1280px; below that the same week as a list of days. Tasks are ordered by time, date-only ones last. |
| Day | One day's tasks with time, project, status, priority and (for team projects) assignee. |
| Agenda | The 30 days from the selected day, grouped by date; days with nothing due are left out. |

Today, Previous and Next move by the view's own period. Clicking a task opens the existing task page (`/dashboard/tasks/[taskId]`). The view, day and filters are kept in the address (`?view=week&date=2026-10-05&scope=team…`), so Back from a task returns to the same place; the address only restores what was shown and the API checks every value again.

**New task** opens the existing task dialog. In the Day view the selected day is offered as the due date; the new task appears in place.

**Scope and filters.** "Showing" chooses All my work, Personal projects, All team projects, or one team (listed when the user is in more than one). Project, Assignee (Anyone, Assigned to me, Unassigned, or a member of the teams in scope), Status and Priority narrow it further. All of them are applied in the database query; on phones they sit behind a Filters button.

**Data.** The page loads only the options for the filters. Tasks come from `GET /api/calendar` for the visible range only, in one query (see the API reference). A range returns at most 500 tasks and says so when there were more.

## Reports (`/dashboard/reports`)

Reports answers "how is the work going?" for a date range and a set of filters, and exports the tasks behind the figures as CSV. Every number is counted from the database when the page asks for it (`lib/reports.ts`); nothing is stored, estimated or sample data. The page (`ReportsView.tsx`) loads only the filter options with the page itself and gets everything else from the three report endpoints (see the API reference).

**Two kinds of selection.** They are deliberately separate:

- The **filters** choose which tasks the report is about, as those tasks are now: Scope (All my work, Personal projects, Team projects), Team (all of the user's teams, or one), Project, Assignee (Anyone, Assigned to me, Unassigned, or a member of the teams in scope), Status and Priority. They are ANDed together and applied in the database queries, never in the browser. A user with no teams sees only Project, Status and Priority, since scope and assignee would have nothing to choose between.
- The **date range** chooses which of those tasks' dates count: Today, Last 7 days, Last 30 days (the default), This month (the whole calendar month), Last month, or a custom range of up to 366 days.

Statuses and priorities are the existing ones (To do, In progress, In review, Completed; Low, Medium, High). There is no "Urgent" priority in Taskwell's data model, so the report doesn't offer one.

**Date semantics.** A range is whole calendar days, first to last inclusive, in the report's time zone. It becomes the half-open interval from the first instant of the first day to the first instant of the day after the last, so a day is as long as that zone's clocks make it (23 or 25 hours when they change). The conversion reuses `lib/calendar-dates.ts`; `lib/report-dates.ts` adds the presets and the trend periods. Four things are measured against the range, and they are different questions with different answers:

| Figure | Counts matching tasks whose… |
| --- | --- |
| Created in range | `createdAt` is in the range. Only tasks that still exist can be counted. |
| Completed in range | status is Completed now and whose latest recorded change to Completed is in the range. A task completed in the range, reopened and completed again later counts on the later date. |
| Due in range | `dueDate` is in the range, whether open or completed. Tasks without a due date never count. |
| Activity | history entries (`Activity` rows: changes and comments) recorded in the range on matching tasks. |

A task has no completion column: its completion date is its latest `TASK_STATUS_CHANGED` activity to Completed, the same rule the dashboard chart uses (`movedToCompleted` in `lib/analytics.ts`). A completed task with no such record (completed before task history existed, or created as Completed) can't be dated; the report states how many there are instead of guessing.

**Time zone.** The account's saved time zone (Settings) always decides the days. When none is saved, the page sends the browser's zone as `tz` and the server uses that; a direct API call with neither gets UTC. The response names the zone it used and the page shows it next to the range. No zone is hard-coded.

**Metric definitions** (the summary cards):

| Metric | Calculation |
| --- | --- |
| Total tasks | Tasks matching the filters, whatever their dates |
| Open tasks | Of those, the ones whose status isn't Completed, as of now |
| Overdue tasks | Open tasks whose due date is before the moment the report was generated |
| Created / Completed / Due in range | As in the table above |
| Completion rate | Completed in range ÷ tasks that were open at some point in the range. "Open during the range" means created before the range ended and either not completed now, or last completed in or after the range. Completed tasks with no recorded completion date are left out of both sides. Shown as "No data yet" when no task was open in the range. |
| Average completion time | Mean time from `createdAt` to the completion date, over the tasks completed in the range. For a reopened task this spans up to its last completion. Shown as "No data yet" when nothing was completed. |

**Breakdowns** cover all matching tasks as they are now; the date range doesn't narrow them, because a task's past status, priority or assignee isn't recorded in a form that could be counted reliably.

- **Status** and **Priority**: count and share per value (`StatusDistribution.tsx` and `PriorityDistribution.tsx`, shared with the dashboard).
- **Assignee**: tasks in team projects per assignee, with open and completed counts, then "Unassigned". Only people who are assigned a task the viewer can see are named. Personal-project tasks can't be assigned, so they are counted separately in a note. At most 20 people are listed; the rest are summed. Deleting an account unassigns its tasks, so they move to "Unassigned" rather than disappearing.
- **Project**: total, completed, open, overdue and completion rate (completed ÷ total) for each project with at least one matching task, at most 50, most tasks first.
- **Activity over time** (`ReportTrend.tsx`): created and completed per day (ranges up to 31 days), per Monday-to-Sunday week (up to 183 days) or per calendar month, in the report's time zone, as the same CSS bars as the dashboard chart. The same numbers plus the activity count are in a table anyone can open under the chart. If a range holds more than 10,000 rows for a series the trend is left out, with a note, rather than drawn from part of the data; the totals stay exact.

**Task table.** Below the figures: title, project, status, priority, assignee, due date, created date and completion date, 25 per page. "Tasks to list" chooses all matching tasks or those created, completed or due in the range. A title links to the existing task page. Descriptions and comments are never loaded.

**Export.** "Export CSV" downloads the task table's whole selection (all pages, same filters and list) through `GET /api/reports/export`. See CSV safety in the API reference. There is no PDF export: the project has no PDF library, and adding one (plus embedded fonts for non-Latin names) for a second copy of what the page already prints was judged out of proportion.

**Address.** The range, filters, list and page are kept in the query string (`?range=7d&scope=team&team=…&status=COMPLETED&list=completed&page=2`), so a refresh or a shared link restores the report and Back/Forward step through the changes. Unknown or invalid values fall back to the defaults. The address only restores what was shown; the API checks every value again against the session.

**Access.** The report uses `projectAccessWhere` for the session user, like every other task query: personal projects are owner-only, team projects follow team membership, and a team project whose creator's account was deleted (`ownerId` null) is still reported to its team. A team, project or person named in the request that the user can't reach is refused with 404 rather than answered with an empty report.

## Teams (`/dashboard/teams`)

A team shares projects, and the tasks in them, between its members. Personal projects are unaffected by teams.

**Roles**

| Role | Can do |
| --- | --- |
| Owner | Everything: edit and delete the team, invite, change roles, remove members, create/edit/delete team projects. Exactly one per team (the creator). Can't leave or be removed, because ownership transfer doesn't exist yet. |
| Admin | Edit team details, invite, promote or remove **members**, create/edit/delete team projects. Can't change or remove the owner or other admins, and can't delete the team. |
| Member | View the team, its members and projects; create, edit, move, and delete tasks in team projects. Can leave the team. |

**Pages**

- **Teams list**: team cards (name, description, your role, member and project counts), **Create team**, and "Invitations for you" with Accept / Decline for invitations addressed to your account's email.
- **Team overview**: counts, your role, a members preview, and the team's projects (the same cards as the Projects page). Owners and admins get **Create project**, preselected to this team.
- **Members**: name, email, role, joined date (a table from `md` up; stacked rows without sideways scrolling on phones). Depending on your role: a role picker, **Remove** (with confirmation), or **Leave**. Owners and admins also get the invite form and the pending invitations list with **Cancel**.
- **Settings** (owner/admin): name and description. Owners also get **Delete team**, which requires typing the team's name and lists what is removed: memberships, invitations, team projects, and their tasks (all through `onDelete: Cascade`).

**Invitations**

Creating an invitation (email + role, Member by default) stores a random 256-bit token that expires after 7 days, then emails the invited address a link to it (see [Notifications and email](#notifications-and-email)). The inviter is told whether the email went out and is also shown the link once, as a fallback to pass on themselves. The pending list shows "Emailed <date>" or "Email not sent" for each invitation, with **Resend email** / **Send email**. The invited person can use the link, or simply open their Teams page while signed in with that email address; someone without an account is taken through sign-up and back to the invitation. Accepting creates the membership and marks the invitation used in one transaction; declining or cancelling deletes it. An invitation only works for the account whose email it was created for, and can't be reused once accepted or after it expires. Tokens never appear in member or invitation listings, or in notifications.

**Team projects**

The Create project dialog has a "Belongs to" choice (Personal, or any team where you're owner or admin). Project cards show a Personal or team badge, and the Projects page can be filtered by Personal or by team. For a team project `ownerId` is the creator; access comes from team membership, so the project stays with the team if its creator leaves.

## Notifications and email

**In-app notifications**

A bell sits beside the logo in the sidebar (and in the top bar below `lg`), with a badge for the unread count. It opens a panel with the latest 20 notifications, newest first, **Load older notifications**, a per-item **Mark as read**, and **Mark all as read**. Clicking a notification marks it read and opens what it is about.

| Type | Created when | Recipient | Opens |
| --- | --- | --- | --- |
| `TASK_ASSIGNED` | An owner or admin assigns a team task to someone (on create or edit) | The new assignee | The task |
| `COMMENT_ADDED` | A comment is added to a team task | The task's assignee and the project's creator | The task's comments |
| `COMMENT_MENTION` | A comment contains `@Name` | Each person named who can open the task | The task's comments |
| `TEAM_INVITATION` | An invitation is created for an address that already has an account | That account | The Teams page (the team itself once accepted) |
| `TASK_REMINDER` | A reminder's time comes (see Reminders) | The person who set the reminder | The task |

Rules, all decided on the server (`lib/tasks.ts`, `lib/comments.ts`, `lib/teams.ts`), in the same transaction as the change:

- Nobody is notified about their own action (`notificationRows` in `lib/notifications.ts` drops the actor).
- Assignment: only a deliberate assignment to a person notifies. Unassigning, saving without changing the assignee, and the automatic clearing on a project move or member removal create nothing. Personal tasks can't be assigned, so they never notify.
- Comments: a person who is mentioned gets the mention notification instead of the plain comment one. Recipients must be current members of the task's team; a project creator who has left the team gets nothing. Personal tasks notify nobody. Editing a comment creates no notifications; deleting it removes them.
- Recipients are never taken from the request. There is no endpoint that creates a notification.
- A notification stores references only (recipient, actor, task, comment, invitation), never text or a token. Names and titles are looked up when the list is read, and a task notification is hidden (from the list and the count) once its recipient can no longer open that task. Deleting the task, comment or invitation deletes its notifications; a deleted actor shows as "A deleted user".

**Mentions**

Comments stay plain text. `@` followed by a teammate's full name mentions them (case doesn't matter; the longest matching name wins; an `@` inside a word, such as an email address, is ignored). The comment box suggests the other people who can open the task after `@` (arrow keys, Enter/Tab to insert, Escape to dismiss); that list is only a typing aid. The server resolves mentions itself against the task's team (`findMentions` in `lib/mentions.ts`), so a name outside that audience mentions nobody. Two members with the same name are both notified. Mentions in existing comments are emphasised when they match a current member.

**Live updates (no reload)**

A notification that is created while Taskwell is open shows up by itself: the badge changes, and if the panel is open the new row appears in it. This is done by polling, not WebSockets (`NotificationsProvider` in `Notifications.tsx`):

- The dashboard layout renders the first count with the page. After that the browser asks `GET /api/notifications/unread-count` every **10 seconds** while the tab is visible. The answer is `{ count, latestId }`: the unread count and the ID of the newest notification the user can see.
- When either value differs from the last answer, the badge is updated and, if a panel is open, the newest page of the list is fetched again and laid over what is shown. Rows are matched by ID, so nothing is listed twice; older pages already loaded stay below; there is no "Loading..." flash and the panel stays open where it is. A new arrival is also announced in a polite live region ("New notification. 3 unread.").
- **Tab hidden**: nothing is requested. **Tab visible again**, the browser coming back **online**, and **navigation** each check at once (never more often than every 3 seconds).
- **Failures** (offline, a timeout, a 503 during a database outage, an answer that isn't the expected JSON): nothing changes on screen and no error is shown; the last known count stays. The wait before the next try doubles each time (10 s, 20 s, 40 s, 60 s at most) and returns to 10 s on the first success, at which point the badge and list catch up. Answers that arrive out of order are ignored. A 401 (signed out) stops the checks. A background refresh of the open list that fails leaves the list as it was.
- Worst case from "created" to "on screen" is one poll interval, about 10 seconds; a reminder adds up to one scheduler tick before that (below).

This covers every type the same way, because the poll only looks at the notification table: assignments, comments, mentions, team invitations and reminders.

**Reminders**

A reminder is "notify me N before this task is due". It is **personal**: it belongs to the user who set it, only they can see, change or remove it, and only they are notified. Two people can each have their own reminders on the same team task. Reminders are not part of a task's history and don't change its Updated date.

- **Times**: 5 minutes, 15 minutes, 30 minutes, 1 hour or 1 day before the due date (`REMINDER_OFFSETS` in `lib/reminder-rules.ts`); one of each per person per task at most.
- **Storage**: one `TaskReminder` row per reminder (`taskId`, `userId`, `minutesBefore`, `timeZone`, `remindAt`, `processedAt`). `remindAt` is the instant it fires and is stored, so the scheduler can find due reminders with an index.
- **Time zone and DST**: offsets under a day are exact elapsed time. "1 day before" is a calendar day in the reminder's zone: the same time on the clock the day before, which is 23 or 25 hours earlier across a clock change. The zone is the user's saved zone from Settings; if they have none, the zone their browser sends with the request; if neither, exactly 24 hours (no zone is ever assumed). A due date without a time is the last second of its day, so its reminders count back from there.
- **Which tasks**: a new reminder needs a task that isn't completed and has a due date that hasn't passed (409 otherwise). Subtasks can have reminders like any task.
- **Due-date changes**: when a task's due date changes (by anyone), every reminder on it moves with it and is armed again, so it fires once for the new time. Removing the due date leaves the reminders waiting; setting one again schedules them. Moving the due date into the past marks them done without sending anything.
- **Recurring tasks**: reminders belong to the current occurrence. When completing a repeating task creates the next one, each person's reminders are copied to it as new rows, scheduled from the new due date and not yet sent. The completed occurrence keeps its own rows, which are never sent again.

**Delivery** (`lib/reminders.ts` → `processDueReminders`, run by `lib/reminder-scheduler.ts`)

There was no worker or cron in the project, so the scheduler is a timer inside the server process, started once from `instrumentation.ts` when the server boots (`next dev`, `next start`, and therefore the Docker image; `experimental.instrumentationHook` is on in `next.config.mjs`). Every 20 seconds (`REMINDER_POLL_MS`, minimum 1000) it runs one step:

1. In one transaction, claim the reminders with `processedAt IS NULL AND remindAt <= now()` using `FOR UPDATE SKIP LOCKED` (up to 200) and set `processedAt` in the same statement.
2. Of those, keep the ones whose task is not completed, still has a due date, and can still be opened by the reminder's owner (`projectAccessWhere`, the same rule as everywhere else).
3. Insert one `TASK_REMINDER` notification for each, in that same transaction.

What that guarantees:

- **Nothing lives in memory.** What is due and what has been sent is in PostgreSQL. After a restart or a database outage, overdue reminders go out on the first successful tick.
- **No duplicates.** Two processes (or the scheduler and the endpoint below) can never claim the same row; a reminder is never marked without its notification or the reverse; and `Notification.reminderKey` (`"<reminder id>:<fire time>"`) is unique in the database, so even a repeated run could not notify twice for the same moment. A reminder fires again only if its time changed (a new due date or offset).
- **Not sent**: reminders of completed tasks, of tasks the owner can no longer open (left the team), and of tasks without a due date are marked done without a notification. Deleting a task deletes its reminders. A reminder passed over this way is not sent later if the task is reopened.
- **Outages**: a failing tick is logged once per outage (`[reminders] Could not process reminders (database unavailable)`), then again when it recovers; the server keeps running.

`POST /api/reminders/process` runs the same step for the **caller's own** due reminders only, for anyone who wants theirs sent without waiting for the tick; it is not needed for delivery. Set `REMINDER_SCHEDULER=off` to run a process without the timer.

**Where reminders show**

- **Create / Edit Task dialog**: a "Remind me" group of five checkboxes. A new task sends the ticked ones with `POST /api/tasks` (`reminders: [15, 60]`); an edit sends them only if the group was touched, in the same `PATCH` as the other fields, replacing the user's own set.
- **Task page** (`TaskReminders.tsx`): a **Reminders** card after Repeat, on subtasks too, listing the reader's reminders with when each fires ("Scheduled for Oct 31, 2026, 9:00 AM", "Its time has passed", "Waiting for a due date"), a Remove button each, and a select plus **Add reminder**. On a completed task or one without a due date the card says why nothing can be added.
- **Notification panel**: "Reminder: *task* is due *date and time*", with the task's current due date in the reader's zone and nobody named as the actor. Clicking it opens the task and marks it read; unread, mark-as-read and mark-all-as-read work as for any notification.

**Invitation email**

Sent through [Resend](https://resend.com)'s HTTP API with a server-side `fetch` (`lib/email.ts`); no package is added. Configuration, all server-only:

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | Sender, e.g. `Taskwell <invites@example.com>`, on a domain verified in Resend |
| `NEXTAUTH_URL` | Base of the invitation link in the email |
| `RESEND_API_URL` | Optional, tests only: point the sender at a local stand-in instead of `https://api.resend.com` |

The email (`lib/invitation-email.ts`) has an HTML and a plain-text part: who invited you to which team and as what role, an **Accept invitation** button, the same link as text, the expiry date, the note that it only works for that email address, and a line about ignoring it if unexpected. Names are HTML-escaped.

The invitation is saved first, then the email is attempted. If the provider rejects it, can't be reached within 10 seconds, or the variables are missing, the invitation stays valid, the API answers `emailSent: false` with a message, and the form says the email was not sent. **Resend email** sends the same invitation again (same link, same expiry, no new invitation or notification), at most once a minute, and not once it has expired. Provider errors are logged on the server without the key, the token, or the email body.


## Settings (`/dashboard/settings`)

Everything here acts on the signed-in account only; the account is never taken from the URL or the request body. On wide screens the page is two columns (Profile and Security on the left, Account and Appearance on the right); below `xl` it is one column.

**Email changes are not supported. The account email is read-only.** It is shown in Profile and Account, and typed only to confirm account deletion.

### Profile

- **Picture** (`AvatarPicker.tsx`, `UserAvatar.tsx`): upload an image, pick one of 10 built-in avatars, or use initials (the default). Each choice saves immediately.
- **Name** (`ProfileForm.tsx`): trimmed, required, at most 100 characters (rejected with a message, never cut short; the fields have no `maxLength` so nothing is clipped silently). The dashboard reads the name from the database, so a new name shows everywhere without signing in again. An existing name longer than 100 characters is left alone until its owner edits it.
- **Email**: read-only.

**Avatar storage**

- Uploads are JPG, PNG or WebP up to 2 MB. The type is decided from the file's bytes with `sharp`, not from its name or MIME type; SVG, GIF and anything that doesn't decode as an image are rejected.
- Every upload is re-encoded: turned upright, cropped to a 256px square, saved as WebP. Re-encoding removes EXIF and all other metadata (including GPS location).
- Files are written to `storage/avatars/` (outside `public/`, ignored by Git and by the Docker build) under a random server-generated name (`<uuid>.webp`). The database stores only `User.avatarType` (`INITIALS`, `PRESET`, `UPLOAD`) and `User.avatarKey` (the built-in ID or that file name). Nothing from the request is ever used as a path, and every read or delete checks the name against a strict pattern, so no other file can be reached.
- In Docker the folder is the named volume `avatar-data` (mounted at `/app/storage/avatars`), so pictures survive rebuilding or recreating the app container. Back it up with the database.
- Replacing or removing a picture deletes the old file; deleting the account deletes its file.
- Pictures are not public. `GET /api/avatars/<file>` serves one only to its owner and to people who share a team with them; everyone else gets 404 and signed-out requests 401. Where a picture can't be loaded (for example a former teammate's), initials are shown instead.
- Avatars appear in the sidebar, Settings, comments, task assignees, activity, project cards and member lists.

### Appearance

- **Dark mode**: the same switch as the sidebar (`ThemeToggle`), stored under the existing `taskwell-theme` key in this browser.
- **Time zone** (`TimeZoneForm.tsx`): a searchable field over the server's IANA time zone list (`Intl.supportedValuesOf("timeZone")` plus `UTC`); offsets such as `+05:00` are not accepted. Stored in the nullable `User.timeZone`. For now it is used for the "Member since" date in Settings; dashboard analytics still count calendar months in UTC. Notifications, reminders and other date displays can use this preference later.

### Security

- **Change password** (`PasswordForm.tsx`): current password, new password (at least 8 characters, the same rule as sign-up) and confirmation. On success every session of the account ends, including this one.
- **Sign out other devices** (`SignOutOthersButton.tsx`): after a confirmation, ends every other session while this browser stays signed in (see [session versions](#authentication-and-access-control)).
- **Two-factor sign-in** (`TwoFactorSection.tsx`, `lib/two-factor.ts`): see below.

**Two-factor sign-in (TOTP)**

- Works with any authenticator app (RFC 6238: SHA-1, 6 digits, 30 seconds), implemented on Node's `crypto`; `qrcode` draws the setup QR code.
- Setup: the server creates a secret and returns it once, as a QR code and a key for manual entry. It is turned on only after a valid code is entered. Turning it on signs out the account's other devices (this browser stays signed in) and shows 10 recovery codes, once.
- The secret is stored encrypted with AES-256-GCM under `TWO_FACTOR_ENCRYPTION_KEY` (32 random bytes, base64 or hex; server-only; not derived from `AUTH_SECRET`). Recovery codes are stored only as SHA-256 hashes and each works once. No endpoint returns the secret or the codes again, and none of them is logged.
- **Do not change `TWO_FACTOR_ENCRYPTION_KEY` once accounts use 2FA.** Their secrets could no longer be decrypted and those users could only sign in with a recovery code. Rotating it needs a planned re-encryption of every stored secret (or asking users to set 2FA up again); there is no tool for that yet. Without the variable, 2FA can't be turned on and Settings says so.
- Signing in: after the correct password, an account with 2FA is asked for a code (or a recovery code) on a second step. The password is kept in memory for that step, never in the URL.
- Turning it off needs the password and a valid code or recovery code; the secret and all recovery codes are then deleted.
- 5 wrong codes for an account within 15 minutes block further code attempts (sign-in, setup, turning off) for the rest of that window.

### Account

- Name, email and the date the account was created ("Member since", shown in the chosen time zone).
- **Delete account** (`DeleteAccountSection.tsx`, `lib/account-deletion.ts`): see below.

**Account deletion policy**

Confirmation needs the exact account email, the current password and, with 2FA on, a code. The account is always the session's.

| Related data | What happens |
| --- | --- |
| Teams the user owns | Deletion is refused and the teams are listed. Ownership can't be transferred, so they must be deleted first. |
| Team memberships | Removed. |
| Personal projects | Deleted, with their tasks, comments, activity and notifications. |
| Team projects the user created | Kept for the team. `Project.ownerId` becomes null and the creator shows as "Deleted user". |
| Tasks assigned to the user | Kept and unassigned; their history stays. |
| The user's comments | Deleted (as since Phase 9). |
| Activity the user caused | Kept, shown as "Deleted user". |
| Notifications | The user's own are deleted; ones they caused are kept without an actor. |
| Invitations to the user's email | Deleted. |
| Avatar file, 2FA secret, recovery codes | Deleted. |
| Sessions | Every token is rejected afterwards, on every device. |

A database CHECK constraint (`Project_personal_has_owner`) guarantees a personal project always has an owner, so an account can't be removed while it still has personal projects; the deletion code removes them first, in the same transaction.

### Throttles

After 5 failures for one key within 15 minutes, further attempts get `429` with `Retry-After` until 15 minutes after the first failure. A success clears the count; malformed requests don't count.

| Throttle | Key | Covers |
| --- | --- | --- |
| Sign-in | Normalised email | Wrong passwords at login. Unknown emails are counted exactly like real ones and refused in the same time (a dummy hash is compared), so neither the limit nor the timing reveals whether an account exists. The message stays "Invalid email or password". |
| Current password | User ID | Change password and delete account. |
| Two-factor codes | User ID | Wrong codes at sign-in, during setup and when turning 2FA off. |

These are in-memory, per-process throttles (`lib/password-throttle.ts`): a restart resets them and several instances of the app don't share them. A distributed rate limiter would be preferable in production.

**Names everywhere**: sign-up, `/api/register` and Settings share one rule, `validateName` in `lib/account-validation.ts` (trimmed, required, at most 100 characters).

## Data model

Defined in `prisma/schema.prisma`:

```prisma
model User {
  id           String    @id @default(uuid())
  name         String
  email        String    @unique
  passwordHash String
  createdAt    DateTime  @default(now())
  projects     Project[]
  teamMemberships TeamMember[]
}

enum TeamRole {
  OWNER
  ADMIN
  MEMBER
}

model Team {
  id          String   @id @default(uuid())
  name        String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  memberships TeamMember[]
  invitations TeamInvitation[]
  projects    Project[]

  @@index([createdAt])
}

model TeamMember {
  id        String   @id @default(uuid())
  teamId    String
  userId    String
  role      TeamRole @default(MEMBER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  team      Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([teamId, userId])
  @@index([teamId])
  @@index([userId])
}

model TeamInvitation {
  id         String    @id @default(uuid())
  teamId     String
  email      String
  role       TeamRole  @default(MEMBER)
  token      String    @unique
  expiresAt  DateTime
  acceptedAt DateTime?
  createdAt  DateTime  @default(now())
  team       Team      @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@index([teamId])
  @@index([email])
  @@index([expiresAt])
}

model Project {
  id          String   @id @default(uuid())
  name        String
  description String?
  ownerId     String
  owner       User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  teamId      String?  // null = personal project
  team        Team?    @relation(fields: [teamId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  tasks       Task[]

  @@index([ownerId])
  @@index([teamId])
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  IN_REVIEW
  COMPLETED
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH
}

model Task {
  id          String       @id @default(uuid())
  title       String
  description String?
  status      TaskStatus   @default(TODO)
  priority    TaskPriority @default(MEDIUM)
  projectId   String
  project     Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  assigneeId  String?      // optional; a member of the project's team
  assignee    User?        @relation(fields: [assigneeId], references: [id], onDelete: SetNull)
  dueDate     DateTime?    // optional deadline, a UTC instant (see Calendar)
  parentTaskId String?     // null = top-level; otherwise a top-level task of the same project
  parentTask  Task?        @relation("Subtasks", fields: [parentTaskId], references: [id], onDelete: NoAction)
  subtasks    Task[]       @relation("Subtasks")
  blockedBy   TaskDependency[] @relation("BlockedTask")
  blocking    TaskDependency[] @relation("BlockerTask")
  recurredFromId String?   @unique // the occurrence this task was generated after; unique = one successor at most
  recurredFrom   Task?     @relation("Occurrences", fields: [recurredFromId], references: [id], onDelete: SetNull)
  nextOccurrence Task?     @relation("Occurrences")
  recurrence     TaskRecurrence? // the schedule, while this task is the series' open occurrence
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@index([projectId, status])
  @@index([assigneeId])
  @@index([dueDate])       // the calendar reads by due-date range
  @@index([parentTaskId])  // a task's subtasks and their progress
}

// "blocker blocks blocked"; both tasks are in the same project and the edges never form a cycle.
model TaskDependency {
  id            String   @id @default(uuid())
  blockerTaskId String
  blockedTaskId String
  createdAt     DateTime @default(now())
  blocker       Task     @relation("BlockerTask", fields: [blockerTaskId], references: [id], onDelete: Cascade)
  blocked       Task     @relation("BlockedTask", fields: [blockedTaskId], references: [id], onDelete: Cascade)

  @@unique([blockerTaskId, blockedTaskId])  // no duplicates; also serves "what does this task block"
  @@index([blockedTaskId])                  // "what is this task blocked by"
}

enum RecurrenceFrequency {
  DAILY
  WEEKLY
  MONTHLY
}

// A repeat schedule: belongs to one task at a time and moves to each new occurrence.
model TaskRecurrence {
  id              String              @id @default(uuid())
  taskId          String              @unique
  frequency       RecurrenceFrequency
  interval        Int                 @default(1)   // every N days / weeks / months, counted from startDate
  weekdays        Int[]                             // WEEKLY: ISO weekdays 1 (Mon) - 7 (Sun); empty otherwise
  monthDay        Int?                              // MONTHLY: 1-31, a shorter month uses its last day
  startDate       DateTime            @db.Date      // calendar days in timeZone
  endDate         DateTime?           @db.Date      // inclusive
  occurrenceLimit Int?                              // most occurrences, the first included
  occurrenceCount Int                 @default(1)   // occurrences so far, this task included
  dueTime         String?                           // "HH:MM" on timeZone's clock; null = a date without a time
  timeZone        String                            // IANA zone
  active          Boolean             @default(true)
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  task            Task                @relation(fields: [taskId], references: [id], onDelete: Cascade)
}
```

- **User → Project**: one-to-many. Deleting a user deletes their projects.
- **Project → Task**: one-to-many. Deleting a project deletes its tasks, so no orphaned tasks remain.
- **Task → Task (subtasks)**: one level, same project. `NoAction` rather than `Restrict`, so deleting a whole project removes parents and subtasks together while deleting just a parent fails. A CHECK constraint (`Task_not_own_parent`) stops a task being its own parent.
- **TaskDependency**: deleting either task deletes the row. A CHECK constraint (`TaskDependency_not_self`) stops a task depending on itself. That both tasks share a project, and that there is no cycle, is enforced in `lib/dependencies.ts`.
- **Label** and **TaskLabel** (`prisma/schema.prisma`): `Label` has `name`, `nameKey`, `color` and exactly one of `ownerId` / `teamId` (CHECK `Label_one_workspace`), both `ON DELETE CASCADE`. Unique on `(ownerId, nameKey)` and on `(teamId, nameKey)`; rows of the other kind hold NULL there, which never collides. CHECKs also keep `color` inside the palette and the name between 1 and 40 characters. `TaskLabel` is the link, primary key `(taskId, labelId)`, indexed on `labelId`, `ON DELETE CASCADE` to both. That a task's labels are of its project's workspace is enforced in `lib/labels.ts` and `lib/tasks.ts`.
- **TaskTemplate**, **TaskTemplateLabel**, **TaskTemplateSubtask** (`prisma/schema.prisma`): `TaskTemplate` has `name`, `nameKey`, `description?`, `status`, `priority`, `dueOffsetDays?`, `assigneeId?` (`ON DELETE SET NULL`, indexed) and exactly one of `ownerId` / `teamId` (CHECK `TaskTemplate_one_workspace`, both `ON DELETE CASCADE`). Unique on `(ownerId, nameKey)` and on `(teamId, nameKey)`. CHECKs keep the name between 1 and 100 characters, the description within 2000, `dueOffsetDays` within 0–365, and a personal template without an assignee. `TaskTemplateLabel` is the link to `Label`, primary key `(templateId, labelId)`, indexed on `labelId`, `ON DELETE CASCADE` to both. `TaskTemplateSubtask` holds a `title` (1–200) at a `position` (0–19), unique on `(templateId, position)`, deleted with its template. No table refers to a template from a task.
- **TaskTimeEntry** (`prisma/schema.prisma`): `taskId`, `userId`, `startedAt`, `endedAt?`, `durationSeconds?`, `note?`, `manual`. Indexed on `(taskId, startedAt)` and `(userId, startedAt)`; deleted with its task or its user. A partial unique index `TaskTimeEntry_one_running_per_user` on `userId WHERE "endedAt" IS NULL` (written in the migration; Prisma's schema can't express it) allows one running timer per user. CHECKs: an entry has both an end and a duration or neither, never ends before it starts, lasts 0–86400 seconds, and its note is at most 500 characters.
- **TaskAttachment** (`prisma/schema.prisma`): `taskId` (`ON DELETE CASCADE`), `uploaderId?` (`ON DELETE SET NULL`), `name`, `mimeType`, `size`, `storageKey` (unique), `sha256`, `createdAt`. Unique on `(taskId, sha256)`; indexed on `(taskId, createdAt)` and `uploaderId`. CHECKs: name 1–200 characters, size 1 byte to 10 MB, a storage key that is a UUID (never a path), a 64-character hex hash.
- **TaskReminder** (`prisma/schema.prisma`): `taskId`, `userId`, `minutesBefore`, `timeZone?`, `remindAt?`, `processedAt?`. Unique on `(taskId, userId, minutesBefore)`; indexed on `(processedAt, remindAt)` for the scheduler and on `userId`. Deleted with its task or its user. A CHECK keeps `minutesBefore` between 1 and 40320. `Notification.reminderKey` is a nullable unique column used only by reminder notifications.
- **TaskRecurrence**: one per task at most, deleted with its task. There is no "next run" column: nothing runs on a clock, and the next due date is worked out from the rule when the task is completed (and for display). CHECK constraints back the validation: `interval` 1–99, `monthDay` 1–31, `weekdays` within 1–7, `endDate >= startDate`, `occurrenceCount >= 1`, `occurrenceLimit >= 1`.
- **Task → Task (occurrences)**: `recurredFromId` links a generated task to the one it follows. It is unique (the database-level guard against duplicate occurrences), `ON DELETE SET NULL`, and a CHECK (`Task_not_own_occurrence`) stops a task following itself.
- **Team → TeamMember / TeamInvitation / Project**: deleting a team deletes its memberships, invitations, and team projects (and, through them, their tasks). A user can be in many teams but only once per team (`@@unique([teamId, userId])`).
- **Notification** (`prisma/schema.prisma`): one row per recipient with `type`, `recipientId`, `actorId`, optional `taskId` / `commentId` / `invitationId`, `readAt` (null while unread) and `createdAt`. Indexed on `(recipientId, createdAt)` and `(recipientId, readAt)`. Deleting the recipient, task, comment or invitation deletes the row; deleting the actor sets `actorId` to null. `TeamInvitation.emailSentAt` records when its email was last accepted by the provider.

### Migrations

| Migration | Adds |
| --- | --- |
| `0001_init` | `User` table |
| `20261002000000_create_subscribers` | `Subscriber` table (marketing site) |
| `20261002120000_create_projects` | `Project` table, `ownerId` index, foreign key to `User` |
| `20261002140000_create_tasks` | `TaskStatus` and `TaskPriority` enums, `Task` table, `(projectId, status)` index, foreign key to `Project` |

| `20261003120000_create_teams` | `TeamRole` enum, `Team`, `TeamMember`, `TeamInvitation` tables, nullable `Project.teamId` with index and foreign key. Additive only; existing projects keep `teamId = null`. |
| `20261003150000_add_task_assignee` | Nullable `Task.assigneeId` with index and foreign key to `User` (`ON DELETE SET NULL`). Additive only. |
| `20261003210000_keep_activity_after_user_deletion` | `Activity.actorId` becomes nullable and its foreign key changes from `ON DELETE CASCADE` to `ON DELETE SET NULL`. No rows are changed. |
| `20261003180000_add_comments_activity` | `ActivityType` enum, `Comment` and `Activity` tables with indexes and foreign keys (`ON DELETE CASCADE` to `Task` and `User`). Additive only. |
| `20261004150000_account_settings_completion` | `AvatarType` enum; `User.timeZone`, `avatarType`, `avatarKey`, `twoFactorSecret`, `twoFactorPending`, `twoFactorEnabledAt`; `RecoveryCode` table; `Project.ownerId` becomes nullable and its foreign key changes from `ON DELETE CASCADE` to `ON DELETE SET NULL`; CHECK constraint `Project_personal_has_owner`. No rows are changed. |
| `20261004120000_add_user_session_version` | Adds `User.sessionVersion INTEGER NOT NULL DEFAULT 0`. Existing accounts get 0, so their sessions stay valid. Additive only. |
| `20261003230000_add_notifications` | `NotificationType` enum, `Notification` table with indexes and foreign keys (`ON DELETE CASCADE` to recipient, task, comment and invitation; `SET NULL` for the actor), and nullable `TeamInvitation.emailSentAt`. Additive only. |
| `20261005120000_add_task_due_date` | Nullable `Task.dueDate` with an index, and the `TASK_DUE_DATE_CHANGED` value in `ActivityType`. Additive only; existing tasks have no due date. |
| `20261006120000_add_subtasks_dependencies` | Nullable `Task.parentTaskId` with an index and a self foreign key (`ON DELETE NO ACTION`); `TaskDependency` table with its unique index, index and foreign keys (`ON DELETE CASCADE`); the `SUBTASK_ADDED`, `SUBTASK_REMOVED`, `DEPENDENCY_ADDED` and `DEPENDENCY_REMOVED` values in `ActivityType`; CHECK constraints `Task_not_own_parent` and `TaskDependency_not_self`. Additive only; every existing task stays top-level with no dependencies. |
| `20261007120000_add_task_recurrence` | `RecurrenceFrequency` enum; `TaskRecurrence` table with a unique `taskId` and a foreign key to `Task` (`ON DELETE CASCADE`); nullable unique `Task.recurredFromId` with a self foreign key (`ON DELETE SET NULL`); the `RECURRENCE_CREATED`, `RECURRENCE_UPDATED`, `RECURRENCE_DISABLED` and `RECURRENCE_GENERATED` values in `ActivityType`; six CHECK constraints. Additive only; existing tasks don't repeat. |
| `20261008120000_add_task_reminders` | `TaskReminder` table with its unique index, two indexes and foreign keys (`ON DELETE CASCADE` to `Task` and `User`); nullable unique `Notification.reminderKey`; the `TASK_REMINDER` value in `NotificationType`; one CHECK constraint. Additive only; existing tasks have no reminders. |
| `20261009120000_add_labels` | `Label` table with two unique indexes and foreign keys to `User` and `Team` (`ON DELETE CASCADE`); `TaskLabel` table with its primary key, index and foreign keys (`ON DELETE CASCADE`); the `TASK_LABELS_ADDED` and `TASK_LABELS_REMOVED` values in `ActivityType`; three CHECK constraints. Additive only; existing tasks have no labels. |
| `20261010120000_add_task_templates` | `TaskTemplate` table with two unique indexes, an index on `assigneeId` and foreign keys to `User` and `Team`; `TaskTemplateLabel` and `TaskTemplateSubtask` tables with their keys, indexes and foreign keys (`ON DELETE CASCADE`); seven CHECK constraints. Additive only: no existing table, column or row is changed. |
| `20261011120000_add_time_tracking` | `TaskTimeEntry` table with two indexes, the partial unique index for one running timer per user, foreign keys to `Task` and `User` (`ON DELETE CASCADE`) and four CHECK constraints; the `TIME_ENTRY_ADDED`, `TIME_ENTRY_UPDATED` and `TIME_ENTRY_DELETED` values in `ActivityType`. Additive only; existing tasks have no time entries. |
| `20261012120000_add_task_attachments` | `TaskAttachment` table with two unique indexes, two indexes, foreign keys to `Task` (`ON DELETE CASCADE`) and `User` (`ON DELETE SET NULL`) and four CHECK constraints; the `ATTACHMENT_ADDED` and `ATTACHMENT_DELETED` values in `ActivityType`. Additive only; existing tasks have no attachments. |

Apply them with `npm run db:deploy`.

## API reference

All endpoints require a signed-in session (NextAuth cookie) and accept/return JSON. Errors have the shape `{ "error": "<safe message>" }`; the real cause is logged on the server only.

### `POST /api/projects`

Creates a project owned by the session user.

Request: `{ "name": string, "description"?: string, "teamId"?: string }` (omit `teamId` for a personal project)

| Status | Meaning |
| --- | --- |
| 201 | `{ "project": Project }` |
| 400 | Invalid JSON or invalid fields |
| 401 | Not signed in, or the session's user no longer exists |
| 403 | `teamId` is a team where the user is only a member |
| 404 | `teamId` is not one of the user's teams |
| 503 | Database unavailable |
| 500 | Unexpected error |

### `PATCH /api/projects/:id`

Partial update of one of the session user's projects; only the fields present are changed: `name`, `description`.

| Status | Meaning |
| --- | --- |
| 200 | `{ "project": Project }` |
| 400 | Invalid JSON, invalid fields, or nothing to update |
| 401 | Not signed in |
| 404 | Project not found / not the user's |
| 503 / 500 | Database unavailable / unexpected error |

### `DELETE /api/projects/:id`

`204` on success (the project's tasks are deleted with it); `404` if the project doesn't exist or isn't accessible to the user.

`PATCH` and `DELETE` return `403` for a team project when the user is a member without the owner or admin role.

### Team endpoints

| Endpoint | Who | Result |
| --- | --- | --- |
| `POST /api/teams` | Any signed-in user | `201 { team }`; the creator becomes owner |
| `PATCH /api/teams/:teamId` | Owner, admin | `200 { team }` (`name`, `description`) |
| `DELETE /api/teams/:teamId` | Owner | `204` |
| `PATCH /api/teams/:teamId/members/:memberId` | Owner; admin for members | `200 { role }`; body `{ "role": "ADMIN" \| "MEMBER" }` |
| `DELETE /api/teams/:teamId/members/:memberId` | Owner; admin for members; anyone but the owner for themselves | `204` |
| `POST /api/teams/:teamId/invitations` | Owner, admin | `201 { invitation, invitationPath, emailSent: false }`; `409` if already a member or already invited |
| `DELETE /api/teams/:teamId/invitations/:invitationId` | Owner, admin | `204` (cancel) |
| `POST /api/team-invitations/:token/accept` | The invited account | `200 { teamId }`; `404` invalid or other account, `410` expired, `409` already used |
| `POST /api/team-invitations/:token/decline` | The invited account | `204` |

All return `401` when signed out, `404` when the team doesn't exist or the user isn't a member, and `403` when the user's role doesn't allow the action. `memberId` is the `TeamMember` ID. There are no `GET` endpoints; pages load team data on the server.

### `POST /api/tasks`

Creates a task in one of the session user's projects.

Request: `{ "title": string, "projectId": string, "description"?: string, "status"?: TaskStatus, "priority"?: TaskPriority, "dueDate"?: string | null }` (status defaults to `TODO`, priority to `MEDIUM`, no due date). `dueDate` is a full ISO 8601 instant with a zone (`2026-10-10T09:30:00Z` or `…+05:00`) between the years 2000 and 2100; anything else is a 400.

| Status | Meaning |
| --- | --- |
| 201 | `{ "task": Task }` |
| 400 | Invalid JSON or invalid fields |
| 401 | Not signed in |
| 404 | The project doesn't exist or belongs to someone else |
| 503 / 500 | Database unavailable / unexpected error |

### `GET /api/tasks/:id`

Returns `{ "task": Task }`, or 404 if the task doesn't exist or isn't the user's.

### `PATCH /api/tasks/:id`

Partial update; only the fields present are changed: `title`, `description`, `status`, `priority`, `projectId`, `dueDate` (an ISO instant as for `POST`, or `null` to remove it), `assigneeId` (a user ID, or `null` to unassign). `POST /api/tasks` accepts `assigneeId` too. Changing the assignee returns `403` unless the user is owner or admin of the project's team, and `400` if the assignee isn't a member of that team (the same response for an unknown user or a personal project). Moving a task requires the target project to be the user's.

`parentTaskId` is accepted too (also by `POST /api/tasks`): a task ID makes the task a subtask of it, `null` detaches it. See Subtasks for the rules.

`recurrence` is accepted too (also by `POST /api/tasks`): a schedule object as for `PUT /api/tasks/:id/recurrence` below sets or replaces it, and `null` turns repeating off. It is applied in the same transaction as the other fields. Changing `status` to `COMPLETED` on a repeating task creates its next occurrence (see Recurring tasks); the response is still just the task that was updated.

| Status | Meaning |
| --- | --- |
| 200 | `{ "task": Task }` |
| 400 | Invalid fields, or nothing to update; a parent that is the task itself, is a subtask, or is in another project; a task with subtasks being made a subtask |
| 401 | Not signed in |
| 404 | Task not found / not the user's, target project not the user's, or parent task not found / not the user's (the same answer either way) |
| 409 | Moving to another project a subtask, or a task that has subtasks or dependencies; a schedule on a subtask or on a completed task; a repeating task being made a subtask; an occurrence limit below the occurrences that already exist |

### Recurrence endpoints

The user comes from the session only; the task is found through `projectAccessWhere`, so anyone who can open the task (the owner of a personal project, any member of a team project's team, whatever their role, including in a team project whose creator's account is gone) can read and change its schedule, and nobody else can tell it exists. All three go through `updateTask`, the same path as any other change to a task. `userId`, `ownerId`, `taskId`, `occurrenceCount`, `active` and `dueTime` in a body are ignored.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/tasks/:id/recurrence` | `200 { "recurrence": Recurrence \| null }` (`null` = never set to repeat) |
| `PUT /api/tasks/:id/recurrence` | Sets the schedule, replacing any the task has and turning a switched-off one back on. `200 { "recurrence": Recurrence, "task": Task }`. If the task has no due date it gets the schedule's first day that is still ahead. Saving an identical schedule writes nothing. |
| `DELETE /api/tasks/:id/recurrence` | Turns repeating off (the settings are kept). `204`, also when it was already off or never set. |

`PUT` body: `{ "frequency": "DAILY" \| "WEEKLY" \| "MONTHLY", "startDate": "YYYY-MM-DD", "interval"?: 1–99, "weekdays"?: number[] (weekly; 1 = Monday … 7 = Sunday), "monthDay"?: 1–31 (monthly), "endDate"?: "YYYY-MM-DD" \| null, "occurrenceLimit"?: 1–999 \| null, "timeZone"?: string }`. `timeZone` (an IANA name) is only used when the account has no zone saved in Settings.

There is no endpoint that generates an occurrence: generation only happens as part of completing the task.

| Status | Meaning |
| --- | --- |
| 400 | Invalid JSON; unknown frequency; missing or impossible dates; interval, weekdays, day of month or limit out of range; end before start; no occurrence between start and end; an unknown time zone; no time zone saved or sent; a task without a due date whose schedule has nothing left to come |
| 401 | Not signed in |
| 404 | The task doesn't exist or isn't accessible (the same answer either way) |
| 409 | The task is a subtask; the task is completed; the occurrence limit is below the occurrences that already exist |
| 503 / 500 | Database unavailable / unexpected error. Nothing is written. |

### Subtask and dependency endpoints

All take the user from the session only and apply `projectAccessWhere` to every task involved. A task that doesn't exist and one the caller can't access get the same 404, whichever side of a relationship it is on.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/tasks/:id/subtasks` | `{ "subtasks": Task[], "progress": { total, completed } }`, oldest first |
| `POST /api/tasks/:id/subtasks` | Creates a subtask of `:id`. Body as for `POST /api/tasks` without `projectId`; the parent and project come from the address. `201 { "task": Task }` |
| `PATCH` / `DELETE /api/tasks/:id` | Updates or deletes a subtask, as for any task |
| `GET /api/tasks/:id/dependencies` | `{ "blockedBy": Link[], "blocks": Link[] }`, where `Link` is `{ id, task: { id, title, status } }` and `id` is the dependency's own ID |
| `POST /api/tasks/:id/dependencies` | Body `{ "relation": "blocked-by" \| "blocks", "taskId": "<other task>" }`. `201 { "dependency": Link, "relation" }` |
| `DELETE /api/tasks/:id/dependencies/:dependencyId` | Removes one of this task's dependencies, on either side. `204` |

| Status | Meaning |
| --- | --- |
| 400 | Invalid body; a subtask of a subtask; a dependency on itself or on a task of another project |
| 401 | Not signed in |
| 404 | A task that doesn't exist or isn't accessible; a dependency that doesn't exist or isn't this task's |
| 409 | A dependency that already exists, or one that would create a cycle |
| 503 / 500 | Database unavailable / unexpected error. Nothing is written. |

### Comment endpoints

| Endpoint | Who | Result |
| --- | --- | --- |
| `GET /api/tasks/:id/comments` | Anyone with access to the task | `200 { comments, nextCursor, total }`: the latest 50, or with `?before=<nextCursor>` the 50 before that |
| `GET /api/tasks/:id/activity` | Anyone with access to the task | `200 { activities, nextCursor }`, paged the same way. Read-only: activity can't be created through the API |
| `POST /api/tasks/:id/comments` | Anyone with access to the task | `201 { comment }`; body `{ "content": string }`; `400` if empty or over 2000 characters |
| `PATCH /api/tasks/:id/comments/:commentId` | The author | `200 { comment }`; `403` for anyone else |
| `DELETE /api/tasks/:id/comments/:commentId` | The author, or the team's owner/admin | `204`; `403` otherwise |

All return `401` when signed out and `404` when the task isn't accessible or the comment isn't on that task; an invalid cursor is `400`. The author is always the session user.

### Account endpoints

Both need a session and act on that account only; any `userId`, `email` or other identity field in the body is ignored.

| Endpoint | Body | Result |
| --- | --- | --- |
| `PATCH /api/account/profile` | `{ name }` | `200` `{ profile: { name } }`; `400` for an empty, too long or malformed name; `401` signed out. |
| `POST /api/account/password` | `{ currentPassword, newPassword, confirmPassword }` | `200` `{ changed: true }` and every session of the account ends; `400` for missing fields, a short or unchanged new password, or a mismatch (not counted as an attempt); `403` wrong current password; `429` after 5 wrong attempts in 15 minutes; `401` signed out. Passwords and hashes are never returned or logged. |
| `PATCH /api/account/preferences` | `{ timeZone }` (IANA name, or null to clear) | `200` `{ preferences }`; `400` for anything not in the IANA list. |
| `DELETE /api/account/sessions` | none | Signs out every other session; `200` and a fresh session cookie for this browser. |
| `POST /api/account/avatar` | multipart, field `file` | `201` `{ avatar }`; `413` over 2 MB; `415` not JPG/PNG/WebP; `400` not a valid image. |
| `PATCH /api/account/avatar` | `{ preset }` (a built-in ID, or null for initials) | `200` `{ avatar }`; `400` for an unknown ID. |
| `DELETE /api/account/avatar` | none | `204`; back to initials, file deleted. |
| `GET /api/avatars/:file` | | The picture, for its owner and their teammates; otherwise `404` (`401` signed out). |
| `POST /api/account/two-factor` | none | Starts setup: `200` `{ setup: { secret, uri, qr } }`; `409` already on; `503` no encryption key. |
| `POST /api/account/two-factor/enable` | `{ code }` | `200` `{ recoveryCodes }` and a fresh session cookie; `400` wrong code; `429` throttled. |
| `DELETE /api/account/two-factor` | `{ password, code }` | `204`; `403` wrong password or code; `429` throttled. |
| `DELETE /api/account` | `{ email, password, code? }` | `200` `{ deleted: true }`; `400` email mismatch or missing code; `403` wrong password or code; `409` `{ teams }` when the user owns teams; `429` throttled. |

Sign-in (`POST /api/auth/callback/credentials`, handled by NextAuth) answers `429` with `Retry-After` while an email is throttled.

### Notification endpoints

All need a session and act only on the signed-in user's notifications; no user or recipient ID is read from the request.

| Endpoint | Result |
| --- | --- |
| `GET /api/notifications` | `{ notifications, nextCursor, unreadCount }`: the latest 20, or with `?before=<nextCursor>` the 20 before that. `400` for an invalid cursor. |
| `GET /api/notifications/unread-count` | `{ count, latestId }`: the unread count and the ID of the newest visible notification (null when there is none). Polled by the bell. |
| `PATCH /api/notifications/:id/read` | `204`. `404` for an unknown ID or someone else's notification. |
| `POST /api/notifications/read-all` | `{ updated }` |

A notification is `{ id, type, createdAt, read, actor, subject, href }`, where `actor` is a name (or null), `subject` the task title or team name, and `href` the page to open. A `TASK_REMINDER` also has `dueDate` (the task's current due date, ISO, or null) and a null `actor`.

### Label endpoints

The user comes from the session only. `userId`, `ownerId`, `id` and `nameKey` in a body are ignored, and a label never changes workspace.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/labels` | `200 { "labels": Label[] }`: the caller's personal labels and those of their teams, by name. With `?projectId=`, only the labels a task of that project can carry |
| `POST /api/labels` | Body `{ "name": string, "color"?: Color, "teamId"?: string, "projectId"?: string }` (color defaults to `blue`). With `teamId`: that team's label (any member). With `projectId`: a label of that project's workspace. With neither: a personal label. `201 { "label": Label }` |
| `PATCH /api/labels/:id` | Body `{ "name"?: string, "color"?: Color }`. `200 { "label": Label }` |
| `DELETE /api/labels/:id` | `204`; the label comes off every task |
| `GET /api/tasks/:id/labels` | `200 { "labels": LabelRef[] }`, by name |
| `POST /api/tasks/:id/labels` | Body `{ "labelId": string }`. Adds one label. `200 { "labels": LabelRef[] }`; adding one the task already has changes nothing |
| `PUT /api/tasks/:id/labels` | Body `{ "labelIds": string[] }`. Replaces the set; `[]` removes all. `200 { "labels": LabelRef[] }` |
| `DELETE /api/tasks/:id/labels/:labelId` | Takes one label off. `200 { "labels": LabelRef[] }` |
| `POST` / `PATCH /api/tasks` | Accept `labelIds: string[]` (the whole set) |

`Label` is `{ id, name, color, team: { id, name } | null, canManage, taskCount }`; `LabelRef` (on a task) is `{ id, name, color }`. `Color` is one of `gray`, `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `purple`, `pink`.

| Status | Meaning |
| --- | --- |
| 400 | Invalid JSON; a missing, empty or over-long name, or one with control characters; a color outside the palette; both `teamId` and `projectId`; `labelIds` that isn't a list of IDs or has more than 20 |
| 401 | Not signed in |
| 403 | Renaming, recoloring or deleting a team's label as a plain member (the label is visible to them, so this is not a 404) |
| 404 | `Label not found.`: the label doesn't exist, belongs to a workspace the caller isn't in, isn't of the task's workspace, or isn't on the task. `Task not found.` / `Team or project not found.`: likewise for a task, team or project that doesn't exist or isn't accessible. Each is the same answer either way |
| 409 | A label with that name already exists in the workspace; the workspace has 100 labels; the task has 20 |
| 503 / 500 | Database unavailable / unexpected error. Nothing is written. |

### Template endpoints

The user comes from the session only. `userId`, `ownerId`, `id` and `nameKey` in a body are ignored, and a template never changes workspace.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/task-templates` | `200 { "templates": Template[] }`: the caller's personal templates and those of their teams, by name |
| `POST /api/task-templates` | Body `{ "name": string, "description"?, "status"?, "priority"?, "dueOffsetDays"?: number \| null, "assigneeId"?, "labelIds"?: string[], "subtasks"?: string[], "teamId"?: string }`. With `teamId`: that team's template (any member). Without: a personal one. `201 { "template": Template }` |
| `GET /api/task-templates/:id` | `200 { "template": Template }` |
| `PATCH /api/task-templates/:id` | Any of the fields above except `teamId`; only those present change. `labelIds` and `subtasks` replace the whole list. `200 { "template": Template }` |
| `DELETE /api/task-templates/:id` | `204`. No task is changed |
| `POST /api/task-templates/:id/duplicate` | Optional body `{ "name": string }`; without one the copy is "<name> (copy)", "(copy 2)"… `201 { "template": Template }` |
| `POST /api/task-templates/:id/tasks` | Body `{ "projectId": string, "timeZone"?: string }` plus, optionally, any of `title`, `description`, `status`, `priority`, `assigneeId`, `dueDate`, `labelIds`, `recurrence`, `reminders` to use instead of the template's value. `201 { "task": Task, "subtasks": number, "skipped": { "assignee": boolean, "labels": number } }` |

`Template` is `{ id, name, description, status, priority, dueOffsetDays, assignee: { id, name, email, avatar } | null, labels: LabelRef[], subtasks: string[], team: { id, name } | null, canManage, createdAt, updatedAt }`.

| Status | Meaning |
| --- | --- |
| 400 | Invalid JSON; a missing, empty or over-long name; an invalid description, status or priority; `dueOffsetDays` that isn't a whole number from 0 to 365; more than 20 labels or subtasks, or an empty or over-long subtask title; an assignee on a personal template or one who isn't a member of the team; creating a task without a `projectId`, with an invalid field, or from a template with a due-date offset when no time zone is saved or sent |
| 401 | Not signed in |
| 403 | Editing or deleting a team's template as a plain member; setting an assignee without the owner or admin role |
| 404 | `Template not found.`: the template doesn't exist or belongs to a workspace the caller isn't in. `Team not found.` / `Label not found.` / the project message: likewise for a team, a label (also one of another workspace) or a destination project that doesn't exist or isn't accessible. Each is the same answer either way |
| 409 | A template with that name already exists in the workspace; the workspace has 100 templates; when creating a task, the conflicts of any new task (a reminder without a due date, a completed task set to repeat) |
| 503 / 500 | Database unavailable / unexpected error. Nothing is written. |

### Time-tracking endpoints

The user comes from the session only; the start, end and duration of a timer come from the server.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/timer` | `200 { "timer": { id, startedAt, task: { id, title } } \| null, "now": ISO instant }`: the caller's running timer. The title is empty if they can no longer open that task |
| `POST /api/tasks/:id/timer/start` | Starts the caller's timer on the task. `201 { "timer", "stopped": { taskId, seconds } \| null }`; `200` when it was already running there. A timer on another task is stopped first |
| `POST /api/timer/stop` | Stops the caller's running timer, wherever it is. `200 { "entry": { id, taskId, seconds } }`; `409` when none is running |
| `GET /api/tasks/:id/time-entries` | `200 { "entries": Entry[], "totalSeconds", "count", "running", "now" }`: the newest 100 entries, the total of all finished ones |
| `POST /api/tasks/:id/time-entries` | Body `{ "startedAt": ISO instant with a zone, "minutes": 1–1440, "note"?: string }`. `201 { "entry": Entry }` |
| `PATCH /api/tasks/:id/time-entries/:entryId` | Any of `startedAt`, `minutes`, `note`, on one's own finished entry. A new start keeps the length; a new length keeps the start. `200 { "entry": Entry }` |
| `DELETE /api/tasks/:id/time-entries/:entryId` | `204` |

`Entry` is `{ id, startedAt, endedAt, seconds, note, manual, user: { name, email, avatar }, mine, canEdit, canDelete }`; `endedAt` and `seconds` are null while it runs.

| Status | Meaning |
| --- | --- |
| 400 | Invalid JSON; a start that isn't a real ISO instant with a zone, or outside 2000–2100; minutes that aren't a whole number from 1 to 1440; a note over 500 characters; an entry that would end in the future; nothing to update |
| 401 | Not signed in |
| 403 | Editing someone else's entry; deleting one as a plain member |
| 404 | `Task not found.` / `Time entry not found.`: it doesn't exist, isn't accessible, or the entry is on another task. The same answer either way |
| 409 | Stopping with no timer running; editing a running timer |
| 503 / 500 | Database unavailable / unexpected error. Nothing is written. |

### Attachment endpoints

The uploader is the session user and the task is the one in the address; nothing in the form can change either.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/tasks/:id/attachments` | `200 { "attachments": Attachment[] }`, oldest first |
| `POST /api/tasks/:id/attachments` | Multipart form with one field, `file`. `201 { "attachment": Attachment }` |
| `GET /api/tasks/:id/attachments/:attachmentId` | The file. Images are sent `inline`; with `?download=1`, and for every other type, as a download |
| `DELETE /api/tasks/:id/attachments/:attachmentId` | `204` |

`Attachment` is `{ id, name, size, mimeType, inline, createdAt, uploader: { name, email, avatar } | null, mine, canDelete }`.

| Status | Meaning |
| --- | --- |
| 400 | No `file` field, or not a form; an empty file; a name with nothing usable in it |
| 401 | Not signed in |
| 403 | Deleting someone else's file as a plain member |
| 404 | `Task not found.` / `Attachment not found.`: it doesn't exist, isn't accessible, or the attachment is on another task (the same answer either way). `This file is no longer available.`: the record exists but its file isn't on this server's disk |
| 409 | The same file is already attached to the task; the task has 20 files |
| 413 | Larger than 10 MB |
| 415 | A type that isn't allowed, or contents that don't match the type |
| 503 / 500 | Database unavailable / unexpected error. Nothing is written, and no file is served. |

### Reminder endpoints

All take the user from the session only. The task is found through `projectAccessWhere`; a reminder is found only if it is the caller's own and on that task. `userId`, `ownerId`, `taskId`, `remindAt` and `processedAt` in a body are ignored.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/tasks/:id/reminders` | `200 { "reminders": Reminder[] }`: the caller's own, soonest offset first |
| `POST /api/tasks/:id/reminders` | Body `{ "minutesBefore": 5 \| 15 \| 30 \| 60 \| 1440, "timeZone"?: string }`. `201 { "reminder": Reminder }` |
| `PATCH /api/tasks/:id/reminders/:reminderId` | Same body; changes the time and schedules it afresh. `200 { "reminder": Reminder }` |
| `DELETE /api/tasks/:id/reminders/:reminderId` | `204` |
| `POST /api/reminders/process` | Sends the caller's own due reminders now. `200 { "processed", "sent" }`. The body is not read. |
| `POST` / `PATCH /api/tasks` | Accept `reminders: number[]` (the caller's whole set; `[]` removes them all) and `timeZone` |

`Reminder` is `{ id, minutesBefore, remindAt, processed }`: `remindAt` is an ISO instant or null while the task has no due date; `processed` is true once it was sent or passed over.

| Status | Meaning |
| --- | --- |
| 400 | Invalid JSON; a time that isn't one of the five; a set with repeats or unknown values; an unknown time zone |
| 401 | Not signed in |
| 404 | The task doesn't exist or isn't accessible (the same answer either way); the reminder doesn't exist, is someone else's, or is on another task |
| 409 | The caller already has a reminder at that time on the task; the task is completed, has no due date, or its due date has passed |
| 503 / 500 | Database unavailable / unexpected error. Nothing is written. |

Invitation email:

| Endpoint | Result |
| --- | --- |
| `POST /api/teams/:teamId/invitations` | `201` with `{ invitation, invitationPath, emailSent }`, plus `emailError` when the email was not sent. |
| `POST /api/teams/:teamId/invitations/:invitationId/resend` | Owner/admin. `200` `{ emailSent: true, emailSentAt }`; `502` when the provider fails; `503` when email isn't configured; `410` expired; `429` within a minute of the last send; `404`/`403` as for other team endpoints. |


### `DELETE /api/tasks/:id`

`204` on success; `404` if the task doesn't exist or isn't the user's; `409` if it has subtasks (see Moving and deleting tasks with relationships).

The dashboard pages load their data directly on the server, so there are no list (`GET`) endpoints, and `GET /api/tasks/:id` is not used by the UI. Every endpoint is ownership-checked.

### `GET /api/calendar`

Tasks due in `[start, end)` that the session user can access, soonest first.

| Parameter | Meaning |
| --- | --- |
| `start`, `end` | Required. Full ISO 8601 instants with a zone. `end` must be after `start`, and the range at most 62 days. |
| `scope` | `all` (default), `personal`, or `team` |
| `teamId` | With `scope=team`: one team. Without it, every team the user is in. |
| `projectId` | One project |
| `assignee` | `me`, `unassigned`, or a user ID |
| `status`, `priority` | A `TaskStatus` / `TaskPriority` value |

The user always comes from the session. Every parameter is ANDed with the project access rule, so a project, team or user ID that isn't the caller's matches nothing (200 with an empty list, the same as an ID that doesn't exist). Tasks without a due date never match.

| Status | Meaning |
| --- | --- |
| 200 | `{ "tasks": CalendarTask[], "truncated": boolean }` (`truncated` is true when more than 500 matched) |
| 400 | Missing or malformed `start`/`end`, a range that is empty or longer than 62 days, or an invalid filter value |
| 401 | Not signed in |
| 503 / 500 | Database unavailable / unexpected error |

### `GET /api/search`

`GET /api/search?q=` — used by the command palette. Tasks, projects and teams matching `q` that the session user can access.

- `q` is trimmed and its whitespace collapsed; it must then be 2 to 100 characters. It is split into words (the first 5 are used) and **every** word must match, case-insensitively, in any searched field of a record:
  - tasks: title, description, project name, assignee name
  - projects: name, description, team name
  - teams: name, description
- The user always comes from the session; other query parameters are ignored. Access is part of each query's `WHERE`: tasks and projects through `projectAccessWhere` (the owner of a personal project, or a member of the team for a team project, so a team project whose creator was deleted, `ownerId` null, is still found by its team's members), teams through membership.
- At most 5 of each kind are returned: tasks and projects most recently updated first, teams by name. `%`, `_` and `\` in `q` match literally.
- Descriptions are matched but never returned.

| Status | Meaning |
| --- | --- |
| 200 | `{ "query": string, "results": { "tasks": [{ id, title, status, priority, projectName }], "projects": [{ id, name, teamName }], "teams": [{ id, name, role, memberCount }] } }`. `teamName` is null for a personal project; `role` is the caller's. `Cache-Control: no-store` |
| 400 | `q` missing, shorter than 2 or longer than 100 characters |
| 401 | Not signed in, or the session is no longer valid (password changed, account deleted) |
| 503 / 500 | Database unavailable / unexpected error |

The three queries run in parallel, one each, with their joins (no per-row lookups). Matching uses `ILIKE '%word%'`, which no B-tree index serves; it stays cheap because the access rule narrows the rows first, through the existing `Project.ownerId`, `Project.teamId`, `TeamMember.userId` and `Task.projectId` indexes, so only the caller's own records are scanned. No index or migration was added. If a single user's data grew large enough for that scan to matter, a `pg_trgm` GIN index on the searched columns would be the next step.

### `GET /api/reports`

Three endpoints share one query check (`loadReportQuery` in `lib/reports.ts`) and one access rule, so the page, its task table and the export can't disagree about what a user may see.

| Endpoint | Returns |
| --- | --- |
| `GET /api/reports` | The report: range, summary, status/priority/assignee/project breakdowns, trend |
| `GET /api/reports/tasks` | One page of the task table (`list`, `page`) |
| `GET /api/reports/export?format=csv` | The task table's whole selection as a CSV download (`list`) |

| Parameter | Meaning |
| --- | --- |
| `range` | `today`, `7d`, `30d` (default), `month`, `last-month` or `custom` |
| `from`, `to` | With `range=custom` only: `YYYY-MM-DD` days, `to` on or after `from`, at most 366 days |
| `tz` | An IANA time zone, used only when the account has none saved |
| `scope` | `all` (default), `personal`, or `team` |
| `teamId` | With `scope=team`: one team. Without it, every team the user is in. |
| `projectId` | One project |
| `assignee` | `me`, `unassigned`, or a user ID |
| `status`, `priority` | A `TaskStatus` / `TaskPriority` value |
| `list` | Tasks and export only: `all` (default), `created`, `completed` or `due` |
| `page` | Tasks only: 1 (default) to 400 |

The user always comes from the session. Parameters such as `userId` or `ownerId` are not read at all. Every filter is ANDed with `projectAccessWhere`. A `teamId` the caller isn't a member of, a `projectId` they can't access, or an `assignee` who shares no team with them is refused with 404, with the same message whether or not the ID exists, so IDs can't be probed. All values go to the database as Prisma query parameters; no SQL is built from them.

| Status | Meaning |
| --- | --- |
| 200 | The report, the task page, or the CSV. `Cache-Control: no-store` |
| 400 | Unknown range, malformed or reversed dates, a range over 366 days, dates with a preset, an invalid time zone, scope, status, priority, list or page, `teamId` without `scope=team`, a format other than `csv`, or an export of more than 5,000 tasks |
| 401 | Not signed in, or the session is no longer valid |
| 404 | A team, project or assignee the caller has no access to |
| 503 / 500 | Database unavailable / unexpected error. No partial or empty report is returned. |

**Queries.** A report is 14 parallel queries plus at most 3 follow-ups, none of them per row: grouped counts for the breakdowns, plain counts for the range figures, and three reads of one timestamp column (each capped at 10,001 rows) for the trend and the average. The task table is a count, one page of 25 rows and one grouped lookup of those rows' completion dates. The export reads at most 5,000 tasks in chunks of 1,000 with the same grouped lookup per chunk. Everything is narrowed by the access rule first, through the existing `Project.ownerId`, `Project.teamId`, `TeamMember.userId`, `Task(projectId, status)`, `Task.assigneeId`, `Task.dueDate` and `Activity(taskId, createdAt)` indexes. No index, migration or dependency was added.

**CSV.** UTF-8 with a byte order mark (so Excel reads it as UTF-8), CRLF line endings, `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="taskwell-report-<from>_to_<to>.csv"`. The columns are always, in this order: Task ID, Title, Project, Team, Status, Priority, Assignee, Due date, Created date, Completed date, Time zone, Parent task (the parent's title for a subtask, otherwise empty), Repeating ("Yes" for a task that holds an active schedule or was generated as the next occurrence of one, otherwise "No"), Time tracked (h:mm) (hours and minutes tracked on the task inside the report's range, "0:00" when none).

- Dates are on the report's time zone clock, as `YYYY-MM-DD HH:MM`, and each row names the zone. A due date without a time is written as the day alone. Completed date is empty for an open task and for a completed one with no recorded completion.
- Team is empty for a personal project. Assignee is "Unassigned" for an unassigned team task and empty for a personal one.
- A field containing a comma, a quote, a line break or outer spaces is quoted, with quotes doubled (`csvCell` in `lib/report-csv.ts`).
- **Formula injection**: a field that starts with `=`, `+`, `-` or `@` (also after leading spaces), or with a tab or carriage return, gets a leading apostrophe, which spreadsheets show as text instead of running it. A title such as `-5% discount` is therefore exported as `'-5% discount`.
- Status and priority are written as their labels. No description, comment, email address or user/project ID is exported.
- A selection of more than 5,000 tasks is refused with a message instead of being cut short.

### Response shapes

```ts
type Project = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string;
  owner: { name: string; email: string };
  team: { id: string; name: string } | null; // null = personal
  canManage: boolean; // may the current user edit/delete it
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "COMPLETED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null; // ISO 8601 instant
  createdAt: string; // ISO 8601
  updatedAt: string;
  project: { id: string; name: string; teamId: string | null };
  parent: { id: string; title: string } | null; // set for a subtask
  subtasks: { total: number; completed: number }; // counted on read; 0 and 0 without subtasks
  assignee: { id: string; name: string; email: string } | null;
  recurrence: Recurrence | null; // the schedule this task holds, also when switched off
  reminders: Reminder[]; // the reader's own reminders only
  labels: { id: string; name: string; color: Color }[]; // by name; always of the task's own workspace
};

type Reminder = { id: string; minutesBefore: 5 | 15 | 30 | 60 | 1440; remindAt: string | null; processed: boolean };

type Recurrence = {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  weekdays: number[]; // weekly: 1 = Monday ... 7 = Sunday
  monthDay: number | null; // monthly
  startDate: string; // "YYYY-MM-DD" in timeZone
  endDate: string | null;
  occurrenceLimit: number | null;
  occurrenceCount: number; // occurrences so far, this task included
  dueTime: string | null; // "HH:MM" in timeZone; null = a date without a time
  timeZone: string; // IANA
  active: boolean;
  nextDueDate: string | null; // ISO instant the next occurrence would get if completed now; null = off or series over
};

// GET /api/calendar: only what a calendar entry shows.
type CalendarTask = Pick<Task, "id" | "title" | "status" | "priority" | "project" | "assignee"> & {
  dueDate: string;
};
```

## Server data layer

These modules are `server-only` and take the session user's ID as their first argument.

**`lib/dashboard.ts`**

- `requireDashboardUser(callbackPath)`: session guard; returns `{ id, name, email, createdAt }` or redirects to login.
- `getDashboardOverview(userId, scope)`: dashboard analytics and project options for the overview; either is `null` (logged) if its query fails.

**`lib/analytics.ts`**: `resolveAnalyticsScope(value, teamIds)` (validates the `scope` parameter against the user's memberships) and `getDashboardAnalytics(userId, scope)` (status and priority counts, monthly activity, project progress, review list).

**`lib/reports.ts`**: `loadReportQuery(userId, params)` (validates the query string, resolves the time zone and range, and checks any named team, project or person against the user), `getReport`, `listReportTasks` and `exportReportCsv`. `lib/report-dates.ts` (range presets, validation, trend periods) and `lib/report-csv.ts` (CSV escaping and date formatting) have no server-only imports, so the page and tests can use them.

**`lib/access.ts`**

- `projectAccessWhere(userId)` / `projectManageWhere(userId)`: the Prisma filters that define who can reach, and who can edit or delete, a project. `lib/projects.ts` and `lib/tasks.ts` build every query from them.

**`lib/teams.ts`**

- `listTeamsForUser`, `getTeamForUser`, `createTeamForUser`, `updateTeamForUser`, `deleteTeamForOwner`
- `listTeamMembersForUser`, `updateTeamMemberRole`, `removeTeamMember`
- `inviteTeamMember`, `listTeamInvitations`, `cancelTeamInvitation`, `listInvitationsForUser`, `getInvitationForUser`, `acceptTeamInvitation`, `declineTeamInvitation`

Each checks the session user's membership and role itself and returns `not-found` or `forbidden` rather than throwing.

**`lib/comments.ts`**: `listCommentsForTask` (one page), `createComment`, `updateComment`, `deleteComment`.

**`lib/activity.ts`**: `activityRow` (builds a typed activity row for the transactions in `lib/tasks.ts`, `lib/comments.ts` and `lib/teams.ts`) and `listTaskActivity` (one page; three queries however long the history).

**`lib/pagination.ts`**: page size, cursor encoding/decoding, and the "older than this cursor" filter shared by both lists.

**`lib/api.ts`**: session lookup, JSON parsing, and safe error responses shared by the API routes.

**`lib/projects.ts`** (the `ForOwner` names predate teams; the first argument is always the session user)

- `listProjectsForOwner(ownerId)`: full project summaries, most recently updated first.
- `listProjectOptionsForOwner(ownerId)`: `{ id, name }` list for pickers and filters, sorted by name.
- `getProjectForOwner(ownerId, projectId)`
- `createProjectForOwner(ownerId, input)`
- `updateProjectForOwner(ownerId, projectId, data)`: uses `updateMany` with the `ownerId` filter; returns `null` if the project isn't the user's.
- `deleteProjectForOwner(ownerId, projectId)`: uses `deleteMany` with the `ownerId` filter; tasks are removed by the cascade.

**`lib/recurrence-rules.ts`** (no server imports): `validateRecurrenceInput`, `nextOccurrenceDay` / `firstOccurrenceDay` (the day grid), `upcomingOccurrence` and `nextDueDate` (the next due instant in the schedule's zone), `describeRecurrence`. **`lib/recurrence.ts`**: `planRecurrence` (what saving a schedule means for a task), `generateNextOccurrence` (called by `updateTask` inside its transaction when a task is completed), `toRecurrenceSummary`. Neither checks access; `lib/tasks.ts` has already found the task through the access rule.

**`lib/dependencies.ts`**: `listDependencies`, `listDependencyCandidates` (the other tasks of the same project, for the add form), `addDependency` (access, same project, duplicate and cycle checks under the project lock) and `removeDependency`.

**`lib/tasks.ts`**

- `listSubtasks(ownerId, parentTaskId)`, and `lockProjectRelations(tx, projectId)`: the per-project advisory lock taken by every write that creates or checks a relationship.

- `listTasksForOwner(ownerId)`
- `listAssignedTasksForUser(userId)`, `getTeamWorkload(userId, teamId)`
- `listTasksForProject(ownerId, projectId)`
- `getTaskById(ownerId, taskId)`
- `createTask(ownerId, input)`: returns an error code if the project isn't accessible or the assignee isn't allowed.
- `updateTask(ownerId, taskId, data)`: checks any assignee change, clears an assignee who isn't in the new project's team, then writes with `updateMany` and the access filter.
- `deleteTask(ownerId, taskId)`: uses `deleteMany` with the ownership filter.

**`lib/task-templates.ts`**: `listTemplatesForUser`, `getTemplateById`, `createTemplate`, `updateTemplate`, `deleteTemplate`, `duplicateTemplate` and `createTaskFromTemplate`, each for the session user. `createTask` takes the template's subtask titles as an optional third argument and writes them in the same transaction as the task.

**`lib/time-tracking.ts`**: `getRunningTimer`, `getTaskTime`, `startTimer`, `stopTimer`, `createTimeEntry`, `updateTimeEntry`, `deleteTimeEntry`, `stopTimerInTeam` (used when a member is removed), and `trackedSecondsByTask` / `trackedSecondsTotal` for the reports.

**`lib/attachments.ts`**: `listAttachments`, `addAttachment`, `readAttachment`, `deleteAttachment`, and, for the code that deletes tasks, `attachmentKeysOf` / `removeFilesWithoutRows`, plus `sweepOrphanedAttachmentFiles` (run at server start). `lib/attachment-store.ts` is the only code that touches the files.

**Shared validation** (safe to import in client components):

- `lib/project-validation.ts`: project limits, `validateProjectInput`, and `validateProjectUpdate`.
- `lib/comment-validation.ts`: the comment length limit and `validateCommentInput`.
- `lib/team-validation.ts`: team limits, roles and labels, the permission rules (`canManageTeam`, `canChangeMemberRole`, `canRemoveMember`), and the team, invitation, and role validators.
- `lib/task-validation.ts`: task limits, the status/priority values and labels, `validateTaskInput`, and `validateTaskUpdate`.
- `lib/template-rules.ts`: template limits, `validateTemplateInput`, `validateTemplateUpdate`, `validateTemplateDuplicate`, `validateTemplateUse`, and `dueDateForOffset` (the due date a template gives a task created now, in a time zone).

**Errors**: `describeError` and `isDatabaseUnavailable` in `lib/users.ts` produce log entries without secrets (no passwords, hashes, or connection credentials) and decide between 503 and 500.

## Loading, empty, and error states

| State | Where |
| --- | --- |
| Loading | `app/dashboard/loading.tsx` (overview), `app/dashboard/projects/loading.tsx` (card skeletons), `app/dashboard/tasks/loading.tsx` (filters + table skeleton), and a `loading.tsx` for each detail page. Edit and delete buttons show "Saving..." / "Deleting..." and are disabled while a request is running. All skeletons announce "Loading…" to screen readers. |
| Empty | "No projects yet" and "No tasks yet" with create actions; "No projects found" and "No tasks match these filters" for searches and filters; "No description" and "No tasks in this project yet" on detail pages; empty chart and table states on the overview. |
| Not found | `not-found.tsx` next to each detail page: "Task not found" / "Project not found" with a link back to the list. Shown for missing items and for items owned by someone else. |
| Error | `app/dashboard/error.tsx` catches any dashboard page error inside the shell: "Something went wrong", a reference code (digest), and a **Retry** button. No database errors, stack traces, or Prisma details are shown. |
| Calendar | `app/dashboard/calendar/loading.tsx` while the page loads; a skeleton and "Loading tasks…" while a range loads, with the previous range dimmed on later loads. An empty range says so (the month and week grids are still drawn). A failed, rejected (invalid range) or unreachable request shows the reason and **Try again** in place of the grid. |
| Reports | `app/dashboard/reports/loading.tsx` while the page loads; "Loading report…" with placeholders on the first load, "Updating report…" with the previous figures dimmed on later ones. With no tasks at all it says "Nothing to report on yet"; when tasks exist but none match, "No tasks match these filters" with Clear filters. Neither shows cards of zeros. A range with tasks but no events says so in words, and the chart, the assignee panel and the task table each have their own empty message. A failed request replaces the figures with the reason and **Try again**; a failed export is announced above the report, which stays. |
| Partial failure | The overview's account date and task statistics fall back to "No data yet" / "Unavailable" when their queries fail, instead of breaking the page. |

No fake or sample data is ever shown in place of real data.

## Design system and accessibility

**Tokens** (Tailwind, `tailwind.config.ts`)

| Token | Value | Use |
| --- | --- | --- |
| `ink` | `#14213D` | Primary text |
| `paper` | `#FAFAF7` | Light page background, input backgrounds |
| `brand` | `#2F6FED` | Primary buttons, links, active states |
| `brand-dark` | `#1E4FB8` | Button hover, active text |
| `accent` | `#F2A93B` | "Soon" badges, To do status |
| `muted` | `#5B6475` | Secondary text |
| `dark-background` | `#0F172A` | Dark page background |
| `dark-surface` | `#172033` | Dark cards and dialogs |
| `dark-muted` | `#A8B0BF` | Dark secondary text |

Fonts: `font-display` for headings and figures, `font-body` for text.

**Conventions**

- Cards and panels: `rounded-2xl` or `rounded-xl`, `border-ink/10`, white (`dark:bg-dark-surface`), `shadow-sm`.
- Buttons and inputs: at least 44px tall (`min-h-11`), `rounded-lg`, a visible `focus-visible` ring in brand blue.
- Icons: `lucide-react`, always `aria-hidden` next to a text label.
- Dialogs: native `<dialog>` opened with `showModal()`, which provides a focus trap, Escape to close, and an inert background. Backdrop click closes the dialog; focus starts in the first field.
- No UI component library; Tailwind only.

**Accessibility**

- One `h1` per page, with sections labelled by headings (some visually hidden).
- Skip link, `aria-current` navigation, labelled search, select, and filter controls.
- Live regions announce result counts; errors use `role="alert"`.
- Charts have text alternatives (`role="img"` with a descriptive `aria-label`).
- Animations respect `prefers-reduced-motion` (`motion-safe:`).

## File map

| File or folder | Responsibility |
| --- | --- |
| `app/dashboard/layout.tsx` | Authenticated shared layout |
| `app/dashboard/page.tsx` | Overview page |
| `app/dashboard/loading.tsx` / `error.tsx` | Shared loading skeleton / error boundary |
| `app/dashboard/projects/` | Projects page and loading skeleton |
| `app/dashboard/projects/[projectId]/` | Project detail page, loading skeleton, not-found state |
| `app/dashboard/tasks/` | Tasks page and loading skeleton |
| `app/dashboard/tasks/board/` | Task board page and loading skeleton |
| `app/dashboard/tasks/[taskId]/` | Task detail page, loading skeleton, not-found state |
| `app/dashboard/settings/` | Settings page |
| `app/api/projects/route.ts` | `POST` create project |
| `app/api/projects/[id]/route.ts` | `PATCH` / `DELETE` one project |
| `app/api/teams/` | Team, member, and invitation endpoints |
| `app/api/team-invitations/[token]/` | Accept / decline an invitation |
| `app/dashboard/teams/` | Teams list, team overview, members, settings, invitation page |
| `app/api/tasks/route.ts` | `POST` create task |
| `app/api/tasks/[id]/route.ts` | `GET` / `PATCH` / `DELETE` one task |
| `app/api/tasks/[id]/subtasks/route.ts` | `GET` a task's subtasks and progress, `POST` a new subtask |
| `app/api/tasks/[id]/dependencies/` | `GET` / `POST` a task's dependencies; `[dependencyId]/` `DELETE` one |
| `lib/dependencies.ts` | Dependency reads and writes, cycle detection |
| `lib/recurrence-rules.ts` | Repeat rules: validation, the day grid, next due date in a time zone, wording (shared with the client) |
| `lib/recurrence.ts` | Schedule rows: planning a save, generating the next occurrence |
| `app/api/tasks/[id]/recurrence/route.ts` | `GET` / `PUT` / `DELETE` a task's schedule |
| `components/dashboard/RecurrenceFields.tsx` | The Repeat fields used by the task dialog and the Repeat card |
| `components/dashboard/TaskRecurrence.tsx` | The Repeat card on the task page: summary, Edit recurrence, Disable recurrence |
| `components/dashboard/TaskSubtasks.tsx`, `SubtaskParent.tsx` | The Subtasks card on a task page; the parent link and Detach on a subtask's page |
| `components/dashboard/TaskDependencies.tsx` | The Dependencies card: Blocked by, Blocks, add and remove |
| `components/dashboard/Pagination.tsx` | Page controls, and the hooks that cut a loaded list into pages |
| `app/api/tasks/_shared.ts` | Session lookup, JSON parsing, safe error responses for task routes |
| `components/dashboard/Sidebar.tsx` | Menu, settings link, dark mode switch, account card; used by the desktop sidebar and the drawer |
| `components/dashboard/MobileDrawer.tsx` | Menu button and slide-over drawer that hosts the sidebar below `lg` |
| `components/dashboard/Greeting.tsx`, `SoonBadge.tsx`, `PageBreadcrumb.tsx` | Not currently used |
| `components/dashboard/StatCard.tsx` | Statistic card |
| `components/dashboard/StatusDistribution.tsx` | Task status donut chart |
| `components/dashboard/ActivityChart.tsx` | Monthly created / completed chart |
| `components/dashboard/ProjectStats.tsx`, `PriorityDistribution.tsx` | Project progress; priority distribution |
| `components/dashboard/TaskReviewList.tsx` | Tasks in review |
| `components/dashboard/AnalyticsScopeSelect.tsx` | Dashboard scope selector |
| `lib/analytics.ts` | Dashboard analytics queries and scope resolution |
| `components/dashboard/CreateProjectButton.tsx` | Project dialog: creates a project, or edits the one passed as `project` |
| `components/dashboard/ProjectsView.tsx` | Project search, sort, cards |
| `components/dashboard/CreateTaskButton.tsx` | Task dialog: creates a task, or edits the one passed as `task` |
| `components/dashboard/ConfirmDeleteButton.tsx` | Delete button + confirmation dialog for tasks and projects |
| `components/dashboard/DetailNotFound.tsx` | Not-found block for detail pages |
| `components/dashboard/detail-styles.ts` | Class names shared by the detail pages |
| `components/dashboard/TasksView.tsx` | Task filters and table |
| `components/dashboard/CreateTeamButton.tsx` | Create Team button + dialog |
| `components/dashboard/TeamHeader.tsx`, `TeamRoleBadge.tsx` | Team page header with tabs; role badge |
| `components/dashboard/InviteMemberForm.tsx`, `InvitationActions.tsx` | Create an invitation and show its link; accept / decline |
| `components/dashboard/MemberRoleSelect.tsx`, `TeamSettingsForm.tsx` | Change a member's role; edit team details |
| `components/dashboard/AssigneeSelect.tsx`, `TaskAssignee.tsx`, `AssignmentContext.tsx` | Assignee picker, assignee label, and the shared list of assignable members |
| `components/dashboard/TaskComments.tsx`, `TaskActivity.tsx`, `RelativeTime.tsx` | Comment list and form; activity list; relative timestamps |
| `components/dashboard/useOlderPages.ts` | "Load older" state shared by the comment and activity lists |
| `components/dashboard/TaskBoard.tsx` | Kanban columns, cards, drag and drop, board filters |
| `components/dashboard/TaskViewSwitch.tsx` | List / Board switch |
| `components/dashboard/TaskBadges.tsx` | Status/priority badges and status colors |
| `components/dashboard/FormattedDate.tsx` | Dates in the viewer's locale and the account's time zone |
| `components/dashboard/EmptyState.tsx` | Empty-state block |
| `components/dashboard/PageIntro.tsx` | Page title + description |
| `components/dashboard/UserAvatar.tsx` | Initials avatar |
| `lib/dashboard.ts` | Session guard, overview data |
| `lib/navigation.ts` | Navigation definitions and route matching |
| `lib/access.ts` | Project (and task) access rules |
| `lib/teams.ts` / `lib/team-validation.ts` | Team queries and permission checks / validation and role rules |
| `lib/api.ts` | Shared API route helpers |
| `lib/comments.ts` / `lib/comment-validation.ts` | Comment queries and permission checks / validation |
| `lib/activity.ts` | Activity rows and the task history query |
| `lib/pagination.ts` | Cursor paging helpers |
| `lib/notifications.ts` | Notification rows, list, unread count, mark read |
| `lib/mentions.ts` | Finds `@Name` mentions (shared by server and comment UI) |
| `lib/email.ts` / `lib/invitation-email.ts` | Resend sender / invitation email template and delivery |
| `app/api/notifications/` | Notification endpoints |
| `app/api/teams/[teamId]/invitations/[invitationId]/resend/` | Resend an invitation email |
| `components/dashboard/Notifications.tsx` | Live unread-count provider (polling, backoff, visibility), bell and panel |
| `lib/label-rules.ts` | Label names, palette, validation and the filter's any / all rule (shared with the client) |
| `lib/labels.ts` | Label workspaces and access, label CRUD, labels on tasks, the per-task lock |
| `app/api/labels/`, `app/api/tasks/[id]/labels/` | Label endpoints |
| `components/dashboard/LabelChip.tsx`, `LabelColorPicker.tsx` | A label as shown on a task; the nine-color radio group |
| `components/dashboard/LabelPicker.tsx` | Searchable label checklist with create-in-place (task page and task dialog) |
| `components/dashboard/TaskLabels.tsx` | The Labels section of the task page |
| `components/dashboard/LabelFilter.tsx` | The label filter of the task list and board (any / all) |
| `components/dashboard/ManageLabels.tsx` | The Manage labels dialog |
| `lib/template-rules.ts` | Template limits and validation, and the due-date offset rule (shared with the client) |
| `lib/task-templates.ts` | Template workspaces and access, template CRUD, duplication, creating a task from a template |
| `app/api/task-templates/` | Template endpoints |
| `app/dashboard/templates/` | Templates page and loading skeleton |
| `components/dashboard/TemplatesView.tsx` | The template cards and their actions |
| `components/dashboard/TemplateFormButton.tsx` | The create / edit template dialog |
| `components/dashboard/UseTemplateButton.tsx` | The "Use template" dialog |
| `lib/time-rules.ts` | Time-entry limits, validation and duration formatting (shared with the client) |
| `lib/time-tracking.ts` | Timers, time entries, their access rules, and the report totals |
| `app/api/timer/`, `app/api/tasks/[id]/timer/`, `app/api/tasks/[id]/time-entries/` | Time-tracking endpoints |
| `components/dashboard/TaskTimeTracking.tsx` | The task page's Time tracking card and its add / edit dialog |
| `lib/attachment-rules.ts` | Allowed types, limits, file-name cleaning and content checks (shared with the client) |
| `lib/attachment-store.ts` | Reading, writing and deleting attachment files on disk |
| `lib/attachments.ts` | Attachment access rules, upload, download, delete, and file clean-up when tasks are deleted |
| `app/api/tasks/[id]/attachments/` | Attachment endpoints |
| `components/dashboard/TaskAttachments.tsx` | The task page's Attachments card |
| `app/icon.svg` | The browser-tab icon |
| `lib/reminder-rules.ts` | Reminder offsets, validation, and when a reminder fires in a time zone (shared with the client) |
| `lib/reminders.ts` | Reminder reads and writes, rescheduling, copying to a recurring occurrence, `processDueReminders` |
| `lib/reminder-scheduler.ts`, `instrumentation.ts` | The in-process timer that sends due reminders, and where it is started |
| `app/api/tasks/[id]/reminders/`, `app/api/reminders/process/` | Reminder endpoints |
| `components/dashboard/TaskReminders.tsx` | The Reminders card on the task page |
| `components/dashboard/MentionTextarea.tsx` | Comment box with `@` suggestions; mention emphasis |
| `components/dashboard/ResendInvitationButton.tsx` | Resend / send an invitation email |
| `components/dashboard/ProfileForm.tsx`, `PasswordForm.tsx`, `settings-styles.ts` | Settings: name form, change-password form, shared form styles |
| `lib/account-validation.ts` | Name and password-change rules (shared by sign-up, the API and Settings) |
| `lib/password-throttle.ts` | In-memory throttles for sign-in, the current password and two-factor codes |
| `lib/avatars.ts`, `lib/avatar-store.ts`, `lib/account-avatar.ts` | Built-in avatar list and shared types; image processing and files; avatar changes and who may view one |
| `lib/two-factor.ts` | TOTP, secret encryption, recovery codes |
| `lib/account-deletion.ts` | Account deletion and its policy |
| `lib/session-cookie.ts` | Raising the session version while re-issuing the current browser's cookie |
| `app/unavailable/page.tsx` | Service-unavailable page for database outages |
| `components/dashboard/AvatarPicker.tsx`, `TimeZoneForm.tsx`, `SignOutOthersButton.tsx`, `TwoFactorSection.tsx`, `DeleteAccountSection.tsx` | The Settings controls added in Phase 12.1–12.6 |
| `app/api/account/` | Profile and password endpoints |
| `app/api/tasks/[id]/comments/` | Comment endpoints |
| `app/api/tasks/[id]/activity/` | Read-only activity endpoint |
| `lib/projects.ts` / `lib/project-validation.ts` | Project queries / validation |
| `lib/tasks.ts` / `lib/task-validation.ts` | Task queries / validation |
| `lib/calendar.ts` | Calendar query: range and filter parsing, the one task query |
| `lib/calendar-dates.ts` | Time-zone-aware day, week and month ranges; due-date conversion and formatting; derived overdue (shared by server and client) |
| `app/api/calendar/` | Calendar endpoint |
| `app/dashboard/calendar/` | Calendar page and loading skeleton |
| `lib/reports.ts` | Report query check, the report itself, the task table page, the CSV export |
| `lib/report-dates.ts` | Report range presets and validation, trend periods (shared by server and client) |
| `lib/report-csv.ts` | CSV escaping, formula neutralising, date formatting for the export |
| `app/api/reports/` | `GET` report, `tasks/` (task table page), `export/` (CSV) |
| `app/dashboard/reports/` | Reports page and loading skeleton |
| `components/dashboard/ReportsView.tsx`, `ReportTrend.tsx` | The Reports page: filters, address state, figures, tables, export; the trend chart |
| `components/dashboard/CalendarView.tsx` | Calendar toolbar, filters and the four views |
| `components/dashboard/TimeZoneContext.tsx`, `DueDate.tsx` | The account's time zone for client components; due date text and the Overdue label |
| `lib/search.ts`, `lib/search-validation.ts` | Command palette search: the three authorized queries; query limits shared with the client |
| `app/api/search/` | Search endpoint |
| `components/dashboard/CommandPalette.tsx` | Command palette dialog, its Ctrl/Cmd+K shortcut, the search buttons, Recent |
| `lib/prisma.ts` | Shared Prisma Client |
| `prisma/schema.prisma`, `prisma/migrations/` | Data model and migrations |

## Troubleshooting

**`Cannot read properties of undefined (reading 'findMany')`**
The running dev server has an outdated Prisma Client (for example `prisma.task` or `prisma.project` is missing). A running server keeps the client it loaded at startup. Fix: `npx prisma generate`, stop the dev server, and start it again. If needed, delete `.next` before restarting.

**`P2021: The table "public.Task" (or "Project") does not exist`**
Migrations haven't been applied to this database. Check with `npx prisma migrate status` and apply with `npm run db:deploy`.

**`P1001: Can't reach database server`, or registration returns 503**
PostgreSQL isn't running or `DATABASE_URL` is wrong. Start it with `docker compose up -d db` and check that `DATABASE_URL` matches the `POSTGRES_*` values.

**"Something went wrong" on a dashboard page**
Look in the dev-server terminal for the line matching the reference code shown on the page. Server logs use the prefixes `[register]`, `[auth]`, `[projects]`, `[tasks]`, and "Dashboard task overview failed".

**A dev server seems stuck or a port stays busy**
Make sure only one `next dev` runs for this folder, and that it wasn't suspended with Ctrl+Z in a terminal (resume it with `fg`, then stop it with Ctrl+C).

**"Extra attributes from the server: style" in the dev console during automated screenshots**
This comes from the test tool, not the app. Playwright hides the text caret for a screenshot by setting `caret-color: transparent !important` inline on every input and textarea; if the screenshot is taken before React has hydrated the page, React reports the extra attribute on the first field it meets (the New task dialog's title input). It doesn't occur in normal use. In tests, wait for hydration before the screenshot or pass `caret: "initial"`. The app needs no `suppressHydrationWarning` for it.

## Current limitations

- Dashboard analytics: the range is fixed at 6 months and months are UTC; completions are only dated when a status change was recorded (see the dashboard section); there are no per-person or per-team comparison charts, no export, and no custom date range on the dashboard itself (Reports has those).
- Cards can't be reordered within a column; columns are ordered by most recently updated. Dragging uses the browser's native drag and drop, so on touch devices use the card's Move to select.
- A task has at most one assignee, and members can't assign tasks (including to themselves).
- Comments are plain text; there are no replies or attachments. A mention needs the person's full name as it appears in their account, and only a new comment notifies (not an edit).
- A deleted account's comments are removed with it; only its activity is kept.
- Activity history is shown per task only; the dashboard uses it just to date completions.
- Calendar: tasks can't be dragged to another day (change the due date in the task dialog). The week view is an ordered list per day, not an hourly grid, because a task has a deadline and no duration. Weeks always start on Monday. There is no external calendar sync. A date-only due date is tied to the zone it was entered in (see Calendar). A range shows at most 500 tasks. The task list and board don't show due dates yet.
- Reports: CSV only, no PDF. Breakdowns describe tasks as they are now, not as they were during the range. Deleted tasks are gone from every figure, including "created". Completion dates exist only where a status change was recorded, and a reopened task is dated by its last completion. Priorities are Low, Medium and High; there is no Urgent. The assignee breakdown names at most 20 people and the project breakdown 50; an export holds at most 5,000 tasks; a range is at most 366 days; the trend is omitted when a range holds more than 10,000 rows for a series. Tasks completed in the range are listed by last update, not by completion time. Reports can't be saved or scheduled.
- Subtasks: one level only. Ticking a subtask off sets it to Completed and unticking to To do, losing an In progress or In review status (use Edit for those). An existing task can only be attached as a subtask through the API. A task that has subtasks can't be deleted or moved to another project until they are deleted or detached, and a subtask can't be moved without detaching it; there is no "delete with all subtasks". Subtasks aren't nested under their parent in the list, board or calendar: they are separate rows that name their parent.
- Recurring tasks: the next occurrence is created only when the current one is completed, so a task nobody completes doesn't produce another, and the calendar shows no future occurrences ahead of time. Rules are daily, weekly and monthly by day of the month (no "second Tuesday", yearly or custom date lists). Subtasks and dependencies aren't carried to the next occurrence. Completing by mistake still creates the next task: reopen the old one and delete the new one, then set the repeat again (deleting the new one ends the series, because it holds the schedule). Days skipped by a late completion are not created afterwards and don't count towards the occurrence limit. The schedule's zone is that of whoever saved it last, so in a team it can differ from a teammate's; the card names it. A generated task that lost its predecessor (deleted) is still marked "Repeating" in reports only while it holds an active schedule. History records written in the same instant (for example "created this task" and "set this task to repeat") can appear in either order.
- Dependencies: within one project only, and planning notes only (no Blocked status, nothing is prevented or scheduled from them). They are shown on the task page and in its history, not on the board, calendar or reports. The add form offers at most 500 tasks of the project. A task with dependencies can't be moved to another project until they are removed. Removing a dependency has no confirmation step; it can be added again.
- Pagination: the task list, projects grid and board columns page a list that is already loaded for the user; filters, search, sorting and the status counts still apply to the whole list. The page isn't a way to load less data.
- Labels: a label lives in one workspace (personal or a team) and can't be moved or shared between them; a team's label can be created by any member but only renamed, recolored or deleted by its owner and admins. A move to another workspace takes a task's labels off rather than recreating them there. The color palette is fixed at nine. The label filter works on the tasks already loaded (like the other list filters) and is not kept in the address, so it resets on reload; Calendar and Reports have no label filter, and the report CSV has no label column. Deleting a label isn't recorded in each task's history, and earlier history entries about it no longer show its name. Renaming a label changes how past history entries read (names are looked up when read).
- Templates: a template lives in one workspace and can't be moved between them; a team's template can be created and duplicated by any member but only edited or deleted by its owner and admins. A member using a team template gets an unassigned task, because members can't assign. Subtasks are titles only (they start as To do, Medium, unassigned, with no due date or labels), dependencies are not part of a template, and the due date is a number of days without a time of day. A template can't be made from an existing task.
- Time tracking: the timer is shown on task pages only (no always-visible timer in the sidebar). Manual entries may overlap each other or a timer; nothing checks for double-counted time. One entry is at most 24 hours. The task page lists the newest 100 entries (the total counts all). Entries can't be moved to another task, an owner or admin can delete but not edit other people's entries, and a deleted account's entries are deleted with it. Reports give time per task and in total, not per person, and there is no billing or rate.
- Attachments: files are stored on the server's own disk, so each server has its own (a file attached through the Docker app on :3080 can't be downloaded through `npm run dev` on :3000 and the other way round, as with uploaded avatars), and there is no virus scanning. One file at a time, up to 10 MB and 20 per task; no drag and drop, previews, thumbnails or versions. Only images open in the browser; PDFs and other documents download. The type check looks at a file's first bytes, not its whole structure. A file can't be moved to another task, and a comment can't have its own attachment.
- Command palette: search matches whole substrings of each word (no typo tolerance, stemming or relevance ranking); results are the 5 most recently updated per kind with no "show more". Comments, members and notifications aren't searched. Recent only records what was opened from the palette and isn't synced between browsers. The sidebar's Search button takes 48px above the menu, and the menu now also has Reports and Templates links, so in a window shorter than about 915px the menu scrolls once both the Projects and Tasks groups are open. The mobile drawer has no search button of its own (it is in the top bar), and Ctrl/Cmd+K does nothing while the drawer or another dialog is open.
- Reminders: in-app notifications only (no email, push or browser notification, so nothing is shown if Taskwell isn't open; it is waiting in the bell next time). Five fixed times, no custom offset. Accuracy is the scheduler's tick (20 s by default) plus the bell's poll (10 s). The scheduler runs inside the web server process, so reminders are sent only while a server is running (they go out when it next starts) and it would not run on a host that only executes request handlers. A reminder is the task's due date minus an offset, so a task without a due date has nothing to send. A reminder that was passed over because its task was completed or out of reach at the time is not sent later. In a team, "1 day before" is counted in the zone of the person who set it. The card shows "Its time has passed" for both sent and passed-over reminders.
- Notifications are in-app only, apart from the invitation email: there are no email or push notifications, no per-user notification settings, and live updates are polled, so the badge and list can lag by up to about 10 seconds (longer after failed requests, while the wait backs off to at most a minute). Read notifications are kept indefinitely.
- Someone invited before they have an account gets the email but no in-app notification after signing up; the invitation is listed on their Teams page.
- Invitation emails need `RESEND_API_KEY` and `EMAIL_FROM`; without them invitations still work through the shared link and the app says no email was sent. Delivery is only known as far as Resend accepting the message; bounces aren't tracked.
- Teams: there is no ownership transfer, so an owner can't leave their team; a project can't be moved between personal and team after creation.
- Settings: email changes are not supported; the account email is read-only. Team ownership can't be transferred, so a team owner must delete their teams before deleting their account. The sign-in, password and two-factor throttles are in-memory and per process. A two-factor code can be reused within its 30-second window (there is no replay record), and there is no tool to rotate `TWO_FACTOR_ENCRYPTION_KEY` or to regenerate recovery codes without turning 2FA off and on. The time zone preference is used for every date shown in the dashboard (due dates, the calendar, created/updated dates, comment, activity and notification times); analytics stay in UTC, and invitation emails state their expiry date in UTC. Avatars are stored on the app server's disk (one Docker volume), so several app instances would need shared storage. During a database outage "Try again" on the unavailable page returns to `/dashboard` rather than the exact page.
- On phones the task table scrolls horizontally inside its card.
- Dates are shown in the account's time zone from Settings, or the browser's zone when none is saved. Without a saved zone, dates rendered on the server are in UTC for a moment and switch to the browser's zone as the page loads.
