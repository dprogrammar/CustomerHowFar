// `npm run build`. Database migrations are applied before the app is built:
//   - Vercel PRODUCTION deploy (main): `prisma migrate deploy` on the production database
//     (DIRECT_URL from the Vercel Production settings).
//   - Vercel deploy of the `staging` branch: the same on the DEV database (Preview settings), so
//     the staging site always has the schema its code needs. Refused if DIRECT_URL points at the
//     production project.
// If a migration fails, the build stops here and Vercel keeps serving the current version, so new
// code never runs against an old database. Other preview branches and local builds never migrate.
import { spawnSync } from "node:child_process";
import { PRODUCTION_PROJECT_REF } from "./env-guard.mjs";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`\n[build] "${command} ${args.join(" ")}" failed: stopping the build.\n`);
    process.exit(result.status ?? 1);
  }
}

function requireDirectUrl() {
  if (!process.env.DIRECT_URL) {
    console.error("\n[build] DIRECT_URL is not set in Vercel: can't apply migrations. Stopping.\n");
    process.exit(1);
  }
}

const env = process.env.VERCEL_ENV;
const branch = process.env.VERCEL_GIT_COMMIT_REF;
if (env === "production") {
  requireDirectUrl();
  console.log("[build] Production deploy: applying database migrations…");
  run("npx", ["prisma", "migrate", "deploy"]);
} else if (env === "preview" && branch === "staging") {
  requireDirectUrl();
  if (process.env.DIRECT_URL.includes(PRODUCTION_PROJECT_REF)) {
    console.error("\n[build] Staging must use the dev database, not production. Stopping.\n");
    process.exit(1);
  }
  console.log("[build] Staging deploy: applying database migrations to the dev database…");
  run("npx", ["prisma", "migrate", "deploy"]);
} else {
  const where = process.env.VERCEL ? `Vercel ${env ?? ""} build (${branch ?? "?"})` : "local build";
  console.log(`[build] No database migrations (${where}).`);
}

run("npx", ["next", "build"]);
