// Production safety guard. Every test suite, seed, clean-up and admin script loads its
// environment through loadEnv(), which refuses to run against the PRODUCTION Supabase project.
//
//   Development (default): loads .env.local (+ .env). If any database or Supabase URL points at
//   production, the script stops with an error.
//   ALLOW_PRODUCTION=yes: a deliberate one-off production task. Loads .env.prod.local for this
//   run only (it overrides everything else) and prints a warning.
//
// The production file is deliberately NOT called .env.production.local: Next.js loads that name
// automatically for every local `next build`/`next start`, which would point the local app at
// production. Files Next.js would load that way are refused outright.
//
// Also a command: `node scripts/env-guard.mjs` checks the current environment (exit code 1 if it
// points at production), e.g. before starting a test server.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

/** The live project. Development and tests use a separate project (customerhowfar-dev). */
export const PRODUCTION_PROJECT_REF = "vzgbwqthcrctahysaoyf";
const WATCHED = ["NEXT_PUBLIC_SUPABASE_URL", "DATABASE_URL", "DIRECT_URL"];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Production values for one-off tasks (git-ignored; never loaded by Next.js). */
export const PRODUCTION_ENV_FILE = ".env.prod.local";
/** Next.js loads these automatically in production mode, so they must not exist locally. */
const AUTO_LOADED = [".env.production.local", ".env.production"];

/** Which watched variables point at the production project. */
export function productionVars(env = process.env) {
  return WATCHED.filter((name) => (env[name] ?? "").includes(PRODUCTION_PROJECT_REF));
}

function fail(message) {
  console.error(`\n[env-guard] ${message}\n`);
  process.exit(1);
}

/**
 * Loads the environment for a script or test run, refusing production unless
 * ALLOW_PRODUCTION=yes. Returns { production } so callers can be extra careful.
 */
export function loadEnv({
  projectDir = ROOT,
  script = path.basename(process.argv[1] ?? "script"),
} = {}) {
  for (const name of AUTO_LOADED) {
    if (fs.existsSync(path.join(projectDir, name))) {
      fail(
        `${script} refused to run: ${name} exists. Next.js loads it automatically for local builds ` +
          `and servers. Keep production values in ${PRODUCTION_ENV_FILE} instead.`,
      );
    }
  }
  if (process.env.ALLOW_PRODUCTION === "yes") {
    const file = path.join(projectDir, PRODUCTION_ENV_FILE);
    if (!fs.existsSync(file)) fail(`ALLOW_PRODUCTION=yes, but ${file} doesn't exist.`);
    config({ path: file, override: true, quiet: true });
    if (productionVars().length !== WATCHED.length) {
      fail(`${PRODUCTION_ENV_FILE} doesn't point at the production project; nothing was run.`);
    }
    console.warn(`\n[env-guard] ${script}: running against PRODUCTION (ALLOW_PRODUCTION=yes).\n`);
    return { production: true };
  }
  config({
    path: [path.join(projectDir, ".env.local"), path.join(projectDir, ".env")],
    quiet: true,
  });
  const hits = productionVars();
  if (hits.length) {
    fail(
      `${script} refused to run: ${hits.join(", ")} point${hits.length === 1 ? "s" : ""} at the ` +
        `PRODUCTION Supabase project (${PRODUCTION_PROJECT_REF}).\n` +
        "  Development and tests must use the dev project in .env.local.\n" +
        "  For a deliberate one-off production task, run it with ALLOW_PRODUCTION=yes " +
        `(that loads ${PRODUCTION_ENV_FILE} for that run only).`,
    );
  }
  for (const name of WATCHED) {
    if (!process.env[name]) fail(`${script} refused to run: ${name} is not set.`);
  }
  return { production: false };
}

/** The Supabase project ref of the loaded environment (for logs; never secret). */
export function projectRef(env = process.env) {
  return new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { production } = loadEnv({ script: "env-guard" });
  console.log(`[env-guard] OK: ${production ? "PRODUCTION" : "dev"} project ${projectRef()}`);
}
