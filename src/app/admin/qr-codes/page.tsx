import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getQrCampaignAnalytics } from "@/lib/analytics/queries";
import { getSiteUrl } from "@/config/site";
import { requireAdmin } from "@/lib/auth/session";
import { listQrCampaigns } from "@/lib/qr/campaigns";
import { QrStudio } from "@/components/admin/qr-studio";

export const metadata: Metadata = { title: "QR codes" };

const dateFmt = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Lagos",
});

async function QrCodes() {
  await requireAdmin();
  const [campaigns, stats] = await Promise.all([listQrCampaigns(), getQrCampaignAnalytics(30)]);
  return (
    <>
      <QrStudio
        siteUrl={getSiteUrl()}
        campaigns={campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          visits: c.visits,
          signups: c.signups,
          listings: c.listings,
          lastVisit: c.lastVisitAt ? dateFmt.format(c.lastVisitAt) : null,
          created: dateFmt.format(c.createdAt),
        }))}
      />
      {campaigns.length > 0 && (
        <section
          aria-labelledby="qr-analytics-title"
          className="mt-6 rounded-xl border border-border bg-white p-4 shadow-card"
        >
          <h2 id="qr-analytics-title" className="text-base font-semibold text-gray-900">
            What QR visitors did (last 30 days)
          </h2>
          <p className="mt-0.5 text-sm text-gray-700">
            From our anonymous analytics: people who arrived by scanning each code, and their
            searches, business page views and contacts that day.{" "}
            <Link href="/admin/analytics" className="font-medium text-brand-700 underline">
              See all traffic sources
            </Link>
          </p>
          <div
            className="mt-3 overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="QR campaign analytics, last 30 days"
          >
            <table className="w-full text-sm">
              <caption className="sr-only">QR campaign analytics, last 30 days</caption>
              <thead className="text-left text-gray-700">
                <tr className="border-b border-border">
                  <th scope="col" className="py-1.5 font-medium">
                    Campaign
                  </th>
                  <th scope="col" className="py-1.5 pl-3 text-right font-medium">
                    Visitors
                  </th>
                  <th scope="col" className="py-1.5 pl-3 text-right font-medium">
                    Searches
                  </th>
                  <th scope="col" className="py-1.5 pl-3 text-right font-medium">
                    Business views
                  </th>
                  <th scope="col" className="py-1.5 pl-3 text-right font-medium">
                    Contacts
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campaigns.map((c) => {
                  const s = stats.get(c.name);
                  return (
                    <tr key={c.id}>
                      <th
                        scope="row"
                        className="py-2 text-left font-medium break-all text-gray-900"
                      >
                        {c.name}
                      </th>
                      <td className="py-2 pl-3 text-right tabular-nums">{s?.visitors ?? 0}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">{s?.searches ?? 0}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">{s?.businessViews ?? 0}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">{s?.contacts ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

export default function AdminQrCodesPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900">QR codes</h1>
      <p className="mb-5 text-sm text-gray-700">
        QR codes for flyers and adverts. They open our &ldquo;Get started&rdquo; page (/start), and
        each campaign&apos;s scans are counted below.
      </p>
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
      >
        <QrCodes />
      </Suspense>
    </>
  );
}
