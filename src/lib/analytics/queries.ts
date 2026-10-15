import "server-only";
import { prisma } from "@/lib/prisma";
import { businessRowsSql, siteRowsSql } from "./rollup";
import {
  PATH_TYPES,
  SOURCES,
  DEVICES,
  addDays,
  daysBetween,
  lagosDay,
  rangeDays,
  splitSearchKey,
} from "./rules";

// Reads for the admin analytics page, the admin overview, the QR page and owner stats. Rolled-up
// days come from the daily tables; days not rolled up yet (today) are computed from raw events.

type SiteRow = { day: string; metric: string; key: string; value: number };

function siteRows(from: string, to: string) {
  return prisma.$queryRaw<SiteRow[]>`
    SELECT to_char(day, 'YYYY-MM-DD') AS day, metric, key, value FROM analytics_daily
    WHERE day BETWEEN ${from}::date AND ${to}::date AND metric NOT IN ('rolled', 'weekly_sent')
    UNION ALL
    SELECT to_char(day, 'YYYY-MM-DD'), metric, COALESCE(key, ''), value FROM (${siteRowsSql(from, to)}) t`;
}

/** Start of a Nigerian day as a UTC instant. */
const dayStart = (day: string) => new Date(`${day}T00:00:00+01:00`);

function sumWhere(rows: SiteRow[], metric: string, from: string, to: string, key?: string) {
  let n = 0;
  for (const r of rows)
    if (r.metric === metric && r.day >= from && r.day <= to && (key === undefined || r.key === key))
      n += r.value;
  return n;
}

function byKey(rows: SiteRow[], metric: string, from: string, to: string) {
  const map = new Map<string, number>();
  for (const r of rows)
    if (r.metric === metric && r.day >= from && r.day <= to)
      map.set(r.key, (map.get(r.key) ?? 0) + r.value);
  return map;
}

const top = <T extends { value: number }>(items: T[], n: number) =>
  items
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, n);

type BusinessTotal = {
  id: string;
  name: string;
  slug: string;
  status: string;
  category: string;
  area: string | null;
  views: number;
  contacts: number;
};

/** Views and contacts per business over [from, to], with the business's category and area. */
function businessTotals(from: string, to: string) {
  return prisma.$queryRaw<BusinessTotal[]>`
    WITH s AS (
      SELECT business_id, views, whatsapp + calls + emails AS contacts FROM business_stats_daily
      WHERE day BETWEEN ${from}::date AND ${to}::date
      UNION ALL
      SELECT business_id, views, whatsapp + calls + emails FROM (${businessRowsSql(from, to)}) r),
    t AS (SELECT business_id, sum(views)::int AS views, sum(contacts)::int AS contacts FROM s GROUP BY 1)
    SELECT b.id::text, b.name, b.slug, b.status::text, c.name AS category,
      CASE WHEN l.name IS NOT NULL THEN l.name || ', ' || st.name ELSE st.name END AS area,
      t.views, t.contacts
    FROM t
    JOIN businesses b ON b.id = t.business_id
    JOIN categories c ON c.id = b.category_id
    LEFT JOIN states st ON st.id = b.state_id
    LEFT JOIN lgas l ON l.id = b.lga_id`;
}

/** Sign-ups and new listings (not deleted) created in [from, to]. */
async function growth(from: string, to: string) {
  const range = { gte: dayStart(from), lt: dayStart(addDays(to, 1)) };
  const [signups, listings] = await Promise.all([
    prisma.profile.count({ where: { createdAt: range } }),
    prisma.business.count({ where: { createdAt: range, status: { not: "DELETED" } } }),
  ]);
  return { signups, listings };
}

/** Today's visitors and contacts per hour (Nigerian time), from raw events. */
function hourlyToday(today: string) {
  return prisma.$queryRaw<{ hour: number; visitors: number; contacts: number }[]>`
    SELECT extract(hour FROM created_at + interval '1 hour')::int AS hour,
      count(DISTINCT visitor)::int AS visitors,
      count(*) FILTER (WHERE kind = 'CONTACT')::int AS contacts
    FROM analytics_events WHERE day = ${today}::date
    GROUP BY 1 ORDER BY 1`;
}

export type ChartPoint = { label: string; visitors: number; contacts: number };

