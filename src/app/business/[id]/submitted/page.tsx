import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { ownerProgress } from "@/lib/business/progress";
import { getWizardBusiness } from "@/lib/business/queries";
import type { BusinessStatus } from "@/lib/business/rules";
import { getIdentityState } from "@/lib/identity/server";
import { ProgressTracker } from "@/components/business/progress-tracker";
import { WizardFrame, WizardSkeleton } from "@/components/business/wizard/wizard-frame";
import { PushPrompt } from "@/components/notifications/push-prompt";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sent for review",
  robots: { index: false },
};

async function SubmittedContent({ params }: PageProps<"/business/[id]/submitted">) {
  const { id } = await params;
  const user = await requireUser(`/business/${id}/submitted`);
  const [{ business, completeness }, { state: idState }] = await Promise.all([
    getWizardBusiness(id, user.id),
    getIdentityState(user.id),
  ]);
  const progress = ownerProgress({
    idState,
    business: { id: business.id, status: business.status as BusinessStatus, completeness },
  });

  return (
    <WizardFrame title="Sent for review" backToDashboard={false}>
      <div className="space-y-5">
        <div className="text-center" role="status">
          <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <CircleCheck aria-hidden="true" className="size-9" />
          </span>
          <h2 className="mt-4 text-xl font-semibold text-gray-900">
            We&apos;ve received {business.name}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-gray-700">
            Our team will review your listing and ID, usually within 1 to 2 working days. We&apos;ll
            notify you when it&apos;s live.
          </p>
        </div>
        <ProgressTracker progress={progress} />
        {/* A meaningful moment to offer push notifications (never on page load elsewhere). */}
        <PushPrompt context="listing" />
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className={buttonVariants({
              size: "lg",
              variant: progress.action ? "outline" : "primary",
            })}
          >
            Go to my businesses
          </Link>
          <Link href="/" className={buttonVariants({ size: "lg", variant: "ghost" })}>
            Back to home
          </Link>
        </div>
      </div>
    </WizardFrame>
  );
}

export default function SubmittedPage(props: PageProps<"/business/[id]/submitted">) {
  return (
    <Suspense fallback={<WizardSkeleton />}>
      <SubmittedContent {...props} />
    </Suspense>
  );
}
