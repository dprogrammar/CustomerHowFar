// Launch hardening tests: security headers, CSP (no violations on real flows), rate limits,
// error pages, health/daily job, orphan cleanup (dry run + real) and the PWA offline page.
// Real DB/Supabase/Cloudinary; emails go to a test outbox. Only data created here is touched.
// Usage: node test-hardening.mjs <projectDir> <baseUrl> <outboxFile> <shotsDir>
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { axeSource, browserPath, outputFile } from "./lib/setup.mjs";

const [projectDir, baseUrl] = process.argv.slice(2);
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
const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const CRON = { authorization: `Bearer ${process.env.CRON_SECRET}` };
// Same keyed hash as src/lib/rate-limit.ts, so tests can pre-fill limits for a fake IP.
const keyed = (kind, value) =>
  crypto
    .createHmac("sha256", process.env.SUPABASE_SECRET_KEY)
    .update(`${kind}:${value}`)
    .digest("hex")
    .slice(0, 32);
const fakeIp = (n) => `203.0.113.${n}`;
const fill = (key, count) =>
  q(
    "insert into rate_limit_hits (key, created_at) select $1, now() from generate_series(1, $2::int)",
    [key, count],
  );

let failures = 0;
const check = (name, pass, detail = "") => {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = async (publicId, type = "upload") => {
  try {
    await cloudinary.api.resource(publicId, { resource_type: "image", type });
    return true;
  } catch (e) {
    if (e?.error?.http_code === 404) return false;
    throw e;
  }
};

const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true });
const cspViolations = [];
async function newPage({ ip } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 360, height: 800, isMobile: true, hasTouch: true });
  if (ip) await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
  await page.evaluateOnNewDocument(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window.__csp ||= []).push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  page.on("console", (m) => {
    const t = m.text();
    if (/Content Security Policy|Refused to (load|connect|frame|execute)/i.test(t))
      cspViolations.push(`${page.url().replace(baseUrl, "")}: ${t.slice(0, 160)}`);
  });
  return page;
}
const collect = async (page) => {
  const v = await page.evaluate(() => window.__csp ?? []).catch(() => []);
  for (const x of v) cspViolations.push(`${page.url().replace(baseUrl, "")}: ${x}`);
};
function helpers(page) {
  return {
    go: async (p) => {
      const res = await page.goto(baseUrl + p, { waitUntil: "load" });
      await sleep(800);
      await collect(page);
      return res;
    },
    text: () =>
      page.evaluate(() => document.querySelector("main")?.innerText ?? document.body.innerText),
    waitText: (t, timeout = 20000) =>
      page
        .waitForFunction(
          (x) => (document.querySelector("main")?.innerText ?? document.body.innerText).includes(x),
          { timeout },
          t,
        )
        .then(
          () => true,
          () => false,
        ),
    fill: async (selector, value) => {
      const el = await page.waitForSelector(selector, { visible: true });
      await el.evaluate((e, v) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, v);
        e.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
    },
    submit: () =>
      page.evaluate(() =>
        [
          ...[...document.querySelectorAll("main form")]
            .filter((f) => f.offsetParent !== null)
            .at(-1)
            .querySelectorAll("button[type=submit]"),
        ]
          .at(-1)
          .click(),
      ),
    axe: async (label) => {
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
    },
  };
}
async function login(page, user, next) {
  const h = helpers(page);
  await h.go(`/login?next=${encodeURIComponent(next)}`);
  await h.fill('main [name="email"]', user.email);
  await h.fill('main [name="password"]', user.password);
  await h.submit();
  return page
    .waitForFunction((p) => location.pathname === p, { timeout: 20000 }, next)
    .then(
      () => true,
      () => false,
    );
}

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PDF = `data:application/pdf;base64,${Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF").toString("base64")}`;
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
  const owner = users.owner.id;
  const up = (folder, uri, type = "upload") =>
    cloudinary.uploader
      .upload(uri, { folder, type, resource_type: "image" })
      .then((r) => r.public_id);
  const photo = await up(`${CLD}/users/${owner}`, PNG);
  const orphan1 = await up(`${CLD}/users/${owner}`, PNG);
  const orphan2 = await up(`${CLD}/users/${owner}`, PNG);
  const idFront = await up(`${CLD}/identity/${owner}`, PNG, "authenticated");
  const idOrphan = await up(`${CLD}/identity/${owner}`, PNG, "authenticated");
  const proofPdf = await up(`${CLD}/proofs/${owner}`, PDF, "authenticated");
  const cat = (await one("select id from categories where slug = 'fashion-tailoring'")).id;
  const st = (await one("select id from states where slug = 'lagos'")).id;
  const lga = (await one("select id from lgas where state_id = $1 and slug = 'ikeja'", [st])).id;
  ids.biz = crypto.randomUUID();
  ids.slug = `e2e-hd-${run}-biz`;
  await q(
    `insert into businesses (id, owner_id, name, slug, category_id, phone, whatsapp_number, address, state_id, lga_id, description, status, logo_public_id, submitted_at, published_at, updated_at)
           values ($1,$2,$3,$4,$5,'+2348031230000','+2348031230000','1 Test Street',$6,$7,'A complete description of more than thirty characters for testing.','APPROVED',$8, now(), now(), now())`,
    [ids.biz, owner, `E2E Hardening ${run}`, ids.slug, cat, st, lga, photo],
  );
  ids.identity = (
    await one(
      "insert into identity_verifications (id, user_id, id_type, full_name_on_id, id_front_public_id, id_front_format, selfie_public_id, selfie_format, consent_given_at, status, submitted_at, updated_at) values (gen_random_uuid(), $1, 'NIN_SLIP', 'Ola Owner', $2, 'png', NULL, NULL, now(), 'PENDING', now(), now()) returning id",
      [owner, idFront],
    )
  ).id;
  ids.payment = (
    await one(
      "insert into payments (id, business_id, user_id, amount_kobo, reference, status, provider, proof_public_id, proof_format, sender_name, sender_bank, amount_sent_kobo, proof_submitted_at, updated_at) values (gen_random_uuid(), $1, $2, 500000, $3, 'AWAITING_CONFIRMATION', 'MANUAL_TRANSFER', $4, 'pdf', 'Ola Owner', 'GTBank', 500000, now(), now()) returning id",
      [ids.biz, owner, `CHF-H${run.toUpperCase().slice(0, 5)}`, proofPdf],
    )
  ).id;
  check("test data created", Boolean(ids.biz && ids.identity && ids.payment));

  // -------------------------------------------------------------------------------------
  console.log("\nSecurity headers");
  const h = async (p) => (await fetch(baseUrl + p, { redirect: "manual" })).headers;
  for (const p of ["/", "/search?q=carpenter", `/business/${ids.slug}`, "/api/health", "/login"]) {
    const hd = await h(p);
    const csp = hd.get("content-security-policy") ?? "";
    const ok =
      csp.includes("default-src 'self'") &&
      csp.includes("frame-ancestors 'none'") &&
      csp.includes("object-src 'none'") &&
      csp.includes("https://res.cloudinary.com") &&
      /max-age=\d+/.test(hd.get("strict-transport-security") ?? "") &&
      hd.get("x-content-type-options") === "nosniff" &&
      hd.get("referrer-policy") === "strict-origin-when-cross-origin" &&
      hd.get("x-frame-options") === "DENY" &&
      (hd.get("permissions-policy") ?? "").includes("camera=()") &&
      !hd.get("x-powered-by");
    check(`headers on ${p}`, ok);
  }
  check(
    "no 'unsafe-eval' in production CSP",
    !((await h("/")).get("content-security-policy") ?? "").includes("unsafe-eval"),
  );
  const vi = await fetch(`${baseUrl}/account/verify-identity`, { redirect: "manual" });
  check(
    "camera allowed only on the ID check page",
    (vi.headers.get("permissions-policy") ?? "").includes("camera=(self)"),
  );
  const sw = await fetch(`${baseUrl}/sw.js`);
  check(
    "service worker served uncached",
    sw.status === 200 && (sw.headers.get("cache-control") ?? "").includes("no-cache"),
  );

  // -------------------------------------------------------------------------------------
  console.log("\nNo CSP violations on real pages and flows");
  const pub = await newPage();
  const P = helpers(pub);
  for (const p of [
    "/",
    "/search?q=carpenter",
    "/category/fashion-tailoring",
    `/business/${ids.slug}`,
    "/help",
    "/contact",
    "/login",
    "/terms",
  ])
    await P.go(p);
  // Image gallery on a business page with real photos (the Lighthouse fixture if present).
  const lh = fs.existsSync(outputFile("lh-fixture.json"))
    ? JSON.parse(fs.readFileSync(outputFile("lh-fixture.json"), "utf8"))
    : null;
  if (lh) {
    await P.go(`/business/${lh.slug}`);
    await pub.evaluate(() =>
      [...document.querySelectorAll("main button")].find((b) => b.querySelector("img"))?.click(),
    );
    await sleep(1500);
    await collect(pub);
  }
  const op = await newPage();
  const O = helpers(op);
  check("owner logs in", await login(op, users.owner, "/dashboard"));
  await O.go("/dashboard");
  await O.go(`/business/${ids.biz}/edit?step=4`);
  // A real browser upload to Cloudinary (connect-src) from the photos step.
  const signed = await op.evaluate(async () => {
    const r = await fetch("/api/uploads/sign", { method: "POST" });
    const s = await r.json();
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const blob = await new Promise((res) => c.toBlob(res, "image/png"));
    const fd = new FormData();
    fd.append("file", blob, "t.png");
    for (const [k, v] of Object.entries({
      api_key: s.apiKey,
      timestamp: String(s.timestamp),
      signature: s.signature,
      folder: s.folder,
      allowed_formats: s.allowedFormats,
    }))
      fd.append(k, v);
    const u = await fetch(s.uploadUrl, { method: "POST", body: fd });
    return { ok: u.ok, id: (await u.json()).public_id };
  });
  check("browser upload to Cloudinary allowed by CSP", signed.ok);
  if (signed.id) await cloudinary.uploader.destroy(signed.id);
  const cam = await newPage();
  check("second user logs in for the camera test", await login(cam, users.admin, "/account"));
  await helpers(cam).go("/account/verify-identity");
  await cam.evaluate(async () => {
    const input = document.querySelector('input[data-slot="front"][data-source="camera"]');
    if (!input) return;
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 800;
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg"));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "id.jpg", { type: "image/jpeg" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  check(
    "camera upload preview (blob:) works",
    await cam
      .waitForFunction(
        () =>
          [...document.querySelectorAll("main img")].some(
            (i) => i.src.startsWith("blob:") && i.complete && i.naturalWidth > 0,
          ),
        { timeout: 15000 },
      )
      .then(
        () => true,
        () => false,
      ),
  );
  await collect(cam);
  await collect(op);
  const ap = await newPage();
  const A = helpers(ap);
  check("admin logs in", await login(ap, users.admin, "/admin"));
  for (const p of [
    "/admin",
    "/admin/users",
    "/admin/reports",
    "/admin/system",
    `/admin/identity/${ids.identity}`,
    `/admin/payments/${ids.payment}`,
  ])
    await A.go(p);
  check(
    "admin ID image (private Cloudinary link) loads",
    await ap
      .goto(`${baseUrl}/admin/identity/${ids.identity}`, { waitUntil: "load" })
      .then(() =>
        ap.waitForFunction(
          () =>
            [...document.querySelectorAll("main img")].some(
              (i) => i.complete && i.naturalWidth > 0,
            ),
          { timeout: 20000 },
        ),
      )
      .then(
        () => true,
        () => false,
      ),
  );
  await collect(ap);
  await A.go(`/admin/payments/${ids.payment}`);
  await sleep(2500);
  await collect(ap);
  check(
    "no CSP violations or CSP console errors anywhere",
    cspViolations.length === 0,
    cspViolations.slice(0, 5).join(" || "),
  );

  // -------------------------------------------------------------------------------------
  console.log("\nRate limits (fake IPs, so other tests aren't affected)");
  const lp = await newPage({ ip: fakeIp(10 + (parseInt(run, 16) % 200)) });
  const L = helpers(lp);
  let limitedLogin = false;
  for (let i = 0; i < 11 && !limitedLogin; i++) {
    await L.go("/login");
    await L.fill('main [name="email"]', users.owner.email);
    await L.fill('main [name="password"]', "wrong-password-1");
    await L.submit();
    await lp
      .waitForFunction(
        () =>
          /Incorrect email|Too many attempts/.test(document.querySelector("main")?.innerText ?? ""),
        { timeout: 15000 },
      )
      .catch(() => {});
    limitedLogin = (await L.text()).includes("Too many attempts");
  }
  check("10 failed logins for one email -> 'Too many attempts'", limitedLogin);
  await L.go("/login");
  await L.fill('main [name="email"]', users.owner.email);
  await L.fill('main [name="password"]', users.owner.password);
  await L.submit();
  check("even the right password is refused while limited", await L.waitText("Too many attempts"));
  const sp = await newPage({ ip: fakeIp(1) });
  const S = helpers(sp);
  await fill(`signup-ip:${keyed("ip", fakeIp(1))}`, 10);
  await S.go("/signup");
  await S.fill('main [name="fullName"]', "Rate Limited");
  await S.fill('main [name="email"]', `chf-e2e-${run}-nobody@example.com`);
  await S.fill('main [name="password"]', "Abcdefgh123!");
  await S.fill('main [name="confirmPassword"]', "Abcdefgh123!");
  // (A real click can land on the fixed bottom navigation at 360px.)
  await sp.evaluate(() => document.querySelector('main input[name="acceptTerms"]').click());
  await S.submit();
  const suOk = await S.waitText("Too many attempts");
  if (!suOk)
    console.log(
      "    signup page says:",
      (await S.text()).slice(0, 300).split(String.fromCharCode(10)).join(" | "),
    );
  check(
    "sign-up limited per IP (no account created, no email sent)",
    suOk &&
      !(await one("select 1 from auth.users where email = $1", [
        `chf-e2e-${run}-nobody@example.com`,
      ])),
  );
  const fp = await newPage({ ip: fakeIp(2) });
  const F = helpers(fp);
  let forgotLimited = false;
  for (let i = 0; i < 4 && !forgotLimited; i++) {
    await F.go("/forgot-password");
    await (
      await fp.waitForSelector('main [name="email"]', { visible: true })
    ).type(`chf-e2e-${run}-nobody@example.com`); // no such account: Supabase sends nothing
    await F.submit();
    await fp
      .waitForFunction(
        () =>
          /If an account exists|Too many attempts/.test(
            document.querySelector("main")?.innerText ?? "",
          ),
        { timeout: 20000 },
      )
      .catch(() => {});
    forgotLimited = (await F.text()).includes("Too many attempts");
  }
  if (!forgotLimited)
    console.log(
      "    forgot hits stored:",
      (
        await one(
          "select count(*)::int n from rate_limit_hits where key like 'forgot-%' and created_at >= $1",
          [testStart],
        )
      ).n,
      "| url:",
      fp.url().replace(baseUrl, ""),
    );
  if (!forgotLimited)
    console.log(
      "    forgot page says:",
      (await F.text()).slice(0, 300).split(String.fromCharCode(10)).join(" | "),
    );
  check("forgot password limited per email (3/hour)", forgotLimited);
  await fill(`search:${keyed("ip", fakeIp(3))}`, 60);
  const qp = await newPage({ ip: fakeIp(3) });
  await helpers(qp).go("/search?q=carpenter");
  check(
    "search limited per IP with a friendly message",
    await helpers(qp).waitText("Too many attempts"),
  );
  await fill(`track:${keyed("ip", fakeIp(4))}`, 300);
  const views0 = (await one("select view_count from businesses where id = $1", [ids.biz]))
    .view_count;
  const tr = await fetch(`${baseUrl}/api/track`, {
    method: "POST",
    headers: {
      "x-forwarded-for": fakeIp(4),
      "sec-fetch-site": "same-origin",
      "user-agent": UA,
      "content-type": "text/plain",
    },
    body: JSON.stringify({ businessId: ids.biz, type: "view" }),
  });
  check(
    "tracking floods dropped silently",
    tr.status === 204 &&
      (await one("select view_count from businesses where id = $1", [ids.biz])).view_count ===
        views0,
  );
  await fill(`upload-sign:${owner}`, 150);
  const sig = await op.evaluate(async () => {
    const r = await fetch("/api/uploads/sign", { method: "POST" });
    return { status: r.status, body: await r.json() };
  });
  check(
    "upload signing limited per user (429 + message)",
    sig.status === 429 && sig.body.error?.startsWith("Too many attempts"),
  );
  await q("delete from rate_limit_hits where key = $1", [`upload-sign:${owner}`]);
  const ipRows = await q("select key from rate_limit_hits where created_at >= $1", [testStart]);
  check(
    "rate-limit rows store only hashes (no raw IPs or emails)",
    ipRows.every((r) => !/\d+\.\d+\.\d+\.\d+|@/.test(r.key)),
  );

  // -------------------------------------------------------------------------------------
  console.log("\nError pages, system page, health and the daily job");
  await A.go("/admin/system/error-test");
  check(
    "friendly error page with Try again and Go home",
    (await A.waitText("Sorry, something went wrong")) &&
      (await ap.$$eval("main button, main a", (els) => els.map((e) => e.textContent.trim()))).some(
        (t) => t.includes("Try again"),
      ) &&
      Boolean(await ap.$('main a[href="/"]')),
  );
  await A.axe("error page");
  const nonAdmin = await helpers(op).go("/admin/system/error-test");
  check("error test page is admin-only (404 for others)", nonAdmin.status() === 404);
  check(
    "global error page exists",
    fs.existsSync(path.join(projectDir, "src/app/global-error.tsx")),
  );
  const before = await (await fetch(`${baseUrl}/api/health`)).json();
  check(
    "health reports the daily job field (no secrets)",
    before.status === "ok" &&
      "dailyJob" in before &&
      !JSON.stringify(before).match(/key|secret|token|@/i),
  );
  check("cron: no secret -> 404", (await fetch(`${baseUrl}/api/cron/daily`)).status === 404);
  const dry = await (
    await fetch(`${baseUrl}/api/cron/daily?task=orphans&dryRun=1`, { headers: CRON })
  ).json();
  check(
    "global orphan dry run touches nothing real (0 old orphans)",
    dry.ok && dry.orphans.dryRun === true && dry.orphans.deleted === 0,
    JSON.stringify(dry.orphans),
  );
  const daily = await fetch(`${baseUrl}/api/cron/daily`, { headers: CRON });
  const dj = await daily.json();
  check(
    "daily job runs (keep-alive + all steps)",
    daily.status === 200 &&
      dj.ok &&
      dj.identity &&
      dj.files &&
      "rateLimitRowsPruned" in dj &&
      dj.orphans,
    JSON.stringify(dj.orphans),
  );
  const after = await (await fetch(`${baseUrl}/api/health`)).json();
  check(
    "health shows the last successful daily run",
    after.dailyJob?.lastSuccessAt &&
      Date.now() - new Date(after.dailyJob.lastSuccessAt).getTime() < 120_000,
  );
  await A.go("/admin/system");
  check(
    "system page shows the daily job",
    !(await A.text()).includes("Never") || (await A.text()).includes("last succeeded"),
  );

  console.log("\nOrphaned upload cleanup");
  const prefix = `${CLD}/users/${owner}/`;
  const def = await (
    await fetch(
      `${baseUrl}/api/cron/daily?task=orphans&dryRun=1&prefix=${encodeURIComponent(prefix)}`,
      { headers: CRON },
    )
  ).json();
  check(
    "24-hour safety: fresh files are never orphans",
    def.orphans.orphans === 0 && def.orphans.tooNew >= 3,
    JSON.stringify(def.orphans),
  );
  const d1 = await (
    await fetch(
      `${baseUrl}/api/cron/daily?task=orphans&dryRun=1&minAgeMinutes=0&prefix=${encodeURIComponent(prefix)}`,
      { headers: CRON },
    )
  ).json();
  check(
    "dry run finds the 2 unreferenced files, deletes nothing",
    d1.orphans.orphans === 2 &&
      d1.orphans.deleted === 0 &&
      (await exists(orphan1)) &&
      (await exists(orphan2)),
    JSON.stringify(d1.orphans),
  );
  const r1 = await (
    await fetch(
      `${baseUrl}/api/cron/daily?task=orphans&minAgeMinutes=0&prefix=${encodeURIComponent(prefix)}`,
      { headers: CRON },
    )
  ).json();
  check(
    "real run deletes them; the referenced logo is kept",
    r1.orphans.deleted === 2 &&
      !(await exists(orphan1)) &&
      !(await exists(orphan2)) &&
      (await exists(photo)),
    JSON.stringify(r1.orphans),
  );
  const iprefix = `${CLD}/identity/${owner}/`;
  const r2 = await (
    await fetch(
      `${baseUrl}/api/cron/daily?task=orphans&minAgeMinutes=0&prefix=${encodeURIComponent(iprefix)}`,
      { headers: CRON },
    )
  ).json();
  check(
    "private ID images: unreferenced deleted, referenced kept",
    r2.orphans.deleted === 1 &&
      !(await exists(idOrphan, "authenticated")) &&
      (await exists(idFront, "authenticated")),
    JSON.stringify(r2.orphans),
  );
  const pprefix = `${CLD}/proofs/${owner}/`;
  const r3 = await (
    await fetch(
      `${baseUrl}/api/cron/daily?task=orphans&minAgeMinutes=0&prefix=${encodeURIComponent(pprefix)}`,
      { headers: CRON },
    )
  ).json();
  check(
    "referenced payment proof kept",
    r3.orphans.deleted === 0 && (await exists(proofPdf, "authenticated")),
  );
  const bad = await fetch(
    `${baseUrl}/api/cron/daily?task=orphans&minAgeMinutes=0&prefix=${encodeURIComponent(`${CLD}/`)}`,
    { headers: CRON },
  );
  check("whole-folder runs can't lower the 24-hour safety age", bad.status === 400);

  // -------------------------------------------------------------------------------------
  // App installation is disabled for now: see test-no-install.mjs.
} catch (error) {
  failures++;
  console.log("  ERROR", error instanceof Error ? error.message : error);
} finally {
  console.log("\nCleanup");
  const idList = Object.values(users)
    .map((u) => u.id)
    .filter(Boolean);
  await q("delete from rate_limit_hits where created_at >= $1", [testStart]);
  await q(
    "delete from admin_audit_log where actor_id = any($1::uuid[]) or target_user_id = any($1::uuid[])",
    [idList],
  );
  await q("delete from identity_verifications where user_id = any($1::uuid[])", [idList]);
  await q("delete from payments where user_id = any($1::uuid[])", [idList]);
  await q("delete from businesses where owner_id = any($1::uuid[])", [idList]);
  await q("delete from profiles where id = any($1::uuid[])", [idList]);
  for (const id of idList) {
    for (const [p, type] of [
      ["users", "upload"],
      ["proofs", "authenticated"],
      ["identity", "authenticated"],
    ]) {
      await cloudinary.api
        .delete_resources_by_prefix(`${CLD}/${p}/${id}/`, { type })
        .catch(() => {});
    }
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  await browser.close();
  await db.end();
  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
