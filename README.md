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

| Command                   | Description                                       |
| ------------------------- | ------------------------------------------------- |
| `npm run dev`             | Start the development server                      |
| `npm run build`           | Build (on Vercel production: migrate, then build) |
| `npm run start`           | Run the production build                          |
| `npm run lint`            | Lint the code with ESLint                         |
| `npm run format`          | Format the code with Prettier                     |
| `npm run format:check`    | Check formatting without writing                  |
| `npm run test:start`      | Check that /start (the QR code page) still works  |
| `npm run test:unit`       | Fast checks that need no app server               |
| `npm run test:e2e`        | Full regression (see Testing)                     |
| `npm run test:lighthouse` | Lighthouse scores for key pages                   |
| `npm run db:seed`         | Seed categories, states/LGAs and settings         |
| `npm run dev:admin`       | Create a dev admin account and set its password   |
| `npm run make-admin`      | Promote a signed-up user to admin                 |

## Environments

There are two Supabase projects. **Development, tests and the staging site never use the
production database.**

|                  | Development (your machine)     | Staging                                                   | Production                                |
| ---------------- | ------------------------------ | --------------------------------------------------------- | ----------------------------------------- |
| Address          | http://localhost:3000          | https://staging.customerhowfar.com.ng                     | https://www.customerhowfar.com.ng         |
| Git branch       | any                            | `staging`                                                 | `main`                                    |
| Supabase project | `customerhowfar-dev`           | `customerhowfar-dev` (shared with dev)                    | the live project (`vzgbwqthcrctahysaoyf`) |
| Settings         | `.env.local`                   | Vercel, Preview environment                               | Vercel, Production environment            |
| Emails           | test outbox file, never sent   | sent, subject starts with `[TEST]`, never to test domains | sent                                      |
| Push             | off (`PUSH_NOTIFICATIONS=off`) | off                                                       | on                                        |
| Daily cron job   | run by tests only              | off                                                       | on (03:00 UTC)                            |
| Search engines   | n/a                            | blocked (noindex, robots.txt)                             | indexed                                   |
| Cloudinary       | `dev/customerhowfar`           | `dev/customerhowfar`                                      | `customerhowfar`                          |

The staging site shows a yellow "TEST SITE" banner on every page. Staging is any Vercel
_preview_ deployment (`VERCEL_ENV=preview`, see `src/config/environment.ts`); its build refuses to
run if any Preview database or Supabase setting points at production.

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
  same deploy), because the old code keeps running until the new build is live. A deploy of the
  `staging` branch does the same on the dev database; other preview branches never migrate.

## Releasing

New features never go straight to the live site:

1. **Build on staging.** Work is committed and pushed to the `staging` branch. Vercel deploys it
   to https://staging.customerhowfar.com.ng (dev database, migrations applied to it
   automatically).
2. **Testers test.** Testers sign up on the staging site with their own email addresses (they get
   `[TEST]` emails there) and try the new features. Nothing they do touches real users or data.
3. **"Release to production".** Only when the owner says so, `staging` is merged into `main` and
   pushed. Vercel builds production: pending migrations are applied to the production database
   first (a failure stops the deploy and the current version keeps running), then the new
   version goes live.

```bash
git checkout main && git pull
git merge --no-ff staging -m "Release to production"
git push origin main
git checkout staging
```

Fixes that are urgent for the live site follow the same path (staging first, then release), so
`main` never has changes that staging doesn't. Running `npm run test:e2e` uses the same dev
database as the staging site: it removes only what it created and resets the dev baseline
settings (fee off, homepage promotion on), so avoid running it while testers are using staging.

## Testing

The regression and end-to-end suites live in `tests/e2e/`. They drive a real browser against a
local production build and use the **dev** project only: every suite goes through the safety
guard, and the runner also checks which project the Next.js server would load before starting
it. They never send real emails (test outbox) or push notifications, only create accounts with
`chf-e2e-…@example.com` addresses, and clean up after themselves.

**Needs:** `.env.local` with the dev project's values (see Environments), the dev database
migrated and seeded, and Chrome or Edge installed (set `CHROME_PATH` if it isn't found).

```bash
npm run test:unit                          # fast: database, help-assistant and analytics rules
npm run test:e2e                           # everything: builds, starts a server on :3000, runs all suites
npm run test:e2e -- test-public test-admin # only these suites (list them with: npm run test:e2e -- --list)
npm run test:e2e -- --no-build test-trust  # reuse the current build
npm run test:lighthouse                    # Lighthouse scores for home, search, category, business pages
BASE_URL=https://www.customerhowfar.com.ng npm run test:start   # read-only check of the live /start page
```

What a run does: checks the environment is dev, resets dev to its baseline, builds, starts
`next start` with emails going to a test outbox file, runs the suites in order, stops the server,
then `dev-cleanup.mjs` removes
everything the run created (test users, listings, uploads in `dev/customerhowfar`, analytics,
rate-limit rows) and resets the dev baseline (fee off, homepage promotion on, Lagos live). Each
suite's full log, screenshots and the outbox are in `tests/e2e/.output/` (git-ignored); the
console shows a PASS/FAIL line per suite with the failing checks. With `--no-build`, pages the
previous server regenerated (fee and promotion wording, category counts) can be out of date, so
`test-start-qr`, `test-free-promo`, `test-fee-wording` and `test-public` need a full run.

- **Suites** (`tests/e2e/test-*.mjs`) each create their own data, check one area (listings,
  search, admin, payments, ID checks, notifications, analytics, accessibility at 360px…) and
  delete it again. `notify-trigger.ts` and `analytics-trigger.mts` call app functions directly
  (for example with the clock set to a past date).
- **Clean-up**: `dev-cleanup.mjs` (end of every run) and `cleanup-test-users.mjs` (removes any
  leftover `chf-e2e-` users and their files) refuse to run on anything but the dev project.
- **No real emails**: app emails go to the test outbox. The two steps that make Supabase itself
  send an email (a real sign-up, and a password reset for an existing account) are skipped
  unless you set `E2E_SEND_AUTH_EMAILS=1`; the dev project's built-in mailer only allows a few
  emails an hour.
- Never point these at production: the guard refuses, and `ALLOW_PRODUCTION=yes` is not meant
  for test runs.

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
