"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

/** Back / "Save and continue" bar shared by the wizard steps. Sticky on phones. */
export function WizardNav({
  backHref,
  pending,
  nextLabel = "Save & continue",
}: {
  backHref?: string;
  pending: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="sticky bottom-[calc(var(--spacing-bottom-nav)+env(safe-area-inset-bottom))] z-10 -mx-4 mt-8 flex gap-3 border-t border-border bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 md:bottom-0">
      {backHref && (
        <Link
          href={backHref}
          className={buttonVariants({ variant: "outline", size: "lg", className: "px-4 sm:px-6" })}
        >
          <ArrowLeft aria-hidden="true" />
          Back
        </Link>
      )}
      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="min-w-0 flex-1 px-4 sm:flex-none sm:px-8"
      >
        {pending ? (
          <>
            <LoaderCircle aria-hidden="true" className="animate-spin" />
            Saving...
          </>
        ) : (
          <>
            {nextLabel}
            <ArrowRight aria-hidden="true" />
          </>
        )}
      </Button>
    </div>
  );
}
