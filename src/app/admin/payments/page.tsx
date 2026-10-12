import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { METHOD_LABELS, PAYMENT_STATUS_LABELS, formatKobo } from "@/lib/payments/methods";
import {
  ADMIN_PAYMENT_TABS,
  countTransfersToConfirm,
  getRevenueTotals,
  listAdminPayments,
  parsePaymentTab,
} from "@/lib/payments/queries";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Payments" };

const dateFmt = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Lagos",
});

const STATUS_TONE: Record<string, string> = {
  AWAITING_CONFIRMATION: "bg-accent-50 text-accent-900 ring-accent-200",
  SUCCESS: "bg-brand-50 text-brand-800 ring-brand-200",
  FAILED: "bg-red-50 text-red-800 ring-red-200",
  PENDING: "bg-gray-100 text-gray-800 ring-gray-300",
  ABANDONED: "bg-gray-100 text-gray-800 ring-gray-300",
};

async function Payments({ searchParams }: Pick<PageProps<"/admin/payments">, "searchParams">) {
  await requireAdmin();
  const params = await searchParams;
  const tab = parsePaymentTab(params.tab);
  const page = Number(typeof params.page === "string" ? params.page : 1) || 1;
  const [totals, toConfirm, result] = await Promise.all([
    getRevenueTotals(),
    countTransfersToConfirm(),
    listAdminPayments({ tab, page }),
  ]);
  const href = (t: string, p = 1) => `/admin/payments?tab=${t}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <>
      <section aria-labelledby="revenue-title" className="mb-6">
        <h2 id="revenue-title" className="sr-only">
          Confirmed revenue
        </h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            ["Today", totals.today],
            ["This month", totals.month],
            ["All time", totals.total],
          ].map(([label, value]) => (
            <div
              key={label as string}
              className="rounded-xl border border-border bg-white p-4 shadow-card"
            >
              <dt className="text-sm text-gray-700">Confirmed revenue · {label}</dt>
              <dd className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">
                {formatKobo(value as number)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <nav aria-label="Payment status" className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2">
          {ADMIN_PAYMENT_TABS.map((t) => (
            <li key={t.key} className="shrink-0">
              <Link
                href={href(t.key)}
                aria-current={t.key === tab ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap ring-1 ring-inset",
                  t.key === tab
                    ? "bg-brand-700 text-white ring-brand-700"
                    : "bg-white text-gray-800 ring-border hover:bg-muted",
                )}
              >
                {t.label}
                {t.key === "confirm" && (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs tabular-nums",
                      t.key === tab ? "bg-white/20" : "bg-accent-100 text-accent-900",
                    )}
                  >
                    {toConfirm}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="mb-3 text-sm text-gray-700" role="status">
        {result.total === 0
          ? "Nothing here right now."
          : `${result.total} payment${result.total === 1 ? "" : "s"}${tab === "confirm" ? ", oldest first" : ""}.`}
      </p>

      <ul className="space-y-3">
        {result.items.map((p) => (
          <li key={p.id}>
            <Link
              href={`/admin/payments/${p.id}`}
              className="block rounded-xl border border-border bg-white p-4 shadow-card transition hover:border-brand-200 hover:shadow-raised"
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-semibold text-gray-900">{p.reference}</span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                    STATUS_TONE[p.status],
                  )}
                >
                  {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
                </span>
              </span>
              <span className="mt-1 block text-sm text-gray-900">
                {formatKobo(p.amountKobo)} · {METHOD_LABELS[p.provider] ?? p.provider}
              </span>
              <span className="mt-0.5 block truncate text-sm text-gray-700">
                {p.business.name} · {p.user.fullName} ({p.user.email})
              </span>
              <span className="mt-0.5 block text-xs text-gray-600">
                {p.status === "AWAITING_CONFIRMATION" && p.proofSubmittedAt
                  ? `Proof submitted ${dateFmt.format(p.proofSubmittedAt)}`
                  : p.paidAt
                    ? `Paid ${dateFmt.format(p.paidAt)}`
                    : `Started ${dateFmt.format(p.createdAt)}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {result.pageCount > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-3">
          {result.page > 1 ? (
            <Link
              href={href(tab, result.page - 1)}
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
              href={href(tab, result.page + 1)}
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

export default function AdminPaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  return (
    <>
      <h1 className="mb-5 text-2xl font-bold tracking-tight text-gray-900">Payments</h1>
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
      >
        <Payments searchParams={searchParams} />
      </Suspense>
    </>
  );
}
