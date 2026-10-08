# Taskwell

Taskwell is a SaaS task and project management platform for teams to organize work, collaborate, and track progress.

## Features

* Projects and tasks
* Kanban board with drag and drop
* Subtasks and task dependencies
* Labels and recurring tasks
* Task templates
* Comments and activity history
* Team collaboration and invitations
* In-app notifications and reminders
* Calendar and reports
* Time tracking
* Task attachments
* Search and command palette
* Authentication with role-based access
* Light and dark mode
* Responsive and accessible UI

## Tech Stack

* **Next.js 14** — App Router
* **React 18**
* **TypeScript**
* **Tailwind CSS**
* **PostgreSQL**
* **Prisma**
* **NextAuth.js**
* **Docker & Docker Compose**
* **Resend** — team invitation emails

## Getting Started

### Requirements

* Node.js 18.18+
* npm
* PostgreSQL 16

### Installation

```bash
git clone https://github.com/adil-ramzan/taskwell.git
cd taskwell
npm install
cp .env.example .env
```

Configure the required environment variables in `.env`, then run:

```bash
npm run db:deploy
npm run dev
```

Open **http://localhost:3000**.

### Docker

```bash
cp .env.example .env
docker compose up --build
```

The application will be available at **http://localhost:3000**.

## Environment Variables

Create `.env` from `.env.example` and configure:

* `DATABASE_URL`
* `AUTH_SECRET`
* `NEXTAUTH_URL`
* `POSTGRES_USER`
* `POSTGRES_PASSWORD`
* `POSTGRES_DB`

Optional:

* `RESEND_API_KEY`
* `EMAIL_FROM`
* `TWO_FACTOR_ENCRYPTION_KEY`
* `APP_PORT`
* `REMINDER_POLL_MS`

Never commit `.env` or other secrets.

## Development

```bash
npm run dev
npm run lint
npx tsc --noEmit
npm run build
```

## Project Structure

```text
app/          Pages and API routes
components/   UI components
lib/          Server-side logic and validation
prisma/       Database schema and migrations
auth.ts       Authentication configuration
middleware.ts Route protection
```

## License

This project is for portfolio and demonstration purposes.
