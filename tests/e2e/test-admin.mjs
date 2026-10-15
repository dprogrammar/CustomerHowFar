// End-to-end test of the admin area. Real DB/Supabase; emails go to a test outbox file only.
// Usage: node test-admin.mjs <projectDir> <baseUrl> <outboxFile> <shotsDir>
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

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = new pg.Client({ connectionString: process.env.DIRECT_URL, keepAlive: true });
db.on("error", (e) => console.log("  (db connection error:", e.code, ")"));
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

const run = crypto.randomBytes(3).toString("hex");
const pw = () => `Tst-${crypto.randomBytes(9).toString("base64url")}9a`;
const users = {
  admin: {
    email: `chf-e2e-${run}-admin@example.com`,
    password: pw(),
    name: "Ada Admin",
    role: "ADMIN",
  },
  owner: {
    email: `chf-e2e-${run}-owner@example.com`,
    password: pw(),
    name: "Obi Owner",
    role: "BUSINESS_OWNER",
  },
  other: {
    email: `chf-e2e-${run}-other@example.com`,
    password: pw(),
    name: "Nkem Other",
    role: "CUSTOMER",
  },
  revoked: {
    email: `chf-e2e-${run}-revoked@example.com`,
    password: pw(),
    name: "Rex Revoked",
    role: "CUSTOMER",
    tokenAdmin: true,
  },
};

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
async function waitForEmail(tag, predicate = () => true, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = outbox().find((m) => m.tag === tag && predicate(m));
    if (found) return found;
    await sleep(300);
  }
  return null;
}

const original = await one(
  "select payment_required, listing_fee_naira from app_settings where id = 1",
);
const setSwitch = (on) => q("update app_settings set payment_required = $1 where id = 1", [on]);

const browser = await puppeteer.launch({
  executablePath: browserPath(),
  headless: true,
});

async function newPage({ width = 1280, mobile = false, ctx } = {}) {
  const context = ctx ?? (await browser.createBrowserContext());
  const page = await context.newPage();
  await page.setViewport({ width, height: 900, isMobile: mobile, hasTouch: mobile });
  return { page, context };
}

function helpers(page) {
  const h = {
    go: async (p) => {
      await page.bringToFront();
      const res = await page.goto(baseUrl + p, { waitUntil: "load" });
      await sleep(500);
      return res;
    },
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
    el: async (sel, timeout = 15000) => {
      await page.waitForFunction(
        (s) =>
          [...document.querySelectorAll(s)].some(
            (e) => e.offsetParent !== null || e.closest("dialog[open]"),
          ),
        { timeout },
        sel,
      );
      return (
        await page.evaluateHandle(
          (s) =>
            [...document.querySelectorAll(s)].find(
              (e) => e.offsetParent !== null || e.closest("dialog[open]"),
            ),
          sel,
        )
      ).asElement();
    },
    clickButton: async (label, scope = "main") => {
      await page.bringToFront();
      await page
        .waitForFunction(
          (label, scope) => {
            const roots =
              scope === "dialog"
                ? [...document.querySelectorAll("dialog[open]")]
                : [document.querySelector("main")];
            return roots
              .flatMap((r) => [...r.querySelectorAll("button, a")])
              .some(
                (b) =>
                  (b.offsetParent !== null || b.closest("dialog[open]")) &&
                  !b.disabled &&
                  b.textContent.trim().startsWith(label),
              );
          },
          { timeout: 10000 },
          label,
          scope,
        )
        .catch(() => {});
      const ok = await page.evaluate(
        (label, scope) => {
          const roots =
            scope === "dialog"
              ? [...document.querySelectorAll("dialog[open]")]
              : [document.querySelector("main")];
          const button = roots
            .flatMap((r) => [...r.querySelectorAll("button, a")])
            .find(
              (b) =>
                (b.offsetParent !== null || b.closest("dialog[open]")) &&
                b.textContent.trim().startsWith(label),
            );
          if (!button) return false;
          button.click();
          return true;
        },
        label,
        scope,
      );
      if (!ok) {
        await page.screenshot({
          path: path.join(shotsDir, `admin-missing-${label.replace(/\W+/g, "-")}.png`),
          fullPage: true,
        });
        const buttons = await page.evaluate(() =>
          [...document.querySelectorAll("main button")]
            .map((b) => `${b.textContent.trim()}${b.offsetParent === null ? "(hidden)" : ""}`)
            .join(" | "),
        );
        throw new Error(
          `Button "${label}" not found in ${scope}. URL ${page.url().replace(baseUrl, "")}. Buttons: ${buttons}`,
        );
      }
    },
    buttonState: (label) =>
      page.evaluate((label) => {
        const b = [...document.querySelectorAll("main button")].find(
          (x) => x.offsetParent !== null && x.textContent.trim().startsWith(label),
        );
        return b ? (b.disabled ? "disabled" : "enabled") : "missing";
      }, label),
    typeInDialog: async (text) => {
      const ta = await h.el("dialog[open] textarea");
      await ta.evaluate((e) => (e.value = ""));
      await ta.type(text);
    },
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
          offenders: [...document.querySelectorAll("main *")]
            .filter(
              (e) =>
                e.offsetParent !== null &&
                e.getBoundingClientRect().right > document.documentElement.clientWidth + 1,
            )
            .filter((e, _, all) => !all.some((o) => o !== e && e.contains(o)))
            .slice(0, 3)
            .map(
              (e) =>
                `${e.tagName.toLowerCase()}[${Math.round(e.getBoundingClientRect().right)}] ${String(e.className).slice(0, 60)}`,
            ),
        };
      });
      check(
        `a11y + width: ${label}`,
        r.v.length === 0 && !r.overflow,
        [r.overflow ? `overflow: ${r.offenders.join(" || ")}` : "", ...r.v]
          .filter(Boolean)
          .join(" | "),
      );
    },
    shot: (name) =>
      page.screenshot({ path: path.join(shotsDir, `admin-${name}.png`), fullPage: true }),
  };
  return h;
}

