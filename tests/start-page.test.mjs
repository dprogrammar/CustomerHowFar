// /start is printed on QR code flyers: it must keep working forever.
// Never remove or rename /start. If it must move, keep /start working with a permanent redirect.
//
// Run: npm run test:start                      (checks http://localhost:3000; start the app first)
//      BASE_URL=https://www.customerhowfar.com.ng npm run test:start   (checks the live site)
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

test("/start still exists in the code (or permanently redirects)", () => {
  const page = path.join(root, "src/app/start/page.tsx");
  const config = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");
  const redirected = /source:\s*["']\/start["'][\s\S]{0,300}?permanent:\s*true/.test(config);
  assert.ok(
    fs.existsSync(page) || redirected,
    "/start is printed on QR code flyers. Keep src/app/start/page.tsx, or add a permanent redirect for /start in next.config.ts.",
  );
});

/** Follows redirects by hand: every hop must be permanent (301/308) and the end must be a page. */
async function open(pathname) {
  let url = baseUrl + pathname;
  for (let hop = 0; hop < 5; hop++) {
    let res;
    try {
      res = await fetch(url, {
        redirect: "manual",
        headers: { "user-agent": "CustomerHowFar start-page test" },
      });
    } catch (error) {
      assert.fail(
        `Can't reach ${url} (${error.cause?.code ?? error.message}). Start the app or set BASE_URL.`,
      );
    }
    if (res.status >= 300 && res.status < 400) {
      assert.ok(
        res.status === 301 || res.status === 308,
        `${url} redirects with ${res.status}; QR codes need a permanent redirect (301 or 308).`,
      );
      url = new URL(res.headers.get("location"), url).href;
      continue;
    }
    return { res, url, html: await res.text() };
  }
  assert.fail(`Too many redirects from ${pathname}`);
}

for (const pathname of ["/start", "/start?src=qr&campaign=flyer"]) {
  test(`${pathname} returns a working page`, async () => {
    const { res, url, html } = await open(pathname);
    assert.equal(res.status, 200, `${url} returned ${res.status}`);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    assert.ok(html.includes("I need a service"), `${url} has no "I need a service" button`);
    assert.ok(html.includes("I own a business"), `${url} has no "I own a business" button`);
  });
}
