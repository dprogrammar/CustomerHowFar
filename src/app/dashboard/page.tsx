import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Banknote,
  CircleAlert,
  CreditCard,
  Eye,
  Pencil,
  Plus,
  ShieldAlert,
  Store,
} from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getOwnerDashboard } from "@/lib/business/queries";
import {
  MAX_BUSINESSES_PER_USER,
  firstIncompleteStep,
  type BusinessStatus,
} from "@/lib/business/rules";
import { formatKobo } from "@/lib/payments/methods";
import { StatusBadge } from "@/components/business/status-badge";
import { CloudinaryImage } from "@/components/cloudinary-image";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "My businesses",
  robots: { index: false },
};

type DashboardBusiness = Awaited<ReturnType<typeof getOwnerDashboard>>[number];

function primaryAction(
  b: DashboardBusiness,
): { label: string; href: string; icon: typeof Pencil } | null {
  const status: BusinessStatus = b.status;
  switch (status) {
    case "DRAFT":
      return {
        label: "Continue setup",
        href: `/business/${b.id}/edit?step=${firstIncompleteStep(b.completeness)}`,
        icon: Pencil,
      };
    case "PENDING_PAYMENT":
      return { label: "Pay", href: `/business/${b.id}/pay`, icon: CreditCard };
    case "REJECTED":
      return { label: "Fix and resubmit", href: `/business/${b.id}/edit?step=1`, icon: Pencil };
    default:
      return null;
  }
}

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

function BusinessCardRow({ b }: { b: DashboardBusiness }) {
  const image = b.coverPublicId ?? b.photos[0]?.publicId ?? b.logoPublicId;
  const action = primaryAction(b);
  const editable = b.status !== "SUSPENDED";
  // Same URL for everyone; owners see a preview banner while the listing isn't live.
  const viewHref = `/business/${b.slug}`;

  return (
    <li className="overflow-hidden rounded-2xl border border-border bg-white shadow-card">
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
          {b.status === "PENDING_REVIEW" && (
            <p className="mt-3 text-sm text-gray-700">
              Our team is reviewing your listing. We&apos;ll email you.
            </p>
          )}
          {b.latestPayment && <PaymentSummary payment={b.latestPayment} />}

          <div className="mt-4 flex flex-wrap gap-2">
            {action && (
              <Link
                href={action.href}
                className={buttonVariants({
                  size: "md",
                  variant: b.status === "PENDING_PAYMENT" ? "accent" : "primary",
                })}
              >
                <action.icon aria-hidden="true" />
                {action.label}
                <span className="sr-only">: {b.name}</span>
              </Link>
            )}
            {editable && b.status !== "DRAFT" && b.status !== "REJECTED" && (
              <Link
                href={`/business/${b.id}/edit?step=1`}
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
        </div>
      </div>
    </li>
  );
}

async function DashboardContent() {
  const user = await requireUser("/dashboard");
  const businesses = await getOwnerDashboard(user.id);
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
            <BusinessCardRow key={b.id} b={b} />
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
