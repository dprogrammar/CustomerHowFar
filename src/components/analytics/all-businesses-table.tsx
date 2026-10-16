import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import {
  ALL_BUSINESSES_PAGE_SIZE,
  contactRate,
  type AllBusinessesSort,
  type Totals,
} from "@/lib/analytics/admin-stats";
import { STATUS_META, type BusinessStatus } from "@/lib/business/rules";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Admin only (/admin/analytics): every business with its stats for the selected range, including
// businesses with no activity. Search, sort and pages are links/GET forms, done on the server.

export type AllBusinessesRow = {
  id: string;
  name: string;
  status: string;
  owner_id: string;
  owner: string;
  category: string;
  area: string | null;
} & Totals;

const nf = (n: number) => n.toLocaleString("en-NG");
const COLUMNS: { key: AllBusinessesSort; label: string; numeric: boolean }[] = [
  { key: "name", label: "Business", numeric: false },
  { key: "owner", label: "Owner", numeric: false },
  { key: "category", label: "Category", numeric: false },
  { key: "area", label: "Area", numeric: false },
  { key: "views", label: "Views", numeric: true },
  { key: "whatsapp", label: "WhatsApp taps", numeric: true },
  { key: "calls", label: "Call taps", numeric: true },
  { key: "rate", label: "Contact rate", numeric: true },
];

export function AllBusinessesTable({
  rows,
  total,
  range,
  q,
  sort,
  dir,
  page,
}: {
  rows: AllBusinessesRow[];
  total: number;
  range: string;
  q: string;
  sort: AllBusinessesSort;
  dir: "asc" | "desc";
  page: number;
}) {
  const pages = Math.max(1, Math.ceil(total / ALL_BUSINESSES_PAGE_SIZE));
  const href = (over: Partial<{ sort: string; dir: string; page: number }>) => {
    const p = new URLSearchParams({ range });
    if (q) p.set("bq", q);
    p.set("bsort", over.sort ?? sort);
    p.set("bdir", over.dir ?? dir);
    const pg = over.page ?? 1;
    if (pg > 1) p.set("bpage", String(pg));
    return `/admin/analytics?${p.toString()}#all-businesses`;
  };
  const first = (page - 1) * ALL_BUSINESSES_PAGE_SIZE + 1;
  const last = Math.min(total, page * ALL_BUSINESSES_PAGE_SIZE);

  return (
    <div className="space-y-3">
      <form action="/admin/analytics" method="get" role="search" className="flex gap-2">
        <input type="hidden" name="range" value={range} />
        <input type="hidden" name="bsort" value={sort} />
        <input type="hidden" name="bdir" value={dir} />
        <label htmlFor="bq" className="sr-only">
          Search businesses
        </label>
        <div className="min-w-0 flex-1">
          <Input
            id="bq"
            name="bq"
            type="search"
            defaultValue={q}
            placeholder="Business, owner, category or area"
            icon={<Search />}
            className="min-w-0"
          />
        </div>
        <button
          type="submit"
          className={buttonVariants({ variant: "outline", className: "shrink-0" })}
        >
          Search
        </button>
      </form>
      <p className="text-sm text-gray-700" role="status">
        {total === 0
          ? "No businesses match."
          : `Showing ${nf(first)}–${nf(last)} of ${nf(total)} business${total === 1 ? "" : "es"}, including those with no activity.`}
      </p>
      {rows.length > 0 && (
        <div
          className="relative overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="All businesses table"
        >
          <table className="w-full min-w-[46rem] text-sm">
            <caption className="sr-only">
              All businesses with views and taps for the selected period, sorted by{" "}
              {COLUMNS.find((c) => c.key === sort)!.label} (
              {dir === "asc" ? "ascending" : "descending"})
            </caption>
            <thead className="text-left text-gray-700">
              <tr className="border-b border-border">
                {COLUMNS.map((c) => {
                  const active = c.key === sort;
                  const nextDir = active
                    ? dir === "asc"
                      ? "desc"
                      : "asc"
                    : c.numeric
                      ? "desc"
                      : "asc";
                  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                      className={`py-1.5 font-medium ${c.numeric ? "pl-3 text-right" : "pr-3"}`}
                    >
                      <Link
                        href={href({ sort: c.key, dir: nextDir, page: 1 })}
                        scroll={false}
                        className="inline-flex items-center gap-1 rounded hover:text-gray-900 hover:underline"
                      >
                        {c.label}
                        <Icon aria-hidden="true" className="size-3.5" />
                        <span className="sr-only">
                          {active
                            ? ` (sorted ${dir === "asc" ? "ascending" : "descending"})`
                            : " (sort)"}
                        </span>
                      </Link>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((b) => {
                const rate = contactRate(b);
                return (
                  <tr key={b.id}>
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      <Link
                        href={`/admin/listings/${b.id}`}
                        className="font-medium text-brand-700 underline"
                      >
                        {b.name}
                      </Link>
                      <span className="block text-xs text-gray-600">
                        {STATUS_META[b.status as BusinessStatus]?.label ?? b.status}
                      </span>
                    </th>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/admin/users/${b.owner_id}`}
                        className="text-brand-700 underline"
                      >
                        {b.owner}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-gray-800">{b.category}</td>
                    <td className="py-2 pr-3 text-gray-800">{b.area ?? "–"}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">{nf(b.views)}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">{nf(b.whatsapp)}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">{nf(b.calls)}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">
                      {rate === null ? "–" : `${rate.toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <nav aria-label="All businesses pages" className="flex items-center justify-between gap-2">
          {page > 1 ? (
            <Link
              href={href({ page: page - 1 })}
              scroll={false}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-gray-700">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link
              href={href({ page: page + 1 })}
              scroll={false}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
