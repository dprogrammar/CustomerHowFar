import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Banknote,
  CircleAlert,
  Clock3,
  Eye,
  IdCard,
  Pencil,
  Plus,
  ShieldAlert,
  Store,
} from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getOwnerStats, type OwnerBusinessStats } from "@/lib/analytics/queries";
import { ownerProgress } from "@/lib/business/progress";
import { getOwnerDashboard } from "@/lib/business/queries";
import { MAX_BUSINESSES_PER_USER, firstIncompleteStep } from "@/lib/business/rules";
import type { IdentityState } from "@/lib/identity/rules";
import { getIdentityState } from "@/lib/identity/server";
import { formatKobo } from "@/lib/payments/methods";
import { DeleteBusinessButton } from "@/components/business/delete-business-button";
import { ProgressTracker } from "@/components/business/progress-tracker";
import { StatusBadge } from "@/components/business/status-badge";
import { IdStatusBadge } from "@/components/identity/id-status-badge";
import { OwnerStats } from "@/components/analytics/owner-stats";
import { CloudinaryImage } from "@/components/cloudinary-image";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "My businesses",
  robots: { index: false },
};

type DashboardBusiness = Awaited<ReturnType<typeof getOwnerDashboard>>[number];

/** Payment status and reference on the owner's card (with the reason if a proof was rejected). */
function PaymentSummary({ payment }: { payment: NonNullable<DashboardBusiness["latestPayment"]> }) {
  const tone =
    payment.status === "SUCCESS"
      ? "text-brand-800"
      : payment.status === "FAILED"
        ? "text-red-800"
        : payment.status === "AWAITING_CONFIRMATION"
          ? "text-blue-900"
          : "text-gray-800";
  const label =
    payment.status === "AWAITING_CONFIRMATION"
      ? "Payment proof submitted, awaiting confirmation"
      : payment.status === "SUCCESS"
        ? `Paid ${formatKobo(payment.amountKobo)}`
        : payment.status === "FAILED"
          ? "Payment proof not accepted"
          : "Payment started, waiting for your transfer";
  return (
    <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
      <p className={`flex flex-wrap items-center gap-x-2 font-medium ${tone}`}>
        <Banknote aria-hidden="true" className="size-4 shrink-0" />
        {label}
        <span className="font-mono text-xs text-gray-700">Ref {payment.reference}</span>
      </p>
      {payment.status === "FAILED" && payment.rejectionReason && (
        <p className="mt-1 text-red-900">
          <strong className="font-semibold">Reason:</strong> {payment.rejectionReason} Please upload
          a new proof.
        </p>
      )}
    </div>
  );
}

