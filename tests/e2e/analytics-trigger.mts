// Calls the app's real analytics functions in-process, optionally with the clock set to a given
// time (to test day boundaries, roll-ups and the Monday summary). Emails go to the test outbox.
// Usage (from the project dir): npx tsx --conditions=react-server analytics-trigger.mts <calls.json>
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(process.cwd() + "/package.json");
require("./scripts/env-guard.mjs").loadEnv(); // refuses production
if (!process.env.EMAIL_TEST_OUTBOX)
  throw new Error("EMAIL_TEST_OUTBOX must be set (no real emails).");

const mod = (p: string) => import(pathToFileURL(`${process.cwd()}/src/${p}.ts`).href);
const realNow = Date.now;

const calls: { fn: string; args: unknown[]; at?: string }[] = JSON.parse(
  fs.readFileSync(process.argv[2]!, "utf8"),
);
const server = await mod("lib/analytics/server");
const rollup = await mod("lib/analytics/rollup");
const queries = await mod("lib/analytics/queries");
const weekly = await mod("lib/analytics/weekly");
// The calls come from JSON, so their arguments are untyped here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fns: Record<string, (...a: any[]) => Promise<unknown>> = {
  saltFor: server.saltFor,
  recordPageView: (req, pathType, entry) => server.recordPageView(req, pathType, entry),
  recordBusinessView: server.recordBusinessView,
  recordContact: server.recordContact,
  recordSearch: server.recordSearch,
  rollUpAnalytics: (now?: number) => rollup.rollUpAnalytics(now ?? Date.now()),
  sendWeeklyOwnerStats: (now?: number) => weekly.sendWeeklyOwnerStats(now ?? Date.now()),
  getOwnerStats: async (ownerId: string, today?: string) =>
    Object.fromEntries(await queries.getOwnerStats(ownerId, today)),
  getSiteAnalytics: queries.getSiteAnalytics,
  getQrCampaignAnalytics: async (days: number) =>
    Object.fromEntries(await queries.getQrCampaignAnalytics(days)),
};
const results: unknown[] = [];
try {
  for (const c of calls) {
    const f = fns[c.fn];
    if (!f) throw new Error(`unknown function ${c.fn}`);
    if (c.at) {
      const fixed = Date.parse(c.at);
      Date.now = () => fixed;
      server.resetSaltCache();
    } else {
      Date.now = realNow;
    }
    results.push(await f(...c.args));
  }
  Date.now = realNow;
  console.log(JSON.stringify(results, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
  process.exit(0);
} catch (e) {
  console.error("trigger failed:", e instanceof Error ? e.message : e);
  process.exit(1);
}
