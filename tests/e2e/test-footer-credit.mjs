// Footer developer credit on every page type, at 360px and desktop. Creates one test business
// owner (for signed-in pages) and deletes it afterwards. Usage: node test-footer-credit.mjs <projectDir> <baseUrl> <shotsDir>
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { axeSource, browserPath } from "./lib/setup.mjs";

const [projectDir, baseUrl, shotsDir] = process.argv.slice(2);
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
// The site's public contact email, read from the app's config (not hard-coded in tests).
const CONTACT_EMAIL = fs
  .readFileSync(path.join(projectDir, "src/config/legal.ts"), "utf8")
  .match(/email: "([^"]+)"/)[1];
const MAILTO = `mailto:${CONTACT_EMAIL}?subject=Website%2FApp%20project%20enquiry%20(via%20CustomerHowFar)`;
let failures = 0;
const check = (name, pass, detail = "") => {
  if (!pass) failures++;
  if (!pass || process.env.VERBOSE)
    console.log(`  ${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true });

async function inspect(page, label, mobile) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await sleep(500);
  const r = await page.evaluate(() => {
    const bar = [...document.querySelectorAll("footer div")].find(
      (d) => d.innerText.includes("All rights reserved") && d.innerText.includes("Designed"),
    );
    if (!bar) return null;
    const copy = [...bar.querySelectorAll("p")].find((p) =>
      p.innerText.includes("All rights reserved"),
    );
    const credit = [...bar.querySelectorAll("p")].find((p) =>
      p.innerText.includes("Designed & built by"),
    );
    const strong = credit.querySelector("strong");
    const link = credit.querySelector("a");
    const rect = (el) => el.getBoundingClientRect().toJSON();
    const covered = [copy, credit, link].some((el) => {
      const b = el.getBoundingClientRect();
      for (const [x, y] of [
        [b.left + 4, b.top + b.height / 2],
        [b.right - 4, b.top + b.height / 2],
        [b.left + b.width / 2, b.top + b.height / 2],
      ]) {
        const top = document.elementFromPoint(x, y);
        if (top && !el.contains(top) && !top.contains(el)) return true;
      }
      return false;
    });
    return {
      copyText: copy.innerText.trim(),
      creditText: credit.innerText.replace(/\s+/g, " ").trim(),
      strong: strong?.innerText,
      strongColor: getComputedStyle(strong).color,
      strongWeight: getComputedStyle(strong).fontWeight,
      href: link.getAttribute("href"),
      aria: link.getAttribute("aria-label"),
      copy: rect(copy),
      credit: rect(credit),
      vw: innerWidth,
      vh: innerHeight,
      covered,
      madeIn: bar.innerText.includes("Made in Nigeria"),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      textCentered: getComputedStyle(bar).textAlign,
    };
  });
  if (!r) return check(`${label}: footer bottom bar found`, false);
  check(
    `${label}: copyright line unchanged`,
    /^© 20\d\d CustomerHowFar\. All rights reserved\.$/.test(r.copyText),
    r.copyText,
  );
  check(
    `${label}: credit text`,
    r.creditText === `Designed & built by Dprogrammar · ${CONTACT_EMAIL}`,
    r.creditText,
  );
  check(
    `${label}: "Dprogrammar" stands out (bold, accent colour)`,
    r.strong === "Dprogrammar" &&
      Number(r.strongWeight) >= 600 &&
      r.strongColor === "rgb(252, 186, 77)",
    `${r.strongWeight} ${r.strongColor}`,
  );
  check(
    `${label}: mailto link with subject and accessible label`,
    r.href === MAILTO && /^Email Dprogrammar/.test(r.aria) && r.aria.includes(CONTACT_EMAIL),
  );
  check(`${label}: "Made in Nigeria" kept`, r.madeIn);
  check(`${label}: nothing covers the bottom bar (nav, chat button)`, !r.covered);
  check(`${label}: no horizontal scroll`, !r.overflow);
  if (mobile) {
    check(
      `${label}: phones: stacked, credit below copyright, centred`,
      r.credit.top >= r.copy.bottom - 1 &&
        Math.abs(r.copy.left + r.copy.width / 2 - r.vw / 2) < 3 &&
        Math.abs(r.credit.left + r.credit.width / 2 - r.vw / 2) < 3,
      JSON.stringify({ c: r.copy, k: r.credit }),
    );
  } else {
    check(
      `${label}: desktop: one line, copyright left, credit right`,
      Math.abs(r.copy.top - r.credit.top) < 4 &&
        r.copy.right < r.credit.left &&
        r.copy.height < 30 &&
        r.credit.height < 30,
      JSON.stringify({ c: r.copy, k: r.credit }),
    );
  }
  await page.evaluate(axeSource);
  const v = await page.evaluate(async () =>
    (
      await window.axe.run("footer", { runOnly: ["wcag2a", "wcag2aa", "best-practice"] })
    ).violations.map((x) => `${x.id}: ${x.nodes[0]?.target.join(" ")}`),
  );
  check(`${label}: footer accessibility and colour contrast`, v.length === 0, v.join(" | "));
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
  const biz = (
    await q(
      "select slug from businesses where status = 'APPROVED' order by published_at desc limit 1",
    )
  )[0]?.slug;
  const cat = (
    await q(
      "select slug from categories where is_active and parent_id is null order by sort_order limit 1",
    )
  )[0].slug;
  const publicPages = [
    "/",
    "/search?q=tailor",
    `/category/${cat}`,
    ...(biz ? [`/business/${biz}`] : []),
    "/categories",
    "/help",
    "/safety",
    "/about",
    "/contact",
    "/terms",
    "/privacy",
    "/coming-soon",
    "/login",
    "/signup",
    "/this-page-does-not-exist",
  ];
  const privatePages = [
    "/account",
    "/account/notifications",
    "/dashboard",
    "/business/new",
    "/notifications",
    "/saved",
  ];
  for (const [vw, mobile] of [
    [360, true],
    [1280, false],
  ]) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    if (mobile) {
      await page.setUserAgent(
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
      );
      await page.setViewport({ width: 360, height: 800, isMobile: true, hasTouch: true });
    } else {
      await page.setViewport({ width: 1280, height: 900 });
    }
    for (const p of publicPages) {
      await page.goto(baseUrl + p, { waitUntil: "load" });
      await sleep(900);
      await inspect(page, `${vw}px ${p}`, mobile);
      if (p === "/" && shotsDir)
        await page.screenshot({ path: path.join(shotsDir, `footer-credit-${vw}.png`) });
    }
    await page.goto(`${baseUrl}/login?next=%2Faccount`, { waitUntil: "load" });
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
    await page
      .waitForFunction(() => location.pathname === "/account", { timeout: 20000 })
      .catch(() => {});
    for (const p of privatePages) {
      await page.goto(baseUrl + p, { waitUntil: "load" });
      await sleep(900);
      await inspect(page, `${vw}px ${p} (signed in)`, mobile);
    }
    await ctx.close();
  }
  console.log(`checked ${2 * 21} page/size combinations`);
} catch (e) {
  failures++;
  console.log("  ERROR", e.message);
} finally {
  if (uid) {
    await q("delete from profiles where id = $1", [uid]);
    await admin.auth.admin.deleteUser(uid).catch(() => {});
  }
  await browser.close();
  await db.end();
  console.log(failures === 0 ? "ALL PASSED" : `${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
