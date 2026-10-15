import { loadEnv as guardEnv } from "../../scripts/env-guard.mjs";
guardEnv(); // refuses production
// axe + overflow check for a list of routes at 360px and 1280px. Usage: node a11y-pages.mjs <baseUrl> <route...>
import puppeteer from "puppeteer-core";
import { axeSource, browserPath } from "./lib/setup.mjs";

const [baseUrl, ...routes] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: browserPath(),
  headless: true,
});
let failures = 0;
for (const route of routes) {
  for (const [w, mobile] of [
    [360, true],
    [1280, false],
  ]) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: 800, isMobile: mobile, hasTouch: mobile });
    await page.goto(baseUrl + route, { waitUntil: "load" });
    await new Promise((r) => setTimeout(r, 800));
    await page.evaluate(axeSource);
    const result = await page.evaluate(async () => {
      const r = await window.axe.run(document, {
        runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"],
      });
      return {
        violations: r.violations.map(
          (v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`,
        ),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    const ok = result.violations.length === 0 && !result.overflow;
    if (!ok) failures++;
    console.log(
      `  ${ok ? "PASS" : "FAIL"} ${route} @${w}px${result.overflow ? " (horizontal overflow)" : ""}`,
    );
    result.violations.forEach((v) => console.log(`       ${v}`));
    await page.close();
  }
}
await browser.close();
console.log(`Result: ${failures ? `${failures} failure(s)` : "PASS"}`);
process.exitCode = failures ? 1 : 0;
