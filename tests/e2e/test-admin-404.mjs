// Admin 404: signed-out visitors and customers get a clean 404 page (no console errors, no admin
// content) on every /admin URL; admins get the admin pages (no console errors, no chat button).
// Also an account whose login token claims admin but whose profile isn't admin (the database
// role is the authority). Creates its own test users and deletes them afterwards.
// Usage: node test-admin-404.mjs <projectDir> <baseUrl> <shotsDir>
import crypto from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { browserPath } from "./lib/setup.mjs";

const [projectDir, baseUrl, shotsDir] = process.argv.slice(2);
const require = createRequire(path.join(projectDir, "package.json"));
require("./scripts/env-guard.mjs").loadEnv(); // refuses production
const { createClient } = require("@supabase/supabase-js");
const pg = require("pg");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = new pg.Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
db.on("error", () => {});
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

const run = crypto.randomBytes(3).toString("hex");
const testStart = new Date();
const pw = () => `Tst-${crypto.randomBytes(9).toString("base64url")}9a`;
const mk = (key, name, role, tokenAdmin) => ({
  email: `chf-e2e-${run}-${key}@example.com`,
  password: pw(),
  name,
  role,
  tokenAdmin,
});
const users = {
  customer: mk("customer", "Chi Customer", "CUSTOMER", false),
  admin: mk("admin", "Ade Admin", "ADMIN", true),
  // Token says admin, database says customer (e.g. demoted, token not refreshed yet).
  stale: mk("stale", "Sam Stale", "CUSTOMER", true),
};
const ADMIN_PATHS = [
  "/admin",
  "/admin/users",
  "/admin/analytics?range=7",
  "/admin/qr-codes",
  "/admin/listings?tab=review",
  "/admin/settings",
  "/admin/does-not-exist",
];

