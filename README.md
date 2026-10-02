# Taskwell Application Guide

Taskwell is a responsive SaaS marketing site for a team task-management concept. It includes a database-backed mailing-list signup, account registration and login, a protected dashboard placeholder, a persisted light/dark theme, and a marketing homepage. The task-board shown on the homepage and the dashboard are presentation examples; task management itself is not yet implemented.

## Contents

- [Product overview](#product-overview)
- [Homepage and site map](#homepage-and-site-map)
- [Application behavior](#application-behavior)
- [Architecture](#architecture)
- [Database](#database)
- [Configuration](#configuration)
- [Run locally](#run-locally)
- [Run with Docker](#run-with-docker)
- [API reference](#api-reference)
- [Validation and troubleshooting](#validation-and-troubleshooting)
- [Current limitations and next steps](#current-limitations-and-next-steps)

## Product overview

The homepage introduces Taskwell as a shared work board intended to reduce status meetings and make ownership and deadlines easier to see. It contains a hero signup form, social proof, problem/benefit sections, an illustrative product-board mockup, feature descriptions, testimonials, pricing, FAQs, and calls to action.

The app also provides credential-based account registration and login using NextAuth v4. A signed-in user can visit a protected dashboard placeholder. Mailing-list subscribers and application users are separate database records and separate signup flows.

### Technology

- Next.js 14 App Router and React 18
- TypeScript with strict checking
- Tailwind CSS v3, with project color/font tokens
- Bricolage Grotesque and Inter via `next/font`
- NextAuth v4 Credentials provider with JWT sessions
- Prisma 6 and PostgreSQL
- bcryptjs password hashing
- Docker Compose for an optional PostgreSQL and app container setup

### Visual system

The existing identity uses Bricolage Grotesque for display text and Inter for body text. Tailwind tokens are `ink` (`#14213D`), `paper` (`#FAFAF7`), `brand` (`#2F6FED`), `brand-dark` (`#1E4FB8`), `accent` (`#F2A93B`), and `muted` (`#5B6475`). Dark mode uses the `dark` class with `dark-background` (`#0F172A`), `dark-surface` (`#172033`), and `dark-muted` (`#A8B0BF`). Global styles provide focus-visible outlines, color transitions, and reduced-motion handling.

## Homepage and site map

The homepage is assembled in `app/page.tsx` in this order:

1. `Header`
2. `Hero` with `SignupForm`
3. `SocialProof`
4. `Results` with a live subscriber count and safe fallback
5. `Problem`
6. `Benefits`
7. `ProductShowcase`
8. `HowItWorks`
9. `Features`
10. `Testimonials`
11. `Pricing`
12. `Faq`
13. `FinalCta`
14. `Footer`
15. `StickyCta`

The header links to pricing and FAQ, and exposes login/signup links when logged out or Dashboard/Log out controls when logged in. The theme toggle is available at every viewport; the header navigation is hidden on mobile, where no replacement menu is provided. On small screens, the sticky signup CTA appears after scrolling down the page.

### Other routes

| Route | Purpose |
| --- | --- |
| `/` | Marketing homepage |
| `/signup` | Create a Taskwell account |
| `/login` | Sign in with email and password |
| `/dashboard` | Protected account/dashboard placeholder |
| `/api/subscribe` | Add a mailing-list subscriber |
| `/api/register` | Register an application user |
| `/api/auth/[...nextauth]` | NextAuth sign-in, session, and sign-out handlers |

## Application behavior

### Marketing signup

The homepage form checks for an empty or malformed email in the browser, then posts the normalized address to `/api/subscribe`. While the request is in progress, the button is disabled and reads “Joining...”. A successful response displays the API message; errors are shown next to the input and the form can be retried. The input uses an accessible label, `aria-invalid`, `aria-describedby`, and an alert region for errors.

The API writes to the `Subscriber` table. It does not send a confirmation email. The success text explicitly says confirmation email is not configured.

### Results count

`Results` is a Server Component. It queries the total number of mailing-list subscribers and displays the count when greater than zero. If there are no subscribers or the database is unavailable, it shows the static fallback from `lib/content.ts`. Only an aggregate count is rendered; subscriber addresses are not exposed.

### Account registration and login

The `/signup` page collects a name, email, password, and confirmation. The page checks required fields, email shape, an eight-character minimum, and matching passwords before calling `/api/register`. The API normalizes email, hashes passwords with bcryptjs, and stores users in the Prisma `User` table. Duplicate account creation is rejected.

The `/login` page authenticates through the NextAuth Credentials provider. Sessions use JWTs. Middleware protects `/dashboard`, and the page performs its own server-side session check as well. Logging out posts to the NextAuth sign-out endpoint.

### Light and dark theme

The selected theme is stored in browser `localStorage` under `taskwell-theme` as `light` or `dark`. With no saved selection, the app follows `prefers-color-scheme`. A small inline script in the root document head applies the theme class before page paint to reduce theme flash. The toggle is a keyboard-operable button with an accessible name and inline SVG icon. Color transitions are disabled when reduced motion is requested.

### Static marketing content

Marketing copy and arrays for social proof, benefits, steps, feature descriptions, testimonials, pricing, FAQ, and CTA text live in `lib/content.ts`. These values are not read from the database or a CMS. The product-board mockup and dashboard are illustrative, not connected to live Taskwell task data.

## Architecture

The homepage, header, and marketing sections are Server Components by default. `SignupForm`, `StickyCta`, and `ThemeToggle` are Client Components because they require browser state, event handlers, or effects. Database helpers import `server-only`; database credentials and Prisma calls stay on the server.

```text
app/page.tsx
	-> Header and marketing sections
	-> Results -> lib/subscribers.ts -> lib/prisma.ts -> PostgreSQL
	-> SignupForm -> POST /api/subscribe -> Subscriber table

/signup -> POST /api/register -> lib/users.ts -> User table
/login -> NextAuth Credentials -> lib/users.ts -> User table
/dashboard -> authenticated server-rendered placeholder
```

The root layout defines metadata, fonts, global styles, and the pre-paint theme initializer. Tailwind uses class-based dark mode and the existing tokens in `tailwind.config.ts`.

## Database

PostgreSQL is the only configured database. Prisma models are in `prisma/schema.prisma`:

| Model | Fields | Use |
| --- | --- | --- |
| `User` | `id`, `name`, unique `email`, `passwordHash`, `createdAt` | Account registration and credentials login |
| `Subscriber` | `id`, unique `email`, `createdAt`, `updatedAt` | Homepage mailing-list signup |

The checked-in migrations create the `User` table first and then the `Subscriber` table. Email addresses are trimmed and lowercased before writes. Database uniqueness constraints are authoritative for duplicate handling; the subscribe API maps Prisma unique-constraint errors to HTTP `409`.

For development, `npm run db:migrate` applies migrations and can create a new migration when the schema changes. For an already-built deployment, `npm run db:deploy` applies checked-in migrations without creating new ones. Prisma Client is generated by the package `postinstall` script and in the Docker build.

## Configuration

Copy `.env.example` to `.env` and supply values for the environment you use. The checked-in example contains blank database/auth secrets; do not commit a populated `.env` file.

| Variable | Required for | Description |
| --- | --- | --- |
| `DATABASE_URL` | Prisma/local app | PostgreSQL connection URL used by Prisma. For a host-run app, the host must be able to reach the database. |
| `AUTH_SECRET` | NextAuth | Secret used to sign/encrypt authentication tokens. Generate and store a private value. |
| `NEXTAUTH_URL` | Auth deployments | Canonical application URL; use the actual deployed origin in production. |
| `POSTGRES_USER` | Docker Compose database | User to initialize the Postgres container with. |
| `POSTGRES_PASSWORD` | Docker Compose database | Password for that database user. |
| `POSTGRES_DB` | Docker Compose database | Database name initialized by the container. |
| `APP_PORT` | Optional Docker Compose app | Host port mapped to the app container; defaults to `3000`. |

Docker Compose builds the app’s connection URL from the three `POSTGRES_*` values and connects to the service named `db`. For a local Next.js process connecting to that container, set `DATABASE_URL` to a PostgreSQL URL whose host is `localhost` and port is `5432`.

Generate a private auth secret with `openssl rand -base64 32`, then put the result in your local environment file or deployment secret store. Do not put generated secrets in documentation, source control, or client-side code.

## Run locally

Requirements: Node.js, npm, and a PostgreSQL database reachable from the machine.

1. Install dependencies: `npm install`.
2. Copy `.env.example` to `.env` and configure `DATABASE_URL`, `AUTH_SECRET`, and `NEXTAUTH_URL`.
3. Apply the schema: `npm run db:migrate`.
4. Start the development server: `npm run dev`.
5. Open `http://localhost:3000`.

Useful commands:

```bash
npm run dev          # development server
npm run build        # optimized production build
npm run start        # serve the production build
npm run lint         # Next.js ESLint checks
npx tsc --noEmit     # TypeScript check
npm run db:migrate   # development migration workflow
npm run db:deploy    # apply existing migrations
npx prisma generate  # regenerate Prisma Client
```

For production, set environment variables in the hosting platform, run `npm run db:deploy` as a deployment step, then build and start the app. Never expose `DATABASE_URL` to client-side code.

## Run with Docker

1. Copy `.env.example` to `.env`.
2. Set `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and `AUTH_SECRET`. Set `NEXTAUTH_URL` if the app will not use the default local URL.
3. Build and start the database and app:

```bash
docker compose up --build
```

The app is served at `http://localhost:3000` by default; Postgres is exposed on port `5432`. The app waits for the database health check and runs `prisma migrate deploy` on startup. The named `db-data` volume persists Postgres data across container restarts.

To start only the database and run Next.js on the host, also set a host-reachable `DATABASE_URL` in `.env`, then run:

```bash
docker compose up -d db
npm run db:migrate
npm run dev
```

Stop Compose with `docker compose down`. This preserves the named database volume. Removing the volume deletes the local database data.

## API reference

### `POST /api/subscribe`

Request JSON:

```json
{ "email": "user@example.com" }
```

Email is trimmed, lowercased, checked for presence, limited to 254 characters, and validated on the server. Responses:

| Status | Meaning |
| --- | --- |
| `201` | Subscriber stored; response includes a truthful success message (no email was sent). |
| `400` | Malformed JSON, missing/empty email, wrong email type, or invalid email. |
| `409` | Email is already subscribed. |
| `503` | Database or unexpected persistence failure; response does not reveal internal details. |

Response bodies use `{ "success": boolean, "message": string }`.

### `POST /api/register`

Accepts `name`, `email`, and `password`, validates required fields and email shape, hashes the password, and creates a `User`. It returns `201` on success and `400` for invalid input or registration errors. The interactive `/signup` page additionally enforces an eight-character password and matching confirmation before calling the endpoint.

### NextAuth routes

`/api/auth/[...nextauth]` is the NextAuth v4 route handler for credential sign-in, session operations, and sign-out. The configured sign-in page is `/login`.

## Validation and troubleshooting

- `npm run build`: production compile, type validation, static generation, and route output.
- `npm run lint`: ESLint using `next/core-web-vitals`.
- `npx tsc --noEmit`: standalone TypeScript check.
- `npx prisma validate`: validate the Prisma schema; Prisma needs `DATABASE_URL` defined for validation.
- `npx prisma migrate status`: inspect applied/pending migrations against a reachable database.
- There is no dedicated automated unit or end-to-end test command configured in `package.json` yet.

Common issues:

- **Prisma cannot connect:** verify `DATABASE_URL`, database availability, host/port reachability, and that migrations have been applied.
- **Compose asks for missing variables:** populate the required values in `.env`; the Compose file intentionally has no default database password.
- **NextAuth reports `NO_SECRET`:** set `AUTH_SECRET` in the server environment.
- **Signup returns `503`:** the API is reachable, but persistence failed. Check server logs and database connectivity; internal database errors are intentionally not sent to the browser.
- **Subscriber count fallback appears:** there may be no stored subscribers, or the database could not be queried. The homepage is designed to remain available in either case.

## Current limitations and next steps

- The marketing product-board mockup and `/dashboard` workspace are static examples; task/board CRUD, teams, invitations, and task persistence are not implemented.
- Social-proof names, testimonials, pricing, FAQ, benefits, and other marketing copy are static in `lib/content.ts`; there is no CMS.
- Signup stores a subscriber but does not send confirmation email, verify ownership, or provide unsubscribe management.
- The account system has no email verification, password reset, rate limiting, or abuse protection. Configure and review these before treating authentication as production-ready.
- The `/api/register` handler currently returns caught error messages in its `400` response. Replace that behavior with safe public messages before exposing registration in production.
- The registration page checks the eight-character password minimum, but `/api/register` itself currently checks only that a password is present. Add the minimum-length validation server-side before production use.
- The public signup endpoints should be paired with rate limiting or another abuse-control mechanism before public production launch.
- The visual proof/testimonial content is sample marketing content and should be replaced with approved, verified customer claims before publication.
- The hero includes a TODO for replacing the illustrative product view with a real optimized screenshot.

The email signup success response confirms database storage only. It does not claim that an email was sent.
