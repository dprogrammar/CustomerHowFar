import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getWaitlistCounts } from "@/lib/service-areas/waitlist";
import { StateToggle } from "@/components/admin/state-toggle";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Service areas" };

const dateFmt = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Lagos",
});

async function ServiceAreas() {
  await requireAdmin();
  const [states, byStatus, waitlist] = await Promise.all([
    prisma.state.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, isActive: true, launchedAt: true },
    }),
    prisma.business.groupBy({
      by: ["stateId", "status"],
      where: { status: { not: "DELETED" }, stateId: { not: null } },
      _count: { _all: true },
    }),
    getWaitlistCounts(),
  ]);
  const liveCount = states.filter((s) => s.isActive).length;
  const rows = states
    .map((s) => {
      const counts = byStatus.filter((b) => b.stateId === s.id);
      const live = counts.find((c) => c.status === "APPROVED")?._count._all ?? 0;
      const inProgress = counts
        .filter((c) => c.status !== "APPROVED" && c.status !== "SUSPENDED")
        .reduce((n, c) => n + c._count._all, 0);
      const total = counts.reduce((n, c) => n + c._count._all, 0);
      const w = waitlist.get(s.id) ?? { total: 0, pending: 0 };
      return { ...s, live, inProgress, total, waitlist: w.total, waitlistPending: w.pending };
    })
    // Most demand first; live states before others at equal demand.
    .sort(
      (a, b) =>
        b.waitlist - a.waitlist ||
        Number(b.isActive) - Number(a.isActive) ||
        a.name.localeCompare(b.name),
    );

  return (
    <>
      <p className="mb-4 text-sm text-gray-700" role="status">
        {liveCount} of {states.length} states live. Sorted by waitlist demand.
      </p>
      <ul className="space-y-3">
        {rows.map((s) => (
          <li key={s.id} className="rounded-xl border border-border bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900">{s.name}</h2>
              {s.isActive ? (
                <Badge variant="brand">Live</Badge>
              ) : (
                <Badge variant="outline">Coming soon</Badge>
              )}
              {s.isActive && s.launchedAt && (
                <span className="text-xs text-gray-600">since {dateFmt.format(s.launchedAt)}</span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-700">
              {s.total} business{s.total === 1 ? "" : "es"} ({s.live} live) ·{" "}
              <strong className="font-semibold text-gray-900">{s.waitlist}</strong> on the waitlist
              {s.waitlistPending > 0 && s.waitlistPending !== s.waitlist
                ? ` (${s.waitlistPending} not yet emailed)`
                : ""}
            </p>
            <StateToggle
              stateId={s.id}
              name={s.name}
              isActive={s.isActive}
              liveListings={s.live}
              inProgress={s.inProgress}
              waitlistPending={s.waitlistPending}
              isLastLive={s.isActive && liveCount <= 1}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

export default function AdminServiceAreasPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900">Service areas</h1>
      <p className="mb-5 text-sm text-gray-700">
        Launch one state at a time. Businesses can only list in live states; customers can browse
        everywhere.
      </p>
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
      >
        <ServiceAreas />
      </Suspense>
    </>
  );
}
