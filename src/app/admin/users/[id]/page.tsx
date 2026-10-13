import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAdminUser } from "@/lib/admin/user-queries";
import { requireAdmin } from "@/lib/auth/session";
import { STATUS_META, type BusinessStatus } from "@/lib/business/rules";
import { IDENTITY_STATE_LABELS } from "@/lib/identity/rules";
import { METHOD_LABELS, PAYMENT_STATUS_LABELS, formatKobo } from "@/lib/payments/methods";
import { IdentityStatusBadge } from "@/components/admin/identity-status-badge";
import { UserActionsPanel } from "@/components/admin/user-actions-panel";
import { UserRoleBadge, UserStatusBadge } from "@/components/admin/user-badges";

export const metadata: Metadata = { title: "User" };

const dateTime = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Lagos",
});

const AUDIT_LABELS: Record<string, string> = {
  USER_SUSPENDED: "Suspended",
  USER_UNSUSPENDED: "Unsuspended",
  USER_ROLE_CHANGED: "Role changed",
  USER_DELETED: "Account deleted",
  USER_SELF_DELETED: "Deleted their account",
  BUSINESS_DELETED: "Business deleted by an admin",
  BUSINESS_SELF_DELETED: "Business deleted by the owner",
};

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className="text-sm break-words text-gray-900">
        {children ?? <span className="text-gray-500">Not provided</span>}
      </dd>
    </div>
  );
}

async function Detail({ params }: PageProps<"/admin/users/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const { user: u, identity, history, activeAdmins } = await getAdminUser(id);
  const status = u.status as "ACTIVE" | "SUSPENDED";

  return (
    <>
      <Link
        href="/admin/users"
        className="mb-3 inline-flex items-center gap-1.5 rounded text-sm font-medium text-gray-700 hover:text-gray-900"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to users
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{u.fullName}</h1>
        <UserRoleBadge role={u.role} />
        <UserStatusBadge status={u.status} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="order-2 space-y-5 xl:order-1">
          {status === "SUSPENDED" && (
            <div
              role="note"
              className="rounded-xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200"
            >
              <p className="font-semibold">
                Suspended{u.suspendedAt ? ` on ${dateTime.format(u.suspendedAt)}` : ""}
              </p>
              {u.suspensionReason && (
                <p className="mt-1 whitespace-pre-line">{u.suspensionReason}</p>
              )}
            </div>
          )}

          <Card title="Profile">
            <dl className="divide-y divide-border">
              <Field label="Email">
                <span className="break-all">{u.email}</span>
              </Field>
              <Field label="Phone">{u.phone}</Field>
              <Field label="Joined">{dateTime.format(u.createdAt)}</Field>
              <Field label="ID check">
                <span className="inline-flex flex-wrap items-center gap-2">
                  <IdentityStatusBadge state={identity.state} />
                  {identity.latest && (
                    <Link
                      href={`/admin/identity/${identity.latest.id}`}
                      className="text-brand-700 underline"
                    >
                      Open ID check
                      <span className="sr-only"> ({IDENTITY_STATE_LABELS[identity.state]})</span>
                    </Link>
                  )}
                </span>
              </Field>
            </dl>
          </Card>

          <Card title={`Businesses (${u.businesses.length})`}>
            {u.businesses.length === 0 ? (
              <p className="text-sm text-gray-600">No businesses.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {u.businesses.map((b) => (
                  <li key={b.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <Link
                      href={`/admin/listings/${b.id}`}
                      className="font-medium text-brand-700 underline"
                    >
                      {b.name}
                    </Link>
                    <span className="text-gray-700">
                      {STATUS_META[b.status as BusinessStatus]?.label ?? b.status}
                      {b.statusBeforeUserSuspension
                        ? ` (was ${STATUS_META[b.statusBeforeUserSuspension as BusinessStatus]?.label.toLowerCase()})`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Payments (${u.payments.length})`}>
            {u.payments.length === 0 ? (
              <p className="text-sm text-gray-600">No payments.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {u.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      <Link
                        href={`/admin/payments/${p.id}`}
                        className="font-mono text-brand-700 underline"
                      >
                        {p.reference}
                      </Link>
                      <span className="block text-xs text-gray-700">
                        {p.business.name} · {METHOD_LABELS[p.provider] ?? p.provider}
                      </span>
                    </span>
                    <span className="text-gray-700">
                      {formatKobo(p.amountKobo)} · {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Account history">
            {history.length === 0 ? (
              <p className="text-sm text-gray-600">No admin actions yet.</p>
            ) : (
              <ol className="relative space-y-4 border-l-2 border-border pl-5">
                {history.map((h) => (
                  <li key={h.id} className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute top-1.5 -left-[1.6rem] size-3 rounded-full bg-brand-600 ring-4 ring-white"
                    />
                    <p className="text-sm font-semibold text-gray-900">
                      {AUDIT_LABELS[h.action] ?? h.action}
                      {h.summary ? `: ${h.summary}` : ""}
                    </p>
                    <p className="text-xs text-gray-600">
                      {dateTime.format(h.createdAt)} · {h.actor?.fullName ?? "Former user"}
                    </p>
                    {h.reason && (
                      <p className="mt-1 text-sm whitespace-pre-line text-gray-800">{h.reason}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="order-1 xl:order-2">
          <div className="xl:sticky xl:top-[calc(var(--spacing-header)+1rem)]">
            <UserActionsPanel
              userId={u.id}
              name={u.fullName}
              role={u.role}
              status={status}
              isSelf={u.id === admin.id}
              isLastAdmin={u.role === "ADMIN" && u.status === "ACTIVE" && activeAdmins <= 1}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export default function AdminUserPage(props: PageProps<"/admin/users/[id]">) {
  return (
    <Suspense
      fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
    >
      <Detail {...props} />
    </Suspense>
  );
}