async function login(page, user, next) {
  const h = helpers(page);
  await h.go(`/login?next=${encodeURIComponent(next)}`);
  for (const [name, value] of [
    ["email", user.email],
    ["password", user.password],
  ]) {
    const el = await h.el(`main [name="${name}"]`);
    await el.type(value);
  }
  await page.evaluate(() => {
    const form = [...document.querySelectorAll("main form")]
      .filter((f) => f.offsetParent !== null)
      .at(-1);
    [...form.querySelectorAll("button[type=submit]")].at(-1).click();
  });
  return page
    .waitForFunction((p) => location.pathname === p, { timeout: 20000 }, next)
    .then(
      () => true,
      () => false,
    );
}

const cat = (await one("select id from categories where slug = 'electricians'")).id;
const lagos = (await one("select id from states where slug = 'lagos'")).id;
const ikeja = (await one("select id from lgas where state_id = $1 and slug = 'ikeja'", [lagos])).id;
const ids = {};
async function insertBusiness(key, fields) {
  const id = crypto.randomUUID();
  ids[key] = id;
  const f = {
    name: `E2E ${key}`,
    status: "PENDING_REVIEW",
    phone: "+2348031230000",
    whatsapp: "+2348031230000",
    fee: false,
    submittedAt: null,
    publishedAt: null,
    needsRecheck: false,
    description: "A complete description of more than thirty characters for testing.",
    logo: `${CLD}/users/test/${run}-${key}`,
    ...fields,
  };
  await q(
    `insert into businesses (id, owner_id, name, slug, category_id, phone, whatsapp_number, address, state_id, lga_id, description, status, fee_required_at_submit, submitted_at, published_at, needs_recheck, logo_public_id, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,'1 Test Street',$8,$9,$10,$11,$12,$13,$14,$15,$16, now())`,
    [
      id,
      users.owner.id,
      f.name,
      `e2e-${run}-${key.toLowerCase()}`,
      cat,
      f.phone,
      f.whatsapp,
      lagos,
      ikeja,
      f.description,
      f.status,
      f.fee,
      f.submittedAt,
      f.publishedAt,
      f.needsRecheck,
      f.logo,
    ],
  );
  return id;
}

