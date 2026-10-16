// End-to-end test of business onboarding. Real Supabase, DB and Cloudinary. Prints no secrets.
// Usage: node test-business.mjs <projectDir> <baseUrl> <shotsDir>
import crypto from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { axeSource, browserPath } from "./lib/setup.mjs";

const [projectDir, baseUrl, shotsDir] = process.argv.slice(2);
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
const db = new pg.Client({ connectionString: process.env.DIRECT_URL });
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

const run = crypto.randomBytes(3).toString("hex");
const pw = () => `Tst-${crypto.randomBytes(9).toString("base64url")}9a`;
const users = {
  a: { email: `chf-e2e-${run}-owner@example.com`, password: pw(), name: "Ada Owner" },
  b: { email: `chf-e2e-${run}-other@example.com`, password: pw(), name: "Bayo Other" },
};

let failures = 0;
const check = (name, pass, detail = "") => {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const originalSwitch =
  (await q("select payment_required from app_settings where id = 1"))[0]?.payment_required ?? false;
const setSwitch = (on) => q("update app_settings set payment_required = $1 where id = 1", [on]);

const browser = await puppeteer.launch({
  executablePath: browserPath(),
  headless: true,
});

async function newPhonePage() {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 360, height: 800, isMobile: true, hasTouch: true });
  return page;
}

function helpers(page) {
  const h = {
    go: async (p) => {
      const res = await page.goto(baseUrl + p, { waitUntil: "load" });
      await sleep(500);
      return res;
    },
    text: () => page.evaluate(() => document.querySelector("main")?.innerText ?? ""),
    waitText: (t, timeout = 30000) =>
      page
        .waitForFunction(
          (x) => document.querySelector("main")?.innerText.includes(x),
          { timeout },
          t,
        )
        .then(
          () => true,
          () => false,
        ),
    waitUrl: (re, timeout = 30000) =>
      page
        .waitForFunction(
          (src) => new RegExp(src).test(location.pathname + location.search),
          { timeout },
          re.source,
        )
        .then(
          () => true,
          () => false,
        ),
    /** First *visible* match (Next keeps previous pages in the DOM, hidden, for back nav). */
    el: async (sel, timeout = 15000) => {
      await page.waitForFunction(
        (s) => [...document.querySelectorAll(s)].some((e) => e.offsetParent !== null),
        { timeout },
        sel,
      );
      const handle = await page.evaluateHandle(
        (s) => [...document.querySelectorAll(s)].find((e) => e.offsetParent !== null),
        sel,
      );
      return handle.asElement();
    },
    fill: async (values) => {
      for (const [name, value] of Object.entries(values)) {
        const input = await h.el(`main [name="${name}"]`);
        await input.evaluate((e) => (e.value = ""));
        if (value) await input.type(value);
      }
    },
    submitMain: async () => {
      await page.evaluate(() => {
        const forms = [...document.querySelectorAll("main form")].filter(
          (f) => f.offsetParent !== null && !f.closest("details:not([open])"),
        );
        const button = [...forms.at(-1).querySelectorAll("button[type=submit]")].at(-1);
        button.click();
      });
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
            .slice(0, 4)
            .map(
              (e) =>
                `${e.tagName.toLowerCase()}[${Math.round(e.getBoundingClientRect().right)}px] ${String(e.className).slice(0, 70)}`,
            ),
        };
      });
      check(
        `a11y + 360px: ${label}`,
        r.v.length === 0 && !r.overflow,
        [r.overflow ? `overflow: ${r.offenders.join(" || ")}` : "", ...r.v]
          .filter(Boolean)
          .join(" | "),
      );
    },
    shot: (name) =>
      page.screenshot({ path: path.join(shotsDir, `biz-${name}.png`), fullPage: true }),
    upload: async (inputLabel, files) => {
      await page.evaluate(
        async ({ sel, files }) => {
          const input = [...document.querySelectorAll(sel)].find(
            (i) => i.nextElementSibling?.offsetParent !== null,
          );
          const dt = new DataTransfer();
          for (const f of files) {
            const c = document.createElement("canvas");
            c.width = f.w;
            c.height = f.h;
            const ctx = c.getContext("2d");
            const g = ctx.createLinearGradient(0, 0, f.w, f.h);
            g.addColorStop(0, f.color);
            g.addColorStop(1, "#fafafa");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, f.w, f.h);
            ctx.fillStyle = "#111";
            ctx.font = `${Math.round(f.h / 8)}px sans-serif`;
            ctx.fillText(f.name, 20, f.h / 2);
            const blob = await new Promise((r) => c.toBlob(r, f.type, 0.95));
            dt.items.add(new File([blob], f.name, { type: f.type }));
          }
          input.files = dt.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        },
        { sel: `input[data-upload="${inputLabel}"]`, files },
      );
    },
  };
  return h;
}

