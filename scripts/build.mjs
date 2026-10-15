// `npm run build`. On a Vercel PRODUCTION deploy, database migrations are applied first
// (`prisma migrate deploy`, using the production DIRECT_URL from the Vercel project settings),
// then the app is built. If a migration fails, the build stops here and Vercel keeps serving the
// current version, so new code never runs against an old database.
// Preview deploys and local builds never run migrations.
import { spawnSync } from "node:child_process";

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

if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DIRECT_URL) {
    console.error("\n[build] DIRECT_URL is not set in Vercel: can't apply migrations. Stopping.\n");
    process.exit(1);
  }
  console.log("[build] Production deploy: applying database migrations…");
  run("npx", ["prisma", "migrate", "deploy"]);
} else {
  const where = process.env.VERCEL ? `Vercel ${process.env.VERCEL_ENV ?? ""} build` : "local build";
  console.log(`[build] No database migrations (${where.trim()}).`);
}

run("npx", ["next", "build"]);
