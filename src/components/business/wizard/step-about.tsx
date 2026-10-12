"use client";

import { useActionState, useId, useState } from "react";
import { Plus, X } from "lucide-react";
import type { FormState } from "@/lib/auth/actions";
import { saveAboutAction } from "@/lib/business/actions";
import {
  DAYS,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  MAX_SERVICES,
  SERVICE_MAX_LENGTH,
  type OpeningHours,
} from "@/lib/business/rules";
import { FormAlert, TextField } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { WizardNav } from "./wizard-nav";

const initialState: FormState = { status: "idle" };

type Defaults = {
  description: string | null;
  yearsOfExperience: number | null;
  services: string[];
  openingHours: OpeningHours | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  websiteUrl: string | null;
};

const DEFAULT_DAY = { open: "08:00", close: "18:00" };

export function StepAbout({ businessId, defaults }: { businessId: string; defaults: Defaults }) {
  const [state, formAction, pending] = useActionState(
    saveAboutAction.bind(null, businessId),
    initialState,
  );
  const v = state.values;
  const errors = state.fieldErrors;

  const [description, setDescription] = useState(v?.description ?? defaults.description ?? "");
  const [services, setServices] = useState<string[]>(
    v?.services ? v.services.split("\n").filter(Boolean) : defaults.services,
  );
  const [serviceDraft, setServiceDraft] = useState("");
  const [hoursEnabled, setHoursEnabled] = useState(Boolean(defaults.openingHours));
  const [hours, setHours] = useState<OpeningHours>(
    () =>
      defaults.openingHours ??
      (Object.fromEntries(
        DAYS.map(({ key }) => [key, key === "sun" ? null : { ...DEFAULT_DAY }]),
      ) as OpeningHours),
  );

  const descriptionId = useId();
  const serviceInputId = useId();
  const count = description.trim().length;

  function addService() {
    const value = serviceDraft.trim().replace(/\s+/g, " ");
    if (value.length < 2 || services.length >= MAX_SERVICES) return;
    if (!services.some((s) => s.toLowerCase() === value.toLowerCase())) {
      setServices([...services, value.slice(0, SERVICE_MAX_LENGTH)]);
    }
    setServiceDraft("");
  }

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.status === "error" && (state.message || errors) && (
        <FormAlert status="error">
          {state.message ?? "Please check the highlighted fields below."}
        </FormAlert>
      )}

      <div>
        <Label htmlFor={descriptionId}>Describe your business</Label>
        <Textarea
          id={descriptionId}
          name="description"
          rows={6}
          maxLength={DESCRIPTION_MAX}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What do you do, what are you known for, and why should customers choose you?"
          aria-invalid={errors?.description ? true : undefined}
          aria-describedby={`${descriptionId}-count`}
        />
        <div
          id={`${descriptionId}-count`}
          className="mt-1.5 flex justify-between gap-3 text-sm"
          aria-live="polite"
        >
          <span className={errors?.description ? "text-red-700" : "text-gray-600"}>
            {errors?.description?.[0] ??
              (count < DESCRIPTION_MIN
                ? `At least ${DESCRIPTION_MIN} characters (${DESCRIPTION_MIN - count} more).`
                : "Looks good.")}
          </span>
          <span
            className={cn(
              "shrink-0 tabular-nums",
              count > DESCRIPTION_MAX - 100 ? "text-accent-800" : "text-gray-600",
            )}
          >
            {count}/{DESCRIPTION_MAX}
          </span>
        </div>
      </div>

      <TextField
        label="Years of experience (optional)"
        name="yearsOfExperience"
        type="number"
        inputMode="numeric"
        min={0}
        max={80}
        className="max-w-40"
        defaultValue={v?.yearsOfExperience ?? defaults.yearsOfExperience ?? ""}
        errors={errors?.yearsOfExperience}
      />

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-gray-800">
          Services you offer (optional)
        </legend>
        {services.map((service) => (
          <input key={service} type="hidden" name="services" value={service} />
        ))}
        <div className="flex gap-2">
          <label htmlFor={serviceInputId} className="sr-only">
            Add a service
          </label>
          <Input
            id={serviceInputId}
            value={serviceDraft}
            maxLength={SERVICE_MAX_LENGTH}
            onChange={(event) => setServiceDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addService();
              }
            }}
            placeholder="e.g. Bridal gowns"
            disabled={services.length >= MAX_SERVICES}
          />
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={addService}
            disabled={services.length >= MAX_SERVICES || serviceDraft.trim().length < 2}
          >
            <Plus aria-hidden="true" />
            Add
          </Button>
        </div>
        <p className="mt-1.5 text-sm text-gray-600">
          {services.length}/{MAX_SERVICES} added.
        </p>
        {errors?.services && <p className="mt-1 text-sm text-red-700">{errors.services[0]}</p>}
        {services.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Services added">
            {services.map((service) => (
              <li
                key={service}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pr-1 pl-3 text-sm text-brand-900 ring-1 ring-brand-200"
              >
                {service}
                <button
                  type="button"
                  onClick={() => setServices(services.filter((s) => s !== service))}
                  className="flex size-7 items-center justify-center rounded-full hover:bg-brand-100"
                >
                  <X aria-hidden="true" className="size-4" />
                  <span className="sr-only">Remove {service}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset className="rounded-xl border border-border p-4">
        <legend className="px-1 text-sm font-medium text-gray-800">Opening hours (optional)</legend>
        <label className="flex items-center gap-3 text-sm text-gray-800">
          <input
            type="checkbox"
            name="hoursEnabled"
            checked={hoursEnabled}
            onChange={(event) => setHoursEnabled(event.target.checked)}
            className="size-5 rounded border-gray-300 accent-brand-600"
          />
          Show my opening hours
        </label>
        {errors?.openingHours && (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {errors.openingHours[0]}
          </p>
        )}
        {hoursEnabled && (
          <div className="mt-4 space-y-3">
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() =>
                setHours(
                  Object.fromEntries(
                    DAYS.map(({ key }) => [key, key === "sun" ? hours.sun : hours.mon]),
                  ) as OpeningHours,
                )
              }
            >
              Copy Monday to Tuesday-Saturday
            </Button>
            {DAYS.map(({ key, label }) => {
              const day = hours[key];
              return (
                <div key={key} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="w-24 text-sm font-medium text-gray-800">{label}</span>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      name={`closed_${key}`}
                      checked={day === null}
                      onChange={(event) =>
                        setHours({
                          ...hours,
                          [key]: event.target.checked ? null : { ...DEFAULT_DAY },
                        })
                      }
                      className="size-5 rounded border-gray-300 accent-brand-600"
                    />
                    Closed
                  </label>
                  {day && (
                    <span className="flex items-center gap-2">
                      <Input
                        type="time"
                        name={`open_${key}`}
                        aria-label={`${label} opening time`}
                        value={day.open}
                        onChange={(event) =>
                          setHours({ ...hours, [key]: { ...day, open: event.target.value } })
                        }
                        className="h-10 w-28 px-2"
                      />
                      <span aria-hidden="true">to</span>
                      <Input
                        type="time"
                        name={`close_${key}`}
                        aria-label={`${label} closing time`}
                        value={day.close}
                        onChange={(event) =>
                          setHours({ ...hours, [key]: { ...day, close: event.target.value } })
                        }
                        className="h-10 w-28 px-2"
                      />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm font-medium text-gray-800">Social links (optional)</legend>
        <TextField
          label="Instagram"
          name="instagram"
          placeholder="@yourbusiness"
          autoCapitalize="none"
          defaultValue={v?.instagram ?? defaults.instagramUrl ?? ""}
          errors={errors?.instagram}
        />
        <TextField
          label="Facebook page"
          name="facebook"
          placeholder="facebook.com/yourbusiness"
          autoCapitalize="none"
          defaultValue={v?.facebook ?? defaults.facebookUrl ?? ""}
          errors={errors?.facebook}
        />
        <TextField
          label="TikTok"
          name="tiktok"
          placeholder="@yourbusiness"
          autoCapitalize="none"
          defaultValue={v?.tiktok ?? defaults.tiktokUrl ?? ""}
          errors={errors?.tiktok}
        />
        <TextField
          label="Website"
          name="website"
          type="url"
          inputMode="url"
          placeholder="www.yourbusiness.com"
          autoCapitalize="none"
          defaultValue={v?.website ?? defaults.websiteUrl ?? ""}
          errors={errors?.website}
        />
      </fieldset>

      <WizardNav pending={pending} backHref={`/business/${businessId}/edit?step=2`} />
    </form>
  );
}
