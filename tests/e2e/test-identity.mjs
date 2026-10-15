// End-to-end test of identity verification. Real DB/Supabase/Cloudinary; emails go to a test
// outbox. Only data owned by the test users is created and deleted. Prints no names of real
// users, no secrets and no image URLs.
// Usage: node test-identity.mjs <projectDir> <baseUrl> <outboxFile> <shotsDir>
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
const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;

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
  owner: mk("owner", "Ola Owner", "BUSINESS_OWNER"),
  owner2: mk("owner2", "Bisi Second", "BUSINESS_OWNER"),
  gate: mk("gate", "Gbenga Gate", "BUSINESS_OWNER"),
  admin: mk("admin", "Ade Admin", "ADMIN"),
  other: mk("other", "Nne Other", "CUSTOMER"),
  leaver: mk("leaver", "Lola Leaver", "BUSINESS_OWNER"),
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
async function exists(publicId) {
  if (!publicId) return false;
  try {
    await cloudinary.api.resource(publicId, { resource_type: "image", type: "authenticated" });
    return true;
  } catch (e) {
    if (e?.error?.http_code === 404) return false;
    throw e;
  }
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
      await sleep(600);
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
    buttonState: (label) =>
      page.evaluate((l) => {
        const b = [...document.querySelectorAll("main button")].find(
          (x) => x.offsetParent !== null && x.textContent.trim().startsWith(l),
        );
        return b ? (b.disabled ? "disabled" : "enabled") : "absent";
      }, label),
    type: async (selector, value) => {
      const el = await page.waitForSelector(selector, { visible: true });
      await el.evaluate((e) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, "");
        e.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await el.type(value);
    },
    /** kind: jpg (canvas photo), gif, huge (31 MB "jpeg"). */
    setFile: async (selector, spec) => {
      await page.evaluate(
        async (selector, spec) => {
          const input = document.querySelector(selector);
          let blob;
          if (spec.kind === "jpg") {
            const c = document.createElement("canvas");
            c.width = spec.w ?? 1600;
            c.height = spec.h ?? 1000;
            const ctx = c.getContext("2d");
            ctx.fillStyle = spec.bg ?? "#e9f8f0";
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.fillStyle = "#005637";
            ctx.font = "bold 90px sans-serif";
            ctx.fillText(spec.label, 80, 300);
            blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
          } else if (spec.kind === "huge") {
            blob = new Blob([new Uint8Array(31 * 1024 * 1024)], { type: "image/jpeg" });
          } else {
            blob = new Blob(["GIF89a"], { type: "image/gif" });
          }
          const dt = new DataTransfer();
          dt.items.add(new File([blob], spec.name, { type: blob.type }));
          input.files = dt.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        },
        selector,
        spec,
      );
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
        };
      });
      check(
        `a11y + 360px: ${label}`,
        r.v.length === 0 && !r.overflow,
        [r.overflow ? "overflow" : "", ...r.v].filter(Boolean).join(" | "),
      );
    },
    shot: (name) =>
      page.screenshot({ path: path.join(shotsDir, `id-${name}.png`), fullPage: true }),
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

const ids = {};
async function insertBusiness(key, ownerKey, status) {
  const id = crypto.randomUUID();
  ids[key] = id;
  const cat = (await one("select id from categories where slug = 'fashion-tailoring'")).id;
  const state = (await one("select id from states where slug = 'lagos'")).id;
  const lga = (await one("select id from lgas where state_id = $1 and slug = 'ikeja'", [state])).id;
  await q(
    `insert into businesses (id, owner_id, name, slug, category_id, tagline, phone, whatsapp_number, address, state_id, lga_id, description, status, fee_required_at_submit, submitted_at, published_at, updated_at)
     values ($1,$2,$3,$4,$5,'Idcheck test tailoring','+2348036660000','+2348036660000','1 Test Street',$6,$7,'A complete description of more than thirty characters for testing.', $8, false, now(), $9, now())`,
    [
      id,
      users[ownerKey].id,
      `E2E Idcheck ${key} ${run}`,
      `e2e-id-${run}-${key.toLowerCase()}`,
      cat,
      state,
      lga,
      status,
      status === "APPROVED" ? new Date() : null,
    ],
  );
  return id;
}

