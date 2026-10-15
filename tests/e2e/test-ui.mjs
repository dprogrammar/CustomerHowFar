import { loadEnv as guardEnv } from "../../scripts/env-guard.mjs";
guardEnv(); // refuses production
// Headless Edge UI checks: overflow at 360px, axe accessibility, keyboard, menu, SEO, page weight.
// Usage: node test-ui.mjs <baseUrl> <screenshotDir>
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { axeSource, browserPath } from "./lib/setup.mjs";

const [baseUrl, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: browserPath(),
  headless: true,
  args: ["--no-first-run", "--disable-extensions"],
});

let failures = 0;
const check = (name, pass, detail = "") => {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
};

async function openPage(url, width, height, mobile) {
  const page = await browser.newPage();
  await page.setViewport({
    width,
    height,
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: 1,
  });
  let bytes = 0;
  const client = await page.createCDPSession();
  await client.send("Network.enable");
  client.on("Network.loadingFinished", (e) => (bytes += e.encodedDataLength));
  const res = await page.goto(url, { waitUntil: "load" });
  const late = [];
  const onReq = (r) => late.push(r.url().replace(baseUrl, ""));
  page.on("request", onReq);
  await new Promise((r) => setTimeout(r, 4000));
  page.off("request", onReq);
  const counts = {};
  for (const u of late) counts[u.split("?")[0]] = (counts[u.split("?")[0]] ?? 0) + 1;
  console.log(
    `       requests in 4s after load: ${late.length}${
      late.length
        ? " " +
          JSON.stringify(
            Object.entries(counts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6),
          )
        : ""
    }`,
  );
  return { page, status: res.status(), bytes: () => bytes };
}

async function overflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return (
          r.width > 0 &&
          (r.right > vw + 1 || r.left < -1) &&
          style.position !== "fixed" &&
          !el.closest("dialog:not([open])")
        );
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
    return { scrollWidth: document.documentElement.scrollWidth, vw, offenders };
  });
}

async function axe(page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"],
    });
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      count: v.nodes.length,
      target: v.nodes[0]?.target.join(" "),
      summary: v.nodes[0]?.failureSummary?.split("\n")[1],
    }));
  });
}

