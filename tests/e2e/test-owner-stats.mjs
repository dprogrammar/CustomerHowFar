// Owner stats switch and admin-only business stats. With the admin switch "Show stats to business
// owners" OFF (the default), owners see none of their numbers (dashboard, bell, notification
// settings, help chat, server reads) and get no Monday summary; statistics are still kept. ON
// shows everything again. Admins always see per-business, per-user and all-businesses stats for
// every period; non-admins get 404. DEV database only; emails go to the test outbox. Creates its
// own users, listings and stats and deletes them.
// Usage: node test-owner-stats.mjs <projectDir> <baseUrl> <outboxFile>
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { axeSource, browserPath } from "./lib/setup.mjs";

const [projectDir, baseUrl, outboxArg] = process.argv.slice(2);
const outboxFile = path.resolve(outboxArg);
const require = createRequire(path.join(projectDir, "package.json"));
const { production } = require("./scripts/env-guard.mjs").loadEnv(); // refuses production
if (production) throw new Error("dev only");
const { createClient } = require("@supabase/supabase-js");
const pg = require("pg");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = new pg.Pool({ connectionString: process.env.DIRECT_URL, max: 3 });
db.on("error", () => {});
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

const run = crypto.randomBytes(3).toString("hex");
const testStart = new Date();
const pw = () => `Tst-${crypto.randomBytes(9).toString("base64url")}9a`;
const mk = (key, name, role) => ({
  email: `chf-e2e-${run}-${key}@example.com`,
  password: pw(),
  name,
  role,
});
const users = {
  owner: mk("owner", "Ola Owner", "BUSINESS_OWNER"),
  other: mk("other", "Bisi Other", "BUSINESS_OWNER"),
  admin: mk("admin", "Ade Admin", "ADMIN"),
  customer: mk("customer", "Chi Customer", "CUSTOMER"),
};
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const lagosToday = () => new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
const dayAgo = (n) =>
  new Date(Date.parse(`${lagosToday()}T00:00:00Z`) - n * 86400e3).toISOString().slice(0, 10);