export async function getSiteAnalytics(days: number) {
  const today = lagosDay();
  const r = rangeDays(days, today);
  const [rows, businesses, cur, prev, hourly] = await Promise.all([
    siteRows(r.prevFrom, r.to),
    businessTotals(r.from, r.to),
    growth(r.from, r.to),
    growth(r.prevFrom, r.prevTo),
    days === 1 ? hourlyToday(today) : Promise.resolve([]),
  ]);

  const period = (from: string, to: string) => {
    const contacts = sumWhere(rows, "contacts", from, to);
    const businessViews = sumWhere(rows, "pageviews", from, to, "business");
    return {
      visitors: sumWhere(rows, "visitors", from, to),
      pageViews: sumWhere(rows, "pageviews", from, to),
      contacts,
      businessViews,
      /** Contacts per 100 business page views. */
      contactRate: businessViews ? (contacts / businessViews) * 100 : 0,
      searches: sumWhere(rows, "searches", from, to),
    };
  };

  const chart: ChartPoint[] =
    days === 1
      ? // Hours so far today in Nigeria (UTC+1).
        Array.from({ length: new Date(Date.now() + 3_600_000).getUTCHours() + 1 }, (_, h) => {
          const row = hourly.find((x) => x.hour === h);
          return {
            label: `${String(h).padStart(2, "0")}:00`,
            visitors: row?.visitors ?? 0,
            contacts: row?.contacts ?? 0,
          };
        })
      : daysBetween(r.from, r.to).map((d) => ({
          label: d,
          visitors: sumWhere(rows, "visitors", d, d),
          contacts: sumWhere(rows, "contacts", d, d),
        }));

  const categories = new Map<string, { views: number; contacts: number }>();
  const areas = new Map<string, { views: number; contacts: number }>();
  for (const b of businesses) {
    for (const [map, key] of [
      [categories, b.category],
      [areas, b.area ?? "Not set"],
    ] as const) {
      const v = map.get(key) ?? { views: 0, contacts: 0 };
      v.views += b.views;
      v.contacts += b.contacts;
      map.set(key, v);
    }
  }
  const ranked = (map: Map<string, { views: number; contacts: number }>) =>
    top(
      [...map].map(([name, v]) => ({ name, ...v, value: v.views + v.contacts })),
      10,
    );

  const searches = (metric: string) =>
    top(
      [...byKey(rows, metric, r.from, r.to)].map(([key, value]) => ({
        ...splitSearchKey(key),
        value,
      })),
      15,
    );

  const qr = (metric: string) => byKey(rows, metric, r.from, r.to);
  const [qrVisitors, qrSearches, qrViews, qrContacts] = [
    qr("qr_visitors"),
    qr("qr_searches"),
    qr("qr_business_views"),
    qr("qr_contacts"),
  ];
  const campaigns = [
    ...new Set([
      ...qrVisitors.keys(),
      ...qrSearches.keys(),
      ...qrViews.keys(),
      ...qrContacts.keys(),
    ]),
  ]
    .map((name) => ({
      name,
      visitors: qrVisitors.get(name) ?? 0,
      searches: qrSearches.get(name) ?? 0,
      businessViews: qrViews.get(name) ?? 0,
      contacts: qrContacts.get(name) ?? 0,
    }))
    .sort((a, b) => b.visitors - a.visitors);

  const sources = byKey(rows, "source", r.from, r.to);
  const devices = byKey(rows, "device", r.from, r.to);
  const pages = byKey(rows, "pageviews", r.from, r.to);
  const contactTypes = byKey(rows, "contacts", r.from, r.to);

  return {
    range: r,
    current: { ...period(r.from, r.to), ...cur },
    previous: { ...period(r.prevFrom, r.prevTo), ...prev },
    chart,
    hourly: days === 1,
    topByViews: top(
      businesses.map((b) => ({ ...b, value: b.views })),
      10,
    ),
    topByContacts: top(
      businesses.map((b) => ({ ...b, value: b.contacts })),
      10,
    ),
    categories: ranked(categories),
    areas: ranked(areas),
    topSearches: searches("search"),
    zeroSearches: searches("zero_search"),
    zeroSearchCount: sumWhere(rows, "zero_searches", r.from, r.to),
    sources: SOURCES.map((key) => ({ key, value: sources.get(key) ?? 0 })),
    devices: DEVICES.map((key) => ({ key, value: devices.get(key) ?? 0 })),
    pages: PATH_TYPES.map((key) => ({ key, value: pages.get(key) ?? 0 })),
    contactTypes: {
      WHATSAPP: contactTypes.get("WHATSAPP") ?? 0,
      CALL: contactTypes.get("CALL") ?? 0,
      EMAIL: contactTypes.get("EMAIL") ?? 0,
    },
    campaigns,
  };
}

export type SiteAnalytics = Awaited<ReturnType<typeof getSiteAnalytics>>;