let failures = 0;
const check = (name, pass, detail = "") => {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true });
let ipN = 10;
async function newPage(width = 360) {
  const page = await (await browser.createBrowserContext()).newPage();
  if (width < 768) await page.setViewport({ width, height: 800, isMobile: true, hasTouch: true });
  else await page.setViewport({ width, height: 900 });
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.211.${ipN++}.7` });
  page.problems = [];
  page.on("pageerror", (e) => page.problems.push(`pageerror ${e.message.slice(0, 80)}`));
  page.on("console", (m) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    const url = m.location()?.url ?? "";
    // The browser's own network line for the page's HTTP 404 status (every real 404 page has it).
    if (
      /status of 404/.test(m.text()) &&
      url.replace(baseUrl, "").split("?")[0] === page.expected404
    )
      return;
    page.problems.push(`${m.type()} ${m.text().slice(0, 100)} @ ${url.replace(baseUrl, "")}`);
  });
  return page;
}
async function open(page, p) {
  page.expected404 = p.split("?")[0];
  const res = await page.goto(baseUrl + p, { waitUntil: "load" });
  await sleep(2500); // let hydration and idle work finish
  return res;
}
async function login(page, user) {
  await open(page, "/login?next=%2F");
  for (const [sel, v] of [
    ['main [name="email"]', user.email],
    ['main [name="password"]', user.password],
  ]) {
    await (
      await page.waitForSelector(sel, { visible: true })
    ).evaluate((e, val) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, val);
      e.dispatchEvent(new Event("input", { bubbles: true }));
    }, v);
  }
  await page.evaluate(() =>
    [
      ...[...document.querySelectorAll("main form")]
        .filter((f) => f.offsetParent !== null)
        .at(-1)
        .querySelectorAll("button[type=submit]"),
    ]
      .at(-1)
      .click(),
  );
  return page
    .waitForFunction(() => location.pathname === "/", { timeout: 20000 })
    .then(
      () => true,
      () => false,
    );
}
const state = (page) =>
  page.evaluate(() => {
    const launcher = document.querySelector(".chat-launcher");
    const footer = document.querySelector("body > footer");
    return {
      h1: document.querySelector("h1")?.innerText ?? "",
      adminShell: Boolean(document.querySelector("[data-admin-shell]")),
      adminText: /signed in as|Review queue|All listings/.test(document.body.innerText),
      chatVisible: Boolean(launcher && getComputedStyle(launcher).display !== "none"),
      footerPad: footer ? getComputedStyle(footer).paddingBottom : null,
    };
  });

async function expect404(label, page, p) {
  page.problems = [];
  const res = await open(page, p);
  const s = await state(page);
  check(
    `${label} ${p}: 404 page, no admin content`,
    res.status() === 404 && /couldn.t find that page/.test(s.h1) && !s.adminShell && !s.adminText,
    `${res.status()} "${s.h1}"`,
  );
  check(`${label} ${p}: no console errors`, page.problems.length === 0, page.problems.join(" | "));
  check(`${label} ${p}: help chat shown as on any 404`, s.chatVisible);
}

try {
  console.log("Setup");
  for (const u of Object.values(users)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.name },
      app_metadata: u.tokenAdmin ? { role: "admin" } : {},
    });
    if (error) throw new Error(`createUser failed: ${error.code}`);
    u.id = data.user.id;
    await q(
      "insert into profiles (id, full_name, email, role, updated_at) values ($1,$2,$3,$4, now())",
      [u.id, u.name, u.email, u.role],
    );
  }

  console.log("\nSigned out");
  const anon = await newPage();
  for (const p of ADMIN_PATHS) await expect404("signed out", anon, p);
  await anon.screenshot({ path: path.join(shotsDir, "admin-404-signed-out-360.png") });
  const post = await fetch(`${baseUrl}/admin/users`, {
    method: "POST",
    headers: { "next-action": "x", "content-type": "text/plain" },
    body: "[]",
  });
  check(
    "signed out: server action POST to /admin gets 404",
    post.status === 404,
    String(post.status),
  );
  const ref = await newPage();
  await expect404("signed out (normal 404 for comparison)", ref, "/no-such-page");
  const plainPad = (await state(ref)).footerPad;

  console.log("\nCustomer");
  const cust = await newPage(1280);
  check("customer logs in", await login(cust, users.customer));
  for (const p of ADMIN_PATHS) await expect404("customer", cust, p);

  console.log("\nLogin token says admin, database role is customer");
  const stale = await newPage();
  check("stale-admin logs in", await login(stale, users.stale));
  for (const p of ["/admin", "/admin/users"]) {
    stale.problems = [];
    const res = await open(stale, p);
    const s = await state(stale);
    check(
      `stale ${p}: no admin content (database role wins)`,
      !s.adminText && /couldn.t find that page/.test(s.h1),
      `${res.status()} "${s.h1}"`,
    );
    console.log(
      `  info stale ${p}: status ${res.status()}, console: ${stale.problems.length ? stale.problems.join(" | ") : "clean"}`,
    );
  }

  console.log("\nAdmin");
  for (const width of [360, 1280]) {
    const adm = await newPage(width);
    check(`admin logs in (${width}px)`, await login(adm, users.admin));
    for (const p of ADMIN_PATHS.filter((x) => x !== "/admin/does-not-exist")) {
      adm.problems = [];
      const res = await open(adm, p);
      const s = await state(adm);
      check(
        `admin ${p} (${width}px): admin page`,
        res.status() === 200 && s.adminShell && s.adminText,
        `${res.status()} "${s.h1}"`,
      );
      check(
        `admin ${p} (${width}px): no console errors, chat button hidden`,
        adm.problems.length === 0 && !s.chatVisible,
        adm.problems.join(" | "),
      );
      check(
        `admin ${p} (${width}px): footer spacing as before (no chat gap)`,
        s.footerPad === "0px",
        s.footerPad,
      );
    }
    adm.problems = [];
    const res = await open(adm, "/admin/does-not-exist");
    check(`admin unknown admin URL (${width}px): 404`, res.status() === 404, String(res.status()));
    if (width === 360)
      await adm.screenshot({ path: path.join(shotsDir, "admin-overview-360.png") });
  }

  console.log("\nPublic pages unchanged");
  const pub = await newPage();
  for (const p of ["/", "/search?q=tailor", "/start", "/help"]) {
    pub.problems = [];
    const res = await open(pub, p);
    const s = await state(pub);
    check(
      `${p}: 200, chat button shown, footer gap kept, no console errors`,
      res.status() === 200 &&
        s.chatVisible &&
        s.footerPad === plainPad &&
        pub.problems.length === 0,
      `${res.status()} pad=${s.footerPad} ${pub.problems.join(" | ")}`,
    );
  }
} catch (e) {
  failures++;
  console.log("  ERROR", e.message);
} finally {
  console.log("\nCleanup");
  const idList = Object.values(users)
    .map((u) => u.id)
    .filter(Boolean);
  // The live site shares this database: delete only this test's own rate-limit rows (its IPs
  // and emails, hashed the same way as src/lib/rate-limit.ts). Headless Edge counts as a bot,
  // so this test records no analytics events.
  const hash = (kind, v) =>
    crypto
      .createHmac("sha256", process.env.SUPABASE_SECRET_KEY ?? "local-dev-only")
      .update(`${kind}:${v}`)
      .digest("hex")
      .slice(0, 32);
  const subjects = [
    ...Array.from({ length: ipN }, (_, i) => hash("ip", `10.211.${i}.7`)),
    ...Object.values(users).map((u) => hash("email", u.email)),
  ];
  const rl = await q(
    "delete from rate_limit_hits where created_at >= $1 and split_part(key, ':', 2) = any($2::text[]) returning 1",
    [testStart, subjects],
  );
  console.log(`  test rate-limit rows removed: ${rl.length}`);
  await q("delete from profiles where id = any($1::uuid[])", [idList]);
  for (const u of Object.values(users))
    if (u.id) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  const left = (
    await q("select count(*)::int n from profiles where email like $1", [`chf-e2e-${run}-%`])
  )[0].n;
  console.log(`  leftover test profiles: ${left}`);
  await browser.close();
  await db.end();
}
console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
