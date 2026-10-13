"use client";

import { useActionState } from "react";
import { forgotPasswordAction, type FormState } from "@/lib/auth/actions";
import { FormAlert, SubmitButton, TextField } from "./form-fields";

const initialState: FormState = { status: "idle" };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, initialState);

  if (state.status === "success") {
    return <FormAlert status="success">{state.message}</FormAlert>;
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.status === "error" && state.message && (
        <FormAlert status="error">{state.message}</FormAlert>
      )}
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
      <SubmitButton pending={pending} pendingText="Sending link...">
        Send reset link
      </SubmitButton>
    </form>
  );
}
