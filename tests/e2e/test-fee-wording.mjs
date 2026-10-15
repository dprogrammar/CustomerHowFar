// Fee wording follows the admin's listing-fee switch: while OFF, listing is presented as free
// with no fee/payment wording (except /terms and the legal /privacy page); switched ON through
// /admin/settings, all fee and payment info comes back with no code change. Leaves the switch
// OFF and deletes everything it created.
// Usage: node test-fee-wording.mjs <projectDir> <baseUrl>
import crypto from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { axeSource, browserPath } from "./lib/setup.mjs";

const [projectDir, baseUrl] = process.argv.slice(2);
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
  owner: mk("owner", "Ola Owner", "BUSINESS_OWNER"),
  admin: mk("admin", "Ade Admin", "ADMIN"),
};
const FREE_TEXT =
  "Listing your business on CustomerHowFar is free. Tap 'List your business' to get started.";
/** Fee and payment wording that must not appear while listing is free. */
const FEE_WORDS =
  /listing fee|\bfees?\b|payment|bank transfer|\breceipts?\b|refund|₦|\bpaid\b|\bpay (now|the listing)/i;

let failures = 0;
const check = (name, pass, detail = "") => {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true });
let ip = 40;
async function newPage(width = 360) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  );
  if (width < 768) await page.setViewport({ width, height: 800, isMobile: true, hasTouch: true });
  else await page.setViewport({ width, height: 900 });
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.88.${ip++}.7` });
  return page;
}
const go = async (page, p) => {
  await page.goto(baseUrl + p, { waitUntil: "load" });
  await sleep(900);
};
/** All text on the page, including closed help answers (no scripts). */
const pageText = (page) =>
  page.evaluate(() => {
    const c = document.body.cloneNode(true);
    c.querySelectorAll("script, style, noscript, template").forEach((e) => e.remove());
    return c.textContent.replace(/\s+/g, " ");
  });
/**
 * Wording about customers paying a business (safety advice) and the POS category description is
 * not about the listing fee, so it is allowed.
 */
const ALLOWED = [
  "Keep receipts and screenshots",
  "or other fees before doing any work",
  "deals and payments are between you and the business",
  "bill payments and airtime",
];
const feeHits = (text) => {
  let t = text;
  for (const a of ALLOWED) t = t.split(a).join(" ");
  return [...t.matchAll(new RegExp(FEE_WORDS.source, "gi"))].map((m) =>
    t.slice(Math.max(0, m.index - 50), m.index + 30),
  );
};
const footerLinks = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("footer a")].map(
      (a) => `${a.innerText.trim()}=${a.getAttribute("href")}`,
    ),
  );
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
    `a11y + 360px: ${label}`,
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
// Chat
async function openChat(page) {
  await page.click('.chat-launcher button[aria-haspopup="dialog"]');
  await page.waitForSelector("dialog[open]", { timeout: 20000 });
  await sleep(1500); // let the start action report the fee setting
}
const botCount = (page) =>
  page.evaluate(() => document.querySelectorAll('dialog[open] [data-from="bot"]').length);
const lastBot = (page) =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll('dialog[open] [data-from="bot"]')].at(-1);
    return {
      text: el.innerText.replace(/^HowFar Assistant:\s*/, "").trim(),
      links: [...el.querySelectorAll("a")].map((a) => a.getAttribute("href")),
      buttons: [...el.querySelectorAll("button")].map((b) => b.innerText.trim()),
    };
  });
async function ask(page, text) {
  const before = await botCount(page);
  await (
    await page.waitForSelector("dialog[open] input")
  ).evaluate((e, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, v);
    e.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  await page.evaluate(() =>
    document.querySelector('dialog[open] form button[type="submit"]').click(),
  );
  await page.waitForFunction(
    (n) =>
      document.querySelectorAll('dialog[open] [data-from="bot"]').length > n &&
      !document.querySelector('dialog[open] [data-from="typing"]'),
    { timeout: 25000 },
    before,
  );
  await sleep(200);
  return lastBot(page);
}
const chips = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('dialog[open] [aria-label="Quick questions"] button')].map((b) =>
      b.innerText.trim(),
    ),
  );

async function setFee(page, on) {
  await go(page, "/admin/settings");
  const isOn =
    (await page.$eval('button[role="switch"]', (e) => e.getAttribute("aria-checked"))) === "true";
  if (isOn !== on) await page.$eval('button[role="switch"]', (e) => e.click());
  await page.evaluate(() =>
    [...document.querySelectorAll("main button")]
      .find((b) => b.innerText.trim() === "Save changes")
      .click(),
  );
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  await page.evaluate(() =>
    [...document.querySelectorAll("dialog[open] button")]
      .find((b) => b.innerText.trim() === "Apply now")
      .click(),
  );
  for (let i = 0; i < 40; i++) {
    if (
      (await one("select payment_required from app_settings where id = 1")).payment_required === on
    )
      break;
    await sleep(500);
  }
  await sleep(1000);
  return (
    (await one("select payment_required from app_settings where id = 1")).payment_required === on
  );
}

const original = await one("select payment_required from app_settings where id = 1");
// The chat counts how often each answer is shown; restore the counts afterwards.
const counters = await q(
  "select id, times_shown, helpful_count, not_helpful_count from faq_entries",
);
try {
  console.log("Setup");
  check("starting point: listing fee switch is OFF", original.payment_required === false);
  if (original.payment_required) throw new Error("Fee switch is ON; this test only runs from OFF.");
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
  const cat = (await one("select id from categories where slug = 'plumbers'")).id;
  await q(
    `insert into businesses (id, owner_id, name, slug, category_id, phone, whatsapp_number, status, updated_at)
           values (gen_random_uuid(), $1, $2, $3, $4, '+2348036660000', '+2348036660000', 'DRAFT', now())`,
    [users.owner.id, `E2E Wording Draft ${run}`, `e2e-fee-${run}-draft`, cat],
  );

  // -------------------------------------------------------------------------------------------
  console.log("\nFee OFF: listing is free, no fee or payment wording");
  const pub = await newPage();
  const publicPages = [
    "/",
    "/help",
    "/about",
    "/search",
    "/categories",
    "/contact",
    "/coming-soon",
  ];
  for (const p of publicPages) {
    await go(pub, p);
    const hits = feeHits(await pageText(pub));
    check(`${p}: no fee or payment wording`, hits.length === 0, hits.join(", "));
  }
  await go(pub, "/");
  let text = await pageText(pub);
  check(
    "homepage business call-to-action says it's free",
    text.includes("Free to list your business"),
  );
  check("'How it works' says it's free", text.includes("free for businesses to list"));
  check(
    "footer: no 'Listing fee' link",
    !(await footerLinks(pub)).some((l) => l.startsWith("Listing fee")),
  );
  await axe(pub, "homepage (fee off)");
  await go(pub, "/help#free-to-list");
  const help = await pub.evaluate(() => ({
    free: document.getElementById("free-to-list")?.open,
    fee: Boolean(document.getElementById("listing-fee")),
    terms: [...document.querySelectorAll("main a")].some((a) =>
      a.getAttribute("href")?.startsWith("/terms"),
    ),
  }));
  check("/help: 'Is it free to list?' shown, fee answer hidden", help.free === true && !help.fee);
  check("/help: no link to the fee terms", !help.terms);
  await axe(pub, "/help (fee off)");
  const terms = await (await fetch(baseUrl + "/terms")).text();
  check(
    "/terms keeps the listing fee clause",
    terms.includes('id="listing-fee"') && terms.includes("The listing fee"),
  );

  await openChat(pub);
  check(
    "chat: no 'How much is the listing fee?' chip",
    !(await chips(pub)).includes("How much is the listing fee?"),
    (await chips(pub)).join(" | "),
  );
  for (const msg of [
    "How much is the listing fee?",
    "how do I pay for my listing",
    "is there a fee to list my business",
    "bank transfer details for listing",
    "na how much una dey collect",
    "refund for listing fee",
  ]) {
    const r = await ask(pub, msg);
    check(
      `chat '${msg}' -> only "free to list"`,
      r.text === FREE_TEXT && r.links.includes("/business/new") && r.buttons.length === 0,
      r.text.slice(0, 90),
    );
  }
  for (const msg of [
    "Why was my listing rejected?",
    "How do I delete my account?",
    "is my data safe",
    "How do I list my business?",
    "What happens after I submit my listing?",
  ]) {
    const r = await ask(pub, msg);
    const hits = feeHits(r.text + " " + r.buttons.join(" "));
    check(
      `chat '${msg}': answered with no fee or payment wording`,
      hits.length === 0 && !r.links.some((l) => l?.startsWith("/terms")),
      hits.join(", "),
    );
  }
  await axe(pub, "chat (fee off)");

  const own = await newPage();
  check("owner logs in", await login(own, users.owner, "/dashboard"));
  for (const p of ["/dashboard", "/business/new", "/account"]) {
    await go(own, p);
    const hits = feeHits(await pageText(own));
    check(`${p}: no fee or payment wording`, hits.length === 0, hits.join(", "));
  }
  await go(own, "/business/new");
  check("/business/new says listing is free", (await pageText(own)).includes("Listing is free"));
  await axe(own, "/business/new (fee off)");
  await go(own, "/dashboard");
  await openChat(own);
  const status = await ask(own, "my listing status");
  check(
    "listing status: no payment line while free",
    status.text.includes(`E2E Wording Draft ${run}`) && feeHits(status.text).length === 0,
    feeHits(status.text).join(", "),
  );

  const ad = await newPage(1280);
  check("admin logs in", await login(ad, users.admin, "/admin"));
  await go(ad, "/admin/help-assistant");
  text = await ad.evaluate(() => document.querySelector("main").innerText);
  check(
    "admin: visibility shown on entries",
    text.includes("Only when fee is on") && text.includes("Only when fee is off"),
  );
  const feeEntry = await one("select id from faq_entries where slug = 'listing-fee'");
  await go(ad, `/admin/help-assistant/${feeEntry.id}`);
  const vis = await ad.evaluate(() =>
    [...document.querySelectorAll("main select")].map((s) => s.value),
  );
  check("admin: fee answer set to 'Only while the listing fee is on'", vis.includes("FEE_ON"));

  // -------------------------------------------------------------------------------------------
  console.log("\nFee ON (switched in /admin/settings): fee and payment info comes back");
  check("admin turns the listing fee ON", await setFee(ad, true));
  const on = await newPage();
  await go(on, "/");
  check(
    "footer: 'Listing fee' link back",
    (await footerLinks(on)).some((l) => l === "Listing fee=/help#listing-fee"),
  );
  text = await pageText(on);
  check(
    "homepage no longer says 'Free to list'",
    !text.includes("Free to list your business") && !text.includes("free for businesses to list"),
  );
  await go(on, "/help#listing-fee");
  const helpOn = await on.evaluate(() => ({
    fee: document.getElementById("listing-fee")?.open,
    free: Boolean(document.getElementById("free-to-list")),
    text: document.querySelector("main").textContent,
  }));
  check(
    "/help: fee answer back (with the amount), 'free to list' hidden",
    helpOn.fee === true &&
      !helpOn.free &&
      helpOn.text.includes("₦5,000") &&
      helpOn.text.includes("bank transfer"),
  );
  check(
    "/help: 'If you already paid' back in the rejected answer",
    helpOn.text.includes("If you already paid"),
  );
  await axe(on, "/help (fee on)");
  await openChat(on);
  check("chat: fee chip back", (await chips(on)).includes("How much is the listing fee?"));
  let r = await ask(on, "How much is the listing fee?");
  check(
    "chat: full fee and payment answer",
    r.text.includes("How much is the listing fee") &&
      r.text.includes("₦5,000") &&
      r.text.includes("bank transfer") &&
      r.text.includes("receipt"),
  );
  r = await ask(on, "Why was my listing rejected?");
  check("chat: payment sentence back in other answers", r.text.includes("If you already paid"));
  await go(own, "/business/new");
  check("/business/new: original wording", (await pageText(own)).includes("It's free to start"));

  // -------------------------------------------------------------------------------------------
  console.log("\nBack OFF");
  check("admin turns the listing fee OFF", await setFee(ad, false));
  await go(on, "/");
  check(
    "footer: 'Listing fee' link hidden again",
    !(await footerLinks(on)).some((l) => l.startsWith("Listing fee")),
  );
  await go(on, "/help");
  check("/help: fee answer hidden again", feeHits(await pageText(on)).length === 0);
  await openChat(on);
  r = await ask(on, "How much is the listing fee?");
  check("chat: 'free to list' again", r.text === FREE_TEXT);
} catch (e) {
  failures++;
  console.log("  ERROR", e.message);
} finally {
  console.log("\nCleanup");
  const now = await one("select payment_required from app_settings where id = 1");
  if (now.payment_required !== original.payment_required) {
    await q("update app_settings set payment_required = $1 where id = 1", [
      original.payment_required,
    ]);
    console.log("  fee switch restored directly in the database");
  }
  for (const c of counters)
    await q(
      "update faq_entries set times_shown = $2, helpful_count = $3, not_helpful_count = $4 where id = $1",
      [c.id, c.times_shown, c.helpful_count, c.not_helpful_count],
    );
  const idList = Object.values(users)
    .map((u) => u.id)
    .filter(Boolean);
  await q("delete from setting_changes where admin_id = any($1::uuid[])", [idList]);
  await q("delete from rate_limit_hits where created_at >= $1", [testStart]);
  await q("delete from businesses where owner_id = any($1::uuid[])", [idList]);
  await q("delete from profiles where id = any($1::uuid[])", [idList]);
  for (const u of Object.values(users))
    if (u.id) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  const s = await one("select payment_required from app_settings where id = 1");
  console.log(`  fee switch now ${s.payment_required ? "ON" : "OFF"}`);
  await browser.close();
  await db.end();
  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
