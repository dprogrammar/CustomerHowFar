import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { AuthCard } from "@/components/auth/auth-card";
import { FormAlert } from "@/components/auth/form-fields";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false },
};

/** Reached from the reset email (via /auth/callback) or from "Change password" on /account. */
async function ResetPasswordContent() {
  const session = await getSessionUser();
  if (!session) {
    return (
      <div className="space-y-4">
        <FormAlert status="error">
          Your reset link has expired or has already been used. Request a new one to continue.
        </FormAlert>
        <Link href="/forgot-password" className={buttonVariants({ size: "lg", fullWidth: true })}>
          Request a new link
        </Link>
      </div>
    );
  }
  return <ResetPasswordForm />;
}

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Set a new password"
      description="Choose a strong password you don't use elsewhere."
    >
      <Suspense
        fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" aria-hidden="true" />}
      >
        <ResetPasswordContent />
      </Suspense>
    </AuthCard>
  );
}
