// /start landing page and the admin QR code generator. Decodes downloaded PNG and SVG codes.
// Creates its own users, campaign and draft listing and deletes them all; leaves the promotion
// switch as it found it. Usage: node test-start-qr.mjs <projectDir> <baseUrl> <shotsDir>
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { axeSource, browserPath } from "./lib/setup.mjs";

const [projectDir, baseUrl, shotsDir] = process.argv.slice(2);
const require = createRequire(path.join(projectDir, "package.json"));
const local = createRequire(import.meta.url);
require("./scripts/env-guard.mjs").loadEnv(); // refuses production
const { createClient } = require("@supabase/supabase-js");
const pg = require("pg");
const jsQR = local("jsqr");
const { PNG } = local("pngjs");
const jsqrPath = local.resolve("jsqr/dist/jsQR.js");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const db = new pg.Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
const q = async (s, p = []) => (await db.query(s, p)).rows;
const one = async (s, p = []) => (await q(s, p))[0];
const run = crypto.randomBytes(3).toString("hex");
const testStart = new Date();
const pw = () => `Tst-${crypto.randomBytes(9).toString("base64url")}9a`;
const users = {
  admin: {
    email: `chf-e2e-${run}-admin@example.com`,
    password: pw(),
    name: "Ade Admin",
    role: "ADMIN",
  },
  customer: {
    email: `chf-e2e-${run}-customer@example.com`,
    password: pw(),
    name: "Chi Customer",
    role: "CUSTOMER",
  },
};
const CAMPAIGN = `e2e-flyer-${run}`;
let failures = 0;
const check = (name, pass, detail = "") => {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true });
let ip = 60;
async function newPage(width = 360) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  if (width < 768) {
    await page.setUserAgent(
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
    );
    await page.setViewport({ width, height: 800, isMobile: true, hasTouch: true });
  } else {
    await page.setViewport({ width, height: 900 });
  }
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.55.${ip++}.3` });
  await page.evaluateOnNewDocument(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  return page;
}
const go = async (page, p) => {
  await page.goto(baseUrl + p, { waitUntil: "load" });
  await sleep(1200);
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
const startInfo = (page) =>
  page.evaluate(() => {
    const main = document.querySelector("main");
    const link = (t) => [...main.querySelectorAll("a")].find((a) => a.innerText.trim() === t);
    return {
      text: main.innerText,
      logo: Boolean(main.querySelector("section svg rect[fill='#008751']")),
      h1: main.querySelector("h1")?.innerText.replace(/\s+/g, " ").trim(),
      service: link("I need a service")?.getAttribute("href"),
      business: link("I own a business")?.getAttribute("href"),
      login: link("Log in")?.getAttribute("href"),
      create: link("Create account")?.getAttribute("href"),
      account: link("Continue to my account")?.getAttribute("href"),
      listBiz: link("List a business")?.getAttribute("href"),
      chat: Boolean(document.querySelector('.chat-launcher button[aria-haspopup="dialog"]')),
      robots: document.querySelector('meta[name="robots"]')?.content,
      url: location.pathname + location.search,
      cls: window.__cls,
    };
  });
const decodePng = (file) => {
  const png = PNG.sync.read(fs.readFileSync(file));
  const r = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return { width: png.width, height: png.height, text: r?.data ?? null };
};

const promoStart = await one(
  "select payment_required, homepage_free_promo from app_settings where id = 1",
);
const dlDir = fs.mkdtempSync(path.join(os.tmpdir(), "chf-qr-"));
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
  const site = (await (await fetch(`${baseUrl}/robots.txt`)).text()).match(
    /Sitemap: (https?:\/\/[^/\s]+)/,
  )?.[1];
  const expectedUrl = `${site}/start?src=qr&campaign=${CAMPAIGN}`;

  // -------------------------------------------------------------------------------------------
  console.log("\nAdmin QR codes");
  const ad = await newPage(1280);
  check("admin logs in", await login(ad, users.admin, "/admin"));
  await go(ad, "/admin/qr-codes");
  const cdp = await ad.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: dlDir,
    eventsEnabled: true,
    browserContextId: ad.browserContext().id,
  });
  const field = await ad.$("main input:not([type=checkbox])");
  check('default campaign name is "flyer"', (await field.evaluate((e) => e.value)) === "flyer");
  await field.evaluate((e, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, v);
    e.dispatchEvent(new Event("input", { bubbles: true }));
  }, `E2E Flyer ${run}`);
  await sleep(500);
  const preview = await ad.evaluate(() => ({
    src: document.querySelector("main figure img")?.getAttribute("src") ?? "",
    hint:
      document.querySelector("main input")?.getAttribute("aria-describedby") &&
      document.getElementById(document.querySelector("main input").getAttribute("aria-describedby"))
        .innerText,
  }));
  check(
    "campaign name tidied and destination shown",
    preview.hint.includes(expectedUrl),
    preview.hint,
  );
  check(
    "live preview with the logo in the centre",
    preview.src.startsWith("data:image/svg+xml") &&
      decodeURIComponent(preview.src).includes('fill="#008751"'),
  );
  await axe(ad, "admin QR codes");
  const waitFile = async (ext) => {
    for (let i = 0; i < 60; i++) {
      const f = fs.readdirSync(dlDir).filter((x) => x.endsWith(ext) && !x.endsWith(".crdownload"));
      if (f.length) return path.join(dlDir, f.sort().at(-1));
      await sleep(500);
    }
    return null;
  };
  await ad.evaluate(() =>
    [...document.querySelectorAll("main button")]
      .find((b) => b.innerText.includes("Download PNG"))
      .click(),
  );
  const png = await waitFile(".png");
  check(
    "campaign saved",
    Boolean(await one("select 1 from qr_campaigns where name = $1", [CAMPAIGN])),
  );
  check(
    "PNG downloaded",
    Boolean(png),
    await ad.evaluate(
      () =>
        document.querySelector("main [role=alert], main [role=status]")?.innerText ?? "no message",
    ),
  );
  if (!png) throw new Error("no PNG download");
  const d1 = decodePng(png);
  check("PNG is print quality (at least 2000px)", d1.width >= 2000, `${d1.width}x${d1.height}`);
  check("PNG (logo + caption) decodes to the right link", d1.text === expectedUrl, d1.text);
  check("caption area under the code", d1.height > d1.width);
  fs.renameSync(png, path.join(dlDir, "with-caption.png.keep"));
  await ad.evaluate(() =>
    [...document.querySelectorAll("main button")]
      .find((b) => b.innerText.includes("Download SVG"))
      .click(),
  );
  const svg = await waitFile(".svg");
  const svgText = svg ? fs.readFileSync(svg, "utf8") : "";
  check(
    "SVG has the logo and the caption",
    svgText.includes('fill="#008751"') &&
      svgText.includes("Scan to get started · www.customerhowfar.com.ng"),
  );
  await ad.addScriptTag({ path: jsqrPath });
  const svgDecoded = await ad.evaluate(async (s) => {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = Math.round((1200 * img.naturalHeight) / img.naturalWidth);
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return (
      window.jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height)?.data ?? null
    );
  }, svgText);
  check("SVG decodes to the right link", svgDecoded === expectedUrl, svgDecoded);
  // Without caption.
  await ad.evaluate(() => document.querySelector("main input[type=checkbox]").click());
  await sleep(300);
  await ad.evaluate(() =>
    [...document.querySelectorAll("main button")]
      .find((b) => b.innerText.includes("Download PNG"))
      .click(),
  );
  await sleep(500);
  const png2 = await waitFile(".png");
  const d2 = decodePng(png2);
  check(
    "PNG without caption: square and decodes",
    d2.width === d2.height && d2.text === expectedUrl,
    `${d2.width}x${d2.height}`,
  );
  fs.rmSync(png2);
  await go(ad, "/admin/qr-codes");
  await ad.addScriptTag({ path: jsqrPath });
  const listed = await ad.evaluate(
    (c) =>
      [...document.querySelectorAll("main li")].some(
        (li) => li.innerText.includes(c) && li.innerText.includes("0 scans"),
      ),
    CAMPAIGN,
  );
  check("saved codes are listed (with counts)", listed);
  await ad.evaluate(
    (c) =>
      [
        ...[...document.querySelectorAll("main li")]
          .find((li) => li.innerText.includes(c))
          .querySelectorAll("button"),
      ]
        .find((b) => b.innerText.startsWith("PNG"))
        .click(),
    CAMPAIGN,
  );
  const png3 = await waitFile(".png");
  check(
    "re-download from the list decodes to the same link",
    png3 && decodePng(png3).text === expectedUrl,
  );
  const cust = await newPage(1280);
  check("customer logs in", await login(cust, users.customer, "/account"));
  const res404 = await cust.goto(`${baseUrl}/admin/qr-codes`);
  check("non-admins get 404", res404.status() === 404);

  // -------------------------------------------------------------------------------------------
  for (const w of [360, 1280]) {
    console.log(`\n/start signed out (${w}px)`);
    const p = await newPage(w);
    await go(p, `/start?src=qr&campaign=${CAMPAIGN}`);
    await sleep(800);
    const s = await startInfo(p);
    check(
      'logo, headline and "Now live in Lagos"',
      s.logo &&
        s.h1 === "Find trusted artisans and businesses near you" &&
        /Now live in Lagos/.test(s.text),
    );
    check(
      '"100% FREE" badge while the promotion is on',
      s.text.includes("100% FREE") ===
        Boolean(promoStart.homepage_free_promo && !promoStart.payment_required),
    );
    check(
      "two big buttons with the right destinations",
      s.service === "/?focus=search" && s.business === "/signup?next=%2Fbusiness%2Fnew",
    );
    check(
      '"Log in" and "Create account" links',
      s.login === "/login" &&
        s.create === "/signup" &&
        s.text.includes("Already have an account?") &&
        s.text.includes("New here?"),
    );
    check(
      "three trust points",
      [
        "Every listing reviewed",
        "Real photos of their work",
        "Contact them directly on WhatsApp",
      ].every((t) => s.text.includes(t)),
    );
    check("chat button available", s.chat);
    check("noindex", /noindex/.test(s.robots ?? ""));
    check("QR parameters removed from the address bar", s.url === "/start", s.url);
    check(`no layout shift (CLS ${s.cls.toFixed(3)})`, s.cls < 0.01);
    await axe(p, `/start signed out (${w}px)`);
    if (shotsDir)
      await p.screenshot({ path: path.join(shotsDir, `start-${w}.png`), fullPage: true });
    if (w === 360) {
      const cookies = await p.cookies();
      const qrCookie = cookies.find((c) => c.name === "chf_qr");
      check(
        "campaign remembered in a first-party cookie (name only, 30 days)",
        qrCookie?.value === CAMPAIGN &&
          qrCookie.httpOnly &&
          qrCookie.expires - Date.now() / 1000 > 29 * 86400,
      );
      check(
        "scan counted once",
        (await one("select visits from qr_campaigns where name = $1", [CAMPAIGN])).visits === 1,
      );
      await go(p, `/start?src=qr&campaign=${CAMPAIGN}`);
      await sleep(800);
      check(
        "repeat visit from the same browser not double-counted",
        (await one("select visits from qr_campaigns where name = $1", [CAMPAIGN])).visits === 1,
      );
      await go(p, "/start?src=qr&campaign=not-a-real-campaign");
      await sleep(800);
      check(
        "unknown campaigns are ignored",
        (await one("select count(*)::int c from qr_campaigns where name = 'not-a-real-campaign'"))
          .c === 0,
      );
      await p.evaluate(() =>
        [...document.querySelectorAll("main a")]
          .find((a) => a.innerText.trim() === "I need a service")
          .click(),
      );
      await p
        .waitForFunction(
          () => location.pathname === "/" && document.activeElement?.id === "hero-search-q",
          { timeout: 15000 },
        )
        .catch(() => {});
      check(
        '"I need a service" opens the homepage with the search box focused',
        await p.evaluate(
          () =>
            location.pathname === "/" &&
            location.search === "" &&
            document.activeElement?.id === "hero-search-q",
        ),
      );
      await go(p, "/start");
      await p.evaluate(() =>
        [...document.querySelectorAll("main a")]
          .find((a) => a.innerText.trim() === "I own a business")
          .click(),
      );
      // Client-side navigation: the address changes before the sign-up form renders.
      await p
        .waitForFunction(
          () =>
            location.pathname === "/signup" && document.querySelector('main input[name="next"]'),
          { timeout: 15000 },
        )
        .catch(() => {});
      check(
        '"I own a business" (signed out) opens sign-up, then the listing form',
        await p.evaluate(
          () =>
            location.pathname === "/signup" &&
            document.querySelector('main input[name="next"]')?.value === "/business/new",
        ),
      );
    }
  }
  check(
    "not in the sitemap",
    !(await (await fetch(`${baseUrl}/sitemap.xml`)).text()).includes("/start"),
  );

  // -------------------------------------------------------------------------------------------
  console.log("\n/start signed in");
  const li = await newPage();
  check("customer logs in (360px)", await login(li, users.customer, "/account"));
  await go(li, `/start?src=qr&campaign=${CAMPAIGN}`);
  await sleep(1000);
  let s = await startInfo(li);
  check("greets them by first name", s.text.includes("Welcome back, Chi!"));
  check(
    '"Continue to my account" and "List a business" instead of sign-up links',
    s.account === "/account" && s.listBiz === "/business/new" && !s.create && !s.login,
  );
  check('"I own a business" goes straight to the listing form', s.business === "/business/new");
  check(`no layout shift when signed in (CLS ${s.cls.toFixed(3)})`, s.cls < 0.01);
  await axe(li, "/start signed in");
  // A new listing after a QR scan is credited to the campaign.
  await li.evaluate(() =>
    [...document.querySelectorAll("main a")]
      .find((a) => a.innerText.trim() === "I own a business")
      .click(),
  );
  await li
    .waitForFunction(() => location.pathname === "/business/new", { timeout: 15000 })
    .catch(() => {});
  await sleep(1500);
  const cat = await one(
    "select id, name from categories where is_active and parent_id is null order by sort_order limit 1",
  );
  await li.evaluate((name) => {
    const set = (sel, v) => {
      const e = document.querySelector(sel);
      if (!e) return;
      const proto =
        e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(e, v);
      e.dispatchEvent(
        new Event(e instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
      );
    };
    set('main [name="name"]', name);
    set('main [name="phone"]', "08036660000");
    set('main [name="whatsappNumber"]', "08036660000");
  }, `E2E QR Biz ${run}`);
  await li.evaluate((catId) => {
    const sel =
      document.querySelector('main select[name="categoryId"]') ??
      document.querySelector('main [name="categoryId"]');
    if (sel) {
      Object.getOwnPropertyDescriptor(
        sel instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
        "value",
      ).set.call(sel, catId);
      sel.dispatchEvent(
        new Event(sel instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
      );
    }
  }, cat.id);
  await li.evaluate(() =>
    [...document.querySelectorAll("main form button[type=submit]")].at(-1).click(),
  );
  await li
    .waitForFunction(() => /step=2/.test(location.search), { timeout: 20000 })
    .catch(() => {});
  const listings = (await one("select listings from qr_campaigns where name = $1", [CAMPAIGN]))
    .listings;
  check(
    "new listing after a scan is credited to the campaign",
    listings === 1,
    `${listings} (${await li.evaluate(() => location.pathname + location.search)})`,
  );
  check("no page errors", li.errors.length === 0, li.errors.join(" | "));
} catch (e) {
  failures++;
  console.log("  ERROR", e.message);
} finally {
  console.log("\nCleanup");
  const idList = Object.values(users)
    .map((u) => u.id)
    .filter(Boolean);
  await q("delete from qr_campaigns where name like 'e2e-%' or name = 'not-a-real-campaign'");
  await q("delete from rate_limit_hits where created_at >= $1", [testStart]);
  await q("delete from businesses where owner_id = any($1::uuid[])", [idList]);
  await q("delete from profiles where id = any($1::uuid[])", [idList]);
  for (const u of Object.values(users))
    if (u.id) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  fs.rmSync(dlDir, { recursive: true, force: true });
  const end = await one(
    "select payment_required, homepage_free_promo from app_settings where id = 1",
  );
  console.log(
    `  settings unchanged: ${end.payment_required === promoStart.payment_required && end.homepage_free_promo === promoStart.homepage_free_promo}`,
  );
  await browser.close();
  await db.end();
  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