let failures = 0;
const check = (name, pass, detail = "") => {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const outbox = () =>
  fs.existsSync(outboxFile)
    ? fs
        .readFileSync(outboxFile, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

/** Runs app functions in-process (tsx), e.g. the Monday summary with the clock set. */
function trigger(calls) {
  const file = path.join(path.dirname(outboxFile), `strigger-${run}.json`);
  fs.writeFileSync(file, JSON.stringify(calls));
  try {
    const out = execFileSync(
      "npx",
      [
        "tsx",
        "--conditions=react-server",
        fileURLToPath(new URL("./analytics-trigger.mts", import.meta.url)),
        file,
      ],
      {
        cwd: projectDir,
        env: { ...process.env, EMAIL_TEST_OUTBOX: outboxFile },
        shell: true,
        encoding: "utf8",
      },
    );
    return JSON.parse(out.trim().split("\n").at(-1));
  } finally {
    fs.rmSync(file, { force: true });
  }
}

const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true });
let ipN = 10;
async function newPage(width = 360) {
  const page = await (await browser.createBrowserContext()).newPage();
  await page.setUserAgent(width < 768 ? ANDROID_UA : DESKTOP_UA);
  if (width < 768) await page.setViewport({ width, height: 800, isMobile: true, hasTouch: true });
  else await page.setViewport({ width, height: 900 });
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.244.${ipN++}.6` });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message.slice(0, 120)));
  return page;
}
const go = async (page, p, waitFor) => {
  const res = await page.goto(baseUrl + p, { waitUntil: "load" });
  if (waitFor)
    await page
      .waitForFunction(
        (t) => document.querySelector("main")?.innerText.includes(t),
        { timeout: 20000 },
        waitFor,
      )
      .catch(() => {});
  await sleep(500);
  return res;
};
const mainText = (page) => page.evaluate(() => document.querySelector("main")?.innerText ?? "");
const axe = async (page, label) => {
  await page.evaluate(axeSource);
  const r = await page.evaluate(async () => {
    const res = await window.axe.run(document, {
      runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"],
    });
    return {
      v: res.violations.map((x) => `${x.impact} ${x.id}: ${x.nodes[0]?.target.join(" ")}`),
      // When the page is too wide, the outermost elements sticking out (to find the cause).
      overflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth
          ? `${document.documentElement.scrollWidth}px: ` +
            [...document.querySelectorAll("body *")]
              .filter((e) => {
                const out = (x) =>
                  x.getBoundingClientRect().right > document.documentElement.clientWidth + 1;
                if (!out(e) || (e.parentElement && out(e.parentElement))) return false;
                // Content inside a scrolling or clipping box doesn't widen the page.
                for (let a = e.parentElement; a && a !== document.body; a = a.parentElement)
                  if (getComputedStyle(a).overflowX !== "visible") return false;
                return true;
              })
              .slice(0, 6)
              .map(
                (e) =>
                  `${e.tagName.toLowerCase()}.${String(e.className.baseVal ?? e.className).slice(0, 50)} (${Math.round(e.getBoundingClientRect().right)}px)`,
              )
              .join(", ")
          : "",
    };
  });
  check(
    `a11y + no horizontal scroll: ${label}`,
    r.v.length === 0 && !r.overflow,
    [r.overflow ? `overflow: ${r.overflow}` : "", ...r.v].join(" | "),
  );
};
async function login(page, user, next = "/account") {
  await go(page, `/login?next=${encodeURIComponent(next)}`);
  await sleep(800);
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
    .waitForFunction(() => location.pathname !== "/login", { timeout: 20000 })
    .then(
      () => true,
      () => false,
    );
}
/** The bell's visible badge (unread count), or null. */
const bellBadge = (page) =>
  page.evaluate(() => {
    const b = [...document.querySelectorAll("header button[aria-controls]")].find(
      (x) =>
        x.offsetParent !== null && /Notifications/.test(x.innerText + x.getAttribute("aria-label")),
    );
    const badge = b?.querySelector("span[aria-hidden=true]");
    return badge ? badge.textContent.trim() : null;
  });

/** Flips the switch through /admin/settings like a real admin; returns the change history text. */
async function setSwitch(page, on) {
  await go(page, "/admin/settings", "Show stats to business owners");
  const current = await page.evaluate(() => {
    const label = [...document.querySelectorAll("main p")].find(
      (p) => p.textContent.trim() === "Show stats to business owners",
    );
    return (
      document
        .querySelector(`button[role=switch][aria-labelledby="${label.id}"]`)
        .getAttribute("aria-checked") === "true"
    );
  });
  if (current !== on) {
    await page.evaluate(() => {
      const label = [...document.querySelectorAll("main p")].find(
        (p) => p.textContent.trim() === "Show stats to business owners",
      );
      document.querySelector(`button[role=switch][aria-labelledby="${label.id}"]`).click();
    });
    await page.evaluate(() =>
      [...document.querySelectorAll("main button")]
        .find((b) => b.textContent.trim() === "Save changes")
        .click(),
    );
    await page.waitForSelector("dialog[open]", { timeout: 10000 });
    await page.evaluate(() =>
      [...document.querySelectorAll("dialog[open] button")]
        .find((b) => b.textContent.trim() === "Apply now")
        .click(),
    );
    await page
      .waitForFunction(() => document.querySelector("main").innerText.includes("Settings saved"), {
        timeout: 20000,
      })
      .catch(() => {});
  }
  return (await one("select owner_stats_visible from app_settings where id = 1"))
    .owner_stats_visible;
}

const ids = {};
const before = (await one("select owner_stats_visible from app_settings where id = 1"))
  .owner_stats_visible;
try {
  console.log("Setup");
  await q("update app_settings set owner_stats_visible = false where id = 1");
  for (const u of Object.values(users)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.name },
      app_metadata: u.role === "ADMIN" ? { role: "admin" } : {},
    });
    if (error) throw new Error(`createUser failed: ${error.code}`);
    u.id = data.user.id;
    await q(
      "insert into profiles (id, full_name, email, role, updated_at) values ($1,$2,$3,$4, now())",
      [u.id, u.name, u.email, u.role],
    );
  }
  await q(
    "insert into identity_verifications (id, user_id, id_type, full_name_on_id, consent_given_at, status, submitted_at, reviewed_at, updated_at) values (gen_random_uuid(), $1, 'NIN_SLIP', 'Ola Owner', now(), 'APPROVED', now(), now(), now())",
    [users.owner.id],
  );
  const lagos = (await one("select id from states where slug = 'lagos'")).id;
  const ikeja = (await one("select id from lgas where state_id = $1 and slug = 'ikeja'", [lagos]))
    .id;
  const cat = (await one("select id from categories where slug = 'carpenters'")).id;
  const biz = async (key, owner, status) => {
    const id = crypto.randomUUID();
    ids[key] = id;
    await q(
      `insert into businesses (id, owner_id, name, slug, category_id, phone, whatsapp_number, address, state_id, lga_id, description, status, logo_public_id, submitted_at, published_at, updated_at)
       values ($1,$2,$3,$4,$5,'+2348036660000','+2348036660000','1 Test Street',$6,$7,'A complete description of more than thirty characters for testing.',$8,'customerhowfar/users/test/none', now(), $9, now())`,
      [
        id,
        owner.id,
        `E2E Stats ${key} ${run}`,
        `e2e-st-${run}-${key.toLowerCase()}`,
        cat,
        lagos,
        ikeja,
        status,
        status === "APPROVED" ? new Date() : null,
      ],
    );
  };
  await biz("Live", users.owner, "APPROVED");
  await biz("Quiet", users.owner, "APPROVED"); // no activity at all
  await biz("Other", users.other, "APPROVED");
  for (let i = 0; i < 26; i++)
    await biz(`Filler${String(i).padStart(2, "0")}`, users.other, "DRAFT");
  // Collected stats (rolled-up days): Live has 7d 10 views/2 WhatsApp/1 call, 30d 15/2/1, 90d 22/2/2.
  for (const [key, ago, v, w, c] of [
    ["Live", 3, 10, 2, 1],
    ["Live", 20, 5, 0, 0],
    ["Live", 60, 7, 0, 1],
    ["Other", 5, 4, 1, 0],
  ])
    await q(
      "insert into business_stats_daily (day, business_id, views, whatsapp, calls, emails) values ($1::date, $2, $3, $4, $5, 0)",
      [dayAgo(ago), ids[key], v, w, c],
    );
  // Synthetic last week for the Monday summary (2001-01-01 to 07; Monday 2001-01-08).
  await q(
    "insert into business_stats_daily (day, business_id, views, whatsapp, calls, emails) values ('2001-01-03', $1, 9, 1, 0, 0)",
    [ids.Live],
  );
  // An old weekly summary already in the owner's bell (unread), plus one ordinary notification.
  await q(
    "insert into notifications (id, user_id, category, type, title, body, link) values (gen_random_uuid(), $1, 'WEEKLY_STATS', 'weekly-stats', $2, 'Your listing was viewed 12 times last week.', '/dashboard'), (gen_random_uuid(), $1, 'LISTING', 'listing-approved', 'Your listing is live', 'E2E Stats Live is now on CustomerHowFar.', '/dashboard')",
    [users.owner.id, `Your week: E2E Stats Live ${run}`],
  );

  // -------------------------------------------------------------------------------------------
  console.log("\nSwitch OFF (default): owners see none of their numbers");
  const owner = await newPage();
  check("owner logs in (360px)", await login(owner, users.owner));
  await go(owner, "/dashboard", "My businesses");
  let t = await mainText(owner);
  check(
    "dashboard: no 'Your stats', no views/taps table",
    !t.includes("Your stats") &&
      !t.includes("WhatsApp taps") &&
      !t.includes("Only you can see these numbers"),
  );
  const cookie = (await owner.cookies(baseUrl)).map((c) => `${c.name}=${c.value}`).join("; ");
  const raw = await (
    await fetch(`${baseUrl}/dashboard`, {
      headers: { cookie, "user-agent": DESKTOP_UA, "x-forwarded-for": "10.244.250.6" },
    })
  ).text();
  check(
    "dashboard HTML from the server holds no stats either",
    !raw.includes("Your stats") && !raw.includes("WhatsApp taps"),
  );
  check(
    "bell: the old weekly summary isn't counted (1 unread, not 2)",
    (await bellBadge(owner)) === "1",
    String(await bellBadge(owner)),
  );
  await go(owner, "/notifications", "Notifications");
  t = await mainText(owner);
  check(
    "/notifications: old weekly summary hidden, others shown",
    !t.includes(`Your week: E2E Stats Live ${run}`) && t.includes("Your listing is live"),
  );
  await go(owner, "/account/notifications", "What you get");
  check(
    "notification settings: no 'Weekly listing stats' option",
    !(await mainText(owner)).includes("Weekly listing stats"),
  );
  // Help chat: its status answer never contains numbers about the listing.
  await go(owner, "/dashboard", "My businesses");
  await owner.click('.chat-launcher button[aria-haspopup="dialog"]');
  await owner.waitForSelector("dialog[open]", { timeout: 20000 });
  await owner.waitForFunction(
    () => document.querySelectorAll('dialog[open] [data-from="bot"]').length >= 1,
    { timeout: 10000 },
  );
  const botsBefore = await owner.evaluate(
    () => document.querySelectorAll('dialog[open] [data-from="bot"]').length,
  );
  const input = await owner.waitForSelector("dialog[open] input", { visible: true });
  await input.evaluate((e, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, v);
    e.dispatchEvent(new Event("input", { bubbles: true }));
  }, "my listing status");
  await owner.evaluate(() =>
    document.querySelector('dialog[open] form button[type="submit"]').click(),
  );
  await owner
    .waitForFunction(
      (n) =>
        document.querySelectorAll('dialog[open] [data-from="bot"]').length > n &&
        !document.querySelector('dialog[open] [data-from="typing"]'),
      { timeout: 25000 },
      botsBefore,
    )
    .catch(() => {});
  const reply = await owner.evaluate(
    () => [...document.querySelectorAll('dialog[open] [data-from="bot"]')].at(-1)?.innerText ?? "",
  );
  check(
    "help chat status answer: listing shown, no views or taps",
    reply.includes(`E2E Stats Live ${run}`) &&
      !/\d\s*(views?|taps?|contacts?)\b|viewed|WhatsApp taps|Call taps/i.test(reply),
    reply.replace(/\n+/g, " / "),
  );
  await owner.keyboard.press("Escape");
  const [hidden, weeklyOff] = trigger([
    { fn: "getOwnerStats", args: [users.owner.id] },
    { fn: "sendWeeklyOwnerStats", args: [Date.parse("2001-01-08T08:00:00Z")] },
  ]);
  check(
    "server read of the owner's stats returns nothing while OFF",
    hidden === null || Object.keys(hidden ?? {}).length === 0,
  );
  check(
    "Monday summary: nothing sent while OFF",
    weeklyOff === 0 &&
      (
        await q(
          "select 1 from notifications where user_id = $1 and type = 'weekly-stats' and created_at >= $2 and title not like 'Your week: E2E%'",
          [users.owner.id, testStart],
        )
      ).length === 0,
  );
  check(
    "…and not marked as sent (it can still go out after switching ON)",
    !(await one(
      "select 1 x from analytics_daily where day = '2001-01-08' and metric = 'weekly_sent'",
    )),
  );
  check(
    "statistics are still kept",
    (
      await one("select sum(views)::int n from business_stats_daily where business_id = $1", [
        ids.Live,
      ])
    ).n === 31,
  );

  // -------------------------------------------------------------------------------------------
  console.log("\nAdmin: switch ON in /admin/settings");
  const adm = await newPage(1280);
  check("admin logs in", await login(adm, users.admin, "/admin"));
  check("switch saved ON", (await setSwitch(adm, true)) === true);
  await go(adm, "/admin/settings", "Change history");
  check(
    "recorded in the settings change history",
    Boolean(
      await one(
        "select 1 x from setting_changes where admin_id = $1 and field = 'ownerStatsVisible' and old_value = 'false' and new_value = 'true'",
        [users.admin.id],
      ),
    ) && (await mainText(adm)).includes("Show stats to business owners: Off → On"),
  );
  await axe(adm, "admin settings (desktop)");

  console.log("\nSwitch ON: owners see everything again (full history)");
  await go(owner, "/dashboard", "Your stats");
  t = await mainText(owner);
  check(
    "dashboard: 'Your stats' with 7/30-day numbers",
    t.includes("Your stats") &&
      /Views\s+10\s+15/.test(t) &&
      /WhatsApp taps\s+2\s+2/.test(t) &&
      /Call taps\s+1\s+1/.test(t),
    t.slice(t.indexOf("Your stats"), t.indexOf("Your stats") + 160).replace(/\s+/g, " "),
  );
  check(
    "bell: the weekly summary counts again (2 unread)",
    (await bellBadge(owner)) === "2",
    String(await bellBadge(owner)),
  );
  await go(owner, "/account/notifications", "What you get");
  check(
    "notification settings: 'Weekly listing stats' option back",
    (await mainText(owner)).includes("Weekly listing stats"),
  );
  await axe(owner, "owner dashboard with stats (360px)");
  const mailsBefore = outbox().filter((m) => m.tag === "weekly-stats").length;
  const [shown, weeklyOn] = trigger([
    { fn: "getOwnerStats", args: [users.owner.id] },
    { fn: "sendWeeklyOwnerStats", args: [Date.parse("2001-01-08T08:00:00Z")] },
  ]);
  check(
    "server read returns the owner's own stats while ON",
    shown &&
      Object.keys(shown).sort().join() ===
        [ids.Live, ids.Quiet]
          .filter((id) => shown[id])
          .sort()
          .join() &&
      shown[ids.Live]?.views30 === 15,
  );
  check(
    "Monday summary sent while ON (in-app + email to the test outbox)",
    weeklyOn >= 1 && outbox().filter((m) => m.tag === "weekly-stats").length > mailsBefore,
  );

  console.log("\nSwitch OFF again");
  check("switch saved OFF", (await setSwitch(adm, false)) === false);
  await go(owner, "/dashboard", "My businesses");
  check("owner stats hidden again immediately", !(await mainText(owner)).includes("Your stats"));

  // -------------------------------------------------------------------------------------------
  console.log("\nAdmin views (switch OFF: admins still see everything)");
  await go(adm, `/admin/listings/${ids.Live}`, "Statistics");
  t = await mainText(adm);
  check(
    "listing page: views/WhatsApp/calls for 7, 30 and 90 days",
    /Views\s+10\s+15\s+22/.test(t) &&
      /WhatsApp taps\s+2\s+2\s+2/.test(t) &&
      /Call taps\s+1\s+1\s+2/.test(t),
    t.slice(t.indexOf("Statistics"), t.indexOf("Statistics") + 220).replace(/\s+/g, " "),
  );
  check(
    "listing page: 90-day trend chart",
    await adm.evaluate(() =>
      [...document.querySelectorAll("main svg[role=img] title")].some((x) =>
        x.textContent.includes("last 90 days"),
      ),
    ),
  );
  await axe(adm, "admin listing with stats (desktop)");
  for (const [days, views, wa, calls] of [
    [7, 10, 2, 1],
    [30, 15, 2, 1],
    [90, 22, 2, 2],
  ]) {
    await go(adm, `/admin/users/${users.owner.id}?stats=${days}`, "Statistics");
    const row = await adm.evaluate((name) => {
      const tr = [...document.querySelectorAll("main table tbody tr")].find((r) =>
        r.textContent.includes(name),
      );
      return tr ? [...tr.querySelectorAll("td")].map((td) => td.textContent.trim()) : null;
    }, `E2E Stats Live ${run}`);
    const quiet = await adm.evaluate(
      (name) =>
        [...document.querySelectorAll("main table tbody tr")].some((r) =>
          r.textContent.includes(name),
        ),
      `E2E Stats Quiet ${run}`,
    );
    const totalRow = await adm.evaluate(() =>
      [...document.querySelectorAll("main table tfoot td")].map((td) => td.textContent.trim()),
    );
    const link = await adm.evaluate(
      (id) => Boolean(document.querySelector(`main table a[href="/admin/listings/${id}"]`)),
      ids.Live,
    );
    check(
      `user page (${days} days): per-business row, zero-activity business, totals and links`,
      row &&
        row[0] === String(views) &&
        row[1] === String(wa) &&
        row[2] === String(calls) &&
        quiet &&
        totalRow[0] === String(views) &&
        link,
      JSON.stringify({ row, totalRow }),
    );
  }
  await axe(adm, "admin user with stats (desktop)");
  for (const range of ["today", "7", "30", "90"]) {
    await go(
      adm,
      `/admin/analytics?range=${range}&bq=${run}&bsort=views&bdir=desc`,
      "All businesses",
    );
    const info = await adm.evaluate(() => {
      const sec = document.getElementById("all-businesses");
      const rows = [...sec.querySelectorAll("tbody tr")].map((r) => [
        r.querySelector("th").textContent.trim(),
        ...[...r.querySelectorAll("td")].map((td) => td.textContent.trim()),
      ]);
      return {
        rows,
        status: sec.querySelector("[role=status]")?.textContent ?? "",
        next: Boolean(
          [...sec.querySelectorAll("nav a")].find((a) => a.textContent.trim() === "Next"),
        ),
      };
    });
    const live = info.rows.find((r) => r[0].startsWith(`E2E Stats Live ${run}`));
    const want = { today: "0", 7: "10", 30: "15", 90: "22" }[range];
    check(
      `analytics All businesses (${range}): search, views for the range, zero-activity included, 2 pages`,
      info.status.includes("of 29 businesses") &&
        info.rows.length === 25 &&
        (range === "today" ? info.rows.every((r) => r[4] === "0") : live?.[4] === want) &&
        info.next &&
        info.rows.some((r) => r[0].startsWith(`E2E Stats Quiet ${run}`) || r[4] === "0"),
      JSON.stringify({ live, status: info.status }),
    );
  }
  await go(adm, `/admin/analytics?range=90&bq=${run}&bsort=views&bdir=desc`, "All businesses");
  const sorted = await adm.evaluate(() =>
    [...document.querySelectorAll("#all-businesses tbody tr")]
      .slice(0, 2)
      .map((r) => r.querySelector("th").textContent),
  );
  check(
    "sorted by views (highest first)",
    sorted[0]?.startsWith("E2E Stats Live") && sorted[1]?.startsWith("E2E Stats Other"),
  );
  await go(
    adm,
    `/admin/analytics?range=90&bq=${run}&bsort=name&bdir=asc&bpage=2`,
    "All businesses",
  );
  const page2 = await adm.evaluate(() =>
    [...document.querySelectorAll("#all-businesses tbody tr")].map(
      (r) => r.querySelector("th").textContent,
    ),
  );
  check(
    "sorted by name, page 2 has the remaining 4",
    page2.length === 4 && page2.every((n) => n.startsWith("E2E Stats")),
    JSON.stringify(page2),
  );
  await go(
    adm,
    `/admin/analytics?range=30&bq=${encodeURIComponent("Bisi Other")}`,
    "All businesses",
  );
  check(
    "search by owner name",
    (
      await adm.evaluate(() => document.querySelector("#all-businesses [role=status]").textContent)
    ).includes("of 27 businesses"),
  );
  await go(
    adm,
    `/admin/analytics?range=30&bsort=evil;drop&bdir=sideways&bpage=-5&bq=${run}`,
    "All businesses",
  );
  check(
    "odd sort/page values fall back safely",
    (await mainText(adm)).includes("All businesses") &&
      (await adm.evaluate(() => document.querySelectorAll("#all-businesses tbody tr").length)) > 0,
  );
  await axe(adm, "admin analytics with All businesses (desktop)");
  const adm360 = await newPage(360);
  check("admin logs in (360px)", await login(adm360, users.admin, "/admin"));
  await go(adm360, `/admin/analytics?range=30&bq=${run}`, "All businesses");
  await axe(adm360, "admin analytics All businesses (360px)");
  await go(adm360, `/admin/listings/${ids.Live}`, "Statistics");
  await axe(adm360, "admin listing stats (360px)");
  await go(adm360, `/admin/users/${users.owner.id}?stats=90`, "Statistics");
  await axe(adm360, "admin user stats (360px)");

  console.log("\nNon-admins can't open the admin views");
  const cust = await newPage();
  check("customer logs in", await login(cust, users.customer));
  for (const [label, page] of [
    ["signed out", await newPage()],
    ["customer", cust],
    ["owner", owner],
  ]) {
    for (const p of [
      "/admin/analytics?range=30",
      `/admin/listings/${ids.Live}`,
      `/admin/users/${users.owner.id}?stats=90`,
    ]) {
      const res = await page.goto(baseUrl + p, { waitUntil: "load" });
      const body = await page.evaluate(() => document.body.innerText);
      check(
        `${label}: 404 on ${p.split("?")[0].replace(/[0-9a-f-]{36}/, "[id]")}`,
        res.status() === 404 && !body.includes("All businesses") && !body.includes("WhatsApp taps"),
      );
    }
  }

  const errs = [owner, adm, adm360, cust].flatMap((p) => p.errors);
  check("no page errors", errs.length === 0, errs.join(" | "));
} catch (e) {
  failures++;
  console.log("  ERROR", e.message);
} finally {
  console.log("\nCleanup");
  await q("update app_settings set owner_stats_visible = $1 where id = 1", [before]);
  const idList = Object.values(users)
    .map((u) => u.id)
    .filter(Boolean);
  await q("delete from setting_changes where admin_id = any($1::uuid[])", [idList]);
  await q("delete from business_stats_daily where business_id = any($1::uuid[])", [
    Object.values(ids),
  ]);
  await q("delete from analytics_daily where day = '2001-01-08' and metric = 'weekly_sent'");
  await q("delete from identity_verifications where user_id = any($1::uuid[])", [idList]);
  await q("delete from businesses where owner_id = any($1::uuid[])", [idList]);
  await q("delete from profiles where id = any($1::uuid[])", [idList]);
  for (const u of Object.values(users))
    if (u.id) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  await q("delete from rate_limit_hits where created_at >= $1", [testStart]);
  const left = await one(
    "select (select count(*) from profiles where email like $1)::int p, (select count(*) from businesses where slug like $2)::int b",
    [`chf-e2e-${run}-%`, `e2e-st-${run}-%`],
  );
  console.log("  leftovers:", JSON.stringify(left));
  await browser.close();
  await db.end();
}
console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
