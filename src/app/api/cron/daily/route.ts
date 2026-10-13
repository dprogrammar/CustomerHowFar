import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { runDailyJob } from "@/lib/jobs/daily";
import { cleanOrphanedUploads } from "@/lib/storage/orphans";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Daily Vercel Cron (see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`;
 * anything else gets a 404. Responds with counts only.
 *
 * Maintenance mode for the orphan cleanup alone: `?task=orphans&dryRun=1` reports what would
 * be deleted. `prefix` limits it to one sub-folder; `minAgeMinutes` (only with a prefix) lowers
 * the 24-hour safety age, for testing on known test files.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return new Response("Not found", { status: 404, headers: NO_STORE });
  const params = request.nextUrl.searchParams;
  try {
    if (params.get("task") === "orphans") {
      const prefix = params.get("prefix") ?? undefined;
      if (prefix && !/^customerhowfar\/(users|proofs|identity)\/[\w-]+\/$/.test(prefix)) {
        return Response.json(
          { ok: false, error: "bad prefix" },
          { status: 400, headers: NO_STORE },
        );
      }
      const minAge = params.has("minAgeMinutes") ? Number(params.get("minAgeMinutes")) : NaN;
      const orphans = await cleanOrphanedUploads({
        dryRun: params.get("dryRun") === "1",
        prefix,
        minAgeMinutes: prefix && Number.isFinite(minAge) ? minAge : undefined,
      });
      return Response.json({ ok: true, orphans }, { headers: NO_STORE });
    }
    const result = await runDailyJob();
    return Response.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    console.error("[cron/daily] failed:", error instanceof Error ? error.name : "unknown");
    return Response.json({ ok: false }, { status: 500, headers: NO_STORE });
  }
}
