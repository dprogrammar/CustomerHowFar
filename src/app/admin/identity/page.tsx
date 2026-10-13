import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { ID_TYPE_LABELS } from "@/lib/identity/rules";
import { countPendingIdentities, IDENTITY_TABS, listAdminIdentities } from "@/lib/identity/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Identity checks" };

const dateFmt = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Lagos",
});

type TabKey = (typeof IDENTITY_TABS)[number]["key"];

async function Queue({ searchParams }: Pick<PageProps<"/admin/identity">, "searchParams">) {
  await requireAdmin();
  const params = await searchParams;
  const tab: TabKey = IDENTITY_TABS.some((t) => t.key === params.tab)
    ? (params.tab as TabKey)
    : "pending";
  const [pendingCount, items] = await Promise.all([
    countPendingIdentities(),
    listAdminIdentities(tab),
  ]);

  return (
    <>
      <nav
        aria-label="Identity check status"
        className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        <ul className="flex gap-2">
          {IDENTITY_TABS.map((t) => (
            <li key={t.key} className="shrink-0">
              <Link
                href={`/admin/identity?tab=${t.key}`}
                aria-current={t.key === tab ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap ring-1 ring-inset",
                  t.key === tab
                    ? "bg-brand-700 text-white ring-brand-700"
                    : "bg-white text-gray-800 ring-border hover:bg-muted",
                )}
              >
                {t.label}
                {t.key === "pending" && (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs tabular-nums",
                      t.key === tab ? "bg-white/20" : "bg-accent-100 text-accent-900",
                    )}
                  >
                    {pendingCount}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="mb-3 text-sm text-gray-700" role="status">
        {items.length === 0
          ? "Nothing here right now."
          : `${items.length} check${items.length === 1 ? "" : "s"}${tab === "pending" ? ", oldest first" : ""}.`}
      </p>

      <ul className="space-y-3">
        {items.map((v) => (
          <li key={v.id}>
            <Link
              href={`/admin/identity/${v.id}`}
              className="block rounded-xl border border-border bg-white p-4 shadow-card transition hover:border-brand-200 hover:shadow-raised"
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-gray-900">
                  {v.user?.fullName ?? "Deleted account"}
                </span>
                <span className="text-sm text-gray-700">
                  {ID_TYPE_LABELS[v.idType] ?? v.idType}
                </span>
              </span>
              {v.user && (
                <span className="mt-0.5 block truncate text-sm text-gray-700">
                  {v.user.email} · {v.user._count.businesses} business
                  {v.user._count.businesses === 1 ? "" : "es"}
                </span>
              )}
              <span className="mt-0.5 block text-xs text-gray-600">
                Submitted {dateFmt.format(v.submittedAt)}
                {v.reviewedAt ? ` · reviewed ${dateFmt.format(v.reviewedAt)}` : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function AdminIdentityPage({ searchParams }: PageProps<"/admin/identity">) {
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900">Identity checks</h1>
      <p className="mb-5 text-sm text-gray-700">
        A visual check of each owner&apos;s ID and selfie. Photos are private and deleted 90 days
        after review.
      </p>
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
      >
        <Queue searchParams={searchParams} />
      </Suspense>
    </>
  );
}
