"use client";

import { useActionState, useId } from "react";
import { BellRing } from "lucide-react";
import { joinWaitlistAction, type WaitlistState } from "@/lib/service-areas/actions";
import { WAITLIST_ROLES, type WaitlistRoleValue } from "@/lib/service-areas/rules";
import { FormAlert, SubmitButton, TextField } from "@/components/auth/form-fields";
import { Label, Select } from "@/components/ui/input";

const initial: WaitlistState = { status: "idle" };

/** Join the waitlist for a state that isn't live yet. */
export function WaitlistForm({
  states,
  defaultStateId,
  defaultRole = "CUSTOMER",
}: {
  /** States that aren't live yet. */
  states: { id: number; name: string }[];
  defaultStateId?: number;
  defaultRole?: WaitlistRoleValue;
}) {
  const [state, action, pending] = useActionState(joinWaitlistAction, initial);
  const id = useId();
  const e = state.fieldErrors ?? {};

  if (state.status === "success") return <FormAlert status="success">{state.message}</FormAlert>;

  return (
    <form action={action} noValidate className="space-y-4" aria-label="Join the waitlist">
      {state.status === "error" && state.message && (
        <FormAlert status="error">{state.message}</FormAlert>
      )}
      <div>
        <Label htmlFor={`${id}-state`}>Your state</Label>
        <Select
          id={`${id}-state`}
          name="stateId"
          defaultValue={state.values?.stateId ?? (defaultStateId ? String(defaultStateId) : "")}
          aria-invalid={e.stateId ? true : undefined}
          aria-describedby={e.stateId ? `${id}-state-error` : undefined}
        >
          <option value="">Choose your state</option>
          {states.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        {e.stateId && (
          <p id={`${id}-state-error`} className="mt-1.5 text-sm text-red-700">
            {e.stateId[0]}
          </p>
        )}
      </div>
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        defaultValue={state.values?.email ?? ""}
        errors={e.email}
      />
      <TextField
        label="Name (optional)"
        name="name"
        autoComplete="name"
        maxLength={80}
        defaultValue={state.values?.name ?? ""}
        errors={e.name}
      />
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-gray-800">I&apos;m interested as</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {WAITLIST_ROLES.map((r) => (
            <label
              key={r.value}
              className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-white px-3 text-sm text-gray-900"
            >
              <input
                type="radio"
                name="role"
                value={r.value}
                defaultChecked={(state.values?.role ?? defaultRole) === r.value}
                className="size-4 accent-brand-600"
              />
              {r.label}
            </label>
          ))}
        </div>
        {e.role && <p className="mt-1.5 text-sm text-red-700">{e.role[0]}</p>}
      </fieldset>
      <div>
        <label className="flex items-start gap-3 text-sm text-gray-800">
          <input
            type="checkbox"
            name="consent"
            className="mt-0.5 size-5 shrink-0 accent-brand-600"
            aria-invalid={e.consent ? true : undefined}
          />
          <span>
            Email me when CustomerHowFar launches in my state. I can unsubscribe at any time.
          </span>
        </label>
        {e.consent && <p className="mt-1.5 text-sm text-red-700">{e.consent[0]}</p>}
      </div>
      {/* Honeypot: hidden from people and screen readers; bots tend to fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <SubmitButton pending={pending} pendingText="Joining..." className="w-full sm:w-auto">
        <BellRing aria-hidden="true" />
        Join the waitlist
      </SubmitButton>
    </form>
  );
}
