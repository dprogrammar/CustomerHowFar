// Homepage "FREE" promotion switch. Uses /admin/settings like a real admin, compares the promo-OFF
// homepage with a baseline captured from the previous release, and leaves the promotion ON with
// the listing fee OFF. Usage: node test-free-promo.mjs <projectDir> <baseUrl> <shotsDir> [baselinePrefix]
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { axeSource, browserPath } from "./lib/setup.mjs";

const [projectDir, baseUrl, shotsDir, baselinePrefix] = process.argv.slice(2);
const require = createRequire(path.join(projectDir, "package.json"));
require("./scripts/env-guard.mjs").loadEnv(); // refuses production
const { createClient } = require("@supabase/supabase-js");
const pg = require("pg");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const db = new pg.Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
const q = async (s, p = []) => (await db.query(s, p)).rows;
const one = async (s, p = []) => (await q(s, p))[0];
const run = crypto.randomBytes(3).toString("hex");
const user = {
  email: `chf-e2e-${run}-admin@example.com`,
  password: `Tst-${crypto.randomBytes(9).toString("base64url")}9a`,
};
let failures = 0;
const check = (name, pass, detail = "") => {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true });
const settingsRow = () =>
  one("select payment_required, homepage_free_promo from app_settings where id = 1");

async function homeState(w) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  const mobile = w < 768;
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await p.setViewport({ width: w, height: 800, isMobile: mobile, hasTouch: mobile });
  await p.evaluateOnNewDocument(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await p.goto(baseUrl + "/", { waitUntil: "networkidle0" });
  await sleep(1500);
  const s = await p.evaluate(() => {
    const main = document.querySelector("main").cloneNode(true);
    main.querySelectorAll("script").forEach((x) => x.remove());
    const text = document.querySelector("main").innerText;
    const links = [...document.querySelectorAll("main a")].map((a) => ({
      text: a.innerText.trim(),
      href: a.getAttribute("href"),
    }));
    return {
      html: main.innerHTML,
      height: document.documentElement.scrollHeight,
      text,
      links,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      cls: window.__cls,
      ctaHeading: document.getElementById("cta-title")?.innerText,
      ctaInside: (() => {
        const l = [...document.querySelectorAll("main a")].find(
          (x) => x.innerText.trim() === "Own a business? List it for FREE today",
        );
        if (!l) return null;
        const r = l.getBoundingClientRect();
        return r.left >= 8 && r.right <= innerWidth - 8;
      })(),
      firstBlock: [...document.querySelector("main").children]
        .find((c) => c.tagName !== "SCRIPT")
        ?.innerText?.trim()
        .slice(0, 80),
    };
  });
  return { page: p, ctx, ...s };
}
async function axe(page, label) {
  await page.evaluate(axeSource);
  const v = await page.evaluate(async () =>
    (
      await window.axe.run(document, {
        runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"],
      })
    ).violations.map((x) => `${x.impact} ${x.id}: ${x.nodes[0]?.target.join(" ")}`),
  );
  check(`a11y and colour contrast: ${label}`, v.length === 0, v.join(" | "));
}

// Saves settings through the real form: optional switch flips, then "Save changes" + "Apply now".
async function saveSettings(page, flips) {
  await page.goto(`${baseUrl}/admin/settings`, { waitUntil: "load" });
  await sleep(1200);
  for (const label of flips) {
    await page.evaluate((l) => {
      const sw = [...document.querySelectorAll('main button[role="switch"]')].find((b) =>
        document.getElementById(b.getAttribute("aria-labelledby"))?.innerText.includes(l),
      );
      sw.click();
    }, label);
    await sleep(200);
  }
  await page.evaluate(() =>
    [...document.querySelectorAll("main button")]
      .find((b) => b.innerText.trim() === "Save changes")
      .click(),
  );
  await page.waitForSelector("dialog[open]", { timeout: 10000 });
  const dialog = await page.evaluate(() => document.querySelector("dialog[open]").innerText);
  await page.evaluate(() =>
    [...document.querySelectorAll("dialog[open] button")]
      .find((b) => b.innerText.trim() === "Apply now")
      .click(),
  );
  await page
    .waitForFunction(
      () => /Settings saved|can't be shown/.test(document.querySelector("main").innerText),
      { timeout: 20000 },
    )
    .catch(() => {});
  await sleep(800);
  return {
    dialog,
    message: await page.evaluate(
      () => document.querySelector("main [role=status], main [role=alert]")?.innerText ?? "",
    ),
  };
}

