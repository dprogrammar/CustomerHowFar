import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, Clock3, Info, ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getWizardBusiness } from "@/lib/business/queries";
import {
  MISSING_LABELS,
  canSubmit,
  firstIncompleteStep,
  missingItems,
  parseStep,
  type BusinessStatus,
  type OpeningHours,
} from "@/lib/business/rules";
import { getActiveCategories, getLgasGroupedByState, getStates } from "@/lib/data/catalog";
import { getIdentityState } from "@/lib/identity/server";
import { STATE_NOT_LIVE_MESSAGE } from "@/lib/service-areas/rules";
import { isStateActive } from "@/lib/service-areas/server";
import { FormAlert } from "@/components/auth/form-fields";
import { BusinessPreview } from "@/components/business/business-preview";
import { StatusBadge } from "@/components/business/status-badge";
import { StepAbout } from "@/components/business/wizard/step-about";
import { StepBasics } from "@/components/business/wizard/step-basics";
import { StepLocation } from "@/components/business/wizard/step-location";
import { StepPhotos } from "@/components/business/wizard/step-photos";
import { SubmitListingForm } from "@/components/business/wizard/step-review";
import { WizardFrame, WizardSkeleton } from "@/components/business/wizard/wizard-frame";
import { WizardProgress } from "@/components/business/wizard/wizard-progress";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Edit business",
  robots: { index: false },
};

function StatusNotice({
  status,
  needsRecheck,
  comment,
  businessId,
}: {
  status: BusinessStatus;
  needsRecheck: boolean;
  comment: string | null;
  businessId: string;
}) {
  if (status === "REJECTED") {
    return (
      <div
        role="alert"
        className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200"
      >
        <p className="flex items-center gap-2 font-semibold">
          <CircleAlert aria-hidden="true" className="size-4" />
          Changes requested
        </p>
        {comment && <p className="mt-1 whitespace-pre-line">{comment}</p>}
        <p className="mt-2 text-red-800">Make the changes, then resubmit from the Review step.</p>
      </div>
    );
  }
  if (status === "PENDING_PAYMENT") {
    return (
      <FormAlert status="error" className="mb-6">
        Your listing is waiting for the listing fee.{" "}
        <Link href={`/business/${businessId}/pay`} className="font-semibold underline">
          Pay now
        </Link>{" "}
        to send it for review.
      </FormAlert>
    );
  }
  if (status === "PENDING_REVIEW") {
    return (
      <div className="mb-6 flex gap-2 rounded-xl bg-blue-50 p-4 text-sm text-blue-900 ring-1 ring-blue-200">
        <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>
          Your listing is being reviewed. You can still make changes; our team will see the latest
          version.
        </p>
      </div>
    );
  }
  if (status === "APPROVED") {
    return (
      <div className="mb-6 flex gap-2 rounded-xl bg-brand-50 p-4 text-sm text-brand-900 ring-1 ring-brand-200">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>
          Your listing is live. Changes are saved and shown right away
          {needsRecheck
            ? ", and our team will take a quick look at them."
            : "; our team may review them."}
        </p>
      </div>
    );
  }
  return null;
}