for (const [label, route, expectStatus] of [
  ["Homepage", "/", 200],
  ["404 page", "/this-page-does-not-exist", 404],
]) {
  for (const [vpName, w, h, mobile] of [
    ["phone 360px", 360, 780, true],
    ["desktop 1280px", 1280, 900, false],
  ]) {
    console.log(`\n${label} @ ${vpName}`);
    const { page, status, bytes } = await openPage(baseUrl + route, w, h, mobile);
    check(
      `HTTP ${expectStatus}`,
      status === expectStatus || (expectStatus === 200 && status === 304),
      `got ${status}`,
    );
    const o = await overflow(page);
    check(
      "no horizontal scroll",
      o.scrollWidth <= o.vw,
      `scrollWidth ${o.scrollWidth} vs ${o.vw}${o.offenders.length ? `; ${o.offenders.join(" | ")}` : ""}`,
    );
    const violations = await axe(page);
    check("axe: no accessibility violations", violations.length === 0);
    for (const v of violations)
      console.log(`       [${v.impact}] ${v.id} x${v.count}: ${v.target} :: ${v.summary ?? ""}`);

    const vis = await page.evaluate(() => {
      const shown = (sel) => {
        const el = document.querySelector(sel);
        return (
          !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0
        );
      };
      return {
        bottomNav: shown('nav[aria-label="Bottom navigation"]'),
        desktopSearch: shown("#header-search"),
        mobileSearch: shown("#mobile-header-search"),
        hamburger: shown('button[aria-haspopup="dialog"]'),
        mainNav: shown('nav[aria-label="Main"]'),
      };
    });
    if (mobile) {
      check(
        "mobile: bottom nav, header search and hamburger visible",
        vis.bottomNav && vis.mobileSearch && vis.hamburger,
      );
      check("mobile: desktop search and nav hidden", !vis.desktopSearch && !vis.mainNav);
    } else {
      check("desktop: search bar and main nav visible", vis.desktopSearch && vis.mainNav);
      check("desktop: bottom nav and hamburger hidden", !vis.bottomNav && !vis.hamburger);
    }
    if (route === "/")
      console.log(
        `       transferred: ${(bytes() / 1024).toFixed(0)} KB (compressed, incl. fonts)`,
      );

    const shot = path.join(outDir, `${label.replace(/\W+/g, "-").toLowerCase()}-${w}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    await page.close();
  }
}

console.log("\nKeyboard and menu (phone 360px)");
{
  const { page } = await openPage(baseUrl + "/", 360, 780, true);
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => ({
    text: document.activeElement?.textContent?.trim(),
    visible: document.activeElement?.getBoundingClientRect().width > 50,
  }));
  check(
    "first Tab focuses visible skip link",
    first.text === "Skip to main content" && first.visible,
    first.text,
  );

  await page.click('button[aria-haspopup="dialog"]');
  const opened = await page.evaluate(() => ({
    open: document.querySelector("dialog")?.open,
    focusInside: document.querySelector("dialog")?.contains(document.activeElement),
  }));
  check("hamburger opens menu with focus inside", opened.open && opened.focusInside);
  await page.screenshot({ path: path.join(outDir, "mobile-menu-360.png") });
  await page.keyboard.press("Escape");
  const closed = await page.evaluate(() => ({
    open: document.querySelector("dialog")?.open,
    focusBack: document.activeElement?.getAttribute("aria-haspopup") === "dialog",
  }));
  check("Escape closes menu and returns focus", !closed.open && closed.focusBack);

  await page.type("#hero-search-q", "tailor");
  await page.select("#hero-search-state", "lagos");
  // Bring the button to the middle of the screen first: at the bottom edge the fixed bottom
  // navigation sits on top of it and would take the click.
  await page.$eval('form[aria-label="Find a service"] button[type="submit"]', (b) =>
    b.scrollIntoView({ block: "center" }),
  );
  await Promise.all([
    page.waitForNavigation(),
    page.click('form[aria-label="Find a service"] button[type="submit"]'),
  ]);
  const u = new URL(page.url());
  check(
    "hero search submits to /search?q=tailor&state=lagos",
    u.pathname === "/search" &&
      u.searchParams.get("q") === "tailor" &&
      u.searchParams.get("state") === "lagos",
    u.pathname + u.search,
  );
  await page.close();
}

console.log("\nSEO");
{
  const { page } = await openPage(baseUrl + "/", 1280, 900, false);
  const meta = await page.evaluate(() => {
    const m = (sel) =>
      document.querySelector(sel)?.getAttribute("content") ??
      document.querySelector(sel)?.getAttribute("href");
    return {
      title: document.title,
      description: m('meta[name="description"]'),
      canonical: m('link[rel="canonical"]'),
      ogTitle: m('meta[property="og:title"]'),
      ogImage: m('meta[property="og:image"]'),
      twitter: m('meta[name="twitter:card"]'),
      icon: m('link[rel="icon"]'),
      apple: m('link[rel="apple-touch-icon"]'),
      manifest: m('link[rel="manifest"]'),
      jsonLd: !!document.querySelector('script[type="application/ld+json"]'),
      h1: document.querySelectorAll("h1").length,
      lang: document.documentElement.lang,
    };
  });
  check("title", !!meta.title, meta.title);
  check("meta description", (meta.description ?? "").length > 50);
  check("canonical", !!meta.canonical, meta.canonical);
  check("Open Graph title + image", !!meta.ogTitle && !!meta.ogImage, meta.ogImage);
  check("Twitter card", meta.twitter === "summary_large_image");
  check(
    "favicon, apple icon, manifest",
    !!meta.icon && !!meta.apple && !!meta.manifest,
    `${meta.icon} | ${meta.apple} | ${meta.manifest}`,
  );
  check("JSON-LD structured data", meta.jsonLd);
  check("exactly one h1", meta.h1 === 1);
  check("html lang", meta.lang === "en-NG", meta.lang);
  for (const p of [
    meta.ogImage,
    meta.apple,
    meta.icon,
    "/robots.txt",
    "/sitemap.xml",
    "/manifest.webmanifest",
  ]) {
    const rel = new URL(p, baseUrl);
    const r = await fetch(new URL(rel.pathname + rel.search, baseUrl));
    const size = (await r.arrayBuffer()).byteLength;
    check(
      `GET ${rel.pathname}`,
      r.ok,
      `${r.status} ${r.headers.get("content-type")} ${(size / 1024).toFixed(1)} KB`,
    );
  }
  await page.close();
}

await browser.close();
console.log(`\nResult: ${failures === 0 ? "PASS" : `${failures} failure(s)`}`);
process.exitCode = failures ? 1 : 0;
