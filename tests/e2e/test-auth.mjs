// End-to-end auth tests against the real Supabase project. Prints no secrets or passwords.
// Usage: node test-auth.mjs <projectDir> <baseUrl> <shotsDir>
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { browserPath } from "./lib/setup.mjs";

const [projectDir, baseUrl, shotsDir] = process.argv.slice(2);
const require = createRequire(path.join(projectDir, "package.json"));
require("./scripts/env-guard.mjs").loadEnv(); // refuses production
const { createClient } = require("@supabase/supabase-js");
const pg = require("pg");

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = new pg.Client({ connectionString: process.env.DIRECT_URL });
await db.connect();

const run = crypto.randomBytes(4).toString("hex");
const mail = (tag) => `chf-e2e-${run}-${tag}@example.com`;
const pw = () => `Tst-${crypto.randomBytes(9).toString("base64url")}9a`;
const E = {
  signup: mail("signup"),
  dup: mail("dup"),
  main: mail("main"),
  unconfirmed: mail("unconf"),
};
const P = { dup: pw(), main: pw(), main2: pw(), unconfirmed: pw(), signup: pw() };
/** Steps that make Supabase send a real email (to a fake address) only run when asked. */
const SEND_AUTH_EMAILS = process.env.E2E_SEND_AUTH_EMAILS === "1";

