import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { businessRowsSql } from "./rollup";
import { addDays, daysBetween, lagosDay } from "./rules";

// Per-business statistics for ADMIN pages only (listing detail, user detail, the "All
// businesses" table). Every page that calls these checks requireAdmin() first. Rolled-up days
// come from business_stats_daily, today's live from raw events (same SQL as the rest of the
// analytics), so the numbers always agree with /admin/analytics.

export type Totals = { views: number; whatsapp: number; calls: number; emails: number };
const ZERO: Totals = { views: 0, whatsapp: 0, calls: 0, emails: 0 };

/** Contacts (WhatsApp, call and email taps) per 100 business page views; null with no views. */
export const contactRate = (t: Totals) =>
  t.views > 0 ? ((t.whatsapp + t.calls + t.emails) / t.views) * 100 : null;

/** Daily rows for [from, to], optionally for some businesses only. */
const dailyRowsSql = (from: string, to: string, businessIds: string[] | null) => Prisma.sql`
  SELECT day, business_id, views, whatsapp, calls, emails FROM business_stats_daily
  WHERE day BETWEEN ${from}::date AND ${to}::date
    ${businessIds ? Prisma.sql`AND business_id = ANY(${businessIds}::uuid[])` : Prisma.empty}
  UNION ALL
  SELECT day, business_id, views, whatsapp, calls, emails FROM (${businessRowsSql(from, to)}) r
  ${businessIds ? Prisma.sql`WHERE business_id = ANY(${businessIds}::uuid[])` : Prisma.empty}`;

/** One business: totals for the last 7, 30 and 90 days and a 90-day daily series. */
export async function getAdminBusinessStats(businessId: string, today = lagosDay()) {
  const from = addDays(today, -89);
  const rows = await prisma.$queryRaw<
    { day: string; views: number; whatsapp: number; calls: number; emails: number }[]
  >`
    SELECT to_char(day, 'YYYY-MM-DD') AS day, sum(views)::int AS views, sum(whatsapp)::int AS whatsapp,
      sum(calls)::int AS calls, sum(emails)::int AS emails
    FROM (${dailyRowsSql(from, today, [businessId])}) s GROUP BY 1`;
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const daily = daysBetween(from, today).map((day) => {
    const r = byDay.get(day);
    return { day, views: r?.views ?? 0, contacts: r ? r.whatsapp + r.calls + r.emails : 0 };
  });
  const totalFor = (days: number) => {
    const start = addDays(today, -(days - 1));
    const t = { ...ZERO };
    for (const r of rows) {
      if (r.day < start) continue;
      t.views += r.views;
      t.whatsapp += r.whatsapp;
      t.calls += r.calls;
      t.emails += r.emails;
    }
    return t;
  };
  return { periods: { 7: totalFor(7), 30: totalFor(30), 90: totalFor(90) }, daily };
}

/** Every (non-deleted) business a user owns, with totals for the last `days` days. */
export async function getAdminUserStats(userId: string, days: number, today = lagosDay()) {
  const from = addDays(today, -(days - 1));
  const rows = await prisma.$queryRaw<
    ({ id: string; name: string; slug: string; status: string } & Totals)[]
  >`
    WITH s AS (${dailyRowsSql(from, today, null)})
    SELECT b.id::text, b.name, b.slug, b.status::text,
      COALESCE(sum(s.views), 0)::int AS views, COALESCE(sum(s.whatsapp), 0)::int AS whatsapp,
      COALESCE(sum(s.calls), 0)::int AS calls, COALESCE(sum(s.emails), 0)::int AS emails
    FROM businesses b
    LEFT JOIN s ON s.business_id = b.id
    WHERE b.owner_id = ${userId}::uuid AND b.status <> 'DELETED'
    GROUP BY b.id
    ORDER BY b.created_at DESC`;
  const total = rows.reduce(
    (t, r) => ({
      views: t.views + r.views,
      whatsapp: t.whatsapp + r.whatsapp,
      calls: t.calls + r.calls,
      emails: t.emails + r.emails,
    }),
    { ...ZERO },
  );
  return { businesses: rows, total };
}

