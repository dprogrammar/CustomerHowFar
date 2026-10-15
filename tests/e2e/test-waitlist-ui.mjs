// Waitlist form UI everywhere it appears: no email prefill (placeholder only), the homepage
// "Coming to your state" heading, the honeypot stays invisible, accessibility, 360px and CLS.
// Creates one test owner with a draft listing and deletes both. Usage: node test-waitlist-ui.mjs <projectDir> <baseUrl>
import crypto from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { axeSource, browserPath } from "./lib/setup.mjs";

const [projectDir, baseUrl] = process.argv.slice(2);
const require = createRequire(path.join(projectDir, "package.json"));
require("./scripts/env-guard.mjs").loadEnv(); // refuses production
const { createClient } = require("@supabase/supabase-js");
const pg = require("pg");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const db = new pg.Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
const q = async (s, p = []) => (await db.query(s, p)).rows;
const run = crypto.randomBytes(3).toString("hex");
const user = {
  email: `chf-e2e-${run}-owner@example.com`,
  password: `Tst-${crypto.randomBytes(9).toString("base64url")}9a`,
};
const EXPLANATION =
  "We're launching one state at a time to keep listings trusted. Join the waitlist and we'll email you when we launch in your state.";
let failures = 0;
const check = (name, pass, detail = "") => {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true });

const formState = (page) =>
  page.evaluate(() => {
    const form = [...document.querySelectorAll('form[aria-label="Join the waitlist"]')].find(
      (f) => f.closest("details")?.open !== false,
    );
    if (!form) return null;
    const email = form.querySelector('input[name="email"]');
    const hp = form.querySelector('input[name="website"]');
    const r = hp?.getBoundingClientRect();
    // Invisible = drawn entirely off-screen (or clipped to 1px), hidden from screen readers and
    // skipped by the Tab key.
    const wrap = hp?.parentElement.getBoundingClientRect();
    const offScreen = Boolean(
      r && (r.right <= 0 || r.bottom <= 0 || (wrap.width <= 1 && wrap.height <= 1)),
    );
    const hpVisible = Boolean(
      hp && (!offScreen || !hp.closest("[aria-hidden=true]") || hp.tabIndex !== -1),
    );
    return {
      email: email.value,
      placeholder: email.placeholder,
      honeypot: Boolean(hp),
      honeypotVisible: hpVisible,
      honeypotFocusable: hp
        ? hp.tabIndex >= 0 &&
          hp.offsetParent !== null &&
          !hp.closest("[aria-hidden=true]") &&
          hpVisible
        : false,
      button: [...form.querySelectorAll("button[type=submit]")]
        .map((b) => b.innerText.trim())
        .join(),
      consent: Boolean(form.querySelector('input[name="consent"]')),
    };
  });
