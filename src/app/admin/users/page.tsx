import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { listAdminUsers, parseUserFilters, type UserFilters } from "@/lib/admin/user-queries";
import { requireAdmin } from "@/lib/auth/session";
import { IdentityStatusBadge } from "@/components/admin/identity-status-badge";
import { UserRoleBadge, UserStatusBadge } from "@/components/admin/user-badges";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

export const metadata: Metadata = { title: "Users" };

const dateFmt = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Lagos",
});

function hrefFor(f: UserFilters, page: number) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.role) p.set("role", f.role);
  if (f.status) p.set("status", f.status);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return `/admin/users${s ? `?${s}` : ""}`;
}

async function Users({ searchParams }: Pick<PageProps<"/admin/users">, "searchParams">) {
  await requireAdmin();
  const f = parseUserFilters(await searchParams);
  const result = await listAdminUsers(f);

  return (
    <>
      <form
        method="get"
        action="/admin/users"
        role="search"
        aria-label="Search users"
        className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_10rem_auto] sm:items-end"
      >
        <div>
          <Label htmlFor="user-search">Search</Label>
          <Input
            id="user-search"
            name="q"
            type="search"
            defaultValue={f.q}
            placeholder="Name, email or phone"
            icon={<Search />}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:contents">
          <div>
            <Label htmlFor="user-role">Role</Label>
            <Select id="user-role" name="role" defaultValue={f.role ?? ""}>
              <option value="">All roles</option>
              <option value="CUSTOMER">Customer</option>
              <option value="BUSINESS_OWNER">Business owner</option>
              <option value="ADMIN">Admin</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="user-status">Status</Label>
            <Select id="user-status" name="status" defaultValue={f.status ?? ""}>
              <option value="">All</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
            </Select>
          </div>
        </div>
        <Button type="submit" size="lg">
          Apply
        </Button>
      </form>

      <p className="mb-3 text-sm text-gray-700" aria-live="polite">
        {result.total === 0
          ? "No users match."
          : `${result.total} user${result.total === 1 ? "" : "s"}, newest first.`}
      </p>

      <ul className="space-y-3">
        {result.items.map((u) => (
          <li key={u.id}>
            <Link
              href={`/admin/users/${u.id}`}
              className="block rounded-xl border border-border bg-white p-4 shadow-card transition hover:border-brand-200 hover:shadow-raised"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-gray-900">{u.fullName}</span>
                <UserRoleBadge role={u.role} />
                <UserStatusBadge status={u.status} />
              </span>
              <span className="mt-0.5 block truncate text-sm text-gray-700">{u.email}</span>
              <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-700">
                <span>
                  {u._count.businesses} business{u._count.businesses === 1 ? "" : "es"}
                </span>
                <IdentityStatusBadge state={u.idState} />
                <span>Joined {dateFmt.format(u.createdAt)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {result.pageCount > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-3">
          {result.page > 1 ? (
            <Link
              href={hrefFor(f, result.page - 1)}
              className={buttonVariants({ variant: "outline" })}
            >
              <ChevronLeft aria-hidden="true" />
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-gray-700">
            Page {result.page} of {result.pageCount}
          </span>
          {result.page < result.pageCount ? (
            <Link
              href={hrefFor(f, result.page + 1)}
              className={buttonVariants({ variant: "outline" })}
            >
              Next
              <ChevronRight aria-hidden="true" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}

export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <>
      <h1 className="mb-5 text-2xl font-bold tracking-tight text-gray-900">Users</h1>
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
      >
        <Users searchParams={searchParams} />
      </Suspense>
    </>
  );
}