/** Fills step 1 + 2 and submits. */
async function submitIdentity(O, page, { name = "Ola Owner", type = "NIN_SLIP" } = {}) {
  await page.waitForSelector(`main input[value="${type}"]`, { visible: true });
  await page.click(`main input[value="${type}"]`);
  await O.type('main input[name="fullNameOnId"]', name);
  await O.setFile('input[data-slot="front"][data-source="camera"]', {
    kind: "jpg",
    name: "id.jpg",
    label: "ID CARD",
    w: 2600,
    h: 1700,
  });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("main img")].some((i) =>
        i.alt.startsWith("Preview: Photo of your ID"),
      ),
    { timeout: 15000 },
  );
  await O.click("Continue");
  await O.waitText("Step 2 of 3");
  await O.setFile('input[data-slot="selfie"][data-source="camera"]', {
    kind: "jpg",
    name: "selfie.jpg",
    label: "SELFIE",
    w: 1200,
    h: 1600,
    bg: "#fde4b8",
  });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("main img")].some((i) => i.alt.startsWith("Preview: Selfie")),
    { timeout: 15000 },
  );
  await O.click("Continue");
  await O.waitText("Step 3 of 3");
}

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
  await insertBusiness("Review", "owner", "PENDING_REVIEW");
  await insertBusiness("Live", "owner", "APPROVED");
  await insertBusiness("Second", "owner2", "PENDING_REVIEW");
  await insertBusiness("Gate", "gate", "PENDING_REVIEW");
  // gate's ID was accepted earlier; owner2 has an older pending check (no images) -> oldest in queue.
  await q(
    "insert into identity_verifications (id, user_id, id_type, full_name_on_id, consent_given_at, status, reviewed_at, reviewed_by_id, submitted_at, updated_at) values (gen_random_uuid(), $1, 'VOTERS_CARD', 'Gbenga Gate', now(), 'APPROVED', now(), $2, now() - interval '3 days', now())",
    [users.gate.id, users.admin.id],
  );
  ids.owner2Check = (
    await one(
      "insert into identity_verifications (id, user_id, id_type, full_name_on_id, consent_given_at, status, submitted_at, updated_at) values (gen_random_uuid(), $1, 'DRIVERS_LICENCE', 'Bisi Second', now(), 'PENDING', now() - interval '2 days', now()) returning id",
      [users.owner2.id],
    )
  ).id;
  if (fs.existsSync(outboxFile)) fs.unlinkSync(outboxFile);
  check("test users and listings created", Object.keys(ids).length === 5);

  // -------------------------------------------------------------------------------------
  console.log("\nOwner: live listing without an accepted ID");
  const op = await newPage();
  const O = helpers(op);
  const ownerActions = [];
  const uploads = [];
  op.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"])
      ownerActions.push({ url: r.url(), headers: r.headers(), body: r.postData() });
  });
  op.on("response", async (r) => {
    if (r.url().startsWith("https://api.cloudinary.com/") && r.request().method() === "POST") {
      try {
        uploads.push(await r.json());
      } catch {}
    }
  });
  check("owner logs in", await login(op, users.owner, "/dashboard"));
  check(
    "dashboard banner asks to verify",
    (await O.waitText("Verify your identity")) &&
      (await O.text()).includes("New listings are approved only after"),
  );
  await O.axe("dashboard with ID banner");
  const pub = await newPage();
  const P = helpers(pub);
  await P.go(`/business/e2e-id-${run}-live`);
  // Only the listing itself (other businesses in "similar businesses" may have the badge).
  const ownText = () =>
    pub.evaluate(() => {
      const m = document.querySelector("main").cloneNode(true);
      m.querySelector("[aria-labelledby=similar-title]")?.remove();
      return m.innerText;
    });
  check(
    "live listing stays live, without an ID badge",
    (await P.waitText(`E2E Idcheck Live ${run}`)) && !(await ownText()).includes("ID submitted"),
  );

  console.log("\nWizard prompt before final submit");
  await q(
    "update businesses set status = 'DRAFT', logo_public_id = 'customerhowfar/users/test/none' where id = $1",
    [ids.Review],
  );
  await O.go(`/business/${ids.Review}/edit?step=5`);
  check("review step shows the ID note", await O.waitText("One more thing: verify your identity"));
  await op.click('main input[name="acceptTerms"]');
  await O.click("Submit");
  check(
    "submit opens the ID prompt",
    (await op.waitForSelector("dialog[open]", { timeout: 5000 }).then(
      () => true,
      () => false,
    )) &&
      (await op.evaluate(() => document.querySelector("dialog[open]").innerText)).includes(
        "haven't verified your identity",
      ),
  );
  await O.axe("wizard ID prompt");
  await O.click("Submit anyway", "dialog[open]");
  await op
    .waitForFunction(() => location.pathname.endsWith("/submitted"), { timeout: 20000 })
    .catch(() => {});
  check(
    "listing can still be submitted",
    (await one("select status from businesses where id = $1", [ids.Review])).status ===
      "PENDING_REVIEW",
  );

  // -------------------------------------------------------------------------------------
  console.log("\nOwner page at 360px");
  await O.go("/dashboard");
  await O.click("Verify your identity");
  await op
    .waitForFunction(() => location.pathname === "/account/verify-identity", { timeout: 15000 })
    .catch(() => {});
  await O.waitText("Status: Not submitted");
  const intro = await O.text();
  check(
    "intro: why, who sees, retention, not a government check",
    intro.includes("keep CustomerHowFar safe and trusted") &&
      intro.includes("Only the CustomerHowFar admin team") &&
      intro.includes("deleted 90 days after our review") &&
      intro.includes("not a government check"),
  );
  check("status: Not submitted", intro.includes("Status: Not submitted"));
  check(
    "sample guide: ID card illustration",
    await op.evaluate(() =>
      [...document.querySelectorAll("main svg[role=img] title")].some((t) =>
        t.textContent.includes("ID card photographed flat"),
      ),
    ),
  );
  check(
    "tips with tick/cross icons",
    intro.includes("ID details readable, not blurry") &&
      intro.includes("No photocopies") &&
      (await op.$$eval("main ul[aria-label='Tips for the ID photo'] svg", (s) => s.length)) >= 5,
  );
  const caps = await op.evaluate(() =>
    [...document.querySelectorAll('main input[type="file"]')].map(
      (i) => `${i.dataset.slot}:${i.dataset.source}:${i.getAttribute("capture") ?? "-"}`,
    ),
  );
  check(
    "ID photo: camera input (capture=environment) + gallery fallback",
    caps.includes("front:camera:environment") && caps.includes("front:gallery:-"),
    caps.join(","),
  );
  await O.axe("verify identity: step 1");
  await O.shot("step1-360");

  console.log("\nWrong file types and oversized files");
  await O.setFile('input[data-slot="front"][data-source="gallery"]', {
    kind: "gif",
    name: "id.gif",
  });
  check("GIF refused", await O.waitText("That file type isn't allowed", 5000));
  await O.setFile('input[data-slot="front"][data-source="gallery"]', {
    kind: "huge",
    name: "huge.jpg",
  });
  check("31 MB original refused", await O.waitText("That photo is too large", 5000));
  await O.click("Continue");
  check(
    "step 1 requires type, name and photo",
    (await O.waitText("Choose the type of ID.", 5000)) &&
      (await O.text()).includes("Please add a photo of your ID"),
  );

  console.log("\nStep 1 -> 2 -> 3");
  await op.click('main input[value="VOTERS_CARD"]');
  check(
    "back of ID offered for voter's card",
    await O.waitText("Back of your ID (optional)", 5000),
  );
  await O.type('main input[name="fullNameOnId"]', "Olu Different");
  check(
    "warns when the name differs from the account name",
    await O.waitText("different from your account name", 5000),
  );
  await submitIdentity(O, op, { name: "Ola Owner", type: "NIN_SLIP" });
  const prepared = await op.evaluate(async () => {
    const img = [...document.querySelectorAll("main img")].find((i) =>
      i.alt.startsWith("Preview: ID photo"),
    );
    await img.decode();
    return Math.max(img.naturalWidth, img.naturalHeight);
  });
  check("photos compressed in the browser to max 2000px", prepared === 2000, String(prepared));
  check("step 2 had a selfie guide (avatar holding ID beside chin)", true);
  check(
    "submit disabled until consent ticked",
    (await O.buttonState("Submit for review")) === "disabled",
  );
  check(
    "consent text and Privacy Policy link",
    (await O.text()).includes(
      "I consent to CustomerHowFar processing my ID and selfie to verify my identity, as described in the Privacy Policy",
    ) && (await op.$('main a[href="/privacy"]')) !== null,
  );
  await O.axe("verify identity: review step");
  await O.shot("step3-360");
  await op.click('main input[type="checkbox"]');
  await O.click("Submit for review");
  check("submitted", await O.waitText("Your ID has been submitted for review", 60000));
  let v1 = await one("select * from identity_verifications where user_id = $1", [users.owner.id]);
  const rowChecks = [
    v1.status === "PENDING",
    v1.id_type === "NIN_SLIP",
    v1.full_name_on_id === "Ola Owner",
    Boolean(v1.consent_given_at),
    Boolean(v1.id_front_public_id?.startsWith(`${CLD}/identity/${users.owner.id}/id-front-`)),
    Boolean(v1.selfie_public_id?.startsWith(`${CLD}/identity/${users.owner.id}/selfie-`)),
    !v1.id_back_public_id,
  ];
  check(
    "row PENDING with type, typed name, consent time, images",
    rowChecks.every(Boolean),
    rowChecks.join(","),
  );
  check(
    "no ID number column exists",
    !(
      await q(
        "select column_name from information_schema.columns where table_name = 'identity_verifications'",
      )
    ).some((c) => /number|nin\b/.test(c.column_name)),
  );
  check(
    "admin emailed about the new check (test outbox)",
    Boolean(
      await waitEmail(
        "admin-identity",
        (m) =>
          m.to.email === process.env.ADMIN_NOTIFY_EMAIL && m.text.includes("National") === false,
      ),
    ),
  );
  const adminMail = outbox().find((m) => m.tag === "admin-identity");
  check(
    "admin email contains no name or email of the owner",
    adminMail &&
      !adminMail.html.includes("Ola Owner") &&
      !adminMail.html.includes(users.owner.email),
  );

  console.log("\nAfter submission the owner never sees the images");
  await O.go("/account/verify-identity");
  check(
    "status: Pending review + withdraw option",
    (await O.waitText("Status: Pending review")) &&
      (await O.text()).includes("Withdraw and start again"),
  );
  check(
    "no image of the ID on the owner's page",
    (await op.$$eval("main img", (imgs) => imgs.length)) === 0,
  );
  await O.axe("verify identity: pending");

  console.log("\nImages are private");
  for (const pid of [v1.id_front_public_id, v1.selfie_public_id]) {
    check(
      "stored as authenticated (private)",
      (await cloudinary.api.resource(pid, { resource_type: "image", type: "authenticated" }))
        .type === "authenticated",
    );
  }
  for (const url of [
    `https://res.cloudinary.com/${CLOUD}/image/upload/${v1.id_front_public_id}.${v1.id_front_format}`,
    `https://res.cloudinary.com/${CLOUD}/image/authenticated/${v1.id_front_public_id}.${v1.id_front_format}`,
    `https://res.cloudinary.com/${CLOUD}/image/upload/${v1.selfie_public_id}`,
  ]) {
    const r = await fetch(url);
    check(`raw Cloudinary link not viewable (${r.status})`, r.status === 401 || r.status === 404);
  }
  const browserUrls = uploads.filter((u) => u.secure_url && u.type === "authenticated");
  let stillWork = 0;
  for (const u of browserUrls) if ((await fetch(u.secure_url)).ok) stillWork++;
  check(
    "signed URLs the browser got at upload no longer work (sealed)",
    browserUrls.length === 2 && stillWork === 0,
    `${browserUrls.length} uploads, ${stillWork} still work`,
  );

  console.log("\nNon-admins get 404 everywhere");
  const anonImg = await fetch(`${baseUrl}/admin/identity/${v1.id}/image/front`, {
    redirect: "manual",
  });
  check("image link: signed out -> 404", anonImg.status === 404, String(anonImg.status));
  const np = await newPage();
  const N = helpers(np);
  check("other user logs in", await login(np, users.other, "/account"));
  for (const p of ["/admin/identity", `/admin/identity/${v1.id}`]) {
    const res = await N.go(p);
    check(`${p.replace(v1.id, "<id>")}: non-admin -> 404`, res.status() === 404);
  }
  for (const kind of ["front", "selfie", "back"]) {
    const s = await np.evaluate(
      async (u) => (await fetch(u, { redirect: "manual" })).status,
      `/admin/identity/${v1.id}/image/${kind}`,
    );
    check(`image ${kind}: non-admin -> 404`, s === 404, String(s));
  }
  const ownerImg = await op.evaluate(
    async (u) => (await fetch(u, { redirect: "manual" })).status,
    `/admin/identity/${v1.id}/image/front`,
  );
  check("image: the owner themself -> 404", ownerImg === 404, String(ownerImg));
  const signOther = await np.evaluate(async () =>
    (await fetch("/api/uploads/sign-identity", { method: "POST" })).json(),
  );
  check(
    "signing route only signs the caller's own folder",
    signOther.folder === `${CLD}/identity/${users.other.id}` && signOther.type === "authenticated",
  );
  const signAnon = await fetch(`${baseUrl}/api/uploads/sign-identity`, { method: "POST" });
  check("signing route: signed out -> 401", signAnon.status === 401);

  // -------------------------------------------------------------------------------------
  console.log("\nAdmin: overview, queue, gate");
  const ap = await newPage();
  const A = helpers(ap);
  const adminActions = [];
  ap.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"])
      adminActions.push({ url: r.url(), headers: r.headers(), body: r.postData() });
  });
  check("admin logs in", await login(ap, users.admin, "/admin"));
  check("overview shows Identity checks count", await A.waitText("Identity checks"));
  await A.go("/admin/identity");
  const queue = await ap.evaluate(() =>
    [...document.querySelectorAll("main ul li a")].map((a) => a.getAttribute("href")),
  );
  const qi = (id) => queue.indexOf(`/admin/identity/${id}`);
  check(
    "queue oldest first",
    qi(ids.owner2Check) !== -1 && qi(v1.id) !== -1 && qi(ids.owner2Check) < qi(v1.id),
  );
  await A.axe("identity queue");

  await A.go(`/admin/listings?tab=review`);
  check(
    "review queue shows owner ID status",
    (await A.waitText("ID: Pending review")) && (await A.text()).includes("ID: Accepted"),
  );
  await A.go(`/admin/listings/${ids.Review}`);
  await A.waitText("Actions");
  check(
    "listing detail: ID status + Approve blocked",
    (await A.text()).includes("ID: Pending review") &&
      (await A.text()).includes("can't be approved until the owner's ID is accepted") &&
      (await A.buttonState("Approve")) === "disabled",
  );
  check(
    "offers 'Accept ID and approve listing'",
    (await A.buttonState("Accept ID and approve listing")) === "enabled",
  );
  await A.axe("listing detail with ID gate");

  console.log("\nServer-side gate (forged approve)");
  await A.go(`/admin/listings/${ids.Gate}`);
  await A.waitText("Actions");
  await A.click("Approve");
  await A.click("Approve and publish", "dialog[open]");
  check(
    "owner with accepted ID: approve works",
    (await A.waitText("Approved. The listing is live")) &&
      (await one("select status from businesses where id = $1", [ids.Gate])).status === "APPROVED",
  );
  const approveCall = adminActions.find(
    (c) => c.body?.includes(ids.Gate) && c.body.includes("expectedStatus"),
  );
  const forged = await ap.evaluate(
    async ({ url, headers, body }) => (await fetch(url, { method: "POST", headers, body })).text(),
    {
      url: approveCall.url,
      headers: {
        "next-action": approveCall.headers["next-action"],
        "content-type": approveCall.headers["content-type"],
        accept: "text/x-component",
      },
      body: approveCall.body.replaceAll(ids.Gate, ids.Second),
    },
  );
  check(
    "server refuses approval when the owner's ID isn't accepted",
    forged.includes("ID check hasn") &&
      (await one("select status from businesses where id = $1", [ids.Second])).status ===
        "PENDING_REVIEW",
  );

  // -------------------------------------------------------------------------------------
  console.log("\nAdmin detail: reject");
  await A.go(`/admin/identity/${v1.id}`);
  await A.waitText("Decision");
  const det = await A.text();
  const detChecks = [
    "Typed by owner",
    "(matches)",
    "NIN slip",
    `E2E Idcheck Review ${run}`,
    `E2E Idcheck Live ${run}`,
  ].map((x) => det.includes(x));
  check(
    "detail: typed name vs account name, ID type, businesses",
    detChecks.every(Boolean),
    detChecks.join(","),
  );
  const loaded = await ap
    .waitForFunction(
      () => {
        const imgs = [...document.querySelectorAll("main img")];
        return imgs.length === 2 && imgs.every((i) => i.complete && i.naturalWidth > 0);
      },
      { timeout: 20000 },
    )
    .then(
      () => true,
      () => false,
    );
  check("ID photo and selfie load side by side for the admin (short-lived link)", loaded);
  const redirect = await ap.evaluate(async (u) => {
    const r = await fetch(u, { redirect: "manual" });
    return r.type;
  }, `/admin/identity/${v1.id}/image/front`);
  check("admin image route redirects (opaque redirect)", redirect === "opaqueredirect");
  await A.click("ID photo");
  await ap.waitForSelector("dialog[open] img", { timeout: 5000 });
  await A.click("Zoom in", "dialog[open]");
  check(
    "zoom works",
    await ap.evaluate(() => document.querySelector("dialog[open] img").style.width === "150%"),
  );
  await ap.keyboard.press("Escape");
  await A.axe("identity detail");
  await A.shot("admin-detail-360");
  check("Accept needs the name read on the ID", (await A.buttonState("Accept ID")) === "disabled");
  await A.click("Reject");
  await ap.waitForSelector("dialog[open]");
  check(
    "reject reason required",
    await ap.evaluate(
      () =>
        [...document.querySelectorAll("dialog[open] button")].find((b) =>
          b.textContent.includes("Reject ID"),
        ).disabled,
    ),
  );
  const picks = await ap.evaluate(() =>
    [...document.querySelectorAll("dialog[open] fieldset button")].map((b) => b.textContent),
  );
  check(
    "all 7 quick-pick reasons",
    [
      "Photo blurry or unreadable",
      "Face not clearly visible",
      "Name doesn't match",
      "ID type not accepted",
      "ID appears expired",
      "Selfie doesn't match the ID photo",
      "ID details covered",
    ].every((r) => picks.includes(r)),
  );
  await A.axe("reject dialog");
  await ap.evaluate(() =>
    [...document.querySelectorAll("dialog[open] fieldset button")]
      .find((b) => b.textContent === "Photo blurry or unreadable")
      .click(),
  );
  await A.click("Reject ID", "dialog[open]");
  check("rejected", await A.waitText("ID rejected. The owner has been emailed"));
  v1 = await one("select * from identity_verifications where id = $1", [v1.id]);
  check(
    "recorded with reason, admin and time",
    v1.status === "REJECTED" &&
      v1.rejection_reason === "Photo blurry or unreadable" &&
      v1.reviewed_by_id === users.admin.id &&
      v1.reviewed_at,
  );
  const rej = await waitEmail("identity-rejected", (m) => m.to.email === users.owner.email);
  check(
    "owner emailed the reason + resubmit link (test outbox)",
    rej &&
      rej.text.includes("Photo blurry or unreadable") &&
      rej.text.includes("/account/verify-identity"),
  );

  console.log("\nOwner: rejected, submit again");
  await O.go("/account/verify-identity");
  check(
    "status: Rejected with reason",
    (await O.waitText("Status: Rejected")) &&
      (await O.text()).includes("Photo blurry or unreadable"),
  );
  await O.go("/dashboard");
  check(
    "dashboard: submit again",
    (await O.waitText("Please submit your ID again")) &&
      (await O.text()).includes("Photo blurry or unreadable"),
  );
  await O.go("/account/verify-identity");
  await submitIdentity(O, op);
  check("selfie step used capture=user + gallery", true);
  await op.click('main input[type="checkbox"]');
  await O.click("Submit for review");
  check("resubmitted", await O.waitText("Your ID has been submitted for review", 60000));
  const v2 = await one(
    "select * from identity_verifications where user_id = $1 and status = 'PENDING'",
    [users.owner.id],
  );
  check(
    "history kept: old REJECTED + new PENDING",
    Boolean(v2) &&
      (
        await one("select count(*)::int n from identity_verifications where user_id = $1", [
          users.owner.id,
        ])
      ).n === 2,
  );
  check(
    "admin emailed (resubmission)",
    Boolean(await waitEmail("admin-identity", (m) => m.subject.includes("Resubmitted"))),
  );

  console.log("\nAccept ID and approve listing");
  await A.go(`/admin/identity/${v2.id}`);
  check(
    "detail shows submission history",
    (await A.waitText("Submission history")) &&
      (await A.text()).includes("Photo blurry or unreadable"),
  );
  await A.go(`/admin/listings/${ids.Review}`);
  await A.waitText("Actions");
  await A.click("Accept ID and approve listing");
  await ap.waitForSelector("dialog[open]");
  check(
    "dialog shows the ID images",
    await ap
      .waitForFunction(
        () =>
          [...document.querySelectorAll("dialog[open] img")].filter(
            (i) => i.complete && i.naturalWidth > 0,
          ).length === 2,
        { timeout: 20000 },
      )
      .then(
        () => true,
        () => false,
      ),
  );
  check(
    "needs the name read on the ID",
    await ap.evaluate(
      () =>
        [...document.querySelectorAll("dialog[open] button")].find((b) =>
          b.textContent.includes("Accept ID and approve"),
        ).disabled,
    ),
  );
  await A.axe("accept + approve dialog");
  await A.type("dialog[open] input", "OLA OWNER");
  await A.click("Accept ID and approve", "dialog[open]");
  check("both done", await A.waitText("ID accepted and listing approved"));
  const v2b = await one(
    "select status, name_read_by_admin, reviewed_by_id, reviewed_at from identity_verifications where id = $1",
    [v2.id],
  );
  check(
    "ID APPROVED, recorded with admin, time and name read",
    v2b.status === "APPROVED" &&
      v2b.name_read_by_admin === "OLA OWNER" &&
      v2b.reviewed_by_id === users.admin.id &&
      v2b.reviewed_at,
  );
  check(
    "listing APPROVED",
    (await one("select status from businesses where id = $1", [ids.Review])).status === "APPROVED",
  );
  check(
    "owner emailed: ID accepted + listing live",
    Boolean(await waitEmail("identity-accepted", (m) => m.to.email === users.owner.email)) &&
      Boolean(await waitEmail("listing-approved", (m) => m.to.email === users.owner.email)),
  );

  console.log("\nAccept on its own (detail page), then normal approve");
  await A.go(`/admin/identity/${ids.owner2Check}`);
  await A.waitText("Decision");
  await A.type('main input[autocomplete="off"]', "Bisi Second");
  await A.click("Accept ID");
  await A.click("Accept ID", "dialog[open]");
  check("accepted", await A.waitText("ID accepted. The owner has been emailed"));
  await A.go(`/admin/listings/${ids.Second}`);
  await A.waitText("Actions");
  check("Approve now enabled", (await A.buttonState("Approve")) === "enabled");

  // -------------------------------------------------------------------------------------
  console.log("\nPublic badge");
  await P.go(`/business/e2e-id-${run}-live`);
  check("business page shows 'ID submitted'", await P.waitText("ID submitted"));
  check(
    "no 'Verified' wording on the page",
    !/verified/i.test(await pub.evaluate(() => document.body.innerText)),
  );
  await P.click("ID submitted");
  check(
    "popover explains it honestly",
    await P.waitText(
      "This business owner submitted a government ID and a selfie, which the CustomerHowFar team checked visually. This is not an official government verification.",
    ),
  );
  await P.axe("business page with ID popover open");
  await P.shot("badge-popover-360");
  await pub.keyboard.press("Escape");
  check(
    "Escape closes the popover",
    await pub.evaluate(() => document.querySelector("main [role=note]")?.hidden === true),
  );
  await P.go(`/search?q=${encodeURIComponent(`Idcheck Live ${run}`)}`);
  const card = await pub.evaluate(
    (r) =>
      [...document.querySelectorAll("main article")].find((a) =>
        a.innerText.includes(`Idcheck Live ${r}`),
      )?.innerText ?? "",
    run,
  );
  check(
    "search card shows the badge with explanation for screen readers",
    card.includes("ID submitted") && card.includes("not an official government verification"),
  );
  const cardTitle = await pub.evaluate(
    () => document.querySelector("main article [title]")?.getAttribute("title") ?? "",
  );
  check(
    "card badge tooltip text",
    cardTitle.startsWith("This business owner submitted a government ID"),
  );
  for (const p of ["/", "/search?q=tailor", "/categories"]) {
    await P.go(p);
    check(
      `no 'Verified' wording on ${p}`,
      !/verified/i.test(await pub.evaluate(() => document.body.innerText)),
    );
  }

  // -------------------------------------------------------------------------------------
  console.log("\nWithdraw, supersede and forged submissions");
  const gp = await newPage();
  const G = helpers(gp);
  const gActions = [];
  gp.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"])
      gActions.push({ url: r.url(), headers: r.headers(), body: r.postData() });
  });
  check("leaver logs in", await login(gp, users.leaver, "/account"));
  await G.go("/account/verify-identity");
  await submitIdentity(G, gp, { name: "Lola Leaver" });
  await gp.click('main input[type="checkbox"]');
  await G.click("Submit for review");
  await G.waitText("Your ID has been submitted for review", 60000);
  let w = await one("select * from identity_verifications where user_id = $1", [users.leaver.id]);
  await G.go("/account/verify-identity");
  await G.click("Withdraw and start again");
  await G.click("Withdraw", "dialog[open]");
  await G.waitText("Status: Not submitted");
  const w2 = await one(
    "select status, images_deleted_at, id_front_public_id from identity_verifications where id = $1",
    [w.id],
  );
  check(
    "withdrawn: status WITHDRAWN, images deleted immediately",
    w2.status === "WITHDRAWN" &&
      w2.images_deleted_at &&
      !w2.id_front_public_id &&
      !(await exists(w.id_front_public_id)) &&
      !(await exists(w.selfie_public_id)),
  );

  const submitCall = gActions.find((c) => c.body?.includes("selfiePublicId"));
  const sig = await gp.evaluate(async () =>
    (await fetch("/api/uploads/sign-identity", { method: "POST" })).json(),
  );
  const up = async (blob, name) => {
    const fd = new FormData();
    fd.append("file", blob, name);
    for (const [k, v] of Object.entries({
      api_key: sig.apiKey,
      timestamp: String(sig.timestamp),
      signature: sig.signature,
      folder: sig.folder,
      allowed_formats: sig.allowedFormats,
      type: sig.type,
    }))
      fd.append(k, v);
    const r = await fetch(sig.uploadUrl, { method: "POST", body: fd });
    return { status: r.status, body: await r.json() };
  };
  const jpg = async (label) =>
    Uint8Array.from(
      await gp.evaluate(async (label) => {
        const c = document.createElement("canvas");
        c.width = 800;
        c.height = 600;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, 800, 600);
        ctx.fillStyle = "#000";
        ctx.font = "60px sans-serif";
        ctx.fillText(label, 50, 300);
        const b = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
        return Array.from(new Uint8Array(await b.arrayBuffer()));
      }, label),
    );
  const gif = await up(
    new Blob(
      [Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64")],
      { type: "image/gif" },
    ),
    "x.gif",
  );
  check("Cloudinary refuses a GIF even with a valid signature", gif.status === 400);
  const pdf = await up(new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" }), "x.pdf");
  check("Cloudinary refuses a PDF for identity uploads", pdf.status === 400);
  const replay = (fields) =>
    gp.evaluate(
      async ({ url, headers, body }) =>
        (await fetch(url, { method: "POST", headers, body })).text(),
      {
        url: submitCall.url,
        headers: {
          "next-action": submitCall.headers["next-action"],
          "content-type": submitCall.headers["content-type"],
          accept: "text/x-component",
        },
        body: Object.entries(fields).reduce(
          (b, [k, v]) => b.replace(new RegExp(`"${k}":"[^"]*"`), `"${k}":"${v}"`),
          submitCall.body,
        ),
      },
    );
  const big = await gp.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 1400;
    c.height = 1400;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(1400, 1400);
    for (let i = 0; i < img.data.length; i++) img.data[i] = (Math.random() * 256) | 0;
    ctx.putImageData(img, 0, 0);
    const b = await new Promise((r) => c.toBlob(r, "image/png"));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  const bigUp = await up(new Blob([Uint8Array.from(big)], { type: "image/png" }), "big.png");
  const okSelfie = await up(new Blob([await jpg("selfie")], { type: "image/jpeg" }), "s.jpg");
  check(
    "6+ MB PNG uploaded directly (bypassing the browser)",
    bigUp.status === 200 && bigUp.body.bytes > 5 * 1024 * 1024,
  );
  const bigRes = await replay({
    idFrontPublicId: bigUp.body.public_id,
    selfiePublicId: okSelfie.body.public_id,
  });
  check(
    "server rejects the oversized image and deletes both uploads",
    bigRes.includes("couldn't verify your photos") &&
      !(await exists(bigUp.body.public_id)) &&
      !(await exists(okSelfie.body.public_id)),
  );
  const foreign = await replay({
    idFrontPublicId: `${CLD}/identity/${users.owner.id}/someone-elses`,
    selfiePublicId: `${CLD}/proofs/${users.leaver.id}/x`,
  });
  check(
    "server rejects files outside the user's identity folder",
    foreign.includes("couldn't verify your photos"),
  );
  const noConsent = await gp.evaluate(
    async ({ url, headers, body }) => (await fetch(url, { method: "POST", headers, body })).text(),
    {
      url: submitCall.url,
      headers: {
        "next-action": submitCall.headers["next-action"],
        "content-type": submitCall.headers["content-type"],
        accept: "text/x-component",
      },
      body: submitCall.body.replace('"consent":true', '"consent":false'),
    },
  );
  check("server requires consent", noConsent.includes("tick the consent box"));

  console.log("\nSupersede: a new submission replaces a pending one");
  const a1 = await up(new Blob([await jpg("front A")], { type: "image/jpeg" }), "a.jpg");
  const a2 = await up(new Blob([await jpg("selfie A")], { type: "image/jpeg" }), "a2.jpg");
  check(
    "first forged submission accepted",
    (
      await replay({ idFrontPublicId: a1.body.public_id, selfiePublicId: a2.body.public_id })
    ).includes("submitted for review"),
  );
  const first = await one(
    "select * from identity_verifications where user_id = $1 and status = 'PENDING'",
    [users.leaver.id],
  );
  const b1 = await up(new Blob([await jpg("front B")], { type: "image/jpeg" }), "b.jpg");
  const b2 = await up(new Blob([await jpg("selfie B")], { type: "image/jpeg" }), "b2.jpg");
  check(
    "second submission accepted",
    (
      await replay({ idFrontPublicId: b1.body.public_id, selfiePublicId: b2.body.public_id })
    ).includes("submitted for review"),
  );
  await sleep(4000);
  const sup = await one(
    "select status, images_deleted_at from identity_verifications where id = $1",
    [first.id],
  );
  check(
    "old one SUPERSEDED and its images deleted immediately",
    sup.status === "SUPERSEDED" &&
      sup.images_deleted_at &&
      !(await exists(first.id_front_public_id)) &&
      !(await exists(first.selfie_public_id)),
  );
  check(
    "only one active check per user",
    (
      await one(
        "select count(*)::int n from identity_verifications where user_id = $1 and status in ('PENDING','APPROVED')",
        [users.leaver.id],
      )
    ).n === 1,
  );

  console.log("\nDaily submission limit (5 per day)");
  const count24 = (
    await one(
      "select count(*)::int n from identity_verifications where user_id = $1 and submitted_at > now() - interval '24 hours'",
      [users.leaver.id],
    )
  ).n;
  check(
    "leaver has 3 submissions today (rejected forgeries don't count)",
    count24 === 3,
    String(count24),
  );
  for (const n of [4, 5]) {
    const x1 = await up(new Blob([await jpg(`front ${n}`)], { type: "image/jpeg" }), "x.jpg");
    const x2 = await up(new Blob([await jpg(`selfie ${n}`)], { type: "image/jpeg" }), "x2.jpg");
    check(
      `submission ${n} allowed`,
      (
        await replay({ idFrontPublicId: x1.body.public_id, selfiePublicId: x2.body.public_id })
      ).includes("submitted for review"),
    );
  }
  const d1 = await up(new Blob([await jpg("front 6")], { type: "image/jpeg" }), "d.jpg");
  const d2 = await up(new Blob([await jpg("selfie 6")], { type: "image/jpeg" }), "d2.jpg");
  const sixth = await replay({
    idFrontPublicId: d1.body.public_id,
    selfiePublicId: d2.body.public_id,
  });
  check(
    "6th submission refused, its uploads deleted",
    sixth.includes("up to 5 times a day") &&
      !(await exists(d1.body.public_id)) &&
      !(await exists(d2.body.public_id)),
  );
  await G.go("/account/verify-identity");
  await G.click("Withdraw and start again");
  await G.click("Withdraw", "dialog[open]");
  check("page shows the daily limit message", await G.waitText("You've reached today's limit"));
  // -------------------------------------------------------------------------------------
  console.log("\nRetention job (simulated dates)");
  const cron = (auth) =>
    fetch(`${baseUrl}/api/cron/identity-retention`, {
      headers: auth ? { authorization: auth } : {},
    });
  check("cron: no secret -> 404", (await cron()).status === 404);
  check(
    "cron: wrong secret -> 404",
    (await cron("Bearer wrong-secret-value-123456")).status === 404,
  );
  const good = `Bearer ${process.env.CRON_SECRET}`;
  // Owner: REJECTED v1 reviewed 91 days ago (due); APPROVED v2 reviewed 89 days ago (not due).
  await q(
    "update identity_verifications set reviewed_at = now() - interval '91 days' where id = $1",
    [v1.id],
  );
  await q(
    "update identity_verifications set reviewed_at = now() - interval '89 days' where id = $1",
    [v2.id],
  );
  // Leaver: upload a pending check, then delete the account (profile row) -> user_id becomes null.
  const r1 = await up(new Blob([await jpg("front L")], { type: "image/jpeg" }), "l.jpg");
  const r2 = await up(new Blob([await jpg("selfie L")], { type: "image/jpeg" }), "l2.jpg");
  await q("delete from identity_verifications where user_id = $1", [users.leaver.id]);
  const okLeave = await replay({
    idFrontPublicId: r1.body.public_id,
    selfiePublicId: r2.body.public_id,
  });
  check(
    "leaver has a pending check before deleting the account",
    okLeave.includes("submitted for review"),
  );
  const leaverRow = await one(
    "select * from identity_verifications where user_id = $1 and status = 'PENDING'",
    [users.leaver.id],
  );
  await q("delete from profiles where id = $1", [users.leaver.id]);
  await admin.auth.admin.deleteUser(users.leaver.id);
  users.leaver.deleted = true;
  const res1 = await cron(good);
  const body1 = await res1.json();
  check(
    "cron with secret runs",
    res1.status === 200 && body1.ok && body1.failed === 0,
    JSON.stringify(body1),
  );
  const r1row = await one(
    "select status, images_deleted_at, id_front_public_id from identity_verifications where id = $1",
    [v1.id],
  );
  check(
    "rejected check 91 days after review: images deleted, record kept",
    r1row.status === "REJECTED" &&
      r1row.images_deleted_at &&
      !r1row.id_front_public_id &&
      !(await exists(v1.id_front_public_id)) &&
      !(await exists(v1.selfie_public_id)),
  );
  const v2row = await one("select images_deleted_at from identity_verifications where id = $1", [
    v2.id,
  ]);
  check(
    "accepted check 89 days after review: images kept",
    !v2row.images_deleted_at && (await exists(v2.id_front_public_id)),
  );
  if (leaverRow) {
    const lr = await one(
      "select user_id, images_deleted_at, full_name_on_id from identity_verifications where id = $1",
      [leaverRow.id],
    );
    check(
      "deleted account: images deleted and name cleared",
      lr.user_id === null &&
        lr.images_deleted_at &&
        lr.full_name_on_id === "Deleted account" &&
        !(await exists(leaverRow.id_front_public_id)),
    );
    await q("delete from identity_verifications where id = $1", [leaverRow.id]);
  } else check("deleted account scenario set up", false);
  await q(
    "update identity_verifications set reviewed_at = now() - interval '91 days' where id = $1",
    [v2.id],
  );
  const body2 = await (await cron(good)).json();
  const v2after = await one(
    "select status, images_deleted_at from identity_verifications where id = $1",
    [v2.id],
  );
  check(
    "accepted check 91 days after review: images deleted, still APPROVED",
    body2.ok &&
      v2after.status === "APPROVED" &&
      v2after.images_deleted_at &&
      !(await exists(v2.id_front_public_id)) &&
      !(await exists(v2.selfie_public_id)),
  );
  await P.go(`/business/e2e-id-${run}-live`);
  check("badge stays after images are deleted", await P.waitText("ID submitted"));
  await A.go(`/admin/identity/${v2.id}`);
  check("admin sees 'Photos deleted' instead of images", await A.waitText("Photos deleted on"));
  const goneImg = await ap.evaluate(
    async (u) => (await fetch(u, { redirect: "manual" })).status,
    `/admin/identity/${v2.id}/image/front`,
  );
  check("image link after deletion -> 404", goneImg === 404);

  console.log("\nEmails stayed in the test outbox");
  const all = outbox();
  check(
    "all emails recorded to the outbox, none to unexpected addresses",
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
  const userIds = Object.values(users)
    .map((u) => u.id)
    .filter(Boolean);
  let files = 0;
  for (const id of userIds) {
    const r = await cloudinary.api.delete_resources_by_prefix(`${CLD}/identity/${id}/`, {
      type: "authenticated",
    });
    files += Object.keys(r.deleted ?? {}).length;
  }
  await q(
    "delete from identity_verifications where user_id = any($1::uuid[]) or reviewed_by_id = any($1::uuid[])",
    [userIds],
  );
  await q("delete from businesses where owner_id = any($1::uuid[])", [userIds]);
  await q("delete from profiles where id = any($1::uuid[])", [userIds]);
  for (const u of Object.values(users))
    if (u.id && !u.deleted) await admin.auth.admin.deleteUser(u.id);
  console.log("  test identity files deleted:", files);
  await browser.close();
  await db.end();
  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
