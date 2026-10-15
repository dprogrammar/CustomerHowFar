import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { RAW_RETENTION_DAYS, SEARCH_KEY_SEP, dayDate, lagosDay } from "./rules";

// Daily totals from raw events. The same SQL feeds the nightly roll-up (into analytics_daily and
// business_stats_daily) and live figures for days not rolled up yet (today), so both always agree.

/** Raw events of days in [from, to] that haven't been rolled up. */
const rawEvents = (from: string, to: string) => Prisma.sql`
  SELECT * FROM analytics_events e
  WHERE e.day BETWEEN ${from}::date AND ${to}::date
    AND NOT EXISTS (
      SELECT 1 FROM analytics_daily r WHERE r.day = e.day AND r.metric = 'rolled' AND r.key = '')`;

/**
 * Site totals as (day, metric, key, value) rows. A visitor's source for the day is where their
 * first visit that day came from; their searches, business views and contacts that day are
 * credited to it (this is how QR campaigns get their numbers).
 */
export const siteRowsSql = (from: string, to: string) => Prisma.sql`
  WITH ev AS (${rawEvents(from, to)}),
  entry AS (
    SELECT DISTINCT ON (day, visitor) day, visitor, source, campaign
    FROM ev WHERE kind = 'PAGE_VIEW' AND source IS NOT NULL
    ORDER BY day, visitor, created_at, id),
  vis AS (
    SELECT v.day, v.visitor, COALESCE(e.source, 'direct') AS source, e.campaign
    FROM (SELECT DISTINCT day, visitor FROM ev) v LEFT JOIN entry e USING (day, visitor)),
  dev AS (SELECT DISTINCT ON (day, visitor) day, visitor, device FROM ev ORDER BY day, visitor, created_at),
  qr AS (
    SELECT ev.*, vis.campaign AS qr_campaign FROM ev JOIN vis USING (day, visitor)
    WHERE vis.source = 'qr' AND vis.campaign IS NOT NULL),
  search AS (
    SELECT day, concat_ws(${SEARCH_KEY_SEP}, query, COALESCE(category, ''), COALESCE(state, '')) AS key,
      result_count
    FROM ev WHERE kind = 'SEARCH')
  SELECT day, 'visitors' AS metric, '' AS key, count(*)::int AS value FROM vis GROUP BY day
  UNION ALL SELECT day, 'pageviews', path_type, count(*)::int FROM ev WHERE kind = 'PAGE_VIEW' GROUP BY 1, 3
  UNION ALL SELECT day, 'device', device, count(*)::int FROM dev GROUP BY 1, 3
  UNION ALL SELECT day, 'source', source, count(*)::int FROM vis GROUP BY 1, 3
  UNION ALL SELECT day, 'contacts', contact_type::text, count(*)::int FROM ev WHERE kind = 'CONTACT' GROUP BY 1, 3
  UNION ALL SELECT day, 'searches', '', count(*)::int FROM search GROUP BY 1
  UNION ALL SELECT day, 'zero_searches', '', count(*)::int FROM search WHERE result_count = 0 GROUP BY 1
  UNION ALL SELECT day, 'search', key, count(*)::int FROM search GROUP BY 1, 3
  UNION ALL SELECT day, 'zero_search', key, count(*)::int FROM search WHERE result_count = 0 GROUP BY 1, 3
  UNION ALL SELECT day, 'qr_visitors', campaign, count(*)::int FROM vis
    WHERE source = 'qr' AND campaign IS NOT NULL GROUP BY 1, 3
  UNION ALL SELECT day, 'qr_searches', qr_campaign, count(*)::int FROM qr WHERE kind = 'SEARCH' GROUP BY 1, 3
  UNION ALL SELECT day, 'qr_business_views', qr_campaign, count(*)::int FROM qr
    WHERE kind = 'PAGE_VIEW' AND path_type = 'business' GROUP BY 1, 3
  UNION ALL SELECT day, 'qr_contacts', qr_campaign, count(*)::int FROM qr WHERE kind = 'CONTACT' GROUP BY 1, 3`;

/** Per-business daily views (repeat views within 6 hours excluded) and contact taps. */
export const businessRowsSql = (from: string, to: string) => Prisma.sql`
  SELECT day, business_id,
    count(*) FILTER (WHERE kind = 'PAGE_VIEW' AND NOT repeat)::int AS views,
    count(*) FILTER (WHERE kind = 'CONTACT' AND contact_type = 'WHATSAPP')::int AS whatsapp,
    count(*) FILTER (WHERE kind = 'CONTACT' AND contact_type = 'CALL')::int AS calls,
    count(*) FILTER (WHERE kind = 'CONTACT' AND contact_type = 'EMAIL')::int AS emails
  FROM (${rawEvents(from, to)}) ev
  WHERE business_id IS NOT NULL
  GROUP BY day, business_id`;

/**
 * Daily job: rolls up every finished day (before today in Nigeria) that still has raw events,
 * then deletes raw events older than 7 days and earlier days' visitor salts.
 */
export async function rollUpAnalytics(now = Date.now()) {
  const today = lagosDay(now);
  const days = await prisma.$queryRaw<{ day: string }[]>`
    SELECT DISTINCT to_char(e.day, 'YYYY-MM-DD') AS day FROM analytics_events e
    WHERE e.day < ${today}::date
      AND NOT EXISTS (SELECT 1 FROM analytics_daily r WHERE r.day = e.day AND r.metric = 'rolled' AND r.key = '')
    ORDER BY 1`;
  for (const { day } of days) {
    await prisma.$transaction([
      prisma.$executeRaw`DELETE FROM analytics_daily WHERE day = ${day}::date AND metric <> 'weekly_sent'`,
      prisma.$executeRaw`DELETE FROM business_stats_daily WHERE day = ${day}::date`,
      prisma.$executeRaw`
        INSERT INTO analytics_daily (day, metric, key, value)
        SELECT day, metric, COALESCE(key, ''), value FROM (${siteRowsSql(day, day)}) t`,
      prisma.$executeRaw`
        INSERT INTO business_stats_daily (day, business_id, views, whatsapp, calls, emails)
        SELECT day, business_id, views, whatsapp, calls, emails FROM (${businessRowsSql(day, day)}) t`,
      prisma.$executeRaw`
        INSERT INTO analytics_daily (day, metric, key, value) VALUES (${day}::date, 'rolled', '', 1)`,
    ]);
  }
  const { count: rawDeleted } = await prisma.analyticsEvent.deleteMany({
    where: { createdAt: { lt: new Date(now - RAW_RETENTION_DAYS * 86_400_000) } },
  });
  const { count: saltsDeleted } = await prisma.analyticsSalt.deleteMany({
    where: { day: { lt: dayDate(today) } },
  });
  return { daysRolledUp: days.length, rawDeleted, saltsDeleted };
}
