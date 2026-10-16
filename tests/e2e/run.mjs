// Runs the end-to-end / regression suites against a local production build, on the DEV project
// only. Usage:
//   npm run test:e2e                         every suite (builds first)
//   npm run test:e2e -- test-public test-admin   only these suites
//   npm run test:e2e -- --no-build ...        reuse the current build
//   npm run test:e2e -- --list               list the suites
//   npm run test:unit                        only the suites that need no server (fast)
//   npm run test:lighthouse                  Lighthouse scores for key pages (needs a build)
//
// Steps: refuse unless both the scripts and the Next.js server would use the dev project ->
// build -> start a server on PORT (default 3000) with emails going to a test outbox file ->
// run the suites -> stop the server -> remove everything the run created and reset dev to its
// baseline (dev-cleanup.mjs). Full logs and screenshots go to tests/e2e/.output (git-ignored).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadEnv, PRODUCTION_PROJECT_REF, projectRef } from "../../scripts/env-guard.mjs";
import { OUTPUT_DIR, ROOT, outputFile } from "./lib/setup.mjs";

const args = process.argv.slice(2);
const PORT = Number(process.env.PORT ?? 3000);
const BASE = `http://localhost:${PORT}`;
const OUTBOX = outputFile("outbox.jsonl");
const SHOTS = path.join(OUTPUT_DIR, "shots");
const LOGS = path.join(OUTPUT_DIR, "logs");
const E2E = path.join(ROOT, "tests", "e2e");

// [name, how to run it]. Order matters: fee-wording suites run before suites that switch the
// fee directly in the database (which would leave the server's cached wording stale).
const full = (f) => ["node", [path.join(E2E, f), ROOT, BASE, OUTBOX, SHOTS]];
const shots = (f) => ["node", [path.join(E2E, f), ROOT, BASE, SHOTS]];
const basic = (f) => ["node", [path.join(E2E, f), ROOT, BASE]];
const tsx = (f, server = false) => [
  "npx",
  ["tsx", ...(server ? ["--conditions=react-server"] : []), path.join(E2E, f)],
];
/** Suites that need no running app server (database checks and pure unit tests). */
const NO_SERVER = new Set([
  "test-db",
  "test-assistant-unit",
  "test-assistant-scrub",
  "test-analytics-unit",
]);
const SUITES = [
  ["test-db", ["node", [path.join(E2E, "test-db.mjs"), ROOT]]],
  ["test-cloudinary", basic("test-cloudinary.mjs")],
  ["test-hardening", full("test-hardening.mjs")],
  ["test-assistant-unit", tsx("test-assistant-unit.ts", true)],
  ["test-assistant-scrub", tsx("test-assistant-scrub.ts")],
  ["test-analytics-unit", tsx("test-analytics-unit.mts")],
  ["test-assistant", full("test-assistant.mjs")],
  ["test-notifications", full("test-notifications.mjs")],
  ["test-fee-wording", basic("test-fee-wording.mjs")],
  ["test-free-promo", shots("test-free-promo.mjs")],
  ["test-footer-credit", shots("test-footer-credit.mjs")],
  ["test-business", shots("test-business.mjs")],
  ["test-areas", full("test-areas.mjs")],
  ["test-public", full("test-public.mjs")],
  ["test-admin", full("test-admin.mjs")],
  ["test-payments", full("test-payments.mjs")],
  ["test-identity", full("test-identity.mjs")],
  ["test-owner-progress", full("test-owner-progress.mjs")],
  ["test-users", full("test-users.mjs")],
  ["test-trust", full("test-trust.mjs")],
  ["test-no-install", basic("test-no-install.mjs")],
  ["test-analytics", full("test-analytics.mjs")],
  ["test-admin-404", shots("test-admin-404.mjs")],
  ["test-auth", shots("test-auth.mjs")],
  ["test-start-qr", shots("test-start-qr.mjs")],
  ["test-waitlist-ui", basic("test-waitlist-ui.mjs")],
  ["test-ui", ["node", [path.join(E2E, "test-ui.mjs"), BASE, SHOTS]]],
  ["start-page", ["node", ["--test", path.join(ROOT, "tests", "start-page.test.mjs")]]],
];

if (args.includes("--list")) {
  for (const [name] of SUITES) console.log(name);
  process.exit(0);
}
const wanted = args.includes("--unit") ? [...NO_SERVER] : args.filter((a) => !a.startsWith("--"));
const lighthouse = args.includes("--lighthouse");
const unknown = wanted.filter((w) => !SUITES.some(([n]) => n === w));
if (unknown.length) {
  console.error(`Unknown suite(s): ${unknown.join(", ")}. Run with --list.`);
  process.exit(1);
}
const selected = lighthouse
  ? []
  : wanted.length
    ? SUITES.filter(([n]) => wanted.includes(n))
    : SUITES;
const needServer = lighthouse || selected.some(([n]) => !NO_SERVER.has(n));

