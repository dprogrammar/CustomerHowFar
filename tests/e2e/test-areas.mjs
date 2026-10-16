// Service areas (state-by-state launch) and the waitlist. Real DB/Supabase; emails go to a test
// outbox. Uses Ekiti as the test state and restores every state's original setting at the end
// (Lagos is never switched off). Only data created here is touched.
// Usage: node test-areas.mjs <projectDir> <baseUrl> <outboxFile> <shotsDir>
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { axeSource, browserPath } from "./lib/setup.mjs";

const [projectDir, baseUrl, outboxFile] = process.argv.slice(2);
const require = createRequire(path.join(projectDir, "package.json"));
require("./scripts/env-guard.mjs").loadEnv(); // refuses production
const { createClient } = require("@supabase/supabase-js");
const pg = require("pg");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = new pg.Pool({
  connectionString: process.env.DIRECT_URL,
  max: 3,
  idleTimeoutMillis: 10_000,
  keepAlive: true,
});
db.on("error", () => {});
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

const run = crypto.randomBytes(3).toString("hex");
const testStart = new Date();
const pw = () => `Tst-${crypto.randomBytes(9).toString("base64url")}9a`;
const mk = (key, name, role) => ({
  email: `chf-e2e-${run}-${key}@example.com`,
  password: pw(),
  name,
  role,
});
const users = {
  owner: mk("owner", "Ola Owner", "BUSINESS_OWNER"),
  admin: mk("admin", "Ade Admin", "ADMIN"),
  customer: mk("customer", "Chi Customer", "CUSTOMER"),
};
const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const keyed = (kind, value) =>
  crypto
    .createHmac("sha256", process.env.SUPABASE_SECRET_KEY)
    .update(`${kind}:${value}`)
    .digest("hex")
    .slice(0, 32);

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

