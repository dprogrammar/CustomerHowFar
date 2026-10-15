// End-to-end test of user management, suspension and deletion. Real DB/Supabase/Cloudinary;
// emails go to a test outbox; re-registration uses the Supabase admin API (no emails sent).
// Only data created here is touched. Prints no secrets and no real personal data.
// Usage: node test-users.mjs <projectDir> <baseUrl> <outboxFile> <shotsDir>
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { axeSource, browserPath } from "./lib/setup.mjs";

const [projectDir, baseUrl, outboxFile, shotsDir] = process.argv.slice(2);
const require = createRequire(path.join(projectDir, "package.json"));
require("./scripts/env-guard.mjs").loadEnv(); // refuses production
const CLD = process.env.CLOUDINARY_FOLDER || "customerhowfar"; // dev: dev/customerhowfar
const { createClient } = require("@supabase/supabase-js");
const pg = require("pg");
const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = new pg.Pool({
  connectionString: process.env.DIRECT_URL,
  max: 3,
  idleTimeoutMillis: 10_000,
  keepAlive: true,
});
db.on("error", (e) => console.log("  (db pool error:", e.code, ")"));
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

const run = crypto.randomBytes(3).toString("hex");
const pw = () => `Tst-${crypto.randomBytes(9).toString("base64url")}9a`;
const mk = (key, name, role) => ({
  email: `chf-e2e-${run}-${key}@example.com`,
  password: pw(),
  name,
  role,
});
const users = {
  adminA: mk("admina", "Ade Admin", "ADMIN"),
  adminB: mk("adminb", "Bola Admin", "ADMIN"),
  owner: mk("owner", "Ola Owner", "BUSINESS_OWNER"),
  selfdel: mk("selfdel", "Sade Leaving", "BUSINESS_OWNER"),
  customer: mk("customer", "Chi Customer", "CUSTOMER"),
};
const allUserIds = new Set();
const extraAuthIds = [];
const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";

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
async function waitEmail(tag, pred = () => true, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const m = outbox().find((x) => x.tag === tag && pred(x));
    if (m) return m;
    await sleep(300);
  }
  return null;
}
async function exists(publicId, type = "upload") {
  try {
    await cloudinary.api.resource(publicId, { resource_type: "image", type });
    return true;
  } catch (e) {
    if (e?.error?.http_code === 404) return false;
    throw e;
  }
}
async function waitGone(ids, type = "upload", timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    let any = false;
    for (const id of ids) if (await exists(id, type)) any = true;
    if (!any) return true;
    await sleep(1000);
  }
  return false;
}
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true });
async function newPage(width = 360) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width, height: 800, isMobile: width < 600, hasTouch: width < 600 });
  return page;
}
function helpers(page) {
  const h = {
    go: async (p) => {
      await page.bringToFront();
      const res = await page.goto(baseUrl + p, { waitUntil: "load" });
      await sleep(600);
      return res;
    },
    path: () => new URL(page.url()).pathname,
    text: () => page.evaluate(() => document.querySelector("main")?.innerText ?? ""),
    waitText: (t, timeout = 20000) =>
      page
        .waitForFunction(
          (x) => (document.querySelector("main")?.innerText ?? "").includes(x),
          { timeout },
          t,
        )
        .then(
          () => true,
          () => false,
        ),
    click: async (label, scope = "main", contains = false) => {
      await page
        .waitForFunction(
          (l, s, c) =>
            [...document.querySelectorAll(`${s} button, ${s} a`)].some(
              (b) =>
                (b.offsetParent !== null || b.closest("dialog[open]")) &&
                !b.disabled &&
                (c ? b.textContent.includes(l) : b.textContent.trim().startsWith(l)),
            ),
          { timeout: 15000 },
          label,
          scope,
          contains,
        )
        .catch(() => {});
      const ok = await page.evaluate(
        (l, s, c) => {
          const b = [...document.querySelectorAll(`${s} button, ${s} a`)].find(
            (x) =>
              (x.offsetParent !== null || x.closest("dialog[open]")) &&
              !x.disabled &&
              (c ? x.textContent.includes(l) : x.textContent.trim().startsWith(l)),
          );
          if (!b) return false;
          b.click();
          return true;
        },
        label,
        scope,
        contains,
      );
      if (!ok) throw new Error(`"${label}" not found/enabled in ${scope} at ${page.url()}`);
    },
    buttonState: (label, scope = "main") =>
      page.evaluate(
        (l, s) => {
          const b = [...document.querySelectorAll(`${s} button`)].find(
            (x) =>
              (x.offsetParent !== null || x.closest("dialog[open]")) &&
              x.textContent.trim().startsWith(l),
          );
          return b ? (b.disabled ? "disabled" : "enabled") : "absent";
        },
        label,
        scope,
      ),
    type: async (selector, value) => {
      const el = await page.waitForSelector(selector, { visible: true });
      await el.evaluate((e) => {
        const proto =
          e instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(e, "");
        e.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await el.type(value);
    },
    dialogText: () => page.evaluate(() => document.querySelector("dialog[open]")?.innerText ?? ""),
    axe: async (label) => {
      await page
        .waitForFunction(
          () =>
            document.title &&
            [...document.querySelectorAll("h1")].some((e) => e.offsetParent !== null),
          { timeout: 15000 },
        )
        .catch(() => {});
      await page.evaluate(axeSource);
      const r = await page.evaluate(async () => {
        const res = await window.axe.run(document, {
          runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"],
        });
        return {
          v: res.violations.map(
            (x) => `${x.impact} ${x.id} x${x.nodes.length}: ${x.nodes[0]?.target.join(" ")}`,
          ),
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });
      check(
        `a11y + 360px: ${label}`,
        r.v.length === 0 && !r.overflow,
        [r.overflow ? "overflow" : "", ...r.v].filter(Boolean).join(" | "),
      );
    },
    shot: (name) =>
      page.screenshot({ path: path.join(shotsDir, `users-${name}.png`), fullPage: true }),
  };
  return h;
}
async function login(page, user, next) {
  const h = helpers(page);
  await h.go(`/login?next=${encodeURIComponent(next)}`);
  for (const [n, v] of [
    ["email", user.email],
    ["password", user.password],
  ])
    await (await page.waitForSelector(`main [name="${n}"]`, { visible: true })).type(v);
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
function recorder(page) {
  const calls = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"])
      calls.push({ url: r.url(), headers: r.headers(), body: r.postData() });
  });
  return calls;
}
const replay = (page, call, body) =>
  page.evaluate(
    async ({ url, headers, body }) => (await fetch(url, { method: "POST", headers, body })).text(),
    {
      url: call.url,
      headers: {
        "next-action": call.headers["next-action"],
        "content-type": call.headers["content-type"],
        accept: "text/x-component",
      },
      body,
    },
  );

const ids = {};
const slugs = {};
const files = {};
async function insertBusiness(key, ownerKey, status, { photos = 0, logo = false } = {}) {
  const id = crypto.randomUUID();
  ids[key] = id;
  slugs[key] = `e2e-um-${run}-${key.toLowerCase()}`;
  const cat = (await one("select id from categories where slug = 'fashion-tailoring'")).id;
  const state = (await one("select id from states where slug = 'lagos'")).id;
  const lga = (await one("select id from lgas where state_id = $1 and slug = 'ikeja'", [state])).id;
  const owner = users[ownerKey].id;
  files[key] = [];
  let logoId = null;
  if (logo) {
    logoId = (await cloudinary.uploader.upload(PNG, { folder: `${CLD}/users/${owner}` })).public_id;
    files[key].push(logoId);
  }
  await q(
    `insert into businesses (id, owner_id, name, slug, category_id, tagline, phone, whatsapp_number, address, state_id, lga_id, description, status, logo_public_id, submitted_at, published_at, updated_at)
     values ($1,$2,$3,$4,$5,'Usermgmt tailoring','+2348037770000','+2348037770000','1 Test Street',$6,$7,'A complete description of more than thirty characters for testing.', $8, $9, now(), $10, now())`,
    [
      id,
      owner,
      `E2E Usermgmt ${key} ${run}`,
      slugs[key],
      cat,
      state,
      lga,
      status,
      logoId,
      status === "APPROVED" ? new Date() : null,
    ],
  );
  for (let i = 0; i < photos; i++) {
    const pid = (await cloudinary.uploader.upload(PNG, { folder: `${CLD}/users/${owner}` }))
      .public_id;
    files[key].push(pid);
    await q(
      "insert into business_photos (id, business_id, public_id, width, height, sort_order, updated_at) values (gen_random_uuid(), $1, $2, 1, 1, $3, now())",
      [id, pid, i],
    );
  }
}
async function insertPayment(key, ownerKey) {
  const proof = (
    await cloudinary.uploader.upload(PNG, {
      folder: `${CLD}/proofs/${users[ownerKey].id}`,
      type: "authenticated",
    })
  ).public_id;
  const ref = `CHF-U${crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 5)}`;
  await q(
    "insert into payments (id, business_id, user_id, amount_kobo, reference, status, provider, paid_at, sender_name, sender_bank, proof_public_id, proof_format, updated_at) values (gen_random_uuid(), $1, $2, 500000, $3, 'SUCCESS', 'MANUAL_TRANSFER', now(), $4, 'GTBank', $5, 'png', now())",
    [ids[key], users[ownerKey].id, ref, users[ownerKey].name, proof],
  );
  return { ref, proof };
}
const sitemap = async () => (await fetch(`${baseUrl}/sitemap.xml`)).text();
const shows = async (page, slug, name) => {
  await page.goto(`${baseUrl}/business/${slug}`, { waitUntil: "load" });
  await sleep(500);
  return (await page.evaluate(() => document.querySelector("main")?.innerText ?? "")).includes(
    name,
  );
};
const searchNames = async (page) => {
  await page.goto(`${baseUrl}/search?q=${encodeURIComponent(`Usermgmt ${run}`)}`, {
    waitUntil: "load",
  });
  await sleep(500);
  return page.evaluate(() =>
    [...document.querySelectorAll("main article h3")]
      .filter((e) => e.offsetParent !== null)
      .map((e) => e.textContent.trim()),
  );
};

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
    allUserIds.add(u.id);
    await q(
      "insert into profiles (id, full_name, email, phone, role, updated_at) values ($1,$2,$3,$4,$5, now())",
      [
        u.id,
        u.name,
        u.email,
        u.role === "CUSTOMER" ? `+23480377${run.replace(/\D/g, "0").slice(0, 2)}111` : null,
        u.role,
      ],
    );
  }
  await q("update profiles set phone = '+2348037799991' where id = $1", [users.owner.id]);
  await insertBusiness("Live", "owner", "APPROVED", { photos: 2, logo: true });
  await insertBusiness("Pending", "owner", "PENDING_REVIEW");
  await insertBusiness("Draft", "owner", "DRAFT");
  await insertBusiness("Paid", "owner", "APPROVED", { photos: 1 });
  const paidPay = await insertPayment("Paid", "owner");
  await insertBusiness("SelfPaid", "selfdel", "APPROVED", { photos: 1 });
  const selfPay = await insertPayment("SelfPaid", "selfdel");
  await insertBusiness("SelfFree", "selfdel", "APPROVED", { logo: true });
  await q(
    "insert into reviews (id, business_id, user_id, rating, comment, updated_at) values (gen_random_uuid(), $1, $2, 5, 'Great work', now())",
    [ids.Live, users.customer.id],
  );
  await q("insert into saved_businesses (user_id, business_id) values ($1, $2)", [
    users.customer.id,
    ids.Live,
  ]);
  await q("insert into contact_events (business_id, type, user_id) values ($1, 'WHATSAPP', $2)", [
    ids.Live,
    users.customer.id,
  ]);
  await q("insert into saved_businesses (user_id, business_id) values ($1, $2)", [
    users.customer.id,
    ids.SelfFree,
  ]);
  // selfdel: an accepted ID check with real private images.
  const idFront = (
    await cloudinary.uploader.upload(PNG, {
      folder: `${CLD}/identity/${users.selfdel.id}`,
      type: "authenticated",
    })
  ).public_id;
  const idSelfie = (
    await cloudinary.uploader.upload(PNG, {
      folder: `${CLD}/identity/${users.selfdel.id}`,
      type: "authenticated",
    })
  ).public_id;
  await q(
    "insert into identity_verifications (id, user_id, id_type, full_name_on_id, id_front_public_id, id_front_format, selfie_public_id, selfie_format, consent_given_at, status, reviewed_at, name_read_by_admin, submitted_at, updated_at) values (gen_random_uuid(), $1, 'NIN_SLIP', 'Sade Leaving', $2, 'png', $3, 'png', now(), 'APPROVED', now(), 'SADE LEAVING', now(), now())",
    [users.selfdel.id, idFront, idSelfie],
  );
  await q(
    "insert into identity_verifications (id, user_id, id_type, full_name_on_id, consent_given_at, status, reviewed_at, submitted_at, updated_at) values (gen_random_uuid(), $1, 'NIN_SLIP', 'Ola Owner', now(), 'APPROVED', now(), now(), now())",
    [users.owner.id],
  );
  if (fs.existsSync(outboxFile)) fs.unlinkSync(outboxFile);
  check("test users, businesses, payments and files created", Object.keys(ids).length === 6);

  // -------------------------------------------------------------------------------------
  console.log("\nAdmin users page");
  const ap = await newPage();
  const A = helpers(ap);
  const adminCalls = recorder(ap);
  check("admin logs in", await login(ap, users.adminA, "/admin"));
  check(
    "overview links to users",
    (await A.waitText("Suspended users")) && (await ap.$('main a[href="/admin/users"]')) !== null,
  );
  check(
    "admin nav has Users",
    (await ap.$('nav[aria-label="Admin"] a[href="/admin/users"]')) !== null,
  );
  await A.go(`/admin/users?q=${encodeURIComponent("Ola Owner")}`);
  let t = await A.text();
  check("search by name", t.includes(users.owner.email));
  await A.go(`/admin/users?q=${encodeURIComponent(users.owner.email.toUpperCase())}`);
  check("search by email (any case)", (await A.text()).includes("Ola Owner"));
  await A.go(`/admin/users?q=08037799991`);
  check("search by phone (local format)", (await A.text()).includes("Ola Owner"));
  await A.go(`/admin/users?q=${run}&role=ADMIN`);
  t = await A.text();
  check(
    "role filter",
    t.includes("Ade Admin") && t.includes("Bola Admin") && !t.includes("Ola Owner"),
  );
  await A.go(`/admin/users?q=${run}`);
  t = await A.text();
  const ownerCard = await ap.evaluate(
    (email) =>
      [...document.querySelectorAll("main ul li a")].find((a) => a.innerText.includes(email))
        ?.innerText ?? "",
    users.owner.email,
  );
  check(
    "columns: name, email, role, status, businesses, ID status, joined",
    ownerCard.includes("Ola Owner") &&
      ownerCard.includes("Business owner") &&
      ownerCard.includes("Active") &&
      ownerCard.includes("4 businesses") &&
      ownerCard.includes("ID: Accepted") &&
      ownerCard.includes("Joined"),
    ownerCard.replace(/\n/g, " | "),
  );
  await A.axe("admin users list");
  await A.shot("list-360");
  await A.go(`/admin/users/${users.owner.id}`);
  t = await A.text();
  check(
    "detail: profile, businesses with statuses, payments, ID status",
    t.includes(users.owner.email) &&
      t.includes(`E2E Usermgmt Live ${run}`) &&
      t.includes("Live") &&
      t.includes("In review") &&
      t.includes("Draft") &&
      t.includes(paidPay.ref) &&
      t.includes("ID: Accepted"),
  );
  await A.axe("admin user detail");

  console.log("\nNon-admins get 404");
  const cp = await newPage();
  const C = helpers(cp);
  check("customer logs in", await login(cp, users.customer, "/account"));
  check("/admin/users: non-admin -> 404", (await C.go("/admin/users")).status() === 404);
  check(
    "/admin/users/<id>: non-admin -> 404",
    (await C.go(`/admin/users/${users.owner.id}`)).status() === 404,
  );

  // -------------------------------------------------------------------------------------
  console.log("\nSuspend user");
  const op = await newPage();
  const O = helpers(op);
  check("owner logs in", await login(op, users.owner, "/dashboard"));
  const pubBefore = await newPage();
  check(
    "live listing public before",
    (await shows(pubBefore, slugs.Live, `Usermgmt Live ${run}`)) &&
      (await searchNames(pubBefore)).length === 4,
  );
  await A.go(`/admin/users/${users.owner.id}`);
  await A.click("Suspend user");
  await ap.waitForSelector("dialog[open]");
  check(
    "suspend needs a reason",
    (await A.buttonState("Suspend user", "dialog[open]")) === "disabled",
  );
  await A.axe("suspend dialog");
  await A.type(
    "dialog[open] textarea",
    "Repeated reports of taking deposits without doing the work.",
  );
  await A.click("Suspend user", "dialog[open]");
  check("suspended message", await A.waitText("User suspended. They're signed out"));
  const sp = await one(
    "select status, suspension_reason, suspended_at from profiles where id = $1",
    [users.owner.id],
  );
  check(
    "profile SUSPENDED with reason and time",
    sp.status === "SUSPENDED" &&
      sp.suspension_reason.startsWith("Repeated reports") &&
      sp.suspended_at,
  );
  const bs = await q(
    "select id, status, status_before_user_suspension as prev from businesses where owner_id = $1",
    [users.owner.id],
  );
  const prev = Object.fromEntries(bs.map((b) => [b.id, b.prev]));
  check(
    "all businesses hidden, previous statuses remembered",
    bs.every((b) => b.status === "SUSPENDED") &&
      prev[ids.Live] === "APPROVED" &&
      prev[ids.Pending] === "PENDING_REVIEW" &&
      prev[ids.Draft] === "DRAFT" &&
      prev[ids.Paid] === "APPROVED",
  );
  const au = await admin.auth.admin.getUserById(users.owner.id);
  check(
    "banned in Supabase Auth",
    Boolean(au.data.user?.banned_until) && new Date(au.data.user.banned_until) > new Date(),
  );
  check(
    "all sessions signed out",
    (await one("select count(*)::int n from auth.sessions where user_id = $1", [users.owner.id]))
      .n === 0,
  );
  const audit1 = await one(
    "select actor_id, reason from admin_audit_log where target_user_id = $1 and action = 'USER_SUSPENDED'",
    [users.owner.id],
  );
  check(
    "recorded who and when (audit log)",
    audit1?.actor_id === users.adminA.id && audit1.reason.startsWith("Repeated"),
  );
  const susMail = await waitEmail("account-suspended", (m) => m.to.email === users.owner.email);
  check(
    "user emailed with the reason (test outbox)",
    Boolean(susMail) && susMail.text.includes("Repeated reports"),
  );
  check(
    "public page gone",
    (await pubBefore.goto(`${baseUrl}/business/${slugs.Live}`)).status() !== 200 ||
      !(await pubBefore.evaluate(() => document.querySelector("main")?.innerText ?? "")).includes(
        `Usermgmt Live ${run}`,
      ),
  );
  const afterSus = await searchNames(pubBefore);
  check(
    "search no longer shows their businesses",
    afterSus.length === 2 && afterSus.every((n) => n.includes("Self")),
    afterSus.join(", "),
  );
  check("sitemap no longer lists them", !(await sitemap()).includes(slugs.Live));
  await O.go("/dashboard");
  await op
    .waitForFunction(() => location.pathname === "/login", { timeout: 15000 })
    .catch(() => {});
  check("open session is ended (sent to login)", O.path() === "/login", O.path());
  await O.go("/admin/users"); // harmless; must not loop
  await O.go("/login");
  check("login page reachable (no redirect loop)", O.path() === "/login");
  for (const [n, v] of [
    ["email", users.owner.email],
    ["password", users.owner.password],
  ])
    await (await op.waitForSelector(`main [name="${n}"]`, { visible: true })).type(v);
  await op.evaluate(() =>
    [...document.querySelectorAll("main form button[type=submit]")].at(-1).click(),
  );
  check(
    "login attempt shows a clear suspended message",
    await O.waitText("This account has been suspended"),
  );
  const reReg = await admin.auth.admin.createUser({
    email: users.owner.email,
    password: pw(),
    email_confirm: true,
  });
  check(
    "suspended email can't be registered again",
    Boolean(reReg.error),
    reReg.error?.code ?? "created!",
  );
  if (reReg.data?.user) extraAuthIds.push(reReg.data.user.id);

  await A.go(`/admin/listings/${ids.Live}`);
  check(
    "listing page: hidden because owner suspended; no reinstate",
    await A.waitText("Hidden because the owner is suspended"),
  );
  const reinst = adminCalls.length;
  await A.click("Reinstate");
  await A.click("Reinstate", "dialog[open]");
  check(
    "reinstating a listing of a suspended owner is refused",
    await A.waitText("Unsuspend the owner to restore it"),
  );
  check(
    "still suspended",
    (await one("select status from businesses where id = $1", [ids.Live])).status === "SUSPENDED",
    String(adminCalls.length - reinst),
  );

  console.log("\nSelf-protection");
  await A.go(`/admin/users/${users.adminA.id}`);
  check(
    "own page: suspend/delete/role disabled",
    (await A.waitText("This is your own account")) &&
      (await A.buttonState("Suspend user")) === "disabled" &&
      (await A.buttonState("Delete user")) === "disabled" &&
      (await A.buttonState("Change role")) === "disabled",
  );
  const suspendCall = adminCalls.find(
    (c) => c.body?.includes(users.owner.id) && c.body.includes("Repeated reports"),
  );
  const selfSuspend = await replay(
    ap,
    suspendCall,
    suspendCall.body.replaceAll(users.owner.id, users.adminA.id),
  );
  check(
    "server refuses self-suspension",
    selfSuspend.includes("can't suspend yourself") &&
      (await one("select status from profiles where id = $1", [users.adminA.id])).status ===
        "ACTIVE",
  );

  console.log("\nUnsuspend");
  await A.go(`/admin/users/${users.owner.id}`);
  await A.click("Unsuspend user");
  await A.click("Unsuspend user", "dialog[open]");
  check("unsuspended", await A.waitText("User unsuspended"));
  const after = Object.fromEntries(
    (
      await q(
        "select id, status, status_before_user_suspension as prev from businesses where owner_id = $1",
        [users.owner.id],
      )
    ).map((b) => [b.id, b]),
  );
  check(
    "each business restored to its exact previous status",
    after[ids.Live].status === "APPROVED" &&
      after[ids.Pending].status === "PENDING_REVIEW" &&
      after[ids.Draft].status === "DRAFT" &&
      after[ids.Paid].status === "APPROVED" &&
      Object.values(after).every((b) => b.prev === null),
  );
  const au2 = await admin.auth.admin.getUserById(users.owner.id);
  check(
    "Supabase ban lifted",
    !au2.data.user?.banned_until || new Date(au2.data.user.banned_until) <= new Date(),
  );
  check(
    "public page and search back",
    (await shows(pubBefore, slugs.Live, `Usermgmt Live ${run}`)) &&
      (await searchNames(pubBefore)).length === 4,
  );
  check("owner can log in again", await login(op, users.owner, "/dashboard"));

  // -------------------------------------------------------------------------------------
  console.log("\nOwner deletes a business (no payments)");
  await O.go("/dashboard");
  await O.waitText(`E2E Usermgmt Live ${run}`);
  await O.click(`Delete business: E2E Usermgmt Live ${run}`, "main", true);
  await op.waitForSelector("dialog[open]");
  check(
    "dialog asks to type the name",
    (await O.dialogText()).includes(`Type E2E Usermgmt Live ${run} to confirm`) &&
      (await O.buttonState("Delete business", "dialog[open]")) === "disabled",
  );
  await O.axe("owner delete-business dialog");
  await O.type("dialog[open] input", "wrong name");
  check(
    "wrong name keeps it disabled",
    (await O.buttonState("Delete business", "dialog[open]")) === "disabled",
  );
  await O.type("dialog[open] input", `E2E Usermgmt Live ${run}`);
  await O.click("Delete business", "dialog[open]");
  check("deleted message", await O.waitText(`E2E Usermgmt Live ${run} has been deleted`));
  check(
    "business row, photos, reviews, saves, contact events gone",
    (
      await one(
        "select (select count(*) from businesses where id = $1) + (select count(*) from business_photos where business_id = $1) + (select count(*) from reviews where business_id = $1) + (select count(*) from saved_businesses where business_id = $1) + (select count(*) from contact_events where business_id = $1) as n",
        [ids.Live],
      )
    ).n === "0",
  );
  check("Cloudinary logo and photos deleted", await waitGone(files.Live));
  check(
    "public page 404 / gone",
    (await pubBefore.goto(`${baseUrl}/business/${slugs.Live}`)).status() !== 200 ||
      !(await pubBefore.evaluate(() => document.querySelector("main")?.innerText ?? "")).includes(
        `Usermgmt Live ${run}`,
      ),
  );
  check(
    "audit: BUSINESS_SELF_DELETED",
    Boolean(
      await one(
        "select 1 from admin_audit_log where target_business_id = $1 and action = 'BUSINESS_SELF_DELETED' and actor_id = $2",
        [ids.Live, users.owner.id],
      ),
    ),
  );

  console.log("\nAdmin deletes a business with payments (soft delete)");
  await A.go(`/admin/listings/${ids.Paid}`);
  await A.waitText("Actions");
  await A.click("Delete business");
  await ap.waitForSelector("dialog[open]");
  check(
    "admin dialog needs reason + name",
    (await A.buttonState("Delete business", "dialog[open]")) === "disabled" &&
      (await A.dialogText()).includes("payment records are kept"),
  );
  await A.axe("admin delete-business dialog");
  await A.type("dialog[open] textarea", "Listing used to advertise counterfeit goods.");
  await A.type("dialog[open] input", `E2E Usermgmt Paid ${run}`);
  await A.click("Delete business", "dialog[open]");
  await ap
    .waitForFunction(() => location.pathname === "/admin/listings", { timeout: 20000 })
    .catch(() => {});
  const soft = await one(
    "select status, slug, name, tagline, description, phone, address, logo_public_id, deleted_at, (select count(*)::int from business_photos where business_id = b.id) photos from businesses b where id = $1",
    [ids.Paid],
  );
  check(
    "kept as DELETED with only the name",
    soft.status === "DELETED" &&
      soft.name === `E2E Usermgmt Paid ${run}` &&
      soft.slug === `deleted-${ids.Paid}` &&
      !soft.tagline &&
      !soft.description &&
      soft.phone === "" &&
      !soft.address &&
      soft.photos === 0 &&
      soft.deleted_at,
  );
  check(
    "payment record kept",
    Boolean(
      await one("select 1 from payments where reference = $1 and business_id = $2", [
        paidPay.ref,
        ids.Paid,
      ]),
    ),
  );
  check("its photos deleted from Cloudinary", await waitGone(files.Paid));
  const delMail = await waitEmail("business-deleted", (m) => m.to.email === users.owner.email);
  check(
    "owner emailed with the reason (test outbox)",
    Boolean(delMail) && delMail.text.includes("counterfeit"),
  );
  check(
    "public page gone, sitemap clean",
    !(await shows(pubBefore, slugs.Paid, `Usermgmt Paid ${run}`)) &&
      !(await sitemap()).includes(slugs.Paid) &&
      !(await sitemap()).includes(`deleted-${ids.Paid}`),
  );
  const afterDel = await searchNames(pubBefore);
  check(
    "search shows none of the deleted",
    afterDel.length === 2 && afterDel.every((n) => n.includes("Self")),
    afterDel.join(", "),
  );
  await O.go("/dashboard");
  t = await O.text();
  check(
    "owner dashboard no longer lists it",
    !t.includes(`Usermgmt Paid ${run}`) && t.includes(`Usermgmt Pending ${run}`),
  );
  await A.go(`/admin/listings?tab=live&q=${encodeURIComponent(`Usermgmt Paid ${run}`)}`);
  check("not in admin lists", (await A.text()).includes("No listings match"));
  await A.go(`/admin/listings?tab=deleted&q=${encodeURIComponent(`Usermgmt Paid ${run}`)}`);
  check("shown under the Deleted filter", (await A.text()).includes(`E2E Usermgmt Paid ${run}`));

  // -------------------------------------------------------------------------------------
  console.log("\nAdmin deletes a user");
  await A.go(`/admin/users/${users.customer.id}`);
  await A.click("Delete user");
  await ap.waitForSelector("dialog[open]");
  const dd = await A.dialogText();
  check(
    "explains the email becomes free and suggests Suspend instead",
    dd.includes("free to register again") && dd.includes("Suspend instead"),
  );
  check(
    "needs DELETE typed",
    (await A.buttonState("Delete account", "dialog[open]")) === "disabled",
  );
  await A.axe("admin delete-user dialog");
  await A.type("dialog[open] input[autocomplete=off]:not([maxlength])", "DELETE");
  await A.click("Delete account", "dialog[open]");
  await ap
    .waitForFunction(() => location.pathname === "/admin/users", { timeout: 20000 })
    .catch(() => {});
  check(
    "profile, saves, reviews, contact events gone",
    (
      await one(
        "select (select count(*) from profiles where id = $1) + (select count(*) from saved_businesses where user_id = $1) + (select count(*) from reviews where user_id = $1) + (select count(*) from contact_events where user_id = $1) as n",
        [users.customer.id],
      )
    ).n === "0",
  );
  check(
    "Supabase auth user deleted",
    (await admin.auth.admin.getUserById(users.customer.id)).error !== null,
  );
  check(
    "audit: USER_DELETED by admin",
    Boolean(
      await one(
        "select 1 from admin_audit_log where target_user_id = $1 and action = 'USER_DELETED' and actor_id = $2",
        [users.customer.id, users.adminA.id],
      ),
    ),
  );
  await C.go("/account");
  // The redirect is streamed from inside Suspense, so wait for it.
  await cp
    .waitForFunction(() => location.pathname === "/login", { timeout: 15000 })
    .catch(() => {});
  check("their open session ends", C.path() === "/login", C.path());
  const re1 = await admin.auth.admin.createUser({
    email: users.customer.email,
    password: pw(),
    email_confirm: true,
  });
  check("email can register again after deletion", !re1.error && Boolean(re1.data.user));
  if (re1.data?.user) extraAuthIds.push(re1.data.user.id);

  console.log("\nRoles and admins");
  await A.go(`/admin/users/${users.adminB.id}`);
  await A.click("Change role");
  await ap.waitForSelector("dialog[open] select");
  await ap.select("dialog[open] select", "BUSINESS_OWNER");
  await A.axe("change role dialog");
  await A.click("Save role", "dialog[open]");
  check(
    "demoted",
    (await A.waitText("Role updated.")) &&
      (await one("select role from profiles where id = $1", [users.adminB.id])).role ===
        "BUSINESS_OWNER",
  );
  check(
    "admin flag removed in Supabase",
    (await admin.auth.admin.getUserById(users.adminB.id)).data.user?.app_metadata?.role !== "admin",
  );
  await A.go(`/admin/users/${users.adminB.id}`);
  await A.click("Change role");
  await ap.waitForSelector("dialog[open] select");
  await ap.select("dialog[open] select", "ADMIN");
  await A.click("Save role", "dialog[open]");
  check(
    "promoted back, flag set",
    (await A.waitText("Role updated.")) &&
      (await admin.auth.admin.getUserById(users.adminB.id)).data.user?.app_metadata?.role ===
        "admin",
  );
  const deleteCall = adminCalls.find(
    (c) => c.body?.includes(users.customer.id) && c.body.includes("DELETE"),
  );
  const noExtra = await replay(
    ap,
    deleteCall,
    deleteCall.body.replaceAll(users.customer.id, users.adminB.id),
  );
  check(
    "deleting an admin without the extra confirmation is refused",
    noExtra.includes("Tick the extra confirmation") &&
      Boolean(await one("select 1 from profiles where id = $1", [users.adminB.id])),
  );
  const selfDel = await replay(
    ap,
    deleteCall,
    deleteCall.body.replaceAll(users.customer.id, users.adminA.id),
  );
  check("server refuses admin self-deletion", selfDel.includes("can't delete your own account"));
  await A.go(`/admin/users/${users.adminB.id}`);
  await A.click("Delete user");
  await ap.waitForSelector("dialog[open]");
  await A.type("dialog[open] input[autocomplete=off]:not([maxlength])", "DELETE");
  check(
    "admin target: extra checkbox required",
    (await A.buttonState("Delete account", "dialog[open]")) === "disabled",
  );
  await ap.click("dialog[open] input[type=checkbox]");
  await A.click("Delete account", "dialog[open]");
  await ap
    .waitForFunction(() => location.pathname === "/admin/users", { timeout: 20000 })
    .catch(() => {});
  check(
    "other admin deleted (more admins remain)",
    !(await one("select 1 from profiles where id = $1", [users.adminB.id])),
  );
  await A.go("/account");
  check(
    "admins can't self-delete from /account",
    (await A.waitText("Admin accounts can't be deleted here")) &&
      (await A.buttonState("Delete my account")) === "absent",
  );

  // -------------------------------------------------------------------------------------
  console.log("\nUser deletes their own account");
  const dp = await newPage();
  const D = helpers(dp);
  check("user logs in", await login(dp, users.selfdel, "/account"));
  await D.waitText("What is kept");
  t = await D.text();
  check(
    "explains what is deleted and what is kept",
    t.includes("What is deleted") &&
      t.includes("What is kept") &&
      t.includes("without your name, email or phone"),
  );
  await D.click("Delete my account");
  await dp.waitForSelector("dialog[open]");
  await D.axe("delete my account dialog");
  await D.type("dialog[open] input[autocomplete=off]", "DELETE");
  await D.type("dialog[open] input[type=password]", "wrong-password-1");
  await D.click("Delete my account", "dialog[open]");
  check(
    "wrong password refused",
    await dp
      .waitForFunction(
        () =>
          (document.querySelector("dialog[open]")?.innerText ?? "").includes(
            "That password is incorrect",
          ),
        { timeout: 15000 },
      )
      .then(
        () => true,
        () => false,
      ),
  );
  check(
    "nothing deleted",
    Boolean(
      await one("select 1 from profiles where id = $1 and status = 'ACTIVE'", [users.selfdel.id]),
    ),
  );
  await D.type("dialog[open] input[type=password]", users.selfdel.password);
  await D.click("Delete my account", "dialog[open]");
  await dp
    .waitForFunction(() => location.pathname === "/account-deleted", { timeout: 30000 })
    .catch(() => {});
  check(
    "lands on the confirmation page",
    D.path() === "/account-deleted" && (await D.waitText("Your account has been deleted")),
  );
  await D.axe("account deleted page");
  const tomb = await one(
    "select full_name, email, phone, avatar_url, status, deleted_at from profiles where id = $1",
    [users.selfdel.id],
  );
  check(
    "profile anonymized (payments point to it)",
    tomb &&
      tomb.full_name === "Deleted user" &&
      tomb.email === `deleted-${users.selfdel.id}@deleted.invalid` &&
      !tomb.phone &&
      tomb.status === "DELETED" &&
      tomb.deleted_at,
  );
  const pay = await one(
    "select amount_kobo, reference, provider, paid_at, sender_name, sender_bank, proof_public_id, b.name from payments p join businesses b on b.id = p.business_id where reference = $1",
    [selfPay.ref],
  );
  check(
    "payment kept: amount, date, reference, method, business name; no personal data",
    pay.amount_kobo === 500000 &&
      pay.paid_at &&
      pay.provider === "MANUAL_TRANSFER" &&
      pay.name === `E2E Usermgmt SelfPaid ${run}` &&
      !pay.sender_name &&
      !pay.sender_bank &&
      !pay.proof_public_id,
  );
  check("payment proof file deleted", await waitGone([selfPay.proof], "authenticated"));
  check(
    "business with payments soft-deleted; without payments removed",
    (await one("select status from businesses where id = $1", [ids.SelfPaid])).status ===
      "DELETED" && !(await one("select 1 from businesses where id = $1", [ids.SelfFree])),
  );
  check("their business files deleted", await waitGone([...files.SelfPaid, ...files.SelfFree]));
  const idRows = await q(
    "select user_id, full_name_on_id, name_read_by_admin, images_deleted_at from identity_verifications where id_front_public_id = $1 or (user_id is null and full_name_on_id = 'Deleted account' and created_at > now() - interval '1 hour')",
    [idFront],
  );
  check(
    "ID images deleted now; record unlinked, names removed",
    !(await exists(idFront, "authenticated")) &&
      !(await exists(idSelfie, "authenticated")) &&
      idRows.length >= 1 &&
      idRows.every(
        (r) =>
          r.user_id === null && r.full_name_on_id === "Deleted account" && !r.name_read_by_admin,
      ),
  );
  check(
    "Supabase auth user deleted",
    (await admin.auth.admin.getUserById(users.selfdel.id)).error !== null,
  );
  check(
    "audit: USER_SELF_DELETED",
    Boolean(
      await one(
        "select 1 from admin_audit_log where target_user_id = $1 and action = 'USER_SELF_DELETED'",
        [users.selfdel.id],
      ),
    ),
  );
  const re2 = await admin.auth.admin.createUser({
    email: users.selfdel.email,
    password: pw(),
    email_confirm: true,
  });
  check("their email can register again", !re2.error && Boolean(re2.data.user));
  if (re2.data?.user) extraAuthIds.push(re2.data.user.id);
  await A.go(`/admin/users?q=${run}`);
  check(
    "deleted accounts not listed as users",
    !(await A.text()).includes("Deleted user") && !(await A.text()).includes("Sade"),
  );
  check(
    "sitemap and search clean",
    !(await sitemap()).includes(slugs.SelfFree) && (await searchNames(pubBefore)).length === 0,
  );

  // -------------------------------------------------------------------------------------
  console.log("\nAudit log and file-deletion retries");
  const hist = await A.go(`/admin/users/${users.owner.id}`);
  t = await A.text();
  check(
    "account history shows suspension, unsuspension and deletions",
    hist.status() === 200 &&
      t.includes("Suspended") &&
      t.includes("Unsuspended") &&
      t.includes("Business deleted by the owner") &&
      t.includes("Business deleted by an admin"),
  );
  const auditText = JSON.stringify(
    await q("select summary, reason from admin_audit_log where target_user_id = any($1::uuid[])", [
      [...allUserIds],
    ]),
  );
  check(
    "audit log holds no emails or phone numbers",
    !auditText.includes("@") && !/\+234\d{6}/.test(auditText),
  );
  await q(
    "insert into pending_file_deletions (id, public_id, delivery_type) values (gen_random_uuid(), $1, 'upload')",
    [`${CLD}/users/${users.owner.id}/queued-${run}`],
  );
  const cron = await (
    await fetch(`${baseUrl}/api/cron/identity-retention`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
  ).json();
  check(
    "daily job retries queued file deletions",
    cron.ok &&
      cron.files?.deleted >= 1 &&
      !(await one("select 1 from pending_file_deletions where public_id = $1", [
        `${CLD}/users/${users.owner.id}/queued-${run}`,
      ])),
  );

  console.log("\nEmails stayed in the test outbox");
  const all = outbox();
  check(
    "no email to unexpected addresses",
    all.length > 0 &&
      all.every(
        (m) => m.to.email === process.env.ADMIN_NOTIFY_EMAIL || m.to.email.endsWith("@example.com"),
      ),
    `${all.length} emails`,
  );
} catch (error) {
  failures++;
  console.log("  ERROR", error instanceof Error ? error.message : error);
} finally {
  console.log("\nCleanup");
  const idList = [...allUserIds];
  const bizIds = (
    await q("select id from businesses where owner_id = any($1::uuid[])", [idList])
  ).map((r) => r.id);
  await q(
    "delete from admin_audit_log where target_user_id = any($1::uuid[]) or actor_id = any($1::uuid[]) or target_business_id = any($2::uuid[])",
    [idList, bizIds],
  );
  await q("delete from pending_file_deletions where public_id like $1", [`%queued-${run}`]);
  await q(
    "delete from identity_verifications where user_id = any($1::uuid[]) or reviewed_by_id = any($1::uuid[]) or (user_id is null and full_name_on_id = 'Deleted account' and created_at > now() - interval '2 hours')",
    [idList],
  );
  await q("delete from payments where user_id = any($1::uuid[]) or business_id = any($2::uuid[])", [
    idList,
    bizIds,
  ]);
  await q("delete from businesses where owner_id = any($1::uuid[])", [idList]);
  await q("delete from profiles where id = any($1::uuid[])", [idList]);
  let removed = 0;
  for (const id of idList) {
    for (const [prefix, type] of [
      ["users", "upload"],
      ["proofs", "authenticated"],
      ["identity", "authenticated"],
    ]) {
      const r = await cloudinary.api.delete_resources_by_prefix(`${CLD}/${prefix}/${id}/`, {
        type,
      });
      removed += Object.keys(r.deleted ?? {}).length;
    }
  }
  for (const id of [...idList, ...extraAuthIds])
    await admin.auth.admin.deleteUser(id).catch(() => {});
  console.log("  test files removed:", removed);
  await browser.close();
  await db.end();
  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