try {
  // -----------------------------------------------------------------------------------
  console.log("Setup");
  for (const u of Object.values(users)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.name },
      app_metadata: u.role === "ADMIN" || u.tokenAdmin ? { role: "admin" } : {},
    });
    if (error) throw new Error(`createUser failed: ${error.code}`);
    u.id = data.user.id;
    await q(
      "insert into profiles (id, full_name, email, role, updated_at) values ($1,$2,$3,$4, now())",
      [u.id, u.name, u.email, u.role],
    );
    if (u.role === "BUSINESS_OWNER")
      await q(
        "insert into identity_verifications (id, user_id, id_type, full_name_on_id, consent_given_at, status, reviewed_at, submitted_at, updated_at) values (gen_random_uuid(), $1, 'NIN_SLIP', $2, now(), 'APPROVED', now(), now(), now())",
        [u.id, u.name],
      );
  }
  const hour = 3600_000;
  await insertBusiness("ReviewOne", {
    submittedAt: new Date(Date.now() - 2 * hour),
    phone: "+2348035550001",
    whatsapp: "+2348035550001",
  });
  await insertBusiness("FeeUnpaid", {
    submittedAt: new Date(Date.now() - 1 * hour),
    fee: true,
    phone: "+2348035550002",
    whatsapp: "+2348035550002",
  });
  await insertBusiness("LiveEdited", {
    status: "APPROVED",
    publishedAt: new Date(),
    needsRecheck: true,
    phone: "+2348035550003",
    whatsapp: "+2348035550003",
  });
  await insertBusiness("DupPhone", {
    status: "PENDING_PAYMENT",
    fee: true,
    phone: "+2348035550001",
    whatsapp: "+2348035550009",
  });
  await insertBusiness("DraftOff", {
    status: "DRAFT",
    phone: "+2348035550004",
    whatsapp: "+2348035550004",
  });
  await insertBusiness("DraftOn", {
    status: "DRAFT",
    phone: "+2348035550005",
    whatsapp: "+2348035550005",
  });
  for (let i = 0; i < 21; i++) {
    await insertBusiness(`Filler${String(i).padStart(2, "0")}`, {
      status: "DRAFT",
      phone: `+23480355561${String(i).padStart(2, "0")}`,
      whatsapp: `+23480355561${String(i).padStart(2, "0")}`,
    });
  }
  if (fs.existsSync(outboxFile)) fs.unlinkSync(outboxFile);
  check("test users and 27 listings created", Object.keys(ids).length === 27);

  // -----------------------------------------------------------------------------------
  console.log("\nNon-admins get 404");
  for (const p of [
    "/admin",
    "/admin/listings",
    `/admin/listings/${ids.ReviewOne}`,
    "/admin/settings",
  ]) {
    const res = await fetch(baseUrl + p, { redirect: "manual" });
    check(
      `signed-out ${p.replace(ids.ReviewOne, "<id>")} -> 404`,
      res.status === 404,
      String(res.status),
    );
  }
  const { page: np } = await newPage({ width: 360, mobile: true });
  const N = helpers(np);
  check("non-admin logs in", await login(np, users.other, "/account"));
  for (const p of [
    "/admin",
    "/admin/listings?tab=review",
    `/admin/listings/${ids.ReviewOne}`,
    "/admin/settings",
  ]) {
    const res = await N.go(p);
    check(
      `signed-in non-admin ${p.replace(ids.ReviewOne, "<id>")} -> 404 page`,
      res.status() === 404 && (await N.waitText("We couldn't find that page", 8000)),
      String(res.status()),
    );
  }
  await N.go("/");
  await np.click('button[aria-haspopup="dialog"]');
  await sleep(300);
  check(
    "non-admin menu has no Admin link",
    !(await np.evaluate(() => document.querySelector("dialog").innerText)).includes("Admin"),
  );

  // -----------------------------------------------------------------------------------
  console.log("\nAdmin overview");
  const { page: ap, context: actx } = await newPage({ width: 360, mobile: true });
  const A = helpers(ap);
  const capturedActions = [];
  ap.on("request", (req) => {
    if (req.method() === "POST" && req.headers()["next-action"]) {
      capturedActions.push({ url: req.url(), headers: req.headers(), body: req.postData() });
    }
  });
  check("admin logs in", await login(ap, users.admin, "/account"));
  await A.go("/");
  await ap.click('button[aria-haspopup="dialog"]');
  await sleep(300);
  check(
    "admin menu shows Admin link",
    (await ap.evaluate(() => document.querySelector("dialog").innerText)).includes("Admin"),
  );
  await ap.keyboard.press("Escape");
  const res = await A.go("/admin");
  check("admin can open /admin", res.status() === 200 && (await A.waitText("Overview")));
  const expected = await one(`select
      count(*) filter (where status = 'PENDING_REVIEW')::int review,
      count(*) filter (where status = 'APPROVED' and needs_recheck)::int recheck,
      count(*) filter (where status = 'PENDING_PAYMENT')::int payment,
      count(*) filter (where status = 'APPROVED')::int live,
      count(*) filter (where status = 'DRAFT')::int drafts
    from businesses`);
  const users_ = (await one("select count(*)::int n from profiles where status <> 'DELETED'")).n;
  const overview = await A.text();
  const shows = (n, label) => new RegExp(`${n}\\s*\\n\\s*${label}`).test(overview);
  check(
    "overview counts match the database",
    shows(expected.review, "In review") &&
      shows(expected.recheck, "Edited, needs re-check") &&
      shows(expected.payment, "Awaiting payment") &&
      shows(expected.live, "Live") &&
      shows(expected.drafts, "Drafts") &&
      shows(users_, "Users"),
    JSON.stringify(expected),
  );
  await A.axe("overview @360px");
  await A.shot("overview-360");

  // -----------------------------------------------------------------------------------
  console.log("\nListings, search and pagination");
  await A.go("/admin/listings?tab=review");
  await A.waitText("E2E ReviewOne");
  const order = await A.text();
  check(
    "review queue: oldest submitted first",
    order.indexOf("E2E ReviewOne") < order.indexOf("E2E FeeUnpaid"),
  );
  await A.axe("listings @360px");
  await A.go(`/admin/listings?tab=payment&q=${encodeURIComponent("0803 555 0001")}`);
  check("search by phone (local format) finds the business", await A.waitText("E2E DupPhone"));
  await A.go(`/admin/listings?tab=review&q=${encodeURIComponent(users.owner.email.toUpperCase())}`);
  check(
    "search by owner email (any case)",
    (await A.waitText("E2E ReviewOne")) && (await A.text()).includes("E2E FeeUnpaid"),
  );
  await A.go("/admin/listings?tab=drafts&q=E2E%20Filler");
  check("pagination: page 1 of 2 for 21 drafts", await A.waitText("Page 1 of 2"));
  await A.clickButton("Next");
  check(
    "pagination: next page works",
    (await ap
      .waitForFunction(() => location.search.includes("page=2"), { timeout: 10000 })
      .then(
        () => true,
        () => false,
      )) && (await A.waitText("Page 2 of 2")),
  );

  // -----------------------------------------------------------------------------------
  console.log("\nListing detail");
  await A.go(`/admin/listings/${ids.ReviewOne}`);
  await A.waitText("Moderation history");
  const detail = await A.text();
  check(
    "shows owner name, email and join date",
    detail.includes(users.owner.name) &&
      detail.includes(users.owner.email) &&
      detail.includes("Joined"),
  );
  check(
    "shows fields entered by the owner",
    detail.includes("1 Test Street") &&
      detail.includes("+2348035550001") &&
      detail.includes("Ikeja"),
  );
  check(
    "duplicate phone warning lists the other business",
    detail.includes("used by 1 other business") && detail.includes("E2E DupPhone"),
  );
  check(
    "photo links open full size",
    await ap.evaluate(() =>
      [...document.querySelectorAll("main a[target=_blank]")].some(
        (a) => a.href.includes("res.cloudinary.com") && a.href.includes("w_2000"),
      ),
    ),
  );
  await A.axe("detail @360px");

  // -----------------------------------------------------------------------------------
  console.log("\nApprove (fee was OFF at submit; switch now ON -> still free)");
  await setSwitch(true);
  await A.clickButton("Approve");
  check(
    "approve asks for confirmation",
    await ap.waitForSelector("dialog[open]", { timeout: 5000 }).then(
      () => true,
      () => false,
    ),
  );
  await A.clickButton("Approve and publish", "dialog");
  check("approved message", await A.waitText("Approved. The listing is live"));
  let b = await one("select status, published_at, needs_recheck from businesses where id = $1", [
    ids.ReviewOne,
  ]);
  check(
    "status APPROVED, publishedAt set, needsRecheck false",
    b.status === "APPROVED" && b.published_at && !b.needs_recheck,
  );
  const d1 = await one(
    "select action, admin_id from moderation_decisions where business_id = $1 order by created_at desc limit 1",
    [ids.ReviewOne],
  );
  check(
    "decision recorded with admin",
    d1?.action === "APPROVED" && d1.admin_id === users.admin.id,
  );
  const approvedMail = await waitForEmail(
    "listing-approved",
    (m) => m.to.email === users.owner.email,
  );
  check(
    "owner 'Your listing is live' email recorded (not sent)",
    approvedMail && /Your listing is live/.test(approvedMail.subject),
  );

  // -----------------------------------------------------------------------------------
  console.log("\nPayment fairness");
  await A.go(`/admin/listings/${ids.FeeUnpaid}`);
  await A.waitText("Actions");
  check(
    "UI blocks approving an unpaid fee-required listing",
    (await A.buttonState("Approve")) === "disabled" &&
      (await A.text()).includes("can't be approved until the owner pays"),
  );
  const approveCall = capturedActions.find(
    (c) => c.body?.includes(ids.ReviewOne) && c.body.includes("PENDING_REVIEW"),
  );
  check("captured the approve server action", Boolean(approveCall));
  const forged = await ap.evaluate(
    async ({ url, headers, body }) => (await fetch(url, { method: "POST", headers, body })).text(),
    {
      url: approveCall.url,
      headers: {
        "next-action": approveCall.headers["next-action"],
        "content-type": approveCall.headers["content-type"],
        accept: "text/x-component",
      },
      body: approveCall.body.replaceAll(ids.ReviewOne, ids.FeeUnpaid),
    },
  );
  b = await one("select status from businesses where id = $1", [ids.FeeUnpaid]);
  check(
    "server refuses forged approve without payment",
    b.status === "PENDING_REVIEW" && forged.includes("no successful payment"),
    b.status,
  );
  await q(
    "insert into payments (id, business_id, user_id, amount_kobo, reference, status, paid_at, updated_at) values (gen_random_uuid(), $1, $2, 500000, $3, 'SUCCESS', now(), now())",
    [ids.FeeUnpaid, users.owner.id, `e2e-${run}`],
  );
  await A.go(`/admin/listings/${ids.FeeUnpaid}`);
  await A.waitText("Actions");
  await A.clickButton("Approve");
  await A.clickButton("Approve and publish", "dialog");
  check(
    "after payment, approve succeeds",
    (await A.waitText("Approved. The listing is live")) &&
      (await one("select status from businesses where id = $1", [ids.FeeUnpaid])).status ===
        "APPROVED",
  );

  // -----------------------------------------------------------------------------------
  console.log("\nConcurrency guard (two admins on the same listing)");
  const { page: ap2 } = await newPage({ width: 1280, ctx: actx });
  const A2 = helpers(ap2);
  await A.go(`/admin/listings/${ids.LiveEdited}`);
  await A2.go(`/admin/listings/${ids.LiveEdited}`);
  await A.waitText("Actions");
  await A2.waitText("Actions");
  await A.clickButton("Request changes");
  await ap.waitForSelector("dialog[open]");
  check(
    "comment required (confirm disabled when empty)",
    await ap.evaluate(
      () =>
        [...document.querySelectorAll("dialog[open] button")].find((b) =>
          b.textContent.includes("Send to owner"),
        ).disabled,
    ),
  );
  await A.clickButton("Wrong category", "dialog");
  check(
    "quick reason fills the comment box",
    (await (await A.el("dialog[open] textarea")).evaluate((e) => e.value)).startsWith(
      "Wrong category.",
    ),
  );
  await A.clickButton("Send to owner", "dialog");
  check(
    "admin 1: changes requested",
    await A.waitText("Changes requested. The owner has been emailed"),
  );
  await A2.clickButton("Suspend");
  await ap2.waitForSelector("dialog[open]");
  await A2.typeInDialog("Suspending from a stale page to test the guard.");
  await A2.clickButton("Suspend listing", "dialog");
  check(
    "admin 2 (stale page) is refused",
    await ap2
      .waitForFunction(
        () =>
          document.querySelector("dialog[open]")?.innerText.includes("changed by someone else") ||
          document.querySelector("main").innerText.includes("changed by someone else"),
        { timeout: 10000 },
      )
      .then(
        () => true,
        () => false,
      ),
  );
  b = await one("select status, rejection_reason, needs_recheck from businesses where id = $1", [
    ids.LiveEdited,
  ]);
  const decisions = await q("select action from moderation_decisions where business_id = $1", [
    ids.LiveEdited,
  ]);
  check(
    "only the first action applied",
    b.status === "REJECTED" && decisions.length === 1 && decisions[0].action === "REJECTED",
    `${b.status}, ${decisions.map((d) => d.action)}`,
  );
  check("rejection reason stored for the owner", b.rejection_reason?.startsWith("Wrong category."));
  const changesMail = await waitForEmail(
    "changes-requested",
    (m) => m.to.email === users.owner.email,
  );
  check(
    "owner 'changes needed' email has comment and fix link",
    changesMail &&
      changesMail.text.includes("Wrong category.") &&
      changesMail.text.includes(`/business/${ids.LiveEdited}/edit`),
  );
  await ap2.close();

  // -----------------------------------------------------------------------------------
  console.log("\nSuspend, reinstate, re-check, verified, featured");
  await A.go(`/admin/listings/${ids.ReviewOne}`);
  await A.waitText("Actions");
  await A.clickButton("Suspend");
  await ap.waitForSelector("dialog[open]");
  await A.axe("suspend dialog @360px");
  check(
    "suspend reason required",
    await ap.evaluate(
      () =>
        [...document.querySelectorAll("dialog[open] button")].find((b) =>
          b.textContent.includes("Suspend listing"),
        ).disabled,
    ),
  );
  await A.typeInDialog("Customers report this number is unreachable.");
  await A.clickButton("Suspend listing", "dialog");
  check(
    "suspended",
    (await A.waitText("Suspended. The listing is hidden")) &&
      (await one("select status from businesses where id = $1", [ids.ReviewOne])).status ===
        "SUSPENDED",
  );
  check(
    "owner suspension email recorded",
    Boolean(await waitForEmail("listing-suspended", (m) => m.text.includes("unreachable"))),
  );
  await A.clickButton("Reinstate");
  await A.clickButton("Reinstate", "dialog");
  await A.waitText("Reinstated.");
  b = await one("select status, needs_recheck from businesses where id = $1", [ids.ReviewOne]);
  check(
    "reinstated to live (was published) and flagged for re-check",
    b.status === "APPROVED" && b.needs_recheck,
  );
  await A.clickButton("Mark as re-checked");
  await A.waitText("Marked as re-checked.");
  check(
    "re-checked clears needsRecheck, status unchanged",
    (await one("select status, needs_recheck from businesses where id = $1", [ids.ReviewOne]))
      .needs_recheck === false,
  );
  check(
    "no admin Verify toggle any more",
    (await A.buttonState("Verify")) !== "enabled" && !(await A.text()).includes("Verified"),
  );
  await A.clickButton("Feature");
  check("feature shows confirmation", await A.waitText("Featured on."));
  b = await one("select is_featured from businesses where id = $1", [ids.ReviewOne]);
  check("featured set", b.is_featured);
  const hist = (
    await q("select action from moderation_decisions where business_id = $1 order by created_at", [
      ids.ReviewOne,
    ])
  )
    .map((r) => r.action)
    .join(",");
  check("full history recorded", hist === "APPROVED,SUSPENDED,REINSTATED,RECHECKED,FEATURED", hist);
  await A.go(`/admin/listings/${ids.ReviewOne}`);
  check(
    "timeline shows all decisions",
    (await A.waitText("Marked as re-checked")) && (await A.text()).includes("Featured"),
  );
  await A.shot("detail-360");

  // -----------------------------------------------------------------------------------
  console.log("\nSubmission emails and feeRequiredAtSubmit");
  const { page: op } = await newPage({ width: 360, mobile: true });
  const O = helpers(op);
  check("owner logs in", await login(op, users.owner, "/dashboard"));
  for (const [key, on] of [
    ["DraftOff", false],
    ["DraftOn", true],
  ]) {
    await setSwitch(on);
    await O.go(`/business/${ids[key]}/edit?step=5`);
    await (await O.el('main input[name="acceptTerms"]')).evaluate((e) => e.click());
    await op.evaluate(() =>
      [
        ...[...document.querySelectorAll("main form")]
          .filter((f) => f.offsetParent !== null)
          .at(-1)
          .querySelectorAll("button[type=submit]"),
      ]
        .at(-1)
        .click(),
    );
    await op
      .waitForFunction(() => /\/(submitted|pay)$/.test(location.pathname), { timeout: 20000 })
      .catch(() => {});
    const row = await one("select status, fee_required_at_submit from businesses where id = $1", [
      ids[key],
    ]);
    check(
      `submit with fee ${on ? "ON" : "OFF"} -> ${on ? "PENDING_PAYMENT, fee required" : "PENDING_REVIEW, free"}`,
      on
        ? row.status === "PENDING_PAYMENT" && row.fee_required_at_submit
        : row.status === "PENDING_REVIEW" && !row.fee_required_at_submit,
      `${row.status} ${row.fee_required_at_submit}`,
    );
  }
  const adminMail = await waitForEmail("admin-submission", (m) =>
    m.subject.includes("E2E DraftOff"),
  );
  check(
    "admin notified of the submission (recorded, to ADMIN_NOTIFY_EMAIL)",
    adminMail && adminMail.to.email === process.env.ADMIN_NOTIFY_EMAIL,
  );
  check(
    "no admin email for a listing still awaiting payment",
    !outbox().some((m) => m.tag === "admin-submission" && m.subject.includes("E2E DraftOn")),
  );

  // -----------------------------------------------------------------------------------
  console.log("\nSettings");
  await setSwitch(false);
  await A.go("/admin/settings");
  await A.waitText("Require listing fee");
  check(
    "switch shows Off",
    (await ap.$eval('button[role="switch"]', (e) => e.getAttribute("aria-checked"))) === "false",
  );
  await A.axe("settings @360px");
  await (await A.el('button[role="switch"]')).evaluate((e) => e.click());
  const fee = await A.el('main input[type="number"]');
  await fee.evaluate((e) => (e.value = ""));
  await fee.type("7500");
  await A.clickButton("Save changes");
  await ap.waitForSelector("dialog[open]");
  const effectText = await ap.evaluate(() => document.querySelector("dialog[open]").innerText);
  check(
    "confirmation explains the effect",
    effectText.includes("need to pay ₦7,500") && effectText.includes("₦5,000 to ₦7,500"),
  );
  await A.clickButton("Apply now", "dialog");
  await A.waitText("Settings saved");
  let s = await one("select payment_required, listing_fee_naira from app_settings where id = 1");
  check(
    "switch ON and fee ₦7,500 saved immediately",
    s.payment_required === true && s.listing_fee_naira === 7500,
  );
  const changes = await q(
    "select field, old_value, new_value, admin_id from setting_changes where admin_id = $1 order by field",
    [users.admin.id],
  );
  check(
    "who/what/when recorded",
    changes.length === 2 && changes.every((c) => c.admin_id === users.admin.id),
    changes.map((c) => `${c.field}:${c.old_value}->${c.new_value}`).join(", "),
  );
  check("history shows on the page", await A.waitText("Listing fee: ₦5,000 → ₦7,500"));
  await (await A.el('button[role="switch"]')).evaluate((e) => e.click());
  const fee2 = await A.el('main input[type="number"]');
  await fee2.evaluate((e) => (e.value = ""));
  await fee2.type(String(original.listing_fee_naira));
  await A.clickButton("Save changes");
  await ap.waitForSelector("dialog[open]");
  await A.clickButton("Apply now", "dialog");
  for (let i = 0; i < 30; i++) {
    s = await one("select payment_required, listing_fee_naira from app_settings where id = 1");
    if (s.payment_required === false) break;
    await sleep(500);
  }
  check(
    "switch turned back OFF",
    s.payment_required === false && s.listing_fee_naira === original.listing_fee_naira,
  );

  // -----------------------------------------------------------------------------------
  console.log("\nNon-admins can't run admin actions (replayed requests)");
  const flagCall = capturedActions.find((c) => c.body?.includes('"featured"'));
  check("captured an admin action request", Boolean(flagCall));
  const unfeature = flagCall.body.replace('"value":true', '"value":false');
  const replay = {
    "next-action": flagCall.headers["next-action"],
    "content-type": flagCall.headers["content-type"],
    accept: "text/x-component",
  };
  const anonRes = await fetch(flagCall.url, { method: "POST", headers: replay, body: unfeature });
  check("signed-out replay -> 404", anonRes.status === 404, String(anonRes.status));
  const nonAdminStatus = await np.evaluate(
    async ({ url, headers, body }) => (await fetch(url, { method: "POST", headers, body })).status,
    { url: flagCall.url, headers: replay, body: unfeature },
  );
  check("non-admin replay on /admin -> 404", nonAdminStatus === 404, String(nonAdminStatus));
  const nonAdminOther = await np.evaluate(
    async ({ headers, body }) => {
      const r = await fetch("/", { method: "POST", headers, body });
      return { status: r.status, text: await r.text() };
    },
    { headers: replay, body: unfeature },
  );
  check(
    "replay on a non-admin page does not run the action",
    !nonAdminOther.text.includes('"ok":true'),
    `HTTP ${nonAdminOther.status}`,
  );

  // Revoked admin: their token still says admin (so the proxy lets them through), but the
  // database role is CUSTOMER. Only requireAdmin() in the page and action can stop them.
  const { page: rp } = await newPage({ width: 1280 });
  const R = helpers(rp);
  check("revoked admin logs in", await login(rp, users.revoked, "/account"));
  await R.go("/admin");
  check(
    "revoked admin sees 404 page, no admin content",
    (await R.waitText("We couldn't find that page", 10000)) &&
      !(await R.text()).includes("signed in as"),
  );
  const revokedReplay = await rp.evaluate(
    async ({ url, headers, body }) => {
      const r = await fetch(url, { method: "POST", headers, body });
      return { status: r.status, text: (await r.text()).slice(0, 2000) };
    },
    { url: flagCall.url, headers: replay, body: unfeature },
  );
  check(
    "revoked admin's action is refused by requireAdmin()",
    revokedReplay.status === 404 || revokedReplay.text.includes("404"),
    String(revokedReplay.status),
  );
  check(
    "listing unchanged (still featured)",
    (await one("select is_featured from businesses where id = $1", [ids.ReviewOne])).is_featured ===
      true,
  );

  // -----------------------------------------------------------------------------------
  console.log("\nDesktop layout");
  const { page: dp } = await newPage({ width: 1280, ctx: actx });
  const D = helpers(dp);
  await D.go(`/admin/listings/${ids.FeeUnpaid}`);
  await D.waitText("Moderation history");
  await D.axe("detail @1280px");
  await D.shot("detail-1280");
  await D.go("/admin/listings?tab=live");
  await D.axe("listings @1280px");

  console.log("\nEmails");
  const all = outbox();
  const allowed = new Set([users.owner.email, process.env.ADMIN_NOTIFY_EMAIL]);
  check(
    `all ${all.length} emails went to the test outbox, none to unexpected recipients`,
    all.length >= 4 && all.every((m) => allowed.has(m.to.email)),
  );
} finally {
  console.log("\nCleanup");
  const userIds = Object.values(users)
    .map((u) => u.id)
    .filter(Boolean);
  await q("update app_settings set payment_required = $1, listing_fee_naira = $2 where id = 1", [
    original.payment_required,
    original.listing_fee_naira,
  ]);
  await q("delete from payments where user_id = any($1::uuid[])", [userIds]);
  const del = await db.query("delete from businesses where owner_id = any($1::uuid[])", [userIds]);
  await q("delete from setting_changes where admin_id = any($1::uuid[])", [userIds]);
  await q(
    "delete from identity_verifications where user_id = any($1::uuid[]) or reviewed_by_id = any($1::uuid[])",
    [userIds],
  );
  await q("delete from profiles where id = any($1::uuid[])", [userIds]);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  const left = (await one("select count(*)::int n from profiles where email like 'chf-e2e-%'")).n;
  const s = await one("select payment_required from app_settings where id = 1");
  check(
    `deleted ${del.rowCount} test listings, test users and settings log; fee switch ${s.payment_required ? "ON" : "OFF"}`,
    left === 0 && s.payment_required === original.payment_required,
  );
  if (fs.existsSync(outboxFile)) fs.unlinkSync(outboxFile);
  await db.end();
  await browser.close();
}

console.log(`\nResult: ${failures === 0 ? "PASS" : `${failures} failure(s)`}`);
process.exitCode = failures ? 1 : 0;
