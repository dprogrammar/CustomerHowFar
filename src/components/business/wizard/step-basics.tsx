"use client";

import { useActionState, useId, useState } from "react";
import type { FormState } from "@/lib/auth/actions";
import { saveBasicsAction } from "@/lib/business/actions";
import { TAGLINE_MAX } from "@/lib/business/rules";
import { FormAlert, TextField } from "@/components/auth/form-fields";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/input";
import { WizardNav } from "./wizard-nav";

const initialState: FormState = { status: "idle" };

/** +2348031234567 -> 0803 123 4567, for editing. */
export function toLocalPhone(value: string | null | undefined) {
  if (!value) return "";
  const digits = value.replace(/\D/g, "").slice(-10);
  return digits.length === 10
    ? `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
    : value;
}

export function StepBasics({
  businessId,
  categories,
  defaults,
}: {
  businessId: string | null;
  categories: { id: string; name: string; description: string | null }[];
  defaults?: {
    name: string;
    categoryId: string;
    tagline: string | null;
    phone: string;
    whatsappNumber: string;
  };
}) {
  const [state, formAction, pending] = useActionState(
    saveBasicsAction.bind(null, businessId),
    initialState,
  );
  const v = state.values;
  const errors = state.fieldErrors;
  const [sameAsPhone, setSameAsPhone] = useState(
    v ? v.sameAsPhone === "on" : !defaults || defaults.phone === defaults.whatsappNumber,
  );
  const [tagline, setTagline] = useState(v?.tagline ?? defaults?.tagline ?? "");
  const categoryLabelId = useId();
  const categoryErrorId = useId();

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.status === "error" && state.message && (
        <FormAlert status="error">{state.message}</FormAlert>
      )}

      <TextField
        label="Business name"
        name="name"
        required
        autoComplete="organization"
        autoCapitalize="words"
        maxLength={80}
        placeholder="e.g. Adaeze Couture"
        defaultValue={v?.name ?? defaults?.name}
        errors={errors?.name}
      />

      <div>
        <Label id={categoryLabelId}>Category</Label>
        <Combobox
          name="categoryId"
          labelId={categoryLabelId}
          options={categories.map((c) => ({ value: c.id, label: c.name, hint: c.description }))}
          defaultValue={v?.categoryId ?? defaults?.categoryId}
          placeholder="Search, e.g. tailor, plumber, barber"
          invalid={Boolean(errors?.categoryId)}
          describedBy={errors?.categoryId ? categoryErrorId : undefined}
        />
        {errors?.categoryId && (
          <p id={categoryErrorId} className="mt-1.5 text-sm text-red-700">
            {errors.categoryId[0]}
          </p>
        )}
      </div>

      <TextField
        label="Short tagline (optional)"
        name="tagline"
        maxLength={TAGLINE_MAX}
        placeholder="e.g. Bespoke native wear and bridal"
        value={tagline}
        onChange={(event) => setTagline(event.target.value)}
        errors={errors?.tagline}
        hint={`${tagline.length}/${TAGLINE_MAX} characters. One line that tells customers what you do best.`}
      />

      <TextField
        label="Phone number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
        placeholder="0803 123 4567"
        defaultValue={v?.phone ?? toLocalPhone(defaults?.phone)}
        errors={errors?.phone}
      />

      <div className="space-y-3">
        <label className="flex items-center gap-3 text-sm font-medium text-gray-800">
          <input
            type="checkbox"
            name="sameAsPhone"
            checked={sameAsPhone}
            onChange={(event) => setSameAsPhone(event.target.checked)}
            className="size-5 rounded border-gray-300 accent-brand-600"
          />
          WhatsApp number is the same as my phone number
        </label>
        {!sameAsPhone && (
          <TextField
            label="WhatsApp number"
            name="whatsappNumber"
            type="tel"
            inputMode="tel"
            required
            placeholder="0803 123 4567"
            defaultValue={v?.whatsappNumber ?? toLocalPhone(defaults?.whatsappNumber)}
            errors={errors?.whatsappNumber}
            hint="Customers will tap a button to chat with you on this number."
          />
        )}
      </div>

      <WizardNav pending={pending} />
    </form>
  );
}
