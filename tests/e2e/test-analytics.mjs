// Privacy-friendly analytics, end to end: page views, searches (phone/email removal, zero
// results), QR attribution, bot/admin/owner exclusion, unique visitors across a day boundary,
// the daily roll-up and raw-event deletion, every date range, owner stats isolation, the Monday
// summary (test accounts only), accessibility and 360px. Creates its own users, businesses and
// QR campaign and deletes everything afterwards. Emails go to the test outbox only.
// Usage: node test-analytics.mjs <projectDir> <baseUrl> <outboxFile> <shotsDir>
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { axeSource, browserPath } from "./lib/setup.mjs";

const [projectDir, baseUrl, outboxArg, shotsDir] = process.argv.slice(2);
const outboxFile = path.resolve(outboxArg);
const require = createRequire(path.join(projectDir, "package.json"));
require("./scripts/env-guard.mjs").loadEnv(); // refuses production
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
  owner1: mk("owner1", "Ola Owner", "BUSINESS_OWNER"),
  owner2: mk("owner2", "Bisi Owner", "BUSINESS_OWNER"),
  admin: mk("admin", "Ade Admin", "ADMIN"),
};
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const campaign = `e2e-${run}`;

let failures = 0;
const check = (name, pass, detail = "") => {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lagosToday = () => new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
const outbox = () =>
  fs.existsSync(outboxFile)
    ? fs
        .readFileSync(outboxFile, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

function trigger(calls) {
  const file = path.join(path.dirname(outboxFile), `atrigger-${run}.json`);
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

/** The visitor code the server gives this IP + browser today (computed the same way; never printed). */
async function codeFor(ip, ua) {
  const row = await one("select salt from analytics_salts where day = $1::date", [lagosToday()]);
  return row
    ? crypto.createHmac("sha256", row.salt).update(`${ip}\n${ua}`).digest("hex").slice(0, 32)
    : null;
}
const eventsOf = async (visitor) =>
  q(
    "select kind, path_type, device, source, campaign, business_id::text, repeat, contact_type::text, query, category, state, result_count from analytics_events where visitor = $1 order by created_at, id",
    [visitor],
  );
async function waitFor(fn, ms = 12000) {
  const until = Date.now() + ms;
  let v;
  while (Date.now() < until) {
    v = await fn();
    if (v) return v;
    await sleep(500);
  }
  return v;
}
const totalEvents = async () => (await one("select count(*)::int n from analytics_events")).n;

const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true });
let ipN = 20;
async function newPage({ width = 360, ua = ANDROID_UA } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setUserAgent(ua);
  if (width < 768) await page.setViewport({ width, height: 800, isMobile: true, hasTouch: true });
  else await page.setViewport({ width, height: 900 });
  page.ip = `10.199.${ipN++}.9`;
  page.ua = ua;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": page.ip });
  page.errors = [];
  page.on("pageerror", (e) =>
    page.errors.push(`${page.url().replace(baseUrl, "")}: ${e.message.slice(0, 60)}`),
  );
  return page;
}
/** In-site navigation by a full page load (the referrer is our own site, like the search form). */
const nav = async (page, p) => {
  await Promise.all([
    page.waitForNavigation({ waitUntil: "load" }),
    page.evaluate((u) => location.assign(u), p),
  ]);
  await sleep(900);
};
const go = async (page, p, opts = {}) => {
  const res = await page.goto(baseUrl + p, { waitUntil: "load", ...opts });
  await sleep(900);
  return res;
};
const axe = async (page, label) => {
  await page.evaluate(axeSource);
  const r = await page.evaluate(async () => {
    const res = await window.axe.run(document, {
      runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"],
    });
    return {
      v: res.violations.map((x) => `${x.impact} ${x.id}: ${x.nodes[0]?.target.join(" ")}`),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  check(
    `a11y + no horizontal scroll: ${label}`,
    r.v.length === 0 && !r.overflow,
    [r.overflow ? "overflow" : "", ...r.v].join(" | "),
  );
};
async function login(page, user, next) {
  await go(page, `/login?next=${encodeURIComponent(next)}`);
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
    .waitForFunction((p) => location.pathname === p, { timeout: 20000 }, next)
    .then(
      () => true,
      () => false,
    );
}
const mainText = (page) => page.evaluate(() => document.querySelector("main").innerText);
const beacon = (page, body) =>
  page.evaluate(
    (b) => fetch("/api/track", { method: "POST", body: JSON.stringify(b) }).then((r) => r.status),
    body,
  );

const tables = ["analytics_events", "analytics_daily", "business_stats_daily", "analytics_salts"];
const baseline = {};
for (const t of tables) baseline[t] = (await one(`select count(*)::int n from ${t}`)).n;
const startedEmpty = Object.values(baseline).every((n) => n === 0);
const realOwnerNotesBefore = (
  await one(
    "select count(*)::int n from notifications n join profiles p on p.id = n.user_id where p.email not like '%@example.com' and n.type = 'weekly-stats'",
  )
).n;
const ids = {};
try {
  console.log("Setup");
  console.log(
    `  analytics tables empty before the test (only test data will exist): ${startedEmpty}`,
  );
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
  const lagos = (await one("select id from states where slug = 'lagos'")).id;
  const ikeja = (await one("select id from lgas where state_id = $1 and slug = 'ikeja'", [lagos]))
    .id;
  const cat = (await one("select id from categories where slug = 'carpenters'")).id;
  const biz = async (key, owner) => {
    const id = crypto.randomUUID();
    ids[key] = {
      id,
      slug: `e2e-an-${run}-${key.toLowerCase()}`,
      name: `E2E Analytics ${key} ${run}`,
    };
    await q(
      `insert into businesses (id, owner_id, name, slug, category_id, phone, whatsapp_number, address, state_id, lga_id, description, status, logo_public_id, submitted_at, published_at, updated_at)
             values ($1,$2,$3,$4,$5,'+2348036660000','+2348036660000','1 Test Street',$6,$7,'A complete description of more than thirty characters for testing.','APPROVED','customerhowfar/users/test/none', now(), now(), now())`,
      [id, owner.id, ids[key].name, ids[key].slug, cat, lagos, ikeja],
    );
  };
  await biz("One", users.owner1);
  await biz("Two", users.owner2);
  await q("insert into qr_campaigns (id, name) values ($1, $2)", [crypto.randomUUID(), campaign]);
  if (fs.existsSync(outboxFile)) fs.unlinkSync(outboxFile);
  const B1 = ids.One.id;
  const B2 = ids.Two.id;

  // -------------------------------------------------------------------------------------------
  console.log("\nQR visitor (phone, 360px): /start -> search -> business page -> WhatsApp");
  const qr = await newPage();
  await go(qr, `/start?src=qr&campaign=${campaign}`);
  check("/start address tidied after load", await qr.evaluate(() => location.search === ""));
  const qrCode = await waitFor(() => codeFor(qr.ip, qr.ua));
  await waitFor(async () => (await eventsOf(qrCode)).length >= 1);
  await nav(
    qr,
    `/search?q=${encodeURIComponent("Carpenter 0803 123 4567 ada.obi@example.org")}&state=lagos`,
  );
  await waitFor(async () => (await eventsOf(qrCode)).some((e) => e.kind === "SEARCH"));
  await nav(qr, `/business/${ids.One.slug}`);
  await waitFor(async () => (await eventsOf(qrCode)).some((e) => e.business_id === B1));
  check(
    "WhatsApp tap beacon accepted",
    (await beacon(qr, { businessId: B1, type: "WHATSAPP" })) === 204,
  );
  await waitFor(async () => (await eventsOf(qrCode)).some((e) => e.kind === "CONTACT"));
  let ev = await eventsOf(qrCode);
  const start = ev.find((e) => e.path_type === "start");
  check(
    "start page view: source qr + campaign, phone",
    start?.source === "qr" && start?.campaign === campaign && start?.device === "phone",
    JSON.stringify(start),
  );
  const search = ev.find((e) => e.kind === "SEARCH");
  check(
    "search stored without phone number or email",
    search?.query === "carpenter",
    JSON.stringify(search?.query),
  );
  check(
    "search filters + result count stored",
    search?.state === "lagos" && typeof search?.result_count === "number",
    JSON.stringify(search),
  );
  check(
    "in-site page loads are not new entries (no source)",
    ev
      .filter((e) => e.kind === "PAGE_VIEW" && e.path_type !== "start")
      .every((e) => e.source === null),
    JSON.stringify(ev.map((e) => e.source)),
  );
  const bview = ev.find((e) => e.business_id === B1 && e.kind === "PAGE_VIEW");
  check(
    "business page view recorded (counted, not repeat)",
    bview && bview.repeat === false && bview.path_type === "business",
  );
  check(
    "WhatsApp contact recorded",
    ev.some((e) => e.kind === "CONTACT" && e.contact_type === "WHATSAPP" && e.business_id === B1),
  );
  const cookieNames = (await qr.cookies(baseUrl)).map((c) => c.name);
  check(
    "no new cookies (only the existing QR and counting cookies)",
    cookieNames.every((n) => /^chf_qr(_v)?$|^chf_t_/.test(n)),
    cookieNames.join(", "),
  );
  const rawCols = await q(
    "select column_name from information_schema.columns where table_name = 'analytics_events'",
  );
  check(
    "raw events have no IP, user agent, URL, referrer or user columns",
    !rawCols.some((c) => /ip|agent|url|referr|user|email|phone/.test(c.column_name)),
    rawCols.map((c) => c.column_name).join(","),
  );
  const allText = JSON.stringify(await q("select * from analytics_events"));
  check(
    "no IP address or user agent stored anywhere",
    !allText.includes(qr.ip) &&
      !allText.includes("Pixel 7") &&
      !allText.includes("0803") &&
      !allText.includes("example.org"),
  );

  // -------------------------------------------------------------------------------------------
  console.log("\nGoogle visitor (desktop): zero-result search, phone-only search, repeat views");
  const g = await newPage({ width: 1280, ua: DESKTOP_UA });
  // Same scheme as the local server (an https -> http referrer would be dropped by the browser).
  await go(g, "/", { referer: "http://www.google.com/" });
  const gCode = await waitFor(() => codeFor(g.ip, g.ua));
  await waitFor(async () => (await eventsOf(gCode)).length >= 1);
  await go(g, `/search?q=${encodeURIComponent("zzqxv nonexistent trade")}`);
  await waitFor(async () => (await eventsOf(gCode)).some((e) => e.kind === "SEARCH"));
  await go(g, `/search?q=${encodeURIComponent("08031234567")}`);
  await sleep(2500);
  const viewsBefore = (await one("select view_count from businesses where id = $1", [B1]))
    .view_count;
  await go(g, `/business/${ids.One.slug}`);
  await waitFor(async () => (await eventsOf(gCode)).some((e) => e.business_id === B1));
  await go(g, `/business/${ids.One.slug}`);
  await waitFor(
    async () => (await eventsOf(gCode)).filter((e) => e.business_id === B1).length >= 2,
  );
  ev = await eventsOf(gCode);
  check(
    "home entry: source google, desktop",
    ev[0]?.path_type === "home" && ev[0]?.source === "google" && ev[0]?.device === "desktop",
    JSON.stringify(ev[0]),
  );
  const searches = ev.filter((e) => e.kind === "SEARCH");
  check(
    "zero-result search recorded with 0 results",
    searches.some((e) => e.query === "zzqxv nonexistent trade" && e.result_count === 0),
    JSON.stringify(searches),
  );
  check("phone-only search not stored", searches.length === 1, `${searches.length} searches`);
  check("both search page views counted", ev.filter((e) => e.path_type === "search").length === 2);
  const b1Views = ev.filter((e) => e.business_id === B1);
  check(
    "repeat view within 6h: page view kept, marked repeat",
    b1Views.length === 2 && b1Views[0].repeat === false && b1Views[1].repeat === true,
  );
  check(
    "business view counter +1 only",
    (await one("select view_count from businesses where id = $1", [B1])).view_count ===
      viewsBefore + 1,
  );
  const pub = await mainText(g);
  check("no view counts shown publicly on the business page", !/\bviews?\b|\bviewed\b/i.test(pub));

  // -------------------------------------------------------------------------------------------
  console.log("\nExcluded: bots, admins, owners on their own listing");
  const bot = await newPage({ ua: BOT_UA });
  let before = await totalEvents();
  await go(bot, "/");
  await go(bot, `/business/${ids.One.slug}`);
  await beacon(bot, { type: "page", path: "/" });
  await sleep(3000);
  check("bot visits not counted", (await totalEvents()) === before);

  const adm = await newPage({ width: 1280, ua: DESKTOP_UA });
  check("test admin logs in", await login(adm, users.admin, "/admin"));
  await sleep(3000);
  before = await totalEvents();
  await go(adm, "/");
  await go(adm, "/search?q=carpenter");
  await go(adm, `/business/${ids.One.slug}`);
  await beacon(adm, { businessId: B1, type: "CALL" });
  await sleep(3000);
  check("admin visits, searches and taps not counted", (await totalEvents()) === before);

  const o1 = await newPage();
  check("owner 1 logs in", await login(o1, users.owner1, "/dashboard"));
  await sleep(2500);
  const b1Before = (
    await one("select count(*)::int n from analytics_events where business_id = $1", [B1])
  ).n;
  const vcBefore = await one(
    "select view_count, contact_click_count from businesses where id = $1",
    [B1],
  );
  await go(o1, `/business/${ids.One.slug}`);
  await beacon(o1, { businessId: B1, type: "WHATSAPP" });
  await sleep(3000);
  check(
    "owner viewing/tapping own listing not counted",
    (await one("select count(*)::int n from analytics_events where business_id = $1", [B1])).n ===
      b1Before,
  );
  const vcAfter = await one(
    "select view_count, contact_click_count from businesses where id = $1",
    [B1],
  );
  check(
    "own listing counters unchanged",
    vcAfter.view_count === vcBefore.view_count &&
      vcAfter.contact_click_count === vcBefore.contact_click_count,
  );
  await go(o1, `/business/${ids.Two.slug}`);
  await waitFor(
    async () =>
      (await one("select count(*)::int n from analytics_events where business_id = $1", [B2])).n >=
      1,
  );
  check(
    "owner viewing someone else's listing is counted",
    (await one("select count(*)::int n from analytics_events where business_id = $1", [B2])).n ===
      1,
  );

  // -------------------------------------------------------------------------------------------
  console.log("\nOwner stats on /dashboard (own businesses only)");
  await go(o1, "/dashboard");
  let dash = await mainText(o1);
  check(
    "owner 1 sees 'Your stats' with views and WhatsApp taps",
    /Your stats/.test(dash) && /Views\s+2\s+2/.test(dash) && /WhatsApp taps\s+1\s+1/.test(dash),
    dash.slice(dash.indexOf("Your stats"), dash.indexOf("Your stats") + 220).replace(/\s+/g, " "),
  );
  check(
    "encouraging message",
    dash.includes(
      "Your listing was viewed 2 times this week and 1 person contacted you. Well done!",
    ),
  );
  check("owner 1 dashboard never shows owner 2's business", !dash.includes(ids.Two.name));
  check(
    "trend chart shown",
    await o1.evaluate(() => Boolean(document.querySelector("main svg[role=img] polyline"))),
  );
  await axe(o1, "owner dashboard with stats (360px)");
  await o1.screenshot({ path: path.join(shotsDir, "analytics-owner-360.png"), fullPage: true });
  const o2 = await newPage({ width: 1280, ua: DESKTOP_UA });
  check("owner 2 logs in", await login(o2, users.owner2, "/dashboard"));
  await go(o2, "/dashboard");
  dash = await mainText(o2);
  check(
    "owner 2 sees only their own stats (1 view from owner 1)",
    /Views\s+1\s+1/.test(dash) && !dash.includes(ids.One.name),
    dash.slice(dash.indexOf("Your stats"), dash.indexOf("Your stats") + 160).replace(/\s+/g, " "),
  );
  await axe(o2, "owner dashboard with stats (desktop)");
  const [stats1, stats2] = trigger([
    { fn: "getOwnerStats", args: [users.owner1.id] },
    { fn: "getOwnerStats", args: [users.owner2.id] },
  ]);
  check(
    "getOwnerStats returns only the owner's own businesses",
    JSON.stringify(Object.keys(stats1)) === JSON.stringify([B1]) &&
      JSON.stringify(Object.keys(stats2)) === JSON.stringify([B2]),
  );

  // -------------------------------------------------------------------------------------------
  console.log("\nAdmin analytics (every date range), overview summary, QR page");
  for (const [range, width] of [
    ["today", 360],
    ["7", 1280],
    ["30", 360],
    ["90", 1280],
  ]) {
    const p = width === 360 ? await newPage() : await newPage({ width, ua: DESKTOP_UA });
    await login(p, users.admin, `/admin/analytics`);
    const res = await go(p, `/admin/analytics?range=${range}`);
    const t = await mainText(p);
    check(
      `range ${range}: page loads with headline cards`,
      res.status() === 200 &&
        [
          "Unique visitors",
          "Page views",
          "Contacts",
          "Contact rate",
          "New sign-ups",
          "New listings",
        ].every((s) => t.includes(s)),
    );
    check(
      `range ${range}: current range marked`,
      await p.evaluate(
        (r) => document.querySelector(`a[aria-current=page][href$="range=${r}"]`) !== null,
        range,
      ),
    );
    check(
      `range ${range}: chart drawn`,
      await p.evaluate(() => document.querySelectorAll("main svg[role=img] polyline").length === 2),
    );
    check(
      `range ${range}: zero-result search under "Demand you're not meeting"`,
      await p.evaluate(() => {
        const s = [...document.querySelectorAll("section")].find((x) =>
          x.querySelector("h2")?.textContent.includes("Demand you"),
        );
        return Boolean(s?.textContent.includes("zzqxv nonexistent trade"));
      }),
    );
    check(
      `range ${range}: QR campaign as a source with visitors, searches, views, contacts`,
      await p.evaluate((c) => {
        const row = [...document.querySelectorAll("tr")].find(
          (r) => r.querySelector("th")?.textContent.trim() === c,
        );
        return row
          ? [...row.querySelectorAll("td")].map((td) => Number(td.textContent)).every((n) => n >= 1)
          : false;
      }, campaign),
    );
    check(`range ${range}: top businesses list the test business`, t.includes(ids.One.name));
    check(`range ${range}: comparison shown`, /vs (yesterday|previous \d+ days)/.test(t));
    if (range === "today") check("today: chart by hour", t.includes("by hour today"));
    await axe(p, `admin analytics range=${range} (${width}px)`);
    if (range === "today" || range === "30")
      await p.screenshot({
        path: path.join(shotsDir, `analytics-admin-${range}-${width}.png`),
        fullPage: true,
      });
    await p.browserContext().close();
  }
  await go(adm, "/admin");
  let t = await mainText(adm);
  check(
    "overview: 'Last 7 days' summary with link",
    t.includes("Last 7 days") &&
      (await adm.evaluate(() =>
        Boolean(document.querySelector('a[href="/admin/analytics?range=7"]')),
      )),
  );
  await axe(adm, "admin overview (desktop)");
  await go(adm, "/admin/qr-codes");
  t = await mainText(adm);
  check(
    "QR page: existing counts kept and analytics table added",
    t.includes("What QR visitors did") && /scans?/i.test(t) && t.includes(campaign),
  );
  check(
    "admin nav has Analytics",
    await adm.evaluate(() => Boolean(document.querySelector('nav a[href="/admin/analytics"]'))),
  );
  const anon = await fetch(`${baseUrl}/admin/analytics`, { redirect: "manual" });
  check(
    "non-admins can't open /admin/analytics",
    anon.status === 404 ||
      (anon.status >= 300 && anon.status < 400) ||
      /not found/i.test(await anon.text()),
    String(anon.status),
  );
  await go(o1, "/admin/analytics");
  check(
    "owner gets 404 on /admin/analytics",
    /not found|404/i.test(await o1.evaluate(() => document.body.innerText)),
  );
  // Known, unrelated: every admin URL logs a hydration warning for non-admins (the 404 page).
  o1.errors = o1.errors.filter((e) => !e.startsWith("/admin"));
  const priv = await (await fetch(`${baseUrl}/privacy`)).text();
  check(
    "privacy policy explains the analytics",
    priv.includes("changes every day") &&
      priv.includes("deleted after 7 days") &&
      priv.includes("no Google Analytics"),
  );

  // -------------------------------------------------------------------------------------------
  console.log(
    "\nDay boundary, QR attribution, roll-up, Monday summary (clock set to January 2001)",
  );
  const req = (ip, ua = ANDROID_UA) => ({ ip, userAgent: ua, siteHost: "localhost" });
  const A = req("10.88.0.1");
  const Bv = req("10.88.0.2", DESKTOP_UA);
  const C = req("10.88.0.3");
  const D = req("10.88.0.4");
  const E = req("10.88.0.5");
  const late = "2001-01-01T22:30:00Z"; // 23:30 in Lagos, 1 January
  const early = "2001-01-01T23:30:00Z"; // 00:30 in Lagos, 2 January
  const mid3 = "2001-01-03T10:00:00Z";
  const mid5 = "2001-01-05T10:00:00Z";
  // Owner 2 turned weekly emails off: in-app only.
  await q(
    "insert into notification_preferences (user_id, category, push, email) values ($1, 'WEEKLY_STATS', true, false)",
    [users.owner2.id],
  );
  const r = trigger([
    { fn: "saltFor", args: ["2001-01-01"], at: late },
    { fn: "recordPageView", args: [A, "home", { referrerHost: null, qrCampaign: null }], at: late },
    { fn: "recordPageView", args: [A, "search", null], at: late },
    {
      fn: "recordPageView",
      args: [Bv, "home", { referrerHost: "www.google.com", qrCampaign: null }],
      at: late,
    },
    { fn: "saltFor", args: ["2001-01-02"], at: early },
    { fn: "recordPageView", args: [A, "home", null], at: early },
    {
      fn: "recordPageView",
      args: [C, "start", { referrerHost: null, qrCampaign: campaign }],
      at: mid3,
    },
    {
      fn: "recordSearch",
      args: [C, { query: "carpenter", category: null, state: null, resultCount: 3 }],
      at: mid3,
    },
    {
      fn: "recordBusinessView",
      args: [C, { businessId: B1, viewerId: null, repeat: false, entry: null }],
      at: mid3,
    },
    { fn: "recordContact", args: [C, B1, "CALL"], at: mid3 },
    {
      fn: "recordPageView",
      args: [D, "home", { referrerHost: null, qrCampaign: "not-a-campaign" }],
      at: mid3,
    },
    {
      fn: "recordSearch",
      args: [D, { query: "unicorn repair", category: null, state: "lagos", resultCount: 0 }],
      at: mid3,
    },
    {
      fn: "recordBusinessView",
      args: [
        E,
        {
          businessId: B2,
          viewerId: null,
          repeat: false,
          entry: { referrerHost: "l.facebook.com", qrCampaign: null },
        },
      ],
      at: mid5,
    },
    { fn: "recordContact", args: [E, B2, "WHATSAPP"], at: mid5 },
    {
      fn: "recordBusinessView",
      args: [E, { businessId: B2, viewerId: users.owner2.id, repeat: false, entry: null }],
      at: mid5,
    },
  ]);
  check("salt changes every day", r[0] !== r[4] && typeof r[0] === "string");
  check(
    "previous day's salt deleted",
    !(await one("select 1 x from analytics_salts where day = '2001-01-01'")),
  );
  const day1A = await q(
    "select distinct visitor from analytics_events where day in ('2001-01-01','2001-01-02') and path_type = 'home' and device = 'phone'",
  );
  check("same visitor gets a different code on the next day", day1A.length === 2);
  check(
    "unknown QR campaign isn't credited",
    (
      await one(
        "select source, campaign from analytics_events where day = '2001-01-03' and path_type = 'home'",
      )
    )?.source === "direct",
  );
  check(
    "owner's own view (even with the clock moved) not recorded",
    (
      await one(
        "select count(*)::int n from analytics_events where business_id = $1 and day = '2001-01-05' and kind = 'PAGE_VIEW'",
        [B2],
      )
    ).n === 1,
  );

  const [roll] = trigger([{ fn: "rollUpAnalytics", args: [Date.parse("2001-01-08T12:00:00Z")] }]);
  check("roll-up covers each finished day once", roll.daysRolledUp === 4, JSON.stringify(roll));
  const daily = await q(
    "select to_char(day,'YYYY-MM-DD') d, metric, key, value from analytics_daily where day between '2001-01-01' and '2001-01-07'",
  );
  const val = (d, metric, key = "") =>
    daily.find((x) => x.d === d && x.metric === metric && x.key === key)?.value ?? 0;
  check("visitors 1 Jan (late evening) = 2", val("2001-01-01", "visitors") === 2);
  check(
    "visitors 2 Jan (just after midnight) = 1 (counted again on the new day)",
    val("2001-01-02", "visitors") === 1,
  );
  check(
    "page views by type",
    val("2001-01-01", "pageviews", "home") === 2 && val("2001-01-01", "pageviews", "search") === 1,
  );
  check(
    "sources: direct and google",
    val("2001-01-01", "source", "direct") === 1 && val("2001-01-01", "source", "google") === 1,
  );
  check(
    "devices (visitors)",
    val("2001-01-01", "device", "phone") === 1 && val("2001-01-01", "device", "desktop") === 1,
  );
  check(
    "QR campaign credited with visitors, searches, business views, contacts",
    ["qr_visitors", "qr_searches", "qr_business_views", "qr_contacts"].every(
      (m) => val("2001-01-03", m, campaign) === 1,
    ),
  );
  check(
    "searches and zero-result searches",
    val("2001-01-03", "searches") === 2 &&
      val("2001-01-03", "zero_searches") === 1 &&
      val("2001-01-03", "zero_search", "unicorn repair\u001f\u001flagos") === 1,
  );
  check(
    "contacts by type",
    val("2001-01-03", "contacts", "CALL") === 1 && val("2001-01-05", "contacts", "WHATSAPP") === 1,
  );
  check("facebook source from referrer host", val("2001-01-05", "source", "facebook") === 1);
  check(
    "days marked rolled",
    ["2001-01-01", "2001-01-02", "2001-01-03", "2001-01-05"].every((d) => val(d, "rolled") === 1),
  );
  const bsd = await q(
    "select business_id::text b, to_char(day,'YYYY-MM-DD') d, views, whatsapp, calls, emails from business_stats_daily where day between '2001-01-01' and '2001-01-07' order by d",
  );
  check(
    "per-business daily stats",
    bsd.length === 2 &&
      bsd[0].b === B1 &&
      bsd[0].views === 1 &&
      bsd[0].calls === 1 &&
      bsd[1].b === B2 &&
      bsd[1].views === 1 &&
      bsd[1].whatsapp === 1,
    JSON.stringify(bsd),
  );
  check("aggregates hold no visitor codes", !JSON.stringify(daily).match(/[0-9a-f]{32}/));
  const [again, s1, s2] = trigger([
    { fn: "rollUpAnalytics", args: [Date.parse("2001-01-08T12:00:00Z")] },
    { fn: "getOwnerStats", args: [users.owner1.id, "2001-01-08"] },
    { fn: "getOwnerStats", args: [users.owner2.id, "2001-01-08"] },
  ]);
  check("roll-up is idempotent", again.daysRolledUp === 0);
  check(
    "owner stats from rolled-up days, own business only",
    Object.keys(s1).join() === B1 &&
      s1[B1].views30 === 1 &&
      s1[B1].calls30 === 1 &&
      Object.keys(s2).join() === B2 &&
      s2[B2].whatsapp30 === 1,
  );

  const sentBefore = outbox().filter((m) => m.tag === "weekly-stats").length;
  const [w1, w2, w3] = trigger([
    { fn: "sendWeeklyOwnerStats", args: [Date.parse("2001-01-09T08:00:00Z")] }, // Tuesday: nothing
    { fn: "sendWeeklyOwnerStats", args: [Date.parse("2001-01-08T08:00:00Z")] }, // Monday
    { fn: "sendWeeklyOwnerStats", args: [Date.parse("2001-01-08T09:00:00Z")] }, // Monday again
  ]);
  check("weekly summary only on Mondays", w1 === 0);
  check("weekly summary sent to both test owners", w2 === 2, String(w2));
  check("weekly summary sent once per Monday", w3 === 0);
  const wn1 = await q(
    "select title, body, link from notifications where user_id = $1 and type = 'weekly-stats'",
    [users.owner1.id],
  );
  check(
    "owner 1 summary under the bell",
    wn1.length === 1 &&
      wn1[0].body.startsWith(
        "Your listing was viewed 1 time last week and 1 person contacted you",
      ) &&
      wn1[0].link === "/dashboard",
    JSON.stringify(wn1),
  );
  const mails = outbox()
    .filter((m) => m.tag === "weekly-stats")
    .slice(sentBefore);
  check(
    "weekly email respects settings (owner 1 yes, owner 2 turned off)",
    mails.length === 1 && mails[0].to.email === users.owner1.email,
  );
  check(
    "owner 2 still gets it in-app",
    (
      await q("select 1 from notifications where user_id = $1 and type = 'weekly-stats'", [
        users.owner2.id,
      ])
    ).length === 1,
  );
  const realOwnerNotesAfter = (
    await one(
      "select count(*)::int n from notifications n join profiles p on p.id = n.user_id where p.email not like '%@example.com' and n.type = 'weekly-stats'",
    )
  ).n;
  check("no real account was notified", realOwnerNotesAfter === realOwnerNotesBefore);
  // The live site shares this database, so real alerts about real events can appear meanwhile;
  // only notifications about this test's data would be a problem.
  const realNotes = (
    await one(
      "select count(*)::int n from notifications n join profiles p on p.id = n.user_id where p.email not like '%@example.com' and n.created_at >= $1 and (n.type = 'weekly-stats' or n.title like '%E2E%' or n.body like '%E2E%' or n.link like any($2::text[]))",
      [testStart, [B1, B2].map((id) => `%${id}%`)],
    )
  ).n;
  check("no test notifications reached real accounts", realNotes === 0, String(realNotes));

  console.log("\nRaw-event deletion after 7 days");
  await q(`insert into analytics_events (day, kind, visitor, device, path_type, created_at) values
    ('2001-01-04', 'PAGE_VIEW', repeat('a', 32), 'phone', 'home', now() - interval '8 days'),
    ('2001-01-04', 'PAGE_VIEW', repeat('b', 32), 'phone', 'home', now() - interval '6 days')`);
  const [prune] = trigger([{ fn: "rollUpAnalytics", args: [] }]);
  const old = await q(
    "select visitor from analytics_events where visitor in (repeat('a', 32), repeat('b', 32))",
  );
  check(
    "raw events older than 7 days deleted, newer kept",
    old.length === 1 && old[0].visitor === "b".repeat(32) && prune.rawDeleted >= 1,
    JSON.stringify(prune),
  );
  check(
    "older salts deleted, today's kept",
    (await one("select count(*)::int n from analytics_salts where day < $1::date", [lagosToday()]))
      .n === 0 &&
      (
        await one("select count(*)::int n from analytics_salts where day = $1::date", [
          lagosToday(),
        ])
      ).n === 1,
  );
  check(
    "today's events not rolled up yet (live figures)",
    (
      await one(
        "select count(*)::int n from analytics_daily where day = $1::date and metric = 'rolled'",
        [lagosToday()],
      )
    ).n === 0,
  );
  check(
    "no analytics for real businesses",
    (
      await one(
        "select count(*)::int n from analytics_events e join businesses b on b.id = e.business_id join profiles p on p.id = b.owner_id where p.email not like '%@example.com'",
      )
    ).n === 0,
  );

  const errs = [qr, g, o1, o2, adm].flatMap((p) => p.errors);
  check("no page errors", errs.length === 0, errs.join(" | "));
} catch (e) {
  failures++;
  console.log("  ERROR", e.message);
} finally {
  console.log("\nCleanup");
  const idList = Object.values(users)
    .map((u) => u.id)
    .filter(Boolean);
  if (startedEmpty) {
    // Production doesn't record analytics until this is deployed: every row is test data.
    // Today's salt stays while the server is running (it caches it); analytics-cleanup.mjs
    // removes it after the server has stopped.
    for (const t of tables)
      await q(
        t === "analytics_salts"
          ? "delete from analytics_salts where day <> $1::date"
          : `delete from ${t}`,
        t === "analytics_salts" ? [lagosToday()] : [],
      );
  } else {
    await q(
      "delete from analytics_events where business_id = any($1::uuid[]) or day < '2002-01-01' or created_at >= $2",
      [Object.values(ids).map((b) => b.id), testStart],
    );
    await q("delete from analytics_daily where day < '2002-01-01'");
    await q("delete from business_stats_daily where day < '2002-01-01'");
  }
  await q("delete from qr_campaigns where name = $1", [campaign]);
  await q("delete from rate_limit_hits where created_at >= $1", [testStart]);
  await q("delete from businesses where owner_id = any($1::uuid[])", [idList]);
  await q("delete from profiles where id = any($1::uuid[])", [idList]);
  for (const u of Object.values(users))
    if (u.id) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  const left = await one(
    `select (select count(*) from profiles where email like $1)::int p, (select count(*) from businesses where slug like $2)::int b,
    (select count(*) from qr_campaigns where name = $3)::int c, (select count(*) from analytics_events)::int e, (select count(*) from analytics_daily)::int d,
    (select count(*) from business_stats_daily)::int s, (select count(*) from analytics_salts)::int salts`,
    [`chf-e2e-${run}-%`, `e2e-an-${run}-%`, campaign],
  );
  console.log("  leftovers:", JSON.stringify(left));
  await browser.close();
  await db.end();
}
console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