const start = await settingsRow();
let uid;
try {
  console.log("Setup");
  check("starting point: listing fee OFF", start.payment_required === false);
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { full_name: "Ade Admin" },
    app_metadata: { role: "admin" },
  });
  if (error) throw new Error(error.code);
  uid = data.user.id;
  await q(
    "insert into profiles (id, full_name, email, role, updated_at) values ($1,'Ade Admin',$2,'ADMIN', now())",
    [uid, user.email],
  );
  const ad = await (await browser.createBrowserContext()).newPage();
  await ad.setViewport({ width: 1280, height: 900 });
  await ad.goto(`${baseUrl}/login?next=%2Fadmin%2Fsettings`, { waitUntil: "load" });
  await sleep(800);
  for (const [sel, v] of [
    ['main [name="email"]', user.email],
    ['main [name="password"]', user.password],
  ]) {
    await (
      await ad.waitForSelector(sel, { visible: true })
    ).evaluate((e, val) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, val);
      e.dispatchEvent(new Event("input", { bubbles: true }));
    }, v);
  }
  await ad.evaluate(() =>
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
    "admin logs in",
    await ad
      .waitForFunction(() => location.pathname === "/admin/settings", { timeout: 20000 })
      .then(
        () => true,
        () => false,
      ),
  );
  const actionCalls = [];
  ad.on("request", (r) => {
    if (
      r.method() === "POST" &&
      r.headers()["next-action"] &&
      (r.postData() ?? "").includes("homepageFreePromo")
    )
      actionCalls.push({ url: r.url(), headers: r.headers() });
  });

  // -------------------------------------------------------------------------------------------
  console.log("\nDatabase rule: switching the fee on switches the promotion off");
  await q("update app_settings set payment_required = true where id = 1");
  check(
    "trigger: fee ON forces the promotion OFF",
    (await settingsRow()).homepage_free_promo === false,
  );
  await q(
    "update app_settings set payment_required = false, homepage_free_promo = $1 where id = 1",
    [start.homepage_free_promo],
  );

  // -------------------------------------------------------------------------------------------
  console.log("\nAdmin setting");
  await ad.goto(`${baseUrl}/admin/settings`, { waitUntil: "load" });
  await sleep(1000);
  const panel = await ad.evaluate(() => document.querySelector("main").innerText);
  check(
    "toggle labelled \"Show 'Free' promotion on homepage\" with a description",
    panel.includes("Show ‘Free’ promotion on homepage") &&
      panel.includes("launch promotion on the homepage"),
  );
  await axe(ad, "/admin/settings");
  // Start from ON (an earlier fee test may have switched it off), then switch it OFF.
  if (!(await settingsRow()).homepage_free_promo) await saveSettings(ad, ["Free"]);
  {
    const r = await saveSettings(ad, ["Free"]);
    check(
      "turn the promotion OFF (dialog explains it)",
      r.dialog.includes("removed from the homepage") &&
        (await settingsRow()).homepage_free_promo === false,
    );
  }
  const offLog = await one(
    "select old_value, new_value from setting_changes where admin_id = $1 and field = 'homepageFreePromo' order by created_at desc limit 1",
    [uid],
  );
  check(
    "audit log entry for the change",
    offLog && offLog.old_value === "true" && offLog.new_value === "false",
  );
  check(
    "change history shows it",
    await ad.evaluate(() =>
      document.querySelector("main").innerText.includes("'Free' promotion on homepage: On → Off"),
    ),
  );

  // -------------------------------------------------------------------------------------------
  console.log("\nPromotion OFF: homepage exactly as before");
  const baseline =
    baselinePrefix && fs.existsSync(`${baselinePrefix}.json`)
      ? JSON.parse(fs.readFileSync(`${baselinePrefix}.json`, "utf8"))
      : null;
  for (const w of [360, 1280]) {
    const s = await homeState(w);
    check(
      `${w}px: no promotion`,
      !/100% FREE|FREE for customers & businesses|List it for FREE/.test(s.text),
    );
    if (baseline) {
      // Server action keys change with every build, and React's internal element ids (useId)
      // depend on the component tree; neither is visible, so ignore them.
      const norm = (h) =>
        h
          .replace(/(name="\$ACTION_[A-Z_]+[^"]*" value=")[^"]*/g, "$1")
          .replace(/_R_[A-Za-z0-9]+_/g, "_R_id_");
      const a = norm(baseline[w].html);
      s.html = norm(s.html);
      let at = 0;
      while (at < Math.max(a.length, s.html.length) && a[at] === s.html[at]) at++;
      check(
        `${w}px: same markup as the previous release`,
        s.html === a,
        at < a.length
          ? `first difference at ${at}: ${JSON.stringify(a.slice(Math.max(0, at - 40), at + 40))} vs ${JSON.stringify(s.html.slice(Math.max(0, at - 40), at + 40))}`
          : "",
      );
      check(
        `${w}px: same page height (no layout difference)`,
        s.height === baseline[w].height,
        `${s.height} vs ${baseline[w].height}`,
      );
      // Pixel comparison of the full page with the previous release (same capture settings).
      const before = `${baselinePrefix}-${w}.png`;
      if (fs.existsSync(before)) {
        const after = path.join(path.dirname(before), `home-after-off-${w}.png`);
        await s.page.reload({ waitUntil: "networkidle0" });
        await sleep(1500);
        await s.page.screenshot({ path: after, fullPage: true });
        const diff = await s.page.evaluate(
          async (a, b) => {
            const load = (src) =>
              new Promise((res, rej) => {
                const i = new Image();
                i.onload = () => res(i);
                i.onerror = rej;
                i.src = src;
              });
            const [x, y] = await Promise.all([load(a), load(b)]);
            if (x.width !== y.width || x.height !== y.height) return { sizeDiffers: true };
            const c = (img) => {
              const cv = document.createElement("canvas");
              cv.width = img.width;
              cv.height = img.height;
              const g = cv.getContext("2d");
              g.drawImage(img, 0, 0);
              return g.getImageData(0, 0, img.width, img.height).data;
            };
            const [da, db] = [c(x), c(y)];
            let changed = 0;
            for (let i = 0; i < da.length; i += 4)
              if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) changed++;
            return { changed, total: da.length / 4 };
          },
          `data:image/png;base64,${fs.readFileSync(before).toString("base64")}`,
          `data:image/png;base64,${fs.readFileSync(after).toString("base64")}`,
        );
        check(
          `${w}px: looks identical to the previous release (pixels)`,
          !diff.sizeDiffers && diff.changed === 0,
          JSON.stringify(diff),
        );
      }
    }
    await s.ctx.close();
  }

  // -------------------------------------------------------------------------------------------
  console.log("\nPromotion ON");
  let r = await saveSettings(ad, ["Free"]);
  check(
    "turn the promotion ON (refreshes the homepage immediately)",
    r.dialog.includes("homepage shows the 'Free' promotion") &&
      (await settingsRow()).homepage_free_promo === true,
  );
  for (const w of [360, 1280]) {
    const s = await homeState(w);
    check(
      `${w}px: announcement bar at the top of the homepage`,
      s.firstBlock?.startsWith("🎉 100% FREE: List your business at no cost today!") &&
        s.links.some((l) => l.text === "List now" && l.href === "/business/new"),
      s.firstBlock,
    );
    check(
      `${w}px: gold badge, with "Now live in Lagos" still visible`,
      s.text.includes("FREE for customers & businesses") && /Now live in Lagos/.test(s.text),
    );
    check(
      `${w}px: three check items under the search`,
      ["Free for customers", "Free to list your business", "No commission"].every((t) =>
        s.text.includes(t),
      ),
    );
    check(
      `${w}px: big hero button to /business/new`,
      s.links.some(
        (l) => l.text === "Own a business? List it for FREE today" && l.href === "/business/new",
      ),
    );
    check(
      `${w}px: FREE label in the business section heading`,
      s.ctaHeading?.replace(/\s+/g, " ").startsWith("FREE"),
      s.ctaHeading,
    );
    check(`${w}px: no horizontal scroll`, !s.overflow);
    check(`${w}px: hero button stays inside the page margins`, s.ctaInside === true);
    check(`${w}px: no layout shift (CLS ${s.cls.toFixed(3)})`, s.cls < 0.01);
    await axe(s.page, `homepage with promotion (${w}px)`);
    if (shotsDir) await s.page.screenshot({ path: path.join(shotsDir, `free-promo-${w}.png`) });
    await s.ctx.close();
  }

  // -------------------------------------------------------------------------------------------
  console.log("\nRule: never with the listing fee on");
  r = await saveSettings(ad, ["Require listing fee"]);
  let st = await settingsRow();
  check(
    "turning the fee ON: the dialog says the promotion will be switched off",
    r.dialog.includes("will be switched off"),
    r.dialog.replace(/\s+/g, " ").slice(0, 160),
  );
  check(
    "... fee ON, promotion OFF",
    st.payment_required === true && st.homepage_free_promo === false,
  );
  check("... the admin is told", r.message.includes("promotion was switched off"), r.message);
  let s = await homeState(360);
  check(
    "homepage: no promotion while the fee is on",
    !/100% FREE|List it for FREE|FREE for customers/.test(s.text),
  );
  await s.ctx.close();
  await ad.goto(`${baseUrl}/admin/settings`, { waitUntil: "load" });
  await sleep(1000);
  const sw = await ad.evaluate(() => {
    const b = [...document.querySelectorAll('main button[role="switch"]')].find((x) =>
      document.getElementById(x.getAttribute("aria-labelledby"))?.innerText.includes("Free"),
    );
    return {
      disabled: b.disabled,
      hint: document.getElementById(b.getAttribute("aria-describedby"))?.innerText,
    };
  });
  check(
    "while the fee is on, the promotion switch is disabled with a clear reason",
    sw.disabled && /Not available while the listing fee is on/.test(sw.hint),
    sw.hint,
  );
  const call = actionCalls.at(-1);
  const forged = await ad.evaluate(
    async ({ url, action, ct, body }) =>
      (
        await fetch(url, {
          method: "POST",
          headers: { "next-action": action, "content-type": ct, accept: "text/x-component" },
          body,
        })
      ).text(),
    {
      url: call.url,
      action: call.headers["next-action"],
      ct: call.headers["content-type"],
      body: JSON.stringify([
        {
          ...(await one(
            'select payment_required as "paymentRequired", listing_fee_naira as "listingFeeNaira", manual_transfer_enabled as "manualTransferEnabled", coalesce(bank_name,\'\') as "bankName", coalesce(bank_account_number,\'\') as "bankAccountNumber", coalesce(bank_account_name,\'\') as "bankAccountName" from app_settings where id = 1',
          )),
          homepageFreePromo: true,
        },
      ]),
    },
  );
  check(
    "server blocks turning the promotion on while the fee is on (clear message)",
    forged.includes("can't be shown while the listing fee is on") &&
      (await settingsRow()).homepage_free_promo === false,
  );
  r = await saveSettings(ad, ["Require listing fee"]);
  st = await settingsRow();
  check(
    "fee back OFF (promotion stays off until switched on)",
    st.payment_required === false && st.homepage_free_promo === false,
  );
  r = await saveSettings(ad, ["Free"]);
  st = await settingsRow();
  check(
    "promotion switched back ON",
    st.payment_required === false && st.homepage_free_promo === true,
  );
  s = await homeState(360);
  check("homepage shows the promotion again", s.text.includes("FREE for customers & businesses"));
  await s.ctx.close();
} catch (e) {
  failures++;
  console.log("  ERROR", e.message);
} finally {
  console.log("\nCleanup");
  const now = await settingsRow();
  if (now.payment_required !== false || now.homepage_free_promo !== true) {
    await q(
      "update app_settings set payment_required = false, homepage_free_promo = true where id = 1",
    );
    console.log("  settings restored directly (fee OFF, promotion ON)");
  }
  if (uid) {
    await q("delete from setting_changes where admin_id = $1", [uid]);
    await q("delete from profiles where id = $1", [uid]);
    await admin.auth.admin.deleteUser(uid).catch(() => {});
  }
  const end = await settingsRow();
  console.log(
    `  final: fee ${end.payment_required ? "ON" : "OFF"}, promotion ${end.homepage_free_promo ? "ON" : "OFF"}`,
  );
  await browser.close();
  await db.end();
  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
