import { loadEnv as guardEnv } from "../../scripts/env-guard.mjs";
guardEnv(); // refuses production
// App installation is disabled: no install prompt or install option, the site works normally,
// and visitors who still have the old caching service worker get it removed with its caches.
// Usage: node test-no-install.mjs <projectDir> <baseUrl>
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { browserPath } from "./lib/setup.mjs";

const [projectDir, baseUrl] = process.argv.slice(2);
const OLD_SW = fs.readFileSync(path.join(projectDir, "pwa", "sw-caching.js"), "utf8");
const OLD_OFFLINE = fs.readFileSync(path.join(projectDir, "pwa", "offline.html"), "utf8");
const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, pass, detail = "") => {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
};

const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true });
async function newPage() {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 360, height: 800, isMobile: true, hasTouch: true });
  return page;
}

try {
  console.log("Manifest and installability (Android Chrome emulation, 360px)");
  const man = await (await fetch(`${baseUrl}/manifest.webmanifest`)).json();
  check(
    "manifest is not installable (display: browser, no shortcuts)",
    man.display === "browser" && !man.shortcuts,
  );
  check(
    "name, theme colour and icons kept for tabs and bookmarks",
    man.name === "CustomerHowFar" &&
      man.theme_color === "#008751" &&
      man.icons.some((i) => i.sizes === "192x192") &&
      man.icons.some((i) => i.sizes === "512x512"),
  );
  for (const p of ["/icon.svg", "/apple-icon", "/icons/icon-192.png", "/icons/icon-512.png"])
    check(`${p} still served`, (await fetch(baseUrl + p)).status === 200);

  const page = await newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 120));
  });
  let promptListeners = 0;
  await page.evaluateOnNewDocument(() => {
    const orig = window.addEventListener;
    window.addEventListener = function (type, ...rest) {
      if (type === "beforeinstallprompt") window.__bip = (window.__bip ?? 0) + 1;
      return orig.call(this, type, ...rest);
    };
  });
  await page.goto(`${baseUrl}/`, { waitUntil: "load" });
  await sleep(1500);
  const cdp = await page.createCDPSession();
  const inst = await cdp.send("Page.getInstallabilityErrors");
  const ids = inst.installabilityErrors.map((e) => e.errorId);
  check("Chrome reports the site as NOT installable", ids.length > 0, ids.join(", "));
  check(
    "…because of the display mode",
    ids.some((i) => /display/i.test(i)),
    ids.join(", "),
  );
  const head = await page.evaluate(() => ({
    manifest: Boolean(document.querySelector('link[rel="manifest"]')),
    appleCapable: Boolean(
      document.querySelector(
        'meta[name="apple-mobile-web-app-capable"], meta[name="mobile-web-app-capable"]',
      ),
    ),
    theme: document.querySelector('meta[name="theme-color"]')?.content,
    appleIcon: Boolean(document.querySelector('link[rel="apple-touch-icon"]')),
  }));
  check(
    "no iOS 'web app' mode; theme colour and Apple touch icon kept",
    !head.appleCapable && head.theme === "#008751" && head.appleIcon,
  );
  promptListeners = await page.evaluate(() => window.__bip ?? 0);
  check(
    "the app no longer listens for the install prompt",
    promptListeners === 0,
    String(promptListeners),
  );
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = async () => {};
    e.userChoice = Promise.resolve({ outcome: "dismissed" });
    window.dispatchEvent(e);
  });
  await sleep(16_000);
  check(
    "no 'Install' banner appears",
    !(await page.evaluate(() =>
      /Install the HowFar app|Install app/i.test(document.body.innerText),
    )),
  );
  const regs = await page.evaluate(
    async () => (await navigator.serviceWorker.getRegistrations()).length,
  );
  check("new visitors get no service worker", regs === 0, String(regs));

  console.log("\nSite still works normally");
  for (const p of ["/", "/search?q=carpenter", "/categories", "/help", "/login", "/terms"]) {
    const res = await page.goto(baseUrl + p, { waitUntil: "load" });
    await sleep(500);
    const r = await page.evaluate(() => ({
      h1: Boolean(document.querySelector("h1")),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    check(`${p} loads at 360px`, res.status() === 200 && r.h1 && !r.overflow);
  }
  check(
    "help no longer mentions installing or Add to Home Screen",
    !/add to home screen|install (the )?(howfar )?app|install customerhowfar/i.test(
      await page.evaluate(() => document.body.innerText),
    ),
  );
  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  console.log("\nExisting visitors with the old caching service worker");
  // A proxy on another port stands in for "the site": first it serves the OLD worker and offline
  // page (as earlier versions did), then it forwards everything to the current build.
  let serveOld = true;
  const target = new URL(baseUrl);
  const proxy = http.createServer((req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    if (serveOld && p === "/sw.js") {
      res.writeHead(200, { "content-type": "application/javascript", "cache-control": "no-cache" });
      return res.end(OLD_SW);
    }
    if (serveOld && p === "/offline.html") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(OLD_OFFLINE);
    }
    const up = http.request(
      {
        host: target.hostname,
        port: target.port,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: target.host },
      },
      (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      },
    );
    up.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(up);
  });
  await new Promise((r) => proxy.listen(3055, r));
  const site = "http://localhost:3055";
  for (const scenario of ["page load clean-up", "browser update check"]) {
    serveOld = true;
    const old = await newPage();
    await old.goto(`${site}/help`, { waitUntil: "load" });
    const primed = await old.evaluate(async () => {
      // The page itself now unregisters workers on load, so register the old one afterwards.
      await new Promise((r) => setTimeout(r, 1500));
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await new Promise((r) => {
        const w = reg.installing ?? reg.waiting ?? reg.active;
        if (w?.state === "activated") return r();
        w?.addEventListener("statechange", () => w.state === "activated" && r());
        setTimeout(r, 10000);
      });
      return {
        active: Boolean(reg.active),
        caches: (await caches.keys()).filter((k) => k.startsWith("chf-")),
      };
    });
    check(
      `[${scenario}] old worker installed with its cache (simulated old visitor)`,
      primed.active && primed.caches.length > 0,
      JSON.stringify(primed.caches),
    );
    serveOld = false; // the site is now the current version
    if (scenario === "browser update check") {
      // The browser re-checks /sw.js and installs the clean-up worker (no page code involved).
      await old.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration("/");
        await reg?.update().catch(() => {});
      });
      await sleep(4000);
      const after = await old.evaluate(async () => ({
        regs: (await navigator.serviceWorker.getRegistrations()).length,
        caches: (await caches.keys()).filter((k) => k.startsWith("chf-")),
      }));
      check(
        `[${scenario}] clean-up worker removes the old caches and unregisters`,
        after.regs === 0 && after.caches.length === 0,
        JSON.stringify(after),
      );
    } else {
      await old.goto(`${site}/search?q=carpenter`, { waitUntil: "load" });
      await sleep(6000); // the page sweeps old caches again after ~4s
      const after = await old.evaluate(async () => ({
        regs: (await navigator.serviceWorker.getRegistrations()).length,
        caches: (await caches.keys()).filter((k) => k.startsWith("chf-")),
        h1: Boolean(document.querySelector("h1")),
      }));
      check(
        `[${scenario}] next visit removes the worker and its caches; page works`,
        after.regs === 0 && after.caches.length === 0 && after.h1,
        JSON.stringify(after),
      );
      await old.reload({ waitUntil: "load" });
      const controlled = await old.evaluate(() => Boolean(navigator.serviceWorker.controller));
      check(`[${scenario}] page is no longer controlled by any worker`, !controlled);
    }
    await old.browserContext().close();
  }
  proxy.close();
  check(
    "old offline page no longer served by the site",
    (await fetch(`${baseUrl}/offline.html`)).status === 404,
  );
} catch (error) {
  failures++;
  console.log("  ERROR", error instanceof Error ? error.message : error);
} finally {
  await browser.close();
  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures ? 1 : 0);
}
