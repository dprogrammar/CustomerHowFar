import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus, SearchX } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { getActiveCategories, getStates } from "@/lib/data/catalog";
import { getSiteAnalytics } from "@/lib/analytics/queries";
import { RANGES, parseRange, percentChange } from "@/lib/analytics/rules";
import {
  ALL_BUSINESSES_SORTS,
  getAllBusinessesStats,
  type AllBusinessesSort,
} from "@/lib/analytics/admin-stats";
import { AllBusinessesTable } from "@/components/analytics/all-businesses-table";
import { TrendChart } from "@/components/analytics/trend-chart";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Analytics" };

const nf = (n: number) => n.toLocaleString("en-NG");
const dayFmt = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const shortDay = (day: string) => dayFmt.format(new Date(`${day}T00:00:00Z`));

const SOURCE_LABELS: Record<string, string> = {
  direct: "Direct (typed or bookmarked)",
  google: "Google",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  instagram: "Instagram",
  qr: "QR codes",
  other: "Other websites",
};
const DEVICE_LABELS: Record<string, string> = {
  phone: "Phone",
  tablet: "Tablet",
  desktop: "Computer",
};
const PAGE_LABELS: Record<string, string> = {
  home: "Home",
  search: "Search",
  category: "Categories",
  business: "Business pages",
  help: "Help",
  start: "QR landing (/start)",
  other: "Other pages",
};

function Change({
  current,
  previous,
  period,
}: {
  current: number;
  previous: number;
  period: string;
}) {
  const pct = percentChange(current, previous);
  const Icon = pct === null || pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus;
  const tone =
    pct === null || pct > 0 ? "text-brand-800" : pct < 0 ? "text-red-800" : "text-gray-700";
  return (
    <span className={cn("mt-1 inline-flex items-center gap-0.5 text-xs font-medium", tone)}>
      <Icon aria-hidden="true" className="size-3.5" />
      {pct === null ? "New" : `${pct > 0 ? "+" : ""}${pct}%`}
      <span className="font-normal text-gray-600">&nbsp;vs {period}</span>
    </span>
  );
}

function Card({
  label,
  value,
  current,
  previous,
  period,
  note,
}: {
  label: string;
  value: string;
  current: number;
  previous: number;
  period: string;
  note?: string;
}) {
  return (
    <li className="rounded-xl border border-border bg-white p-4 shadow-card">
      <span className="block text-sm text-gray-700">{label}</span>
      <span className="mt-1 block text-2xl font-bold text-gray-900 tabular-nums sm:text-3xl">
        {value}
      </span>
      <Change current={current} previous={previous} period={period} />
      {note && <span className="mt-1 block text-xs text-gray-600">{note}</span>}
    </li>
  );
}