async function axe(page, label) {
  await page.evaluate(axeSource);
  const v = await page.evaluate(async () =>
    (
      await window.axe.run(document, {
        runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"],
      })
    ).violations.map((x) => `${x.id}: ${x.nodes[0]?.target.join(" ")}`),
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  check(
    `a11y + no horizontal scroll: ${label}`,
    v.length === 0 && !overflow,
    [overflow ? "overflow" : "", ...v].join(" | "),
  );
}
function formChecks(label, f) {
  check(
    `${label}: email empty, placeholder "you@example.com"`,
    f && f.email === "" && f.placeholder === "you@example.com",
    JSON.stringify(f),
  );
  check(`${label}: anti-spam field present but invisible`, f && f.honeypot && !f.honeypotVisible);
  check(
    `${label}: "Join the waitlist" button and consent kept`,
    f && f.button === "Join the waitlist" && f.consent,
    f?.button,
  );
}

let uid;
try {
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { full_name: "Ola Owner" },
  });
  if (error) throw new Error(error.code);
  uid = data.user.id;
  await q(
    "insert into profiles (id, full_name, email, role, updated_at) values ($1,'Ola Owner',$2,'BUSINESS_OWNER', now())",
    [uid, user.email],
  );
  const cat = (await q("select id from categories where slug = 'carpenters'"))[0].id;
  const bid = crypto.randomUUID();
  await q(
    "insert into businesses (id, owner_id, name, slug, category_id, phone, whatsapp_number, status, updated_at) values ($1,$2,$3,$4,$5,'+2348036660000','+2348036660000','DRAFT', now())",
    [bid, uid, `E2E Waitlist ${run}`, `e2e-wl-${run}`, cat],
  );
  const notLive = (await q("select slug from states where not is_active order by name limit 1"))[0]
    .slug;

  for (const [w, mobile] of [
    [360, true],
    [1280, false],
  ]) {
    console.log(`\n${w}px`);
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    if (mobile) await page.setViewport({ width: 360, height: 800, isMobile: true, hasTouch: true });
    else await page.setViewport({ width: 1280, height: 900 });
    await page.evaluateOnNewDocument(() => {
      window.__cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(`${baseUrl}/login?next=%2F`, { waitUntil: "load" });
    await sleep(800);
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
    check(
      "signed in",
      await page
        .waitForFunction(() => location.pathname === "/", { timeout: 20000 })
        .then(
          () => true,
          () => false,
        ),
    );
    await page.reload({ waitUntil: "load" });
    await sleep(1500);
    const home = await page.evaluate(() => {
      const h = document.getElementById("waitlist-title");
      const sec = h.closest("section");
      const cs = getComputedStyle(h);
      return {
        tag: h.tagName,
        text: h.innerText.trim(),
        size: parseFloat(cs.fontSize),
        weight: Number(cs.fontWeight),
        color: cs.color,
        icon: Boolean(sec.querySelector("svg")),
        explanation: sec.querySelector("h2 + p")?.innerText.trim(),
        oldHeading: /Not in [A-Z]/.test(sec.innerText),
        eyebrowGone: !sec.innerText.trim().startsWith("COMING TO YOUR STATE"),
      };
    });
    check('homepage: "Not in Lagos?" heading removed', !home.oldHeading);
    check(
      'homepage: "Coming to your state" is the section heading',
      home.tag === "H2" && home.text === "Coming to your state" && home.eyebrowGone,
    );
    // gray-950 is reported as lab(L ...) or rgb(3, 7, 18): either way near-black.
    const dark =
      home.color === "rgb(3, 7, 18)" || Number(home.color.match(/^lab\(([\d.]+)/)?.[1] ?? 100) < 5;
    check(
      "homepage: large, bold, high-contrast, with an icon",
      home.size >= (mobile ? 30 : 36) && home.weight >= 800 && dark && home.icon,
      `${home.size}px ${home.weight} ${home.color}`,
    );
    check("homepage: explanation text kept", home.explanation === EXPLANATION, home.explanation);
    await page.evaluate(() => document.getElementById("waitlist-title").scrollIntoView());
    formChecks("homepage", await formState(page));
    check(
      `homepage: no layout shift (CLS ${(await page.evaluate(() => window.__cls)).toFixed(3)})`,
      (await page.evaluate(() => window.__cls)) < 0.01,
    );
    await axe(page, "homepage");
    await page.goto(`${baseUrl}/coming-soon`, { waitUntil: "load" });
    await sleep(1000);
    formChecks("/coming-soon", await formState(page));
    await axe(page, "/coming-soon");
    await page.goto(`${baseUrl}/business/${bid}/edit?step=2`, { waitUntil: "load" });
    await sleep(1000);
    await page.evaluate(() => {
      const d = document.getElementById("state-waitlist");
      if (d) d.open = true;
    });
    await sleep(300);
    formChecks("onboarding (step 2)", await formState(page));
    await axe(page, "onboarding step 2");
    await page.goto(`${baseUrl}/search?state=${notLive}`, { waitUntil: "load" });
    await sleep(1200);
    formChecks("search 'not live yet' notice", await formState(page));
    await ctx.close();
  }
} catch (e) {
  failures++;
  console.log("  ERROR", e.message);
} finally {
  if (uid) {
    await q("delete from businesses where owner_id = $1", [uid]);
    await q("delete from profiles where id = $1", [uid]);
    await admin.auth.admin.deleteUser(uid).catch(() => {});
  }
  await browser.close();
  await db.end();
  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
