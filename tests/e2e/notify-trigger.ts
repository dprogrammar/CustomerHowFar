// Calls the app's real notification functions (the same ones the actions run in after()), for
// the notifications test. Emails go to the test outbox (EMAIL_TEST_OUTBOX must be set).
// Usage (from the project dir): npx tsx --conditions=react-server notify-trigger.ts <calls.json>
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(process.cwd() + "/package.json");
require("./scripts/env-guard.mjs").loadEnv(); // refuses production
if (!process.env.EMAIL_TEST_OUTBOX)
  throw new Error("EMAIL_TEST_OUTBOX must be set (no real emails).");

const mod = (p: string) => import(pathToFileURL(`${process.cwd()}/src/${p}.ts`).href);

async function main() {
  const calls: { fn: string; args: unknown[] }[] = JSON.parse(
    fs.readFileSync(process.argv[2], "utf8"),
  );
  const email = await mod("lib/email/notifications");
  const jobs = await mod("lib/notifications/jobs");
  const waitlist = await mod("lib/service-areas/waitlist");
  const fns: Record<string, (...a: unknown[]) => Promise<unknown>> = {
    ...email,
    sendRatingReminders: jobs.sendRatingReminders,
    pruneNotifications: jobs.pruneNotifications,
    emailStateWaitlist: waitlist.emailStateWaitlist,
  };
  const results: unknown[] = [];
  for (const c of calls) {
    const f = fns[c.fn];
    if (!f) throw new Error(`unknown function ${c.fn}`);
    results.push(await f(...c.args));
  }
  console.log(JSON.stringify(results));
  process.exit(0);
}
main().catch((e) => {
  console.error("trigger failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
