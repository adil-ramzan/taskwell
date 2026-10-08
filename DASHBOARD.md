# Taskwell Dashboard

The Taskwell dashboard is the authenticated workspace for managing projects, tasks, teams, and productivity.

## Dashboard Features

### Projects

* Create, edit, and delete projects
* Personal and team projects
* Project progress and task counts
* Project search and sorting

### Tasks

* Create, edit, and delete tasks
* Status: To Do, In Progress, In Review, Completed
* Priority: Low, Medium, High
* Due dates and assignees
* List and Kanban board views
* Search, filtering, and pagination

### Collaboration

* Teams with owner, admin, and member roles
* Team invitations
* Task comments and @mentions
* Task activity history
* In-app notifications

### Productivity

* Subtasks and dependencies
* Labels
* Recurring tasks
* Task templates
* Reminders
* Time tracking
* File attachments
* Calendar
* Reports and CSV export
* Command palette (`Ctrl/Cmd + K`)

### Account

* Profile management
* Password changes
* Session management
* Time zone preferences
* Avatar selection/upload
* Optional two-factor authentication
* Account deletion
* Light and dark mode

## Access Control

All dashboard data is protected server-side.

* Users can access their personal projects.
* Team projects are available to team members.
* Team roles control administrative actions.
* Task access follows the project's access rules.
* Users can only access their own notifications, reminders, and account data.
* API requests use the authenticated session rather than trusting user IDs supplied by the client.

Unauthorized resources are generally returned as `404` to avoid exposing whether they exist.

## API Structure

The dashboard uses Next.js API routes under:

```text
app/api/
```

Main API areas:

```text
projects/
tasks/
teams/
notifications/
labels/
task-templates/
timer/
calendar/
reports/
search/
account/
```

Business logic and database access are separated into server-side modules under:

```text
lib/
```

Prisma manages the PostgreSQL database through:

```text
prisma/schema.prisma
prisma/migrations/
```

## Task Relationships

Tasks support:

* Subtasks — one level deep
* Dependencies — `blocked by` and `blocks`
* Recurring schedules
* Labels
* Reminders
* Time entries
* Attachments
* Comments

Relationship changes are validated server-side to prevent invalid projects, inaccessible resources, circular dependencies, and unsupported task structures.

## Recurring Tasks

Supported schedules:

* Daily
* Weekly
* Monthly

The next occurrence is created when a recurring task is completed. Recurring tasks can define an interval, weekdays, month day, end date, occurrence limit, and time zone.

## Reports

Reports provide:

* Task totals
* Status and priority breakdowns
* Assignee and project breakdowns
* Activity trends
* Time tracking totals
* Filtered task tables
* CSV export

Reports respect the same project and team access rules as the dashboard.

## File Attachments

Task attachments are stored on the server rather than in PostgreSQL.

* Maximum file size: 10 MB
* Maximum files per task: 20
* Supported images and common document/archive formats
* Files require task access to download
* Uploaded files are excluded from Git

For production deployments, persistent storage should be used for uploaded files.

## Development

Start the dashboard locally:

```bash
npm run dev
```

Apply database migrations:

```bash
npm run db:deploy
```

Run validation checks:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Project Structure

```text
app/dashboard/    Dashboard pages
app/api/          API routes
components/       UI components
lib/              Server logic and validation
prisma/           Database schema and migrations
auth.ts           Authentication
middleware.ts     Route protection
```

## Important Notes

* The dashboard does not use fake data.
* Authorization is enforced on the server.
* Database access uses Prisma.
* Authentication uses NextAuth.js with JWT sessions.
* Team invitation emails use Resend when configured.
* Reminders are processed by the application server.
* Uploaded files require persistent storage in production.