function BusinessCardRow({
  b,
  stats,
  idState,
}: {
  b: DashboardBusiness;
  stats?: OwnerBusinessStats;
  idState: IdentityState;
}) {
  const image = b.coverPublicId ?? b.photos[0]?.publicId ?? b.logoPublicId;
  const editable = b.status !== "SUSPENDED";
  // Read from the server's data: the owner's ID check and this business's status.
  const progress = ownerProgress({ idState, business: b });
  // Same URL for everyone; owners see a preview banner while the listing isn't live.
  const viewHref = `/business/${b.slug}`;

  return (
    <li
      id={`business-${b.id}`}
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-white shadow-card"
    >
      <div className="flex flex-col sm:flex-row">
        <div className="relative aspect-[16/9] w-full shrink-0 bg-gradient-to-br from-brand-50 to-accent-50 sm:aspect-auto sm:w-48">
          {image ? (
            <CloudinaryImage
              publicId={image}
              alt=""
              fill
              sizes="(min-width: 640px) 192px, 100vw"
              className="object-cover"
            />
          ) : (
            <Store
              aria-hidden="true"
              className="absolute inset-0 m-auto size-10 text-brand-700/30"
            />
          )}
        </div>
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">{b.name}</h2>
            <StatusBadge status={b.status} />
            {b.status === "APPROVED" && b.needsRecheck && (
              <span className="text-xs text-gray-600">Recent changes being checked</span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-gray-600">
            {[b.category.name, b.state?.name].filter(Boolean).join(" · ")}
          </p>

          {b.status === "REJECTED" && (
            <div
              role="note"
              className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200"
            >
              <p className="flex items-start gap-1.5">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>
                  <strong className="font-semibold">Changes requested:</strong>{" "}
                  {b.adminComment ?? "Please review your listing and resubmit."}
                </span>
              </p>
            </div>
          )}
          {b.status === "SUSPENDED" && (
            <div
              role="note"
              className="mt-3 rounded-lg bg-gray-100 p-3 text-sm text-gray-900 ring-1 ring-gray-300"
            >
              <p className="flex items-start gap-1.5">
                <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>
                  This listing is suspended{b.adminComment ? `: ${b.adminComment}` : "."} Contact
                  support for help.
                </span>
              </p>
            </div>
          )}
          <ProgressTracker progress={progress} title={`Progress for ${b.name}`} className="mt-3" />
          {b.latestPayment && <PaymentSummary payment={b.latestPayment} />}
          {/* Live listings (and any that had visitors this month) show their private stats. */}
          {(b.status === "APPROVED" || stats) && (
            <OwnerStats businessId={b.id} businessName={b.name} stats={stats} />
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {editable && (
              <Link
                href={
                  b.status === "DRAFT"
                    ? `/business/${b.id}/edit?step=${firstIncompleteStep(b.completeness)}`
                    : `/business/${b.id}/edit?step=1`
                }
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil aria-hidden="true" />
                Edit<span className="sr-only"> {b.name}</span>
              </Link>
            )}
            <Link href={viewHref} className={buttonVariants({ variant: "ghost" })}>
              <Eye aria-hidden="true" />
              View<span className="sr-only"> {b.name}</span>
            </Link>
          </div>
          {b.status !== "SUSPENDED" && (
            <div className="mt-3 border-t border-border pt-3">
              <DeleteBusinessButton
                businessId={b.id}
                businessName={b.name}
                mode="owner"
                hasPayments={Boolean(b.latestPayment)}
              />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

const dateFmt = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Africa/Lagos",
});

/** The owner's ID check (one per owner, for all their businesses), always with the same status labels. */
function IdentityNotice({
  state,
  reason,
  submittedAt,
}: {
  state: IdentityState;
  reason: string | null;
  submittedAt: Date | null;
}) {
  if (state === "REJECTED") {
    return (
      <div
        role="alert"
        className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-950 ring-1 ring-red-200"
      >
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
          ID check: <IdStatusBadge state={state} />
        </p>
        <p className="mt-2">
          Our team couldn&apos;t accept your ID{reason ? " for this reason:" : "."}
        </p>
        {reason && <p className="mt-1 font-medium whitespace-pre-line">{reason}</p>}
        <p className="mt-2">
          Your listings can only go live after your ID is accepted. Please upload a new one.
        </p>
        <Link
          href="/account/verify-identity"
          className={buttonVariants({ variant: "primary", className: "mt-3 w-full sm:w-auto" })}
        >
          <IdCard aria-hidden="true" />
          Upload a new ID
        </Link>
      </div>
    );
  }
  if (state === "NONE") {
    return (
      <div
        role="note"
        className="text-accent-950 mt-6 rounded-xl bg-accent-50 p-4 text-sm ring-1 ring-accent-200"
      >
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <IdCard aria-hidden="true" className="size-5 shrink-0" />
          ID check: <IdStatusBadge state={state} />
        </p>
        <p className="mt-2">
          Share a photo of your government ID and a selfie holding it. Your listings can only go
          live after our team has reviewed your ID. It takes about 2 minutes.
        </p>
        <Link
          href="/account/verify-identity"
          className={buttonVariants({ variant: "primary", className: "mt-3 w-full sm:w-auto" })}
        >
          Verify your identity
        </Link>
      </div>
    );
  }
  return (
    <p className="mt-6 flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 text-sm text-gray-800 ring-1 ring-border">
      {state === "PENDING" ? (
        <Clock3 aria-hidden="true" className="size-4 shrink-0 text-blue-700" />
      ) : (
        <IdCard aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
      )}
      <span className="font-semibold text-gray-900">ID check:</span>
      <IdStatusBadge state={state} />
      <span>
        {state === "PENDING"
          ? `No action needed${submittedAt ? `. Sent on ${dateFmt.format(submittedAt)}` : ""}.`
          : "Your ID has been checked."}
      </span>
    </p>
  );
}

async function DashboardContent() {
  const user = await requireUser("/dashboard");
  const [businesses, identity, stats] = await Promise.all([
    getOwnerDashboard(user.id),
    getIdentityState(user.id),
    getOwnerStats(user.id),
  ]);
  const atLimit = businesses.length >= MAX_BUSINESSES_PER_USER;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            My businesses
          </h1>
          <p className="mt-1 text-sm text-gray-700">
            {businesses.length} of {MAX_BUSINESSES_PER_USER} listings used.
          </p>
        </div>
        {!atLimit && businesses.length > 0 && (
          <Link href="/business/new" className={buttonVariants({ size: "lg" })}>
            <Plus aria-hidden="true" />
            Add a business
          </Link>
        )}
      </div>

      {businesses.length > 0 && (
        <IdentityNotice
          state={identity.state}
          reason={identity.latest?.rejectionReason ?? null}
          submittedAt={identity.latest?.submittedAt ?? null}
        />
      )}

      {businesses.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <Store aria-hidden="true" className="mx-auto size-10 text-brand-700" />
          <h2 className="mt-3 text-lg font-semibold text-gray-900">
            You haven&apos;t listed a business yet
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-700">
            Showcase your work to customers near you. It takes about 5 minutes.
          </p>
          <Link href="/business/new" className={buttonVariants({ size: "lg", className: "mt-5" })}>
            List your business
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {businesses.map((b) => (
            <BusinessCardRow key={b.id} b={b} stats={stats.get(b.id)} idState={identity.state} />
          ))}
        </ul>
      )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <div className="flex-1 bg-surface py-8 sm:py-12">
      <Container className="max-w-4xl">
        <Suspense
          fallback={
            <div className="space-y-4" aria-hidden="true">
              <div className="h-9 w-56 animate-pulse rounded bg-muted" />
              <div className="h-40 animate-pulse rounded-2xl bg-muted" />
            </div>
          }
        >
          <DashboardContent />
        </Suspense>
      </Container>
    </div>
  );
}
