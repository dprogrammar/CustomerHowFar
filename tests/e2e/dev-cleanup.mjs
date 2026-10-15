// End of a regression run (DEV database only, server stopped): removes everything the run
// created and checks the dev baseline (dev admin, seed data, settings) is intact.
// Usage: node dev-cleanup.mjs <projectDir> <runStartIso> <outboxFile>
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [projectDir, runStart, outboxFile] = process.argv.slice(2);
const require = createRequire(path.join(projectDir, "package.json"));
const { production } = require("./scripts/env-guard.mjs").loadEnv(); // refuses production
if (production) {
  console.error("dev-cleanup only runs on the dev project.");
  process.exit(1);
}
if (!runStart || Number.isNaN(Date.parse(runStart))) throw new Error("Pass the run start time.");
const CLD = process.env.CLOUDINARY_FOLDER;
if (!CLD || !CLD.startsWith("dev/"))
  throw new Error("CLOUDINARY_FOLDER must be a dev folder (dev/...).");
const pg = require("pg");
const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const db = new pg.Client({ connectionString: process.env.DIRECT_URL });
await db.connect();
const del = async (label, sql, params = [runStart]) => {
  const { rowCount } = await db.query(sql, params);
  if (rowCount) console.log(`  ${label}: ${rowCount}`);
  return rowCount;
};

console.log("Removed:");
// Analytics recorded by the test browsers (this run), and synthetic test days.
await del(
  "analytics events",
  "delete from analytics_events where created_at >= $1 or day < '2002-01-01'",
);
await del(
  "analytics daily totals (test days)",
  "delete from analytics_daily where day < '2002-01-01' or day >= ($1::timestamptz at time zone 'Africa/Lagos')::date",
);
await del(
  "business daily stats (test days)",
  "delete from business_stats_daily where day < '2002-01-01' or day >= ($1::timestamptz at time zone 'Africa/Lagos')::date",
);
await del("analytics salts", "delete from analytics_salts", []);
await del("rate-limit rows", "delete from rate_limit_hits where created_at >= $1");
await del(
  "queued file deletions (test files)",
  "delete from pending_file_deletions where created_at >= $1",
);
// Dev baseline settings: listing fee OFF, homepage "FREE" promotion ON.
await del(
  "settings reset to the dev baseline (fee off, promo on)",
  "update app_settings set payment_required = false, homepage_free_promo = true where id = 1 and (payment_required or not homepage_free_promo)",
  [],
);
await del("QR test campaigns", "delete from qr_campaigns where name like 'e2e-%'", []);
await del("waitlist test entries", "delete from waitlist_entries where email like 'chf-e2e-%'", []);
// Notifications the run's events created for non-test accounts (e.g. the dev admin).
await del(
  "notifications about test data for other accounts",
  `delete from notifications n using profiles p where p.id = n.user_id and p.email not like '%@example.com'
     and n.created_at >= $1 and (n.body like '%E2E%' or n.title like '%E2E%')`,
);
await db.end();

// Test users, their businesses, payments, ID checks, uploads (shared helper).
const { execFileSync } = require("node:child_process");
const out = execFileSync(
  "node",
  [path.join(path.dirname(fileURLToPath(import.meta.url)), "cleanup-test-users.mjs"), projectDir],
  { encoding: "utf8" },
);
for (const line of out.trim().split("\n")) if (!/: 0$/.test(line)) console.log(`  ${line}`);

if (outboxFile && fs.existsSync(outboxFile)) {
  fs.unlinkSync(outboxFile);
  console.log("  test email outbox file");
}

// What's left: should be only the dev baseline.
const db2 = new pg.Client({ connectionString: process.env.DIRECT_URL });
await db2.connect();
const one = async (sql) => (await db2.query(sql)).rows[0];
const left = await one(`select
  (select count(*) from profiles where email like 'chf-e2e-%')::int test_profiles,
  (select count(*) from businesses where slug like 'e2e-%')::int test_businesses,
  (select count(*) from analytics_events where created_at >= '${new Date(runStart).toISOString()}')::int analytics_events,
  (select count(*) from push_subscriptions)::int push_devices`);
const base = await one(`select
  (select count(*) from categories)::int categories, (select count(*) from states)::int states,
  (select count(*) from lgas)::int lgas, (select count(*) from faq_entries)::int faqs,
  (select string_agg(slug, ',') from states where is_active) live_states,
  (select payment_required from app_settings where id = 1) fee_on,
  (select homepage_free_promo from app_settings where id = 1) promo_on,
  (select count(*) from profiles where role = 'ADMIN' and email not like '%@example.com')::int dev_admins`);
await db2.end();
const files = {};
for (const [kind, type] of [
  ["users", "upload"],
  ["proofs", "authenticated"],
  ["identity", "authenticated"],
]) {
  const r = await cloudinary.api.resources({ type, prefix: `${CLD}/${kind}/`, max_results: 100 });
  files[kind] = r.resources.length;
}
console.log("Left:", JSON.stringify(left), "| Cloudinary files under", CLD, JSON.stringify(files));
console.log("Dev baseline:", JSON.stringify(base));
const ok =
  left.test_profiles === 0 &&
  left.test_businesses === 0 &&
  left.analytics_events === 0 &&
  left.push_devices === 0 &&
  base.categories === 27 &&
  base.states === 37 &&
  base.lgas === 774 &&
  base.live_states === "lagos" &&
  base.fee_on === false &&
  base.promo_on === true &&
  base.dev_admins >= 1;
console.log(ok ? "CLEAN: dev database back to its baseline" : "NOT CLEAN: see above");
process.exit(ok ? 0 : 1);
