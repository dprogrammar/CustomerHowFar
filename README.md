# CustomerHowFar

Find trusted artisans and businesses near you.

CustomerHowFar is a Nigerian marketplace connecting customers with trusted artisans and local businesses. It is built with Next.js (App Router), TypeScript and Tailwind CSS.

## Requirements

- Node.js (LTS)
- npm
- Git

## Getting started

```bash
git clone https://github.com/dprogrammar/CustomerHowFar.git
cd CustomerHowFar
npm install
cp .env.example .env.local   # then fill in the DEV project's values (see Environments)
npx prisma migrate deploy    # set up the dev database
npm run db:seed
npm run dev:admin -- you@example.com   # a dev admin account; asks for its password
npm run dev
```

Open http://localhost:3000 in your browser.

## Scripts

| Command                | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `npm run dev`          | Start the development server                      |
| `npm run build`        | Build (on Vercel production: migrate, then build) |
| `npm run start`        | Run the production build                          |
| `npm run lint`         | Lint the code with ESLint                         |
| `npm run format`       | Format the code with Prettier                     |
| `npm run format:check` | Check formatting without writing                  |
| `npm run test:start`   | Check that /start (the QR code page) still works  |
| `npm run db:seed`      | Seed categories, states/LGAs and settings         |
| `npm run dev:admin`    | Create a dev admin account and set its password   |
| `npm run make-admin`   | Promote a signed-up user to admin                 |

## Environments

There are two Supabase projects. **Development and tests never use the production database.**

|                    | Development                                | Production                                    |
| ------------------ | ------------------------------------------ | --------------------------------------------- |
| Supabase project   | `customerhowfar-dev`                       | the live project (ref `vzgbwqthcrctahysaoyf`) |
| Settings live in   | `.env.local` (your machine)                | Vercel project settings                       |
| Emails             | written to `EMAIL_TEST_OUTBOX`, never sent | sent by Brevo                                 |
| Push notifications | off (`PUSH_NOTIFICATIONS=off`)             | on                                            |
| Cloudinary folder  | `dev/customerhowfar` (`CLOUDINARY_FOLDER`) | `customerhowfar`                              |

- **`.env.prod.local`** (git-ignored, on your machine only) holds the production values. It is
  only for deliberate one-off production tasks, never for development or tests. Never name it
  `.env.production.local` (or create `.env.production`): Next.js loads those automatically for
  every local `next build`/`next start`, which would connect your local app to production. The
  guard refuses to run while either exists.
- **Safety guard** (`scripts/env-guard.mjs`): every test suite, seed, clean-up and admin script,
  and the Prisma CLI, refuses to run if the database or Supabase URL points at the production
  project, and so do `next dev`, `next build` and `next start` on your machine. For a deliberate
  one-off production task, prefix the command with
  `ALLOW_PRODUCTION=yes`: it then loads `.env.prod.local` for that run only, e.g.
  `ALLOW_PRODUCTION=yes npm run make-admin -- someone@example.com`. To see which project you're
  pointed at: `node scripts/env-guard.mjs`.
- **Migrations**: create them in development (`npx prisma migrate dev`, against the dev project).
  A production deploy on Vercel applies pending migrations (`prisma migrate deploy` with the
  production `DIRECT_URL`) before building. If a migration fails, the deploy stops and the current
  version keeps running. Keep migrations backward compatible (add, don't rename or drop in the
  same deploy), because the old code keeps running until the new build is live. Preview deploys
  never run migrations.

## Project structure

```
src/
  app/          Routes, layouts and pages (App Router)
  components/   Reusable UI components
  config/       Site-wide configuration (name, tagline, etc.)
  lib/          Utilities and shared logic
  types/        Shared TypeScript types
```

## Operations

> **Never remove or rename `/start`; it is printed on QR code flyers. If it must move, keep
> `/start` working with a permanent redirect.** `npm run test:start` fails if `/start` stops
> returning a working page (set `BASE_URL` to check the live site).

- **Daily job** (`/api/cron/daily`, Vercel Cron at 03:00 UTC, protected by `CRON_SECRET`): ID
  image retention, retries of failed file deletions, rate-limit cleanup and orphaned-upload
  cleanup. It also queries the database, which keeps the free Supabase project from pausing.
  `/api/health` shows when it last succeeded; admins can see it at `/admin/system`.
- **Orphaned uploads**: files in `customerhowfar/{users,proofs,identity}/` that no record
  references and that are older than 24 hours are deleted in small batches. Dry run:
  `GET /api/cron/daily?task=orphans&dryRun=1` with the cron secret.
- **Analytics** (`src/lib/analytics`, admin page `/admin/analytics`): first-party and
  anonymous, no third-party services and no extra cookies. Visitors are counted with a
  daily-rotating salted hash; raw events are rolled up by the daily job and deleted after 7
  days. Owners see their own stats on `/dashboard`. Details in `docs/DATA_MODEL.md`.
- **Rate limits**: one database-backed limiter (`src/lib/rate-limit.ts`, all limits in one
  table). IPs and emails are stored only as keyed hashes.
- **Security headers**: set in `next.config.ts` (static CSP without nonces so pages stay
  static; HSTS, nosniff, Referrer-Policy, Permissions-Policy, frame-ancestors 'none').
- **Error monitoring**: Sentry, only when `NEXT_PUBLIC_SENTRY_DSN` is set. Personal data is
  scrubbed (`src/lib/monitoring/scrub.ts`); no session replay or tracing; the browser SDK is
  loaded only when an error happens. Source maps upload only with `SENTRY_AUTH_TOKEN`.
- **App installation is OFF** (`src/config/pwa.ts`): the manifest uses `"display": "browser"`
  so the site isn't installable (some Android browsers wrap installable sites in APKs that Play
  Protect flags). `public/sw.js` only cleans up workers/caches from earlier versions. The old
  caching worker, offline page and re-enable steps are in `pwa/`.
