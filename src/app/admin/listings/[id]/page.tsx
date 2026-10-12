import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, TriangleAlert } from "lucide-react";
import { getAdminBusiness } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { DAYS, formatNaira, type BusinessStatus, type OpeningHours } from "@/lib/business/rules";
import { cloudinaryUrl } from "@/lib/images";
import { ModerationPanel } from "@/components/admin/moderation-panel";
import { StatusBadge } from "@/components/business/status-badge";
import { CloudinaryImage } from "@/components/cloudinary-image";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Listing" };

const dateTime = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dateOnly = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const ACTION_LABELS: Record<string, string> = {
  APPROVED: "Approved",
  REJECTED: "Changes requested",
  SUSPENDED: "Suspended",
  REINSTATED: "Reinstated",
  RECHECKED: "Marked as re-checked",
  VERIFIED: "Verified badge added",
  UNVERIFIED: "Verified badge removed",
  FEATURED: "Featured",
  UNFEATURED: "Unfeatured",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `section-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section
      aria-labelledby={id}
      className="rounded-xl border border-border bg-white p-4 shadow-card sm:p-5"
    >
      <h2 id={id} className="mb-3 text-base font-semibold text-gray-900">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className="text-sm break-words text-gray-900">
        {children ?? <span className="text-gray-500">Not provided</span>}
      </dd>
    </div>
  );
}

function ExternalLinkOrEmpty({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex items-center gap-1 text-brand-700 underline"
    >
      {href}
      <ExternalLink aria-hidden="true" className="size-3.5" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

async function Detail({ params }: PageProps<"/admin/listings/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const { business: b, duplicates, hasPaid } = await getAdminBusiness(id);
  const status = b.status as BusinessStatus;
  const hours = b.openingHours as OpeningHours | null;
  const fullSize = (publicId: string) => cloudinaryUrl(publicId, { width: 2000 });

  return (
    <>
      <Link
        href="/admin/listings?tab=review"
        className="mb-3 inline-flex items-center gap-1.5 rounded text-sm font-medium text-gray-700 hover:text-gray-900"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to listings
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{b.name}</h1>
        <StatusBadge status={status} />
        {b.needsRecheck && <Badge variant="accent">Edited since approval</Badge>}
        {b.isVerified && <Badge variant="verified">Verified</Badge>}
        {b.isFeatured && <Badge variant="accent">Featured</Badge>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="order-2 space-y-5 xl:order-1">
          {duplicates.length > 0 && (
            <div
              role="alert"
              className="rounded-xl bg-accent-50 p-4 text-sm text-accent-900 ring-1 ring-accent-200"
            >
              <p className="flex items-center gap-2 font-semibold">
                <TriangleAlert aria-hidden="true" className="size-4" />
                This phone or WhatsApp number is used by {duplicates.length} other business
                {duplicates.length > 1 ? "es" : ""}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {duplicates.map((d) => (
                  <li key={d.id}>
                    <Link href={`/admin/listings/${d.id}`} className="underline">
                      {d.name}
                    </Link>{" "}
                    ({d.status.toLowerCase().replace("_", " ")}, owner {d.owner.email})
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Section title="Business">
            <dl className="divide-y divide-border">
              <Field label="Category">{b.category.name}</Field>
              <Field label="Tagline">{b.tagline}</Field>
              <Field label="Phone">
                <a href={`tel:${b.phone}`} className="text-brand-700 underline">
                  {b.phone}
                </a>
              </Field>
              <Field label="WhatsApp">
                <a
                  href={`https://wa.me/${b.whatsappNumber.replace("+", "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 underline"
                >
                  {b.whatsappNumber}
                </a>
              </Field>
              <Field label="Email">{b.email}</Field>
              <Field label="Years of experience">{b.yearsOfExperience}</Field>
              <Field label="Slug">{b.slug}</Field>
            </dl>
          </Section>

          <Section title="Location">
            <dl className="divide-y divide-border">
              <Field label="Address">{b.address}</Field>
              <Field label="Area / landmark">{b.area}</Field>
              <Field label="LGA">{b.lga?.name}</Field>
              <Field label="State">{b.state?.name}</Field>
            </dl>
          </Section>

          <Section title="About">
            <dl className="divide-y divide-border">
              <Field label="Description">
                {b.description && <span className="whitespace-pre-line">{b.description}</span>}
              </Field>
              <Field label="Services">{b.services.length > 0 ? b.services.join(", ") : null}</Field>
              <Field label="Opening hours">
                {hours ? (
                  <ul>
                    {DAYS.map(({ key, label }) => (
                      <li key={key}>
                        {label}:{" "}
                        {hours[key] ? `${hours[key]!.open} - ${hours[key]!.close}` : "Closed"}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Field>
              <Field label="Instagram">
                <ExternalLinkOrEmpty href={b.instagramUrl} />
              </Field>
              <Field label="Facebook">
                <ExternalLinkOrEmpty href={b.facebookUrl} />
              </Field>
              <Field label="TikTok">
                <ExternalLinkOrEmpty href={b.tiktokUrl} />
              </Field>
              <Field label="Website">
                <ExternalLinkOrEmpty href={b.websiteUrl} />
              </Field>
            </dl>
          </Section>

          <Section
            title={`Photos (${b.photos.length} work photo${b.photos.length === 1 ? "" : "s"})`}
          >
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ...(b.logoPublicId
                  ? [{ key: "logo", publicId: b.logoPublicId, label: "Logo" }]
                  : []),
                ...(b.coverPublicId
                  ? [{ key: "cover", publicId: b.coverPublicId, label: "Cover photo" }]
                  : []),
                ...b.photos.map((p, i) => ({
                  key: p.id,
                  publicId: p.publicId,
                  label: p.caption || `Work photo ${i + 1}`,
                })),
              ].map((photo) => (
                <li key={photo.key}>
                  <a
                    href={fullSize(photo.publicId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block overflow-hidden rounded-lg ring-1 ring-border"
                  >
                    <span className="relative block aspect-square bg-muted">
                      <CloudinaryImage
                        publicId={photo.publicId}
                        alt=""
                        fill
                        sizes="(min-width: 640px) 200px, 50vw"
                        className="object-cover"
                      />
                    </span>
                    <span className="block truncate px-2 py-1.5 text-xs text-gray-800 group-hover:underline">
                      {photo.label}
                      <span className="sr-only"> (view full size, opens in a new tab)</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            {!b.logoPublicId && !b.coverPublicId && b.photos.length === 0 && (
              <p className="text-sm text-gray-600">No photos uploaded.</p>
            )}
          </Section>

          <Section title="Payments">
            <p className="mb-3 text-sm text-gray-800">
              Fee required at submission:{" "}
              <strong>{b.feeRequiredAtSubmit ? "Yes" : "No (free)"}</strong>
              {" · "}Paid: <strong>{hasPaid ? "Yes" : "No"}</strong>
            </p>
            {b.payments.length === 0 ? (
              <p className="text-sm text-gray-600">No payment attempts.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {b.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      {formatNaira(p.amountKobo / 100)} ·{" "}
                      <span className="font-medium">{p.status}</span>
                      <span className="block text-xs text-gray-600">Ref {p.reference}</span>
                    </span>
                    <span className="text-gray-700">
                      {dateTime.format(p.paidAt ?? p.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Moderation history">
            {b.moderationDecisions.length === 0 ? (
              <p className="text-sm text-gray-600">No decisions yet.</p>
            ) : (
              <ol className="relative space-y-4 border-l-2 border-border pl-5">
                {b.moderationDecisions.map((d) => (
                  <li key={d.id} className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute top-1.5 -left-[1.6rem] size-3 rounded-full bg-brand-600 ring-4 ring-white"
                    />
                    <p className="text-sm font-semibold text-gray-900">
                      {ACTION_LABELS[d.action] ?? d.action}
                    </p>
                    <p className="text-xs text-gray-600">
                      {dateTime.format(d.createdAt)} · {d.admin?.fullName ?? "Former admin"}
                    </p>
                    {d.comment && (
                      <p className="mt-1 text-sm whitespace-pre-line text-gray-800">{d.comment}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        <div className="order-1 space-y-5 xl:order-2">
          <div className="xl:sticky xl:top-[calc(var(--spacing-header)+1rem)]">
            <ModerationPanel
              businessId={b.id}
              businessName={b.name}
              status={status}
              needsRecheck={b.needsRecheck}
              isVerified={b.isVerified}
              isFeatured={b.isFeatured}
              paymentBlocksApproval={b.feeRequiredAtSubmit && !hasPaid}
            />
          </div>
          <Section title="Owner">
            <dl className="divide-y divide-border">
              <Field label="Name">{b.owner.fullName}</Field>
              <Field label="Email">
                <span className="break-all">{b.owner.email}</span>
              </Field>
              <Field label="Phone">{b.owner.phone}</Field>
              <Field label="Joined">{dateOnly.format(b.owner.createdAt)}</Field>
            </dl>
          </Section>
          <Section title="Timeline">
            <dl className="divide-y divide-border">
              <Field label="Created">{dateTime.format(b.createdAt)}</Field>
              <Field label="Submitted">
                {b.submittedAt ? dateTime.format(b.submittedAt) : null}
              </Field>
              <Field label="First published">
                {b.publishedAt ? dateTime.format(b.publishedAt) : null}
              </Field>
              <Field label="Last updated">{dateTime.format(b.updatedAt)}</Field>
            </dl>
          </Section>
        </div>
      </div>
    </>
  );
}

export default function AdminListingPage(props: PageProps<"/admin/listings/[id]">) {
  return (
    <Suspense
      fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
    >
      <Detail {...props} />
    </Suspense>
  );
}
