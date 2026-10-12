"use client";

import { useActionState } from "react";
import { updateProfileAction, type FormState } from "@/lib/auth/actions";
import { FormAlert, SubmitButton, TextField } from "@/components/auth/form-fields";

const initialState: FormState = { status: "idle" };

export function ProfileForm({ fullName, phone }: { fullName: string; phone: string | null }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initialState);
  const values = state.values ?? { fullName, phone: phone ?? "" };

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.status === "success" && state.message && (
        <FormAlert status="success">{state.message}</FormAlert>
      )}
      <TextField
        label="Full name"
        name="fullName"
        autoComplete="name"
        autoCapitalize="words"
        required
        defaultValue={values.fullName}
        errors={state.fieldErrors?.fullName}
      />
      <TextField
        label="Phone number (optional)"
        name="phone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        placeholder="0803 123 4567"
        defaultValue={values.phone}
        errors={state.fieldErrors?.phone}
        hint="Nigerian mobile number. Only shared with businesses you choose to contact."
      />
      <SubmitButton pending={pending} pendingText="Saving..." className="sm:w-auto sm:px-8">
        Save changes
      </SubmitButton>
    </form>
  );
}
