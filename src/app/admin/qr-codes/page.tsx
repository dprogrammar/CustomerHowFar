import { Suspense } from "react";
import type { Metadata } from "next";
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
  const campaigns = await listQrCampaigns();
  return (
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
