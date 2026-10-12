"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import type { FormState } from "@/lib/auth/actions";
import { submitBusinessAction } from "@/lib/business/actions";
import { FormAlert, SubmitButton } from "@/components/auth/form-fields";
import { buttonVariants } from "@/components/ui/button";

const initialState: FormState = { status: "idle" };

/** Terms checkbox + submit. The server decides what happens next (review or payment). */
export function SubmitListingForm({
  businessId,
  resubmit,
  disabled,
}: {
  businessId: string;
  resubmit: boolean;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    submitBusinessAction.bind(null, businessId),
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.status === "error" && state.message && (
        <FormAlert status="error">{state.message}</FormAlert>
      )}
      <div>
        <label className="flex items-start gap-3 text-sm text-gray-800">
          <input
            type="checkbox"
            name="acceptTerms"
            className="mt-0.5 size-5 shrink-0 rounded border-gray-300 accent-brand-600"
            aria-invalid={state.fieldErrors?.acceptTerms ? true : undefined}
            aria-describedby={state.fieldErrors?.acceptTerms ? "terms-error" : undefined}
          />
          <span>
            I confirm this information is true, the photos show my own work, and I agree to the{" "}
            <Link href="/terms" className="font-medium text-brand-700 underline underline-offset-2">
              listing terms
            </Link>
            .
          </span>
        </label>
        {state.fieldErrors?.acceptTerms && (
          <p id="terms-error" className="mt-1.5 text-sm text-red-700">
            {state.fieldErrors.acceptTerms[0]}
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <Link
          href={`/business/${businessId}/edit?step=4`}
          className={buttonVariants({ variant: "outline", size: "lg", className: "px-4 sm:px-6" })}
        >
          <ArrowLeft aria-hidden="true" />
          Back
        </Link>
        <SubmitButton
          pending={pending}
          pendingText="Submitting..."
          disabled={disabled || pending}
          className="min-w-0 flex-1 px-4 sm:w-auto sm:flex-none sm:px-8"
        >
          <Send aria-hidden="true" />
          {resubmit ? "Resubmit" : "Submit"}
          <span className="sr-only sm:not-sr-only"> for review</span>
        </SubmitButton>
      </div>
    </form>
  );
}
