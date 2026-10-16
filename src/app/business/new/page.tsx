import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { ownerProgress } from "@/lib/business/progress";
import { countOwnedBusinesses } from "@/lib/business/queries";
import { getIdentityState } from "@/lib/identity/server";
import { MAX_BUSINESSES_PER_USER } from "@/lib/business/rules";
import { isListingFeeOn } from "@/lib/payments/fee-switch";
import { getActiveCategories } from "@/lib/data/catalog";
import { liveStatesText } from "@/components/service-areas/live-states";
import { FormAlert } from "@/components/auth/form-fields";
import { ProgressTracker } from "@/components/business/progress-tracker";
import { StepBasics } from "@/components/business/wizard/step-basics";
import { WizardFrame, WizardSkeleton } from "@/components/business/wizard/wizard-frame";
import { WizardProgress } from "@/components/business/wizard/wizard-progress";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "List your business",
  robots: { index: false },
};

async function NewBusinessContent() {
  const user = await requireUser("/business/new");
  const [count, categories, live, feeOn, identity] = await Promise.all([
    countOwnedBusinesses(user.id),
    getActiveCategories(),
    liveStatesText(),
    isListingFeeOn(),
    getIdentityState(user.id),
  ]);

  if (count >= MAX_BUSINESSES_PER_USER) {
    return (
      <WizardFrame title="List your business">
        <div className="space-y-4">
          <FormAlert status="error">
            You have reached the limit of {MAX_BUSINESSES_PER_USER} businesses per account. Contact
            support if you need to list more.
          </FormAlert>
          <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
            Go to my businesses
          </Link>
        </div>
      </WizardFrame>
    );
  }

  return (
    <WizardFrame
      title="List your business"
      description={
        feeOn
          ? "It's free to start and takes about 5 minutes. Your progress is saved after each step."
          : "Listing is free and takes about 5 minutes. Your progress is saved after each step."
      }
      backToDashboard={count > 0}
    >
      <p className="mb-5 rounded-lg bg-brand-50 p-3 text-sm text-brand-900 ring-1 ring-brand-200">
        We&apos;re currently accepting businesses in {live.names}.
        {!live.allLive && (
          <>
            {" "}
            More states coming soon.{" "}
            <Link href="/coming-soon" className="font-semibold underline">
              Join the waitlist
            </Link>
          </>
        )}
      </p>
      {/* The owner is starting their listing here, so no button: the steps below come first. */}
      <ProgressTracker
        progress={ownerProgress({ idState: identity.state, business: null })}
        showAction={false}
        className="mb-6"
      />
      <WizardProgress current={1} completed={{}} />
      <StepBasics businessId={null} categories={categories} />
    </WizardFrame>
  );
}

export default function NewBusinessPage() {
  return (
    <Suspense fallback={<WizardSkeleton />}>
      <NewBusinessContent />
    </Suspense>
  );
}
