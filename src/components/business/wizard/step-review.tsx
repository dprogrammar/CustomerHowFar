"use client";

import { useActionState, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, IdCard, Send } from "lucide-react";
import type { FormState } from "@/lib/auth/actions";
import { submitBusinessAction } from "@/lib/business/actions";
import type { IdentityState } from "@/lib/identity/rules";
import { FormAlert, SubmitButton } from "@/components/auth/form-fields";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const initialState: FormState = { status: "idle" };

/** Shown on the Review step when the owner hasn't submitted an ID (or it was rejected). */
function IdentityNote({ state }: { state: IdentityState }) {
  if (state === "APPROVED" || state === "PENDING") return null;
  return (
    <div className="flex gap-3 rounded-xl bg-accent-50 p-4 text-sm text-accent-900 ring-1 ring-accent-200">
      <IdCard aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <p>
        <strong className="font-semibold">
          {state === "REJECTED"
            ? "Please submit your ID again."
            : "One more thing: verify your identity."}
        </strong>{" "}
        Our team can only approve your listing after checking a photo of your government ID and a
        selfie. You can submit your listing now and{" "}
        <Link
          href="/account/verify-identity"
          className="font-semibold underline underline-offset-2"
        >
          verify your identity
        </Link>{" "}
        straight after.
      </p>
    </div>
  );
}

/** Terms checkbox + submit. The server decides what happens next (review or payment). */
export function SubmitListingForm({
  businessId,
  resubmit,
  disabled,
  idState = "APPROVED",
}: {
  businessId: string;
  resubmit: boolean;
  disabled: boolean;
  /** The owner's ID check; prompts before submitting if no ID has been submitted. */
  idState?: IdentityState;
}) {
  const [state, formAction, pending] = useActionState(
    submitBusinessAction.bind(null, businessId),
    initialState,
  );
  const form = useRef<HTMLFormElement>(null);
  const [prompt, setPrompt] = useState(false);
  const confirmed = useRef(false);
  const needsPrompt = idState === "NONE" || idState === "REJECTED";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (needsPrompt && !confirmed.current) {
      event.preventDefault();
      setPrompt(true);
    }
  }

  return (
    <div className="space-y-4">
      <IdentityNote state={idState} />
      <form ref={form} action={formAction} onSubmit={onSubmit} className="space-y-4" noValidate>
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
              <Link
                href="/terms"
                className="font-medium text-brand-700 underline underline-offset-2"
              >
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
            className={buttonVariants({
              variant: "outline",
              size: "lg",
              className: "px-4 sm:px-6",
            })}
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
      <ConfirmDialog
        open={prompt}
        onClose={() => setPrompt(false)}
        title="You haven't verified your identity yet"
        description="We can only approve your listing after our team has checked your ID and a selfie. You can submit now and verify straight after, or verify first."
        confirmLabel="Submit anyway"
        onConfirm={() => {
          confirmed.current = true;
          setPrompt(false);
          form.current?.requestSubmit();
        }}
      >
        <Link
          href="/account/verify-identity"
          className={buttonVariants({ variant: "outline", size: "lg", fullWidth: true })}
        >
          <IdCard aria-hidden="true" />
          Verify my identity first
        </Link>
      </ConfirmDialog>
    </div>
  );
}
