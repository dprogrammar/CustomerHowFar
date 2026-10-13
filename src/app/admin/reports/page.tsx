import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  getReportCounts,
  listHiddenReviews,
  listReportedListings,
  listReportedReviews,
  parseReportTab,
  REPORT_TABS,
} from "@/lib/admin/report-queries";
import { requireAdmin } from "@/lib/auth/session";
import { STATUS_META, type BusinessStatus } from "@/lib/business/rules";
import { LISTING_REASON_LABELS, REVIEW_REASON_LABELS } from "@/lib/reviews/rules";
import { ListingReportActions, ReviewReportActions } from "@/components/admin/report-actions-panel";
import { Stars } from "@/components/reviews/stars";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

const dateFmt = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Lagos",
});

function countBy<T extends { reason: string }>(items: T[]) {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.reason, (counts.get(i.reason) ?? 0) + 1);
  return [...counts.entries()];
}

type ReviewRow = Awaited<ReturnType<typeof listReportedReviews>>[number];

function ReviewItem({ r, hidden }: { r: ReviewRow; hidden: boolean }) {
  const open = r.reports.filter((x) => x.status === "OPEN");
  return (
    <li className="rounded-xl border border-border bg-white p-4 shadow-card">
      <p className="text-sm text-gray-700">
        Review of{" "}
        <Link
          href={`/admin/listings/${r.business.id}`}
          className="font-semibold text-brand-700 underline"
        >
          {r.business.name}
        </Link>{" "}
        by{" "}
        <Link href={`/admin/users/${r.user.id}`} className="font-medium text-brand-700 underline">
          {r.user.fullName}
        </Link>
      </p>
      <Stars value={r.rating} size="sm" className="mt-1" />
      {r.comment && <p className="mt-2 text-sm whitespace-pre-line text-gray-900">{r.comment}</p>}
      {open.length > 0 && (
        <p className="mt-2 text-sm text-gray-800">
          <span className="font-semibold">
            {open.length} open report{open.length === 1 ? "" : "s"}:
          </span>{" "}
          {countBy(open)
            .map(
              ([reason, n]) => `${REVIEW_REASON_LABELS[reason] ?? reason}${n > 1 ? ` ×${n}` : ""}`,
            )
            .join(", ")}
          <span className="block text-xs text-gray-600">
            First reported {dateFmt.format(open[0]!.createdAt)}
          </span>
        </p>
      )}
      <ReviewReportActions reviewId={r.id} hidden={hidden} />
    </li>
  );
}

async function Reports({ searchParams }: Pick<PageProps<"/admin/reports">, "searchParams">) {
  await requireAdmin();
  const tab = parseReportTab((await searchParams).tab);
  const counts = await getReportCounts();
  const badge: Partial<Record<string, number>> = {
    reviews: counts.reviews,
    listings: counts.listings,
  };

  return (
    <>
      <nav aria-label="Report type" className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2">
          {REPORT_TABS.map((t) => (
            <li key={t.key} className="shrink-0">
              <Link
                href={`/admin/reports?tab=${t.key}`}
                aria-current={t.key === tab ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap ring-1 ring-inset",
                  t.key === tab
                    ? "bg-brand-700 text-white ring-brand-700"
                    : "bg-white text-gray-800 ring-border hover:bg-muted",
                )}
              >
                {t.label}
                {badge[t.key] !== undefined && (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs tabular-nums",
                      t.key === tab ? "bg-white/20" : "bg-accent-100 text-accent-900",
                    )}
                  >
                    {badge[t.key]}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "listings" ? <ListingReports /> : <ReviewReports hidden={tab === "hidden"} />}
    </>
  );
}

async function ReviewReports({ hidden }: { hidden: boolean }) {
  const items = hidden ? await listHiddenReviews() : await listReportedReviews();
  return (
    <>
      <p className="mb-3 text-sm text-gray-700" role="status">
        {items.length === 0
          ? hidden
            ? "No hidden reviews."
            : "No reported reviews. Nice and quiet."
          : `${items.length} review${items.length === 1 ? "" : "s"}${hidden ? "" : ", oldest report first"}.`}
      </p>
      <ul className="space-y-3">
        {items.map((r) => (
          <ReviewItem key={r.id} r={r} hidden={hidden} />
        ))}
      </ul>
    </>
  );
}

async function ListingReports() {
  const items = await listReportedListings();
  return (
    <>
      <p className="mb-3 text-sm text-gray-700" role="status">
        {items.length === 0
          ? "No reported listings."
          : `${items.length} listing${items.length === 1 ? "" : "s"}, oldest report first.`}
      </p>
      <ul className="space-y-3">
        {items.map((b) => (
          <li key={b.id} className="rounded-xl border border-border bg-white p-4 shadow-card">
            <p className="flex flex-wrap items-center gap-2">
              <Link
                href={`/admin/listings/${b.id}`}
                className="font-semibold text-brand-700 underline"
              >
                {b.name}
              </Link>
              <span className="text-xs text-gray-700">
                {STATUS_META[b.status as BusinessStatus]?.label ?? b.status}
              </span>
            </p>
            <p className="mt-0.5 text-sm text-gray-700">
              Owner:{" "}
              <Link href={`/admin/users/${b.owner.id}`} className="text-brand-700 underline">
                {b.owner.fullName}
              </Link>
              {b.owner.status === "SUSPENDED" ? " (suspended)" : ""}
            </p>
            <ul className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
              {b.reports.map((r) => (
                <li key={r.id}>
                  <span className="font-semibold text-gray-900">
                    {LISTING_REASON_LABELS[r.reason] ?? r.reason}
                  </span>
                  <span className="text-gray-600">
                    {" "}
                    · {r.reporter.fullName} · {dateFmt.format(r.createdAt)}
                  </span>
                  {r.details && (
                    <span className="mt-0.5 block whitespace-pre-line text-gray-800">
                      {r.details}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <ListingReportActions
              businessId={b.id}
              canSuspendListing={[
                "APPROVED",
                "PENDING_REVIEW",
                "PENDING_PAYMENT",
                "REJECTED",
              ].includes(b.status)}
              canSuspendUser={b.owner.status === "ACTIVE"}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

export default function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  return (
    <>
      <h1 className="mb-5 text-2xl font-bold tracking-tight text-gray-900">Reports</h1>
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
      >
        <Reports searchParams={searchParams} />
      </Suspense>
    </>
  );
}
