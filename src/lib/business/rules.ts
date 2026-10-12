// Business listing rules shared by server and client. No server-only imports here.

export const MAX_BUSINESSES_PER_USER = 5;
export const MAX_WORK_PHOTOS = 12;
export const DESCRIPTION_MIN = 30;
export const DESCRIPTION_MAX = 1500;
export const TAGLINE_MAX = 120;
export const MAX_SERVICES = 15;
export const SERVICE_MAX_LENGTH = 40;
export const CAPTION_MAX = 200;

export type BusinessStatus =
  "DRAFT" | "PENDING_PAYMENT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED";

export const WIZARD_STEPS = [
  { step: 1, label: "Basics" },
  { step: 2, label: "Location" },
  { step: 3, label: "About" },
  { step: 4, label: "Photos" },
  { step: 5, label: "Review" },
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number]["step"];

export function parseStep(value: unknown): WizardStep | null {
  const n = typeof value === "string" ? Number(value) : NaN;
  return n >= 1 && n <= 5 && Number.isInteger(n) ? (n as WizardStep) : null;
}

/** Owner-facing status labels and badge tones. */
export const STATUS_META: Record<
  BusinessStatus,
  { label: string; tone: "neutral" | "accent" | "info" | "success" | "danger" | "dark" }
> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_PAYMENT: { label: "Awaiting payment", tone: "accent" },
  PENDING_REVIEW: { label: "In review", tone: "info" },
  APPROVED: { label: "Live", tone: "success" },
  REJECTED: { label: "Changes requested", tone: "danger" },
  SUSPENDED: { label: "Suspended", tone: "dark" },
};

/** Owners may edit anything except suspended listings. */
export function canOwnerEdit(status: BusinessStatus) {
  return status !== "SUSPENDED";
}

/** Statuses from which the owner can (re)submit for review. */
export const SUBMITTABLE_STATUSES = [
  "DRAFT",
  "REJECTED",
  "PENDING_PAYMENT",
] as const satisfies readonly BusinessStatus[];

export function canSubmit(status: BusinessStatus) {
  return (SUBMITTABLE_STATUSES as readonly BusinessStatus[]).includes(status);
}

/**
 * Payment gate. Only the server calls this, with values it read itself:
 * when the admin switch is on and this business has never paid, it must pay first.
 * Paying never publishes a listing; it only moves it on to review.
 */
export function statusAfterSubmit(input: {
  paymentRequired: boolean;
  hasPaid: boolean;
}): "PENDING_PAYMENT" | "PENDING_REVIEW" {
  return input.paymentRequired && !input.hasPaid ? "PENDING_PAYMENT" : "PENDING_REVIEW";
}

export type CompletenessInput = {
  address: string | null;
  stateId: number | null;
  lgaId: number | null;
  description: string | null;
  logoPublicId: string | null;
  workPhotoCount: number;
};

export type Completeness = Record<"basics" | "location" | "about" | "photos", boolean>;

export function getCompleteness(b: CompletenessInput): Completeness {
  return {
    basics: true, // The business only exists once step 1 is saved.
    location: Boolean(b.address && b.stateId && b.lgaId),
    about: (b.description?.trim().length ?? 0) >= DESCRIPTION_MIN,
    photos: Boolean(b.logoPublicId) || b.workPhotoCount > 0,
  };
}

export const MISSING_LABELS: Record<keyof Completeness, string> = {
  basics: "Business basics",
  location: "Location (state, LGA and address)",
  about: `Description (at least ${DESCRIPTION_MIN} characters)`,
  photos: "A logo or at least one work photo",
};

export function missingItems(c: Completeness) {
  return (Object.keys(c) as (keyof Completeness)[]).filter((key) => !c[key]);
}

/** Where "Continue setup" should take the owner. */
export function firstIncompleteStep(c: Completeness): WizardStep {
  if (!c.location) return 2;
  if (!c.about) return 3;
  if (!c.photos) return 4;
  return 5;
}

export const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
] as const;

export type DayKey = (typeof DAYS)[number]["key"];
/** Stored in Business.openingHours. null for a day means closed. */
export type OpeningHours = Record<DayKey, { open: string; close: string } | null>;

export function formatNaira(amountNaira: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amountNaira);
}
