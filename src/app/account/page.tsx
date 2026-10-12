import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, KeyRound, LogOut, Mail, Phone } from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";
import { initials, requireUser } from "@/lib/auth/session";
import { ProfileForm } from "@/components/account/profile-form";
import { FormAlert } from "@/components/auth/form-fields";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "My account",
  robots: { index: false },
};

const ROLE_LABELS = {
  CUSTOMER: "Customer",
  BUSINESS_OWNER: "Business owner",
  ADMIN: "Admin",
} as const;

const NOTICES: Record<string, string> = {
  password: "Your password has been updated.",
};

async function AccountContent({ searchParams }: Pick<PageProps<"/account">, "searchParams">) {
  const user = await requireUser("/account");
  const params = await searchParams;
  const notice = typeof params.updated === "string" ? NOTICES[params.updated] : undefined;
  const welcome = params.welcome === "1";
  const memberSince = new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric" }).format(
    user.createdAt,
  );

  return (
    <div className="space-y-6">
      {welcome && (
        <FormAlert status="success">
          Your email is confirmed. Welcome to CustomerHowFar, {user.fullName.split(" ")[0]}!
        </FormAlert>
      )}
      {notice && <FormAlert status="success">{notice}</FormAlert>}

      <Card>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
          <span
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xl font-bold text-white"
          >
            {initials(user.fullName)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{user.fullName}</h1>
              <Badge variant="brand">{ROLE_LABELS[user.role]}</Badge>
            </div>
            <dl className="mt-2 space-y-1 text-sm text-gray-700">
              <div className="flex items-center gap-2">
                <dt>
                  <Mail aria-hidden="true" className="size-4 text-gray-500" />
                  <span className="sr-only">Email</span>
                </dt>
                <dd className="min-w-0 break-all">{user.email}</dd>
              </div>
              {user.phone && (
                <div className="flex items-center gap-2">
                  <dt>
                    <Phone aria-hidden="true" className="size-4 text-gray-500" />
                    <span className="sr-only">Phone</span>
                  </dt>
                  <dd>{user.phone}</dd>
                </div>
              )}
              <div className="flex items-center gap-2">
                <dt>
                  <CalendarDays aria-hidden="true" className="size-4 text-gray-500" />
                  <span className="sr-only">Member since</span>
                </dt>
                <dd>Member since {memberSince}</dd>
              </div>
            </dl>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your details</CardTitle>
          <CardDescription>Update your name and phone number.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm fullName={user.fullName} phone={user.phone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Manage your password and sign out of this device.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/reset-password"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            <KeyRound aria-hidden="true" />
            Change password
          </Link>
          <form action={logoutAction}>
            <Button
              type="submit"
              variant="outline"
              size="lg"
              fullWidth
              className="text-red-700 hover:border-red-200 hover:bg-red-50"
            >
              <LogOut aria-hidden="true" />
              Log out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-32 animate-pulse rounded-xl bg-muted" />
      <div className="h-80 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <div className="flex-1 bg-surface py-8 sm:py-12">
      <Container className="max-w-3xl">
        <Suspense fallback={<AccountSkeleton />}>
          <AccountContent searchParams={searchParams} />
        </Suspense>
      </Container>
    </div>
  );
}
