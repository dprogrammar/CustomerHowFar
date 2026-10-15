import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  CircleAlert,
  ClipboardList,
  CreditCard,
  FilePen,
  Flag,
  MessageSquareWarning,
  IdCard,
  RefreshCcw,
  ShieldAlert,
  Store,
  Users,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { getAnalyticsSummary } from "@/lib/analytics/queries";
import { percentChange } from "@/lib/analytics/rules";
import { getAdminOverview } from "@/lib/admin/queries";
import { countTransfersToConfirm } from "@/lib/payments/queries";
import { getReportCounts } from "@/lib/admin/report-queries";
import { requireAdmin } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

type Stat = { label: string; value: number; href?: string; icon: LucideIcon; urgent?: boolean };

async function Overview() {
  await requireAdmin();
  const [c, transfers, reports] = await Promise.all([
    getAdminOverview(),
    countTransfersToConfirm(),
    getReportCounts(),
  ]);
  const stats: Stat[] = [
    {
      label: "In review",
      value: c.review,
      href: "/admin/listings?tab=review",
      icon: ClipboardList,
      urgent: c.review > 0,
    },
    {
      label: "Transfers to confirm",
      value: transfers,
      href: "/admin/payments?tab=confirm",
      icon: Banknote,
      urgent: transfers > 0,
    },
    {
      label: "Reported reviews",
      value: reports.reviews,
      href: "/admin/reports?tab=reviews",
      icon: MessageSquareWarning,
      urgent: reports.reviews > 0,
    },
    {
      label: "Reported listings",
      value: reports.listings,
      href: "/admin/reports?tab=listings",
      icon: Flag,
      urgent: reports.listings > 0,
    },
    {
      label: "Identity checks",
      value: c.identity,
      href: "/admin/identity",
      icon: IdCard,
      urgent: c.identity > 0,
    },
    {
      label: "Edited, needs re-check",
      value: c.recheck,
      href: "/admin/listings?tab=recheck",
      icon: RefreshCcw,
      urgent: c.recheck > 0,
    },
    {
      label: "Awaiting payment",
      value: c.payment,
      href: "/admin/listings?tab=payment",
      icon: CreditCard,
    },
    { label: "Live", value: c.live, href: "/admin/listings?tab=live", icon: Store },
    {
      label: "Changes requested",
      value: c.rejected,
      href: "/admin/listings?tab=rejected",
      icon: CircleAlert,
    },
    {
      label: "Suspended",
      value: c.suspended,
      href: "/admin/listings?tab=suspended",
      icon: ShieldAlert,
    },
    { label: "Drafts", value: c.drafts, href: "/admin/listings?tab=drafts", icon: FilePen },
    { label: "Users", value: c.users, href: "/admin/users", icon: Users },
    {
      label: "Suspended users",
      value: c.suspendedUsers,
      href: "/admin/users?status=SUSPENDED",
      icon: UserX,
    },
  ];

  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {stats.map(({ label, value, href, icon: Icon, urgent }) => {
        const content = (
          <>
            <span className="flex items-center justify-between gap-2">
              <Icon
                aria-hidden="true"
                className={cn("size-5", urgent ? "text-accent-700" : "text-brand-700")}
              />
              {href && <ArrowRight aria-hidden="true" className="size-4 text-gray-400" />}
            </span>
            <span className="mt-3 block text-3xl font-bold text-gray-900 tabular-nums">
              {value.toLocaleString("en-NG")}
            </span>
            <span className="mt-1 block text-sm text-gray-700">{label}</span>
          </>
        );
        const className = cn(
          "block h-full rounded-xl border bg-white p-4 shadow-card",
          urgent ? "border-accent-300 ring-1 ring-accent-200" : "border-border",
        );
        return (
          <li key={label}>
            {href ? (
              <Link
                href={href}
                className={cn(className, "transition hover:border-brand-200 hover:shadow-raised")}
              >
                {content}
              </Link>
            ) : (
              <div className={className}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Last 7 days at a glance, linking to the full analytics page. */
async function AnalyticsSummary() {
  await requireAdmin();
  const { current, previous } = await getAnalyticsSummary();
  const items = [
    { label: "Visitors", key: "visitors" },
    { label: "Page views", key: "pageViews" },
    { label: "Searches", key: "searches" },
    { label: "Contacts", key: "contacts" },
  ] as const;
  return (
    <section
      aria-labelledby="analytics-summary-title"
      className="mt-6 rounded-xl border border-border bg-white p-4 shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="analytics-summary-title" className="text-base font-semibold text-gray-900">
          Last 7 days
        </h2>
        <Link
          href="/admin/analytics?range=7"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 underline"
        >
          Full analytics
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map(({ label, key }) => {
          const pct = percentChange(current[key], previous[key]);
          return (
            <div key={key} className="rounded-lg bg-muted p-3">
              <dt className="text-sm text-gray-700">{label}</dt>
              <dd className="mt-0.5 text-2xl font-bold text-gray-900 tabular-nums">
                {current[key].toLocaleString("en-NG")}
              </dd>
              <dd className="text-xs text-gray-700">
                {pct === null ? "New" : `${pct > 0 ? "+" : ""}${pct}%`} vs the 7 days before
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

export default function AdminOverviewPage() {
  return (
    <>
      <h1 className="mb-5 text-2xl font-bold tracking-tight text-gray-900">Overview</h1>
      <Suspense
        fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
      >
        <Overview />
      </Suspense>
      <Suspense
        fallback={
          <div className="mt-6 h-36 animate-pulse rounded-xl bg-muted" aria-hidden="true" />
        }
      >
        <AnalyticsSummary />
      </Suspense>
    </>
  );
}
