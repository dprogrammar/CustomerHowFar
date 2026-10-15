// End-to-end test of bank-transfer payments. Real DB/Supabase/Cloudinary; emails to a test
// outbox. Only data owned by the test users is created and deleted.
// Usage: node test-payments.mjs <projectDir> <baseUrl> <outboxFile> <shotsDir>
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
const users = {
  owner: {
    email: `chf-e2e-${run}-owner@example.com`,
    password: pw(),
    name: "Ola Owner",
    role: "BUSINESS_OWNER",
  },
  admin: {
    email: `chf-e2e-${run}-admin@example.com`,
    password: pw(),
    name: "Ade Admin",
    role: "ADMIN",
  },
  other: {
    email: `chf-e2e-${run}-other@example.com`,
    password: pw(),
    name: "Nne Other",
    role: "CUSTOMER",
  },
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

const original = await one("select * from app_settings where id = 1");
const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true });

async function newPage(width = 360) {
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions(baseUrl, ["clipboard-read", "clipboard-write"]);
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
    fill: async (name, value) => {
      const el = await page.waitForSelector(`main [name="${name}"]`, { visible: true });
      await el.evaluate((e) => (e.value = ""));
      await el.type(value);
    },
    setFile: async (spec) => {
      await page.evaluate(async (spec) => {
        const input = [...document.querySelectorAll('main input[type="file"]')].find(
          (i) => i.offsetParent !== null,
        );
        let blob;
        if (spec.kind === "jpg") {
          const c = document.createElement("canvas");
          c.width = 900;
          c.height = 1400;
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, 900, 1400);
          ctx.fillStyle = "#008751";
          ctx.font = "bold 60px sans-serif";
          ctx.fillText("Transfer successful", 100, 300);
          ctx.fillText(spec.label, 100, 420);
          blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
        } else if (spec.kind === "pdf") {
          const pdf =
            "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 18 Tf 20 100 Td (Receipt OK) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\nxref\n0 6\n0000000000 65535 f \ntrailer<</Size 6/Root 1 0 R>>\n%%EOF";
          blob = new Blob([pdf], { type: "application/pdf" });
        } else if (spec.kind === "bigpdf") {
          blob = new Blob(["%PDF-1.4\n", new Uint8Array(6 * 1024 * 1024)], {
            type: "application/pdf",
          });
        } else {
          blob = new Blob(["GIF89a"], { type: "image/gif" });
        }
        const dt = new DataTransfer();
        dt.items.add(new File([blob], spec.name, { type: blob.type }));
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, spec);
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
      page.screenshot({ path: path.join(shotsDir, `pay-${name}.png`), fullPage: true }),
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
async function insertBusiness(key, extra = {}) {
  const id = crypto.randomUUID();
  ids[key] = id;
  const cat = (await one("select id from categories where slug = 'fashion-tailoring'")).id;
  const state = (await one("select id from states where slug = 'lagos'")).id;
  const lga = (await one("select id from lgas where state_id = $1 and slug = 'ikeja'", [state])).id;
  await q(
    `insert into businesses (id, owner_id, name, slug, category_id, phone, whatsapp_number, address, state_id, lga_id, description, status, fee_required_at_submit, logo_public_id, updated_at)
     values ($1,$2,$3,$4,$5,'+2348039990000','+2348039990000','1 Test Street',$6,$7,'A complete description of more than thirty characters for testing.', $8, true, 'customerhowfar/users/test/none', now())`,
    [
      id,
      users.owner.id,
      `E2E Pay ${key} ${run}`,
      `e2e-pay-${run}-${key.toLowerCase()}`,
      cat,
      state,
      lga,
      extra.status ?? "PENDING_PAYMENT",
    ],
  );
  return id;
}

async function startTransfer(O, key) {
  await O.go(`/business/${ids[key]}/pay`);
  await O.click("Pay by bank transfer");
  await O.waitText("Put this reference");
  const pay = await one(
    "select reference, amount_kobo, status from payments where business_id = $1 and status = 'PENDING'",
    [ids[key]],
  );
  return pay;
}
async function submitProof(O, page, { kind, name }) {
  await O.fill("senderName", "Ola Owner");
  await O.fill("senderBank", "GTBank");
  await O.setFile({ kind, name, label: name });
  await O.click("Submit payment proof");
  return O.waitText("Payment proof submitted, awaiting confirmation", 60000);
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
    if (u.role === "BUSINESS_OWNER")
      await q(
        "insert into identity_verifications (id, user_id, id_type, full_name_on_id, consent_given_at, status, reviewed_at, submitted_at, updated_at) values (gen_random_uuid(), $1, 'NIN_SLIP', $2, now(), 'APPROVED', now(), now(), now())",
        [u.id, u.name],
      );
  }
  await q(
    "update app_settings set payment_required = true, listing_fee_naira = 5000, manual_transfer_enabled = true where id = 1",
  );
  for (const k of ["One", "Two", "Three", "Four", "Five"]) await insertBusiness(k);
  await q(
    "insert into payments (id, business_id, user_id, amount_kobo, reference, status, provider, paid_at, updated_at) values (gen_random_uuid(), $1, $2, 500000, $3, 'SUCCESS', 'MANUAL_TRANSFER', now(), now())",
    [ids.Four, users.owner.id, `CHF-T${run.toUpperCase().slice(0, 5)}`],
  );
  if (fs.existsSync(outboxFile)) fs.unlinkSync(outboxFile);
  const settings = await one(
    "select bank_name, bank_account_number, bank_account_name from app_settings where id = 1",
  );
  check(
    "bank details seeded",
    Boolean(settings.bank_name && settings.bank_account_name) &&
      /^\d{10}$/.test(settings.bank_account_number ?? ""),
  );

  // -------------------------------------------------------------------------------------
  console.log("\nOwner: choose method, transfer details, image proof");
  const op = await newPage();
  const O = helpers(op);
  const ownerActions = [];
  const uploadResponses = [];
  op.on("response", async (r) => {
    if (r.url().startsWith("https://api.cloudinary.com/") && r.request().method() === "POST") {
      try {
        uploadResponses.push(await r.json());
      } catch {}
    }
  });
  op.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"])
      ownerActions.push({ url: r.url(), headers: r.headers(), body: r.postData() });
  });
  check("owner logs in", await login(op, users.owner, "/dashboard"));
  await O.go(`/business/${ids.One}/pay`);
  check(
    "pay page shows fee and method card",
    (await O.waitText("₦5,000")) && (await O.text()).includes("Pay by bank transfer"),
  );
  await O.axe("pay: choose method");
  const p1 = await startTransfer(O, "One");
  const t1 = await O.text();
  check(
    "transfer details: bank, account, name, amount, reference",
    t1.includes(settings.bank_name) &&
      t1.includes(settings.bank_account_number) &&
      t1.includes(settings.bank_account_name) &&
      t1.includes("₦5,000") &&
      t1.includes(p1.reference),
  );
  check("reference format CHF-XXXXXX", /^CHF-[A-HJ-NP-Z2-9]{6}$/.test(p1.reference), p1.reference);
  await op.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async (t) => {
        window.__copied = t;
      },
    }),
  );
  await O.click("Copy");
  await sleep(300);
  check(
    "copy button copies the account number",
    (await op.evaluate(() => window.__copied)) === settings.bank_account_number,
  );
  await O.go(`/business/${ids.One}/pay`);
  check(
    "reference stays the same on revisit",
    (await O.text()).includes(p1.reference) &&
      (await q("select count(*)::int n from payments where business_id = $1", [ids.One]))[0].n ===
        1,
  );
  await O.axe("pay: transfer instructions");
  await O.shot("transfer-360");

  console.log("\nClient-side file checks");
  await O.setFile({ kind: "gif", name: "receipt.gif" });
  check("GIF refused", await O.waitText("That file type isn't allowed", 5000));
  await O.setFile({ kind: "bigpdf", name: "huge.pdf" });
  check("PDF over 5 MB refused", await O.waitText("larger than 5 MB", 5000));

  check(
    "image proof submitted",
    await submitProof(O, op, { kind: "jpg", name: "receipt-one.jpg" }),
  );
  let pay1 = await one("select * from payments where reference = $1", [p1.reference]);
  check(
    "payment AWAITING_CONFIRMATION with sender details",
    pay1.status === "AWAITING_CONFIRMATION" &&
      pay1.sender_name === "Ola Owner" &&
      pay1.sender_bank === "GTBank" &&
      pay1.amount_sent_kobo === 500000 &&
      pay1.proof_public_id?.startsWith(`${CLD}/proofs/${users.owner.id}/`),
  );
  check(
    "business stays PENDING_PAYMENT",
    (await one("select status from businesses where id = $1", [ids.One])).status ===
      "PENDING_PAYMENT",
  );
  await O.axe("pay: awaiting confirmation");
  check(
    "owner emailed 'proof received'",
    Boolean(
      await waitEmail(
        "proof-received",
        (m) => m.to.email === users.owner.email && m.text.includes(p1.reference),
      ),
    ),
  );
  check(
    "admin emailed 'transfer to confirm'",
    Boolean(
      await waitEmail(
        "admin-transfer-proof",
        (m) => m.to.email === process.env.ADMIN_NOTIFY_EMAIL && m.text.includes(p1.reference),
      ),
    ),
  );
  await O.go("/dashboard");
  check(
    "dashboard: awaiting confirmation + reference",
    (await O.waitText("Payment proof submitted, awaiting confirmation")) &&
      (await O.text()).includes(p1.reference),
  );

  console.log("\nProofs are private");
  const res = await cloudinary.api.resource(pay1.proof_public_id, {
    resource_type: "image",
    type: "authenticated",
  });
  check("stored as an authenticated (private) Cloudinary asset", res.type === "authenticated");
  for (const url of [
    `https://res.cloudinary.com/${CLOUD}/image/upload/${pay1.proof_public_id}.${pay1.proof_format}`,
    `https://res.cloudinary.com/${CLOUD}/image/authenticated/${pay1.proof_public_id}.${pay1.proof_format}`,
  ]) {
    const r = await fetch(url);
    check(
      `raw URL not publicly viewable (${r.status})`,
      r.status === 401 || r.status === 404,
      url.replace(CLOUD, "<cloud>").replace(pay1.proof_public_id, "<proof>"),
    );
  }
  const browserCopy = uploadResponses.find((u) => u.secure_url && u.type === "authenticated");
  const leaked = browserCopy ? await fetch(browserCopy.secure_url) : null;
  check(
    "the signed URL the browser got at upload no longer works (proof was sealed)",
    leaked && (leaked.status === 404 || leaked.status === 401),
    String(leaked?.status),
  );
  check(
    "stored proof ID differs from the uploaded one",
    browserCopy && browserCopy.public_id !== pay1.proof_public_id,
  );
  const anonProof = await fetch(`${baseUrl}/admin/payments/${pay1.id}/proof`, {
    redirect: "manual",
  });
  check("proof viewer: signed-out -> 404", anonProof.status === 404, String(anonProof.status));
  const np = await newPage();
  const N = helpers(np);
  check("other user logs in", await login(np, users.other, "/account"));
  const nonAdminProof = await np.evaluate(
    async (u) => (await fetch(u, { redirect: "manual" })).status,
    `/admin/payments/${pay1.id}/proof`,
  );
  check("proof viewer: non-admin -> 404", nonAdminProof === 404, String(nonAdminProof));
  const nonAdminPage = await N.go(`/admin/payments/${pay1.id}`);
  check("non-admin: /admin/payments/<id> -> 404", nonAdminPage.status() === 404);

  // -------------------------------------------------------------------------------------
  console.log("\nAdmin: queue, detail, confirm");
  const ap = await newPage();
  const A = helpers(ap);
  const adminActions = [];
  ap.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"])
      adminActions.push({ url: r.url(), headers: r.headers(), body: r.postData() });
  });
  check("admin logs in", await login(ap, users.admin, "/account"));
  await A.go("/admin");
  check("overview shows 'Transfers to confirm'", await A.waitText("Transfers to confirm"));
  await A.go("/admin/payments?tab=confirm");
  check("queue lists the transfer", await A.waitText(p1.reference));
  await A.axe("admin payments list");
  await A.go(`/admin/payments/${pay1.id}`);
  const dt = await A.text();
  check(
    "detail: sender, amount, reference, reminder",
    dt.includes("Ola Owner") &&
      dt.includes("GTBank") &&
      dt.includes("₦5,000") &&
      dt.includes(p1.reference) &&
      dt.includes(
        "Confirm the money is in your bank account before confirming. Receipts can be faked.",
      ),
  );
  const proofRes = await ap.evaluate(async (u) => {
    const r = await fetch(u, { redirect: "manual" });
    return { status: r.status, type: r.type };
  }, `/admin/payments/${pay1.id}/proof`);
  check(
    "admin proof viewer redirects to a signed URL",
    proofRes.type === "opaqueredirect" || proofRes.status === 302,
    JSON.stringify(proofRes),
  );
  const imgLoaded = await ap
    .waitForFunction(
      () => {
        const i = document.querySelector('main img[alt^="Payment proof"]');
        return i && i.complete && i.naturalWidth > 0;
      },
      { timeout: 20000 },
    )
    .then(
      () => true,
      () => false,
    );
  check("proof image displays for admin", imgLoaded);
  await A.axe("admin payment detail");
  await A.shot("admin-detail-360");
  await A.click("Confirm payment");
  await A.click("Yes, the money is in the account", "dialog[open]");
  check(
    "confirm message",
    await A.waitText("Payment confirmed. The listing is now in the review queue"),
  );
  pay1 = await one("select * from payments where id = $1", [pay1.id]);
  let b1 = await one("select status, submitted_at from businesses where id = $1", [ids.One]);
  check(
    "payment SUCCESS (paidAt, reviewer) and business -> PENDING_REVIEW",
    pay1.status === "SUCCESS" &&
      pay1.paid_at &&
      pay1.reviewed_by_id === users.admin.id &&
      b1.status === "PENDING_REVIEW" &&
      b1.submitted_at,
  );
  check(
    "receipt emailed to owner",
    Boolean(
      await waitEmail(
        "payment-receipt",
        (m) =>
          m.text.includes(p1.reference) &&
          m.text.includes("Bank transfer") &&
          m.text.includes(`E2E Pay One ${run}`),
      ),
    ),
  );
  const confirmCall = adminActions.find(
    (c) => c.body?.includes(pay1.id) && c.body.includes('"approve":false'),
  );
  const again = await ap.evaluate(
    async ({ url, headers, body }) => (await fetch(url, { method: "POST", headers, body })).text(),
    {
      url: confirmCall.url,
      headers: {
        "next-action": confirmCall.headers["next-action"],
        "content-type": confirmCall.headers["content-type"],
        accept: "text/x-component",
      },
      body: confirmCall.body,
    },
  );
  const pay1b = await one("select status, paid_at, updated_at from payments where id = $1", [
    pay1.id,
  ]);
  check(
    "confirming twice changes nothing",
    again.includes("already confirmed") &&
      pay1b.paid_at.getTime() === pay1.paid_at.getTime() &&
      pay1b.updated_at.getTime() === pay1.updated_at.getTime(),
  );
  const nonAdminConfirm = await np.evaluate(
    async ({ url, headers, body }) => (await fetch(url, { method: "POST", headers, body })).status,
    {
      url: confirmCall.url,
      headers: {
        "next-action": confirmCall.headers["next-action"],
        "content-type": confirmCall.headers["content-type"],
        accept: "text/x-component",
      },
      body: confirmCall.body,
    },
  );
  check("non-admin can't call confirm (404)", nonAdminConfirm === 404, String(nonAdminConfirm));
  await A.go(`/admin/listings/${ids.One}`);
  check(
    "listing detail links to the payment",
    await ap.evaluate(
      (pid) =>
        [...document.querySelectorAll("main a")].some(
          (a) => a.getAttribute("href") === `/admin/payments/${pid}`,
        ),
      pay1.id,
    ),
  );

  // -------------------------------------------------------------------------------------
  console.log("\nPDF proof -> confirm and approve");
  const p2 = await startTransfer(O, "Two");
  check("PDF proof submitted", await submitProof(O, op, { kind: "pdf", name: "receipt-two.pdf" }));
  const pay2 = await one("select * from payments where reference = $1", [p2.reference]);
  check(
    "PDF stored as private proof",
    pay2.proof_format === "pdf" && pay2.status === "AWAITING_CONFIRMATION",
  );
  await A.go(`/admin/payments/${pay2.id}`);
  check("PDF shown in viewer", Boolean(await ap.$('main iframe[title*="PDF"]')));
  await A.click("Confirm payment and approve listing");
  await A.click("Confirm and approve", "dialog[open]");
  check("confirm-and-approve message", await A.waitText("Payment confirmed and listing approved"));
  const b2 = await one("select status, published_at from businesses where id = $1", [ids.Two]);
  check(
    "listing APPROVED and published, payment SUCCESS",
    b2.status === "APPROVED" &&
      b2.published_at &&
      (await one("select status from payments where id = $1", [pay2.id])).status === "SUCCESS",
  );
  check(
    "approval recorded in moderation history",
    (await one("select action from moderation_decisions where business_id = $1", [ids.Two]))
      ?.action === "APPROVED",
  );
  check(
    "receipt + 'listing is live' emails",
    Boolean(
      await waitEmail(
        "payment-receipt",
        (m) => m.text.includes(p2.reference) && m.text.includes("approved"),
      ),
    ) &&
      Boolean(await waitEmail("listing-approved", (m) => m.subject.includes(`E2E Pay Two ${run}`))),
  );

  // -------------------------------------------------------------------------------------
  console.log("\nReject proof -> re-upload; withdraw");
  const p3 = await startTransfer(O, "Three");
  await submitProof(O, op, { kind: "jpg", name: "receipt-three.jpg" });
  const pay3 = await one("select id from payments where reference = $1", [p3.reference]);
  await A.go(`/admin/payments/${pay3.id}`);
  await A.click("Reject proof");
  await ap.waitForSelector("dialog[open]");
  check(
    "reason required",
    await ap.evaluate(
      () =>
        [...document.querySelectorAll("dialog[open] button")].find((b) =>
          b.textContent.includes("Reject proof"),
        ).disabled,
    ),
  );
  await A.click("Money not received", "dialog[open]");
  await A.click("Reject proof", "dialog[open]");
  check("rejected", await A.waitText("Proof rejected."));
  const rej = await one(
    "select status, rejection_reason, reviewed_by_id from payments where id = $1",
    [pay3.id],
  );
  check(
    "payment FAILED with reason and reviewer",
    rej.status === "FAILED" &&
      rej.rejection_reason.includes("haven't received") &&
      rej.reviewed_by_id === users.admin.id,
  );
  check(
    "owner emailed the reason",
    Boolean(await waitEmail("proof-rejected", (m) => m.text.includes("haven't received"))),
  );
  await O.go("/dashboard");
  check(
    "dashboard shows rejection reason",
    (await O.waitText("Payment proof not accepted")) &&
      (await O.text()).includes("haven't received"),
  );
  await O.go(`/business/${ids.Three}/pay`);
  check("pay page shows the reason", await O.waitText("We couldn't confirm your last payment"));
  const p3b = await startTransfer(O, "Three");
  check("new payment with a new reference", p3b.reference !== p3.reference);
  await submitProof(O, op, { kind: "jpg", name: "wrong-file.jpg" });
  const wrong = await one("select id, proof_public_id from payments where reference = $1", [
    p3b.reference,
  ]);
  await O.click("Withdraw and correct");
  await O.click("Withdraw proof", "dialog[open]");
  await O.waitText("Put this reference");
  const withdrawn = await one("select status, proof_public_id from payments where id = $1", [
    wrong.id,
  ]);
  let gone = false;
  try {
    await cloudinary.api.resource(wrong.proof_public_id, {
      resource_type: "image",
      type: "authenticated",
    });
  } catch (e) {
    gone = e?.error?.http_code === 404;
  }
  check(
    "withdraw returns to PENDING (same reference) and deletes the file",
    withdrawn.status === "PENDING" && !withdrawn.proof_public_id && gone,
  );
  check(
    "re-upload after withdraw",
    await submitProof(O, op, { kind: "jpg", name: "correct-file.jpg" }),
  );
  check(
    "only one proof awaiting per business",
    (
      await one(
        "select count(*)::int n from payments where business_id = $1 and status = 'AWAITING_CONFIRMATION'",
        [ids.Three],
      )
    ).n === 1,
  );

  // -------------------------------------------------------------------------------------
  console.log("\nServer-side proof verification (forged requests)");
  const submitCall = ownerActions.find(
    (c) => c.body?.includes("proofPublicId") && c.body.includes(ids.One),
  );
  await startTransfer(O, "Five");
  const sig = await op.evaluate(async () =>
    (await fetch("/api/uploads/sign-proof", { method: "POST" })).json(),
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
  const gif = await up(
    new Blob(
      [Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64")],
      { type: "image/gif" },
    ),
    "x.gif",
  );
  check("Cloudinary refuses a GIF even with a valid signature", gif.status === 400);
  const big = await op.evaluate(async () => {
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
  check(
    "6+ MB PNG uploaded directly (bypassing the browser check)",
    bigUp.status === 200 && bigUp.body.bytes > 5 * 1024 * 1024,
    `${bigUp.status} ${bigUp.body.bytes}`,
  );
  const replay = async (publicId) =>
    op.evaluate(
      async ({ url, headers, body }) =>
        (await fetch(url, { method: "POST", headers, body })).text(),
      {
        url: submitCall.url,
        headers: {
          "next-action": submitCall.headers["next-action"],
          "content-type": submitCall.headers["content-type"],
          accept: "text/x-component",
        },
        body: submitCall.body
          .replaceAll(ids.One, ids.Five)
          .replace(/"proofPublicId":"[^"]+"/, `"proofPublicId":"${publicId}"`),
      },
    );
  const bigRes = await replay(bigUp.body.public_id);
  let bigGone = false;
  try {
    await cloudinary.api.resource(bigUp.body.public_id, {
      resource_type: "image",
      type: "authenticated",
    });
  } catch (e) {
    bigGone = e?.error?.http_code === 404;
  }
  check(
    "server rejects the oversized proof and deletes it",
    bigRes.includes("couldn't verify") && bigGone,
  );
  const foreign = await replay(`${CLD}/proofs/${users.other.id}/someone-elses-file`);
  check("server rejects a file outside the owner's folder", foreign.includes("couldn't verify"));
  check(
    "payment for that business still waiting for a proof",
    (await one("select status from payments where business_id = $1", [ids.Five])).status ===
      "PENDING",
  );

  // -------------------------------------------------------------------------------------
  console.log("\nAlready paid -> never charged again");
  await O.go(`/business/${ids.Four}/pay`);
  check("pay page says already paid", await O.waitText("already paid the listing fee"));
  const startCall = ownerActions.find(
    (c) => c.body?.includes(ids.One) && !c.body.includes("proofPublicId"),
  );
  const startPaid = await op.evaluate(
    async ({ url, headers, body }) => (await fetch(url, { method: "POST", headers, body })).text(),
    {
      url: startCall.url,
      headers: {
        "next-action": startCall.headers["next-action"],
        "content-type": startCall.headers["content-type"],
        accept: "text/x-component",
      },
      body: startCall.body.replaceAll(ids.One, ids.Four),
    },
  );
  check(
    "starting a payment for a paid business is refused",
    startPaid.includes("already paid") &&
      (await one("select count(*)::int n from payments where business_id = $1", [ids.Four])).n ===
        1,
  );

  // -------------------------------------------------------------------------------------
  console.log("\nSettings rules");
  await A.go("/admin/settings");
  await A.waitText("Bank transfer");
  await A.axe("admin settings");
  const switches = await ap.$$('main button[role="switch"]');
  await switches[1].evaluate((e) => e.click()); // bank transfer off while fee is on
  check(
    "UI warns a method is needed while the fee is on",
    await A.waitText("at least one payment method must be enabled", 5000),
  );
  await A.click("Save changes");
  await A.click("Apply now", "dialog[open]");
  check("server refuses to save", await A.waitText("at least one payment method must be enabled"));
  check(
    "database unchanged",
    (await one("select manual_transfer_enabled from app_settings where id = 1"))
      .manual_transfer_enabled === true,
  );
  await A.go("/admin/settings");
  const acct = await ap.waitForSelector('main input[inputmode="numeric"][maxlength="12"]', {
    visible: true,
  });
  await acct.evaluate((e) => (e.value = ""));
  await acct.type("12345");
  check("account number must be 10 digits", await A.waitText("must be exactly 10 digits", 5000));

  console.log("\nOptional business email (step 1) -> Email button");
  await O.go(`/business/${ids.Two}/edit?step=1`);
  await O.fill("email", "hello@example.com");
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
    .waitForFunction(() => location.search.includes("step=2"), { timeout: 20000 })
    .catch(() => {});
  check(
    "email saved",
    (await one("select email from businesses where id = $1", [ids.Two])).email ===
      "hello@example.com",
  );
  const dp = await newPage(1280);
  await helpers(dp).go(`/business/e2e-pay-${run}-two`);
  check(
    "Email button on the public page",
    await dp
      .waitForFunction(
        () =>
          [...document.querySelectorAll("a[href^='mailto:']")].some((a) => a.offsetParent !== null),
        { timeout: 10000 },
      )
      .then(
        () => true,
        () => false,
      ),
  );

  console.log("\nRevenue totals");
  await A.go("/admin/payments?tab=paid");
  const totalRow = await one(
    "select sum(amount_kobo)::int s from payments where status = 'SUCCESS'",
  );
  const shown = await A.text();
  check(
    "all-time revenue matches the database",
    shown.includes(
      new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: "NGN",
        maximumFractionDigits: 0,
      }).format(totalRow.s / 100),
    ),
  );
} finally {
  console.log("\nCleanup");
  await q(
    "update app_settings set payment_required = false, listing_fee_naira = $1, manual_transfer_enabled = true, bank_name = $2, bank_account_number = $3, bank_account_name = $4 where id = 1",
    [
      original.listing_fee_naira,
      original.bank_name,
      original.bank_account_number,
      original.bank_account_name,
    ],
  );
  const userIds = Object.values(users)
    .map((u) => u.id)
    .filter(Boolean);
  for (const id of userIds) {
    await cloudinary.api
      .delete_resources_by_prefix(`${CLD}/proofs/${id}/`, { type: "authenticated" })
      .catch(() => {});
    await cloudinary.api.delete_resources_by_prefix(`${CLD}/users/${id}/`).catch(() => {});
  }
  await q("delete from payments where user_id = any($1::uuid[])", [userIds]);
  const del = await db.query("delete from businesses where owner_id = any($1::uuid[])", [userIds]);
  await q("delete from setting_changes where admin_id = any($1::uuid[])", [userIds]);
  await q(
    "delete from identity_verifications where user_id = any($1::uuid[]) or reviewed_by_id = any($1::uuid[])",
    [userIds],
  );
  await q("delete from profiles where id = any($1::uuid[])", [userIds]);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  let proofsLeft = 0;
  for (const id of userIds)
    proofsLeft += (
      await cloudinary.api.resources({ type: "authenticated", prefix: `${CLD}/proofs/${id}/` })
    ).resources.length;
  const s = await one(
    "select payment_required, manual_transfer_enabled from app_settings where id = 1",
  );
  const real = (await one("select count(*)::int n from businesses")).n;
  check(
    `deleted ${del.rowCount} test businesses, payments, proofs and users; fee OFF, transfer ON; ${real} real listing(s) untouched`,
    proofsLeft === 0 && s.payment_required === false && s.manual_transfer_enabled === true,
  );
  if (fs.existsSync(outboxFile)) fs.unlinkSync(outboxFile);
  await db.end();
  await browser.close();
}
console.log(`\nResult: ${failures === 0 ? "PASS" : `${failures} failure(s)`}`);
process.exitCode = failures ? 1 : 0;
