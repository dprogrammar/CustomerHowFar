import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download, ExternalLink, FileText } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { METHOD_LABELS, PAYMENT_STATUS_LABELS, formatKobo } from "@/lib/payments/methods";
import { getAdminPayment } from "@/lib/payments/queries";
import { PaymentReviewPanel } from "@/components/admin/payment-review-panel";

export const metadata: Metadata = { title: "Payment" };

const dateTime = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Lagos",
});
const dateOnly = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className="text-sm break-words text-gray-900">
        {children ?? <span className="text-gray-500">Not provided</span>}
      </dd>
    </div>
  );
}

async function Detail({ params }: PageProps<"/admin/payments/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const { payment: p, otherPayments } = await getAdminPayment(id);
  const proofUrl = `/admin/payments/${p.id}/proof`;
  const isPdf = p.proofFormat === "pdf";
  const amountShort = (p.amountSentKobo ?? 0) < p.amountKobo;

  return (
    <>
      <Link
        href="/admin/payments"
        className="mb-3 inline-flex items-center gap-1.5 rounded text-sm font-medium text-gray-700 hover:text-gray-900"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to payments
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold tracking-tight text-gray-900">{p.reference}</h1>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-gray-800 ring-1 ring-border">
          {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="order-2 space-y-5 xl:order-1">
          <section
            aria-labelledby="proof-title"
            className="rounded-xl border border-border bg-white p-4 shadow-card sm:p-5"
          >
            <h2 id="proof-title" className="mb-3 text-base font-semibold text-gray-900">
              Payment proof
            </h2>
            {p.proofPublicId ? (
              <>
                {isPdf ? (
                  <iframe
                    src={proofUrl}
                    title={`Payment proof ${p.reference} (PDF)`}
                    className="h-[32rem] w-full rounded-lg border border-border"
                  />
                ) : (
                  // Short-lived signed URL via an admin-only redirect; not a public image.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={proofUrl}
                    alt={`Payment proof for ${p.reference}`}
                    className="max-h-[36rem] w-full rounded-lg border border-border object-contain"
                  />
                )}
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <a
                    href={proofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-semibold text-brand-700 underline"
                  >
                    {isPdf ? (
                      <FileText aria-hidden="true" className="size-4" />
                    ) : (
                      <ExternalLink aria-hidden="true" className="size-4" />
                    )}
                    Open full size<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  <a
                    href={`${proofUrl}?download=1`}
                    className="inline-flex items-center gap-1.5 font-semibold text-brand-700 underline"
                  >
                    <Download aria-hidden="true" className="size-4" />
                    Download
                  </a>
                </div>
                <p className="mt-2 text-xs text-gray-600">
                  Private file. Links expire after 5 minutes.
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-600">No proof uploaded.</p>
            )}
          </section>

          <section
            aria-labelledby="details-title"
            className="rounded-xl border border-border bg-white p-4 shadow-card sm:p-5"
          >
            <h2 id="details-title" className="mb-2 text-base font-semibold text-gray-900">
              Details
            </h2>
            <dl className="divide-y divide-border">
              <Field label="Fee due">{formatKobo(p.amountKobo)}</Field>
              <Field label="Amount declared sent">
                {p.amountSentKobo !== null ? (
                  <span className={amountShort ? "font-semibold text-red-700" : undefined}>
                    {formatKobo(p.amountSentKobo)}
                    {amountShort ? " (less than the fee)" : ""}
                  </span>
                ) : null}
              </Field>
              <Field label="Method">{METHOD_LABELS[p.provider] ?? p.provider}</Field>
              <Field label="Sender name">{p.senderName}</Field>
              <Field label="Sender bank">{p.senderBank}</Field>
              <Field label="Transfer date">
                {p.transferDate ? dateOnly.format(p.transferDate) : null}
              </Field>
              <Field label="Proof submitted">
                {p.proofSubmittedAt ? dateTime.format(p.proofSubmittedAt) : null}
              </Field>
              <Field label="Started">{dateTime.format(p.createdAt)}</Field>
              {p.paidAt && <Field label="Confirmed">{dateTime.format(p.paidAt)}</Field>}
              {p.reviewedAt && (
                <Field label="Reviewed by">
                  {p.reviewedBy?.fullName ?? "Former admin"} · {dateTime.format(p.reviewedAt)}
                </Field>
              )}
              {p.rejectionReason && <Field label="Rejection reason">{p.rejectionReason}</Field>}
            </dl>
          </section>

          {otherPayments.length > 0 && (
            <section
              aria-labelledby="other-title"
              className="rounded-xl border border-border bg-white p-4 shadow-card sm:p-5"
            >
              <h2 id="other-title" className="mb-2 text-base font-semibold text-gray-900">
                Other payments for this business
              </h2>
              <ul className="divide-y divide-border text-sm">
                {otherPayments.map((o) => (
                  <li key={o.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <Link
                      href={`/admin/payments/${o.id}`}
                      className="font-mono text-brand-700 underline"
                    >
                      {o.reference}
                    </Link>
                    <span className="text-gray-700">
                      {formatKobo(o.amountKobo)} · {PAYMENT_STATUS_LABELS[o.status] ?? o.status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="order-1 space-y-5 xl:order-2">
          {p.status === "AWAITING_CONFIRMATION" && (
            <PaymentReviewPanel
              paymentId={p.id}
              canApprove={p.business.status === "PENDING_PAYMENT"}
              amountShort={amountShort}
            />
          )}
          <section
            aria-labelledby="business-title"
            className="rounded-xl border border-border bg-white p-4 shadow-card sm:p-5"
          >
            <h2 id="business-title" className="mb-2 text-base font-semibold text-gray-900">
              Business and owner
            </h2>
            <dl className="divide-y divide-border">
              <Field label="Business">
                <Link
                  href={`/admin/listings/${p.business.id}`}
                  className="text-brand-700 underline"
                >
                  {p.business.name}
                </Link>
              </Field>
              <Field label="Listing status">
                {p.business.status.replace("_", " ").toLowerCase()}
              </Field>
              <Field label="Owner">{p.user.fullName}</Field>
              <Field label="Owner email">
                <span className="break-all">{p.user.email}</span>
              </Field>
              <Field label="Owner phone">{p.user.phone}</Field>
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}

export default function AdminPaymentPage(props: PageProps<"/admin/payments/[id]">) {
  return (
    <Suspense
      fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
    >
      <Detail {...props} />
    </Suspense>
  );
}
