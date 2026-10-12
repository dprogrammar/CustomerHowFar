import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  ClipboardList,
  CreditCard,
  FilePen,
  RefreshCcw,
  ShieldAlert,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import { getAdminOverview } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

type Stat = { label: string; value: number; href?: string; icon: LucideIcon; urgent?: boolean };

async function Overview() {
  await requireAdmin();
  const c = await getAdminOverview();
  const stats: Stat[] = [
    {
      label: "In review",
      value: c.review,
      href: "/admin/listings?tab=review",
      icon: ClipboardList,
      urgent: c.review > 0,
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
    { label: "Total users", value: c.users, icon: Users },
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

export default function AdminOverviewPage() {
  return (
    <>
      <h1 className="mb-5 text-2xl font-bold tracking-tight text-gray-900">Overview</h1>
      <Suspense
        fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
      >
        <Overview />
      </Suspense>
    </>
  );
}
