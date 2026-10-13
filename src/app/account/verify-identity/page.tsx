import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Clock3,
  EyeOff,
  IdCard,
  Trash2,
  Users,
} from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { ID_TYPE_LABELS, MAX_SUBMISSIONS_PER_DAY, RETENTION_DAYS } from "@/lib/identity/rules";
import { countRecentSubmissions, getIdentityState } from "@/lib/identity/server";
import { IdentityForm } from "@/components/identity/identity-form";
import { WithdrawIdentityButton } from "@/components/identity/withdraw-button";
import { FormAlert } from "@/components/auth/form-fields";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Verify your identity",
  robots: { index: false },
};

const dateFmt = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Africa/Lagos",
});

function Intro() {
  const points = [
    {
      icon: Users,
      title: "Why we ask",
      text: "To keep CustomerHowFar safe and trusted. Customers can see that a real person stands behind each business.",
    },
    {
      icon: EyeOff,
      title: "Who sees your photos",
      text: "Only the CustomerHowFar admin team. They are never shown to customers, and you won't see them again after you submit.",
    },
    {
      icon: Trash2,
      title: "How long we keep them",
      text: `Your ID photo and selfie are deleted ${RETENTION_DAYS} days after our review. We keep only a record that the check was done.`,
    },
    {
      icon: IdCard,
      title: "What this check is",
      text: "A visual check by our team, not a government check. We never ask for your ID number.",
    },
  ];
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {points.map(({ icon: Icon, title, text }) => (
        <li key={title} className="flex gap-3 rounded-xl border border-border bg-white p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-gray-900">{title}</span>
            <span className="mt-0.5 block text-sm text-gray-700">{text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

async function Status() {
  const user = await requireUser("/account/verify-identity");
  const { state, latest } = await getIdentityState(user.id);
  const recent = await countRecentSubmissions(user.id);
  const remaining = Math.max(0, MAX_SUBMISSIONS_PER_DAY - recent);

  if (state === "APPROVED") {
    return (
      <Card>
        <CardContent className="flex gap-3 p-5">
          <CircleCheck aria-hidden="true" className="size-6 shrink-0 text-brand-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Status: Accepted</h2>
            <p className="mt-1 text-sm text-gray-700">
              Thank you. Our team has checked your ID. Your approved listings show an &ldquo;ID
              submitted&rdquo; badge.
            </p>
            <Link
              href="/dashboard"
              className={buttonVariants({ variant: "outline", className: "mt-4" })}
            >
              Go to my businesses
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state === "PENDING" && latest) {
    return (
      <Card>
        <CardContent className="flex gap-3 p-5">
          <Clock3 aria-hidden="true" className="size-6 shrink-0 text-accent-700" />
          <div className="min-w-0 space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Status: Pending review</h2>
              <p className="mt-1 text-sm text-gray-700">
                You submitted your {ID_TYPE_LABELS[latest.idType] ?? "ID"} on{" "}
                {dateFmt.format(latest.submittedAt)}. We&apos;ll email you when our team has checked
                it, usually within 1 to 2 working days.
              </p>
            </div>
            <WithdrawIdentityButton />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {state === "REJECTED" && latest ? (
        <FormAlert status="error">
          <p className="font-semibold">Status: Rejected</p>
          <p className="mt-1">We couldn&apos;t accept your last submission:</p>
          <p className="mt-1 font-medium whitespace-pre-line">{latest.rejectionReason}</p>
          <p className="mt-2">Please submit again below.</p>
        </FormAlert>
      ) : (
        <p className="flex items-center gap-2 text-sm font-medium text-gray-800">
          <CircleAlert aria-hidden="true" className="size-4 text-gray-500" />
          Status: Not submitted
        </p>
      )}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <h2 className="sr-only">{state === "REJECTED" ? "Submit again" : "Submit your ID"}</h2>
          <IdentityForm accountName={user.fullName} remainingToday={remaining} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyIdentityPage() {
  return (
    <div className="flex-1 bg-surface py-8 sm:py-12">
      <Container className="max-w-3xl space-y-6">
        <Link
          href="/account"
          className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          My account
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Verify your identity
          </h1>
          <p className="mt-2 text-base text-gray-700">
            Business owners share a photo of a government ID and a selfie holding it. It takes about
            2 minutes.
          </p>
        </div>
        <Intro />
        <Suspense
          fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
        >
          <Status />
        </Suspense>
      </Container>
    </div>
  );
}
