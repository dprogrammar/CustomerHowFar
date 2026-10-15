// Shared setup for the end-to-end suites: project paths, the browser to drive, axe-core and the
// output folder (screenshots, the test email outbox, Lighthouse fixtures). Outputs go to
// tests/e2e/.output, which git ignores.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(path.join(ROOT, "package.json"));

export const OUTPUT_DIR = path.join(ROOT, "tests", "e2e", ".output");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
export const outputFile = (name) => path.join(OUTPUT_DIR, name);

const CANDIDATES = {
  win32: [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  ],
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
  ],
};

/** Chrome or Edge to drive (puppeteer-core downloads no browser). Override with CHROME_PATH. */
export function browserPath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const found = (CANDIDATES[process.platform] ?? []).find((p) => fs.existsSync(p));
  if (!found)
    throw new Error("No Chrome or Edge found: set CHROME_PATH to the browser executable.");
  return found;
}

/** axe-core, injected into pages for accessibility checks. */
export const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
