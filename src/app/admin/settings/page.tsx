import { Suspense } from "react";
import type { Metadata } from "next";
import { getSettingsWithHistory } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { formatNaira } from "@/lib/business/rules";
import { SettingsForm } from "@/components/admin/settings-form";

export const metadata: Metadata = { title: "Settings" };

const dateTime = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Lagos",
});

const FIELD_LABELS: Record<string, { label: string; format: (v: string) => string }> = {
  paymentRequired: { label: "Require listing fee", format: (v) => (v === "true" ? "On" : "Off") },
  listingFeeNaira: { label: "Listing fee", format: (v) => formatNaira(Number(v)) },
  manualTransferEnabled: { label: "Bank transfer", format: (v) => (v === "true" ? "On" : "Off") },
  bankName: { label: "Bank name", format: (v) => v || "(empty)" },
  bankAccountNumber: { label: "Account number", format: (v) => v || "(empty)" },
  bankAccountName: { label: "Account name", format: (v) => v || "(empty)" },
};

async function Settings() {
  await requireAdmin();
  const settings = await getSettingsWithHistory();

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="fee-title"
        className="rounded-xl border border-border bg-white p-4 shadow-card sm:p-6"
      >
        <h2 id="fee-title" className="mb-4 text-lg font-semibold text-gray-900">
          Listing fee and payment methods
        </h2>
        <SettingsForm
          initial={{
            paymentRequired: settings.paymentRequired,
            listingFeeNaira: settings.listingFeeNaira,
            manualTransferEnabled: settings.manualTransferEnabled,
            bankName: settings.bankName,
            bankAccountNumber: settings.bankAccountNumber,
            bankAccountName: settings.bankAccountName,
          }}
        />
      </section>

      <section
        aria-labelledby="history-title"
        className="rounded-xl border border-border bg-white p-4 shadow-card sm:p-6"
      >
        <h2 id="history-title" className="mb-3 text-lg font-semibold text-gray-900">
          Change history
        </h2>
        {settings.history.length === 0 ? (
          <p className="text-sm text-gray-600">No changes yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {settings.history.map((change) => {
              const meta = FIELD_LABELS[change.field] ?? {
                label: change.field,
                format: (v: string) => v,
              };
              return (
                <li key={change.id} className="py-2.5">
                  <p className="text-gray-900">
                    <span className="font-medium">{meta.label}</span>:{" "}
                    {meta.format(change.oldValue)} → {meta.format(change.newValue)}
                  </p>
                  <p className="text-xs text-gray-600">
                    {dateTime.format(change.createdAt)} · {change.admin?.fullName ?? "Former admin"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <>
      <h1 className="mb-5 text-2xl font-bold tracking-tight text-gray-900">Settings</h1>
      <Suspense
        fallback={<div className="h-80 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
      >
        <Settings />
      </Suspense>
    </>
  );
}