// 1. Dev only: the scripts (env-guard) and the server (Next.js's own env loading).
const { production } = loadEnv({ script: "test:e2e" });
if (production) {
  console.error("The test suites never run against production.");
  process.exit(1);
}
// Ask Next.js's own env loader in a clean process (env files only), as `next start` would.
const clean = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/SUPABASE|DATABASE_URL|DIRECT_URL/.test(k)),
);
const serverRef = spawnSync(
  process.execPath,
  [
    "-e",
    "const r=require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});process.stdout.write(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0])",
  ],
  { cwd: ROOT, env: clean, encoding: "utf8" },
).stdout.trim();
if (!serverRef || serverRef === PRODUCTION_PROJECT_REF) {
  console.error(
    serverRef
      ? "Stopped: the Next.js server would use the PRODUCTION project."
      : "Stopped: couldn't tell which project the Next.js server would use.",
  );
  process.exit(1);
}
console.log(
  `Dev project ${projectRef()} (server: ${serverRef}). Output: ${path.relative(ROOT, OUTPUT_DIR)}`,
);
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(LOGS, { recursive: true });
fs.rmSync(OUTBOX, { force: true });

const shell = process.platform === "win32";

// Start from the dev baseline (and remove leftovers of an interrupted run) BEFORE building, so
// settings the build caches (fee, homepage promotion) match the database.
if (needServer) {
  const reset = spawnSync(
    "node",
    [path.join(E2E, "dev-cleanup.mjs"), ROOT, new Date().toISOString(), OUTBOX],
    { cwd: ROOT, shell, encoding: "utf8" },
  );
  fs.writeFileSync(path.join(LOGS, "baseline.log"), `${reset.stdout}\n${reset.stderr}`);
  const left = (reset.stdout ?? "").split("\n").find((l) => l.startsWith("Left:"));
  console.log(
    reset.status === 0
      ? "Dev baseline OK."
      : `Dev baseline reset; rows from before this run remain (e.g. your own dev browsing): ${left ?? "see logs/baseline.log"}`,
  );
  if (args.includes("--no-build"))
    console.log("Note: --no-build reuses cached settings from the last build.");
}
if (needServer && !args.includes("--no-build")) {
  console.log("Building...");
  const b = spawnSync("npm", ["run", "build"], { cwd: ROOT, shell, encoding: "utf8" });
  fs.writeFileSync(path.join(LOGS, "build.log"), `${b.stdout}\n${b.stderr}`);
  if (b.status !== 0) {
    console.error("Build failed: see tests/e2e/.output/logs/build.log");
    process.exit(1);
  }
}

// 2. Server, with emails going to the test outbox (never sent).
const runStart = new Date().toISOString();
const serverLog = fs.openSync(path.join(LOGS, "server.log"), "w");
const server = !needServer
  ? null
  : spawn("npx", ["next", "start", "-p", String(PORT)], {
      cwd: ROOT,
      shell,
      env: { ...process.env, EMAIL_TEST_OUTBOX: OUTBOX },
      stdio: ["ignore", serverLog, serverLog],
    });
function stopServer() {
  if (!server || server.exitCode !== null) return;
  if (process.platform === "win32")
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else server.kill("SIGTERM");
}
process.on("exit", stopServer);
process.on("SIGINT", () => process.exit(130));
let up = !needServer;
for (let i = 0; i < 90 && !up; i++) {
  up = await fetch(`${BASE}/api/health`).then(
    (r) => r.ok,
    () => false,
  );
  if (!up) await new Promise((r) => setTimeout(r, 1000));
}
if (!up) {
  console.error("Server didn't start: see tests/e2e/.output/logs/server.log");
  process.exit(1);
}

// 3. Suites.
const results = [];
for (const [name, [cmd, cmdArgs]] of selected) {
  const started = Date.now();
  const r = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    shell,
    encoding: "utf8",
    env: { ...process.env, BASE_URL: BASE, EMAIL_TEST_OUTBOX: OUTBOX },
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  fs.writeFileSync(path.join(LOGS, `${name}.log`), out);
  const failLines = out.split("\n").filter((l) => /^\s*(FAIL|ERROR|MISS|LEAK)\b|^not ok /.test(l));
  const ok = r.status === 0 && failLines.length === 0;
  const secs = Math.round((Date.now() - started) / 1000);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} (${secs}s)`);
  for (const l of failLines.slice(0, 15)) console.log(`      ${l.trim().slice(0, 200)}`);
  results.push({ name, ok });
}

// Lighthouse: a test listing with real photos, scores for key pages, then the listing is removed.
if (lighthouse) {
  const node = (a) => spawnSync("node", a, { cwd: ROOT, shell, stdio: "inherit" }).status;
  let status = node([path.join(E2E, "lh-fixture.mjs"), ROOT, "create"]);
  if (status === 0) status = node([path.join(E2E, "lh-run.mjs"), BASE, "run"]);
  node([path.join(E2E, "lh-fixture.mjs"), ROOT, "delete"]);
  results.push({ name: "lighthouse", ok: status === 0 });
}

// 4. Stop the server, then remove what the run created and reset the dev baseline.
stopServer();
await new Promise((r) => setTimeout(r, 2000));
const c = spawnSync("node", [path.join(E2E, "dev-cleanup.mjs"), ROOT, runStart, OUTBOX], {
  cwd: ROOT,
  shell,
  encoding: "utf8",
});
console.log(`\nClean-up:\n${(c.stdout ?? "").trim()}${c.stderr ? `\n${c.stderr.trim()}` : ""}`);
const failed = results.filter((r) => !r.ok).map((r) => r.name);
console.log(
  failed.length
    ? `\n${failed.length} of ${results.length} suite(s) failed: ${failed.join(", ")} (logs in tests/e2e/.output/logs)`
    : `\nAll ${results.length} suite(s) passed.`,
);
process.exit(failed.length || c.status ? 1 : 0);
