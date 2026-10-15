// Pure analytics rules: page types, devices, sources, search cleaning, visitor codes, Nigerian
// days and date ranges. Usage (from the project dir): npx tsx <this file>
import { pathToFileURL } from "node:url";

const rules = await import(pathToFileURL(`${process.cwd()}/src/lib/analytics/rules.ts`).href);
const messages = await import(pathToFileURL(`${process.cwd()}/src/lib/analytics/messages.ts`).href);

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail++;
  if (!ok) console.log(`  FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

// Page types (never full URLs).
for (const [p, want] of [
  ["/", "home"],
  ["/?x=1", "home"],
  ["/search", "search"],
  ["/categories", "category"],
  ["/category/plumbers", "category"],
  ["/business/ada-tailors", "business"],
  ["/business/new", "other"],
  ["/business/abc/edit", "other"],
  ["/help", "help"],
  ["/start", "start"],
  ["/start/", "start"],
  ["/privacy", "other"],
  ["/dashboard", "other"],
  ["/admin", null],
  ["/admin/analytics", null],
  ["/api/track", null],
] as const)
  eq(`classifyPath ${p}`, rules.classifyPath(p), want);

const UA = {
  android:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  androidTab:
    "Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  desktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  opera:
    "Opera/9.80 (J2ME/MIDP; Opera Mini/9.80 (S60; SymbOS; Opera Mobi/23.348; U; en) Presto/2.5.25 Version/10.54",
  fb: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.0;]",
  ig: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0",
};
eq("device android phone", rules.classifyDevice(UA.android), "phone");
eq("device iphone", rules.classifyDevice(UA.iphone), "phone");
eq("device opera mini", rules.classifyDevice(UA.opera), "phone");
eq("device ipad", rules.classifyDevice(UA.ipad), "tablet");
eq("device android tablet", rules.classifyDevice(UA.androidTab), "tablet");
eq("device windows", rules.classifyDevice(UA.desktop), "desktop");
eq("device mac", rules.classifyDevice(UA.mac), "desktop");

const src = (ref: string | null, ua = UA.android, qr: string | null = null) =>
  rules.classifySource({
    referrerHost: ref,
    siteHost: "www.customerhowfar.com.ng",
    userAgent: ua,
    qrCampaign: qr,
  });
eq("source none = direct", src(null), "direct");
eq("source own site = direct", src("customerhowfar.com.ng"), "direct");
eq("source google.com", src("www.google.com"), "google");
eq("source google.com.ng", src("www.google.com.ng"), "google");
eq("source whatsapp web", src("web.whatsapp.com"), "whatsapp");
eq("source wa.me", src("wa.me"), "whatsapp");
eq("source l.facebook.com", src("l.facebook.com"), "facebook");
eq("source m.facebook.com", src("m.facebook.com"), "facebook");
eq("source facebook in-app, no referrer", src(null, UA.fb), "facebook");
eq("source l.instagram.com", src("l.instagram.com"), "instagram");
eq("source instagram in-app", src(null, UA.ig), "instagram");
eq("source qr wins", src("www.google.com", UA.android, "flyer"), "qr");
eq("source other site", src("nairaland.com"), "other");
eq("source lookalike is other", src("notgoogle.example.com"), "other");

// Searches: phones and emails removed, trimmed to 100 characters, lowercase.
eq("search phone removed", rules.cleanSearchText("Plumber 0803 123 4567 Ikeja"), "plumber ikeja");
eq("search +234 removed", rules.cleanSearchText("tailor +2348031234567"), "tailor");
eq(
  "search email removed",
  rules.cleanSearchText("ada.obi@example.org makeup artist"),
  "makeup artist",
);
eq("search link removed", rules.cleanSearchText("see https://x.com/abc caterer"), "see caterer");
eq("search only phone -> empty", rules.cleanSearchText("08031234567"), "");
eq("search only email -> empty", rules.cleanSearchText("someone@example.com"), "");
eq("search short numbers kept", rules.cleanSearchText("3 bedroom painter"), "3 bedroom painter");
eq("search max 100", rules.cleanSearchText("a".repeat(300)).length, 100);
eq("search whitespace", rules.cleanSearchText("  Hair   Stylist \n "), "hair stylist");

// Visitor codes: same inputs + salt -> same code; new salt (next day) -> a different code.
const a1 = rules.visitorCode("salt-day-1", "10.0.0.1", UA.android);
eq("visitor stable within a day", rules.visitorCode("salt-day-1", "10.0.0.1", UA.android), a1);
eq(
  "visitor differs next day",
  rules.visitorCode("salt-day-2", "10.0.0.1", UA.android) === a1,
  false,
);
eq("visitor differs per IP", rules.visitorCode("salt-day-1", "10.0.0.2", UA.android) === a1, false);
eq(
  "visitor differs per browser",
  rules.visitorCode("salt-day-1", "10.0.0.1", UA.iphone) === a1,
  false,
);
eq("visitor format", /^[0-9a-f]{32}$/.test(a1), true);
eq("visitor contains no IP", a1.includes("10.0.0.1"), false);

// Nigerian days (UTC+1): 23:30 UTC is already the next day in Lagos.
eq("lagosDay 22:59 UTC", rules.lagosDay(Date.parse("2026-10-14T22:59:00Z")), "2026-10-14");
eq("lagosDay 23:00 UTC", rules.lagosDay(Date.parse("2026-10-14T23:00:00Z")), "2026-10-15");
eq("addDays across month", rules.addDays("2026-10-31", 1), "2026-11-01");
eq("addDays negative", rules.addDays("2026-03-01", -1), "2026-02-28");
eq("daysBetween", rules.daysBetween("2026-10-30", "2026-11-02"), [
  "2026-10-30",
  "2026-10-31",
  "2026-11-01",
  "2026-11-02",
]);

// Every date range and its comparison period.
for (const [key, days] of [
  ["today", 1],
  ["7", 7],
  ["30", 30],
  ["90", 90],
] as const) {
  const r = rules.parseRange(key);
  eq(`range ${key} days`, r.days, days);
  const d = rules.rangeDays(days, "2026-10-14");
  eq(`range ${key} length`, rules.daysBetween(d.from, d.to).length, days);
  eq(`range ${key} previous length`, rules.daysBetween(d.prevFrom, d.prevTo).length, days);
  eq(`range ${key} previous ends the day before`, rules.addDays(d.prevTo, 1), d.from);
}
eq("range today", rules.rangeDays(1, "2026-10-14"), {
  from: "2026-10-14",
  to: "2026-10-14",
  prevFrom: "2026-10-13",
  prevTo: "2026-10-13",
});
eq("unknown range -> 30 days", rules.parseRange("999").key, "30");
eq("percent up", rules.percentChange(150, 100), 50);
eq("percent down", rules.percentChange(50, 100), -50);
eq("percent from zero", rules.percentChange(5, 0), null);
eq("percent zero/zero", rules.percentChange(0, 0), 0);

// Owner messages.
eq(
  "message both",
  messages.ownerStatsMessage(120, 15),
  "Your listing was viewed 120 times this week and 15 people contacted you. Well done!",
);
eq(
  "message singular",
  messages.ownerStatsMessage(1, 1),
  "Your listing was viewed 1 time this week and 1 person contacted you. Well done!",
);
eq(
  "message views only",
  messages.ownerStatsMessage(4, 0).startsWith("Your listing was viewed 4 times this week."),
  true,
);
eq("message none", messages.ownerStatsMessage(0, 0).startsWith("No views yet this week."), true);
eq(
  "message last week",
  messages.ownerStatsMessage(3, 2, "last week").includes("3 times last week"),
  true,
);

console.log(`${pass}/${pass + fail} analytics rules passed`);
process.exit(fail ? 1 : 0);
