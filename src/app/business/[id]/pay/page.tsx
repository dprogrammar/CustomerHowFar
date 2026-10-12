import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import {
  getPaymentSettings,
  getWizardBusiness,
  hasSuccessfulPayment,
} from "@/lib/business/queries";
import { formatNaira } from "@/lib/business/rules";
import { PayButton } from "@/components/business/pay-button";
import { SubmitListingForm } from "@/components/business/wizard/step-review";
import { WizardFrame, WizardSkeleton } from "@/components/business/wizard/wizard-frame";

export const metadata: Metadata = {
  title: "Pay listing fee",
  robots: { index: false },
};

async function PayContent({ params }: PageProps<"/business/[id]/pay">) {
  const { id } = await params;
  const user = await requireUser(`/business/${id}/pay`);
  const { business } = await getWizardBusiness(id, user.id);

  // Only listings waiting for payment belong here.
  if (business.status !== "PENDING_PAYMENT") redirect("/dashboard");

  const [{ paymentRequired, listingFeeNaira }, hasPaid] = await Promise.all([
    getPaymentSettings(),
    hasSuccessfulPayment(business.id),
  ]);

  // The fee was switched off (or this business already paid): let them go straight to review.
  if (!paymentRequired || hasPaid) {
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

  return (
    <WizardFrame
      title="Pay the listing fee"
      description="Your listing is ready. Pay the one-time listing fee to send it for review."
    >
      <div className="space-y-6">
        <dl className="divide-y divide-border rounded-xl border border-border">
          <div className="flex justify-between gap-4 p-4">
            <dt className="text-gray-700">Business</dt>
            <dd className="text-right font-medium text-gray-900">{business.name}</dd>
          </div>
          <div className="flex justify-between gap-4 p-4">
            <dt className="text-gray-700">Listing fee</dt>
            <dd className="text-right text-2xl font-bold text-gray-900">
              {formatNaira(listingFeeNaira)}
            </dd>
          </div>
        </dl>
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li>One-time payment. You won&apos;t be charged again if you edit or resubmit.</li>
          <li>After payment, our team reviews your listing before it goes live.</li>
        </ul>
        <PayButton amountLabel={formatNaira(listingFeeNaira)} />
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
