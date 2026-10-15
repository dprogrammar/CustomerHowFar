// End-to-end test of the public side. Real DB, Supabase and Cloudinary; emails go to a test
// outbox. Only data owned by the test users is created and deleted.
// Usage: node test-public.mjs <projectDir> <baseUrl> <outboxFile> <shotsDir>
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

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// A pool reconnects by itself if the pooler drops an idle connection.
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
    name: "Ada Owner",
    role: "BUSINESS_OWNER",
  },
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
const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const UA_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

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

async function newPage({ width = 360, mobile = width < 600, ua = mobile ? UA : UA_DESKTOP } = {}) {
  const context = await browser.createBrowserContext();
  await context.overridePermissions(baseUrl, ["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();
  await page.setUserAgent(ua);
  await page.setViewport({ width, height: 800, isMobile: mobile, hasTouch: mobile });
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
    waitText: (t, timeout = 15000) =>
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
    names: () =>
      page.evaluate(() =>
        [...document.querySelectorAll("main article h3")]
          .filter((e) => e.offsetParent !== null)
          .map((e) => e.textContent.trim()),
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
          offenders: [...document.querySelectorAll("body *")]
            .filter(
              (e) =>
                e.offsetParent !== null &&
                e.getBoundingClientRect().right > document.documentElement.clientWidth + 1 &&
                !e.closest("[class*='overflow-x-auto']"),
            )
            .filter((e, _, all) => !all.some((o) => o !== e && e.contains(o)))
            .slice(0, 3)
            .map(
              (e) =>
                `${e.tagName.toLowerCase()}[${Math.round(e.getBoundingClientRect().right)}] ${String(e.className).slice(0, 60)}`,
            ),
        };
      });
      check(
        `a11y + width: ${label}`,
        r.v.length === 0 && !r.overflow,
        [r.overflow ? `overflow: ${r.offenders.join(" || ")}` : "", ...r.v]
          .filter(Boolean)
          .join(" | "),
      );
    },
    shot: (name) =>
      page.screenshot({ path: path.join(shotsDir, `public-${name}.png`), fullPage: true }),
    clickText: async (label, selector = "button, a") => {
      await page
        .waitForFunction(
          (l, s) =>
            [...document.querySelectorAll(s)].some(
              (b) =>
                (b.offsetParent !== null || b.closest("dialog[open]")) &&
                !b.disabled &&
                b.textContent.trim().startsWith(l),
            ),
          { timeout: 10000 },
          label,
          selector,
        )
        .catch(() => {});
      const ok = await page.evaluate(
        (l, s) => {
          const b = [...document.querySelectorAll(s)].find(
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
        selector,
      );
      if (!ok) throw new Error(`"${label}" not found`);
    },
  };
  return h;
}

async function login(page, user, next) {
  const h = helpers(page);
  await h.go(`/login?next=${encodeURIComponent(next)}`);
  for (const [name, value] of [
    ["email", user.email],
    ["password", user.password],
  ]) {
    const el = await page.waitForSelector(`main [name="${name}"]`, { visible: true });
    await el.type(value);
  }
  await page.evaluate(() => {
    const form = [...document.querySelectorAll("main form")]
      .filter((f) => f.offsetParent !== null)
      .at(-1);
    [...form.querySelectorAll("button[type=submit]")].at(-1).click();
  });
  return page
    .waitForFunction((p) => location.pathname === p, { timeout: 20000 }, next)
    .then(
      () => true,
      () => false,
    );
}

// ---------------------------------------------------------------------------------------
const ids = {};
const slugs = {};
const uploaded = [];
const ref = async () => ({
  cats: Object.fromEntries((await q("select slug, id from categories")).map((r) => [r.slug, r.id])),
  states: Object.fromEntries((await q("select slug, id from states")).map((r) => [r.slug, r.id])),
});
const lgaId = async (stateId, slug) =>
  (await one("select id from lgas where state_id = $1 and slug = $2", [stateId, slug])).id;
const ALL_DAYS_OPEN = JSON.stringify(
  Object.fromEntries(
    ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [
      d,
      { open: "00:00", close: "23:59" },
    ]),
  ),
);

