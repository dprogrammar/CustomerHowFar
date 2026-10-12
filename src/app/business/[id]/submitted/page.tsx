import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getWizardBusiness } from "@/lib/business/queries";
import { WizardFrame, WizardSkeleton } from "@/components/business/wizard/wizard-frame";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Listing submitted",
  robots: { index: false },
};

async function SubmittedContent({ params }: PageProps<"/business/[id]/submitted">) {
  const { id } = await params;
  const user = await requireUser(`/business/${id}/submitted`);
  const { business } = await getWizardBusiness(id, user.id);

  return (
    <WizardFrame title="Submitted!" backToDashboard={false}>
      <div className="space-y-5 text-center" role="status">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <CircleCheck aria-hidden="true" className="size-9" />
        </span>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{business.name} is in review</h2>
          <p className="mx-auto mt-2 max-w-md text-gray-700">
            Submitted! Our team will review your listing and notify you by email. This usually takes
            1-2 working days.
          </p>
        </div>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
            Go to my businesses
          </Link>
          <Link href="/" className={buttonVariants({ size: "lg", variant: "outline" })}>
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