const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true });
async function newPage({ ip } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 360, height: 800, isMobile: true, hasTouch: true });
  if (ip) await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
  return page;
}
function helpers(page) {
  const h = {
    go: async (p) => {
      const res = await page.goto(baseUrl + p, { waitUntil: "load" });
      await sleep(700);
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
    fill: async (selector, value) => {
      const el = await page.waitForSelector(selector, { visible: true });
      await el.evaluate((e, v) => {
        const proto =
          e instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype
            : e instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(e, v);
        e.dispatchEvent(
          new Event(e instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
        );
      }, value);
    },
    axe: async (label) => {
      await page.evaluate(axeSource);
      const r = await page.evaluate(async () => {
        const res = await window.axe.run(document, {
          runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"],
        });
        return {
          v: res.violations.map((x) => `${x.impact} ${x.id}: ${x.nodes[0]?.target.join(" ")}`),
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });
      check(
        `a11y + 360px: ${label}`,
        r.v.length === 0 && !r.overflow,
        [r.overflow ? "overflow" : "", ...r.v].join(" | "),
      );
    },
  };
  return h;
}
async function login(page, user, next) {
  const h = helpers(page);
  await h.go(`/login?next=${encodeURIComponent(next)}`);
  await h.fill('main [name="email"]', user.email);
  await h.fill('main [name="password"]', user.password);
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
function recorder(page) {
  const calls = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"])
      calls.push({ url: r.url(), headers: r.headers(), body: r.postData() });
  });
  return calls;
}
const replay = (page, call, body) =>
  page.evaluate(
    async ({ url, headers, body }) => (await fetch(url, { method: "POST", headers, body })).text(),
    {
      url: call.url,
      headers: {
        "next-action": call.headers["next-action"],
        "content-type": call.headers["content-type"],
        accept: "text/x-component",
      },
      body,
    },
  );
// Submits a waitlist form on the current page.
async function joinWaitlist(
  page,
  { email, stateId, role = "CUSTOMER", honeypot = false, consent = true },
) {
  const H = helpers(page);
  await page.waitForSelector('main form[aria-label="Join the waitlist"]', { visible: true });
  await H.fill('main form[aria-label="Join the waitlist"] select[name="stateId"]', String(stateId));
  await H.fill('main form[aria-label="Join the waitlist"] input[name="email"]', email);
  await page.evaluate(
    (role, consent, honeypot) => {
      const f = document.querySelector('main form[aria-label="Join the waitlist"]');
      f.querySelector(`input[name="role"][value="${role}"]`).click();
      const c = f.querySelector('input[name="consent"]');
      if (c.checked !== consent) c.click();
      if (honeypot) f.querySelector('input[name="website"]').value = "http://spam.example";
      f.querySelector("button[type=submit]").click();
    },
    role,
    consent,
    honeypot,
  );
  await page
    .waitForFunction(
      () =>
        /Thanks!|Too many attempts|check the highlighted|already live/.test(
          document.querySelector("main")?.innerText ?? "",
        ),
      { timeout: 20000 },
    )
    .catch(() => {});
  return H.text();
}

const originalStates = await q("select id, is_active, launched_at from states");
const ids = {};
try {
  console.log("Setup");
  const st = Object.fromEntries(
    (await q("select slug, id, name, is_active from states")).map((s) => [s.slug, s]),
  );
  ids.lagos = st.lagos.id;
  ids.ekiti = st.ekiti.id;
  check(
    "starting point: Lagos is the only live state",
    Object.values(st)
      .filter((s) => s.is_active)
      .map((s) => s.slug)
      .join() === "lagos",
  );
  check("Ekiti (test state) is not live", !st.ekiti.is_active);
  const lagosLga = (
    await one("select id from lgas where state_id = $1 and slug = 'ikeja'", [ids.lagos])
  ).id;
  const ekitiLga = (
    await one("select id from lgas where state_id = $1 order by name limit 1", [ids.ekiti])
  ).id;
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
  await q(
    "insert into identity_verifications (id, user_id, id_type, full_name_on_id, consent_given_at, status, reviewed_at, submitted_at, updated_at) values (gen_random_uuid(), $1, 'NIN_SLIP', 'Ola Owner', now(), 'APPROVED', now(), now(), now())",
    [users.owner.id],
  );
  const cat = (await one("select id from categories where slug = 'fashion-tailoring'")).id;
  const insert = async (key, stateId, lgaId, status, published) => {
    const id = crypto.randomUUID();
    ids[key] = id;
    await q(
      `insert into businesses (id, owner_id, name, slug, category_id, phone, whatsapp_number, address, state_id, lga_id, description, status, logo_public_id, submitted_at, published_at, updated_at)
             values ($1,$2,$3,$4,$5,'+2348036660000','+2348036660000','1 Test Street',$6,$7,'A complete description of more than thirty characters for testing.',$8,'customerhowfar/users/test/none', now(), $9, now())`,
      [
        id,
        users.owner.id,
        `E2E Areas ${key} ${run}`,
        `e2e-ar-${run}-${key.toLowerCase()}`,
        cat,
        stateId,
        lgaId,
        status,
        published ? new Date() : null,
      ],
    );
  };
  await insert("EkitiDraft", ids.ekiti, ekitiLga, "DRAFT", false);
  await insert("EkitiReview", ids.ekiti, ekitiLga, "PENDING_REVIEW", false);
  await insert("EkitiLive", ids.ekiti, ekitiLga, "APPROVED", true);
  await insert("LagosDraft", ids.lagos, lagosLga, "DRAFT", false);
  if (fs.existsSync(outboxFile)) fs.unlinkSync(outboxFile);

  // -------------------------------------------------------------------------------------
  console.log("\nHomepage and customers");
  const pub = await newPage();
  const P = helpers(pub);
  await P.go("/");
  let t = await P.text();
  check(
    "homepage: 'Now live in Lagos · More states coming soon'",
    t.includes("Now live in Lagos · More states coming soon"),
  );
  check(
    "homepage waitlist form",
    Boolean(await pub.$('main form[aria-label="Join the waitlist"]')),
  );
  const groups = await pub.evaluate(() =>
    [...document.querySelectorAll("#hero-search-state optgroup")].map(
      (g) => `${g.label}:${g.children.length}`,
    ),
  );
  check(
    "hero state filter: live states first, then coming soon",
    groups[0] === "Live now:1" && groups[1] === "Coming soon:36",
    groups.join(", "),
  );
  await P.axe("homepage");
  await P.go(`/search?state=ekiti`);
  t = await P.text();
  check(
    "picking an inactive state: 'We're not in Ekiti yet' + live suggestions",
    t.includes("We're not in Ekiti yet") &&
      t.includes("Search where we're live") &&
      Boolean(await pub.$('main a[href*="state=lagos"]')),
  );
  check("customers can still browse listings there", t.includes(`E2E Areas EkitiLive ${run}`));
  const ekitiPreselected = await pub.evaluate(
    (id) =>
      document.querySelector('main form[aria-label="Join the waitlist"] select[name="stateId"]')
        ?.value === String(id),
    ids.ekiti,
  );
  check("waitlist form preselects that state", ekitiPreselected);
  await P.axe("search in a coming-soon state");
  await P.go("/search?q=tailor&state=lagos");
  check("live state: no 'not here yet' notice", !(await P.text()).includes("We're not in"));
  const seo = await pub
    .goto(`${baseUrl}/category/fashion-tailoring/ekiti`, { waitUntil: "load" })
    .then(() => pub.evaluate(() => document.querySelector('meta[name="robots"]')?.content ?? ""));
  check("category page for an inactive state is noindex", seo.includes("noindex"), seo);
  const sitemap = await (await fetch(`${baseUrl}/sitemap.xml`)).text();
  check(
    "sitemap: no inactive-state category pages",
    !sitemap.includes("/category/fashion-tailoring/ekiti"),
  );

  // -------------------------------------------------------------------------------------
  console.log("\nBusiness onboarding (Lagos only)");
  const op = await newPage();
  const O = helpers(op);
  recorder(op);
  check("owner logs in", await login(op, users.owner, "/dashboard"));
  await O.go("/business/new");
  check(
    "/business/new: 'We're currently accepting businesses in Lagos. More states coming soon.'",
    (await O.waitText("We're currently accepting businesses in Lagos.")) &&
      (await O.text()).includes("More states coming soon."),
  );
  await O.go(`/business/${ids.LagosDraft}/edit?step=2`);
  await op.waitForSelector('main select[name="stateId"]');
  const opts = await op.evaluate(() =>
    [...document.querySelectorAll('main select[name="stateId"] option')].map(
      (o) => `${o.textContent}|${o.disabled}`,
    ),
  );
  check(
    "step 2: Lagos selectable, others disabled 'coming soon'",
    opts.includes("Lagos|false") &&
      opts.includes("Ekiti (coming soon)|true") &&
      opts.filter((o) => o.endsWith("|true")).length === 36,
  );
  check(
    "step 2: note + waitlist under the dropdown",
    (await O.text()).includes("Your state isn't available yet?"),
  );
  await O.axe("onboarding step 2");
  // Forged: re-enable the disabled Ekiti option in the page and submit it.
  await op.evaluate(
    (ekiti, lga) => {
      const s = document.querySelector('main select[name="stateId"]');
      const o = s.querySelector(`option[value="${ekiti}"]`);
      o.disabled = false;
      s.value = String(ekiti);
      const l = document.querySelector('main select[name="lgaId"]');
      l.disabled = false;
      l.add(new Option("Forged LGA", String(lga)));
      l.value = String(lga);
      [...document.querySelectorAll('main form button[type="submit"]')]
        .find((b) => b.offsetParent !== null)
        .click();
    },
    ids.ekiti,
    ekitiLga,
  );
  check(
    "forged request: moving a listing to an inactive state is rejected",
    (await O.waitText("isn't available yet")) &&
      (await one("select state_id from businesses where id = $1", [ids.LagosDraft])).state_id ===
        ids.lagos,
  );
  await O.go(`/business/${ids.LagosDraft}/edit?step=2`);
  await op.waitForSelector('main select[name="stateId"]');
  await O.fill('main select[name="stateId"]', String(ids.lagos));
  await sleep(300);
  await O.fill('main select[name="lgaId"]', String(lagosLga));
  await op.evaluate(() =>
    [...document.querySelectorAll('main form button[type="submit"]')]
      .find((b) => b.offsetParent !== null)
      .click(),
  );
  check(
    "saving a Lagos location works",
    await op
      .waitForFunction(() => location.search.includes("step=3"), { timeout: 20000 })
      .then(
        () => true,
        () => false,
      ),
  );
  await O.go(`/business/${ids.EkitiDraft}/edit?step=2`);
  await op.waitForSelector('main select[name="stateId"]');
  check(
    "a draft's current inactive state stays selectable",
    await op.evaluate(
      (e) =>
        document.querySelector(`main select[name="stateId"] option[value="${e}"]`).disabled ===
          false && document.querySelector('main select[name="stateId"]').value === String(e),
      ids.ekiti,
    ),
  );
  await op.evaluate(() =>
    [...document.querySelectorAll('main form button[type="submit"]')]
      .find((b) => b.offsetParent !== null)
      .click(),
  );
  check(
    "a draft already in an inactive state can still be saved",
    await op
      .waitForFunction(() => location.search.includes("step=3"), { timeout: 20000 })
      .then(
        () => true,
        () => false,
      ),
  );
  await O.go(`/business/${ids.EkitiDraft}/edit?step=5`);
  check(
    "step 5 for an inactive-state draft: explained, submit disabled",
    (await O.waitText("Your state isn't available yet")) &&
      (await op.evaluate(
        () =>
          [...document.querySelectorAll("main button")].find((b) =>
            b.textContent.includes("Send for review"),
          )?.disabled,
      )) === true,
  );
  // Submit the Lagos draft for real, then replay that request for the Ekiti draft.
  await O.go(`/business/${ids.LagosDraft}/edit?step=5`);
  await op.evaluate(() => document.querySelector('main input[name="acceptTerms"]').click());
  await op.evaluate(() =>
    [...document.querySelectorAll("main button")]
      .find((b) => b.textContent.includes("Send for review"))
      .click(),
  );
  await op
    .waitForFunction(() => location.pathname.endsWith("/submitted"), { timeout: 20000 })
    .catch(() => {});
  check(
    "Lagos listing can be submitted",
    (await one("select status from businesses where id = $1", [ids.LagosDraft])).status ===
      "PENDING_REVIEW",
  );
  // Forged: re-enable the disabled Submit button on the Ekiti draft and submit.
  const forceSubmit = async () => {
    await O.go(`/business/${ids.EkitiDraft}/edit?step=5`);
    await op.evaluate(() => {
      document.querySelector('main input[name="acceptTerms"]').click();
      const b = [...document.querySelectorAll("main button")].find((x) =>
        x.textContent.includes("Send for review"),
      );
      b.disabled = false;
      b.click();
    });
    await sleep(500);
    await op.evaluate(() =>
      [...document.querySelectorAll("dialog[open] button")]
        .find((b) => b.textContent.includes("Send anyway"))
        ?.click(),
    );
    return op
      .waitForFunction(
        () =>
          (document.querySelector("main")?.innerText ?? "").includes(
            "isn't available yet. CustomerHowFar",
          ),
        { timeout: 15000 },
      )
      .then(
        () => true,
        () => false,
      );
  };
  check(
    "forged request: submitting an inactive-state draft is rejected",
    (await forceSubmit()) &&
      (await one("select status from businesses where id = $1", [ids.EkitiDraft])).status ===
        "DRAFT",
  );

  console.log("\nAdmin approval in an inactive state");
  const ap = await newPage();
  const A = helpers(ap);
  const adminCalls = recorder(ap);
  check("admin logs in", await login(ap, users.admin, "/admin"));
  await A.go(`/admin/listings/${ids.EkitiReview}`);
  await A.click("Approve");
  await A.click("Approve and publish", "dialog[open]");
  check(
    "approval blocked with a clear message",
    (await A.waitText("isn't a live state yet")) &&
      (await one("select status from businesses where id = $1", [ids.EkitiReview])).status ===
        "PENDING_REVIEW",
  );

  // -------------------------------------------------------------------------------------
  console.log("\nWaitlist");
  const wp = await newPage({ ip: "203.0.113.150" });
  const W = helpers(wp);
  await W.go("/coming-soon");
  check(
    "/coming-soon lists live states and the form",
    (await W.text()).includes("Live now") &&
      Boolean(await wp.$('main form[aria-label="Join the waitlist"]')),
  );
  await W.axe("/coming-soon");
  t = await joinWaitlist(wp, {
    email: `chf-e2e-${run}-wl1@example.com`,
    stateId: ids.ekiti,
    consent: false,
  });
  check("consent is required", t.includes("check the highlighted") || t.includes("agree"));
  await W.go("/coming-soon");
  t = await joinWaitlist(wp, { email: `chf-e2e-${run}-wl1@example.com`, stateId: ids.ekiti });
  check("joined", t.includes("Thanks! We'll email you when CustomerHowFar launches in Ekiti"));
  await W.go("/coming-soon");
  await joinWaitlist(wp, {
    email: `CHF-E2E-${run}-WL1@example.com`,
    stateId: ids.ekiti,
    role: "BUSINESS",
  });
  check(
    "duplicates: one entry per email and state (case-insensitive)",
    (
      await one("select count(*)::int n from waitlist_entries where email = $1", [
        `chf-e2e-${run}-wl1@example.com`,
      ])
    ).n === 1,
  );
  await W.go("/coming-soon");
  t = await joinWaitlist(wp, {
    email: `chf-e2e-${run}-bot@example.com`,
    stateId: ids.ekiti,
    honeypot: true,
  });
  check(
    "honeypot: bot sees success, nothing stored",
    t.includes("Thanks!") &&
      !(await one("select 1 from waitlist_entries where email = $1", [
        `chf-e2e-${run}-bot@example.com`,
      ])),
  );
  await W.go("/coming-soon");
  await joinWaitlist(wp, {
    email: `chf-e2e-${run}-wl2@example.com`,
    stateId: ids.ekiti,
    role: "BUSINESS",
  });
  await q(
    "insert into rate_limit_hits (key, created_at) select $1, now() from generate_series(1, 5)",
    [`waitlist:${keyed("ip", "203.0.113.151")}`],
  );
  const rl = await newPage({ ip: "203.0.113.151" });
  await helpers(rl).go("/coming-soon");
  t = await joinWaitlist(rl, { email: `chf-e2e-${run}-wl3@example.com`, stateId: ids.ekiti });
  check(
    "rate limited per IP",
    t.includes("Too many attempts") &&
      !(await one("select 1 from waitlist_entries where email = $1", [
        `chf-e2e-${run}-wl3@example.com`,
      ])),
  );
  const cp = await newPage();
  const C = helpers(cp);
  check("customer logs in", await login(cp, users.customer, "/account"));
  await C.go("/coming-soon");
  const emailField = await cp.evaluate(() => {
    const e = document.querySelector(
      'main form[aria-label="Join the waitlist"] input[name="email"]',
    );
    return { value: e.value, placeholder: e.placeholder };
  });
  check(
    "logged-in email is NOT prefilled (placeholder only)",
    emailField.value === "" && emailField.placeholder === "you@example.com",
  );
  await joinWaitlist(cp, { email: users.customer.email, stateId: ids.ekiti });
  check(
    "logged-in sign-up linked to the account",
    Boolean(await one("select 1 from waitlist_entries where user_id = $1", [users.customer.id])),
  );
  // Unsubscribe (wl2).
  const token = (
    await one("select unsubscribe_token from waitlist_entries where email = $1", [
      `chf-e2e-${run}-wl2@example.com`,
    ])
  ).unsubscribe_token;
  await W.go(`/waitlist/unsubscribe?token=${encodeURIComponent(token)}`);
  check(
    "unsubscribe page asks for confirmation (link alone does nothing)",
    !(
      await one("select unsubscribed_at from waitlist_entries where email = $1", [
        `chf-e2e-${run}-wl2@example.com`,
      ])
    ).unsubscribed_at,
  );
  await W.axe("unsubscribe page");
  await W.click("Unsubscribe");
  check(
    "unsubscribed",
    (await W.waitText("You've been unsubscribed")) &&
      Boolean(
        (
          await one("select unsubscribed_at from waitlist_entries where email = $1", [
            `chf-e2e-${run}-wl2@example.com`,
          ])
        ).unsubscribed_at,
      ),
  );
  await W.go("/waitlist/unsubscribe?token=not-a-real-token-1234567890");
  await W.click("Unsubscribe");
  check("bad token: clear message", await W.waitText("isn't valid"));

  // -------------------------------------------------------------------------------------
  console.log("\nAdmin: service areas");
  await A.go("/admin/service-areas");
  t = await A.text();
  const order = await ap.evaluate(() =>
    [...document.querySelectorAll("main li h2")]
      .filter((h) => !h.closest("dialog"))
      .map((h) => h.textContent),
  );
  check(
    "lists all 37 states, sorted by waitlist demand",
    order.length === 37 && order[0] === "Ekiti",
    order.slice(0, 3).join(", "),
  );
  check(
    "shows status, businesses and waitlist count",
    t.includes("Live") &&
      t.includes("Coming soon") &&
      /Ekiti[\s\S]*?3 businesses[\s\S]*?2[\s\S]*?on the waitlist/.test(t),
  );
  check(
    "the last live state can't be switched off (button disabled)",
    await ap.evaluate(
      () =>
        [...document.querySelectorAll("main li")]
          .find((li) => li.querySelector("h2")?.textContent === "Lagos")
          ?.querySelector("button")?.disabled === true,
    ),
  );
  await A.axe("admin service areas");
  // Switch Ekiti on and email its waitlist.
  await ap.evaluate(() =>
    [...document.querySelectorAll("main li")]
      .find((li) => li.querySelector("h2")?.textContent === "Ekiti")
      .querySelector("button")
      .click(),
  );
  await ap.waitForSelector("dialog[open]");
  check(
    "switch-on dialog offers to email the waitlist",
    (await ap.evaluate(() => document.querySelector("dialog[open]").innerText)).includes(
      "Email the waitlist for this state (2 people)",
    ),
  );
  await A.click("Launch Ekiti", "dialog[open]");
  check(
    "Ekiti is live",
    (await A.waitText("Ekiti is now live")) &&
      (await one("select is_active, launched_at from states where id = $1", [ids.ekiti]))
        .is_active === true,
  );
  let mails = [];
  for (let i = 0; i < 30 && mails.length < 2; i++) {
    mails = outbox().filter((m) => m.tag === "waitlist-launch");
    await sleep(500);
  }
  check(
    "waitlist emailed (test outbox): subscribed people only, each with an unsubscribe link",
    mails.length === 2 &&
      mails.every(
        (m) => m.text.includes("/waitlist/unsubscribe?token=") && m.headers?.["List-Unsubscribe"],
      ) &&
      !mails.some((m) => m.to.email.includes("wl2")),
    String(mails.length),
  );
  check(
    "business role gets the 'list your business' email",
    mails.some((m) => m.to.email.includes("wl1") && m.text.includes("List your business")),
  );
  check(
    "recorded as notified",
    (
      await one(
        "select count(*)::int n from waitlist_entries where state_id = $1 and notified_at is not null",
        [ids.ekiti],
      )
    ).n === 2,
  );
  check(
    "audit: activated + notified, with who",
    Boolean(
      await one(
        "select 1 from admin_audit_log where action = 'STATE_ACTIVATED' and actor_id = $1 and summary = 'Ekiti'",
        [users.admin.id],
      ),
    ) &&
      Boolean(
        await one(
          "select 1 from admin_audit_log where action = 'WAITLIST_NOTIFIED' and actor_id = $1",
          [users.admin.id],
        ),
      ),
  );
  await P.go("/");
  check(
    "homepage note updates immediately: 'Now live in Ekiti and Lagos'",
    (await P.text()).includes("Now live in Ekiti and Lagos"),
  );
  const groups2 = await pub.evaluate(() =>
    [...document.querySelectorAll("#hero-search-state optgroup")].map(
      (g) => `${g.label}:${g.children.length}`,
    ),
  );
  check(
    "search filter lists Ekiti under Live now",
    groups2[0] === "Live now:2",
    groups2.join(", "),
  );
  await A.go(`/admin/listings/${ids.EkitiReview}`);
  await A.click("Approve");
  await A.click("Approve and publish", "dialog[open]");
  check(
    "approval now allowed in Ekiti",
    (await A.waitText("Approved.")) &&
      (await one("select status from businesses where id = $1", [ids.EkitiReview])).status ===
        "APPROVED",
  );
  await A.go("/admin/service-areas");
  check(
    "no duplicate emails: nothing left to send",
    !(await A.text()).includes("Email the waitlist ("),
  );
  // Switch Ekiti off again.
  await ap.evaluate(() =>
    [...document.querySelectorAll("main li")]
      .find((li) => li.querySelector("h2")?.textContent === "Ekiti")
      .querySelector("button")
      .click(),
  );
  await ap.waitForSelector("dialog[open]");
  const offText = await ap.evaluate(() => document.querySelector("dialog[open]").innerText);
  check(
    "switch-off dialog shows affected listings and drafts",
    /2\s+live listings stay visible/.test(offText) && /1\s+draft/.test(offText),
    offText.replace(/\s+/g, " ").slice(0, 160),
  );
  await A.axe("switch-off dialog");
  await A.click("Switch off Ekiti", "dialog[open]");
  check(
    "Ekiti switched off",
    (await A.waitText("Ekiti is switched off")) &&
      (await one("select is_active from states where id = $1", [ids.ekiti])).is_active === false,
  );
  check(
    "audit: deactivated",
    Boolean(
      await one(
        "select 1 from admin_audit_log where action = 'STATE_DEACTIVATED' and actor_id = $1",
        [users.admin.id],
      ),
    ),
  );
  await P.go(`/business/e2e-ar-${run}-ekitilive`);
  check(
    "existing live listing stays visible",
    (await P.text()).includes(`E2E Areas EkitiLive ${run}`),
  );
  await P.go("/");
  check(
    "homepage note back to 'Now live in Lagos'",
    (await P.text()).includes("Now live in Lagos · More states coming soon"),
  );
  check(
    "after switching off, drafts there can't be submitted",
    (await forceSubmit()) &&
      (await one("select status from businesses where id = $1", [ids.EkitiDraft])).status ===
        "DRAFT",
  );

  console.log("\nAt least one state stays live");
  const toggleCall = adminCalls.find(
    (c) => c.body?.includes(String(ids.ekiti)) && c.body.includes("false"),
  );
  const lastOff = await replay(
    ap,
    toggleCall,
    toggleCall.body.replace(String(ids.ekiti), String(ids.lagos)),
  );
  check(
    "server refuses to switch off the last live state",
    lastOff.includes("At least one state must stay live") &&
      (await one("select is_active from states where id = $1", [ids.lagos])).is_active === true,
  );
  const dbRule = await q("update states set is_active = false where is_active").then(
    () => "allowed",
    (e) => e.code,
  );
  check("database also refuses (trigger)", dbRule === "23514");

  console.log("\nAccount deletion removes waitlist entries");
  await C.go("/account");
  await C.click("Delete my account");
  await cp.waitForSelector("dialog[open]");
  await C.fill("dialog[open] input[autocomplete=off]", "DELETE");
  await C.fill("dialog[open] input[type=password]", users.customer.password);
  await C.click("Delete my account", "dialog[open]");
  await cp
    .waitForFunction(() => location.pathname === "/account-deleted", { timeout: 30000 })
    .catch(() => {});
  check(
    "waitlist entries deleted with the account",
    !(await one("select 1 from waitlist_entries where email = $1 or user_id = $2", [
      users.customer.email,
      users.customer.id,
    ])),
  );
  users.customer.deleted = true;

  console.log("\nEmails");
  const all = outbox();
  check(
    "all emails stayed in the test outbox",
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
  console.log("\nCleanup (and restore every state's original setting)");
  for (const s of originalStates.filter((s) => s.is_active))
    await q("update states set is_active = true, launched_at = $2 where id = $1", [
      s.id,
      s.launched_at,
    ]);
  for (const s of originalStates.filter((s) => !s.is_active))
    await q("update states set is_active = false, launched_at = $2 where id = $1", [
      s.id,
      s.launched_at,
    ]);
  const now = await q("select id, is_active, launched_at from states");
  const same = now.every((s) => {
    const o = originalStates.find((x) => x.id === s.id);
    return o && o.is_active === s.is_active && String(o.launched_at) === String(s.launched_at);
  });
  console.log("  states restored exactly:", same);
  const idList = Object.values(users)
    .map((u) => u.id)
    .filter(Boolean);
  await q("delete from waitlist_entries where email like $1 or user_id = any($2::uuid[])", [
    `chf-e2e-${run}-%`,
    idList,
  ]);
  await q(
    "delete from admin_audit_log where actor_id = any($1::uuid[]) or target_user_id = any($1::uuid[]) or created_at >= $2 and action in ('STATE_ACTIVATED','STATE_DEACTIVATED','WAITLIST_NOTIFIED')",
    [idList, testStart],
  );
  await q("delete from rate_limit_hits where created_at >= $1", [testStart]);
  await q("delete from identity_verifications where user_id = any($1::uuid[])", [idList]);
  await q("delete from payments where user_id = any($1::uuid[])", [idList]);
  await q("delete from businesses where owner_id = any($1::uuid[])", [idList]);
  await q("delete from profiles where id = any($1::uuid[])", [idList]);
  for (const u of Object.values(users))
    if (u.id && !u.deleted) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  await browser.close();
  await db.end();
  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
