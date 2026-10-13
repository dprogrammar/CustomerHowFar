"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ImageUp,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { MAX_IMAGE_BYTES } from "@/config/uploads";
import { submitIdentityAction } from "@/lib/identity/actions";
import { ID_IMAGE_MAX_DIMENSION, ID_TYPES, type IdTypeValue } from "@/lib/identity/rules";
import { prepareImage, uploadToCloudinary } from "@/lib/images/client-upload";
import { FormAlert, TextField } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IdCardGuide, SelfieGuide } from "./guides";
import { ID_PHOTO_TIPS, SELFIE_TIPS, TipList } from "./tips";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_ORIGINAL_BYTES = 30 * 1024 * 1024;

type Shot = { blob: Blob; url: string };
type Slot = "front" | "back" | "selfie";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");

/** Camera (with `capture`) plus a gallery fallback for one photo. */
function PhotoPicker({
  slot,
  label,
  capture,
  shot,
  error,
  busy,
  onPick,
}: {
  slot: Slot;
  label: string;
  capture: "environment" | "user";
  shot: Shot | undefined;
  error: string | undefined;
  busy: boolean;
  onPick: (slot: Slot, file: File | undefined) => void;
}) {
  const id = useId();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      className="rounded-xl border border-border bg-white p-3"
    >
      <p id={`${id}-label`} className="text-sm font-semibold text-gray-900">
        {label}
      </p>
      {shot ? (
        // Local preview only (an object URL of the photo on this phone).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shot.url}
          alt={`Preview: ${label}`}
          className="mt-2 max-h-72 w-full rounded-lg bg-gray-100 object-contain"
        />
      ) : null}
      <div className="mt-2 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
        <Button
          type="button"
          variant={shot ? "outline" : "primary"}
          disabled={busy}
          onClick={() => camera.current?.click()}
        >
          {shot ? <RotateCcw aria-hidden="true" /> : <Camera aria-hidden="true" />}
          {shot ? "Retake" : "Take photo"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => gallery.current?.click()}
        >
          <ImageUp aria-hidden="true" />
          Choose from gallery
        </Button>
      </div>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture={capture}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        data-slot={slot}
        data-source="camera"
        onChange={(e) => {
          onPick(slot, e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        data-slot={slot}
        data-source="gallery"
        onChange={(e) => {
          onPick(slot, e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <p
        className={cn("mt-2 text-sm", error ? "text-red-700" : "text-gray-600")}
        role={error ? "alert" : undefined}
      >
        {error ?? "JPG, PNG or WebP. We shrink it on your phone before uploading."}
      </p>
    </div>
  );
}

export function IdentityForm({
  accountName,
  remainingToday,
}: {
  accountName: string;
  remainingToday: number;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [idType, setIdType] = useState<IdTypeValue | "">("");
  const [fullName, setFullName] = useState("");
  const [shots, setShots] = useState<Partial<Record<Slot, Shot>>>({});
  const [photoErrors, setPhotoErrors] = useState<Partial<Record<Slot, string>>>({});
  const [processing, setProcessing] = useState<Slot | null>(null);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const shotsRef = useRef(shots);
  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);
  // Free the local previews when leaving the page.
  useEffect(
    () => () => Object.values(shotsRef.current).forEach((s) => s && URL.revokeObjectURL(s.url)),
    [],
  );

  const backAllowed = ID_TYPES.find((t) => t.value === idType)?.backAllowed ?? false;
  const nameDiffers = fullName.trim().length > 1 && normalize(fullName) !== normalize(accountName);

  async function pick(slot: Slot, file: File | undefined) {
    if (!file) return;
    setPhotoErrors((e) => ({ ...e, [slot]: undefined }));
    if (!IMAGE_TYPES.includes(file.type)) {
      setPhotoErrors((e) => ({
        ...e,
        [slot]: "That file type isn't allowed. Please use a JPG, PNG or WebP photo.",
      }));
      return;
    }
    if (file.size > MAX_ORIGINAL_BYTES) {
      setPhotoErrors((e) => ({
        ...e,
        [slot]: "That photo is too large. Please choose a smaller one.",
      }));
      return;
    }
    setProcessing(slot);
    try {
      // Resize to at most 2000px (ID text stays readable) and strip location data.
      const { blob } = await prepareImage(file, { maxDimension: ID_IMAGE_MAX_DIMENSION });
      if (blob.size > MAX_IMAGE_BYTES)
        throw new Error("This photo is over 5 MB even after resizing.");
      const url = URL.createObjectURL(blob);
      setShots((s) => {
        if (s[slot]) URL.revokeObjectURL(s[slot]!.url);
        return { ...s, [slot]: { blob, url } };
      });
    } catch (e) {
      setPhotoErrors((x) => ({
        ...x,
        [slot]: e instanceof Error ? e.message : "We couldn't read that photo.",
      }));
    } finally {
      setProcessing(null);
    }
  }

  function go(next: 1 | 2 | 3) {
    setError(null);
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  }

  function continueFromStep1() {
    const e: Record<string, string[]> = {};
    if (!idType) e.idType = ["Choose the type of ID."];
    if (fullName.trim().length < 2)
      e.fullNameOnId = ["Type your full name exactly as it appears on your ID."];
    if (!shots.front) setPhotoErrors((x) => ({ ...x, front: "Please add a photo of your ID." }));
    setErrors(e);
    if (Object.keys(e).length === 0 && shots.front) go(2);
  }

  function continueFromStep2() {
    if (!shots.selfie) {
      setPhotoErrors((x) => ({ ...x, selfie: "Please add a selfie holding your ID." }));
      return;
    }
    go(3);
  }

  async function submit() {
    setError(null);
    if (!consent) {
      setErrors({ consent: ["Please tick the consent box to continue."] });
      return;
    }
    setBusy(true);
    try {
      const upload = async (slot: Slot, label: string) => {
        const shot = shots[slot];
        if (!shot) return undefined;
        setProgress(`${label} 0%`);
        const res = await uploadToCloudinary(
          shot.blob,
          (p) => setProgress(`${label} ${p}%`),
          undefined,
          "identity",
        );
        return res.publicId;
      };
      const idFrontPublicId = await upload("front", "Uploading ID photo");
      const idBackPublicId = backAllowed ? await upload("back", "Uploading back of ID") : undefined;
      const selfiePublicId = await upload("selfie", "Uploading selfie");
      setProgress("Checking your photos");
      const result = await submitIdentityAction({
        idType: idType as IdTypeValue,
        fullNameOnId: fullName,
        idFrontPublicId,
        idBackPublicId,
        selfiePublicId,
        consent: true,
      });
      if (result.ok) {
        Object.values(shots).forEach((s) => s && URL.revokeObjectURL(s.url));
        setShots({});
        setDone(result.message ?? "Submitted.");
      } else {
        setError(result.error);
        setErrors(result.fieldErrors ?? {});
        if (result.fieldErrors?.idType || result.fieldErrors?.fullNameOnId) go(1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  if (done) {
    return (
      <FormAlert status="success">
        <p className="font-semibold">{done}</p>
        <p className="mt-1">
          We&apos;ll email you when our team has checked it, usually within 1 to 2 working days.
        </p>
      </FormAlert>
    );
  }

  if (remainingToday <= 0) {
    return (
      <FormAlert status="error">
        You&apos;ve reached today&apos;s limit of ID submissions. Please try again tomorrow.
      </FormAlert>
    );
  }

  return (
    <div className="space-y-5">
      <ol aria-label="Steps" className="flex items-center gap-2 text-xs font-medium text-gray-600">
        {["Your ID", "Selfie", "Review"].map((label, i) => (
          <li
            key={label}
            aria-current={step === i + 1 ? "step" : undefined}
            className={cn(
              "flex flex-1 flex-col gap-1.5",
              step === i + 1 ? "text-brand-800" : step > i + 1 ? "text-gray-800" : undefined,
            )}
          >
            <span
              className={cn("h-1.5 rounded-full", step >= i + 1 ? "bg-brand-600" : "bg-gray-200")}
            />
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {error && <FormAlert status="error">{error}</FormAlert>}

      {step === 1 && (
        <section aria-labelledby="step1-title" className="space-y-4">
          <h2
            id="step1-title"
            ref={heading}
            tabIndex={-1}
            className="text-lg font-semibold text-gray-900 outline-none"
          >
            Step 1 of 3: Your ID
          </h2>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-gray-800">Type of ID</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ID_TYPES.map((t) => (
                <label
                  key={t.value}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border bg-white px-3 text-sm font-medium text-gray-900",
                    idType === t.value
                      ? "border-brand-600 ring-2 ring-brand-600/20"
                      : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name="idType"
                    value={t.value}
                    checked={idType === t.value}
                    onChange={() => {
                      setIdType(t.value);
                      setErrors((x) => ({ ...x, idType: undefined }));
                    }}
                    className="size-4 accent-brand-600"
                  />
                  {t.label}
                </label>
              ))}
            </div>
            {errors.idType && <p className="mt-1.5 text-sm text-red-700">{errors.idType[0]}</p>}
          </fieldset>

          <TextField
            label="Full name, exactly as on your ID"
            name="fullNameOnId"
            autoComplete="off"
            maxLength={120}
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              setErrors((x) => ({ ...x, fullNameOnId: undefined }));
            }}
            errors={errors.fullNameOnId}
            hint={
              nameDiffers
                ? `This is different from your account name (${accountName}). The names must match. If your ID is right, update your account name first.`
                : "Don't type your ID number. We never ask for it."
            }
          />

          <div className="grid grid-cols-1 gap-4 rounded-xl bg-muted p-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:p-4">
            <figure>
              <IdCardGuide className="w-full" />
              <figcaption className="mt-1 text-center text-xs font-medium text-gray-700">
                Sample: like this
              </figcaption>
            </figure>
            <TipList tips={ID_PHOTO_TIPS} label="Tips for the ID photo" />
          </div>

          <PhotoPicker
            slot="front"
            label="Photo of your ID (front)"
            capture="environment"
            shot={shots.front}
            error={photoErrors.front}
            busy={processing !== null}
            onPick={pick}
          />
          {processing === "front" && (
            <p className="text-sm text-gray-700" role="status">
              Preparing photo...
            </p>
          )}

          {backAllowed && (
            <PhotoPicker
              slot="back"
              label="Back of your ID (optional)"
              capture="environment"
              shot={shots.back}
              error={photoErrors.back}
              busy={processing !== null}
              onPick={pick}
            />
          )}

          <Button
            type="button"
            size="lg"
            fullWidth
            onClick={continueFromStep1}
            disabled={processing !== null}
          >
            Continue
            <ArrowRight aria-hidden="true" />
          </Button>
        </section>
      )}

      {step === 2 && (
        <section aria-labelledby="step2-title" className="space-y-4">
          <h2
            id="step2-title"
            ref={heading}
            tabIndex={-1}
            className="text-lg font-semibold text-gray-900 outline-none"
          >
            Step 2 of 3: Selfie holding your ID
          </h2>
          <p className="text-sm text-gray-700">
            Take a selfie while holding the same ID beside your chin. We use it to check that the ID
            belongs to you.
          </p>
          <div className="grid grid-cols-1 gap-4 rounded-xl bg-muted p-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:p-4">
            <figure>
              <SelfieGuide className="w-full" />
              <figcaption className="mt-1 text-center text-xs font-medium text-gray-700">
                Sample: like this
              </figcaption>
            </figure>
            <TipList tips={SELFIE_TIPS} label="Tips for the selfie" />
          </div>
          <PhotoPicker
            slot="selfie"
            label="Selfie holding your ID"
            capture="user"
            shot={shots.selfie}
            error={photoErrors.selfie}
            busy={processing !== null}
            onPick={pick}
          />
          {processing === "selfie" && (
            <p className="text-sm text-gray-700" role="status">
              Preparing photo...
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-[auto_minmax(0,1fr)]">
            <Button type="button" size="lg" variant="outline" onClick={() => go(1)}>
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>
            <Button
              type="button"
              size="lg"
              onClick={continueFromStep2}
              disabled={processing !== null}
            >
              Continue
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section aria-labelledby="step3-title" className="space-y-4">
          <h2
            id="step3-title"
            ref={heading}
            tabIndex={-1}
            className="text-lg font-semibold text-gray-900 outline-none"
          >
            Step 3 of 3: Check and submit
          </h2>
          <dl className="divide-y divide-border rounded-xl border border-border bg-white px-3 text-sm">
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-gray-600">ID type</dt>
              <dd className="font-medium text-gray-900">
                {ID_TYPES.find((t) => t.value === idType)?.label}
              </dd>
            </div>
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-gray-600">Name on ID</dt>
              <dd className="text-right font-medium break-words text-gray-900">
                {fullName.trim()}
              </dd>
            </div>
          </dl>
          <ul className="grid grid-cols-2 gap-3" aria-label="Your photos">
            {(
              [
                ["front", "ID photo"],
                ...(backAllowed && shots.back ? [["back", "Back of ID"]] : []),
                ["selfie", "Selfie with ID"],
              ] as [Slot, string][]
            ).map(([slot, label]) =>
              shots[slot] ? (
                <li key={slot}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                  <img
                    src={shots[slot]!.url}
                    alt={`Preview: ${label}`}
                    className="aspect-square w-full rounded-lg bg-gray-100 object-contain ring-1 ring-border"
                  />
                  <p className="mt-1 text-xs text-gray-700">{label}</p>
                </li>
              ) : null,
            )}
          </ul>

          <div>
            <label className="flex items-start gap-3 rounded-lg border border-border bg-white p-3 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                aria-invalid={errors.consent ? true : undefined}
                className="mt-0.5 size-5 shrink-0 accent-brand-600"
              />
              <span>
                I consent to CustomerHowFar processing my ID and selfie to verify my identity, as
                described in the{" "}
                <Link
                  href="/privacy"
                  className="font-medium text-brand-700 underline underline-offset-2"
                >
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
            {errors.consent && <p className="mt-1.5 text-sm text-red-700">{errors.consent[0]}</p>}
          </div>

          {progress && (
            <p className="text-sm text-gray-700" role="status" aria-live="polite">
              {progress}
            </p>
          )}

          <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-[auto_minmax(0,1fr)]">
            <Button type="button" size="lg" variant="outline" onClick={() => go(2)} disabled={busy}>
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>
            <Button type="button" size="lg" onClick={submit} disabled={busy || !consent}>
              {busy ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <ShieldCheck aria-hidden="true" />
              )}
              {busy ? "Submitting..." : "Submit for review"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
