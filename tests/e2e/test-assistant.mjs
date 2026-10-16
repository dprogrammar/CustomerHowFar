// HowFar Assistant (free help chat) end to end. Real DB/Supabase; no emails are involved.
// Creates its own users and businesses, snapshots and restores the help-entry counters, and
// deletes everything it created (unanswered questions are marked with "zqx<run>").
// Usage: node test-assistant.mjs <projectDir> <baseUrl> <outboxFile> <shotsDir>
import crypto from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { axeSource, browserPath } from "./lib/setup.mjs";

const [projectDir, baseUrl, , shotsDir] = process.argv.slice(2);
const require = createRequire(path.join(projectDir, "package.json"));
require("./scripts/env-guard.mjs").loadEnv(); // refuses production
const { createClient } = require("@supabase/supabase-js");
const pg = require("pg");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = new pg.Pool({
  connectionString: process.env.DIRECT_URL,
  max: 3,
  idleTimeoutMillis: 10_000,
  keepAlive: true,
});
db.on("error", () => {});
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

const run = crypto.randomBytes(3).toString("hex");
const MARK = `zqx${run}`;
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
  other: mk("other", "Obi Other", "BUSINESS_OWNER"),
  admin: mk("admin", "Ade Admin", "ADMIN"),
  customer: mk("customer", "Chi Customer", "CUSTOMER"),
};
const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const origin = new URL(baseUrl).origin;