/** Last 7 days vs the 7 before, for the admin overview. */
export async function getAnalyticsSummary() {
  const r = rangeDays(7, lagosDay());
  const rows = await siteRows(r.prevFrom, r.to);
  const pick = (from: string, to: string) => ({
    visitors: sumWhere(rows, "visitors", from, to),
    pageViews: sumWhere(rows, "pageviews", from, to),
    contacts: sumWhere(rows, "contacts", from, to),
    searches: sumWhere(rows, "searches", from, to),
  });
  return { current: pick(r.from, r.to), previous: pick(r.prevFrom, r.prevTo) };
}

/** Each QR campaign's visitors, searches, business page views and contacts over the last n days. */
export async function getQrCampaignAnalytics(days = 30) {
  const r = rangeDays(days, lagosDay());
  const rows = await prisma.$queryRaw<SiteRow[]>`
    SELECT * FROM (
      SELECT to_char(day, 'YYYY-MM-DD') AS day, metric, key, value FROM analytics_daily
      WHERE day BETWEEN ${r.from}::date AND ${r.to}::date AND metric LIKE 'qr\\_%'
      UNION ALL
      SELECT to_char(day, 'YYYY-MM-DD'), metric, COALESCE(key, ''), value FROM (${siteRowsSql(r.from, r.to)}) t
    ) x WHERE metric LIKE 'qr\\_%'`;
  const stats = new Map<
    string,
    { visitors: number; searches: number; businessViews: number; contacts: number }
  >();
  const field = {
    qr_visitors: "visitors",
    qr_searches: "searches",
    qr_business_views: "businessViews",
    qr_contacts: "contacts",
  } as const;
  for (const row of rows) {
    const f = field[row.metric as keyof typeof field];
    if (!f) continue;
    const s = stats.get(row.key) ?? { visitors: 0, searches: 0, businessViews: 0, contacts: 0 };
    s[f] += row.value;
    stats.set(row.key, s);
  }
  return stats;
}

export type OwnerBusinessStats = {
  businessId: string;
  views7: number;
  contacts7: number;
  whatsapp7: number;
  calls7: number;
  views30: number;
  contacts30: number;
  whatsapp30: number;
  calls30: number;
  /** Last 30 days, oldest first. */
  daily: { day: string; views: number; contacts: number }[];
};

/**
 * Views and contact taps for the signed-in owner's own businesses only (filtered by owner in
 * the query itself). Today counts as one of the 7/30 days.
 */
export async function getOwnerStats(ownerId: string, today = lagosDay()) {
  const from = addDays(today, -29);
  const rows = await prisma.$queryRaw<
    {
      business_id: string;
      day: string;
      views: number;
      whatsapp: number;
      calls: number;
      emails: number;
    }[]
  >`
    WITH own AS (SELECT id FROM businesses WHERE owner_id = ${ownerId}::uuid),
    s AS (
      SELECT day, business_id, views, whatsapp, calls, emails FROM business_stats_daily
      WHERE day BETWEEN ${from}::date AND ${today}::date AND business_id IN (SELECT id FROM own)
      UNION ALL
      SELECT day, business_id, views, whatsapp, calls, emails FROM (${businessRowsSql(from, today)}) r
      WHERE business_id IN (SELECT id FROM own))
    SELECT business_id::text, to_char(day, 'YYYY-MM-DD') AS day, sum(views)::int AS views,
      sum(whatsapp)::int AS whatsapp, sum(calls)::int AS calls, sum(emails)::int AS emails
    FROM s GROUP BY 1, 2`;
  const days = daysBetween(from, today);
  const weekFrom = addDays(today, -6);
  const result = new Map<string, OwnerBusinessStats>();
  for (const row of rows) {
    let s = result.get(row.business_id);
    if (!s) {
      s = {
        businessId: row.business_id,
        views7: 0,
        contacts7: 0,
        whatsapp7: 0,
        calls7: 0,
        views30: 0,
        contacts30: 0,
        whatsapp30: 0,
        calls30: 0,
        daily: days.map((day) => ({ day, views: 0, contacts: 0 })),
      };
      result.set(row.business_id, s);
    }
    const contacts = row.whatsapp + row.calls + row.emails;
    s.views30 += row.views;
    s.contacts30 += contacts;
    s.whatsapp30 += row.whatsapp;
    s.calls30 += row.calls;
    if (row.day >= weekFrom) {
      s.views7 += row.views;
      s.contacts7 += contacts;
      s.whatsapp7 += row.whatsapp;
      s.calls7 += row.calls;
    }
    const point = s.daily.find((d) => d.day === row.day);
    if (point) {
      point.views += row.views;
      point.contacts += contacts;
    }
  }
  return result;
}
