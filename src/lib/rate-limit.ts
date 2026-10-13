import "server-only";
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";

// Simple database-backed rate limiting (works across serverless instances). Keys never hold a
// raw IP address: IPs are hashed with a server secret first.

export type Limit = { windowSeconds: number; max: number };

/**
 * Records one attempt for `key` unless any limit is already reached. Returns false when the
 * caller must refuse the request.
 */
export async function takeRateLimit(key: string, limits: Limit[]) {
  for (const limit of limits) {
    const since = new Date(Date.now() - limit.windowSeconds * 1000);
    const used = await prisma.rateLimitHit.count({ where: { key, createdAt: { gte: since } } });
    if (used >= limit.max) return false;
  }
  await prisma.rateLimitHit.create({ data: { key } });
  return true;
}

/** A stable, non-reversible key for the request's IP address. */
export function ipKey(headers: Headers) {
  const ip =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown";
  const secret = process.env.SUPABASE_SECRET_KEY ?? "local-dev-only";
  return createHmac("sha256", secret).update(`ip:${ip}`).digest("hex").slice(0, 32);
}

/** Daily job: rate-limit rows older than two days are no longer needed. */
export async function pruneRateLimits() {
  const { count } = await prisma.rateLimitHit.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } },
  });
  return count;
}
