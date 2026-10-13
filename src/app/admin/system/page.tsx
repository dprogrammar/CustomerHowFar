import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getLastDailyJob } from "@/lib/jobs/daily";

export const metadata: Metadata = { title: "System" };

const dateTime = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Lagos",
});

async function Status() {
  await requireAdmin();
  const job = await getLastDailyJob();
  const monitoring = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);
  return (
    <dl className="divide-y divide-border rounded-xl border border-border bg-white px-4 text-sm shadow-card">
      <div className="grid gap-1 py-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
        <dt className="text-gray-600">Daily job last succeeded</dt>
        <dd className="font-medium text-gray-900">
          {job?.lastSuccessAt ? dateTime.format(job.lastSuccessAt) : "Never"}
        </dd>
      </div>
      <div className="grid gap-1 py-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
        <dt className="text-gray-600">Daily job last failed</dt>
        <dd className="font-medium text-gray-900">
          {job?.lastFailureAt ? dateTime.format(job.lastFailureAt) : "Never"}
        </dd>
      </div>
      <div className="grid gap-1 py-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
        <dt className="text-gray-600">Error monitoring (Sentry)</dt>
        <dd className="font-medium text-gray-900">{monitoring ? "On" : "Off (no DSN set)"}</dd>
      </div>
      <div className="grid gap-1 py-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
        <dt className="text-gray-600">Test the error page</dt>
        <dd>
          <Link href="/admin/system/error-test" className="font-medium text-brand-700 underline">
            Open a page that fails on purpose
          </Link>
          <span className="block text-xs text-gray-600">
            Shows the friendly error page and, with Sentry on, sends a test error.
          </span>
        </dd>
      </div>
    </dl>
  );
}

export default function AdminSystemPage() {
  return (
    <>
      <h1 className="mb-5 text-2xl font-bold tracking-tight text-gray-900">System</h1>
      <Suspense
        fallback={<div className="h-48 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
      >
        <Status />
      </Suspense>
    </>
  );
}
