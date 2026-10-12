import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Create an account",
  description:
    "Join CustomerHowFar to find and contact trusted artisans and businesses in Nigeria.",
  alternates: { canonical: "/signup" },
};

async function SignupFormWithParams({ searchParams }: Pick<PageProps<"/signup">, "searchParams">) {
  const next = safeRedirectPath((await searchParams).next);
  return <SignupForm next={next} />;
}

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <AuthCard
      title="Create your account"
      description="It's free and takes less than a minute."
      // social={<GoogleSignInButton />}  (next step)
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand-700 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <Suspense fallback={<SignupForm next="/account" />}>
        <SignupFormWithParams searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}
