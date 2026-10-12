import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/container";

/** Page frame for the listing wizard and related pages. */
export function WizardFrame({
  title,
  description,
  children,
  backToDashboard = true,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  backToDashboard?: boolean;
}) {
  return (
    <div className="flex-1 bg-surface py-6 sm:py-10">
      <Container className="max-w-3xl">
        {backToDashboard && (
          <Link
            href="/dashboard"
            className="mb-4 inline-flex items-center gap-1.5 rounded text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            My businesses
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{title}</h1>
        {description && (
          <div className="mt-1.5 text-sm text-gray-700 sm:text-base">{description}</div>
        )}
        <div className="mt-6 rounded-2xl border border-border bg-white p-4 shadow-card sm:p-8">
          {children}
        </div>
      </Container>
    </div>
  );
}

export function WizardSkeleton() {
  return (
    <div className="flex-1 bg-surface py-6 sm:py-10" aria-hidden="true">
      <Container className="max-w-3xl space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </Container>
    </div>
  );
}
