// Identity verification rules and wording, shared by server and client. No server-only imports.

export type IdTypeValue = "NIN_SLIP" | "VOTERS_CARD" | "DRIVERS_LICENCE" | "INTERNATIONAL_PASSPORT";

export const ID_TYPES: { value: IdTypeValue; label: string; backAllowed: boolean }[] = [
  { value: "NIN_SLIP", label: "NIN slip", backAllowed: false },
  { value: "VOTERS_CARD", label: "Voter's card (PVC)", backAllowed: true },
  { value: "DRIVERS_LICENCE", label: "Driver's licence", backAllowed: true },
  { value: "INTERNATIONAL_PASSPORT", label: "International passport", backAllowed: false },
];

export const ID_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ID_TYPES.map((t) => [t.value, t.label]),
);

export type IdentityState = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

export const IDENTITY_STATE_LABELS: Record<IdentityState, string> = {
  NONE: "Not submitted",
  PENDING: "Pending review",
  APPROVED: "Accepted",
  REJECTED: "Rejected",
};

export const MAX_SUBMISSIONS_PER_DAY = 5;
export const RETENTION_DAYS = 90;
/** ID photos are resized to at most this many pixels so ID text stays readable. */
export const ID_IMAGE_MAX_DIMENSION = 2000;

/** The only public trust badge. Honest wording: reviewed by our team, not a government check. */
export const ID_BADGE_LABEL = "ID submitted";
export const ID_BADGE_EXPLANATION =
  "This business owner submitted a government ID and a selfie, which were reviewed by the CustomerHowFar team. This is not an official government verification.";

export const REJECTION_QUICK_REASONS = [
  "Photo blurry or unreadable",
  "Face not clearly visible",
  "Name doesn't match",
  "ID type not accepted",
  "ID appears expired",
  "Selfie doesn't match the ID photo",
  "ID details covered",
];