async function insertBusiness(key, f, r) {
  const id = crypto.randomUUID();
  ids[key] = id;
  slugs[key] = `e2e-${run}-${key.toLowerCase()}`;
  await q(
    `insert into businesses (id, owner_id, name, slug, category_id, tagline, description, services, phone, whatsapp_number, address, area, state_id, lga_id,
       status, is_featured, is_verified, view_count, published_at, opening_hours, logo_public_id, cover_public_id, submitted_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,'1 Test Street',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20, now(), now())`,
    [
      id,
      users.owner.id,
      f.name,
      slugs[key],
      r.cats[f.cat],
      f.tagline ?? null,
      f.description ??
        "Quality work at fair prices, trusted by customers across the city for years.",
      f.services ?? [],
      f.phone ?? "+2348031110000",
      f.area ?? null,
      r.states[f.state],
      await lgaId(r.states[f.state], f.lga),
      f.status ?? "APPROVED",
      f.featured ?? false,
      f.verified ?? false,
      f.views ?? 0,
      f.publishedAt ?? new Date(),
      f.hours ?? null,
      f.logo ?? null,
      f.cover ?? null,
    ],
  );
  return id;
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
  // Real test images in the owner's Cloudinary folder.
  const imgPage = await newPage();
  const dataUris = await imgPage.evaluate(() =>
    ["#008751", "#f5820b", "#3355ff", "#aa2266"].map((color, i) => {
      const c = document.createElement("canvas");
      c.width = 1200;
      c.height = 800;
      const ctx = c.getContext("2d");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1200, 800);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 120px sans-serif";
      ctx.fillText(`Photo ${i + 1}`, 300, 450);
      return c.toDataURL("image/jpeg", 0.8);
    }),
  );
  await imgPage.close();
  for (const uri of dataUris) {
    const res = await cloudinary.uploader.upload(uri, { folder: `${CLD}/users/${users.owner.id}` });
    uploaded.push(res.public_id);
  }
  const r = await ref();
  const day = 86400_000;
  await insertBusiness(
    "Adaeze",
    {
      name: `E2E Adaeze Tailoring House ${run}`,
      cat: "fashion-tailoring",
      state: "lagos",
      lga: "ikeja",
      area: "Allen Avenue",
      tagline: "Bespoke bridal gowns and aso ebi",
      services: ["Bridal gowns", "Aso ebi"],
      featured: true,
      verified: true,
      hours: ALL_DAYS_OPEN,
      cover: uploaded[0],
      logo: uploaded[1],
      publishedAt: new Date(Date.now() - 2 * day),
    },
    r,
  );
  for (const [i, pid] of [uploaded[1], uploaded[2], uploaded[3]].entries()) {
    await q(
      "insert into business_photos (id, business_id, public_id, width, height, caption, sort_order, updated_at) values (gen_random_uuid(), $1, $2, 1200, 800, $3, $4, now())",
      [ids.Adaeze, pid, `Test caption ${i + 1}`, i],
    );
  }
  await insertBusiness(
    "Stitches",
    {
      name: `E2E Lagos Stitches ${run}`,
      cat: "fashion-tailoring",
      state: "lagos",
      lga: "eti-osa",
      tagline: "Men's native wear",
      views: 50,
      publishedAt: new Date(Date.now() - 5 * day),
    },
    r,
  );
  await insertBusiness(
    "Kano",
    {
      name: `E2E Kano Tailors ${run}`,
      cat: "fashion-tailoring",
      state: "kano",
      lga: "fagge",
      tagline: "Kaftans and agbada",
      publishedAt: new Date(Date.now() - 1 * day),
    },
    r,
  );
  await insertBusiness(
    "Sparks",
    {
      name: `E2E Abuja Sparks ${run}`,
      cat: "electricians",
      state: "fct",
      lga: "abuja-municipal",
      tagline: "Solar and inverter installation",
      phone: "+2348031110004",
    },
    r,
  );
  await insertBusiness(
    "Pending",
    {
      name: `E2E Pending Plumbing ${run}`,
      cat: "plumbers",
      state: "lagos",
      lga: "ikeja",
      status: "PENDING_REVIEW",
      phone: "+2348031110005",
    },
    r,
  );
  await insertBusiness(
    "LivePlumb",
    {
      name: `E2E Live Plumbers ${run}`,
      cat: "plumbers",
      state: "oyo",
      lga: "ibadan-north",
      tagline: "Borehole and pipe repairs",
      phone: "+2348031110006",
    },
    r,
  );
  for (let i = 0; i < 21; i++) {
    await insertBusiness(
      `Bake${i}`,
      {
        name: `E2E Bakery ${run} ${String(i).padStart(2, "0")}`,
        cat: "bakers",
        state: "ogun",
        lga: "ifo",
        phone: `+23480311120${String(i).padStart(2, "0")}`,
      },
      r,
    );
  }
  const st = await one("select search_text from businesses where id = $1", [ids.Adaeze]);
  check(
    "search columns filled by the database trigger",
    st.search_text?.includes("fashion") && st.search_text.includes("bridal gowns"),
  );

  // -------------------------------------------------------------------------------------
  console.log("\nSearch");
  const sp = await newPage();
  const S = helpers(sp);
  const e2eNames = async () => (await S.names()).filter((n) => n.includes(run));
  await S.go("/search?q=tailer");
  let names = await e2eNames();
  check(
    "typo 'tailer' finds the tailors",
    names.some((n) => n.includes("Adaeze")) &&
      names.some((n) => n.includes("Kano Tailors")) &&
      !names.some((n) => n.includes("Sparks")),
    names.join(", "),
  );
  await S.go("/search?q=plumer");
  check(
    "typo 'plumer' finds plumbers (approved only)",
    (await e2eNames()).some((n) => n.includes("Live Plumbers")) &&
      !(await e2eNames()).some((n) => n.includes("Pending")),
  );
  await S.go(`/search?q=${encodeURIComponent("bridal gown")}`);
  check("searches services", (await e2eNames())[0]?.includes("Adaeze"));
  await S.go("/search?q=tailor");
  names = await e2eNames();
  check("best match: featured ranks first", names[0]?.includes("Adaeze"), names.join(", "));
  await S.go("/search?q=tailor&state=lagos");
  names = await e2eNames();
  check(
    "state filter",
    names.length === 2 && names.every((n) => n.includes("Adaeze") || n.includes("Stitches")),
    names.join(", "),
  );
  await S.go("/search?q=tailor&state=lagos&lga=ikeja");
  names = await e2eNames();
  check("LGA filter", names.length === 1 && names[0].includes("Adaeze"), names.join(", "));
  await S.go("/search?category=electricians");
  check("category filter", (await e2eNames()).join() === `E2E Abuja Sparks ${run}`);
  await S.go("/search?category=fashion-tailoring&sort=viewed");
  names = await e2eNames();
  check("sort: most viewed", names[0]?.includes("Stitches"), names.join(", "));
  await S.go("/search?category=fashion-tailoring&sort=newest");
  names = await e2eNames();
  check("sort: newest", names[0]?.includes("Kano"), names.join(", "));
  check("result count shown", (await S.text()).match(/\d+ business(es)?/) !== null);
  await S.axe("search @360px");
  await S.shot("search-360");

  console.log("\nMobile filters (bottom sheet) and chips");
  await S.go("/search?q=tailor");
  await S.clickText("Filters");
  await sp.waitForSelector("dialog[open]", { timeout: 5000 });
  await S.axe("filters sheet @360px");
  await sp.select("dialog[open] select[name=state]", "kano");
  await S.clickText("Show results", "dialog[open] button");
  await sp
    .waitForFunction(() => location.search.includes("state=kano"), { timeout: 10000 })
    .catch(() => {});
  names = await e2eNames();
  check(
    "bottom sheet applies filters",
    sp.url().includes("state=kano") && names.length === 1 && names[0].includes("Kano"),
    sp.url().replace(baseUrl, ""),
  );
  check(
    "active filter chips shown",
    await sp.evaluate(() =>
      [...document.querySelectorAll('ul[aria-label="Active filters"] a')]
        .map((a) => a.textContent)
        .join("|")
        .includes("Kano"),
    ),
  );
  await sp.evaluate(() =>
    [...document.querySelectorAll('ul[aria-label="Active filters"] a')]
      .find((a) => a.textContent.includes("Kano"))
      .click(),
  );
  await sp
    .waitForFunction(() => !location.search.includes("state="), { timeout: 10000 })
    .catch(() => {});
  check("removing a chip removes the filter", !sp.url().includes("state="));
  await S.go("/search?q=zzqqxxvv");
  check(
    "helpful empty state",
    (await S.waitText("No businesses match")) && (await S.text()).includes("Popular categories"),
  );

  console.log("\nCategories");
  await S.go("/categories");
  check(
    "categories page lists counts",
    (await S.waitText("Fashion & Tailoring")) && /\d+ listings?/.test(await S.text()),
  );
  await S.axe("categories @360px");
  await S.go("/category/bakers");
  check(
    "category page: first 20 + Load more",
    (await e2eNames()).length === 20 && (await S.text()).includes("Load more"),
  );
  await S.clickText("Load more");
  await sp
    .waitForFunction(() => location.search.includes("page=2"), { timeout: 10000 })
    .catch(() => {});
  await sleep(1500);
  check(
    "load more shows the rest",
    (await e2eNames()).length === 21,
    String((await e2eNames()).length),
  );
  await S.go("/category/fashion-tailoring/lagos");
  names = await e2eNames();
  check(
    "'Fashion & Tailoring in Lagos' page",
    (await sp.title()).startsWith("Fashion & Tailoring in Lagos") && names.length === 2,
    `${await sp.title()} / ${names.length}`,
  );
  await S.axe("category+state @360px");
  await S.go("/category/fashion-tailoring");
  await S.clickText("Filters");
  await sp.waitForSelector("dialog[open]");
  await sp.select("dialog[open] select[name=state]", "lagos");
  await S.clickText("Show results", "dialog[open] button");
  await sp
    .waitForFunction(() => location.pathname === "/category/fashion-tailoring/lagos", {
      timeout: 10000,
    })
    .catch(() => {});
  check(
    "category filter by state goes to SEO URL",
    new URL(sp.url()).pathname === "/category/fashion-tailoring/lagos",
  );

  // -------------------------------------------------------------------------------------
  console.log("\nBusiness page");
  const bp = await newPage();
  const B = helpers(bp);
  const res = await B.go(`/business/${slugs.Adaeze}`);
  const t = await B.text();
  check(
    "page renders with name, category, location (no Verified wording)",
    res.status() === 200 &&
      t.includes(`E2E Adaeze Tailoring House ${run}`) &&
      !/verified/i.test(t) &&
      t.includes("Fashion & Tailoring") &&
      t.includes("Ikeja, Lagos"),
  );
  check(
    "services, hours and Open now",
    t.includes("Bridal gowns") && t.includes("Opening hours") && (await B.waitText("Open now")),
  );
  check("reviews placeholder", t.includes("No reviews yet"));
  const seo = await bp.evaluate(() => ({
    title: document.title,
    canonical: document.querySelector('link[rel="canonical"]')?.href,
    og: document.querySelector('meta[property="og:image"]')?.content,
    ld: [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => JSON.parse(s.textContent))
      .find((d) => d["@type"] === "LocalBusiness"),
  }));
  check(
    "unique title, canonical, OG image from cover",
    seo.title.includes("Adaeze Tailoring") &&
      seo.canonical?.endsWith(`/business/${slugs.Adaeze}`) &&
      seo.og?.includes("res.cloudinary.com") &&
      seo.og.includes("w_1200"),
  );
  check(
    "LocalBusiness structured data",
    seo.ld?.name?.includes("Adaeze") &&
      seo.ld.address?.addressRegion === "Lagos" &&
      Array.isArray(seo.ld.openingHoursSpecification),
  );
  const wa = await bp.evaluate(
    () =>
      [...document.querySelectorAll("a[href^='https://wa.me/']")].find(
        (a) => a.offsetParent !== null,
      )?.href,
  );
  check(
    "WhatsApp link with pre-filled message",
    wa?.startsWith("https://wa.me/2348031110000?text=") &&
      decodeURIComponent(wa).includes("I found you on CustomerHowFar"),
  );
  const navState = await bp.evaluate(() => ({
    cls: document.body.className.includes("has-contact-bar"),
    navs: [...document.querySelectorAll('nav[aria-label="Bottom navigation"]')].map(
      (n) => getComputedStyle(n).display,
    ),
    bar: document.querySelector("[data-contact-bar]")?.getBoundingClientRect().height,
  }));
  check(
    "bottom nav replaced by contact bar on mobile",
    navState.cls && navState.navs.every((d) => d === "none") && navState.bar > 0,
    JSON.stringify(navState),
  );
  const similar = await bp.evaluate(() =>
    [...document.querySelectorAll('section[aria-labelledby="similar-title"] h3')].map(
      (h) => h.textContent,
    ),
  );
  const similarE2e = similar.filter((n) => n.includes(run));
  check(
    "similar businesses: same category, same state first",
    similarE2e[0]?.includes("Lagos Stitches") &&
      similar.some((n) => n.includes("Kano Tailors")) &&
      !similar.some((n) => n.includes("Sparks")),
    similar.filter((n) => n.includes(run)).join(", "),
  );
  await B.axe("business page @360px");
  await B.shot("business-360");

  console.log("\nGallery lightbox");
  await bp.evaluate(() =>
    [...document.querySelectorAll("main button")]
      .find((b) => b.textContent.includes("View photo 1 of"))
      .click(),
  );
  await bp.waitForSelector("dialog[open]", { timeout: 5000 });
  const counter = () =>
    bp.evaluate(() => document.querySelector("dialog[open] p[aria-live]")?.textContent);
  check("lightbox opens at photo 1", (await counter()) === "1 / 3");
  await B.axe("lightbox @360px");
  const box = await (await bp.$("dialog[open] .flex-1")).boundingBox();
  await bp.touchscreen.touchStart(box.x + box.width * 0.8, box.y + box.height / 2);
  await bp.touchscreen.touchMove(box.x + box.width * 0.2, box.y + box.height / 2);
  await bp.touchscreen.touchEnd();
  await sleep(300);
  check("swipe left shows the next photo", (await counter()) === "2 / 3", await counter());
  await bp.keyboard.press("ArrowRight");
  await sleep(200);
  check("arrow key shows the next photo", (await counter()) === "3 / 3", await counter());
  await bp.keyboard.press("ArrowRight");
  await sleep(200);
  check("wraps around", (await counter()) === "1 / 3");
  await bp.keyboard.press("Escape");
  await sleep(300);
  check("Escape closes the lightbox", !(await bp.$("dialog[open]")));

  console.log("\nTracking");
  await sleep(4500);
  let row = await one("select view_count, contact_click_count from businesses where id = $1", [
    ids.Adaeze,
  ]);
  check("page view counted once", row.view_count === 1, String(row.view_count));
  await B.go(`/business/${slugs.Adaeze}`);
  await sleep(4500);
  check(
    "repeat view in the same session not counted",
    (await one("select view_count from businesses where id = $1", [ids.Adaeze])).view_count === 1,
  );
  await bp.evaluate(() => {
    for (const a of document.querySelectorAll("a[href^='https://wa.me/'], a[href^='tel:']"))
      a.addEventListener("click", (e) => e.preventDefault());
    [...document.querySelectorAll("[data-contact-bar] a")]
      .find((a) => a.href.startsWith("https://wa.me/"))
      .click();
    [...document.querySelectorAll("[data-contact-bar] a")]
      .find((a) => a.href.startsWith("tel:"))
      .click();
  });
  await sleep(2500);
  row = await one("select contact_click_count from businesses where id = $1", [ids.Adaeze]);
  const events = (
    await q("select type::text from contact_events where business_id = $1", [ids.Adaeze])
  )
    .map((e) => e.type)
    .sort()
    .join(",");
  check(
    "WhatsApp + Call taps recorded",
    row.contact_click_count === 2 && events === "CALL,WHATSAPP",
    `${row.contact_click_count} ${events}`,
  );
  const botPage = await newPage({
    ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  });
  await helpers(botPage).go(`/business/${slugs.Adaeze}`);
  await sleep(4500);
  check(
    "bot visit not counted",
    (await one("select view_count from businesses where id = $1", [ids.Adaeze])).view_count === 1,
  );
  await botPage.close();
  const forged = await fetch(`${baseUrl}/api/track`, {
    method: "POST",
    headers: { "sec-fetch-site": "cross-site", "user-agent": UA },
    body: JSON.stringify({ businessId: ids.Adaeze, type: "view" }),
  });
  check(
    "cross-site beacon ignored",
    forged.status === 204 &&
      (await one("select view_count from businesses where id = $1", [ids.Adaeze])).view_count === 1,
  );

  console.log("\nShare and Save");
  const shared = await bp.evaluate(async () => {
    let data = null;
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (d) => {
        data = d;
      },
    });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    [...document.querySelectorAll("[data-contact-bar] button")]
      .find((b) => b.textContent.includes("Share"))
      .click();
    await new Promise((r) => setTimeout(r, 300));
    return data;
  });
  check(
    "Share uses the Web Share API when available",
    shared?.url?.endsWith(`/business/${slugs.Adaeze}`) && shared.title.includes("Adaeze"),
  );
  await bp.evaluate(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    // Capture what the app copies (reading the real clipboard hangs in headless browsers).
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async (text) => {
        window.__copied = text;
      },
    });
    [...document.querySelectorAll("[data-contact-bar] button")]
      .find((b) => b.textContent.includes("Share"))
      .click();
  });
  await sleep(600);
  const copied = await bp.evaluate(async () => ({
    status: [...document.querySelectorAll("[data-contact-bar] [role=status]")].some((s) =>
      s.textContent.includes("Link copied"),
    ),
    clip: window.__copied ?? "",
  }));
  check(
    "Share falls back to copying the link",
    copied.status && copied.clip.endsWith(`/business/${slugs.Adaeze}`),
    copied.clip,
  );
  await bp.evaluate(() =>
    [...document.querySelectorAll("[data-contact-bar] button")]
      .find((b) => b.textContent.includes("Save"))
      .click(),
  );
  await bp
    .waitForFunction(() => location.pathname === "/login", { timeout: 10000 })
    .catch(() => {});
  check(
    "Save requires login (redirects with return URL)",
    new URL(bp.url()).pathname === "/login" &&
      new URL(bp.url()).searchParams.get("next") === `/business/${slugs.Adaeze}`,
  );
  const cp = await newPage();
  const C = helpers(cp);
  check("customer logs in", await login(cp, users.customer, "/account"));
  await C.go(`/business/${slugs.Adaeze}`);
  await cp.waitForFunction(
    () =>
      [...document.querySelectorAll("[data-contact-bar] button[aria-pressed]")].some(
        (b) => !b.disabled,
      ),
    { timeout: 10000 },
  );
  const clickSave = () =>
    cp.evaluate(() =>
      [...document.querySelectorAll("[data-contact-bar] button[aria-pressed]")]
        .find((b) => !b.disabled)
        .click(),
    );
  const isSaved = async () =>
    Boolean(
      await one("select 1 from saved_businesses where user_id = $1 and business_id = $2", [
        users.customer.id,
        ids.Adaeze,
      ]),
    );
  await clickSave();
  // Wait for the save to land; a click that arrived before the page was ready is retried once.
  let saved = false;
  for (let i = 0; i < 20 && !saved; i++) {
    await sleep(500);
    saved = await isSaved();
    if (!saved && i === 6) {
      const pressed = await cp.evaluate(() =>
        Boolean(document.querySelector("[data-contact-bar] button[aria-pressed='true']")),
      );
      if (!pressed) await clickSave();
    }
  }
  check("saved", saved);
  await C.go(`/business/${slugs.Adaeze}`);
  check(
    "heart shows saved after reload",
    await cp
      .waitForFunction(
        () => document.querySelector("[data-contact-bar] button[aria-pressed='true']"),
        { timeout: 10000 },
      )
      .then(
        () => true,
        () => false,
      ),
  );
  await C.go("/saved");
  check("/saved lists it", await C.waitText(`E2E Adaeze Tailoring House ${run}`));
  await C.axe("saved @360px");
  await cp.evaluate(() => document.querySelector("main button[aria-pressed='true']").click());
  await sleep(2000);
  check(
    "unsave from /saved",
    !(await one("select 1 from saved_businesses where user_id = $1 and business_id = $2", [
      users.customer.id,
      ids.Adaeze,
    ])),
  );
  await C.go("/");
  await cp.click('button[aria-haspopup="dialog"]');
  await sleep(300);
  check(
    "mobile menu links to Saved businesses",
    (await cp.evaluate(() => document.querySelector("dialog").innerText)).includes(
      "Saved businesses",
    ),
  );

  console.log("\nPreview of non-approved listings");
  const anon = await newPage();
  await helpers(anon).go(`/business/${slugs.Pending}`);
  check(
    "anonymous: 404 for a pending listing",
    await helpers(anon).waitText("We couldn't find that page"),
  );
  await C.go(`/business/${slugs.Pending}`);
  check("other customer: 404", await C.waitText("We couldn't find that page"));
  const op = await newPage();
  const O = helpers(op);
  check("owner logs in", await login(op, users.owner, "/dashboard"));
  await O.go(`/business/${slugs.Pending}`);
  check(
    "owner sees preview banner with status",
    (await O.waitText("Preview · In review")) &&
      (await O.text()).includes("This listing is not public"),
  );
  await O.go(`/business/${slugs.Adaeze}`);
  check("owner sees 'This is your listing' on live page", await O.waitText("This is your listing"));
  const viewsBefore = (await one("select view_count from businesses where id = $1", [ids.Adaeze]))
    .view_count;
  await sleep(4500);
  check(
    "owner's own visit not counted",
    (await one("select view_count from businesses where id = $1", [ids.Adaeze])).view_count ===
      viewsBefore,
  );
  await O.go("/dashboard");
  check(
    "dashboard 'View' links to the public URL",
    await op.evaluate(
      (slug) =>
        [...document.querySelectorAll("main a")].some(
          (a) => a.getAttribute("href") === `/business/${slug}`,
        ),
      slugs.Adaeze,
    ),
  );
  const ap = await newPage({ width: 1280 });
  const A = helpers(ap);
  check("admin logs in", await login(ap, users.admin, "/account"));
  await A.go(`/business/${slugs.Pending}`);
  check(
    "admin sees preview banner",
    (await A.waitText("Preview · In review")) && (await A.text()).includes("Open in admin"),
  );

  console.log("\nDesktop");
  const dp = await newPage({ width: 1280 });
  const D = helpers(dp);
  await D.go(`/business/${slugs.Adaeze}`);
  check("desktop contact card", await D.waitText("Chat on WhatsApp"));
  await D.axe("business page @1280px");
  await D.shot("business-1280");
  await D.go("/search?q=tailor");
  await D.axe("search @1280px");

  console.log("\nRevalidation");
  await helpers(anon).go(`/business/${slugs.LivePlumb}`);
  check(
    "live plumber page visible (now cached)",
    await helpers(anon).waitText(`E2E Live Plumbers ${run}`),
  );
  await A.go(`/admin/listings/${ids.LivePlumb}`);
  await A.clickText("Suspend");
  await ap.waitForSelector("dialog[open] textarea");
  await ap.type("dialog[open] textarea", "Suspended by the revalidation test.");
  await A.clickText("Suspend listing", "dialog[open] button");
  await A.waitText("Suspended. The listing is hidden");
  await helpers(anon).go(`/business/${slugs.LivePlumb}`);
  check(
    "suspended listing is gone immediately (404)",
    await helpers(anon).waitText("We couldn't find that page"),
  );
  await helpers(anon).go("/search?q=plumbers");
  check(
    "and removed from search",
    !(await helpers(anon).text()).includes(`E2E Live Plumbers ${run}`),
  );
  await A.clickText("Reinstate");
  await A.clickText("Reinstate", "dialog[open] button");
  await A.waitText("Reinstated.");
  await helpers(anon).go(`/business/${slugs.LivePlumb}`);
  check(
    "reinstated listing is back immediately",
    await helpers(anon).waitText(`E2E Live Plumbers ${run}`),
  );
  await A.go(`/admin/listings/${ids.Sparks}`);
  await A.clickText("Feature");
  await A.waitText("Featured on.");
  await helpers(anon).go("/");
  check(
    "featuring shows it on the homepage immediately",
    await helpers(anon).waitText(`E2E Abuja Sparks ${run}`),
  );
  check(
    "homepage shows real featured businesses (no sample data)",
    (await helpers(anon).text()).includes(`E2E Adaeze Tailoring House ${run}`) &&
      !(await helpers(anon).text()).includes("sample profiles"),
  );
  await O.go(`/business/${ids.Adaeze}/edit?step=1`);
  const tagline = await op.waitForSelector('main input[name="tagline"]', { visible: true });
  await tagline.evaluate((e) => (e.value = ""));
  await tagline.type("Updated tagline from revalidation test");
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
  await helpers(anon).go(`/business/${slugs.Adaeze}`);
  check(
    "owner edit to live listing shows immediately",
    await helpers(anon).waitText("Updated tagline from revalidation test"),
  );

  console.log("\nSitemap and footer");
  const sitemap = await (await fetch(`${baseUrl}/sitemap.xml`)).text();
  check(
    "sitemap has approved businesses and category pages",
    sitemap.includes(`/business/${slugs.Adaeze}`) &&
      sitemap.includes("/category/fashion-tailoring/lagos") &&
      sitemap.includes("/category/bakers"),
  );
  check("sitemap excludes non-approved listings", !sitemap.includes(slugs.Pending));
  await helpers(anon).go("/");
  const prefetchRequests = [];
  anon.on("request", (rq) => {
    if (rq.headers()["next-router-prefetch"] || rq.headers()["rsc"])
      prefetchRequests.push(new URL(rq.url()).pathname);
  });
  await anon.evaluate(() => document.querySelector("footer").scrollIntoView());
  await sleep(2500);
  check(
    "footer links are not prefetched",
    !prefetchRequests.some((p) =>
      ["/about", "/terms", "/privacy", "/cookies", "/help", "/safety", "/pricing"].includes(p),
    ),
    prefetchRequests.join(","),
  );
  await helpers(anon).axe("homepage @360px");
} finally {
  console.log("\nCleanup");
  const userIds = Object.values(users)
    .map((u) => u.id)
    .filter(Boolean);
  const del = await db.query("delete from businesses where owner_id = any($1::uuid[])", [userIds]);
  for (const pid of uploaded)
    await cloudinary.uploader.destroy(pid, { invalidate: true }).catch(() => {});
  if (users.owner.id)
    await cloudinary.api
      .delete_resources_by_prefix(`${CLD}/users/${users.owner.id}/`)
      .catch(() => {});
  await q(
    "delete from identity_verifications where user_id = any($1::uuid[]) or reviewed_by_id = any($1::uuid[])",
    [userIds],
  );
  await q("delete from profiles where id = any($1::uuid[])", [userIds]);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  const left = (
    await one("select count(*)::int n from businesses where owner_id = any($1::uuid[])", [userIds])
  ).n;
  const realLeft = (await one("select count(*)::int n from businesses")).n;
  const imgs = users.owner.id
    ? (
        await cloudinary.api.resources({
          type: "upload",
          prefix: `${CLD}/users/${users.owner.id}/`,
        })
      ).resources.length
    : 0;
  check(
    `deleted ${del.rowCount} test businesses, test images and users; ${realLeft} real listing(s) untouched`,
    left === 0 && imgs === 0,
  );
  if (fs.existsSync(outboxFile)) fs.unlinkSync(outboxFile);
  await db.end();
  await browser.close();
}

console.log(`\nResult: ${failures === 0 ? "PASS" : `${failures} failure(s)`}`);
process.exitCode = failures ? 1 : 0;
