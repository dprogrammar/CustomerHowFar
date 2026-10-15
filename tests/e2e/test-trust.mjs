// End-to-end test of reviews, reports, the contact form and the information pages.
// Real DB/Supabase; emails go to a test outbox. Only data created here is touched.
// Usage: node test-trust.mjs <projectDir> <baseUrl> <outboxFile> <shotsDir>
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { axeSource, browserPath } from "./lib/setup.mjs";

const [projectDir, baseUrl, outboxFile, shotsDir] = process.argv.slice(2);
// Operator details shown on the contact and legal pages, read from the app's config (not
// hard-coded in tests).
const legal = fs.readFileSync(path.join(projectDir, "src/config/legal.ts"), "utf8");
const OPERATED_BY = legal.match(/operatedBy: "([^"]+)"/)[1];
const CONTACT_EMAIL = legal.match(/email: "([^"]+)"/)[1];
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
db.on("error", (e) => console.log("  (db pool error:", e.code, ")"));
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
  owner2: mk("owner2", "Bisi Owner", "BUSINESS_OWNER"),
  rev1: mk("rev1", "Rita Reviewer", "CUSTOMER"),
  rev2: mk("rev2", "Sam Second", "CUSTOMER"),
  rev3: mk("rev3", "Tunde Third", "CUSTOMER"),
  unconf: mk("unconf", "Uche Unconfirmed", "CUSTOMER"),
  reporter: mk("reporter", "Remi Reporter", "CUSTOMER"),
  admin: mk("admin", "Ade Admin", "ADMIN"),
};
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
      await sleep(700);
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
    click: async (label, scope = "main") => {
      await page
        .waitForFunction(
          (l, s) =>
            [...document.querySelectorAll(`${s} button, ${s} a`)].some(
              (b) =>
                (b.offsetParent !== null || b.closest("dialog[open]")) &&
                !b.disabled &&
                b.textContent.trim().startsWith(l),
            ),
          { timeout: 15000 },
          label,
          scope,
        )
        .catch(() => {});
      const ok = await page.evaluate(
        (l, s) => {
          const b = [...document.querySelectorAll(`${s} button, ${s} a`)].find(
            (x) =>
              (x.offsetParent !== null || x.closest("dialog[open]")) &&
              !x.disabled &&
              x.textContent.trim().startsWith(l),
          );
          if (!b) return false;
          b.click();
          return true;
        },
        label,
        scope,
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
      await el.evaluate((e, v) => {
        const proto =
          e instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(e, v);
        e.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
      await sleep(100);
    },
    rate: async (n) =>
      page.evaluate(
        (n) =>
          [...document.querySelectorAll('main form[aria-label] input[type="radio"]')][
            n - 1
          ].click(),
        n,
      ),
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
      page.screenshot({ path: path.join(shotsDir, `trust-${name}.png`), fullPage: true }),
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
async function insertBusiness(key, ownerKey) {
  const id = crypto.randomUUID();
  ids[key] = id;
  slugs[key] = `e2e-tr-${run}-${key.toLowerCase()}`;
  const cat = (await one("select id from categories where slug = 'fashion-tailoring'")).id;
  const state = (await one("select id from states where slug = 'lagos'")).id;
  const lga = (await one("select id from lgas where state_id = $1 and slug = 'ikeja'", [state])).id;
  await q(
    `insert into businesses (id, owner_id, name, slug, category_id, tagline, phone, whatsapp_number, address, state_id, lga_id, description, status, submitted_at, published_at, updated_at)
     values ($1,$2,$3,$4,$5,'Trusttest tailoring','+2348038880000','+2348038880000','1 Test Street',$6,$7,'A complete description of more than thirty characters for testing.', 'APPROVED', now(), now(), now())`,
    [id, users[ownerKey].id, `E2E Trusttest ${key} ${run}`, slugs[key], cat, state, lga],
  );
}
const rating = (key) =>
  one("select rating_average::float8 avg, review_count n from businesses where id = $1", [
    ids[key],
  ]);
const contact = (userKey, key) =>
  q("insert into contact_events (business_id, type, user_id) values ($1, 'CALL', $2)", [
    ids[key],
    users[userKey].id,
  ]);

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
  for (const k of ["owner", "owner2"])
    await q(
      "insert into identity_verifications (id, user_id, id_type, full_name_on_id, consent_given_at, status, reviewed_at, submitted_at, updated_at) values (gen_random_uuid(), $1, 'NIN_SLIP', $2, now(), 'APPROVED', now(), now(), now())",
      [users[k].id, users[k].name],
    );
  await insertBusiness("Biz", "owner");
  await insertBusiness("HiOne", "owner2");
  await insertBusiness("HiMany", "owner2");
  await contact("rev2", "Biz");
  await contact("rev3", "Biz");
  await contact("unconf", "Biz");
  if (fs.existsSync(outboxFile)) fs.unlinkSync(outboxFile);
  check("test users and businesses created", Object.keys(ids).length === 3);

  // -------------------------------------------------------------------------------------
  console.log("\nReview eligibility");
  const pub = await newPage();
  const P = helpers(pub);
  await P.go(`/business/${slugs.Biz}`);
  check(
    "logged out: prompt to log in, no form",
    (await P.waitText("Log in to write a review")) &&
      !(await pub.$('main form[aria-label="Write a review"]')),
  );
  check(
    "safety tips linked near the contact buttons",
    (await pub.$('main a[href="/safety"]')) !== null,
  );
  check("report link asks to log in", (await P.text()).includes("Log in to report this business"));

  const r1 = await newPage();
  const R1 = helpers(r1);
  const r1Calls = recorder(r1);
  check("reviewer logs in", await login(r1, users.rev1, `/business/${slugs.Biz}`));
  check(
    "no contact yet: explains the rule, no form",
    (await R1.waitText("after contacting it through CustomerHowFar")) &&
      !(await r1.$('main form[aria-label="Write a review"]')),
  );
  r1.on("popup", (p) => p.close().catch(() => {}));
  await r1.evaluate(() =>
    [...document.querySelectorAll('a[href^="tel:"]')].find((a) => a.offsetParent !== null).click(),
  );
  let tracked = false;
  for (let i = 0; i < 20 && !tracked; i++) {
    tracked = Boolean(
      await one("select 1 from contact_events where business_id = $1 and user_id = $2", [
        ids.Biz,
        users.rev1.id,
      ]),
    );
    if (!tracked) await sleep(500);
  }
  check("tapping Call while logged in records a contact event", tracked);
  await R1.go(`/business/${slugs.Biz}`);
  check(
    "after contacting: review form shown",
    await r1.waitForSelector('main form[aria-label="Write a review"]', { timeout: 15000 }).then(
      () => true,
      () => false,
    ),
  );
  await R1.axe("business page with review form");
  await R1.shot("review-form-360");

  console.log("\nWrite, edit and delete reviews (rating sync)");
  await R1.rate(4);
  await R1.type('main form[aria-label="Write a review"] textarea', "Too short");
  await R1.click("Post review");
  check("comment under 20 characters refused", await R1.waitText("Write at least 20 characters"));
  await R1.type(
    'main form[aria-label="Write a review"] textarea',
    "Good tailoring, finished my agbada on time and the fit was neat.",
  );
  await R1.click("Post review");
  const posted = await R1.waitText("Your review is live");
  check(
    "review posted",
    posted,
    posted
      ? ""
      : (
          await r1.evaluate(
            () => document.querySelector("main form[aria-label]")?.innerText ?? "no form",
          )
        )
          .split(String.fromCharCode(10))
          .join(" | ")
          .slice(0, 400),
  );
  let rt = await rating("Biz");
  check("rating synced on create (4.0, 1 review)", rt.avg === 4 && rt.n === 1, JSON.stringify(rt));
  const newReview = await waitEmail("new-review", (m) => m.to.email === users.owner.email);
  check(
    "owner emailed about the new review (test outbox)",
    Boolean(newReview) && newReview.text.includes("agbada"),
  );
  await R1.go(`/business/${slugs.Biz}`);
  let t = await R1.text();
  check(
    "summary, breakdown and reviewer name (first name + initial) shown",
    t.includes("4.0") &&
      t.includes("1 review") &&
      t.includes("Rita R.") &&
      !t.includes("Rita Reviewer"),
  );

  const r2 = await newPage();
  const R2 = helpers(r2);
  check("second reviewer logs in", await login(r2, users.rev2, `/business/${slugs.Biz}`));
  await r2.waitForSelector('main form[aria-label="Write a review"]', { timeout: 15000 });
  await R2.rate(5);
  await R2.type(
    'main form[aria-label="Write a review"] textarea',
    "Excellent work and very polite. Will use them again for my wedding.",
  );
  await R2.click("Post review");
  await R2.waitText("Your review is live");
  rt = await rating("Biz");
  check("rating synced (4.5, 2 reviews)", rt.avg === 4.5 && rt.n === 2, JSON.stringify(rt));
  await R1.go(`/business/${slugs.Biz}`);
  await r1.waitForSelector('main form[aria-label="Edit your review"]', { timeout: 15000 });
  await R1.rate(2);
  await R1.click("Update review");
  check("review edited", await R1.waitText("Your review has been updated"));
  rt = await rating("Biz");
  check("rating synced on edit (3.5)", rt.avg === 3.5 && rt.n === 2, JSON.stringify(rt));
  await R2.go(`/business/${slugs.Biz}`);
  await r2.waitForSelector('main form[aria-label="Edit your review"]', { timeout: 15000 });
  await R2.click("Delete review");
  await R2.click("Delete review", "dialog[open]");
  check("review deleted", await R2.waitText("Your review has been deleted"));
  rt = await rating("Biz");
  check("rating synced on delete (2.0, 1 review)", rt.avg === 2 && rt.n === 1, JSON.stringify(rt));
  await R2.go(`/business/${slugs.Biz}`);
  await r2.waitForSelector('main form[aria-label="Write a review"]', { timeout: 15000 });
  await R2.rate(5);
  await R2.type(
    'main form[aria-label="Write a review"] textarea',
    "Excellent work and very polite. Will use them again for my wedding.",
  );
  await R2.click("Post review");
  await R2.waitText("Your review is live");
  check(
    "one review per user (re-posting after delete)",
    (
      await one("select count(*)::int n from reviews where business_id = $1 and user_id = $2", [
        ids.Biz,
        users.rev2.id,
      ])
    ).n === 1,
  );
  rt = await rating("Biz");
  check("rating 3.5 from 2 reviews", rt.avg === 3.5 && rt.n === 2);

  console.log("\nForged review requests");
  const saveCall = r1Calls.find((c) => c.body?.includes("agbada"));
  const own = await newPage();
  const O = helpers(own);
  const ownerCalls = recorder(own);
  check("owner logs in", await login(own, users.owner, `/business/${slugs.Biz}`));
  check(
    "owner sees no review form",
    (await O.waitText("This is your business")) &&
      !(await own.$('main form[aria-label="Write a review"]')),
  );
  const ownForged = await replay(own, saveCall, saveCall.body);
  check(
    "owner can't review their own business",
    ownForged.includes("can't review your own business") && (await rating("Biz")).n === 2,
  );
  const un = await newPage();
  const U = helpers(un);
  check("unconfirmed-email user logs in", await login(un, users.unconf, `/business/${slugs.Biz}`));
  await q("update auth.users set email_confirmed_at = null where id = $1", [users.unconf.id]);
  await U.go(`/business/${slugs.Biz}`);
  check(
    "unconfirmed email: no form, explains why",
    (await U.waitText("Confirm your email address to write a review")) &&
      !(await un.$('main form[aria-label="Write a review"]')),
  );
  const unForged = await replay(un, saveCall, saveCall.body);
  check("server refuses unconfirmed email", unForged.includes("confirm your email"));
  const noContactUser = await newPage();
  check("user without contact logs in", await login(noContactUser, users.reporter, "/account"));
  const ncForged = await replay(noContactUser, saveCall, saveCall.body);
  check(
    "server refuses a user who never contacted the business",
    ncForged.includes("after contacting it"),
  );
  await q(
    "insert into rate_limit_hits (key, created_at) select $1, now() from generate_series(1, 5)",
    [`review:${users.rev3.id}`],
  );
  const r3 = await newPage();
  check("third reviewer logs in", await login(r3, users.rev3, "/account"));
  const limited = await replay(r3, saveCall, saveCall.body);
  check("review submissions are rate limited per user", limited.includes("Too many attempts"));

  console.log("\nOwner replies");
  await O.go(`/business/${slugs.Biz}`);
  await O.waitText("Rita R.");
  await O.click("Reply");
  await O.type("main textarea", "Thank you Rita! Sorry about the delay, we have added more staff.");
  await O.click("Save reply");
  check("reply posted", await O.waitText("Reply posted"));
  await P.go(`/business/${slugs.Biz}`);
  check(
    "reply shown publicly",
    (await P.waitText(`Reply from E2E Trusttest Biz ${run}`)) &&
      (await P.text()).includes("added more staff"),
  );
  await O.go(`/business/${slugs.Biz}`);
  await O.waitText("Edit your reply");
  await O.click("Edit your reply");
  await O.type("main textarea", "Thank you Rita! We have added more staff so jobs finish on time.");
  await O.click("Save reply");
  check(
    "reply edited",
    (await O.waitText("Reply updated")) &&
      (
        await one(
          "select count(*)::int n from reviews where business_id = $1 and owner_reply like '%finish on time%'",
          [ids.Biz],
        )
      ).n === 1,
  );
  await O.axe("owner view with reply form");
  const replyCall = ownerCalls.find((c) => c.body?.includes("finish on time"));
  const forgedReply = await replay(
    r1,
    replyCall,
    replyCall.body.replace("finish on time", "hacked"),
  );
  check(
    "non-owners can't reply",
    forgedReply.includes("only reply to reviews of your own business"),
  );

  // -------------------------------------------------------------------------------------
  console.log("\nReport a review; admin hide / restore / dismiss");
  const rp = await newPage();
  const RP = helpers(rp);
  check("reporter logs in", await login(rp, users.reporter, `/business/${slugs.Biz}`));
  await RP.waitText("Rita R.");
  await rp.evaluate(() =>
    [...document.querySelectorAll("main article")]
      .find((a) => a.innerText.includes("Rita R."))
      .querySelector("button")
      .click(),
  );
  await rp.waitForSelector("dialog[open]");
  check(
    "report needs a reason",
    (await RP.buttonState("Send report", "dialog[open]")) === "disabled",
  );
  await RP.axe("report review dialog");
  await rp.click('dialog[open] input[value="FAKE"]');
  await RP.click("Send report", "dialog[open]");
  check("review reported", await RP.waitText("Our team will review this report"));
  const reviewRita = (
    await one("select id from reviews where business_id = $1 and user_id = $2", [
      ids.Biz,
      users.rev1.id,
    ])
  ).id;
  check(
    "report stored OPEN",
    (
      await one("select status from review_reports where review_id = $1 and reporter_id = $2", [
        reviewRita,
        users.reporter.id,
      ])
    )?.status === "OPEN",
  );
  await RP.go(`/business/${slugs.Biz}`);
  await RP.waitText("Rita R.");
  await rp.evaluate(() =>
    [...document.querySelectorAll("main article")]
      .find((a) => a.innerText.includes("Rita R."))
      .querySelector("button")
      .click(),
  );
  await rp.waitForSelector("dialog[open]");
  await rp.click('dialog[open] input[value="SPAM"]');
  await RP.click("Send report", "dialog[open]");
  check("one open report per user per review", await RP.waitText("already reported this review"));
  await R2.go(`/business/${slugs.Biz}`);
  await R2.waitText("Rita R.");
  await r2.evaluate(() =>
    [...document.querySelectorAll("main article")]
      .find((a) => a.innerText.includes("Rita R."))
      .querySelector("button")
      .click(),
  );
  await r2.waitForSelector("dialog[open]");
  await r2.click('dialog[open] input[value="NOT_A_CUSTOMER"]');
  await R2.click("Send report", "dialog[open]");
  await R2.waitText("Our team will review this report");

  const ap = await newPage();
  const A = helpers(ap);
  check("admin logs in", await login(ap, users.admin, "/admin"));
  check(
    "overview shows reported reviews and listings",
    (await A.waitText("Reported reviews")) && (await A.text()).includes("Reported listings"),
  );
  check(
    "admin nav has Reports",
    (await ap.$('nav[aria-label="Admin"] a[href="/admin/reports"]')) !== null,
  );
  await A.go("/admin/reports?tab=reviews");
  t = await A.text();
  check(
    "reported reviews queue lists the review with reasons",
    t.includes(`E2E Trusttest Biz ${run}`) &&
      t.includes("2 open reports") &&
      t.includes("Fake review") &&
      t.includes("Not a real customer"),
  );
  await A.axe("admin reported reviews");
  await A.shot("admin-reports-360");
  await A.click("Hide review");
  await A.click("Hide review", "dialog[open]");
  check("hidden", await A.waitText("Review hidden"));
  rt = await rating("Biz");
  check(
    "hidden review no longer counts (5.0, 1 review)",
    rt.avg === 5 && rt.n === 1,
    JSON.stringify(rt),
  );
  check(
    "its reports closed as ACTIONED",
    (await q("select status from review_reports where review_id = $1", [reviewRita])).every(
      (r) => r.status === "ACTIONED",
    ),
  );
  check(
    "admin action recorded",
    Boolean(
      await one(
        "select 1 from admin_audit_log where target_review_id = $1 and action = 'REVIEW_HIDDEN' and actor_id = $2",
        [reviewRita, users.admin.id],
      ),
    ),
  );
  await P.go(`/business/${slugs.Biz}`);
  check(
    "hidden review not shown publicly",
    (await P.waitText("Sam S.")) && !(await P.text()).includes("Rita R."),
  );
  await R1.go(`/business/${slugs.Biz}`);
  check("the author still sees it, marked hidden", await R1.waitText("hidden your review"));
  await A.go("/admin/reports?tab=hidden");
  await A.click("Restore review");
  await A.click("Restore review", "dialog[open]");
  check("restored", await A.waitText("Review restored"));
  rt = await rating("Biz");
  check(
    "restored review counts again (3.5, 2 reviews)",
    rt.avg === 3.5 && rt.n === 2,
    JSON.stringify(rt),
  );
  // Another report, dismissed.
  await RP.go(`/business/${slugs.Biz}`);
  await RP.waitText("Sam S.");
  await rp.evaluate(() =>
    [...document.querySelectorAll("main article")]
      .find((a) => a.innerText.includes("Sam S."))
      .querySelector("button")
      .click(),
  );
  await rp.waitForSelector("dialog[open]");
  await rp.click('dialog[open] input[value="OFFENSIVE"]');
  await RP.click("Send report", "dialog[open]");
  await RP.waitText("Our team will review this report");
  await A.go("/admin/reports?tab=reviews");
  await A.waitText("Offensive or abusive");
  await A.click("Dismiss reports");
  await A.click("Dismiss reports", "dialog[open]");
  check(
    "reports dismissed, review stays",
    (await A.waitText("Reports dismissed")) &&
      (await rating("Biz")).n === 2 &&
      Boolean(
        await one(
          "select 1 from admin_audit_log where action = 'REVIEW_REPORTS_DISMISSED' and target_business_id = $1",
          [ids.Biz],
        ),
      ),
  );

  // -------------------------------------------------------------------------------------
  console.log("\nHighest rated sort");
  const addReview = async (key, userKey, stars) =>
    q(
      "insert into reviews (id, business_id, user_id, rating, comment, updated_at) values (gen_random_uuid(), $1, $2, $3, 'Seeded review for the ranking test, long enough.', now())",
      [ids[key], users[userKey].id, stars],
    );
  await addReview("HiOne", "rev1", 5);
  for (const [u, s] of [
    ["rev1", 5],
    ["rev2", 5],
    ["rev3", 4],
  ])
    await addReview("HiMany", u, s);
  for (const k of ["HiOne", "HiMany"])
    await q(
      "update businesses b set review_count = s.n, rating_average = s.avg from (select count(*)::int n, round(avg(rating)::numeric, 2) avg from reviews where business_id = $1 and status = 'PUBLISHED') s where b.id = $1",
      [ids[k]],
    );
  await P.go(`/search?q=${encodeURIComponent(`Trusttest ${run}`)}&sort=rated`);
  const names = await pub.evaluate(() =>
    [...document.querySelectorAll("main article h3")]
      .filter((e) => e.offsetParent !== null)
      .map((e) => e.textContent.trim()),
  );
  const iMany = names.findIndex((n) => n.includes("HiMany"));
  const iOne = names.findIndex((n) => n.includes("HiOne"));
  check(
    "many 4.67 reviews rank above one 5-star review",
    iMany !== -1 && iOne !== -1 && iMany < iOne,
    names.join(" | "),
  );
  const card = await pub.evaluate(
    () =>
      [...document.querySelectorAll("main article")].find((a) => a.innerText.includes("HiMany"))
        ?.innerText ?? "",
  );
  check("cards show stars and review count", card.includes("4.7") && card.includes("(3"));
  check(
    "sort option offered",
    (await pub.$('select[name="sort"] option[value="rated"]')) !== null ||
      (await P.text()).includes("Highest rated"),
  );
  await P.axe("search sorted by rating");

  // -------------------------------------------------------------------------------------
  console.log("\nReport a listing");
  await RP.go(`/business/${slugs.Biz}`);
  await RP.click("Report this business");
  await rp.waitForSelector("dialog[open]");
  await rp.click('dialog[open] input[value="OTHER"]');
  check(
    "'Something else' needs details",
    (await RP.buttonState("Send report", "dialog[open]")) === "disabled",
  );
  await RP.axe("report business dialog");
  await RP.type(
    "dialog[open] textarea",
    "They asked me to pay a registration fee before any work.",
  );
  await RP.click("Send report", "dialog[open]");
  check("listing reported", await RP.waitText("Thanks for telling us"));
  check(
    "admin emailed about the report (test outbox)",
    Boolean(
      await waitEmail(
        "admin-listing-report",
        (m) => m.to.email === process.env.ADMIN_NOTIFY_EMAIL && m.text.includes("registration fee"),
      ),
    ),
  );
  await RP.go(`/business/${slugs.Biz}`);
  await RP.click("Report this business");
  await rp.waitForSelector("dialog[open]");
  await rp.click('dialog[open] input[value="SCAM"]');
  await RP.click("Send report", "dialog[open]");
  check(
    "one open report per user per business",
    await rp
      .waitForFunction(
        () =>
          (document.querySelector("dialog[open]")?.innerText ?? "").includes(
            "already reported this business",
          ),
        { timeout: 15000 },
      )
      .then(
        () => true,
        () => false,
      ),
  );
  await O.go(`/business/${slugs.Biz}`);
  check(
    "owners can't report their own business",
    (await O.waitText("Reviews")) && !(await O.text()).includes("Report this business"),
  );
  await A.go("/admin/reports?tab=listings");
  t = await A.text();
  check(
    "reported listings queue shows the listing and report",
    t.includes(`E2E Trusttest Biz ${run}`) &&
      t.includes("Something else") &&
      t.includes("registration fee") &&
      t.includes("Remi Reporter"),
  );
  await A.axe("admin reported listings");
  await A.click("Dismiss");
  await A.click("Dismiss reports", "dialog[open]");
  check(
    "dismissed",
    (await A.waitText("Reports dismissed. The listing stays")) &&
      (await one("select status from business_reports where business_id = $1", [ids.Biz]))
        .status === "DISMISSED",
  );
  // A new report after dismissal -> suspend listing.
  await RP.go(`/business/${slugs.Biz}`);
  await RP.click("Report this business");
  await rp.waitForSelector("dialog[open]");
  await rp.click('dialog[open] input[value="SCAM"]');
  await RP.click("Send report", "dialog[open]");
  await RP.waitText("Thanks for telling us");
  await A.go("/admin/reports?tab=listings");
  await A.click("Suspend listing");
  await ap.waitForSelector("dialog[open]");
  check(
    "suspend needs a reason",
    (await A.buttonState("Suspend listing", "dialog[open]")) === "disabled",
  );
  await A.type("dialog[open] textarea", "Several customers report advance-fee requests.");
  await A.click("Suspend listing", "dialog[open]");
  check(
    "listing suspended",
    (await A.waitText("Listing suspended and the owner emailed")) &&
      (await one("select status from businesses where id = $1", [ids.Biz])).status === "SUSPENDED",
  );
  check(
    "owner emailed (test outbox)",
    Boolean(await waitEmail("listing-suspended", (m) => m.to.email === users.owner.email)),
  );
  check(
    "report ACTIONED and recorded",
    (
      await one(
        "select count(*)::int n from business_reports where business_id = $1 and status = 'ACTIONED'",
        [ids.Biz],
      )
    ).n === 1 &&
      Boolean(
        await one(
          "select 1 from admin_audit_log where action = 'LISTING_REPORTS_ACTIONED' and target_business_id = $1",
          [ids.Biz],
        ),
      ),
  );
  // Suspend the owner of another listing.
  await RP.go(`/business/${slugs.HiOne}`);
  await RP.click("Report this business");
  await rp.waitForSelector("dialog[open]");
  await rp.click('dialog[open] input[value="FAKE_PHOTOS"]');
  await RP.click("Send report", "dialog[open]");
  await RP.waitText("Thanks for telling us");
  await A.go("/admin/reports?tab=listings");
  await A.waitText(`E2E Trusttest HiOne ${run}`);
  await A.click("Suspend owner");
  await A.type("dialog[open] textarea", "Uses stolen photos across several listings.");
  await A.click("Suspend owner", "dialog[open]");
  check(
    "owner suspended from the report",
    (await A.waitText("Owner suspended")) &&
      (await one("select status from profiles where id = $1", [users.owner2.id])).status ===
        "SUSPENDED" &&
      (await one("select status from businesses where id = $1", [ids.HiMany])).status ===
        "SUSPENDED",
  );

  // -------------------------------------------------------------------------------------
  console.log("\nContact form");
  const cp = await newPage();
  const C = helpers(cp);
  await C.go("/contact");
  check("contact page shows the email address", (await C.text()).includes(CONTACT_EMAIL));
  await C.axe("contact page");
  await C.click("Send message");
  check("validation errors", await C.waitText("Enter your name"));
  const fill = async (subject) => {
    await C.type('main input[name="name"]', "Test Sender");
    await C.type('main input[name="email"]', `chf-e2e-${run}-sender@example.com`);
    await C.type('main input[name="subject"]', subject);
    await C.type("main textarea", "Hello, this is a test message from the automated test suite.");
  };
  await fill(`Hello ${run}`);
  await C.click("Send message");
  check("message sent", await C.waitText("Your message has been sent"));
  const msg = await waitEmail("contact-form", (m) => m.subject.includes(`Hello ${run}`));
  check(
    "emailed to ADMIN_NOTIFY_EMAIL with reply-to set to the sender (test outbox)",
    msg &&
      msg.to.email === process.env.ADMIN_NOTIFY_EMAIL &&
      msg.replyTo?.email === `chf-e2e-${run}-sender@example.com`,
  );
  await C.go("/contact");
  await fill(`Bot ${run}`);
  await cp.evaluate(() => {
    document.querySelector('input[name="website"]').value = "http://spam.example";
  });
  await C.click("Send message");
  await C.waitText("Your message has been sent");
  await sleep(1000);
  check(
    "honeypot: bot sees success, nothing is sent",
    !outbox().some((m) => m.subject?.includes(`Bot ${run}`)),
  );
  let limitedMsg = false;
  for (let i = 0; i < 4 && !limitedMsg; i++) {
    await C.go("/contact");
    await fill(`Again ${run} ${i}`);
    await C.click("Send message");
    await sleep(1500);
    limitedMsg = (await C.text()).includes("Too many attempts");
  }
  check("contact form is rate limited", limitedMsg);

  // -------------------------------------------------------------------------------------
  console.log("\nInformation pages and footer links");
  for (const [p, h1, extra] of [
    ["/terms", "Terms of Service", "Last updated"],
    ["/privacy", "Privacy Policy", "Last updated"],
    ["/about", "About CustomerHowFar", "mission"],
    ["/help", "Help centre", "For businesses"],
    ["/safety", "Stay safe", "full price upfront"],
  ]) {
    const res = await P.go(p);
    t = await P.text();
    check(`${p} renders`, res.status() === 200 && t.includes(h1) && t.includes(extra));
    await P.axe(p);
  }
  await P.go("/terms");
  t = await P.text();
  check(
    "terms cover the key points",
    [
      "not a party to any deal",
      "not refundable",
      "not an official government verification",
      "Reviews",
      "laws of the Federal Republic of Nigeria",
      OPERATED_BY,
      CONTACT_EMAIL,
    ].every((s) => t.includes(s)),
  );
  await P.go("/privacy");
  t = await P.text();
  check(
    "privacy covers the key points",
    [
      "Nigeria Data Protection Act",
      "Supabase",
      "Vercel",
      "Cloudinary",
      "Brevo",
      "Europe",
      "90 days",
      "Delete my account",
      "under 18",
      "Cookies",
      "anonymized",
    ].every((s) => t.includes(s)),
  );
  await P.go("/help#report-a-problem");
  check(
    "help anchors open the right answer",
    await pub.evaluate(() => document.getElementById("report-a-problem")?.open === true),
  );
  await P.go("/signup");
  check(
    "sign-up terms checkbox links to both pages",
    (await pub.$('main a[href="/terms"]')) !== null &&
      (await pub.$('main a[href="/privacy"]')) !== null,
  );
  await P.go("/");
  const links = await pub.evaluate(() =>
    [...document.querySelectorAll("footer a")].map((a) => a.getAttribute("href")),
  );
  check("footer has Terms and Privacy", links.includes("/terms") && links.includes("/privacy"));
  const broken = [];
  for (const href of [...new Set(links)].filter((h) => h.startsWith("/"))) {
    const [p, hash] = href.split("#");
    const res = await pub.goto(baseUrl + (p || "/"), { waitUntil: "load" });
    let ok =
      res.status() < 400 &&
      !(await pub.evaluate(() =>
        /could not be found|page not found/i.test(document.querySelector("main")?.innerText ?? ""),
      ));
    if (ok && hash) ok = await pub.evaluate((h) => Boolean(document.getElementById(h)), hash);
    if (!ok) broken.push(`${href} (${res.status()})`);
  }
  check(
    "no footer link leads to a 404 or a missing anchor",
    broken.length === 0,
    broken.join(", "),
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
  const idList = Object.values(users)
    .map((u) => u.id)
    .filter(Boolean);
  const bizIds = Object.values(ids);
  await q(
    "delete from admin_audit_log where actor_id = any($1::uuid[]) or target_user_id = any($1::uuid[]) or target_business_id = any($2::uuid[])",
    [idList, bizIds],
  );
  await q("delete from rate_limit_hits where created_at >= $1", [testStart]);
  await q("delete from identity_verifications where user_id = any($1::uuid[])", [idList]);
  await q("delete from businesses where owner_id = any($1::uuid[])", [idList]);
  await q("delete from profiles where id = any($1::uuid[])", [idList]);
  for (const id of idList) await admin.auth.admin.deleteUser(id).catch(() => {});
  await browser.close();
  await db.end();
  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
