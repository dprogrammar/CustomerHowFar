import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, RefreshCcw, Search, Star, Store } from "lucide-react";
import {
  ADMIN_TABS,
  getAdminOverview,
  listAdminBusinesses,
  parseTab,
  type AdminTab,
} from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { IdentityStatusBadge } from "@/components/admin/identity-status-badge";
import type { BusinessStatus } from "@/lib/business/rules";
import { StatusBadge } from "@/components/business/status-badge";
import { CloudinaryImage } from "@/components/cloudinary-image";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Listings" };

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function hrefFor(tab: AdminTab, q: string, page = 1) {
  const params = new URLSearchParams({ tab });
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  return `/admin/listings?${params}`;
}

async function Listings({ searchParams }: Pick<PageProps<"/admin/listings">, "searchParams">) {
  await requireAdmin();
  const params = await searchParams;
  const tab = parseTab(params.tab);
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const page = Number(typeof params.page === "string" ? params.page : 1) || 1;

  const [counts, result] = await Promise.all([
    getAdminOverview(),
    listAdminBusinesses({ tab, q, page }),
  ]);

  return (
    <>
      <nav aria-label="Listing status" className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2">
          {ADMIN_TABS.map((t) => {
            const active = t.key === tab;
            return (
              <li key={t.key} className="shrink-0">
                <Link
                  href={hrefFor(t.key, q)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap ring-1 ring-inset",
                    active
                      ? "bg-brand-700 text-white ring-brand-700"
                      : "bg-white text-gray-800 ring-border hover:bg-muted",
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs tabular-nums",
                      active ? "bg-white/20" : "bg-muted text-gray-700",
                    )}
                  >
                    {counts[t.key]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form
        method="get"
        action="/admin/listings"
        role="search"
        aria-label="Search listings"
        className="mb-5 flex gap-2"
      >
        <input type="hidden" name="tab" value={tab} />
        <label htmlFor="admin-search" className="sr-only">
          Search by business name, owner email or phone
        </label>
        <Input
          id="admin-search"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Business name, owner email or phone"
          icon={<Search />}
        />
        <Button type="submit" size="lg">
          Search
        </Button>
      </form>

      <p className="mb-3 text-sm text-gray-700" aria-live="polite">
        {result.total === 0
          ? q
            ? `No listings match "${q}" in this tab.`
            : "Nothing here right now."
          : `${result.total} listing${result.total === 1 ? "" : "s"}${tab === "review" ? ", oldest submitted first" : ""}.`}
      </p>

      <ul className="space-y-3">
        {result.items.map((b) => {
          const image = b.logoPublicId ?? b.coverPublicId;
          return (
            <li key={b.id}>
              <Link
                href={`/admin/listings/${b.id}`}
                className="flex gap-3 rounded-xl border border-border bg-white p-3 shadow-card transition hover:border-brand-200 hover:shadow-raised sm:gap-4 sm:p-4"
              >
                <span className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-50 text-brand-700">
                  {image ? (
                    <CloudinaryImage
                      publicId={image}
                      alt=""
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  ) : (
                    <Store aria-hidden="true" className="size-6" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">{b.name}</span>
                    <StatusBadge status={b.status as BusinessStatus} />
                    {b.needsRecheck && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-800">
                        <RefreshCcw aria-hidden="true" className="size-3.5" />
                        Edited
                      </span>
                    )}
                    <IdentityStatusBadge state={b.idState} />
                    {b.isFeatured && (
                      <Star
                        aria-label="Featured"
                        className="size-4 fill-accent-400 text-accent-500"
                      />
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-gray-700">
                    {[b.category.name, b.state?.name].filter(Boolean).join(" · ")}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-gray-600">
                    {b.owner.fullName} · {b.owner.email}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-600">
                    {b.submittedAt
                      ? `Submitted ${dateFormat.format(b.submittedAt)}`
                      : `Updated ${dateFormat.format(b.updatedAt)}`}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {result.pageCount > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-3">
          {result.page > 1 ? (
            <Link
              href={hrefFor(tab, q, result.page - 1)}
              className={buttonVariants({ variant: "outline" })}
            >
              <ChevronLeft aria-hidden="true" />
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-gray-700">
            Page {result.page} of {result.pageCount}
          </span>
          {result.page < result.pageCount ? (
            <Link
              href={hrefFor(tab, q, result.page + 1)}
              className={buttonVariants({ variant: "outline" })}
            >
              Next
              <ChevronRight aria-hidden="true" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}

export default function AdminListingsPage({ searchParams }: PageProps<"/admin/listings">) {
  return (
    <>
      <h1 className="mb-5 text-2xl font-bold tracking-tight text-gray-900">Listings</h1>
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
      >
        <Listings searchParams={searchParams} />
      </Suspense>
    </>
  );
}
