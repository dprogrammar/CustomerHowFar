// Tests DATABASE_URL and DIRECT_URL without printing secrets.
// Usage: node test-db.mjs <project-dir>
import { createRequire } from "node:module";
import path from "node:path";

const projectDir = process.argv[2];
const require = createRequire(path.join(projectDir, "package.json"));
const pg = require("pg");

require("./scripts/env-guard.mjs").loadEnv(); // refuses production

function redact(msg, url) {
  let out = String(msg);
  try {
    const u = new URL(url);
    for (const s of [u.password, decodeURIComponent(u.password), url])
      if (s) out = out.split(s).join("***");
  } catch {}
  return out;
}

async function test(key) {
  const url = process.env[key];
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
  const started = Date.now();
  try {
    await client.connect();
    const { rows } = await client.query(
      "select current_database() as db, current_user as usr, split_part(version(), ' ', 2) as ver, inet_server_port() as port",
    );
    const r = rows[0];
    console.log(
      `  OK   ${key}: connected in ${Date.now() - started} ms (db=${r.db}, user=${r.usr.split(".")[0]}, Postgres ${r.ver})`,
    );
    // Simple prepared-statement-free query twice in a row (transaction pooler sanity check).
    await client.query("select 1");
    await client.query("select 1");
    const t = await client.query(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
    );
    console.log(`       public schema has ${t.rows[0].n} table(s)`);
    return true;
  } catch (err) {
    console.log(`  FAIL ${key}: ${err.code ?? ""} ${redact(err.message, url)}`);
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

console.log("Database connection test:");
const a = await test("DATABASE_URL");
const b = await test("DIRECT_URL");
console.log(`\nResult: ${a && b ? "PASS" : "FAIL"}`);
process.exitCode = a && b ? 0 : 1;
