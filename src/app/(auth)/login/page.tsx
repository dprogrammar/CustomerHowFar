import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your CustomerHowFar account.",
  alternates: { canonical: "/login" },
};

const NOTICES: Record<string, string> = {
  link_invalid: "That link is invalid or has expired. Please log in, or request a new link.",
};

async function LoginFormWithParams({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  const error = typeof params.error === "string" ? NOTICES[params.error] : undefined;
  return <LoginForm next={next} notice={error} />;
}

async function SignupLink({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const next = safeRedirectPath((await searchParams).next);
  const href = next === "/account" ? "/signup" : `/signup?next=${encodeURIComponent(next)}`;
  return (
    <Link href={href} className="font-semibold text-brand-700 hover:underline">
      Create an account
    </Link>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthCard
      title="Welcome back"
      description="Log in to contact businesses, save favourites and manage your account."
      // social={<GoogleSignInButton />}  (next step)
      footer={
        <>
          New to CustomerHowFar?{" "}
          <Suspense
            fallback={
              <Link href="/signup" className="font-semibold text-brand-700 hover:underline">
                Create an account
              </Link>
            }
          >
            <SignupLink searchParams={searchParams} />
          </Suspense>
        </>
      }
    >
      <Suspense fallback={<LoginForm next="/account" />}>
        <LoginFormWithParams searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}