let failures = 0;
const check = (name, pass, detail = "") => {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: browserPath(),
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

const go = async (p) => {
  await page.goto(baseUrl + p, { waitUntil: "load" });
  await sleep(400); // let hydration finish before interacting
};
const mainText = () => page.evaluate(() => document.querySelector("main")?.innerText ?? "");
const waitText = (text, timeout = 15000) =>
  page
    .waitForFunction(
      (t) => document.querySelector("main")?.innerText.includes(t),
      { timeout },
      text,
    )
    .then(
      () => true,
      () => false,
    );
const waitPath = (p, timeout = 15000) =>
  page
    .waitForFunction((x) => location.pathname === x, { timeout }, p)
    .then(
      () => true,
      () => false,
    );
async function fill(values) {
  for (const [name, value] of Object.entries(values)) {
    const sel = `main input[name="${name}"]`;
    await page.$eval(sel, (el) => (el.value = ""));
    if (value) await page.type(sel, value);
  }
}
async function submit(fieldName) {
  const btn = await page.evaluateHandle(
    (n) =>
      document.querySelector(`main input[name="${n}"]`).form.querySelector('button[type="submit"]'),
    fieldName,
  );
  await btn.click();
}
async function logout() {
  await page.click("button[aria-controls]"); // account menu
  await page.evaluate(() =>
    [...document.querySelectorAll("header form button")]
      .find((b) => b.textContent.includes("Log out"))
      .click(),
  );
  return waitPath("/");
}
async function profileRow(email) {
  const { rows } = await db.query("select full_name, phone, role from profiles where email = $1", [
    email,
  ]);
  return rows[0];
}

try {
  console.log("Protected page");
  await go("/account");
  const u1 = new URL(page.url());
  check(
    "signed-out /account redirects to /login?next=/account",
    u1.pathname === "/login" && u1.searchParams.get("next") === "/account",
    u1.pathname + u1.search,
  );

  console.log("\nSign up form (server-side validation)");
  await go("/signup");
  await submit("fullName");
  check("empty form shows field errors", await waitText("Enter your full name."));
  check("terms checkbox required", (await mainText()).includes("You must accept the terms"));
  await fill({
    fullName: "Test Person",
    email: E.signup,
    password: P.signup,
    confirmPassword: P.signup + "x",
  });
  await page.click('main input[name="acceptTerms"]');
  await submit("fullName");
  check("password mismatch caught", await waitText("Passwords do not match."));
  check(
    "name and email kept after error",
    (await page.$eval('main input[name="email"]', (e) => e.value)) === E.signup,
  );

  // A real sign-up makes Supabase send a confirmation email (to a fake address, and the dev
  // project only allows a few per hour), so it's opt-in. The confirmation link itself is tested
  // below with an admin-generated link, which sends nothing.
  if (SEND_AUTH_EMAILS) {
    console.log("\nSign up (real Supabase call, sends a confirmation email)");
    await fill({ password: P.signup, confirmPassword: P.signup });
    if (!(await page.$eval('main input[name="acceptTerms"]', (e) => e.checked)))
      await page.click('main input[name="acceptTerms"]');
    await submit("fullName");
    await page
      .waitForFunction(
        () =>
          /Check your email|couldn't send|Too many|went wrong|invalid/i.test(
            document.querySelector("main").innerText,
          ),
        { timeout: 20000 },
      )
      .catch(() => {});
    const signupText = await mainText();
    const sentOk = signupText.includes("Check your email");
    check(
      "sign-up reaches Supabase and shows a clear result",
      sentOk || signupText.includes("can't be used") || signupText.includes("couldn't send"),
      sentOk
        ? "confirmation email requested"
        : signupText.split("\n").find((l) => /can't be used|couldn't|Too many|wrong/i.test(l)),
    );
    await page.screenshot({ path: path.join(shotsDir, "auth-signup-result.png") });
  } else {
    console.log("\n  SKIP real sign-up (sends an email; set E2E_SEND_AUTH_EMAILS=1 to include it)");
  }

  console.log("\nDuplicate email");
  await admin.auth.admin.createUser({
    email: E.dup,
    password: P.dup,
    email_confirm: true,
    user_metadata: { full_name: "Dup User" },
  });
  await go("/signup");
  await fill({ fullName: "Dup Again", email: E.dup, password: P.dup, confirmPassword: P.dup });
  await page.click('main input[name="acceptTerms"]');
  await submit("fullName");
  check("existing email reported", await waitText("already exists"));

  console.log("\nEmail confirmation link (/auth/callback)");
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "signup",
    email: E.main,
    password: P.main,
    options: { data: { full_name: "Tolu Confirm" } },
  });
  check("generated signup link", !linkErr && !!link?.properties?.hashed_token, linkErr?.code ?? "");
  await go(`/auth/callback?token_hash=${link.properties.hashed_token}&type=signup&next=%2Faccount`);
  const u2 = new URL(page.url());
  check(
    "confirmation signs in and lands on /account",
    u2.pathname === "/account" && u2.searchParams.get("welcome") === "1",
    u2.pathname + u2.search,
  );
  check("welcome message shown", await waitText("Your email is confirmed"));
  const row1 = await profileRow(E.main);
  check(
    "profile created automatically",
    row1?.full_name === "Tolu Confirm" && row1?.role === "CUSTOMER",
    JSON.stringify(row1 && { name: row1.full_name, role: row1.role }),
  );

  console.log("\nHeader when signed in");
  await go("/");
  await page.waitForSelector("button[aria-controls]", { timeout: 10000 }).catch(() => {});
  const header = await page.evaluate(() => ({
    menu: !!document.querySelector("header button[aria-controls]"),
    // The account menu's avatar (the notification bell is another header menu button).
    initials: [...document.querySelectorAll("header button[aria-controls] span[aria-hidden=true]")]
      .map((s) => s.textContent.trim())
      .find((t) => /^[A-Z]{1,2}$/.test(t)),
    loginLink: [...document.querySelectorAll("header a")].some(
      (a) => a.textContent.trim() === "Log in" && a.offsetParent,
    ),
  }));
  check(
    "account menu with initials replaces Log in",
    header.menu && header.initials === "TC" && !header.loginLink,
    `initials ${header.initials}`,
  );
  await page.click("header button[aria-controls]");
  await page.screenshot({ path: path.join(shotsDir, "auth-account-menu.png") });
  await page.keyboard.press("Escape");
  await go("/login");
  check("signed-in visit to /login goes to /account", new URL(page.url()).pathname === "/account");

  console.log("\nAccount page: edit profile");
  await go("/account");
  check(
    "shows name, email and role",
    (await waitText("Tolu Confirm")) &&
      (await mainText()).includes(E.main) &&
      (await mainText()).includes("Customer"),
  );
  await fill({ fullName: "Tolu Confirmed", phone: "12345" });
  await submit("fullName");
  check("invalid phone rejected", await waitText("Enter a valid Nigerian phone number"));
  await fill({ fullName: "Tolu Confirmed", phone: "0803 123 4567" });
  await submit("fullName");
  check("profile saved message", await waitText("Your details have been saved."));
  const row2 = await profileRow(E.main);
  check(
    "name and phone saved (phone normalized)",
    row2?.full_name === "Tolu Confirmed" && row2?.phone === "+2348031234567",
    `${row2?.full_name}, ${row2?.phone}`,
  );
  await page.screenshot({ path: path.join(shotsDir, "auth-account.png"), fullPage: true });

  console.log("\nUpload signing now requires login");
  const signedIn = await page.evaluate(
    async () => (await fetch("/api/uploads/sign", { method: "POST" })).status,
  );
  check("signed-in POST /api/uploads/sign -> 200", signedIn === 200, String(signedIn));
  const anon = await fetch(baseUrl + "/api/uploads/sign", { method: "POST" });
  check("signed-out POST /api/uploads/sign -> 401", anon.status === 401, String(anon.status));

  console.log("\nLog out");
  check("log out returns to home", await logout());
  await go("/account");
  check("/account requires login again", new URL(page.url()).pathname === "/login");
  await go(`/auth/callback?token_hash=${link.properties.hashed_token}&type=signup`);
  check(
    "reused confirmation link rejected with clear message",
    new URL(page.url()).searchParams.get("error") === "link_invalid" &&
      (await waitText("invalid or has expired")),
  );

  console.log("\nLog in errors");
  await go("/login");
  await fill({ email: E.main, password: "Wrong-password-1" });
  await submit("email");
  check("wrong password message", await waitText("Incorrect email or password."));
  await admin.auth.admin.createUser({
    email: E.unconfirmed,
    password: P.unconfirmed,
    email_confirm: false,
  });
  await fill({ email: E.unconfirmed, password: P.unconfirmed });
  await submit("email");
  check("unconfirmed email message", await waitText("Please confirm your email address first"));
  check("offers to resend confirmation", (await mainText()).includes("Resend confirmation email"));

  console.log("\nOpen-redirect protection");
  for (const evil of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
    await go(`/login?next=${encodeURIComponent(evil)}`);
    await fill({ email: E.main, password: P.main });
    await submit("email");
    const landed = await waitPath("/account");
    check(
      `next=${evil} ignored, lands on /account`,
      landed && new URL(page.url()).host === new URL(baseUrl).host,
    );
    await logout();
  }
  await go("/login?next=%2Faccount%3Ftab%3Dx");
  await fill({ email: E.main, password: P.main });
  await submit("email");
  await waitPath("/account");
  check(
    "safe next path is honoured",
    new URL(page.url()).search === "?tab=x",
    new URL(page.url()).search,
  );
  await logout();

  console.log("\nForgot password (no account enumeration)");
  // An existing account gets a real reset email, so that half is opt-in. An unknown address
  // sends nothing.
  const messages = [];
  for (const email of SEND_AUTH_EMAILS ? [E.main, mail("nobody")] : [mail("nobody")]) {
    await go("/forgot-password");
    await fill({ email });
    await submit("email");
    await waitText("If an account exists");
    messages.push((await mainText()).split("\n").find((l) => l.includes("If an account exists")));
  }
  if (SEND_AUTH_EMAILS) {
    check(
      "same message for existing and unknown emails",
      messages[0] && messages[0] === messages[1],
    );
  } else {
    check("unknown email gets the neutral message", Boolean(messages[0]));
    console.log("  SKIP existing-account reset email (set E2E_SEND_AUTH_EMAILS=1 to include it)");
  }

  console.log("\nReset password link");
  const { data: rec, error: recErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: E.main,
  });
  check("generated recovery link", !recErr && !!rec?.properties?.hashed_token);
  await go(`/auth/callback?token_hash=${rec.properties.hashed_token}&type=recovery`);
  check(
    "recovery link lands on /reset-password",
    new URL(page.url()).pathname === "/reset-password",
  );
  await page.waitForSelector('main input[name="password"]', { timeout: 10000 });
  await fill({ password: P.main2, confirmPassword: P.main2 + "x" });
  await submit("password");
  check("mismatch caught on reset", await waitText("Passwords do not match."));
  await fill({ password: P.main2, confirmPassword: P.main2 });
  await submit("password");
  check("new password saved, back to /account", await waitPath("/account"));
  check("password updated message", await waitText("Your password has been updated."));
  await logout();
  await go("/login");
  await fill({ email: E.main, password: P.main });
  await submit("email");
  check("old password no longer works", await waitText("Incorrect email or password."));
  await fill({ email: E.main, password: P.main2 });
  await submit("email");
  check("new password works", await waitPath("/account"));
  await logout();
  await go("/reset-password");
  check("/reset-password without a session shows expired message", await waitText("expired"));

  console.log("\nmake-admin script");
  const out = execFileSync("npm.cmd", ["run", "-s", "make-admin", "--", E.main], {
    cwd: projectDir,
    encoding: "utf8",
    shell: true,
  });
  check("promotes profile to ADMIN", (await profileRow(E.main))?.role === "ADMIN", out.trim());
  let missingOut = "";
  try {
    execFileSync("npm.cmd", ["run", "-s", "make-admin", "--", mail("ghost")], {
      cwd: projectDir,
      encoding: "utf8",
      shell: true,
      stdio: "pipe",
    });
  } catch (e) {
    missingOut = String(e.stderr ?? "").trim();
  }
  check(
    "unknown email reported clearly",
    missingOut.includes("No profile found"),
    missingOut.split("\n")[0],
  );

  console.log("\nMobile menu when signed in (360px)");
  await page.setViewport({ width: 360, height: 780, isMobile: true, hasTouch: true });
  await go("/login");
  await fill({ email: E.main, password: P.main2 });
  await submit("email");
  await waitPath("/account");
  await go("/");
  await page.click('button[aria-haspopup="dialog"]');
  await sleep(300);
  const menuText = await page.evaluate(() => document.querySelector("dialog").innerText);
  check(
    "mobile menu shows name, My account and Log out",
    menuText.includes("Tolu Confirmed") &&
      menuText.includes("My account") &&
      menuText.includes("Log out") &&
      !menuText.includes("Log in"),
  );
  await page.screenshot({ path: path.join(shotsDir, "auth-mobile-menu.png") });
  await page.keyboard.press("Escape");
  await go("/login");
} finally {
  console.log("\nCleanup");
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const mine = (data?.users ?? []).filter((u) => u.email?.startsWith(`chf-e2e-${run}-`));
  for (const u of mine) await admin.auth.admin.deleteUser(u.id);
  const del = await db.query("delete from profiles where email like $1", [`chf-e2e-${run}-%`]);
  const left = (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.filter((u) =>
    u.email?.startsWith(`chf-e2e-${run}-`),
  ).length;
  check(`deleted ${mine.length} test auth users and ${del.rowCount} profiles`, left === 0);
  await db.end();
  await browser.close();
}

console.log(`\nResult: ${failures === 0 ? "PASS" : `${failures} failure(s)`}`);
process.exitCode = failures ? 1 : 0;
