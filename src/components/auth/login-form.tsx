"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, resendConfirmationAction, type FormState } from "@/lib/auth/actions";
import { FormAlert, PasswordField, SubmitButton, TextField } from "./form-fields";

const initialState: FormState = { status: "idle" };

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [resendState, resendAction, resending] = useActionState(
    resendConfirmationAction,
    initialState,
  );

  return (
    <div className="space-y-5">
      {notice && state.status === "idle" && <FormAlert status="error">{notice}</FormAlert>}
      {state.status === "error" && state.message && (
        <FormAlert status="error">
          <p>{state.message}</p>
          {state.code === "email_not_confirmed" && resendState.status !== "success" && (
            <form action={resendAction} className="mt-2">
              <input type="hidden" name="email" value={state.values?.email ?? ""} />
              <input type="hidden" name="next" value={next} />
              <button
                type="submit"
                disabled={resending}
                className="font-semibold underline underline-offset-2 hover:no-underline"
              >
                {resending ? "Sending..." : "Resend confirmation email"}
              </button>
            </form>
          )}
          {resendState.message && <p className="mt-2">{resendState.message}</p>}
        </FormAlert>
      )}

      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <TextField
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.values?.email}
          errors={state.fieldErrors?.email}
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          required
          errors={state.fieldErrors?.password}
          labelAction={
            <Link
              href="/forgot-password"
              className="rounded text-sm font-medium text-brand-700 hover:underline"
            >
              Forgot password?
            </Link>
          }
        />
        <SubmitButton pending={pending} pendingText="Logging in...">
          Log in
        </SubmitButton>
      </form>
    </div>
  );
}
