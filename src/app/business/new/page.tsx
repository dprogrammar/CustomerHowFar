import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { countOwnedBusinesses } from "@/lib/business/queries";
import { MAX_BUSINESSES_PER_USER } from "@/lib/business/rules";
import { getActiveCategories } from "@/lib/data/catalog";
import { FormAlert } from "@/components/auth/form-fields";
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
  const [count, categories] = await Promise.all([
    countOwnedBusinesses(user.id),
    getActiveCategories(),
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
      description="It's free to start and takes about 5 minutes. Your progress is saved after each step."
      backToDashboard={count > 0}
    >
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