let failures = 0;
const check = (name, pass, detail = "") => {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true });
let ipCounter = 10;
async function newPage({ width = 360, height = 800, reducedMotion = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setUserAgent(UA);
  if (width < 768) await page.setViewport({ width, height, isMobile: true, hasTouch: true });
  else await page.setViewport({ width, height });
  // Each page gets its own (fake) IP so chat rate limits don't spill between sections.
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.77.${ipCounter++}.9` });
  if (reducedMotion)
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  return page;
}
const go = async (page, p) => {
  const res = await page.goto(baseUrl + p, { waitUntil: "load" });
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
  const set = async (sel, v) =>
    (await page.waitForSelector(sel, { visible: true })).evaluate((e, val) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, val);
      e.dispatchEvent(new Event("input", { bubbles: true }));
    }, v);
  await set('main [name="email"]', user.email);
  await set('main [name="password"]', user.password);
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

// --- Chat helpers ----------------------------------------------------------------------------
const LAUNCHER = '.chat-launcher button[aria-haspopup="dialog"]';
const launcherInfo = (page) =>
  page.evaluate((sel) => {
    const b = document.querySelector(sel);
    // Admin pages hide the launcher with CSS (it's still in the page, so hydration always matches).
    if (!b || getComputedStyle(b.closest(".chat-launcher") ?? b).display === "none") return null;
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    const hint = document.querySelector(".chat-hint");
    const badge = [...b.querySelectorAll("span[aria-hidden=true]")].find(
      (s) => s.textContent.trim() === "1",
    );
    return {
      w: r.width,
      h: r.height,
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      bg: cs.backgroundColor,
      radius: parseFloat(cs.borderTopLeftRadius),
      color: cs.color,
      svg: Boolean(b.querySelector("svg")),
      shadow: cs.boxShadow !== "none",
      hint: hint ? hint.innerText.trim() : null,
      hintRect: hint ? hint.getBoundingClientRect().toJSON() : null,
      badge: Boolean(badge && badge.offsetParent !== null),
      pulse: b.classList.contains("chat-pulse"),
      pulseAnim: getComputedStyle(b, "::before").animationName,
    };
  }, LAUNCHER);
async function openChat(page) {
  await page.click(LAUNCHER);
  await page.waitForSelector("dialog[open]", { timeout: 20000 });
  await page.waitForFunction(
    () => document.querySelectorAll('dialog[open] [data-from="bot"]').length >= 1,
    { timeout: 10000 },
  );
  await sleep(300);
}
const botCount = (page) =>
  page.evaluate(() => document.querySelectorAll('dialog[open] [data-from="bot"]').length);
const lastBot = (page) =>
  page.evaluate(
    () => [...document.querySelectorAll('dialog[open] [data-from="bot"]')].at(-1)?.innerText ?? "",
  );
const lastBotLinks = (page) =>
  page.evaluate(() =>
    [
      ...[...document.querySelectorAll('dialog[open] [data-from="bot"]')]
        .at(-1)
        .querySelectorAll("a"),
    ].map((a) => ({ text: a.innerText.trim(), href: a.getAttribute("href") })),
  );
async function waitReply(page, before) {
  await page.waitForFunction(
    (n) =>
      document.querySelectorAll('dialog[open] [data-from="bot"]').length > n &&
      !document.querySelector('dialog[open] [data-from="typing"]'),
    { timeout: 25000 },
    before,
  );
  await sleep(250);
  return lastBot(page);
}
async function ask(page, text) {
  const before = await botCount(page);
  const input = await page.waitForSelector("dialog[open] input", { visible: true });
  await input.evaluate((e, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, v);
    e.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  await page.evaluate(() =>
    document.querySelector('dialog[open] form button[type="submit"]').click(),
  );
  return waitReply(page, before);
}
async function clickInChat(page, label) {
  const before = await botCount(page);
  const ok = await page.evaluate((l) => {
    const b = [...document.querySelectorAll("dialog[open] button")]
      .filter((x) => !x.disabled && x.innerText.trim() === l)
      .at(-1);
    if (!b) return false;
    b.click();
    return true;
  }, label);
  if (!ok) throw new Error(`chat button "${label}" not found`);
  return waitReply(page, before);
}
const snapshotFaqs = async () =>
  Object.fromEntries(
    (await q("select slug, times_shown, helpful_count, not_helpful_count from faq_entries")).map(
      (r) => [r.slug, r],
    ),
  );

const counters = await q(
  "select id, times_shown, helpful_count, not_helpful_count from faq_entries",
);
const ids = {};
try {
  console.log("Setup");
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
  const lagos = await one("select id from states where slug = 'lagos'");
  const etiOsa = await one("select id from lgas where state_id = $1 and slug = 'eti-osa'", [
    lagos.id,
  ]);
  const cat = Object.fromEntries(
    (await q("select slug, id from categories where slug in ('plumbers','fashion-tailoring')")).map(
      (c) => [c.slug, c.id],
    ),
  );
  const insert = async (key, owner, category, status, extra = {}) => {
    const id = crypto.randomUUID();
    ids[key] = id;
    const name = extra.name ?? `E2E Chat ${key} ${run}`;
    await q(
      `insert into businesses (id, owner_id, name, slug, category_id, phone, whatsapp_number, address, area, state_id, lga_id, description, status, submitted_at, published_at, updated_at)
             values ($1,$2,$3,$4,$5,'+2348036660000','+2348036660000','1 Test Street','Lekki Phase 1',$6,$7,'A complete description of more than thirty characters for testing.',$8, now(), $9, now())`,
      [
        id,
        owner,
        name,
        `e2e-chat-${run}-${key.toLowerCase()}`,
        category,
        lagos.id,
        etiOsa.id,
        status,
        status === "APPROVED" ? new Date() : null,
      ],
    );
    return id;
  };
  for (let i = 1; i <= 4; i++)
    await insert(`Plumb${i}`, users.other.id, cat.plumbers, "APPROVED", {
      name: `E2E Plumb ${i} ${run}`,
    });
  await insert("Secret", users.other.id, cat.plumbers, "DRAFT", {
    name: `E2E Other Secret ${run}`,
  });
  await insert("Rejected", users.owner.id, cat["fashion-tailoring"], "REJECTED", {
    name: `E2E Mine Rejected ${run}`,
  });
  await insert("Paying", users.owner.id, cat["fashion-tailoring"], "PENDING_PAYMENT", {
    name: `E2E Mine Paying ${run}`,
  });
  await q(
    "insert into moderation_decisions (id, business_id, action, comment) values (gen_random_uuid(), $1, 'REJECTED', $2)",
    [ids.Rejected, "Please add clearer photos of your work."],
  );
  await q(
    "insert into payments (id, business_id, user_id, amount_kobo, provider, reference, status, proof_submitted_at, updated_at) values (gen_random_uuid(), $1, $2, 500000, 'MANUAL_TRANSFER', $3, 'AWAITING_CONFIRMATION', now(), now())",
    [ids.Paying, users.owner.id, `CHF-T${run.toUpperCase()}`],
  );
  await q(
    "insert into identity_verifications (id, user_id, id_type, full_name_on_id, consent_given_at, status, submitted_at, updated_at) values (gen_random_uuid(), $1, 'NIN_SLIP', 'Ola Owner', now(), 'PENDING', now(), now())",
    [users.owner.id],
  );
  const settings = await one(
    "select payment_required, listing_fee_naira, manual_transfer_enabled, bank_name, bank_account_number, bank_account_name from app_settings where id = 1",
  );
  const feeOn = settings.payment_required;
  const FREE_TEXT =
    "Listing your business on CustomerHowFar is free. Tap 'List your business' to get started.";
  const liveStates = (await q("select name from states where is_active order by name")).map(
    (s) => s.name,
  );

  // -------------------------------------------------------------------------------------------
  console.log("\nChat button: look, first visit, lazy loading");
  const pub = await newPage();
  const scripts = [];
  pub.on("response", async (r) => {
    if (r.request().resourceType() === "script" && r.url().startsWith(origin))
      scripts.push(await r.text().catch(() => ""));
  });
  await go(pub, "/");
  await sleep(500);
  let L = await launcherInfo(pub);
  check(
    "round button at least 56px",
    L && L.w >= 56 && L.h >= 56 && L.radius >= 28,
    L && `${L.w}x${L.h} r${L.radius}`,
  );
  check(
    "brand green with a white chat icon and a shadow",
    L.bg === "rgb(0, 135, 81)" && L.color === "rgb(255, 255, 255)" && L.svg && L.shadow,
    `${L.bg} ${L.color}`,
  );
  check(
    "fixed at the bottom-right",
    L.right >= 360 - 24 && L.right <= 360 - 8,
    `right edge ${L.right}`,
  );
  check(
    'first visit: "Need help? Chat with us" bubble',
    L.hint?.includes("Need help? Chat with us"),
  );
  check('first visit: red "1" badge', L.badge);
  check(
    "first visit: one-time pulse animation",
    L.pulse && L.pulseAnim === "chat-pulse",
    L.pulseAnim,
  );
  const nav = await pub.evaluate(() =>
    document.querySelector('nav[aria-label="Bottom navigation"]').getBoundingClientRect().toJSON(),
  );
  check(
    "phones: above the bottom navigation (never covers it)",
    L.bottom <= nav.top - 4 && L.hintRect.bottom <= nav.top,
    `button bottom ${L.bottom}, nav top ${nav.top}`,
  );
  const panelMarker = "Automated help · usually instant";
  check(
    "chat code not downloaded before the button is used",
    !scripts.some((s) => s.includes(panelMarker)),
  );
  await axe(pub, "homepage with the chat button");

  await pub.click(".chat-hint button:last-child");
  await sleep(300);
  check(
    "closing the bubble collapses it to just the button",
    (await launcherInfo(pub)).hint === null,
  );
  await pub.reload({ waitUntil: "load" });
  await sleep(800);
  L = await launcherInfo(pub);
  check(
    "bubble stays closed after reload (remembered per browser), badge still shown",
    L.hint === null && L.badge,
  );

  await openChat(pub);
  check(
    "chat code downloaded when the button is tapped",
    scripts.some((s) => s.includes(panelMarker)),
  );
  let panel = await pub.evaluate(() => {
    const d = document.querySelector("dialog[open]");
    const r = d.getBoundingClientRect();
    return {
      w: r.width,
      h: r.height,
      text: d.innerText,
      logo: Boolean(d.querySelector("header svg")),
      title: document.getElementById(d.getAttribute("aria-labelledby"))?.innerText,
    };
  });
  check(
    "phones: chat opens full screen",
    panel.w === 360 && panel.h === 800,
    `${panel.w}x${panel.h}`,
  );
  check(
    "header: logo, name and 'Automated help · usually instant'",
    panel.logo &&
      panel.title === "HowFar Assistant" &&
      panel.text.includes("Automated help · usually instant"),
  );
  check(
    "clearly automated, not a person",
    panel.text.includes("automated helper, not a person") &&
      panel.text.includes("Automated answers, not a person"),
  );
  const chips = await pub.evaluate(() =>
    [
      ...document.querySelectorAll(
        'dialog[open] [role="group"][aria-label="Quick questions"] button',
      ),
    ].map((b) => b.innerText.trim()),
  );
  const expectedChips = [
    "How do I list my business?",
    "What does 'ID submitted' mean?",
    ...(feeOn ? ["How much is the listing fee?"] : []),
    "Which states are you in?",
    "How do I stay safe?",
    "Find a business",
  ];
  check(
    `quick questions (${feeOn ? "with" : "no"} fee question; no 'My listing status' when logged out)`,
    expectedChips.every((c) => chips.includes(c)) &&
      !chips.includes("My listing status") &&
      chips.length === expectedChips.length,
    chips.join(" | "),
  );
  const trapped = [];
  for (let i = 0; i < 25; i++) {
    await pub.keyboard.press("Tab");
    trapped.push(
      await pub.evaluate(() => Boolean(document.activeElement?.closest("dialog[open]"))),
    );
  }
  check("focus stays inside the chat (focus trap)", trapped.every(Boolean));
  await axe(pub, "chat open (phone)");
  await pub.keyboard.press("Escape");
  await sleep(300);
  check(
    "Escape closes the chat and focus returns to the button",
    await pub.evaluate(
      (sel) =>
        !document.querySelector("dialog[open]") &&
        document.activeElement === document.querySelector(sel),
      LAUNCHER,
    ),
  );
  await pub.reload({ waitUntil: "load" });
  await sleep(800);
  L = await launcherInfo(pub);
  check(
    "after opening once: no badge, no bubble, no pulse",
    !L.badge && L.hint === null && !L.pulse,
  );
  check("no page errors", pub.errors.length === 0, pub.errors.join(" | "));

  const fresh = await newPage();
  await go(fresh, "/search");
  check("first-time visitor elsewhere sees the bubble", (await launcherInfo(fresh)).hint !== null);
  await openChat(fresh);
  await fresh.keyboard.press("Escape");
  await go(fresh, "/categories");
  check(
    "bubble collapses after the chat was opened once",
    (await launcherInfo(fresh)).hint === null,
  );

  const calm = await newPage({ reducedMotion: true });
  await go(calm, "/");
  L = await launcherInfo(calm);
  check(
    "reduced motion: no pulse animation",
    L.pulseAnim === "none" && L.hint !== null,
    L.pulseAnim,
  );

  const adminPagePublic = await newPage();
  await go(adminPagePublic, "/help");
  check("button on content pages (/help)", Boolean(await launcherInfo(adminPagePublic)));

  // -------------------------------------------------------------------------------------------
  console.log("\nBusiness page: never covers the sticky contact bar");
  const biz = await newPage();
  await go(biz, `/business/e2e-chat-${run}-plumb1`);
  const bar = await biz.evaluate(() => {
    const el = document.querySelector("[data-contact-bar]");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const covered = [...el.querySelectorAll("a, button")].filter((b) => {
      const br = b.getBoundingClientRect();
      const top = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
      return !(top === b || b.contains(top));
    }).length;
    return { top: r.top, covered };
  });
  L = await launcherInfo(biz);
  check(
    "phones: button sits above the contact bar",
    bar && L.bottom <= bar.top - 4,
    bar && `button bottom ${L.bottom}, bar top ${bar.top}`,
  );
  check("no contact bar button is covered", bar && bar.covered === 0);
  await biz.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(400);
  const footerCovered = await biz.evaluate(
    () =>
      [...document.querySelectorAll("footer a, footer button")].filter((b) => {
        const r = b.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) return false;
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return top && top.closest(".chat-launcher");
      }).length,
  );
  check(
    "bottom of the page: no footer link under the button",
    footerCovered === 0,
    String(footerCovered),
  );
  const desk = await newPage({ width: 1280, height: 800 });
  await go(desk, `/business/e2e-chat-${run}-plumb1`);
  L = await launcherInfo(desk);
  check(
    "desktop: bottom-right corner",
    Math.round(1280 - L.right) === 16 && Math.round(800 - L.bottom) === 20,
    `${1280 - L.right} / ${800 - L.bottom}`,
  );
  await openChat(desk);
  panel = await desk.evaluate(() =>
    document.querySelector("dialog[open]").getBoundingClientRect().toJSON(),
  );
  check(
    "desktop: chat opens as a panel above the button",
    panel.width === 384 && panel.right <= 1280 - 16 && panel.bottom <= L.top,
    `${panel.width}x${panel.height}`,
  );
  await axe(desk, "chat open (desktop)");

  // -------------------------------------------------------------------------------------------
  console.log("\nQuick questions and live facts");
  const before = await snapshotFaqs();
  const qq = await newPage();
  const hosts = new Set();
  qq.on("request", (r) => hosts.add(new URL(r.url()).host));
  await go(qq, "/");
  await openChat(qq);
  const feeText = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(settings.listing_fee_naira);
  const secrets = [
    settings.bank_account_number,
    settings.bank_account_name,
    settings.bank_name,
  ].filter((s) => s && s.length >= 4);
  let t;
  if (feeOn) {
    t = await clickInChat(qq, "How much is the listing fee?");
    check(
      "listing fee answer uses the live setting",
      t.includes("How much is the listing fee") && t.includes(feeText),
      "fee on",
    );
    const transferOn =
      settings.manual_transfer_enabled &&
      settings.bank_name &&
      settings.bank_account_name &&
      /^\d{10}$/.test(settings.bank_account_number ?? "");
    check(
      "payment methods come from settings",
      transferOn
        ? t.includes("bank transfer")
        : t.includes("payment options shown on the payment page"),
    );
    check(
      "never shows bank account details in chat",
      secrets.every((s) => !t.includes(s)) && t.includes("payment page"),
    );
  } else {
    t = await ask(qq, "How much is the listing fee?");
    check(
      "fee off: cost question answered only with 'free to list'",
      t.replace(/^HowFar Assistant:\s*/, "").trim() === FREE_TEXT &&
        (await lastBotLinks(qq)).some((l) => l.href === "/business/new"),
      t.slice(0, 120),
    );
    check(
      "never shows bank account details in chat",
      secrets.every((s) => !t.includes(s)),
    );
  }
  t = await clickInChat(qq, "Which states are you in?");
  check(
    "live states come from the database",
    liveStates.every((s) => t.includes(s)),
    `${liveStates.length} live`,
  );
  const statesHelpful = before["which-states"].helpful_count;
  await qq.evaluate(() =>
    [
      ...[...document.querySelectorAll('dialog[open] [data-from="bot"]')]
        .at(-1)
        .querySelectorAll("button"),
    ]
      .find((b) => b.innerText.trim() === "Yes")
      .click(),
  );
  await sleep(1200);
  const afterVote = await one(
    "select helpful_count, times_shown from faq_entries where slug = 'which-states'",
  );
  check(
    '"Did this help? Yes" is counted',
    afterVote.helpful_count === statesHelpful + 1 &&
      (await lastBot(qq)).includes("Thanks for letting us know"),
  );
  check("times shown counted", afterVote.times_shown === before["which-states"].times_shown + 1);
  const related = await qq.evaluate(() =>
    [
      ...[...document.querySelectorAll('dialog[open] [data-from="bot"]')]
        .at(-1)
        .querySelectorAll("button"),
    ]
      .filter((b) => b.closest("div.mt-3"))
      .map((b) => b.innerText.trim()),
  );
  check(
    "up to 2 related questions",
    related.length >= 1 && related.length <= 2,
    related.join(" | "),
  );
  t = await clickInChat(qq, related[0]);
  check("related question opens its answer", t.includes(related[0]));
  t = await clickInChat(qq, "What does 'ID submitted' mean?");
  check("ID submitted answer", t.includes("not") && t.includes("official government verification"));
  t = await clickInChat(qq, "How do I stay safe?");
  check("safety answer", t.includes("Never pay the full price upfront"));
  t = await clickInChat(qq, "Find a business");
  check(
    "'Find a business' asks what and where",
    t.includes("What service do you need, and where?"),
  );
  t = await clickInChat(qq, "How do I list my business?");
  check(
    "list your business answer links to the form",
    (await lastBotLinks(qq)).some((l) => l.href === "/business/new"),
  );
  await axe(qq, "chat with answers");

  // -------------------------------------------------------------------------------------------
  console.log("\nTypos and Pidgin");
  const pid = await newPage();
  await go(pid, "/help");
  await openChat(pid);
  t = await ask(pid, "how i go take list my shop");
  check(
    "'how i go take list my shop' -> How do I list my business?",
    t.includes("How do I list my business?"),
  );
  t = await ask(pid, "how much is the lisitng fee");
  check(
    "typo 'lisitng' -> fee answer for the current setting",
    feeOn ? t.includes("How much is the listing fee") : t.includes(FREE_TEXT),
  );
  t = await ask(pid, "wetin be id submitted");
  check("'wetin be id submitted' -> ID submitted", t.includes('What does "ID submitted" mean?'));
  t = await ask(pid, "abeg una dey abuja?");
  check(
    "'abeg una dey abuja?' -> not live there yet + waitlist",
    t.includes("not in FCT (Abuja) yet") &&
      (await lastBotLinks(pid)).some((l) => l.href === "/coming-soon#waitlist"),
  );
  t = await ask(pid, "How far!");
  check("'How far!' -> friendly greeting", t.includes("I dey o"));
  t = await ask(pid, "i forgot my pasword");
  check("typo 'pasword' -> forgot password", t.includes("I forgot my password"));

  // -------------------------------------------------------------------------------------------
  console.log("\nBusiness search in chat");
  const bs = await newPage();
  bs.on("request", (r) => hosts.add(new URL(r.url()).host));
  await go(bs, "/");
  await openChat(bs);
  t = await ask(bs, "I need a plumber in Lekki");
  let cards = await bs.evaluate(() =>
    [
      ...[...document.querySelectorAll('dialog[open] [data-from="bot"]')]
        .at(-1)
        .querySelectorAll('a[href^="/business/"]'),
    ].map((a) => ({ href: a.getAttribute("href"), text: a.innerText })),
  );
  let links = await lastBotLinks(bs);
  const total = Number(t.match(/I found (\d+) businesses in Plumbers in Lekki/)?.[1] ?? 0);
  check(
    "'I need a plumber in Lekki' -> plumbers in Lekki (category + area)",
    total >= 4,
    t.split("\n")[0],
  );
  check(
    "shows up to 3 approved business cards",
    cards.length === 3 && cards.every((c) => c.text.includes("Plumbers")),
    String(cards.length),
  );
  check("never shows unapproved businesses", !t.includes(`E2E Other Secret ${run}`));
  const seeAll = links.find((l) => l.text.startsWith("See all"));
  check(
    '"See all results" links to /search with the right filters',
    seeAll?.href === "/search?category=plumbers&state=lagos&lga=eti-osa",
    seeAll?.href,
  );
  t = await ask(bs, "who fit fix my AC");
  check("'who fit fix my AC' -> AC & Fridge Repair", t.includes("AC & Fridge Repair"));
  t = await ask(bs, "abeg I need vulcanizer for Ikeja");
  check(
    "'vulcanizer for Ikeja' -> Mechanics in Ikeja",
    t.includes("Mechanics") && t.includes("Ikeja"),
  );
  t = await ask(bs, "fashion designer in yaba");
  check("'fashion designer in yaba' -> Fashion & Tailoring", t.includes("Fashion & Tailoring"));
  t = await ask(bs, "makeup artist in Kano");
  links = await lastBotLinks(bs);
  check(
    "inactive state: 'we're not there yet' + waitlist",
    t.includes("We're not in **Kano**".replace(/\*/g, "")) &&
      links.some((l) => l.href === "/coming-soon#waitlist" && l.text.includes("Kano")),
  );
  await axe(bs, "chat with business cards");
  await ask(bs, "I need a plumber in Lekki");
  await bs.evaluate(() =>
    [
      ...[...document.querySelectorAll('dialog[open] [data-from="bot"]')]
        .at(-1)
        .querySelectorAll("a"),
    ]
      .find((a) => a.innerText.startsWith("See all"))
      .click(),
  );
  await bs
    .waitForFunction(() => location.pathname === "/search", { timeout: 15000 })
    .catch(() => {});
  await sleep(1200);
  check(
    "'See all' opens the search page and closes the chat",
    (await bs.evaluate(() => location.search)) === "?category=plumbers&state=lagos&lga=eti-osa" &&
      !(await bs.$("dialog[open]")),
  );
  check(
    "search page lists the plumbers",
    (await bs.evaluate(() => document.querySelector("main").innerText)).includes(
      `E2E Plumb 1 ${run}`,
    ),
  );
  const foreign = [...hosts].filter(
    (h) => h !== new URL(baseUrl).host && h !== "res.cloudinary.com",
  );
  check(
    "chat content never goes to third parties (only our server)",
    foreign.length === 0,
    foreign.join(", "),
  );

  // -------------------------------------------------------------------------------------------
  console.log("\nFallback, anonymous storage, escaping and limits");
  const fb = await newPage();
  const actionCalls = [];
  fb.on("request", (r) => {
    if (
      r.method() === "POST" &&
      r.headers()["next-action"] &&
      (r.postData() ?? "").includes('"text"')
    )
      actionCalls.push({ url: r.url(), headers: r.headers() });
  });
  await go(fb, "/");
  await openChat(fb);
  t = await ask(
    fb,
    `do you sell cars at night ${MARK}a my name is Tunde Bakare, call 08031234567 or tunde.b@example.com`,
  );
  links = await lastBotLinks(fb);
  check("honest fallback when unsure", t.includes("I'm not sure about that yet"));
  check(
    "offers the Contact page and Help Centre",
    links.some((l) => l.href === "/contact") && links.some((l) => l.href === "/help"),
  );
  let rows = await q("select text, asked_on from unanswered_questions where text like $1", [
    `%${MARK}a%`,
  ]);
  check("unanswered question recorded for the admin", rows.length === 1);
  const stored = rows[0]?.text ?? "";
  check(
    "stored without name, phone number or email",
    !/Tunde|Bakare|08031234567|tunde\.b|example\.com/i.test(stored) &&
      stored.includes("[name]") &&
      stored.includes("[number]") &&
      stored.includes("[email]"),
  );
  const cols = (
    await q(
      "select column_name, data_type from information_schema.columns where table_name = 'unanswered_questions' order by column_name",
    )
  ).map((c) => `${c.column_name}:${c.data_type}`);
  check(
    "no identity attached (only id, text and the day)",
    cols.join(",") === "asked_on:date,id:uuid,text:character varying",
    cols.join(","),
  );
  await ask(fb, `Do you sell cars at night? ${MARK}a`);
  t = await ask(fb, `how do I list my business ${MARK}c`);
  check(
    "answered questions are not stored",
    t.includes("How do I list my business?") &&
      (await q("select 1 from unanswered_questions where text like $1", [`%${MARK}c%`])).length ===
        0,
  );
  await ask(
    fb,
    `<img src=x onerror="window.__xss=1"> [click](javascript:window.__xss=2) <script>window.__xss=3</script> ${MARK}d`,
  );
  const xss = await fb.evaluate(() => ({
    flag: window.__xss,
    img: Boolean(document.querySelector('dialog img[src="x"]')),
    js: Boolean(document.querySelector('dialog a[href^="javascript"]')),
    shown: [...document.querySelectorAll('dialog [data-from="user"]')].at(-1).innerText,
  }));
  check(
    "all output escaped (no HTML or script runs)",
    xss.flag === undefined && !xss.img && !xss.js && xss.shown.includes("<img src=x"),
  );
  check(
    "message length capped in the input (300)",
    (await fb.$eval("dialog[open] input", (e) => e.maxLength)) === 300,
  );
  const call = actionCalls[0];
  const long = await fb.evaluate(
    async ({ url, action, ct, text }) =>
      (
        await fetch(url, {
          method: "POST",
          headers: { "next-action": action, "content-type": ct, accept: "text/x-component" },
          body: JSON.stringify([{ text }]),
        })
      ).text(),
    {
      url: call.url,
      action: call.headers["next-action"],
      ct: call.headers["content-type"],
      text: "a".repeat(400),
    },
  );
  check("message length capped on the server", long.includes("up to 300 characters"));
  check(
    "no conversation stored (only the anonymous unanswered questions)",
    (
      await q("select count(*)::int n from unanswered_questions where text like $1", [`%${MARK}%`])
    )[0].n === 3,
  );
  await axe(fb, "chat fallback");

  const cust = await newPage();
  check("customer logs in", await login(cust, users.customer, "/account"));
  await openChat(cust);
  const custChips = await cust.evaluate(() =>
    [...document.querySelectorAll('dialog[open] [aria-label="Quick questions"] button')].map((b) =>
      b.innerText.trim(),
    ),
  );
  check(
    "no 'My listing status' chip for customers without businesses",
    !custChips.includes("My listing status"),
  );
  await ask(cust, `Chi wants to know about moon landings ${MARK}b`);
  rows = await q("select text from unanswered_questions where text like $1", [`%${MARK}b%`]);
  check(
    "the signed-in person's own name is removed too",
    rows.length === 1 && !/\bChi\b/.test(rows[0].text),
    rows[0]?.text.replace(MARK, "<mark>"),
  );
  t = await ask(cust, "my listing status");
  check(
    "customer: 'my listing status' -> no businesses yet",
    t.includes("You haven't listed a business yet") &&
      (await lastBotLinks(cust)).some((l) => l.href === "/business/new"),
  );
  t = await ask(pid, "my listing status");
  check(
    "logged out: asked to log in",
    t.includes("Log in to see the status") &&
      (await lastBotLinks(pid)).some((l) => l.href.startsWith("/login")),
  );

  // -------------------------------------------------------------------------------------------
  console.log("\nMy listing status (owner)");
  const own = await newPage();
  check("owner logs in", await login(own, users.owner, "/dashboard"));
  await openChat(own);
  await own
    .waitForFunction(
      () =>
        [...document.querySelectorAll('dialog[open] [aria-label="Quick questions"] button')].some(
          (b) => b.innerText.trim() === "My listing status",
        ),
      { timeout: 10000 },
    )
    .catch(() => {});
  t = await clickInChat(own, "My listing status");
  links = await lastBotLinks(own);
  check(
    "shows each of the owner's businesses",
    t.includes(`E2E Mine Rejected ${run}`) && t.includes(`E2E Mine Paying ${run}`),
  );
  check(
    "status, payment status and ID check status",
    t.includes("Changes requested") &&
      t.includes("Awaiting payment") &&
      t.includes("Awaiting confirmation") &&
      t.includes("Under review"),
  );
  check(
    "next step with a link (Fix and resubmit)",
    links.some(
      (l) =>
        l.text.startsWith("Fix and resubmit") && l.href === `/business/${ids.Rejected}/edit?step=1`,
    ) && t.includes("Please add clearer photos"),
  );
  check("only the user's own data", !t.includes("E2E Plumb") && !t.includes("E2E Other Secret"));
  t = await ask(own, "has my listing been approved?");
  check("typed status question works too", t.includes(`E2E Mine Paying ${run}`));
  await axe(own, "chat listing status");

  // -------------------------------------------------------------------------------------------
  console.log("\nRate limits");
  const rl = await newPage();
  await go(rl, "/");
  await openChat(rl);
  let limited = false;
  for (let i = 0; i < 16 && !limited; i++) {
    t = await ask(rl, "hi");
    if (t.includes("Too many attempts")) limited = i === 15;
  }
  check("chat messages are rate-limited (16th within a minute refused)", limited);

  // -------------------------------------------------------------------------------------------
  console.log("\nAdmin: help assistant");
  const ad = await newPage({ width: 1280, height: 900 });
  check("admin logs in", await login(ad, users.admin, "/admin"));
  check("launcher hidden on admin pages", !(await launcherInfo(ad)));
  await go(ad, "/admin/help-assistant");
  let main = await ad.evaluate(() => document.querySelector("main").innerText);
  check(
    "unanswered questions grouped by similarity with counts",
    main.includes("Asked 2 times") && main.includes(`${MARK}a`),
  );
  check("'Did this help?' stats per entry", /shown \d+×/.test(main) && main.includes("% helpful"));
  await axe(ad, "admin help assistant");
  await ad.evaluate((m) => {
    const li = [...document.querySelectorAll("main li")].find(
      (x) => x.innerText.includes(`${m}a`) && x.innerText.includes("Asked 2 times"),
    );
    [...li.querySelectorAll("a")]
      .find((a) => a.innerText.startsWith("Add as a help answer"))
      .click();
  }, MARK);
  await ad.waitForFunction(() => location.pathname === "/admin/help-assistant/new", {
    timeout: 15000,
  });
  await sleep(1200);
  const prefilled = await ad.evaluate(() => document.querySelector("main input").value);
  check("one click turns it into a new FAQ (question pre-filled)", prefilled.includes(`${MARK}a`));
  const setVal = (sel, v) =>
    ad.$eval(
      sel,
      (e, val) => {
        const proto =
          e instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : e instanceof HTMLSelectElement
              ? HTMLSelectElement.prototype
              : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(e, val);
        e.dispatchEvent(
          new Event(e instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
        );
      },
      v,
    );
  await setVal("main form input", `Do you sell cars ${MARK}?`);
  await setVal("main form select", "ACCOUNT");
  await setVal(
    "main form textarea",
    `No. CustomerHowFar is a directory of businesses in **{{live_states}}**. Marker ${MARK}.`,
  );
  await sleep(300);
  const preview = await ad.evaluate(() => document.querySelector("main section").innerText);
  check(
    "preview shows the answer with live facts filled in",
    preview.includes(`Do you sell cars ${MARK}?`) &&
      liveStates.every((s) => preview.includes(s)) &&
      !preview.includes("{{"),
  );
  await axe(ad, "admin add help answer");
  await ad.evaluate(() =>
    [...document.querySelectorAll("main form button[type=submit]")][0].click(),
  );
  await ad
    .waitForFunction(() => location.pathname === "/admin/help-assistant", { timeout: 20000 })
    .catch(() => {});
  await sleep(1200);
  main = await ad.evaluate(() => document.querySelector("main").innerText);
  const entry = await one("select id, slug, sort_order from faq_entries where question like $1", [
    `%${MARK}%`,
  ]);
  check("saved and confirmed", Boolean(entry) && main.includes("Question added"));
  check(
    "the grouped unanswered questions are cleared",
    (await q("select 1 from unanswered_questions where text like $1", [`%${MARK}a%`])).length === 0,
  );
  const helpPage = await newPage();
  await go(helpPage, "/help");
  let help = await helpPage.evaluate(
    (slug) => ({
      text: document.querySelector("main").innerText,
      anchor: Boolean(document.getElementById(slug)),
    }),
    entry.slug,
  );
  check(
    "admin edits refresh /help immediately",
    help.text.includes(`Do you sell cars ${MARK}?`) && help.anchor,
  );
  t = await ask(pid, `do you sell cars ${MARK}`);
  check(
    "the chat now answers it",
    t.includes(`Do you sell cars ${MARK}?`) && liveStates.every((s) => t.includes(s)),
  );

  await go(ad, `/admin/help-assistant/${entry.id}`);
  await axe(ad, "admin edit help answer");
  await setVal("main form textarea", `No, we don't sell anything. UPDATED${run} ${MARK}.`);
  await ad.evaluate(() =>
    [...document.querySelectorAll("main form button[type=submit]")][0].click(),
  );
  await ad
    .waitForFunction(() => location.pathname === "/admin/help-assistant", { timeout: 20000 })
    .catch(() => {});
  await go(helpPage, "/help");
  // Answers sit in closed <details>, so read textContent (innerText skips hidden text).
  help = await helpPage.evaluate(() => document.querySelector("main").textContent);
  check("edit shows on /help immediately", help.includes(`UPDATED${run}`));

  await go(ad, "/admin/help-assistant");
  await ad.evaluate((m) => {
    const li = [...document.querySelectorAll("main ol > li")].find((x) => x.innerText.includes(m));
    [...li.querySelectorAll("button")].find((b) => b.innerText.includes("Move up")).click();
  }, MARK);
  await sleep(2000);
  const moved = await one("select sort_order from faq_entries where id = $1", [entry.id]);
  const order = (
    await q("select id from faq_entries where category = 'ACCOUNT' order by sort_order, question")
  ).map((r) => r.id);
  check(
    "reorder: moved up one place",
    order.indexOf(entry.id) === order.length - 2 && moved.sort_order !== entry.sort_order,
    `${order.indexOf(entry.id)} of ${order.length}`,
  );
  await go(helpPage, "/help");
  const helpOrder = await helpPage.evaluate(() =>
    [...document.querySelectorAll("#your-account + div details")].map((d) => d.id),
  );
  check("/help shows the new order", helpOrder.at(-2) === entry.slug, helpOrder.join(","));

  await ad.evaluate((m) => {
    const li = [...document.querySelectorAll("main ol > li")].find((x) => x.innerText.includes(m));
    [...li.querySelectorAll("button")].find((b) => b.innerText.startsWith("Hide")).click();
  }, MARK);
  await sleep(2000);
  await go(helpPage, "/help");
  help = await helpPage.evaluate(() => document.querySelector("main").innerText);
  check("deactivate: hidden from /help", !help.includes(MARK));
  t = await ask(pid, `do you sell cars ${MARK}`);
  check("deactivate: no longer answered in the chat", !t.includes(`Do you sell cars ${MARK}?`));

  await go(ad, "/admin/help-assistant");
  await ad.evaluate((m) => {
    const li = [...document.querySelectorAll("main li")].find(
      (x) => x.innerText.includes(`${m}d`) && x.querySelector("button"),
    );
    [...li.querySelectorAll("button")].find((b) => b.innerText.startsWith("Dismiss")).click();
  }, MARK);
  await sleep(2000);
  check(
    "dismiss removes an unanswered group",
    (await q("select 1 from unanswered_questions where text like $1", [`%${MARK}d%`])).length === 0,
  );
  const cust404 = await cust.goto(baseUrl + "/admin/help-assistant");
  check("non-admins get 404", cust404.status() === 404);

  // -------------------------------------------------------------------------------------------
  console.log("\n/help reads from the database");
  const anchor = feeOn ? "listing-fee" : "free-to-list";
  await go(helpPage, `/help#${anchor}`);
  const helpInfo = await helpPage.evaluate(
    (a) => ({
      count: document.querySelectorAll("main details").length,
      open: document.getElementById(a)?.open,
      text: document.querySelector("main").innerText,
    }),
    anchor,
  );
  const activeCount = (
    await one(
      "select count(*)::int n from faq_entries where is_active and visibility in ('ALWAYS', $1::faq_visibility)",
      [feeOn ? "FEE_ON" : "FEE_OFF"],
    )
  ).n;
  check(
    "every visible entry is on /help",
    helpInfo.count === activeCount,
    `${helpInfo.count} / ${activeCount}`,
  );
  check(
    `/help#${anchor} opens the answer for the current fee setting`,
    helpInfo.open === true &&
      (feeOn ? helpInfo.text.includes(feeText) : helpInfo.text.includes("free")),
  );
  await axe(helpPage, "/help");
  if (shotsDir) await helpPage.screenshot({ path: path.join(shotsDir, "assistant-help.png") });
} catch (e) {
  failures++;
  console.log("  ERROR", e.message);
} finally {
  console.log("\nCleanup");
  for (const c of counters)
    await q(
      "update faq_entries set times_shown = $2, helpful_count = $3, not_helpful_count = $4 where id = $1",
      [c.id, c.times_shown, c.helpful_count, c.not_helpful_count],
    );
  await q("delete from faq_entries where question like $1 or answer like $1", [`%${MARK}%`]);
  await q("delete from unanswered_questions where text like $1", [`%${MARK}%`]);
  // Unanswered "hi"-style rows can't come from this run (small talk is never stored), but the
  // rate-limit test and fallbacks above only ever used marked text.
  const idList = Object.values(users)
    .map((u) => u.id)
    .filter(Boolean);
  await q("delete from rate_limit_hits where created_at >= $1", [testStart]);
  await q("delete from identity_verifications where user_id = any($1::uuid[])", [idList]);
  await q("delete from payments where user_id = any($1::uuid[])", [idList]);
  await q("delete from businesses where owner_id = any($1::uuid[])", [idList]);
  await q("delete from profiles where id = any($1::uuid[])", [idList]);
  for (const u of Object.values(users))
    if (u.id) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  const leftover = await one(
    "select (select count(*) from faq_entries where question like $1)::int f, (select count(*) from unanswered_questions where text like $1)::int u, (select count(*) from businesses where slug like $2)::int b",
    [`%${MARK}%`, `e2e-chat-${run}-%`],
  );
  console.log("  leftovers:", JSON.stringify(leftover));
  await browser.close();
  await db.end();
  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
