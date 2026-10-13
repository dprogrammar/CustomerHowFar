import { timingSafeEqual } from "node:crypto";
import { runDailyJob } from "@/lib/jobs/daily";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Older path of the daily job, kept so existing schedules keep working. Runs the full daily
 * job (see /api/cron/daily) and reports the identity-retention counts at the top level.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Not found", { status: 404, headers: NO_STORE });
  try {
    const { identity, ...rest } = await runDailyJob();
    return Response.json({ ok: true, ...identity, ...rest }, { headers: NO_STORE });
  } catch (error) {
    console.error(
      "[cron/identity-retention] failed:",
      error instanceof Error ? error.name : "unknown",
    );
    return Response.json({ ok: false }, { status: 500, headers: NO_STORE });
  }
}
