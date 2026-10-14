"use client";

import { useActionState, useId, useState } from "react";
import { MapPin } from "lucide-react";
import type { FormState } from "@/lib/auth/actions";
import { formatNames, STATE_NOT_LIVE_MESSAGE } from "@/lib/service-areas/rules";
import { saveLocationAction } from "@/lib/business/actions";
import { FormAlert, TextField } from "@/components/auth/form-fields";
import { Label, Select } from "@/components/ui/input";
import { StateOptions } from "@/components/service-areas/state-options";
import { WaitlistForm } from "@/components/service-areas/waitlist-form";
import { WizardNav } from "./wizard-nav";

const initialState: FormState = { status: "idle" };

type Option = { id: number; name: string };
type StateOption = Option & { isActive: boolean };

export function StepLocation({
  businessId,
  states,
  lgasByState,
  defaults,
}: {
  businessId: string;
  /** All states; only live ones can be chosen (plus the listing's current state, if any). */
  states: StateOption[];
  lgasByState: Record<number, Option[]>;
  defaults: {
    stateId: number | null;
    lgaId: number | null;
    address: string | null;
    area: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState(
    saveLocationAction.bind(null, businessId),
    initialState,
  );
  const v = state.values;
  const errors = state.fieldErrors;
  const [stateId, setStateId] = useState(v?.stateId ?? String(defaults.stateId ?? ""));
  const [lgaId, setLgaId] = useState(v?.lgaId ?? String(defaults.lgaId ?? ""));
  const lgas = stateId ? (lgasByState[Number(stateId)] ?? []) : [];
  const stateFieldId = useId();
  const lgaFieldId = useId();

  const comingSoon = states.filter((s) => !s.isActive);
  const liveNames = formatNames(states.filter((s) => s.isActive).map((s) => s.name));

  return (
    <>
      <form action={formAction} className="space-y-5" noValidate>
        {state.status === "error" && state.message && (
          <FormAlert status="error">{state.message}</FormAlert>
        )}

        <div>
          <Label htmlFor={stateFieldId}>State</Label>
          <Select
            id={stateFieldId}
            name="stateId"
            value={stateId}
            onChange={(event) => {
              setStateId(event.target.value);
              setLgaId("");
            }}
            icon={<MapPin />}
            aria-invalid={errors?.stateId ? true : undefined}
            aria-describedby={errors?.stateId ? `${stateFieldId}-error` : undefined}
          >
            <option value="">Choose your state</option>
            <StateOptions
              states={states}
              valueOf={(s) => s.id}
              disableComingSoon
              keepEnabled={defaults.stateId ?? undefined}
            />
          </Select>
          {errors?.stateId && (
            <p id={`${stateFieldId}-error`} className="mt-1.5 text-sm text-red-700">
              {errors.stateId[0]}
            </p>
          )}
          {comingSoon.length > 0 && (
            <p className="mt-2 text-sm text-gray-700">
              We&apos;re currently accepting businesses in {liveNames}.{" "}
              <a
                href="#state-waitlist"
                onClick={() => {
                  const panel = document.getElementById("state-waitlist");
                  if (panel instanceof HTMLDetailsElement) panel.open = true;
                }}
                className="font-medium text-brand-700 underline"
              >
                Your state isn&apos;t available yet?
              </a>
            </p>
          )}
        </div>

        <div>
          <Label htmlFor={lgaFieldId}>Local Government Area (LGA)</Label>
          <Select
            id={lgaFieldId}
            name="lgaId"
            value={lgaId}
            onChange={(event) => setLgaId(event.target.value)}
            disabled={!stateId}
            aria-invalid={errors?.lgaId ? true : undefined}
            aria-describedby={`${lgaFieldId}-message`}
          >
            <option value="">{stateId ? "Choose your LGA" : "Choose a state first"}</option>
            {lgas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <p
            id={`${lgaFieldId}-message`}
            className={
              errors?.lgaId ? "mt-1.5 text-sm text-red-700" : "mt-1.5 text-sm text-gray-600"
            }
          >
            {errors?.lgaId?.[0] ??
              (stateId ? `${lgas.length} LGAs in this state.` : "Pick your state to see its LGAs.")}
          </p>
        </div>

        <TextField
          label="Street address"
          name="address"
          autoComplete="street-address"
          required
          maxLength={200}
          placeholder="e.g. 12 Admiralty Way"
          defaultValue={v?.address ?? defaults.address ?? ""}
          errors={errors?.address}
          hint="Helps customers find your shop or workshop."
        />
        <TextField
          label="Area or landmark (optional)"
          name="area"
          maxLength={120}
          placeholder="e.g. Lekki Phase 1, opposite Shoprite"
          defaultValue={v?.area ?? defaults.area ?? ""}
          errors={errors?.area}
        />

        <WizardNav pending={pending} backHref={`/business/${businessId}/edit?step=1`} />
      </form>
      {comingSoon.length > 0 && (
        <details
          id="state-waitlist"
          className="mt-8 rounded-xl border border-border bg-surface p-4"
        >
          <summary className="cursor-pointer font-semibold text-gray-900">
            Your state isn&apos;t available yet?
          </summary>
          <p className="mt-2 text-sm text-gray-700">{STATE_NOT_LIVE_MESSAGE}</p>
          <div className="mt-4">
            <WaitlistForm
              states={comingSoon.map(({ id, name }) => ({ id, name }))}
              defaultRole="BUSINESS"
            />
          </div>
        </details>
      )}
    </>
  );
}