async function EditContent({ params, searchParams }: PageProps<"/business/[id]/edit">) {
  const { id } = await params;
  const user = await requireUser(`/business/${id}/edit`);
  const { business, completeness, latestDecision } = await getWizardBusiness(id, user.id);
  const status = business.status as BusinessStatus;

  if (status === "SUSPENDED") {
    return (
      <WizardFrame title={business.name}>
        <div className="space-y-4">
          <div
            role="alert"
            className="rounded-xl bg-gray-100 p-4 text-sm text-gray-900 ring-1 ring-gray-300"
          >
            <p className="flex items-center gap-2 font-semibold">
              <ShieldAlert aria-hidden="true" className="size-4" />
              This listing is suspended and can&apos;t be edited.
            </p>
            {latestDecision?.comment && <p className="mt-1">{latestDecision.comment}</p>}
            <p className="mt-2">Please contact support if you think this is a mistake.</p>
          </div>
          <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
            Back to my businesses
          </Link>
        </div>
      </WizardFrame>
    );
  }

  const step = parseStep((await searchParams).step) ?? firstIncompleteStep(completeness);
  const completed = {
    1: completeness.basics,
    2: completeness.location,
    3: completeness.about,
    4: completeness.photos,
  };
  const comment =
    status === "REJECTED" ? (latestDecision?.comment ?? business.rejectionReason) : null;

  let body: React.ReactNode;
  if (step === 1) {
    body = (
      <StepBasics
        businessId={business.id}
        categories={await getActiveCategories()}
        defaults={{
          name: business.name,
          categoryId: business.categoryId,
          tagline: business.tagline,
          phone: business.phone,
          whatsappNumber: business.whatsappNumber,
          email: business.email,
        }}
      />
    );
  } else if (step === 2) {
    const [states, lgasByState] = await Promise.all([getStates(), getLgasGroupedByState()]);
    body = (
      <StepLocation
        businessId={business.id}
        states={states}
        lgasByState={lgasByState}
        email={user.email}
        defaults={{
          stateId: business.stateId,
          lgaId: business.lgaId,
          address: business.address,
          area: business.area,
        }}
      />
    );
  } else if (step === 3) {
    body = (
      <StepAbout
        businessId={business.id}
        defaults={{
          description: business.description,
          yearsOfExperience: business.yearsOfExperience,
          services: business.services,
          openingHours: business.openingHours as OpeningHours | null,
          instagramUrl: business.instagramUrl,
          facebookUrl: business.facebookUrl,
          tiktokUrl: business.tiktokUrl,
          websiteUrl: business.websiteUrl,
        }}
      />
    );
  } else if (step === 4) {
    body = (
      <StepPhotos
        businessId={business.id}
        initial={{
          logoPublicId: business.logoPublicId,
          coverPublicId: business.coverPublicId,
          photos: business.photos,
        }}
      />
    );
  } else {
    const missing = missingItems(completeness);
    const { state: idState } = await getIdentityState(user.id);
    const stateLive = business.stateId ? await isStateActive(business.stateId) : true;
    body = (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Preview</h2>
          <p className="text-sm text-gray-600">This is how customers will see your listing.</p>
        </div>
        <BusinessPreview business={business} />
        {missing.length > 0 && (
          <div
            role="alert"
            className="rounded-xl bg-accent-50 p-4 text-sm text-accent-900 ring-1 ring-accent-200"
          >
            <p className="font-semibold">Before you can submit, please add:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {missing.map((item) => (
                <li key={item}>
                  <Link
                    href={`/business/${business.id}/edit?step=${{ basics: 1, location: 2, about: 3, photos: 4 }[item]}`}
                    className="underline"
                  >
                    {MISSING_LABELS[item]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!stateLive && (
          <div
            role="alert"
            className="rounded-xl bg-accent-50 p-4 text-sm text-accent-900 ring-1 ring-accent-200"
          >
            <p>{STATE_NOT_LIVE_MESSAGE}</p>
            <p className="mt-2">
              You can keep editing this listing.{" "}
              <Link href="/coming-soon" className="font-semibold underline">
                Join the waitlist
              </Link>
            </p>
          </div>
        )}
        {status === "PENDING_PAYMENT" ? (
          <Link
            href={`/business/${business.id}/pay`}
            className={buttonVariants({ size: "lg", variant: "accent" })}
          >
            Continue to payment
          </Link>
        ) : canSubmit(status) ? (
          <SubmitListingForm
            businessId={business.id}
            resubmit={status === "REJECTED"}
            disabled={missing.length > 0 || !stateLive}
            idState={idState}
          />
        ) : (
          <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
            Done
          </Link>
        )}
      </div>
    );
  }

  return (
    <WizardFrame
      title={status === "DRAFT" ? "List your business" : `Edit ${business.name}`}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          <StatusBadge status={status} />
          <span>Your progress is saved after each step.</span>
        </span>
      }
    >
      <StatusNotice
        status={status}
        needsRecheck={business.needsRecheck}
        comment={comment}
        businessId={business.id}
      />
      <WizardProgress current={step} businessId={business.id} completed={completed} />
      {body}
    </WizardFrame>
  );
}

export default function EditBusinessPage(props: PageProps<"/business/[id]/edit">) {
  return (
    <Suspense fallback={<WizardSkeleton />}>
      <EditContent {...props} />
    </Suspense>
  );
}