function Panel({
  title,
  id,
  children,
  highlight,
  description,
}: {
  title: ReactNode;
  id: string;
  children: ReactNode;
  highlight?: boolean;
  description?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "min-w-0 rounded-xl border bg-white p-4 shadow-card",
        highlight ? "border-accent-300 ring-1 ring-accent-200" : "border-border",
      )}
    >
      <h2 id={id} className="flex items-center gap-2 text-base font-semibold text-gray-900">
        {title}
      </h2>
      {description && <p className="mt-0.5 text-sm text-gray-700">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** A simple ranked table; an empty message when there is nothing yet. */
function RankTable({
  caption,
  columns,
  rows,
  empty = "Nothing yet for this period.",
}: {
  caption: string;
  columns: string[];
  rows: { key: string; cells: ReactNode[] }[];
  empty?: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-gray-600">{empty}</p>;
  return (
    // Focusable, so the table can be scrolled with the keyboard on narrow screens.
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${caption} table`}>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-left text-gray-700">
          <tr className="border-b border-border">
            {columns.map((c, i) => (
              <th
                key={c}
                scope="col"
                className={cn("py-1.5 font-medium", i > 0 && "pl-3 text-right")}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.key}>
              {r.cells.map((cell, i) =>
                i === 0 ? (
                  <th
                    key={i}
                    scope="row"
                    className="max-w-0 py-2 text-left font-normal break-words text-gray-900"
                  >
                    {cell}
                  </th>
                ) : (
                  <td
                    key={i}
                    className="py-2 pl-3 text-right whitespace-nowrap text-gray-900 tabular-nums"
                  >
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Share of a total as a bar plus a percentage. */
function ShareRows({
  items,
  labels,
}: {
  items: { key: string; value: number }[];
  labels: Record<string, string>;
}) {
  const total = items.reduce((a, b) => a + b.value, 0);
  if (total === 0) return <p className="text-sm text-gray-600">Nothing yet for this period.</p>;
  return (
    <ul className="space-y-2.5">
      {items.map(({ key, value }) => {
        const pct = Math.round((value / total) * 100);
        return (
          <li key={key} className="text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-gray-900">{labels[key] ?? key}</span>
              <span className="text-gray-700 tabular-nums">
                {nf(value)} · {pct}%
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function searchLabel(
  s: { q: string; category: string; state: string },
  names: { categories: Map<string, string>; states: Map<string, string> },
) {
  const filters = [
    names.categories.get(s.category) ?? s.category,
    names.states.get(s.state) ?? s.state,
  ].filter(Boolean);
  return (
    <>
      {s.q ? <>&ldquo;{s.q}&rdquo;</> : <span className="text-gray-600">(no text)</span>}
      {filters.length > 0 && (
        <span className="block text-xs text-gray-600">{filters.join(" · ")}</span>
      )}
    </>
  );
}

async function Analytics({ searchParams }: Pick<PageProps<"/admin/analytics">, "searchParams">) {
  await requireAdmin();
  const sp = await searchParams;
  const range = parseRange(sp.range);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  // "All businesses" table: search, sort and page from the address (whitelisted).
  const table = {
    q: one(sp.bq).slice(0, 80),
    sort: (ALL_BUSINESSES_SORTS as readonly string[]).includes(one(sp.bsort))
      ? (one(sp.bsort) as AllBusinessesSort)
      : "views",
    dir: one(sp.bdir) === "asc" ? ("asc" as const) : ("desc" as const),
    page: Math.min(10_000, Math.max(1, Number.parseInt(one(sp.bpage), 10) || 1)),
  };
  const [a, categories, states, all] = await Promise.all([
    getSiteAnalytics(range.days),
    getActiveCategories(),
    getStates(),
    getAllBusinessesStats({ days: range.days, ...table }),
  ]);
  const names = {
    categories: new Map(categories.map((c) => [c.slug, c.name])),
    states: new Map(states.map((s) => [s.slug, s.name])),
  };
  const period = range.days === 1 ? "yesterday" : `previous ${range.days} days`;
  const { current: c, previous: p } = a;
  const multiDay = range.days > 1;

  return (
    <>
      <nav aria-label="Date range" className="mb-5">
        <ul className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <li key={r.key}>
              <Link
                href={`/admin/analytics?${new URLSearchParams({
                  // The search and sort of "All businesses" carry over; range stays last.
                  ...(table.q ? { bq: table.q } : {}),
                  ...(table.sort !== "views" || table.dir !== "desc"
                    ? { bsort: table.sort, bdir: table.dir }
                    : {}),
                  range: r.key,
                }).toString()}`}
                aria-current={r.key === range.key ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center rounded-full px-4 text-sm font-medium ring-1",
                  r.key === range.key
                    ? "bg-brand-700 text-white ring-brand-700"
                    : "bg-white text-gray-800 ring-border hover:bg-brand-50",
                )}
              >
                {r.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <h2 className="sr-only">Headline numbers</h2>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        <Card
          label="Unique visitors"
          value={nf(c.visitors)}
          current={c.visitors}
          previous={p.visitors}
          period={period}
          note={multiDay ? "Counted once per day" : undefined}
        />
        <Card
          label="Page views"
          value={nf(c.pageViews)}
          current={c.pageViews}
          previous={p.pageViews}
          period={period}
        />
        <Card
          label="Contacts"
          value={nf(c.contacts)}
          current={c.contacts}
          previous={p.contacts}
          period={period}
          note={`WhatsApp ${nf(a.contactTypes.WHATSAPP)} · Call ${nf(a.contactTypes.CALL)} · Email ${nf(a.contactTypes.EMAIL)}`}
        />
        <Card
          label="Contact rate"
          value={`${c.contactRate.toFixed(1)}%`}
          current={Math.round(c.contactRate * 10)}
          previous={Math.round(p.contactRate * 10)}
          period={period}
          note="Contacts per 100 business page views"
        />
        <Card
          label="New sign-ups"
          value={nf(c.signups)}
          current={c.signups}
          previous={p.signups}
          period={period}
        />
        <Card
          label="New listings"
          value={nf(c.listings)}
          current={c.listings}
          previous={p.listings}
          period={period}
        />
      </ul>

      <section
        aria-labelledby="trend-title"
        className="mt-6 rounded-xl border border-border bg-white p-4 shadow-card"
      >
        <h2 id="trend-title" className="text-base font-semibold text-gray-900">
          Visitors and contacts {a.hourly ? "by hour today" : "per day"}
        </h2>
        <TrendChart
          id="site-trend"
          className="mt-3"
          title={`Visitors and contacts ${a.hourly ? "by hour today" : "per day"}`}
          labels={a.chart.map((pt) => (a.hourly ? pt.label : shortDay(pt.label)))}
          series={[
            {
              label: "Visitors",
              values: a.chart.map((pt) => pt.visitors),
              className: "stroke-brand-600",
              swatch: "bg-brand-600",
            },
            {
              label: "Contacts",
              values: a.chart.map((pt) => pt.contacts),
              className: "stroke-accent-500",
              swatch: "bg-accent-500",
            },
          ]}
        />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel id="top-views" title="Top businesses by views">
          <RankTable
            caption="Top businesses by views"
            columns={["Business", "Views", "Contacts"]}
            rows={a.topByViews.map((b) => ({
              key: b.id,
              cells: [
                <Link
                  key="n"
                  href={`/admin/listings/${b.id}`}
                  className="font-medium text-brand-700 underline"
                >
                  {b.name}
                </Link>,
                nf(b.views),
                nf(b.contacts),
              ],
            }))}
          />
        </Panel>
        <Panel id="top-contacts" title="Top businesses by contacts">
          <RankTable
            caption="Top businesses by contacts"
            columns={["Business", "Contacts", "Views"]}
            rows={a.topByContacts.map((b) => ({
              key: b.id,
              cells: [
                <Link
                  key="n"
                  href={`/admin/listings/${b.id}`}
                  className="font-medium text-brand-700 underline"
                >
                  {b.name}
                </Link>,
                nf(b.contacts),
                nf(b.views),
              ],
            }))}
          />
        </Panel>
        <Panel
          id="top-categories"
          title="Top categories"
          description="Business page views and contacts by category."
        >
          <RankTable
            caption="Top categories"
            columns={["Category", "Views", "Contacts"]}
            rows={a.categories.map((x) => ({
              key: x.name,
              cells: [x.name, nf(x.views), nf(x.contacts)],
            }))}
          />
        </Panel>
        <Panel
          id="top-areas"
          title="Top areas"
          description="Business page views and contacts by LGA."
        >
          <RankTable
            caption="Top areas"
            columns={["Area", "Views", "Contacts"]}
            rows={a.areas.map((x) => ({
              key: x.name,
              cells: [x.name, nf(x.views), nf(x.contacts)],
            }))}
          />
        </Panel>
        <Panel
          id="top-searches"
          title="Top searches"
          description={`${nf(c.searches)} searches in this period.`}
        >
          <RankTable
            caption="Top searches"
            columns={["Search", "Times"]}
            rows={a.topSearches.map((s, i) => ({
              key: `${i}`,
              cells: [searchLabel(s, names), nf(s.value)],
            }))}
          />
        </Panel>
        <Panel
          id="zero-searches"
          highlight
          title={
            <>
              <SearchX aria-hidden="true" className="size-5 text-accent-700" />
              Demand you&apos;re not meeting
            </>
          }
          description={`${nf(a.zeroSearchCount)} searches found no businesses. These are the services and places to recruit for.`}
        >
          <RankTable
            caption="Searches with no results"
            columns={["Search with no results", "Times"]}
            rows={a.zeroSearches.map((s, i) => ({
              key: `${i}`,
              cells: [searchLabel(s, names), nf(s.value)],
            }))}
            empty="No empty searches in this period."
          />
        </Panel>
        <Panel
          id="sources"
          title="Traffic sources"
          description="Where visitors came from (first visit each day)."
        >
          <ShareRows items={a.sources} labels={SOURCE_LABELS} />
        </Panel>
        <Panel id="devices" title="Devices" description="Visitors by device.">
          <ShareRows items={a.devices} labels={DEVICE_LABELS} />
        </Panel>
        <Panel
          id="qr-campaigns"
          title="QR campaigns"
          description="Visitors who arrived by scanning a QR code, and what they did that day."
        >
          <RankTable
            caption="QR campaigns"
            columns={["Campaign", "Visitors", "Searches", "Business views", "Contacts"]}
            rows={a.campaigns.map((q) => ({
              key: q.name,
              cells: [q.name, nf(q.visitors), nf(q.searches), nf(q.businessViews), nf(q.contacts)],
            }))}
            empty="No QR code visits in this period."
          />
          <p className="mt-3 text-sm">
            <Link href="/admin/qr-codes" className="font-medium text-brand-700 underline">
              Manage QR codes
            </Link>
          </p>
        </Panel>
        <Panel id="pages" title="Page views by type">
          <ShareRows items={a.pages} labels={PAGE_LABELS} />
        </Panel>
      </div>

      <section
        id="all-businesses"
        aria-labelledby="all-businesses-title"
        className="mt-6 scroll-mt-24 rounded-xl border border-border bg-white p-4 shadow-card"
      >
        <h2 id="all-businesses-title" className="text-base font-semibold text-gray-900">
          All businesses
        </h2>
        <p className="mt-0.5 mb-3 text-sm text-gray-700">
          Every business with its views and taps for{" "}
          {range.days === 1 ? "today" : `the last ${range.days} days`}, including those with no
          activity. Contact rate: WhatsApp, call and email taps per 100 views.
        </p>
        <AllBusinessesTable rows={all.rows} total={all.total} range={range.key} {...table} />
      </section>

      <p className="mt-6 text-xs text-gray-600">
        Anonymous and cookie-free: visitors are counted with a code that changes every day and
        can&apos;t be traced back to a person. Detailed events are deleted after 7 days; only daily
        totals are kept. Admins, bots and owners viewing their own listings aren&apos;t counted.
        Today&apos;s numbers update as people visit.
      </p>
    </>
  );
}

export default function AdminAnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900">Analytics</h1>
      <p className="mb-5 text-sm text-gray-700">How people find and use CustomerHowFar.</p>
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
      >
        <Analytics searchParams={searchParams} />
      </Suspense>
    </>
  );
}
