import "server-only";
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";

// One database-backed rate limiter for the whole app (works across serverless instances, no
// extra services). Each limited action has a name and a subject: a user id, or a keyed hash of
// an IP address or email. Raw IPs and emails are never stored. Old rows are pruned daily.

type Window = { windowSeconds: number; max: number };

const MIN = 60;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** All limits in one place. Generous enough for real people, tight enough for scripts. */
export const RATE_LIMITS = {
  /** Failed logins only (successful ones don't count). */
  "login-ip": [{ windowSeconds: 15 * MIN, max: 30 }],
  "login-email": [{ windowSeconds: 15 * MIN, max: 10 }],
  "signup-ip": [{ windowSeconds: HOUR, max: 10 }],
  "forgot-ip": [{ windowSeconds: HOUR, max: 10 }],
  "forgot-email": [{ windowSeconds: HOUR, max: 3 }],
  "resend-ip": [{ windowSeconds: HOUR, max: 10 }],
  "resend-email": [{ windowSeconds: HOUR, max: 3 }],
  contact: [
    { windowSeconds: HOUR, max: 3 },
    { windowSeconds: DAY, max: 10 },
  ],
  review: [
    { windowSeconds: HOUR, max: 5 },
    { windowSeconds: DAY, max: 20 },
  ],
  report: [{ windowSeconds: DAY, max: 20 }],
  "upload-sign": [{ windowSeconds: HOUR, max: 150 }],
  "identity-submit": [{ windowSeconds: HOUR, max: 10 }],
  "proof-submit": [{ windowSeconds: HOUR, max: 10 }],
  track: [{ windowSeconds: 10 * MIN, max: 300 }],
  search: [{ windowSeconds: MIN, max: 60 }],
} satisfies Record<string, Window[]>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

function keyFor(name: RateLimitName, subject: string) {
  return `${name}:${subject}`;
}

async function check(name: RateLimitName, subject: string): Promise<RateLimitResult> {
  const key = keyFor(name, subject);
  for (const w of RATE_LIMITS[name] as Window[]) {
    const since = new Date(Date.now() - w.windowSeconds * 1000);
    const used = await prisma.rateLimitHit.count({ where: { key, createdAt: { gte: since } } });
    if (used >= w.max) {
      const oldest = await prisma.rateLimitHit.findFirst({
        where: { key, createdAt: { gte: since } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });
      const freeAt = (oldest?.createdAt.getTime() ?? Date.now()) + w.windowSeconds * 1000;
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((freeAt - Date.now()) / 1000)) };
    }
  }
  return { ok: true };
}

/** Records one attempt unless the limit is already reached. */
export async function rateLimit(name: RateLimitName, subject: string): Promise<RateLimitResult> {
  const result = await check(name, subject);
  if (result.ok) await prisma.rateLimitHit.create({ data: { key: keyFor(name, subject) } });
  return result;
}

/** Checks without recording (e.g. before a login attempt; only failures are recorded). */
export function isRateLimited(name: RateLimitName, subject: string) {
  return check(name, subject);
}

/** Records an attempt without checking (e.g. a failed login). */
export async function recordRateLimitHit(name: RateLimitName, subject: string) {
  await prisma.rateLimitHit.create({ data: { key: keyFor(name, subject) } });
}

/** The friendly message shown when a limit is hit. */
export function tooManyMessage(result: { retryAfterSeconds: number }) {
  const minutes = Math.ceil(result.retryAfterSeconds / 60);
  const wait =
    minutes <= 1
      ? "a minute"
      : minutes < 60
        ? `${minutes} minutes`
        : `${Math.ceil(minutes / 60)} hours`;
  return `Too many attempts. Please wait ${wait} and try again.`;
}

function keyedHash(kind: string, value: string) {
  const secret = process.env.SUPABASE_SECRET_KEY ?? "local-dev-only";
  return createHmac("sha256", secret).update(`${kind}:${value}`).digest("hex").slice(0, 32);
}

/** A stable, non-reversible subject for the request's IP address. */
export function ipKey(headers: Headers) {
  const ip =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown";
  return keyedHash("ip", ip);
}

/** A stable, non-reversible subject for an email address. */
export function emailKey(email: string) {
  return keyedHash("email", email.trim().toLowerCase());
}

/** Daily job: rate-limit rows older than two days are no longer needed. */
export async function pruneRateLimits() {
  const { count } = await prisma.rateLimitHit.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 2 * DAY) } },
  });
  return count;
}
