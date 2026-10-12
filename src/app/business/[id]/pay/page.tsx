import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleAlert, Clock3 } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getWizardBusiness, hasSuccessfulPayment } from "@/lib/business/queries";
import { getPaymentConfig } from "@/lib/payments/config";
import { availableMethods, formatKobo } from "@/lib/payments/methods";
import { getOwnerTransferState } from "@/lib/payments/queries";
import { formatNaira } from "@/lib/business/rules";
import { CopyButton } from "@/components/payments/copy-button";
import { ProofForm } from "@/components/payments/proof-form";
import { TransferMethodCard, WithdrawProofButton } from "@/components/payments/transfer-buttons";
import { SubmitListingForm } from "@/components/business/wizard/step-review";
import { WizardFrame, WizardSkeleton } from "@/components/business/wizard/wizard-frame";

export const metadata: Metadata = {
  title: "Pay listing fee",
  robots: { index: false },
};

const dateFmt = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function DetailRow({ label, value, copy }: { label: string; value: string; copy?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className="flex items-center gap-2">
        <span className="font-semibold break-all text-gray-900">{value}</span>
        {copy && <CopyButton value={copy} label={label} />}
      </dd>
    </div>
  );
}

async function PayContent({ params }: PageProps<"/business/[id]/pay">) {
  const { id } = await params;
  const user = await requireUser(`/business/${id}/pay`);
  const { business } = await getWizardBusiness(id, user.id);
  if (business.status !== "PENDING_PAYMENT") redirect("/dashboard");

  const [config, hasPaid, transfer] = await Promise.all([
    getPaymentConfig(),
    hasSuccessfulPayment(business.id),
    getOwnerTransferState(business.id),
  ]);

  // Fee switched off, or already paid: never start a new payment.
  if (!config.paymentRequired || hasPaid) {
    return (
      <WizardFrame title="No payment needed">
        <div className="space-y-5">
          <p className="text-gray-700">
            {hasPaid
              ? "You've already paid the listing fee for this business, so you won't be charged again."
              : "Good news: the listing fee isn't required right now."}{" "}
            Submit your listing to send it to our team for review.
          </p>
          <SubmitListingForm businessId={business.id} resubmit={false} disabled={false} />
        </div>
      </WizardFrame>
    );
  }

  // A proof is waiting for an admin.
  if (transfer.awaiting) {
    const p = transfer.awaiting;
    return (
      <WizardFrame title="Payment proof submitted">
        <div className="space-y-5">
          <div
            role="status"
            className="flex gap-3 rounded-xl bg-blue-50 p-4 text-blue-900 ring-1 ring-blue-200"
          >
            <Clock3 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">Payment proof submitted, awaiting confirmation</p>
              <p className="mt-1 text-sm">
                We&apos;ll confirm once the money has arrived in our account, usually within 1
                working day. We&apos;ll email you a receipt.
              </p>
            </div>
          </div>
          <dl className="divide-y divide-border rounded-xl border border-border">
            <DetailRow label="Reference" value={p.reference} />
            <DetailRow label="Amount sent" value={formatKobo(p.amountSentKobo ?? 0)} />
            <DetailRow label="From" value={`${p.senderName ?? ""}, ${p.senderBank ?? ""}`} />
            {p.transferDate && (
              <DetailRow label="Transfer date" value={dateFmt.format(p.transferDate)} />
            )}
          </dl>
          <div>
            <p className="mb-2 text-sm text-gray-700">Made a mistake or uploaded the wrong file?</p>
            <WithdrawProofButton paymentId={p.id} />
          </div>
        </div>
      </WizardFrame>
    );
  }

  const methods = availableMethods(config);
  const rejected =
    transfer.lastRejected &&
    (!transfer.pending || transfer.lastRejected.createdAt < transfer.pending.createdAt)
      ? transfer.lastRejected
      : null;

  const rejectionNotice = rejected?.rejectionReason ? (
    <div
      role="alert"
      className="flex gap-3 rounded-xl bg-red-50 p-4 text-red-900 ring-1 ring-red-200"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div>
        <p className="font-semibold">
          We couldn&apos;t confirm your last payment ({rejected.reference})
        </p>
        <p className="mt-1 text-sm whitespace-pre-line">{rejected.rejectionReason}</p>
        <p className="mt-1 text-sm">Please check your transfer and upload a new proof below.</p>
      </div>
    </div>
  ) : null;

  // Bank transfer started: show the account, amount and reference, then the proof form.
  if (transfer.pending && methods.some((m) => m.id === "MANUAL_TRANSFER")) {
    const p = transfer.pending;
    const bank = config.manualTransfer;
    const amount = formatKobo(p.amountKobo);
    return (
      <WizardFrame title="Pay by bank transfer" description={`Listing fee for ${business.name}`}>
        <div className="space-y-6">
          {rejectionNotice}
          <section aria-labelledby="bank-title">
            <h2 id="bank-title" className="mb-2 text-base font-semibold text-gray-900">
              1. Transfer exactly {amount} to this account
            </h2>
            <dl className="divide-y divide-border rounded-xl border border-border bg-white">
              <DetailRow label="Bank" value={bank.bankName ?? ""} />
              <DetailRow
                label="Account number"
                value={bank.accountNumber ?? ""}
                copy={bank.accountNumber ?? ""}
              />
              <DetailRow label="Account name" value={bank.accountName ?? ""} />
              <DetailRow label="Amount" value={amount} copy={String(p.amountKobo / 100)} />
            </dl>
          </section>
          <section
            aria-labelledby="ref-title"
            className="rounded-xl bg-accent-50 p-4 ring-1 ring-accent-200"
          >
            <h2 id="ref-title" className="text-base font-semibold text-gray-900">
              2. Put this reference in the transfer narration/description
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="rounded-lg bg-white px-4 py-2 font-mono text-xl font-bold tracking-wider text-gray-900 ring-1 ring-accent-300">
                {p.reference}
              </span>
              <CopyButton value={p.reference} label="Reference" />
            </div>
            <p className="mt-2 text-sm text-accent-900">
              This is how we match your payment to your listing.
            </p>
          </section>
          <section aria-labelledby="proof-title">
            <h2 id="proof-title" className="mb-1 text-base font-semibold text-gray-900">
              3. Tell us about your transfer and upload the receipt
            </h2>
            <p className="mb-4 text-sm text-gray-700">
              After paying in your bank app, take a screenshot of the success screen or download the
              receipt.
            </p>
            <ProofForm businessId={business.id} feeNaira={p.amountKobo / 100} />
          </section>
        </div>
      </WizardFrame>
    );
  }

  // Choose a payment method.
  return (
    <WizardFrame
      title="Pay the listing fee"
      description="Your listing is ready. Pay the one-time listing fee to send it for review."
    >
      <div className="space-y-6">
        {rejectionNotice}
        <dl className="divide-y divide-border rounded-xl border border-border">
          <div className="flex justify-between gap-4 p-4">
            <dt className="text-gray-700">Business</dt>
            <dd className="text-right font-medium text-gray-900">{business.name}</dd>
          </div>
          <div className="flex justify-between gap-4 p-4">
            <dt className="text-gray-700">Listing fee</dt>
            <dd className="text-right text-2xl font-bold text-gray-900">
              {formatNaira(config.listingFeeNaira)}
            </dd>
          </div>
        </dl>
        <section aria-labelledby="methods-title">
          <h2 id="methods-title" className="mb-3 text-base font-semibold text-gray-900">
            Choose how to pay
          </h2>
          {methods.length === 0 ? (
            <p className="rounded-xl bg-muted p-4 text-sm text-gray-800">
              Payment is temporarily unavailable. Your listing is saved; please check back soon.
            </p>
          ) : (
            <div className="space-y-3">
              {methods.map((method) =>
                method.id === "MANUAL_TRANSFER" ? (
                  <TransferMethodCard
                    key={method.id}
                    businessId={business.id}
                    label={method.label}
                    description={method.description}
                  />
                ) : null,
              )}
            </div>
          )}
        </section>
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li>One-time payment. You won&apos;t be charged again if you edit or resubmit.</li>
          <li>After payment, our team reviews your listing before it goes live.</li>
        </ul>
      </div>
    </WizardFrame>
  );
}

export default function PayPage(props: PageProps<"/business/[id]/pay">) {
  return (
    <Suspense fallback={<WizardSkeleton />}>
      <PayContent {...props} />
    </Suspense>
  );
}