async function login(page, user, next) {
  const h = helpers(page);
  await h.go(`/login?next=${encodeURIComponent(next)}`);
  await h.fill({ email: user.email, password: user.password });
  await h.submitMain();
  return h.waitUrl(new RegExp(`^${next.replace(/[/?]/g, (c) => "\\" + c)}`));
}

async function cloudCount(userId) {
  const res = await cloudinary.api.resources({
    type: "upload",
    prefix: `${CLD}/users/${userId}/`,
    max_results: 100,
  });
  return res.resources.length;
}

const created = { businessIds: [] };

try {
  for (const key of ["a", "b"]) {
    const u = users[key];
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.name },
    });
    if (error) throw new Error(`createUser failed: ${error.code}`);
    u.id = data.user.id;
  }
  await setSwitch(false);
  const lagos = (await q("select id from states where slug = 'lagos'"))[0].id;
  const ikeja = (await q("select id from lgas where state_id = $1 and slug = 'ikeja'", [lagos]))[0]
    .id;

  // ---------------------------------------------------------------------------------
  console.log("Access");
  const pageA = await newPhonePage();
  const A = helpers(pageA);
  await A.go("/business/new");
  const u0 = new URL(pageA.url());
  check(
    "signed-out /business/new -> /login?next=/business/new",
    u0.pathname === "/login" && u0.searchParams.get("next") === "/business/new",
  );
  check("logs in and returns to /business/new", await login(pageA, users.a, "/business/new"));

  // ---------------------------------------------------------------------------------
  console.log("\nStep 1: Basics (switch OFF)");
  await A.waitText("Business name");
  await A.axe("step 1 basics");
  await A.submitMain();
  check(
    "empty step 1 shows server errors",
    (await A.waitText("Enter your business name.")) &&
      (await A.text()).includes("Choose a category."),
  );
  await A.fill({
    name: "E2E Sparks Electrical",
    tagline: "Wiring, solar and inverters",
    phone: "0803 123 4567",
  });
  await (await A.el('main input[role="combobox"]')).evaluate((e) => e.click());
  await (await A.el('main input[role="combobox"]')).type("Electric");
  await pageA.keyboard.press("Enter");
  check(
    "WhatsApp 'same as phone' is ticked by default",
    await (await A.el('main input[name="sameAsPhone"]')).evaluate((e) => e.checked),
  );
  await A.shot("step1");
  await A.submitMain();
  check(
    "step 1 saves and moves to step 2",
    await A.waitUrl(/\/business\/[0-9a-f-]{36}\/edit\?step=2$/),
  );
  const bizId = new URL(pageA.url()).pathname.split("/")[2];
  created.businessIds.push(bizId);
  let biz = (await q("select * from businesses where id = $1", [bizId]))[0];
  check(
    "created as DRAFT with unique slug",
    biz?.status === "DRAFT" && biz.slug === "e2e-sparks-electrical",
    biz?.slug,
  );
  check(
    "phone and WhatsApp stored as +234",
    biz.phone === "+2348031234567" && biz.whatsapp_number === "+2348031234567",
  );
  const roleA = (await q("select role from profiles where id = $1", [users.a.id]))[0]?.role;
  check("owner role upgraded to BUSINESS_OWNER", roleA === "BUSINESS_OWNER", roleA);
  // The ID check has its own suite (test-identity); here the owner's ID is already accepted.
  await q(
    "insert into identity_verifications (id, user_id, id_type, full_name_on_id, consent_given_at, status, reviewed_at, submitted_at, updated_at) values (gen_random_uuid(), $1, 'NIN_SLIP', 'Test Owner', now(), 'APPROVED', now(), now(), now())",
    [users.a.id],
  );

  // ---------------------------------------------------------------------------------
  console.log("\nStep 2: Location");
  await A.axe("step 2 location");
  await (await A.el('main select[name="stateId"]')).select(String(lagos));
  const lgaOptions = await (
    await A.el('main select[name="lgaId"]')
  ).evaluate((s) => s.options.length - 1);
  check("LGA list filtered to Lagos (20)", lgaOptions === 20, String(lgaOptions));
  await (await A.el('main select[name="lgaId"]')).select(String(ikeja));
  await A.fill({ address: "12 Allen Avenue", area: "Opposite the bank" });
  await A.submitMain();
  check("step 2 saves and moves to step 3", await A.waitUrl(/step=3$/));

  // ---------------------------------------------------------------------------------
  console.log("\nResume after leaving");
  await A.go("/dashboard");
  check(
    "dashboard shows the draft",
    (await A.waitText("E2E Sparks Electrical")) && (await A.text()).includes("Draft"),
  );
  await A.axe("dashboard");
  await pageA.$$eval("main a", (links) =>
    links.find((l) => l.offsetParent !== null && l.textContent.trim().startsWith("Edit")).click(),
  );
  check("'Edit' resumes a draft at its first unfinished step (3)", await A.waitUrl(/step=3$/));

  // ---------------------------------------------------------------------------------
  console.log("\nStep 3: About");
  await A.fill({ description: "Too short" });
  await A.submitMain();
  check("short description rejected", await A.waitText("Write at least 30 characters"));
  await A.fill({
    description:
      "Licensed electricians in Ikeja. House wiring, solar panels and inverter installation, with 1-year workmanship warranty.",
    yearsOfExperience: "7",
    instagram: "@e2esparks",
    website: "e2esparks.com.ng",
  });
  for (const service of ["House wiring", "Inverter installation"]) {
    await (await A.el('main fieldset input:not([type="hidden"]):not([name])')).type(service);
    await pageA.keyboard.press("Enter");
  }
  await (await A.el('main input[name="hoursEnabled"]')).evaluate((e) => e.click());
  await A.axe("step 3 about");
  await A.submitMain();
  check("step 3 saves and moves to step 4", await A.waitUrl(/step=4$/));
  biz = (await q("select * from businesses where id = $1", [bizId]))[0];
  check(
    "services saved",
    JSON.stringify(biz.services) === JSON.stringify(["House wiring", "Inverter installation"]),
    JSON.stringify(biz.services),
  );
  check(
    "social links normalized",
    biz.instagram_url === "https://www.instagram.com/e2esparks" &&
      biz.website_url === "https://e2esparks.com.ng/",
    `${biz.instagram_url} ${biz.website_url}`,
  );
  check(
    "opening hours saved (Sun closed)",
    biz.opening_hours?.mon?.open === "08:00" && biz.opening_hours?.sun === null,
  );

  // ---------------------------------------------------------------------------------
  console.log("\nStep 4: Photos");
  await A.upload("Add logo", [
    { w: 900, h: 900, name: "logo", type: "image/png", color: "#008751" },
  ]);
  await pageA.waitForSelector('img[alt="Logo preview"]', { timeout: 60000 }).catch(() => {});
  biz = (await q("select logo_public_id from businesses where id = $1", [bizId]))[0];
  check(
    "logo uploaded into the user's folder and saved",
    biz.logo_public_id?.startsWith(`${CLD}/users/${users.a.id}/`),
  );
  await A.upload("Add photos", [
    { w: 3200, h: 2400, name: "big-job", type: "image/jpeg", color: "#f5820b" },
    { w: 1200, h: 900, name: "job-2", type: "image/jpeg", color: "#3355ff" },
    { w: 1000, h: 1000, name: "job-3", type: "image/jpeg", color: "#aa2266" },
  ]);
  check("3 work photos uploaded with progress", await A.waitText("3 of 12 added", 90000));
  let photos = await q(
    "select id, width, height, public_id, sort_order from business_photos where business_id = $1 order by sort_order",
    [bizId],
  );
  check(
    "large photo resized in the browser to <= 1600px",
    Math.max(...photos.map((p) => Math.max(p.width, p.height))) <= 1600,
    photos.map((p) => `${p.width}x${p.height}`).join(", "),
  );
  await A.axe("step 4 photos");
  await A.shot("step4");

  const firstCaption = `main input[id="caption-${photos[0].id}"]`;
  await (await A.el(firstCaption)).type("Full house rewiring in Ikeja");
  await (await A.el(firstCaption)).evaluate((e) => e.blur());
  await sleep(2500);
  check(
    "caption saved",
    (await q("select caption from business_photos where id = $1", [photos[0].id]))[0]?.caption ===
      "Full house rewiring in Ikeja",
  );

  await pageA.$$eval("main button", (b) =>
    b
      .find(
        (x) =>
          x.offsetParent !== null &&
          x.textContent.includes("Move photo 1") &&
          x.textContent.includes("Down"),
      )
      .click(),
  );
  await sleep(3000);
  const reordered = await q(
    "select id from business_photos where business_id = $1 order by sort_order",
    [bizId],
  );
  check(
    "reorder moves photo 1 down",
    reordered[1]?.id === photos[0].id && reordered[0]?.id === photos[1].id,
  );

  const toDelete = photos[2];
  await pageA.$$eval("main button", (b) =>
    b
      .find(
        (x) =>
          x.offsetParent !== null &&
          x.textContent.includes("photo 3") &&
          x.textContent.includes("Delete"),
      )
      .click(),
  );
  await sleep(200);
  await pageA.$$eval("main button", (b) =>
    b.find((x) => x.offsetParent !== null && x.textContent.includes("Tap again to delete")).click(),
  );
  check("photo deleted", await A.waitText("2 of 12 added"));
  let gone = false;
  try {
    await cloudinary.api.resource(toDelete.public_id);
  } catch (e) {
    gone = e?.error?.http_code === 404;
  }
  check("deleted photo removed from Cloudinary", gone);

  // ---------------------------------------------------------------------------------
  console.log("\n12-photo limit (server-side)");
  const before = await cloudCount(users.a.id);
  for (let i = 0; i < 10; i++) {
    await q(
      "insert into business_photos (id, business_id, public_id, width, height, sort_order, updated_at) values (gen_random_uuid(), $1, $2, 100, 100, $3, now())",
      [bizId, `${CLD}/users/${users.a.id}/fake-${run}-${i}`, 100 + i],
    );
  }
  await A.upload("Add photos", [
    { w: 800, h: 600, name: "thirteenth", type: "image/jpeg", color: "#222222" },
  ]);
  check(
    "13th photo rejected by the server",
    await A.waitText("You can add up to 12 work photos", 60000),
  );
  const count12 = Number(
    (await q("select count(*) from business_photos where business_id = $1", [bizId]))[0].count,
  );
  check("database still has 12 photos", count12 === 12, String(count12));
  check(
    "rejected upload deleted from Cloudinary",
    (await cloudCount(users.a.id)) === before,
    `${before} before`,
  );
  await q("delete from business_photos where business_id = $1 and public_id like $2", [
    bizId,
    `%fake-${run}-%`,
  ]);

  // ---------------------------------------------------------------------------------
  console.log("\nStep 5: Review & submit (switch OFF)");
  await A.go(`/business/${bizId}/edit?step=5`);
  check(
    "preview shows the listing",
    (await A.waitText("This is how customers will see your listing")) &&
      (await A.text()).includes("House wiring"),
  );
  await A.axe("step 5 review");
  await A.shot("step5");
  await A.submitMain();
  check("terms required", await A.waitText("Please confirm the listing terms"));
  await (await A.el('main input[name="acceptTerms"]')).evaluate((e) => e.click());
  await A.submitMain();
  check(
    "submitted page shown",
    (await A.waitUrl(/\/submitted$/)) &&
      (await A.waitText("Our team will review your listing and ID")),
  );
  await A.axe("submitted page");
  biz = (await q("select status, submitted_at from businesses where id = $1", [bizId]))[0];
  check(
    "status PENDING_REVIEW with submittedAt",
    biz.status === "PENDING_REVIEW" && biz.submitted_at !== null,
    biz.status,
  );
  await A.go("/dashboard");
  check("dashboard shows 'In review'", await A.waitText("In review"));

  // ---------------------------------------------------------------------------------
  console.log("\nRejection -> resubmit with switch ON (unpaid -> payment gate)");
  await setSwitch(true);
  await q(
    "update businesses set status = 'REJECTED', rejection_reason = 'Please add a clearer cover photo.' where id = $1",
    [bizId],
  );
  await q(
    "insert into moderation_decisions (id, business_id, action, comment) values (gen_random_uuid(), $1, 'REJECTED', 'Please add a clearer cover photo.')",
    [bizId],
  );
  await A.go("/dashboard");
  check(
    "dashboard shows admin comment",
    await A.waitText("Changes requested: Please add a clearer cover photo."),
  );
  await pageA.$$eval("main a", (l) =>
    l.find((x) => x.offsetParent !== null && x.textContent.trim().startsWith("Edit")).click(),
  );
  check(
    "'Edit' opens the wizard with the comment",
    (await A.waitUrl(/step=1$/)) && (await A.waitText("Please add a clearer cover photo.")),
  );
  await A.go(`/business/${bizId}/edit?step=5`);
  await A.waitText("Send for review again");
  await (await A.el('main input[name="acceptTerms"]')).evaluate((e) => e.click());
  await A.submitMain();
  check("unpaid resubmit with switch ON goes to /pay", await A.waitUrl(/\/pay$/));
  check("pay page shows ₦5,000", await A.waitText("₦5,000"));
  await A.axe("pay page");
  await A.shot("pay");
  await pageA.$$eval("main button", (b) =>
    b
      .find((x) => x.offsetParent !== null && x.textContent.includes("Pay by bank transfer"))
      .click(),
  );
  check(
    "choosing bank transfer shows the account and reference",
    await A.waitText("Put this reference"),
  );
  biz = (await q("select status, published_at from businesses where id = $1", [bizId]))[0];
  check(
    "status PENDING_PAYMENT, never published",
    biz.status === "PENDING_PAYMENT" && biz.published_at === null,
    biz.status,
  );
  await A.go("/dashboard");
  check(
    "dashboard shows 'Awaiting payment' + Pay",
    (await A.waitText("Awaiting payment")) && (await A.text()).includes("Pay"),
  );

  console.log("\nAlready paid -> never charged again");
  await q(
    "insert into payments (id, business_id, user_id, amount_kobo, reference, status, paid_at, updated_at) values (gen_random_uuid(), $1, $2, 500000, $3, 'SUCCESS', now(), now())",
    [bizId, users.a.id, `e2e-${run}`],
  );
  await A.go(`/business/${bizId}/pay`);
  check("pay page recognizes the payment", await A.waitText("already paid the listing fee"));
  await (await A.el('main input[name="acceptTerms"]')).evaluate((e) => e.click());
  await A.submitMain();
  check("paid listing goes to review, not payment", await A.waitUrl(/\/submitted$/));
  check(
    "status PENDING_REVIEW (never APPROVED)",
    (await q("select status from businesses where id = $1", [bizId]))[0].status ===
      "PENDING_REVIEW",
  );
  await q("update businesses set status = 'REJECTED' where id = $1", [bizId]);
  await A.go(`/business/${bizId}/edit?step=5`);
  await (await A.el('main input[name="acceptTerms"]')).evaluate((e) => e.click());
  await A.submitMain();
  check("re-rejected paid listing resubmits without payment", await A.waitUrl(/\/submitted$/));

  // ---------------------------------------------------------------------------------
  console.log("\nNew listing with switch ON (full flow)");
  await A.go("/business/new");
  await A.fill({ name: "E2E Glam Studio", phone: "0812 345 6789" });
  await (await A.el('main input[role="combobox"]')).evaluate((e) => e.click());
  await (await A.el('main input[role="combobox"]')).type("Makeup");
  await pageA.keyboard.press("Enter");
  await A.submitMain();
  await A.waitUrl(/step=2$/);
  const biz2 = new URL(pageA.url()).pathname.split("/")[2];
  created.businessIds.push(biz2);
  await (await A.el('main select[name="stateId"]')).select(String(lagos));
  await (await A.el('main select[name="lgaId"]')).select(String(ikeja));
  await A.fill({ address: "5 Opebi Road" });
  await A.submitMain();
  await A.waitUrl(/step=3$/);
  await A.fill({
    description: "Bridal and event makeup in Ikeja, home service available across Lagos.",
  });
  await A.submitMain();
  await A.waitUrl(/step=4$/);
  await A.upload("Add logo", [
    { w: 600, h: 600, name: "glam", type: "image/png", color: "#aa2266" },
  ]);
  await pageA.waitForSelector('img[alt="Logo preview"]', { timeout: 60000 }).catch(() => {});
  await A.go(`/business/${biz2}/edit?step=5`);
  await (await A.el('main input[name="acceptTerms"]')).evaluate((e) => e.click());
  await A.submitMain();
  check("new listing with switch ON -> /pay", await A.waitUrl(/\/pay$/));
  check(
    "status PENDING_PAYMENT",
    (await q("select status from businesses where id = $1", [biz2]))[0].status ===
      "PENDING_PAYMENT",
  );

  console.log("\nSwitch turned OFF while awaiting payment");
  await setSwitch(false);
  await A.go(`/business/${biz2}/pay`);
  check("pay page says no payment needed", await A.waitText("isn't required right now"));
  await (await A.el('main input[name="acceptTerms"]')).evaluate((e) => e.click());
  await A.submitMain();
  check(
    "goes to review without paying",
    (await A.waitUrl(/\/submitted$/)) &&
      (await q("select status from businesses where id = $1", [biz2]))[0].status ===
        "PENDING_REVIEW",
  );

  // ---------------------------------------------------------------------------------
  console.log("\nEditing a live listing -> needsRecheck");
  await q(
    "update businesses set status = 'APPROVED', needs_recheck = false, published_at = now() where id = $1",
    [bizId],
  );
  await A.go(`/business/${bizId}/edit?step=1`);
  await A.waitText("Your listing is live");
  await A.fill({ tagline: "Wiring, solar, inverters and CCTV" });
  await A.submitMain();
  await A.waitUrl(/step=2$/);
  biz = (
    await q("select status, needs_recheck, tagline from businesses where id = $1", [bizId])
  )[0];
  check(
    "edit saved, still APPROVED, needsRecheck = true",
    biz.status === "APPROVED" && biz.needs_recheck === true && biz.tagline.includes("CCTV"),
  );

  console.log("\nSuspended listing");
  await q("update businesses set status = 'SUSPENDED' where id = $1", [bizId]);
  await A.go(`/business/${bizId}/edit?step=1`);
  check(
    "suspended listing can't be edited",
    (await A.waitText("suspended and can't be edited")) &&
      !(await pageA.evaluate(() =>
        [...document.querySelectorAll('main input[name="name"]')].some(
          (e) => e.offsetParent !== null,
        ),
      )),
  );
  await A.go("/dashboard");
  await A.waitText("Suspended");
  const suspendedCardHasEdit = await pageA.evaluate((name) => {
    const card = [...document.querySelectorAll("main li")].find(
      (li) => li.offsetParent !== null && li.innerText.includes(name),
    );
    return [...card.querySelectorAll("a")].some((a) => a.textContent.trim().startsWith("Edit"));
  }, "E2E Sparks Electrical");
  check("dashboard hides Edit for suspended listing", !suspendedCardHasEdit);
  await q("update businesses set status = 'APPROVED' where id = $1", [bizId]);

  // ---------------------------------------------------------------------------------
  console.log("\nAnother user cannot touch it");
  const pageB = await newPhonePage();
  const B = helpers(pageB);
  await login(pageB, users.b, "/dashboard");
  for (const p of [
    `/business/${bizId}/edit?step=1`,
    `/business/${bizId}/pay`,
    `/business/${bizId}/submitted`,
  ]) {
    await B.go(p);
    check(
      `other user gets 404 on ${p.replace(bizId, "<id>")}`,
      await B.waitText("We couldn't find that page", 15000),
    );
  }
  // B creates their own draft, then forges the step-1 action with A's business id.
  await B.go("/business/new");
  await B.fill({ name: "E2E Bayo Barbers", phone: "0905 111 2222" });
  await (await B.el('main input[role="combobox"]')).evaluate((e) => e.click());
  await (await B.el('main input[role="combobox"]')).type("Barber");
  await pageB.keyboard.press("Enter");
  await B.submitMain();
  await B.waitUrl(/step=2$/);
  const bizB = new URL(pageB.url()).pathname.split("/")[2];
  created.businessIds.push(bizB);
  await B.go(`/business/${bizB}/edit?step=1`);
  await B.waitText("Business name");
  let forged = false;
  await pageB.setRequestInterception(true);
  pageB.on("request", (req) => {
    const body = req.postData();
    if (req.method() === "POST" && body && body.includes(bizB)) {
      forged = true;
      req.continue({ postData: body.split(bizB).join(bizId) });
    } else req.continue();
  });
  await B.fill({ name: "Hacked Name" });
  await B.submitMain();
  const blocked = await B.waitText("We couldn't find that business", 20000);
  await pageB.setRequestInterception(false);
  check("forged request carried A's business id", forged);
  check("server rejects editing another user's business", blocked);
  check(
    "A's business unchanged",
    (await q("select name from businesses where id = $1", [bizId]))[0].name ===
      "E2E Sparks Electrical",
  );

  // ---------------------------------------------------------------------------------
  console.log("\n5-business limit");
  await A.go("/business/new");
  await A.waitText("Business name");
  const cat = (await q("select id from categories where slug = 'electricians'"))[0].id;
  for (let i = 0; i < 3; i++) {
    const id = crypto.randomUUID();
    created.businessIds.push(id);
    await q(
      "insert into businesses (id, owner_id, name, slug, category_id, phone, whatsapp_number, updated_at) values ($1, $2, $3, $4, $5, '+2348031234567', '+2348031234567', now())",
      [id, users.a.id, `E2E Filler ${i}`, `e2e-filler-${run}-${i}`, cat],
    );
  }
  await A.fill({ name: "E2E Sixth Business", phone: "0803 123 4567" });
  await (await A.el('main input[role="combobox"]')).evaluate((e) => e.click());
  await (await A.el('main input[role="combobox"]')).type("Plumb");
  await pageA.keyboard.press("Enter");
  await A.submitMain();
  check("server refuses a 6th business", await A.waitText("You can list up to 5 businesses"));
  await A.go("/business/new");
  check("/business/new shows the limit", await A.waitText("reached the limit of 5 businesses"));
  check(
    "still 5 businesses",
    Number(
      (await q("select count(*) from businesses where owner_id = $1", [users.a.id]))[0].count,
    ) === 5,
  );

  await A.go("/");
  await (await A.el('button[aria-haspopup="dialog"]')).evaluate((e) => e.click());
  await sleep(300);
  check(
    "mobile menu has 'My businesses'",
    (await pageA.evaluate(() => document.querySelector("dialog").innerText)).includes(
      "My businesses",
    ),
  );
} finally {
  console.log("\nCleanup");
  await setSwitch(originalSwitch);
  check(
    "payment switch restored",
    (await q("select payment_required from app_settings where id = 1"))[0].payment_required ===
      originalSwitch,
    `payment_required = ${originalSwitch}`,
  );
  const ids = [users.a.id, users.b.id].filter(Boolean);
  await q("delete from payments where user_id = any($1::uuid[])", [ids]);
  const delBiz = await db.query("delete from businesses where owner_id = any($1::uuid[])", [ids]);
  let remaining = 0;
  for (const id of ids) {
    await cloudinary.api.delete_resources_by_prefix(`${CLD}/users/${id}/`);
    remaining += await cloudCount(id);
  }
  check(
    `deleted ${delBiz.rowCount} test businesses; Cloudinary test images removed`,
    remaining === 0,
    `${remaining} left`,
  );
  await q("delete from identity_verifications where user_id = any($1::uuid[])", [ids]);
  await q("delete from profiles where id = any($1::uuid[])", [ids]);
  for (const id of ids) await admin.auth.admin.deleteUser(id);
  const left = (
    await q("select count(*) from profiles where email like $1", [`chf-e2e-${run}-%`])
  )[0].count;
  check("test users and profiles deleted", Number(left) === 0);
  await db.end();
  await browser.close();
}

console.log(`\nResult: ${failures === 0 ? "PASS" : `${failures} failure(s)`}`);
process.exitCode = failures ? 1 : 0;