export const ALL_BUSINESSES_SORTS = [
  "name",
  "owner",
  "category",
  "area",
  "views",
  "whatsapp",
  "calls",
  "rate",
] as const;
export type AllBusinessesSort = (typeof ALL_BUSINESSES_SORTS)[number];
export const ALL_BUSINESSES_PAGE_SIZE = 25;

const SORT_SQL: Record<AllBusinessesSort, Prisma.Sql> = {
  name: Prisma.sql`lower(b.name)`,
  owner: Prisma.sql`lower(p.full_name)`,
  category: Prisma.sql`lower(c.name)`,
  area: Prisma.sql`lower(COALESCE(l.name, '') || ' ' || COALESCE(st.name, ''))`,
  views: Prisma.sql`COALESCE(t.views, 0)`,
  whatsapp: Prisma.sql`COALESCE(t.whatsapp, 0)`,
  calls: Prisma.sql`COALESCE(t.calls, 0)`,
  rate: Prisma.sql`CASE WHEN COALESCE(t.views, 0) > 0 THEN (t.whatsapp + t.calls + t.emails)::float8 / t.views END`,
};

/**
 * Every business (not deleted), including those with no activity at all, with its stats for
 * the last `days` days: searchable (business, owner, category, area), sortable, paginated.
 */
export async function getAllBusinessesStats(input: {
  days: number;
  q: string;
  sort: AllBusinessesSort;
  dir: "asc" | "desc";
  page: number;
  today?: string;
}) {
  const today = input.today ?? lagosDay();
  const from = addDays(today, -(input.days - 1));
  const q = input.q.trim().slice(0, 80);
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const where = Prisma.sql`b.status <> 'DELETED' ${
    q
      ? Prisma.sql`AND (b.name ILIKE ${like} OR p.full_name ILIKE ${like} OR p.email ILIKE ${like}
          OR c.name ILIKE ${like} OR l.name ILIKE ${like} OR st.name ILIKE ${like})`
      : Prisma.empty
  }`;
  const joins = Prisma.sql`
    FROM businesses b
    JOIN profiles p ON p.id = b.owner_id
    JOIN categories c ON c.id = b.category_id
    LEFT JOIN states st ON st.id = b.state_id
    LEFT JOIN lgas l ON l.id = b.lga_id`;
  const order = Prisma.sql`${SORT_SQL[input.sort]} ${input.dir === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`} NULLS LAST, lower(b.name) ASC, b.id`;
  const offset = (input.page - 1) * ALL_BUSINESSES_PAGE_SIZE;
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<
      ({
        id: string;
        name: string;
        status: string;
        owner_id: string;
        owner: string;
        category: string;
        area: string | null;
      } & Totals)[]
    >`
      WITH t AS (
        SELECT business_id, sum(views)::int AS views, sum(whatsapp)::int AS whatsapp,
          sum(calls)::int AS calls, sum(emails)::int AS emails
        FROM (${dailyRowsSql(from, today, null)}) s GROUP BY 1)
      SELECT b.id::text, b.name, b.status::text, p.id::text AS owner_id, p.full_name AS owner,
        c.name AS category,
        CASE WHEN l.name IS NOT NULL THEN l.name || ', ' || st.name ELSE st.name END AS area,
        COALESCE(t.views, 0)::int AS views, COALESCE(t.whatsapp, 0)::int AS whatsapp,
        COALESCE(t.calls, 0)::int AS calls, COALESCE(t.emails, 0)::int AS emails
      ${joins}
      LEFT JOIN t ON t.business_id = b.id
      WHERE ${where}
      ORDER BY ${order}
      LIMIT ${ALL_BUSINESSES_PAGE_SIZE} OFFSET ${offset}`,
    prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n ${joins} WHERE ${where}`,
  ]);
  return { rows, total: count[0]?.n ?? 0 };
}
