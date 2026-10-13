"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { resendConfirmationAction, signupAction, type FormState } from "@/lib/auth/actions";
import { FormAlert, PasswordField, SubmitButton, TextField } from "./form-fields";
import { PasswordStrength } from "./password-strength";

const initialState: FormState = { status: "idle" };

export function SignupForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signupAction, initialState);
  const [resendState, resendAction, resending] = useActionState(
    resendConfirmationAction,
    initialState,
  );
  const [password, setPassword] = useState("");

  if (state.status === "success" && state.code === "check_email") {
    return (
      <div className="space-y-5 text-center" role="status">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <MailCheck aria-hidden="true" className="size-7" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Check your email</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            We sent a confirmation link to{" "}
            <strong className="font-semibold break-all text-gray-900">{state.values?.email}</strong>
            . Click it to activate your account. It may take a minute, so check your spam folder
            too.
          </p>
        </div>
        <form action={resendAction}>
          <input type="hidden" name="email" value={state.values?.email ?? ""} />
          <input type="hidden" name="next" value={next} />
          <SubmitButton
            pending={resending}
            pendingText="Sending..."
            variant="outline"
            disabled={resending || resendState.status === "success"}
          >
            Resend email
          </SubmitButton>
        </form>
        {resendState.message && (
          <FormAlert status={resendState.status === "error" ? "error" : "success"}>
            {resendState.message}
          </FormAlert>
        )}
      </div>
    );
  }

  const errors = state.fieldErrors;
  return (
    <div className="space-y-5">
      {state.status === "error" && state.message && (
        <FormAlert status="error">
          {state.message}{" "}
          {errors?.email && (
            <Link href="/login" className="font-semibold underline underline-offset-2">
              Go to log in
            </Link>
          )}
        </FormAlert>
      )}

      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <TextField
          label="Full name"
          name="fullName"
          autoComplete="name"
          autoCapitalize="words"
          required
          defaultValue={state.values?.fullName}
          errors={errors?.fullName}
        />
        <TextField
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.values?.email}
          errors={errors?.email}
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          errors={errors?.password}
          hint={<PasswordStrength password={password} />}
        />
        <PasswordField
          label="Confirm password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          errors={errors?.confirmPassword}
        />

        <div>
          <label className="flex items-start gap-3 text-sm text-gray-700">
            <input
              type="checkbox"
              name="acceptTerms"
              required
              aria-invalid={errors?.acceptTerms ? true : undefined}
              aria-describedby={errors?.acceptTerms ? "accept-terms-error" : undefined}
              className="mt-0.5 size-5 shrink-0 rounded border-gray-300 accent-brand-600"
            />
            <span>
              I agree to the{" "}
              <Link
                href="/terms"
                className="font-medium text-brand-700 underline underline-offset-2"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="font-medium text-brand-700 underline underline-offset-2"
              >
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {errors?.acceptTerms && (
            <p id="accept-terms-error" className="mt-1.5 text-sm text-red-700">
              {errors.acceptTerms[0]}
            </p>
          )}
        </div>

        <SubmitButton pending={pending} pendingText="Creating account...">
          Create account
        </SubmitButton>
      </form>
    </div>
  );
}
