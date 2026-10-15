import { loadEnv as guardEnv } from "../../scripts/env-guard.mjs";
guardEnv(); // refuses production
// Runs Lighthouse (mobile, default throttling) on key pages and prints the four scores plus
// the top opportunities. Usage: node lh-run.mjs <baseUrl> <label>
import fs from "node:fs";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import { browserPath, outputFile } from "./lib/setup.mjs";

const [baseUrl, label = "run", only] = process.argv.slice(2);
const { slug } = JSON.parse(fs.readFileSync(outputFile("lh-fixture.json"), "utf8"));
const pages = [
  ["home", "/"],
  ["search", "/search?q=tailor"],
  ["category", "/category/fashion-tailoring"],
  ["business", `/business/${slug}`],
];
const chrome = await chromeLauncher.launch({
  chromePath: browserPath(),
  chromeFlags: ["--headless=new", "--no-first-run"],
});
const out = {};
for (const [name, p] of pages.filter(([n]) => !only || n === only)) {
  // Warm the page once (first hit compiles/caches on the server).
  await fetch(baseUrl + p).catch(() => {});
  const runs = [];
  for (let i = 0; i < Number(process.env.LH_RUNS ?? 3); i++) {
    const r = await lighthouse(baseUrl + p, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    });
    runs.push(r.lhr);
  }
  // Median run by performance score (single runs vary a lot on a busy machine).
  runs.sort(
    (a, b) => (a.categories.performance.score ?? 0) - (b.categories.performance.score ?? 0),
  );
  const lhr = runs[Math.floor(runs.length / 2)];
  console.log(
    `   ${name} performance runs: ${runs.map((x) => Math.round((x.categories.performance.score ?? 0) * 100)).join(", ")}`,
  );
  const s = (k) => Math.round((lhr.categories[k]?.score ?? 0) * 100);
  out[name] = {
    perf: s("performance"),
    a11y: s("accessibility"),
    bp: s("best-practices"),
    seo: s("seo"),
  };
  const failing = Object.values(lhr.audits)
    .filter(
      (a) =>
        a.score !== null &&
        a.score < 0.9 &&
        a.scoreDisplayMode !== "informative" &&
        a.scoreDisplayMode !== "notApplicable",
    )
    .map((a) => `${a.id}${a.displayValue ? ` (${a.displayValue})` : ""}`)
    .slice(0, 12);
  console.log(
    `${label} ${name}: P${out[name].perf} A${out[name].a11y} BP${out[name].bp} SEO${out[name].seo} | LCP ${lhr.audits["largest-contentful-paint"].displayValue} TBT ${lhr.audits["total-blocking-time"].displayValue} CLS ${lhr.audits["cumulative-layout-shift"].displayValue}`,
  );
  console.log(`   below 0.9: ${failing.join(", ")}`);
  fs.writeFileSync(new URL(`./lh-${label}-${name}.json`, import.meta.url), JSON.stringify(lhr));
}
await chrome.kill();
fs.writeFileSync(new URL(`./lh-${label}.json`, import.meta.url), JSON.stringify(out));
