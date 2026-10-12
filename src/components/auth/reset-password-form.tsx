"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { resetPasswordAction, type FormState } from "@/lib/auth/actions";
import { FormAlert, PasswordField, SubmitButton } from "./form-fields";
import { PasswordStrength } from "./password-strength";

const initialState: FormState = { status: "idle" };

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);
  const [password, setPassword] = useState("");

  return (
    <div className="space-y-5">
      {state.status === "error" && state.message && (
        <FormAlert status="error">
          {state.message}{" "}
          <Link href="/forgot-password" className="font-semibold underline underline-offset-2">
            Request a new link
          </Link>
        </FormAlert>
      )}
      <form action={formAction} className="space-y-4" noValidate>
        <PasswordField
          label="New password"
          name="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          errors={state.fieldErrors?.password}
          hint={<PasswordStrength password={password} />}
        />
        <PasswordField
          label="Confirm new password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          errors={state.fieldErrors?.confirmPassword}
        />
        <SubmitButton pending={pending} pendingText="Saving...">
          Save new password
        </SubmitButton>
      </form>
    </div>
  );
}
