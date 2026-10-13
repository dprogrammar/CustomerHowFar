import { timingSafeEqual } from "node:crypto";
import { runIdentityRetention } from "@/lib/identity/server";
import { processPendingFileDeletions } from "@/lib/storage/cleanup";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Daily Vercel Cron (see vercel.json): deletes ID and selfie images that are due under the
 * retention policy, and retries queued Cloudinary deletions. Vercel sends `Authorization: Bearer $CRON_SECRET`; anything else gets a 404.
 * Responds with counts only, never names or file IDs.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Not found", { status: 404, headers: NO_STORE });
  try {
    const result = await runIdentityRetention();
    // Also retry Cloudinary deletions that failed earlier (deleted businesses and accounts).
    const files = await processPendingFileDeletions();
    return Response.json({ ok: true, ...result, files }, { headers: NO_STORE });
  } catch (error) {
    console.error(
      "[cron/identity-retention] failed:",
      error instanceof Error ? error.name : "unknown",
    );
    return Response.json({ ok: false }, { status: 500, headers: NO_STORE });
  }
}
