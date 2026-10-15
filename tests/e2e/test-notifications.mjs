// In-app notifications and Web Push, end to end. Real DB/Supabase; emails go to the test outbox
// only; push goes through the real browser push service to headless Edge. Creates its own users
// and businesses and deletes everything afterwards (including admin alerts the test events
// created for other admins). Usage: node test-notifications.mjs <projectDir> <baseUrl> <outboxFile> <shotsDir>
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
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
  owner: mk("owner", "Ola Owner", "BUSINESS_OWNER"),
  customer: mk("customer", "Chi Customer", "CUSTOMER"),
  admin: mk("admin", "Ade Admin", "ADMIN"),
};
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const origin = new URL(baseUrl).origin;

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
const mails = (tag, to) => outbox().filter((m) => m.tag === tag && (!to || m.to.email === to));

/** Runs the app's real notification functions in-process (tsx), with emails to the outbox. */
function trigger(calls) {
  const file = path.join(path.dirname(outboxFile), `trigger-${run}.json`);
  fs.writeFileSync(file, JSON.stringify(calls));
  try {
    const out = execFileSync(
      "npx",
      [
        "tsx",
        "--conditions=react-server",
        fileURLToPath(new URL("./notify-trigger.ts", import.meta.url)),
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
const notes = (userId, type) =>
  q(
    "select id, type, title, body, link, read_at from notifications where user_id = $1 and ($2::text is null or type = $2) order by created_at desc",
    [userId, type ?? null],
  );

const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true });
let ipN = 20;
// Push needs a normal (non-incognito) profile: those pages get their own browser and profile.
const extraBrowsers = [];
async function newPage({ width = 360, ua = ANDROID_UA, grant = false, persistent = false } = {}) {
  let ctx;
  if (persistent) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chf-push-"));
    const b = await puppeteer.launch({
      executablePath: browserPath(),
      headless: true,
      userDataDir: dir,
    });
    extraBrowsers.push({ b, dir });
    ctx = b.defaultBrowserContext();
  } else {
    ctx = await browser.createBrowserContext();
  }
  if (grant) await ctx.overridePermissions(origin, ["notifications"]);
  const page = await ctx.newPage();
  await page.setUserAgent(ua);
  if (width < 768) await page.setViewport({ width, height: 800, isMobile: true, hasTouch: true });
  else await page.setViewport({ width, height: 900 });
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.66.${ipN++}.5` });
  // Count permission requests (must never happen on page load).
  await page.evaluateOnNewDocument(() => {
    window.__permissionAsks = 0;
    if ("Notification" in window) {
      const original = Notification.requestPermission.bind(Notification);
      Notification.requestPermission = (...a) => {
        window.__permissionAsks++;
        return original(...a);
      };
    }
  });
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
const clickText = (page, label, scope = "main") =>
  page.evaluate(
    (l, s) => {
      const b = [...document.querySelectorAll(`${s} button, ${s} a`)].find(
        (x) =>
          !x.disabled &&
          x.innerText.trim().startsWith(l) &&
          (x.offsetParent !== null || x.closest("dialog[open]")),
      );
      if (!b) return false;
      b.click();
      return true;
    },
    label,
    scope,
  );
// Bell: the visible one (desktop or phone).
const bell = (page) =>
  page.evaluate(() => {
    const b = [...document.querySelectorAll("header button[aria-controls]")].find(
      (x) =>
        x.offsetParent !== null && /Notifications/.test(x.innerText + x.getAttribute("aria-label")),
    );
    if (!b) return null;
    const badge = b.querySelector("span[aria-hidden=true]");
    return { label: b.innerText.trim(), badge: badge ? badge.textContent.trim() : null };
  });
const shownPush = (page) =>
  page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg) return [];
    return (await reg.getNotifications()).map((n) => ({
      title: n.title,
      body: n.body,
      url: n.data?.url,
    }));
  });
async function waitPush(page, title, timeout = 25000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const list = await shownPush(page);
    const hit = list.find((n) => n.title === title);
    if (hit) return hit;
    await sleep(1000);
  }
  return null;
}
const clearPush = (page) =>
  page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration("/");
    for (const n of (await reg?.getNotifications()) ?? []) n.close();
  });

const realAdmins = (
  await q("select id from profiles where role = 'ADMIN' and status = 'ACTIVE'")
).map((r) => r.id);
const ids = {};
// Development keeps push switched off (PUSH_NOTIFICATIONS=off): then this suite checks that nothing
// can be pushed. With push on, it checks real delivery to headless browsers.
const PUSH_ON = process.env.PUSH_NOTIFICATIONS !== "off";
try {
  console.log(`Setup (push ${PUSH_ON ? "ON" : "OFF"})`);
  if (PUSH_ON)
    check(
      "VAPID keys configured (values not printed)",
      Boolean(
        process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT,
      ),
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
  const biz = async (key, status) => {
    const id = crypto.randomUUID();
    ids[key] = id;
    await q(
      `insert into businesses (id, owner_id, name, slug, category_id, phone, whatsapp_number, address, state_id, lga_id, description, status, logo_public_id, submitted_at, published_at, updated_at)
             values ($1,$2,$3,$4,$5,'+2348036660000','+2348036660000','1 Test Street',$6,$7,'A complete description of more than thirty characters for testing.',$8,'customerhowfar/users/test/none', now(), $9, now())`,
      [
        id,
        users.owner.id,
        `E2E Notify ${key} ${run}`,
        `e2e-nt-${run}-${key.toLowerCase()}`,
        cat,
        lagos,
        ikeja,
        status,
        status === "APPROVED" ? new Date() : null,
      ],
    );
  };
  await biz("Review", "PENDING_REVIEW");
  await biz("Live", "APPROVED");
  ids.idOk = crypto.randomUUID();
  ids.idNo = crypto.randomUUID();
  await q(
    "insert into identity_verifications (id, user_id, id_type, full_name_on_id, consent_given_at, status, reviewed_at, submitted_at, updated_at) values ($1, $2, 'NIN_SLIP', 'Ola Owner', now(), 'APPROVED', now(), now(), now())",
    [ids.idOk, users.owner.id],
  );
  await q(
    "insert into identity_verifications (id, user_id, id_type, full_name_on_id, consent_given_at, status, rejection_reason, reviewed_at, submitted_at, updated_at) values ($1, $2, 'VOTERS_CARD', 'Ola Owner', now(), 'REJECTED', 'The photo of the ID card is blurry.', now(), now() - interval '1 day', now())",
    [ids.idNo, users.owner.id],
  );
  if (fs.existsSync(outboxFile)) fs.unlinkSync(outboxFile);

  // -------------------------------------------------------------------------------------------
  console.log(
    PUSH_ON
      ? "\nPush: turn on in settings (desktop Chrome/Edge and Android emulation)"
      : "\nPush switched off (PUSH_NOTIFICATIONS=off): nothing can be turned on or pushed",
  );
  const desk = await newPage({
    width: 1280,
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
    grant: true,
    persistent: true,
  });
  check("owner logs in (desktop)", await login(desk, users.owner, "/account/notifications"));
  check(
    "no permission request on page load",
    (await desk.evaluate(() => window.__permissionAsks)) === 0,
  );
  await desk
    .waitForFunction(
      () =>
        /Push notifications are (off|on) for this device/.test(
          document.querySelector("main").innerText,
        ),
      { timeout: 15000 },
    )
    .catch(() => {});
  await axe(desk, "notification settings (desktop)");
  await clickText(desk, "Turn on");
  const andr = await newPage({ grant: true, persistent: true });
  if (PUSH_ON) {
    await desk
      .waitForFunction(
        () =>
          document
            .querySelector("main")
            .innerText.includes("Push notifications are on for this device"),
        { timeout: 30000 },
      )
      .catch(() => {});
    let subs = await q("select id, label, endpoint from push_subscriptions where user_id = $1", [
      users.owner.id,
    ]);
    check(
      "desktop subscribed and saved (with a device label)",
      subs.length === 1 && /on Windows$/.test(subs[0].label),
      subs.map((s) => s.label).join(", "),
    );
    check(
      "only allow-listed push service endpoints",
      subs.every((s) => /notify\.windows\.com|fcm\.googleapis\.com/.test(new URL(s.endpoint).host)),
    );
    check(
      "owner logs in (Android emulation, 360px)",
      await login(andr, users.owner, "/account/notifications"),
    );
    await andr
      .waitForFunction(
        () => /Push notifications are (off|on)/.test(document.querySelector("main").innerText),
        { timeout: 15000 },
      )
      .catch(() => {});
    await clickText(andr, "Turn on");
    await andr
      .waitForFunction(
        () =>
          document
            .querySelector("main")
            .innerText.includes("Push notifications are on for this device"),
        { timeout: 30000 },
      )
      .catch(() => {});
    subs = await q(
      "select id, label from push_subscriptions where user_id = $1 order by created_at",
      [users.owner.id],
    );
    check(
      "Android device subscribed too ('Chrome on Android')",
      subs.length === 2 && subs.some((s) => s.label === "Chrome on Android"),
      subs.map((s) => s.label).join(", "),
    );
    await go(andr, "/account/notifications");
    const devicesText = await andr.evaluate(() => document.querySelector("main").innerText);
    check(
      "devices list shows both devices",
      devicesText.includes("Chrome on Android") && devicesText.includes("Edge on Windows"),
      devicesText.replace(/s+/g, " ").slice(-200),
    );
  } else {
    await sleep(3000);
    check(
      "push off: 'Turn on' never asks the browser and saves no device",
      (await desk.evaluate(() => window.__permissionAsks)) === 0 &&
        (await q("select 1 from push_subscriptions where user_id = $1", [users.owner.id]))
          .length === 0,
    );
    check(
      "owner logs in (Android emulation, 360px)",
      await login(andr, users.owner, "/account/notifications"),
    );
    await andr
      .waitForFunction(
        () => /Push notifications are (off|on)/.test(document.querySelector("main").innerText),
        { timeout: 15000 },
      )
      .catch(() => {});
    await clickText(andr, "Turn on");
    await sleep(3000);
    check(
      "push off: no device saved from Android either",
      (await q("select 1 from push_subscriptions")).length === 0,
    );
  }
  await axe(andr, "notification settings (360px)");
  const swSource = await (await fetch(`${baseUrl}/push-sw.js`)).text();
  check(
    "push worker has no fetch handler (no page caching, no offline mode)",
    !/addEventListener\(\s*["']fetch/.test(swSource) &&
      swSource.includes('"push"') &&
      swSource.includes('"notificationclick"'),
  );
  check(
    "push worker served with no-cache",
    /no-cache/.test((await fetch(`${baseUrl}/push-sw.js`)).headers.get("cache-control") ?? ""),
  );
  await go(desk, "/");
  await go(desk, "/search");
  const regAfterNav = await desk.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).map((r) => r.active?.scriptURL ?? ""),
  );
  if (PUSH_ON)
    check(
      "push worker survives navigation (old-worker clean-up leaves it alone)",
      regAfterNav.length === 1 && regAfterNav[0].endsWith("/push-sw.js"),
      regAfterNav.join(", "),
    );
  else
    check("push off: no push worker registered", regAfterNav.length === 0, regAfterNav.join(", "));
  check("no caches created", (await desk.evaluate(async () => (await caches.keys()).length)) === 0);
  const manifest = await (await fetch(`${baseUrl}/manifest.webmanifest`)).json();
  check("site still not installable (manifest display: browser)", manifest.display === "browser");
  const cdp = await desk.createCDPSession();
  const inst = await cdp
    .send("Page.getInstallabilityErrors")
    .catch(() => ({ installabilityErrors: [] }));
  check(
    "Chrome still reports NOT installable",
    (inst.installabilityErrors ?? []).length > 0,
    (inst.installabilityErrors ?? []).map((e) => e.errorId).join(", "),
  );

  // -------------------------------------------------------------------------------------------
  console.log("\nOwner events: in-app + email + push from the same action");
  const ad = await newPage({ width: 1280 });
  check("admin logs in", await login(ad, users.admin, "/admin"));
  await go(ad, `/admin/listings/${ids.Review}`);
  await clickText(ad, "Approve");
  await ad.waitForSelector("dialog[open]", { timeout: 10000 }).catch(() => {});
  await clickText(ad, "Approve and publish", "dialog");
  await ad
    .waitForFunction(
      () => document.querySelector("main").innerText.includes("Approved. The listing is live"),
      { timeout: 20000 },
    )
    .catch(() => {});
  await sleep(3000);
  let n = await notes(users.owner.id, "listing-approved");
  check(
    "approve (admin UI) -> owner in-app notification",
    n.length === 1 &&
      n[0].title === "Your listing is live" &&
      n[0].link === `/business/e2e-nt-${run}-review`,
  );
  check(
    "... and the email (test outbox)",
    mails("listing-approved", users.owner.email).length === 1,
  );
  let push = PUSH_ON ? await waitPush(desk, "Your listing is live") : null;
  // With push off, the same "open" link is what the in-app notification uses.
  const approvedPushUrl = PUSH_ON ? push?.url : `/notifications/open/${n[0]?.id}`;
  if (PUSH_ON) {
    check(
      "... and push delivered to the desktop",
      Boolean(push) && push.url === `/notifications/open/${n[0]?.id}`,
    );
    check("... and to the Android device", Boolean(await waitPush(andr, "Your listing is live")));
  } else {
    await sleep(3000);
    check(
      "push off: nothing pushed to either browser",
      (await shownPush(desk)).length === 0 && (await shownPush(andr)).length === 0,
    );
  }
  await go(desk, "/dashboard");
  let b = await bell(desk);
  check(
    "bell shows the unread count",
    b && b.badge === "1" && b.label.includes("1 unread"),
    JSON.stringify(b),
  );

  await clearPush(desk);
  trigger([
    { fn: "notifyChangesRequested", args: [ids.Live, "Please add clearer photos of your work."] },
    { fn: "notifyListingSuspended", args: [ids.Live, "Phone number not reachable."] },
    { fn: "notifyListingReinstated", args: [ids.Live] },
    { fn: "notifyIdentityReviewed", args: [ids.idOk] },
    { fn: "notifyIdentityReviewed", args: [ids.idNo] },
  ]);
  const expectOwner = [
    ["changes-requested", "Changes requested", "changes-requested"],
    ["listing-suspended", "Your listing has been suspended", "listing-suspended"],
    ["listing-reinstated", "Your listing is live again", "listing-reinstated"],
    ["identity-accepted", "ID check accepted", "identity-accepted"],
    ["identity-rejected", "Please submit your ID again", "identity-rejected"],
  ];
  for (const [type, title, tag] of expectOwner) {
    const rows = await notes(users.owner.id, type);
    check(
      `${type}: in-app + email`,
      rows.length === 1 && rows[0].title === title && mails(tag, users.owner.email).length === 1,
    );
  }
  if (PUSH_ON) {
    push = await waitPush(desk, "Changes requested");
    check(
      "push: changes requested, without the admin's comment",
      Boolean(push) &&
        !push.body.includes("clearer photos") &&
        push.body.includes("Tap to see what to fix"),
      push?.body,
    );
    const idPush = await waitPush(desk, "Please submit your ID again");
    check(
      "push: ID check result, without ID details",
      Boolean(idPush) && !/blurry|voter|NIN/i.test(idPush.body),
      idPush?.body,
    );
  }
  check(
    "in-app keeps the details for the owner",
    (await notes(users.owner.id, "changes-requested"))[0].body.includes("clearer photos"),
  );

  // Payments
  ids.pay = crypto.randomUUID();
  await q(
    "insert into payments (id, business_id, user_id, amount_kobo, provider, reference, status, proof_submitted_at, sender_name, sender_bank, amount_sent_kobo, updated_at) values ($1,$2,$3,500000,'MANUAL_TRANSFER',$4,'AWAITING_CONFIRMATION', now(), 'Ola Owner', 'Test Bank', 500000, now())",
    [ids.pay, ids.Live, users.owner.id, `CHF-N${run.toUpperCase()}`],
  );
  trigger([
    { fn: "notifyProofReceived", args: [ids.pay] },
    { fn: "notifyAdminOfTransferProof", args: [ids.pay] },
  ]);
  await q(
    "update payments set status = 'FAILED', rejection_reason = 'We have not received this transfer.' where id = $1",
    [ids.pay],
  );
  trigger([{ fn: "notifyProofRejected", args: [ids.pay] }]);
  await q(
    "update payments set status = 'SUCCESS', paid_at = now(), rejection_reason = null where id = $1",
    [ids.pay],
  );
  trigger([{ fn: "notifyPaymentReceipt", args: [ids.pay] }]);
  for (const [type, tag] of [
    ["proof-received", "proof-received"],
    ["proof-rejected", "proof-rejected"],
    ["payment-confirmed", "payment-receipt"],
  ]) {
    const rows = await notes(users.owner.id, type);
    check(
      `${type}: in-app + email`,
      rows.length === 1 && mails(tag, users.owner.email).length === 1,
    );
  }
  const payPushes = await shownPush(desk);
  const payText =
    JSON.stringify(
      await q("select title, body from notifications where user_id = $1 and category = 'PAYMENT'", [
        users.owner.id,
      ]),
    ) + JSON.stringify(payPushes);
  check(
    "payment notifications never include bank details or amounts sent",
    !/Test Bank|CHF-N|account number/i.test(payText),
  );

  // -------------------------------------------------------------------------------------------
  console.log("\nCustomer events");
  ids.review = crypto.randomUUID();
  await q(
    "insert into reviews (id, business_id, user_id, rating, comment, updated_at) values ($1,$2,$3,5,'Great work, very neat and on time.', now())",
    [ids.review, ids.Live, users.customer.id],
  );
  trigger([{ fn: "notifyNewReview", args: [ids.review] }]);
  n = await notes(users.owner.id, "new-review");
  check(
    "new review: owner in-app + email",
    n.length === 1 && mails("new-review", users.owner.email).length === 1,
  );
  if (PUSH_ON) {
    push = await waitPush(desk, "New 5-star review");
    check(
      "push for a new review doesn't name the reviewer",
      Boolean(push) && !push.body.includes("Chi"),
      push?.body,
    );
  }
  // Owner replies through the real UI.
  await go(desk, `/business/e2e-nt-${run}-live`);
  await clickText(desk, "Reply");
  await sleep(500);
  const replyBox = await desk
    .waitForSelector('main textarea[id$="-reply"]', { timeout: 10000 })
    .catch(() => null);
  if (replyBox) {
    await replyBox.evaluate((e) => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(
        e,
        "Thank you so much, it was a pleasure working with you!",
      );
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await sleep(300);
    await clickText(desk, "Save reply");
  }
  // Sent after the response (after()), so give it a moment.
  for (let i = 0; i < 20; i++) {
    n = await notes(users.customer.id, "owner-reply");
    if (n.length && mails("owner-reply", users.customer.email).length) break;
    await sleep(1000);
  }
  const replyMsg = await desk.evaluate(() =>
    [...document.querySelectorAll("main [role=alert], main [role=status]")]
      .map((e) => e.innerText.trim())
      .join(" | "),
  );
  check(
    "owner reply (UI) -> customer in-app + email",
    n.length === 1 &&
      n[0].title.includes("replied to your review") &&
      mails("owner-reply", users.customer.email).length === 1,
    `box=${Boolean(replyBox)} msg=${replyMsg.slice(0, 160)} notes=${n.length} mails=${mails("owner-reply", users.customer.email).length}`,
  );
  // Rating reminder: contacted 3 days ago, no review yet (for another approved business).
  ids.other = crypto.randomUUID();
  await q(
    `insert into businesses (id, owner_id, name, slug, category_id, phone, whatsapp_number, address, state_id, lga_id, description, status, submitted_at, published_at, updated_at)
           values ($1,$2,$3,$4,$5,'+2348036660000','+2348036660000','1 Test Street',$6,$7,'A complete description of more than thirty characters for testing.','APPROVED', now(), now(), now())`,
    [
      ids.other,
      users.owner.id,
      `E2E Notify Other ${run}`,
      `e2e-nt-${run}-other`,
      cat,
      lagos,
      ikeja,
    ],
  );
  await q(
    "insert into contact_events (business_id, type, user_id, created_at) values ($1, 'WHATSAPP', $2, now() - interval '3 days')",
    [ids.other, users.customer.id],
  );
  let sent = trigger([{ fn: "sendRatingReminders", args: [] }])[0];
  n = await notes(users.customer.id, "rating-reminder");
  check(
    "'Did you hire [Business]? Rate them' follow-up (daily job)",
    sent >= 1 &&
      n.length === 1 &&
      n[0].title === `Did you hire E2E Notify Other ${run}?` &&
      mails("rating-reminder", users.customer.email).length === 1,
  );
  sent = trigger([{ fn: "sendRatingReminders", args: [] }])[0];
  check("asked once only", (await notes(users.customer.id, "rating-reminder")).length === 1);
  // A waitlisted state goes live (Lagos is live; signed-up waitlister).
  await q(
    "insert into waitlist_entries (id, email, state_id, role, user_id, consent_at, unsubscribe_token, updated_at) values (gen_random_uuid(), $1, $2, 'CUSTOMER', $3, now(), $4, now())",
    [
      users.customer.email,
      lagos,
      users.customer.id,
      `tok-${run}-${crypto.randomBytes(8).toString("hex")}`,
    ],
  );
  trigger([{ fn: "emailStateWaitlist", args: [lagos] }]);
  n = await notes(users.customer.id, "state-launch");
  check(
    "waitlisted state goes live -> customer in-app + email",
    n.length === 1 &&
      n[0].title === "We're live in Lagos" &&
      mails("waitlist-launch", users.customer.email).length === 1,
  );

  // -------------------------------------------------------------------------------------------
  console.log("\nAdmin alerts");
  trigger([
    { fn: "notifyAdminOfSubmission", args: [ids.Review, false] },
    { fn: "notifyAdminOfIdentity", args: [ids.idOk, false] },
  ]);
  await q("update identity_verifications set status = 'PENDING' where id = $1", [ids.idOk]);
  trigger([{ fn: "notifyAdminOfIdentity", args: [ids.idOk, false] }]);
  ids.report = crypto.randomUUID();
  await q(
    "insert into business_reports (id, business_id, reporter_id, reason, details) values ($1, $2, $3, 'SCAM', 'Asked me to pay a registration fee before any work.')",
    [ids.report, ids.Live, users.customer.id],
  );
  trigger([
    { fn: "notifyAdminOfListingReport", args: [ids.report] },
    { fn: "notifyAdminOfReviewReport", args: [ids.review] },
  ]);
  for (const type of [
    "admin-submission",
    "admin-transfer-proof",
    "admin-identity",
    "admin-listing-report",
    "admin-review-report",
  ]) {
    check(`admin alert in-app: ${type}`, (await notes(users.admin.id, type)).length >= 1);
  }
  const adminText = JSON.stringify(await notes(users.admin.id));
  check(
    "admin alerts never include owners' names or emails",
    !adminText.includes("Ola Owner") && !adminText.includes(users.owner.email),
  );
  check(
    "non-admins get no admin alerts",
    (
      await q(
        "select 1 from notifications where user_id = any($1::uuid[]) and category = 'ADMIN'",
        [[users.owner.id, users.customer.id]],
      )
    ).length === 0,
  );

  // -------------------------------------------------------------------------------------------
  console.log("\nBell, mark as read and /notifications");
  const ph = await newPage();
  check("customer logs in (360px)", await login(ph, users.customer, "/account"));
  await ph
    .waitForFunction(
      () =>
        [...document.querySelectorAll("header button[aria-controls]")].some(
          (x) => x.offsetParent !== null && /unread/.test(x.innerText),
        ),
      { timeout: 15000 },
    )
    .catch(() => {});
  b = await bell(ph);
  const unreadDb = (
    await one("select count(*)::int c from notifications where user_id = $1 and read_at is null", [
      users.customer.id,
    ])
  ).c;
  check(
    "phone header: bell with the unread count",
    b && b.badge === String(unreadDb),
    `${JSON.stringify(b)} / ${unreadDb}`,
  );
  await ph.evaluate(() =>
    [...document.querySelectorAll("header button[aria-controls]")]
      .find((x) => x.offsetParent !== null && /Notifications/.test(x.innerText))
      .click(),
  );
  await ph
    .waitForFunction(
      () =>
        [...document.querySelectorAll("header [role=region]")].some(
          (r) => !r.hidden && /Did you hire/.test(r.innerText),
        ),
      { timeout: 10000 },
    )
    .catch(() => {});
  const panel = await ph.evaluate(
    () =>
      [...document.querySelectorAll("header [role=region]")].find((r) => !r.hidden)?.innerText ??
      "",
  );
  check(
    "dropdown lists recent notifications",
    panel.includes("Did you hire") &&
      panel.includes("replied to your review") &&
      panel.includes("See all notifications"),
  );
  await go(ph, "/notifications");
  await ph
    .waitForFunction(
      () =>
        [...document.querySelectorAll("header button[aria-controls]")].some(
          (x) => x.offsetParent !== null && /Notifications/.test(x.innerText),
        ),
      { timeout: 10000 },
    )
    .catch(() => {});
  await ph.evaluate(() =>
    [...document.querySelectorAll("header button[aria-controls]")]
      .find((x) => x.offsetParent !== null && /Notifications/.test(x.innerText))
      .click(),
  );
  await ph
    .waitForFunction(
      () =>
        [...document.querySelectorAll("header [role=region]")].some(
          (r) => !r.hidden && r.querySelector("li"),
        ),
      { timeout: 10000 },
    )
    .catch(() => {});
  await axe(ph, "bell open (360px)");
  await ph.evaluate(() =>
    [...document.querySelectorAll("header [role=region]")]
      .find((r) => !r.hidden)
      .querySelectorAll("li a")
      .forEach((a) => a.innerText.includes("Did you hire") && a.click()),
  );
  await ph
    .waitForFunction(() => location.pathname.startsWith("/business/"), { timeout: 15000 })
    .catch(() => {});
  check(
    "clicking a notification opens the right page",
    (await ph.evaluate(() => location.pathname + location.hash)).startsWith(
      `/business/e2e-nt-${run}-`,
    ),
  );
  check(
    "... and marks it read",
    (
      await one(
        "select count(*)::int c from notifications where user_id = $1 and read_at is null",
        [users.customer.id],
      )
    ).c ===
      unreadDb - 1,
  );
  await go(ph, "/notifications");
  let page = await ph.evaluate(() => document.querySelector("main").innerText);
  check(
    "/notifications lists everything",
    page.includes("Did you hire") &&
      page.includes("We're live in Lagos") &&
      page.includes("replied to your review"),
  );
  await axe(ph, "/notifications (360px)");
  await clickText(ph, "Mark all as read");
  await ph
    .waitForFunction(() => document.querySelector("main").innerText.includes("all caught up"), {
      timeout: 10000,
    })
    .catch(() => {});
  check(
    "Mark all as read",
    (
      await one(
        "select count(*)::int c from notifications where user_id = $1 and read_at is null",
        [users.customer.id],
      )
    ).c === 0,
  );
  await go(ph, "/account");
  b = await bell(ph);
  check("bell badge gone after reading", b && b.badge === null);
  const noteOwner = (await notes(users.owner.id, "listing-approved"))[0];
  const stranger = await ph.goto(`${baseUrl}/notifications/open/${noteOwner.id}`, {
    waitUntil: "load",
  });
  check(
    "someone else's notification can't be opened",
    new URL(stranger.url()).pathname === "/notifications" &&
      !(await one("select read_at from notifications where id = $1", [noteOwner.id])).read_at,
  );
  await go(desk, approvedPushUrl ?? "/missing-push-url");
  check(
    "push click URL opens the right page and marks it read",
    (await desk.evaluate(() => location.pathname)) === `/business/e2e-nt-${run}-review` &&
      Boolean(
        (await one("select read_at from notifications where id = $1", [noteOwner.id])).read_at,
      ),
  );

  // -------------------------------------------------------------------------------------------
  console.log("\nSettings are respected");
  await go(desk, "/account/notifications");
  await desk.evaluate(() => {
    for (const label of ["Listing updates by push", "Listing updates by email"])
      document.querySelector(`button[role=switch][aria-label="${label}"]`).click();
  });
  await sleep(2500);
  const pref = await one(
    "select push, email from notification_preferences where user_id = $1 and category = 'LISTING'",
    [users.owner.id],
  );
  check(
    "switching off push and email for listing updates is saved",
    pref && pref.push === false && pref.email === false,
  );
  await clearPush(desk);
  const beforeMails = mails("listing-reinstated", users.owner.email).length;
  trigger([{ fn: "notifyListingReinstated", args: [ids.Live] }]);
  await sleep(8000);
  check("in-app still created", (await notes(users.owner.id, "listing-reinstated")).length === 2);
  check("no email sent", mails("listing-reinstated", users.owner.email).length === beforeMails);
  check(
    "no push sent",
    !(await shownPush(desk)).some((p) => p.title === "Your listing is live again"),
  );
  trigger([{ fn: "notifyProofReceived", args: [ids.pay] }]);
  if (PUSH_ON)
    check("other categories still pushed", Boolean(await waitPush(desk, "Payment proof received")));

  // -------------------------------------------------------------------------------------------
  console.log("\nDevices: remove, turn off, expired clean-up");
  const fake = {
    endpoint: `https://fcm.googleapis.com/fcm/send/e2e-expired-${run}`,
    p256dh:
      "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
    auth: "tBHItJI5svbpez7KI4CCXg",
  };
  await q(
    "insert into push_subscriptions (id, user_id, endpoint, p256dh, auth, label) values (gen_random_uuid(), $1, $2, $3, $4, 'Old phone')",
    [users.owner.id, fake.endpoint, fake.p256dh, fake.auth],
  );
  trigger([{ fn: "notifyProofReceived", args: [ids.pay] }]);
  if (!PUSH_ON) {
    // Push off: nothing is even attempted, so the push service is never contacted.
    check(
      "push off: nothing sent, even to a saved device",
      (await q("select 1 from push_subscriptions where endpoint = $1", [fake.endpoint])).length ===
        1,
    );
    await q("delete from push_subscriptions where endpoint = $1", [fake.endpoint]);
  } else {
    check(
      "expired subscription removed when the push service says it's gone",
      (await q("select 1 from push_subscriptions where endpoint = $1", [fake.endpoint])).length ===
        0,
    );
    await go(desk, "/account/notifications");
    await desk.evaluate(() =>
      [...document.querySelectorAll("main li")]
        .find((li) => li.innerText.includes("Chrome on Android"))
        ?.querySelector("button")
        .click(),
    );
    await sleep(2500);
    check(
      "removing a device from the list",
      (await q("select label from push_subscriptions where user_id = $1", [users.owner.id])).every(
        (s) => s.label !== "Chrome on Android",
      ),
    );
    await clickText(desk, "Turn off");
    await desk
      .waitForFunction(
        () =>
          document
            .querySelector("main")
            .innerText.includes("Push notifications are off for this device"),
        { timeout: 15000 },
      )
      .catch(() => {});
    let offOk = false;
    for (let i = 0; i < 20 && !offOk; i++) {
      offOk =
        (await q("select 1 from push_subscriptions where user_id = $1", [users.owner.id]))
          .length === 0 &&
        (await desk.evaluate(
          async () => (await navigator.serviceWorker.getRegistrations()).length,
        )) === 0;
      if (!offOk) await sleep(500);
    }
    check("turning push off removes the device and the worker", offOk);
  }

  // -------------------------------------------------------------------------------------------
  console.log("\nAsking permission politely");
  const pr = await newPage();
  check("customer logs in (prompt test)", await login(pr, users.customer, "/account"));
  for (const p of ["/", "/search", `/business/e2e-nt-${run}-other`]) {
    await go(pr, p);
    check(
      `no prompt and no permission request on load: ${p}`,
      (await pr.evaluate(() => window.__permissionAsks)) === 0 &&
        !(await pr.evaluate(() =>
          document.body.innerText.includes("Want a reminder to rate them?"),
        )),
    );
  }
  await pr.evaluate(() =>
    [...document.querySelectorAll("[data-contact-bar] a")]
      .find((a) => a.innerText.includes("WhatsApp"))
      ?.addEventListener("click", (e) => e.preventDefault(), { once: true }),
  );
  await pr.evaluate(() =>
    [...document.querySelectorAll("[data-contact-bar] a")]
      .find((a) => a.innerText.includes("WhatsApp"))
      .click(),
  );
  let pr2;
  if (!PUSH_ON) {
    await sleep(3000);
    check(
      "push off: no push offer after contacting a business",
      !(await pr.evaluate(() =>
        document.body.innerText.includes("Want a reminder to rate them?"),
      )) && (await pr.evaluate(() => window.__permissionAsks)) === 0,
    );
    pr2 = await newPage({ grant: true, persistent: true });
    check(
      "owner logs in (submitted page)",
      await login(pr2, users.owner, `/business/${ids.Review}/submitted`),
    );
    await sleep(3000);
    check(
      "push off: no push offer after submitting a listing",
      !(await pr2.evaluate(() =>
        document.body.innerText.includes("Get notified when it's approved"),
      )) && (await pr2.evaluate(() => window.__permissionAsks)) === 0,
    );
  } else {
    await pr
      .waitForFunction(() => document.body.innerText.includes("Want a reminder to rate them?"), {
        timeout: 15000,
      })
      .catch(() => {});
    check(
      "after contacting a business: friendly prompt with Turn on / Not now",
      await pr.evaluate(
        () =>
          document.body.innerText.includes("Want a reminder to rate them?") &&
          document.body.innerText.includes("Not now"),
      ),
    );
    check(
      "prompt sits above the contact bar",
      await pr.evaluate(
        () =>
          document.querySelector(".push-prompt").getBoundingClientRect().bottom <=
          document.querySelector("[data-contact-bar]").getBoundingClientRect().top,
      ),
    );
    check(
      "still no permission request until 'Turn on'",
      (await pr.evaluate(() => window.__permissionAsks)) === 0,
    );
    await axe(pr, "prompt on business page (360px)");
    await clickText(pr, "Not now", "body");
    await sleep(300);
    await pr.reload({ waitUntil: "load" });
    await sleep(800);
    await pr.evaluate(() =>
      [...document.querySelectorAll("[data-contact-bar] a")]
        .find((a) => a.innerText.includes("WhatsApp"))
        ?.addEventListener("click", (e) => e.preventDefault(), { once: true }),
    );
    await pr.evaluate(() =>
      [...document.querySelectorAll("[data-contact-bar] a")]
        .find((a) => a.innerText.includes("WhatsApp"))
        .click(),
    );
    await sleep(2500);
    check(
      "'Not now' is remembered",
      !(await pr.evaluate(() => document.body.innerText.includes("Want a reminder to rate them?"))),
    );
    pr2 = await newPage({ grant: true, persistent: true });
    check(
      "owner logs in (submitted page)",
      await login(pr2, users.owner, `/business/${ids.Review}/submitted`),
    );
    await pr2
      .waitForFunction(() => document.body.innerText.includes("Get notified when it's approved"), {
        timeout: 15000,
      })
      .catch(() => {});
    check(
      "after submitting a listing: prompt shown",
      await pr2.evaluate(() => document.body.innerText.includes("Get notified when it's approved")),
    );
    await clickText(pr2, "Turn on", "main");
    await pr2
      .waitForFunction(() => document.body.innerText.includes("Notifications are on"), {
        timeout: 30000,
      })
      .catch(() => {});
    check(
      "'Turn on' asks the browser, then subscribes",
      (await pr2.evaluate(() => window.__permissionAsks)) === 1 &&
        (await q("select 1 from push_subscriptions where user_id = $1", [users.owner.id]))
          .length === 1,
    );
  }
  const ios = await newPage({ ua: IPHONE_UA });
  check("customer logs in (iPhone)", await login(ios, users.customer, "/account/notifications"));
  await ios
    .waitForFunction(
      () => document.querySelector("main").innerText.includes("aren't available on iPhone"),
      { timeout: 15000 },
    )
    .catch(() => {});
  const iosText = await ios.evaluate(() => document.querySelector("main").innerText);
  check(
    "iPhone: push option hidden, explains in-app and email still work",
    iosText.includes("aren't available on iPhone and iPad") &&
      iosText.includes("by email") &&
      !/\bTurn on\b/.test(iosText),
  );
  await go(ios, `/business/e2e-nt-${run}-other`);
  await ios.evaluate(() =>
    [...document.querySelectorAll("[data-contact-bar] a")]
      .find((a) => a.innerText.includes("WhatsApp"))
      ?.addEventListener("click", (e) => e.preventDefault(), { once: true }),
  );
  await ios.evaluate(() =>
    [...document.querySelectorAll("[data-contact-bar] a")]
      .find((a) => a.innerText.includes("WhatsApp"))
      .click(),
  );
  await sleep(2500);
  check(
    "iPhone: no push prompt after contacting",
    !(await ios.evaluate(() => document.body.innerText.includes("Want a reminder"))),
  );

  // -------------------------------------------------------------------------------------------
  console.log("\nClean-up job");
  await q(
    "insert into notifications (id, user_id, category, type, title, body, link, created_at) values (gen_random_uuid(), $1, 'LISTING', 'old', 'Old', 'Old one', '/dashboard', now() - interval '91 days')",
    [users.owner.id],
  );
  const pruned = trigger([{ fn: "pruneNotifications", args: [] }])[0];
  check(
    "notifications older than 90 days deleted by the daily job",
    pruned >= 1 &&
      (await q("select 1 from notifications where user_id = $1 and type = 'old'", [users.owner.id]))
        .length === 0,
  );
  check(
    "no page errors",
    [desk, andr, ph, pr, pr2].every((p) => p.errors.length === 0),
    [desk, andr, ph, pr, pr2]
      .flatMap((p) => p.errors)
      .slice(0, 3)
      .join(" | "),
  );
  if (shotsDir) await ph.screenshot({ path: path.join(shotsDir, "notifications-page.png") });
  const realRows = await q(
    "select type, created_at::text at from notifications where user_id = any($1::uuid[]) and created_at >= $2 and (body like $3 or link like any($4::text[]))",
    [
      realAdmins,
      testStart,
      "%E2E Notify%",
      Object.values(ids)
        .filter(Boolean)
        .map((id) => `%${id}%`),
    ],
  );
  check(
    "test mode: real admins received no notifications (in-app or push) from test events",
    realRows.length === 0,
    JSON.stringify(realRows),
  );
} catch (e) {
  failures++;
  console.log("  ERROR", e.message);
} finally {
  console.log("\nCleanup");
  const idList = Object.values(users)
    .map((u) => u.id)
    .filter(Boolean);
  const bizIds = [ids.Review, ids.Live, ids.other].filter(Boolean);
  // Admin alerts these test events created for other (real) admins.
  const extra = await q(
    `delete from notifications where user_id = any($1::uuid[]) and created_at >= $2 and (body like $3 or link like any($4::text[])) returning id`,
    [
      realAdmins,
      testStart,
      `%E2E Notify%`,
      [
        ...bizIds.map((id) => `%${id}%`),
        ...[ids.idOk, ids.idNo, ids.pay].filter(Boolean).map((id) => `%${id}%`),
      ],
    ],
  );
  console.log(`  removed ${extra.length} admin alert(s) the test created for other admins`);
  await q("delete from waitlist_entries where user_id = any($1::uuid[])", [idList]);
  await q("delete from rate_limit_hits where created_at >= $1", [testStart]);
  await q("delete from business_reports where reporter_id = any($1::uuid[])", [idList]);
  await q("delete from identity_verifications where user_id = any($1::uuid[])", [idList]);
  await q("delete from payments where user_id = any($1::uuid[])", [idList]);
  await q("delete from businesses where owner_id = any($1::uuid[])", [idList]);
  await q("delete from profiles where id = any($1::uuid[])", [idList]);
  for (const u of Object.values(users))
    if (u.id) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  const left = await one(
    "select (select count(*) from notifications where user_id = any($1::uuid[]))::int n, (select count(*) from push_subscriptions where user_id = any($1::uuid[]))::int s, (select count(*) from businesses where slug like $2)::int b",
    [idList, `e2e-nt-${run}-%`],
  );
  console.log("  leftovers:", JSON.stringify(left));
  await browser.close();
  for (const { b, dir } of extraBrowsers) {
    await b.close().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
  await db.end();
  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
