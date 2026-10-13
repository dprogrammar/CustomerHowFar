import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { STATUS_META, type BusinessStatus } from "@/lib/business/rules";
import {
  ID_TYPE_LABELS,
  IDENTITY_STATE_LABELS,
  RETENTION_DAYS,
  type IdentityState,
} from "@/lib/identity/rules";
import { getAdminIdentity } from "@/lib/identity/server";
import { IdentityImages } from "@/components/admin/identity-images";
import { IdentityReviewPanel } from "@/components/admin/identity-review-panel";
import { IdentityStatusBadge } from "@/components/admin/identity-status-badge";

export const metadata: Metadata = { title: "Identity check", referrer: "no-referrer" };

const dateTime = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Lagos",
});

const HISTORY_LABELS: Record<string, string> = {
  ...IDENTITY_STATE_LABELS,
  WITHDRAWN: "Withdrawn by owner",
  SUPERSEDED: "Replaced by a newer submission",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className="text-sm break-words text-gray-900">
        {children ?? <span className="text-gray-500">Not recorded</span>}
      </dd>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `card-${title.toLowerCase().replace(/\W+/g, "-")}`;
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

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");

async function Detail({ params }: PageProps<"/admin/identity/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const { v, history } = await getAdminIdentity(id);
  const isActive = ["PENDING", "APPROVED", "REJECTED"].includes(v.status);
  const badgeState: IdentityState = isActive ? (v.status as IdentityState) : "NONE";
  const base = `/admin/identity/${v.id}/image`;
  const images = v.imagesDeletedAt
    ? []
    : [
        ...(v.idFrontPublicId ? [{ src: `${base}/front`, label: "ID photo" }] : []),
        ...(v.selfiePublicId ? [{ src: `${base}/selfie`, label: "Selfie holding the ID" }] : []),
        ...(v.idBackPublicId ? [{ src: `${base}/back`, label: "Back of ID" }] : []),
      ];
  const accountName = v.user?.fullName ?? null;
  const namesMatch = accountName !== null && normalize(accountName) === normalize(v.fullNameOnId);

  return (
    <>
      <Link
        href="/admin/identity"
        className="mb-3 inline-flex items-center gap-1.5 rounded text-sm font-medium text-gray-700 hover:text-gray-900"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to identity checks
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          {accountName ?? "Deleted account"}
        </h1>
        {isActive ? (
          <IdentityStatusBadge state={badgeState} />
        ) : (
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
            {HISTORY_LABELS[v.status]}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="order-2 space-y-5 xl:order-1">
          <Card title="Photos">
            {images.length > 0 ? (
              <>
                <IdentityImages images={images} />
                <p className="mt-2 text-xs text-gray-600">
                  Private files. Links expire after 5 minutes. Deleted {RETENTION_DAYS} days after
                  review. Don&apos;t download or share them.
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-700">
                {v.imagesDeletedAt
                  ? `Photos deleted on ${dateTime.format(v.imagesDeletedAt)} (retention policy).`
                  : "No photos."}
              </p>
            )}
          </Card>

          <Card title="Names">
            <dl className="divide-y divide-border">
              <Field label="Typed by owner (as on ID)">{v.fullNameOnId}</Field>
              <Field label="Account name">
                {accountName && (
                  <>
                    {accountName}{" "}
                    <span
                      className={namesMatch ? "text-brand-700" : "font-semibold text-accent-800"}
                    >
                      ({namesMatch ? "matches" : "different, check carefully"})
                    </span>
                  </>
                )}
              </Field>
              <Field label="Read on ID by admin">{v.nameReadByAdmin}</Field>
            </dl>
          </Card>

          <Card title="Details">
            <dl className="divide-y divide-border">
              <Field label="ID type">{ID_TYPE_LABELS[v.idType] ?? v.idType}</Field>
              <Field label="Submitted">{dateTime.format(v.submittedAt)}</Field>
              <Field label="Consent given">{dateTime.format(v.consentGivenAt)}</Field>
              {v.reviewedAt && (
                <Field label="Reviewed by">
                  {v.reviewedBy?.fullName ?? "Former admin"} · {dateTime.format(v.reviewedAt)}
                </Field>
              )}
              {v.rejectionReason && (
                <Field label="Rejection reason">
                  <span className="whitespace-pre-line">{v.rejectionReason}</span>
                </Field>
              )}
            </dl>
          </Card>

          <Card title="Submission history">
            {history.length === 0 ? (
              <p className="text-sm text-gray-600">No other submissions.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <Link
                      href={`/admin/identity/${h.id}`}
                      className="font-medium text-brand-700 underline"
                    >
                      {dateTime.format(h.submittedAt)} · {ID_TYPE_LABELS[h.idType] ?? h.idType}
                    </Link>
                    <span className="text-gray-700">
                      {HISTORY_LABELS[h.status] ?? h.status}
                      {h.rejectionReason ? `: ${h.rejectionReason.split("\n")[0]}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="order-1 space-y-5 xl:order-2">
          {v.status === "PENDING" && <IdentityReviewPanel verificationId={v.id} />}
          <Card title="Owner">
            {v.user ? (
              <dl className="divide-y divide-border">
                <Field label="Email">
                  <span className="break-all">{v.user.email}</span>
                </Field>
                <Field label="Phone">{v.user.phone}</Field>
                <Field label="Joined">{dateTime.format(v.user.createdAt)}</Field>
              </dl>
            ) : (
              <p className="text-sm text-gray-600">The account was deleted.</p>
            )}
          </Card>
          <Card title="Businesses">
            {!v.user || v.user.businesses.length === 0 ? (
              <p className="text-sm text-gray-600">No businesses.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {v.user.businesses.map((b) => (
                  <li key={b.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <Link
                      href={`/admin/listings/${b.id}`}
                      className="font-medium text-brand-700 underline"
                    >
                      {b.name}
                    </Link>
                    <span className="text-gray-700">
                      {STATUS_META[b.status as BusinessStatus]?.label ?? b.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

export default function AdminIdentityDetailPage(props: PageProps<"/admin/identity/[id]">) {
  return (
    <Suspense
      fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
    >
      <Detail {...props} />
    </Suspense>
  );
}
