// Owner journey: the progress tracker (dashboard, wizard, sent-for-review page), the ID check page
// for every state, the shared ID status labels, the "Continue" destinations, withdraw, the new
// owner notification on sending a listing, that nothing can be faked from the browser,
// accessibility and 360px/desktop layouts. DEV database only; creates its own users and listings
// and deletes them. Usage: node test-owner-progress.mjs <projectDir> <baseUrl> <outboxFile> <shotsDir>
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { axeSource, browserPath } from "./lib/setup.mjs";

const [projectDir, baseUrl, outboxArg, shotsDir] = process.argv.slice(2);
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
const mk = (key, name) => ({ email: `chf-e2e-${run}-${key}@example.com`, password: pw(), name });
const users = { owner: mk("owner", "Ola Owner"), empty: mk("empty", "Emeka Empty") };
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CLD = process.env.CLOUDINARY_FOLDER || "customerhowfar";

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

const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true });
let ipN = 10;
async function newPage({ width = 360, js = true } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setUserAgent(width < 768 ? ANDROID_UA : DESKTOP_UA);
  if (width < 768) await page.setViewport({ width, height: 800, isMobile: true, hasTouch: true });
  else await page.setViewport({ width, height: 900 });
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.233.${ipN++}.4` });
  await page.setJavaScriptEnabled(js);
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message.slice(0, 120)));
  return page;
}
const go = async (page, p) => {
  const res = await page.goto(baseUrl + p, { waitUntil: "load" });
  await sleep(700);
  return res;
};
const mainText = (page) => page.evaluate(() => document.querySelector("main").innerText);
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

/** What a business card's tracker shows: current stage, every stage's spoken text and the button. */
const trackerOf = (page, businessId) =>
  page.evaluate((id) => {
    const root = id ? document.getElementById(`business-${id}`) : document;
    const section = root?.querySelector("section[aria-label]");
    if (!section) return null;
    const items = [...section.querySelectorAll("ol > li")];
    const cur = items.find((li) => li.getAttribute("aria-current") === "step");
    const link = [...section.querySelectorAll("a")].find((a) => a.offsetParent !== null);
    return {
      // Each stage is [icon, label (short + full), spoken note]: read the full label.
      currentLabel: cur?.children[1]?.children[1]?.textContent.trim() ?? null,
      stages: items.map((li) => li.querySelector(".sr-only")?.textContent.trim()),
      action: link ? { text: link.textContent.trim(), href: link.getAttribute("href") } : null,
      summary: section.querySelector("p")?.textContent.trim() ?? "",
    };
  }, businessId);

// ID state rows (no images are uploaded; the public ids point at nothing in the dev folder).
async function setIdState(userId, state, reason = "The photo of the ID is blurry.") {
  await q("delete from identity_verifications where user_id = $1", [userId]);
  if (state === "NONE") return;
  await q(
    `insert into identity_verifications (id, user_id, id_type, full_name_on_id, consent_given_at, status,
       rejection_reason, id_front_public_id, selfie_public_id, submitted_at, reviewed_at, updated_at)
     values (gen_random_uuid(), $1, 'NIN_SLIP', 'Ola Owner', now(), $2, $3, $4, $5, now() - interval '1 hour',
       $6, now())`,
    [
      userId,
      state,
      state === "REJECTED" ? reason : null,
      `${CLD}/identity/${userId}/e2e-front-${run}`,
      `${CLD}/identity/${userId}/e2e-selfie-${run}`,
      state === "PENDING" ? null : new Date(),
    ],
  );
}

const ids = {};
const LISTINGS = [
  // key, status, complete?, label
  ["DraftA", "DRAFT", false],
  ["DraftB", "DRAFT", true],
  ["Review", "PENDING_REVIEW", true],
  ["Changes", "REJECTED", true],
  ["Live", "APPROVED", true],
];
/** Expected tracker (written out independently of the app's code). */
function expected(idState, key) {
  const step = (s) => `/business/${ids[key]}/edit?step=${s}`;
  if (idState === "REJECTED")
    return { current: "ID check", action: ["Upload a new ID", "/account/verify-identity"] };
  if (idState === "NONE")
    return { current: "ID check", action: ["Verify your identity", "/account/verify-identity"] };
  switch (key) {
    case "DraftA":
      return { current: "Business details", action: ["Continue business details", step(3)] };
    case "DraftB":
      return { current: "Sent for review", action: ["Send for review", step(5)] };
    case "Changes":
      return { current: "Business details", action: ["Fix and resubmit", step(1)] };
    case "Review":
      return { current: idState === "PENDING" ? "ID check" : "Sent for review", action: null };
    case "Live":
      return { current: idState === "PENDING" ? "ID check" : "Live", action: null };
  }
}
const ID_NOTE = {
  NONE: "Not submitted yet",
  PENDING: "Under review, no action needed",
  APPROVED: "Accepted",
  REJECTED: "Changes needed",
};
const ID_LABEL = {
  NONE: "Not submitted",
  PENDING: "Under review",
  APPROVED: "Accepted",
  REJECTED: "Changes needed",
};

try {
  console.log("Setup");
  for (const u of Object.values(users)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.name },
    });
    if (error) throw new Error(`createUser failed: ${error.code}`);
    u.id = data.user.id;
    await q(
      "insert into profiles (id, full_name, email, role, updated_at) values ($1,$2,$3,'BUSINESS_OWNER', now())",
      [u.id, u.name, u.email],
    );
  }
  const lagos = (await one("select id from states where slug = 'lagos'")).id;
  const ikeja = (await one("select id from lgas where state_id = $1 and slug = 'ikeja'", [lagos]))
    .id;
  const cat = (await one("select id from categories where slug = 'carpenters'")).id;
  let minutes = 60;
  for (const [key, status, complete] of LISTINGS) {
    const id = crypto.randomUUID();
    ids[key] = id;
    // DraftB is the newest unfinished listing ("Continue to my listing" goes there).
    const age = key === "DraftB" ? 1 : minutes--;
    await q(
      `insert into businesses (id, owner_id, name, slug, category_id, phone, whatsapp_number, address, state_id,
         lga_id, description, status, logo_public_id, submitted_at, published_at, updated_at, created_at)
       values ($1,$2,$3,$4,$5,'+2348036660000','+2348036660000','1 Test Street',$6,$7,$8,$9,$10,$11,$12,
         now() - make_interval(mins => $13), now() - make_interval(mins => $13))`,
      [
        id,
        users.owner.id,
        `E2E Progress ${key} ${run}`,
        `e2e-pg-${run}-${key.toLowerCase()}`,
        cat,
        lagos,
        ikeja,
        complete ? "A complete description of more than thirty characters for testing." : null,
        status,
        complete ? `${CLD}/users/test/none` : null,
        status === "DRAFT" ? null : new Date(),
        status === "APPROVED" ? new Date() : null,
        age,
      ],
    );
  }
  await q(
    "insert into moderation_decisions (id, business_id, admin_id, action, comment) values (gen_random_uuid(), $1, null, 'REJECTED', 'Please add a clearer cover photo.')",
    [ids.Changes],
  ).catch(() =>
    q(
      "update businesses set rejection_reason = 'Please add a clearer cover photo.' where id = $1",
      [ids.Changes],
    ),
  );

  // -------------------------------------------------------------------------------------------
  console.log("\nEvery ID state x every listing state (one owner, five businesses)");
  const owner = await newPage();
  check("owner logs in (360px)", await login(owner, users.owner, "/dashboard"));
  for (const idState of ["NONE", "PENDING", "APPROVED", "REJECTED"]) {
    await setIdState(users.owner.id, idState);
    await go(owner, "/dashboard");
    const notice = await mainText(owner);
    check(
      `ID ${idState}: dashboard ID notice`,
      notice.includes(`ID check:`) &&
        notice.includes(ID_LABEL[idState]) &&
        (idState !== "REJECTED" ||
          (notice.includes("The photo of the ID is blurry.") &&
            notice.includes("Upload a new ID"))) &&
        (idState !== "NONE" || notice.includes("Verify your identity")) &&
        (idState !== "PENDING" || notice.includes("No action needed")),
    );
    if (idState === "REJECTED") {
      const alertHref = await owner.evaluate(
        () =>
          [...document.querySelectorAll("main [role=alert] a")]
            .find((a) => a.textContent.includes("Upload a new ID"))
            ?.getAttribute("href") ?? null,
      );
      check(
        "ID REJECTED: notice button goes to the resubmit form",
        alertHref === "/account/verify-identity",
      );
    }
    for (const [key] of LISTINGS) {
      const t = await trackerOf(owner, ids[key]);
      const want = expected(idState, key);
      const gotAction = t?.action ? [t.action.text, t.action.href] : null;
      check(
        `ID ${idState} + ${key}: current "${want.current}", ${want.action ? `button "${want.action[0]}"` : "no button"}`,
        Boolean(t) &&
          t.currentLabel === want.current &&
          JSON.stringify(gotAction) === JSON.stringify(want.action) &&
          t.stages.length === 5 &&
          t.stages[1].includes(ID_NOTE[idState]),
        JSON.stringify({ cur: t?.currentLabel, action: gotAction }),
      );
    }
    // Per-business stages stay per business; the ID stage is the same on every card.
    const all = await Promise.all(LISTINGS.map(([k]) => trackerOf(owner, ids[k])));
    check(
      `ID ${idState}: same ID stage on all five cards, business stages differ`,
      new Set(all.map((t) => t.stages[1].split(" (")[0])).size === 1 &&
        new Set(all.map((t) => t.stages[3])).size > 1,
    );
  }
  const draftA = await trackerOf(owner, ids.DraftA);
  check(
    "draft progress counts parts done (2 of 4)",
    draftA.stages[2].includes("2 of 4 parts done"),
  );
  await axe(owner, "dashboard with trackers (360px)");
  if (shotsDir)
    await owner.screenshot({
      path: path.join(shotsDir, "progress-dashboard-360.png"),
      fullPage: true,
    });

  // -------------------------------------------------------------------------------------------
  console.log("\n'Continue' destinations");
  await setIdState(users.owner.id, "APPROVED");
  await go(owner, "/dashboard");
  for (const [key, step] of [
    ["DraftA", 3],
    ["DraftB", 5],
    ["Changes", 1],
  ]) {
    await go(owner, "/dashboard");
    await owner.evaluate((id) => {
      [
        ...document.getElementById(`business-${id}`).querySelectorAll("section[aria-label] a"),
      ][0].click();
    }, ids[key]);
    const ok = await owner
      .waitForFunction(
        (p) => location.pathname + location.search === p,
        { timeout: 15000 },
        `/business/${ids[key]}/edit?step=${step}`,
      )
      .then(
        () => true,
        () => false,
      );
    check(`${key}: Continue opens the wizard at step ${step}`, ok, owner.url());
  }
  await setIdState(users.owner.id, "REJECTED");
  await go(owner, "/dashboard");
  await owner.evaluate((id) => {
    [
      ...document.getElementById(`business-${id}`).querySelectorAll("section[aria-label] a"),
    ][0].click();
  }, ids.DraftB);
  const toId = await owner
    .waitForFunction(() => location.pathname === "/account/verify-identity", { timeout: 15000 })
    .then(
      () => true,
      () => false,
    );
  // In-app navigation: wait for the status section (it loads after the page frame).
  await owner
    .waitForFunction(() => document.querySelector("main")?.innerText.includes("Status:"), {
      timeout: 15000,
    })
    .catch(() => {});
  const idPage = toId ? await mainText(owner) : "";
  check(
    "ID REJECTED: 'Upload a new ID' opens the resubmit form with the reason",
    toId &&
      idPage.includes("Status: Changes needed") &&
      idPage.includes("The photo of the ID is blurry.") &&
      (await owner.$('main input[name="idType"]')) !== null,
    `${toId} ${JSON.stringify(idPage.slice(0, 400))}`,
  );
  await axe(owner, "ID page: changes needed (360px)");

  // -------------------------------------------------------------------------------------------
  console.log("\nID check page in every state (never an empty form once sent)");
  const desk = await newPage({ width: 1280 });
  check("owner logs in (desktop)", await login(desk, users.owner, "/account/verify-identity"));
  for (const [state, page] of [
    ["PENDING", owner],
    ["APPROVED", desk],
    ["NONE", owner],
  ]) {
    await setIdState(users.owner.id, state);
    await go(page, "/account/verify-identity");
    const t = await mainText(page);
    const form = (await page.$('main input[name="idType"]')) !== null;
    const cont = await page.evaluate(
      () =>
        [...document.querySelectorAll("main a")]
          .find((a) => a.textContent.includes("Continue to my listing"))
          ?.getAttribute("href") ?? null,
    );
    if (state === "PENDING") {
      check(
        "PENDING: 'Your ID is under review, no action needed', sent date, Continue, small withdraw, no form",
        t.includes("Your ID is under review, no action needed") &&
          t.includes("You sent your NIN slip on") &&
          cont === `/business/${ids.DraftB}/edit?step=5` &&
          t.includes("Withdraw and start again") &&
          !form,
        cont,
      );
      await axe(page, "ID page: under review (360px)");
    } else if (state === "APPROVED") {
      check(
        "APPROVED: 'Your ID has been checked' + Continue to my listing, no form",
        t.includes("Your ID has been checked") &&
          t.includes("Status: Accepted") &&
          cont === `/business/${ids.DraftB}/edit?step=5` &&
          !form,
      );
      await axe(page, "ID page: accepted (desktop)");
    } else {
      check(
        "NONE: status Not submitted and the upload form",
        t.includes("Status: Not submitted") && form,
      );
    }
  }
  check(
    "intro never suggests ID photos are shown to customers",
    (await mainText(owner)).includes("They are never shown to customers"),
  );

  console.log("\nWithdraw and start again (with confirmation)");
  await setIdState(users.owner.id, "PENDING");
  await go(owner, "/account/verify-identity");
  await owner.evaluate(() =>
    [...document.querySelectorAll("main button")]
      .find((b) => b.textContent.includes("Withdraw and start again"))
      .click(),
  );
  const dialog = await owner.waitForSelector("dialog[open]", { timeout: 5000 }).then(
    () => true,
    () => false,
  );
  check(
    "withdraw asks for confirmation first",
    dialog &&
      (
        await one(
          "select count(*)::int n from identity_verifications where user_id = $1 and status = 'PENDING'",
          [users.owner.id],
        )
      ).n === 1,
  );
  await owner.evaluate(() =>
    [...document.querySelectorAll("dialog[open] button")]
      .find((b) => b.textContent.trim() === "Withdraw")
      .click(),
  );
  const backToForm = await owner
    .waitForFunction(() => document.querySelector('main input[name="idType"]') !== null, {
      timeout: 15000,
    })
    .then(
      () => true,
      () => false,
    );
  check(
    "after withdrawing: the upload form again and the check marked WITHDRAWN",
    backToForm &&
      (await one("select status from identity_verifications where user_id = $1", [users.owner.id]))
        .status === "WITHDRAWN",
  );

  console.log("\nOwner without listings");
  const emptyPage = await newPage();
  check(
    "second owner logs in",
    await login(emptyPage, users.empty, "/account"),
    emptyPage.url().replace(baseUrl, "") +
      " " +
      (await emptyPage.evaluate(
        () => document.querySelector("main [role=alert]")?.innerText ?? "",
      )),
  );
  await setIdState(users.empty.id, "PENDING");
  await go(emptyPage, "/account/verify-identity");
  check(
    "no listing yet: Continue to my listing goes to /business/new",
    (await emptyPage.evaluate(() =>
      [...document.querySelectorAll("main a")]
        .find((a) => a.textContent.includes("Continue to my listing"))
        ?.getAttribute("href"),
    )) === "/business/new",
  );
  await go(emptyPage, "/account");
  check(
    "account page: same status label (Under review)",
    (await mainText(emptyPage)).includes("Status: Under review"),
  );
  await go(emptyPage, "/business/new");
  const newT = await trackerOf(emptyPage, null);
  check(
    "new listing: tracker highlights Business details, no button",
    newT?.currentLabel === "Business details" &&
      newT.action === null &&
      newT.stages[1].includes("Under review"),
    JSON.stringify(newT),
  );
  await axe(emptyPage, "new listing with tracker (360px)");

  // -------------------------------------------------------------------------------------------
  console.log("\nWizard: tracker, ID status and 'Send for review'");
  await setIdState(users.owner.id, "NONE");
  await go(owner, `/business/${ids.DraftB}/edit?step=5`);
  let t = await mainText(owner);
  const wiz = await trackerOf(owner, null);
  check(
    "wizard tracker: ID needed shows 'Verify your identity' (a step outside the wizard)",
    wiz?.action?.text === "Verify your identity",
  );
  check(
    "review step: ID status + 'Send for review' + note",
    t.includes("Your ID check:") &&
      t.includes("Not submitted") &&
      t.includes("Send for review") &&
      t.includes("Our team will review your listing and ID. We'll notify you when it's live."),
  );
  await setIdState(users.owner.id, "PENDING");
  await go(owner, `/business/${ids.DraftB}/edit?step=5`);
  const wiz2 = await trackerOf(owner, null);
  check("wizard tracker: no button when the next step is this wizard", wiz2?.action === null);
  check(
    "review step: Under review, no action needed",
    (await mainText(owner)).includes("Under review, no action needed"),
  );
  await axe(owner, "wizard review step (360px)");
  await go(owner, `/business/${ids.Changes}/edit?step=5`);
  check(
    "rejected listing: 'Send for review again'",
    (await mainText(owner)).includes("Send for review again"),
  );

  console.log("\nSending a listing: owner notified, page shows progress");
  const before = outbox().length;
  await go(owner, `/business/${ids.DraftB}/edit?step=5`);
  await owner.evaluate(() => document.querySelector('main input[name="acceptTerms"]').click());
  await owner.evaluate(() =>
    [...document.querySelectorAll("main form button[type=submit]")]
      .find((b) => b.textContent.includes("Send for review"))
      .click(),
  );
  await owner
    .waitForFunction(
      () =>
        location.pathname.endsWith("/submitted") &&
        document
          .querySelector("main")
          ?.innerText.includes("Our team will review your listing and ID"),
      { timeout: 30000 },
    )
    .catch(() => {});
  t = await mainText(owner);
  check(
    "sent page: received + progress (ID under review, no button)",
    t.includes("Our team will review your listing and ID") &&
      (await trackerOf(owner, null))?.action === null,
  );
  await axe(owner, "sent for review page (360px)");
  let rec = [];
  for (let i = 0; i < 20 && rec.length === 0; i++) {
    rec = await q(
      "select title, body from notifications where user_id = $1 and type = 'listing-received'",
      [users.owner.id],
    );
    if (!rec.length) await sleep(500);
  }
  check(
    "owner notified in the bell: Listing sent for review",
    rec.length === 1 && rec[0].body.includes(`E2E Progress DraftB ${run}`),
  );
  check(
    "no email for 'listing received'",
    outbox()
      .slice(before)
      .every((m) => m.tag !== "listing-received"),
  );
  check(
    "listing is PENDING_REVIEW (sent), not approved",
    (await one("select status from businesses where id = $1", [ids.DraftB])).status ===
      "PENDING_REVIEW",
  );

  // -------------------------------------------------------------------------------------------
  console.log("\nThe tracker can't be faked from the browser");
  await setIdState(users.owner.id, "NONE");
  // The raw HTML from the server, with the owner's session: the tracker is already in it, worked
  // out from the database (the ID check is NONE now), before any browser script runs.
  const cookieHeader = (await desk.cookies(baseUrl)).map((c) => `${c.name}=${c.value}`).join("; ");
  const html = await (
    await fetch(`${baseUrl}/dashboard`, {
      headers: {
        cookie: cookieHeader,
        "user-agent": DESKTOP_UA,
        "x-forwarded-for": "10.233.250.4",
      },
    })
  ).text();
  check(
    "tracker is rendered by the server from the database",
    html.includes(`Progress for E2E Progress Live ${run}`) &&
      html.includes('aria-current="step"') &&
      html.includes("Verify your identity"),
  );
  await desk.setCookie(
    { name: "idState", value: "APPROVED", url: baseUrl },
    { name: "status", value: "APPROVED", url: baseUrl },
  );
  await go(desk, "/dashboard?idState=APPROVED&status=APPROVED&current=live");
  await desk.evaluate(() => {
    localStorage.setItem("idState", "APPROVED");
    sessionStorage.setItem("idState", "APPROVED");
  });
  await go(desk, "/dashboard?idState=APPROVED");
  const faked = await trackerOf(desk, ids.DraftA);
  check(
    "cookies, storage and URL parameters change nothing (still 'Verify your identity')",
    faked?.action?.text === "Verify your identity" && faked.stages[1].includes("Not submitted yet"),
  );
  check(
    "nothing about the ID check is kept in browser storage",
    (
      await desk.evaluate(() =>
        Object.keys(localStorage).filter((k) => k !== "idState" && /id|progress|identity/i.test(k)),
      )
    ).length === 0,
  );
  await axe(desk, "dashboard (desktop)");
  if (shotsDir)
    await desk.screenshot({
      path: path.join(shotsDir, "progress-dashboard-1280.png"),
      fullPage: true,
    });

  const errs = [owner, desk, emptyPage].flatMap((p) => p.errors);
  check("no page errors", errs.length === 0, errs.join(" | "));
} catch (e) {
  failures++;
  console.log("  ERROR", e.message);
} finally {
  console.log("\nCleanup");
  const idList = Object.values(users)
    .map((u) => u.id)
    .filter(Boolean);
  await q("delete from identity_verifications where user_id = any($1::uuid[])", [idList]);
  await q("delete from businesses where owner_id = any($1::uuid[])", [idList]);
  await q("delete from profiles where id = any($1::uuid[])", [idList]);
  for (const u of Object.values(users))
    if (u.id) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  await q("delete from rate_limit_hits where created_at >= $1", [testStart]);
  const left = await one(
    "select (select count(*) from profiles where email like $1)::int p, (select count(*) from businesses where slug like $2)::int b",
    [`chf-e2e-${run}-%`, `e2e-pg-${run}-%`],
  );
  console.log("  leftovers:", JSON.stringify(left));
  await browser.close();
  await db.end();
}
console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
