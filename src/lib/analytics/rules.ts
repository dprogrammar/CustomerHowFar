import { createHmac } from "node:crypto";

// Analytics rules (pure, so they are easy to test). Only short labels are ever stored: never
// URLs, referrers, IP addresses, user agents or account ids.

export const PATH_TYPES = [
  "home",
  "search",
  "category",
  "business",
  "help",
  "start",
  "other",
] as const;
export type PathType = (typeof PATH_TYPES)[number];

export const DEVICES = ["phone", "tablet", "desktop"] as const;
export type Device = (typeof DEVICES)[number];

export const SOURCES = [
  "direct",
  "google",
  "whatsapp",
  "facebook",
  "instagram",
  "qr",
  "other",
] as const;
export type Source = (typeof SOURCES)[number];

/** Raw events are deleted after this many days (once rolled up into daily totals). */
export const RAW_RETENTION_DAYS = 7;

/** Nigeria is UTC+1 all year (no daylight saving). */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The calendar day in Nigeria, as "YYYY-MM-DD". */
export function lagosDay(at: Date | number = Date.now()) {
  return new Date(new Date(at).getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" plus n days (n may be negative). */
export function addDays(day: string, n: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Every day from `from` to `to`, inclusive. */
export function daysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** A "YYYY-MM-DD" day as the Date Prisma expects for a DATE column. */
export const dayDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** Pages are counted by type only. Admin and API paths are never counted. */
export function classifyPath(pathname: string): PathType | null {
  const p = pathname.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
  if (p === "/admin" || p.startsWith("/admin/") || p.startsWith("/api/")) return null;
  if (p === "/") return "home";
  if (p === "/search") return "search";
  if (p === "/categories" || p.startsWith("/category/")) return "category";
  if (/^\/business\/[^/]+$/.test(p) && p !== "/business/new") return "business";
  if (p === "/help" || p.startsWith("/help/")) return "help";
  if (p === "/start") return "start";
  return "other";
}

export function classifyDevice(userAgent: string): Device {
  if (/iPad|Tablet|PlayBook|Silk|Kindle|Android(?!.*Mobile)/i.test(userAgent)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|Opera Mini|IEMobile|BlackBerry|KaiOS/i.test(userAgent))
    return "phone";
  return "desktop";
}

const hostIs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/**
 * Where a visit came from, using only the referring site's host name (never the full address)
 * and the in-app browser name for Facebook and Instagram, which often send no referrer.
 */
export function classifySource(input: {
  referrerHost: string | null | undefined;
  siteHost: string;
  userAgent: string;
  qrCampaign: string | null;
}): Source {
  if (input.qrCampaign) return "qr";
  const host = (input.referrerHost ?? "").toLowerCase().replace(/^www\./, "");
  const site = input.siteHost.toLowerCase().replace(/^www\./, "");
  if (/Instagram/.test(input.userAgent)) return "instagram";
  if (/FBAN|FBAV|FB_IAB/.test(input.userAgent)) return "facebook";
  if (!host || host === site) return "direct";
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return "google";
  if (hostIs(host, "whatsapp.com") || hostIs(host, "wa.me")) return "whatsapp";
  if (hostIs(host, "facebook.com") || hostIs(host, "fb.com") || hostIs(host, "fb.me"))
    return "facebook";
  if (hostIs(host, "instagram.com")) return "instagram";
  return "other";
}

const LINK = /\b(?:https?:\/\/|www\.)\S+/gi;
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/giu;
/** Phone and other long numbers: 6+ digits, allowing spaces, dashes, dots and brackets. */
const LONG_NUMBER = /\+?\d[\d\s().-]{4,}\d/g;
export const MAX_SEARCH_LENGTH = 100;

/** Search text as stored: emails, phone numbers and links removed, lowercase, at most 100 characters. */
export function cleanSearchText(text: string) {
  const s = text
    .normalize("NFKC")
    .replace(LINK, " ")
    .replace(EMAIL, " ")
    .replace(LONG_NUMBER, (m) => (m.replace(/\D/g, "").length >= 6 ? " " : m))
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  // Nothing worth keeping (e.g. the search was only a phone number).
  if (!/[\p{L}\p{N}]/u.test(s)) return "";
  return s.slice(0, MAX_SEARCH_LENGTH).trim();
}

/**
 * Today's visitor code: a keyed hash of IP + browser with a random salt that changes every day
 * (old salts are deleted). The same person gets a new, unlinkable code each day; the IP address
 * and user agent are never stored.
 */
export function visitorCode(salt: string, ip: string, userAgent: string) {
  return createHmac("sha256", salt).update(`${ip}\n${userAgent}`).digest("hex").slice(0, 32);
}

export const RANGES = [
  { key: "today", label: "Today", days: 1 },
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
] as const;
export type RangeKey = (typeof RANGES)[number]["key"];

export function parseRange(value: unknown): (typeof RANGES)[number] {
  return RANGES.find((r) => r.key === value) ?? RANGES[2];
}

/** The days in a range ending today, and the same number of days just before it. */
export function rangeDays(days: number, today: string) {
  const from = addDays(today, -(days - 1));
  return { from, to: today, prevFrom: addDays(from, -days), prevTo: addDays(from, -1) };
}

/** Change vs the previous period, e.g. +25 (percent); null when there is nothing to compare. */
export function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Search keys group the text with its filters: "text\u001fcategory\u001fstate". */
export const SEARCH_KEY_SEP = "\u001f";
export function splitSearchKey(key: string) {
  const [q = "", category = "", state = ""] = key.split(SEARCH_KEY_SEP);
  return { q, category, state };
}
