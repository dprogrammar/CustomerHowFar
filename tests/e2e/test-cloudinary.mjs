// End-to-end test of /api/uploads/sign against real Cloudinary. Prints no secret values.
// Usage: node test-cloudinary.mjs <project-dir> <base-url>
import crypto from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { browserPath } from "./lib/setup.mjs";

const [projectDir, baseUrl] = process.argv.slice(2);
const require = createRequire(path.join(projectDir, "package.json"));
require("./scripts/env-guard.mjs").loadEnv(); // refuses production
const CLD = process.env.CLOUDINARY_FOLDER || "customerhowfar"; // dev: dev/customerhowfar
const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqO+vBwAEbgHA8FnF1AAAAABJRU5ErkJggg==",
  "base64",
);
const GIF_1x1 = Buffer.from(
  "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64",
);

const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`  ${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
};
const cleanErr = (m) =>
  String(m ?? "")
    .split(process.env.CLOUDINARY_API_SECRET)
    .join("***");

async function upload(sig, file, filename, mime, overrides = {}) {
  const form = new FormData();
  form.append("file", new Blob([file], { type: mime }), filename);
  form.append("api_key", sig.apiKey);
  form.append("timestamp", String(sig.timestamp));
  form.append("signature", sig.signature);
  form.append("folder", overrides.folder ?? sig.folder);
  form.append("allowed_formats", overrides.allowedFormats ?? sig.allowedFormats);
  for (const [k, v] of Object.entries(overrides.extra ?? {})) form.append(k, v);
  const res = await fetch(sig.uploadUrl, { method: "POST", body: form });
  return { status: res.status, body: await res.json() };
}

// A test account (signing an upload requires a signed-in user); deleted at the end.
const { createClient } = require("@supabase/supabase-js");
const pg = require("pg");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = new pg.Client({ connectionString: process.env.DIRECT_URL });
await db.connect();
const user = {
  email: `chf-e2e-${crypto.randomBytes(3).toString("hex")}-uploader@example.com`,
  password: `Tst-${crypto.randomBytes(9).toString("base64url")}9a`,
};
const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true });

/** Signs in through the real login form; returns the page. */
async function signedInPage() {
  const page = await (await browser.createBrowserContext()).newPage();
  await page.goto(`${baseUrl}/login?next=%2Faccount`, { waitUntil: "load" });
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
  await page.waitForFunction(() => location.pathname === "/account", { timeout: 20000 });
  return page;
}

const uploaded = [];
try {
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { full_name: "Uploader Test" },
  });
  if (error) throw new Error(`createUser failed: ${error.code}`);
  user.id = data.user.id;
  await db.query(
    "insert into profiles (id, full_name, email, role, updated_at) values ($1, 'Uploader Test', $2, 'CUSTOMER', now())",
    [user.id, user.email],
  );

  console.log("Signing route:");
  const getRes = await fetch(`${baseUrl}/api/uploads/sign`);
  check("GET is not allowed", getRes.status === 405, `HTTP ${getRes.status}`);
  const anon = await fetch(`${baseUrl}/api/uploads/sign`, { method: "POST" });
  check("signed out: POST refused (401)", anon.status === 401, `HTTP ${anon.status}`);

  const page = await signedInPage();
  const res = await page.evaluate(async () => {
    const r = await fetch("/api/uploads/sign", { method: "POST" });
    return { status: r.status, cacheControl: r.headers.get("cache-control"), text: await r.text() };
  });
  const text = res.text;
  check("signed in: POST returns 200", res.status === 200, `HTTP ${res.status}`);
  check("Cache-Control is no-store", (res.cacheControl ?? "").includes("no-store"));
  check(
    "response never contains the API secret",
    !text.includes(process.env.CLOUDINARY_API_SECRET),
  );
  const sig = JSON.parse(text);
  console.log(`       fields: ${Object.keys(sig).join(", ")}`);
  check(
    "folder is the user's own upload folder",
    sig.folder === `${CLD}/users/${user.id}`,
    sig.folder,
  );
  check("formats are jpg,jpeg,png,webp", sig.allowedFormats === "jpg,jpeg,png,webp");
  check("max size is 5 MB", sig.maxFileBytes === 5 * 1024 * 1024);

  console.log("\nCloudinary accepts the signature:");
  const ok = await upload(sig, PNG_1x1, "test.png", "image/png");
  if (ok.body.public_id) uploaded.push(ok.body.public_id);
  check(
    "valid PNG upload accepted",
    ok.status === 200,
    `HTTP ${ok.status} ${cleanErr(ok.body.error?.message)}`,
  );
  check(
    "stored inside the upload folder",
    ok.body.public_id?.startsWith(`${CLD}/`) || ok.body.asset_folder === CLD,
    `public_id prefix ok: ${ok.body.public_id?.startsWith(`${CLD}/`)}, asset_folder: ${ok.body.asset_folder ?? "n/a"}`,
  );

  console.log("\nCloudinary rejects misuse:");
  const tamperFolder = await upload(sig, PNG_1x1, "test.png", "image/png", { folder: "elsewhere" });
  if (tamperFolder.body.public_id) uploaded.push(tamperFolder.body.public_id);
  check(
    "changed folder rejected",
    tamperFolder.status === 401,
    `HTTP ${tamperFolder.status} ${cleanErr(tamperFolder.body.error?.message)}`,
  );
  const extraParam = await upload(sig, PNG_1x1, "test.png", "image/png", {
    extra: { public_id: `${CLD}/hijack` },
  });
  if (extraParam.body.public_id) uploaded.push(extraParam.body.public_id);
  check(
    "unsigned public_id rejected",
    extraParam.status === 401,
    `HTTP ${extraParam.status} ${cleanErr(extraParam.body.error?.message)}`,
  );
  const widenFormats = await upload(sig, GIF_1x1, "test.gif", "image/gif", {
    allowedFormats: "jpg,jpeg,png,webp,gif",
  });
  if (widenFormats.body.public_id) uploaded.push(widenFormats.body.public_id);
  check("widened format list rejected", widenFormats.status === 401, `HTTP ${widenFormats.status}`);
  const gif = await upload(sig, GIF_1x1, "test.gif", "image/gif");
  if (gif.body.public_id) uploaded.push(gif.body.public_id);
  check(
    "GIF rejected",
    gif.status === 400,
    `HTTP ${gif.status} ${cleanErr(gif.body.error?.message)}`,
  );
  const badSig = await upload(
    { ...sig, signature: "0".repeat(sig.signature.length) },
    PNG_1x1,
    "test.png",
    "image/png",
  );
  if (badSig.body.public_id) uploaded.push(badSig.body.public_id);
  check("forged signature rejected", badSig.status === 401, `HTTP ${badSig.status}`);

  if (ok.body.public_id) {
    console.log("\nDelivery URL (f_auto, q_auto):");
    const id = ok.body.public_id.split("/").map(encodeURIComponent).join("/");
    const url = `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/f_auto,q_auto,c_limit,w_400/${id}`;
    const img = await fetch(url, { headers: { Accept: "image/avif,image/webp,image/*" } });
    check(
      "optimized URL serves image",
      img.status === 200,
      `HTTP ${img.status}, ${img.headers.get("content-type")}`,
    );
  }
} finally {
  console.log("\nCleanup:");
  for (const id of uploaded) {
    const del = await cloudinary.uploader.destroy(id, { resource_type: "image", invalidate: true });
    let gone = false;
    try {
      await cloudinary.api.resource(id);
    } catch (e) {
      gone = e?.error?.http_code === 404;
    }
    check(
      `deleted test image (${del.result})`,
      del.result === "ok" && gone,
      gone ? "confirmed gone" : "still present",
    );
  }
  if (uploaded.length === 0) console.log("  nothing to delete");
  await browser.close();
  if (user.id) {
    await db.query("delete from rate_limit_hits where key like 'upload-sign:%' and key like $1", [
      `%${user.id}%`,
    ]);
    await db.query("delete from profiles where id = $1", [user.id]);
    await admin.auth.admin.deleteUser(user.id).catch(() => {});
    console.log("  test account deleted");
  }
  await db.end();
}

const failed = results.filter((r) => !r).length;
console.log(`\nResult: ${failed === 0 ? "PASS" : `${failed} failure(s)`}`);
process.exitCode = failed ? 1 : 0;
