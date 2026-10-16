// The owner's progress from sign-up to a live listing, worked out from the server's own data
// (the owner's ID check and the business's status and completeness). Pure: shared by server
// components, never fed by browser state. It only describes the journey and links to the
// owner's next step; approving anything stays with the admin and the server's own checks.

import type { IdentityState } from "@/lib/identity/rules";
import { firstIncompleteStep, missingItems, type BusinessStatus, type Completeness } from "./rules";

export type StageKey = "account" | "id" | "details" | "review" | "live";
export type StageState = "done" | "in_progress" | "waiting" | "action" | "not_started";

export type Stage = {
  key: StageKey;
  /** Full name, e.g. "Business details". */
  label: string;
  /** Short name for narrow screens, e.g. "Details". */
  short: string;
  state: StageState;
  /** What this stage means right now, in plain words. */
  note: string;
};

export type NextAction = { label: string; href: string };

export type Progress = {
  stages: Stage[];
  /** The stage to highlight: where the next action is, else what we're waiting on. */
  current: StageKey;
  /** The one thing the owner can do next; null when they're only waiting on our team. */
  action: NextAction | null;
};

export type ProgressBusiness = {
  id: string;
  status: BusinessStatus;
  completeness: Completeness;
};

const TOTAL_PARTS = 4;

/** Progress for one business (or for a listing not started yet when business is null). */
export function ownerProgress(input: {
  idState: IdentityState;
  business: ProgressBusiness | null;
}): Progress {
  const { idState, business } = input;
  const status = business?.status ?? "DRAFT";

  const id: Stage = {
    key: "id",
    label: "ID check",
    short: "ID check",
    ...(
      {
        NONE: { state: "not_started", note: "Not submitted yet" },
        PENDING: { state: "waiting", note: "Under review, no action needed" },
        APPROVED: { state: "done", note: "Accepted" },
        REJECTED: { state: "action", note: "Changes needed" },
      } as const
    )[idState],
  };

  let details: Stage;
  if (!business) {
    details = {
      key: "details",
      label: "Business details",
      short: "Details",
      state: "in_progress",
      note: "Start with the basics",
    };
  } else if (status === "REJECTED") {
    details = {
      key: "details",
      label: "Business details",
      short: "Details",
      state: "action",
      note: "Changes needed",
    };
  } else if (status === "DRAFT") {
    const done = TOTAL_PARTS - missingItems(business.completeness).length;
    details =
      done === TOTAL_PARTS
        ? {
            key: "details",
            label: "Business details",
            short: "Details",
            state: "done",
            note: "Complete",
          }
        : {
            key: "details",
            label: "Business details",
            short: "Details",
            state: "in_progress",
            note: `${done} of ${TOTAL_PARTS} parts done`,
          };
  } else {
    details = {
      key: "details",
      label: "Business details",
      short: "Details",
      state: "done",
      note: "Complete",
    };
  }

  const reviewBase = { key: "review" as const, label: "Sent for review", short: "Review" };
  const review: Stage =
    status === "PENDING_REVIEW"
      ? { ...reviewBase, state: "waiting", note: "Under review, no action needed" }
      : status === "PENDING_PAYMENT"
        ? { ...reviewBase, state: "action", note: "Payment needed" }
        : status === "APPROVED" || status === "SUSPENDED"
          ? { ...reviewBase, state: "done", note: "Reviewed" }
          : status === "REJECTED"
            ? { ...reviewBase, state: "not_started", note: "Send again after your changes" }
            : { ...reviewBase, state: "not_started", note: "Not sent yet" };

  const liveBase = { key: "live" as const, label: "Live", short: "Live" };
  const live: Stage =
    status === "APPROVED"
      ? { ...liveBase, state: "done", note: "Customers can find you" }
      : status === "SUSPENDED"
        ? { ...liveBase, state: "action", note: "Suspended" }
        : status === "PENDING_REVIEW" && idState !== "APPROVED"
          ? { ...liveBase, state: "not_started", note: "After your ID is accepted and our review" }
          : { ...liveBase, state: "not_started", note: "After our review" };

  const stages: Stage[] = [
    { key: "account", label: "Account created", short: "Account", state: "done", note: "Done" },
    id,
    details,
    review,
    live,
  ];

  // The next action, in the order of the stages.
  let action: NextAction | null = null;
  let current: StageKey | null = null;
  if (idState === "REJECTED") {
    action = { label: "Upload a new ID", href: "/account/verify-identity" };
    current = "id";
  } else if (idState === "NONE") {
    action = { label: "Verify your identity", href: "/account/verify-identity" };
    current = "id";
  } else if (!business) {
    current = "details";
  } else if (status === "REJECTED") {
    action = { label: "Fix and resubmit", href: `/business/${business.id}/edit?step=1` };
    current = "details";
  } else if (status === "DRAFT") {
    const step = firstIncompleteStep(business.completeness);
    action =
      step === 5
        ? { label: "Send for review", href: `/business/${business.id}/edit?step=5` }
        : {
            label: "Continue business details",
            href: `/business/${business.id}/edit?step=${step}`,
          };
    current = step === 5 ? "review" : "details";
  } else if (status === "PENDING_PAYMENT") {
    action = { label: "Continue to payment", href: `/business/${business.id}/pay` };
    current = "review";
  } else if (status === "SUSPENDED") {
    action = { label: "Contact support", href: "/contact" };
    current = "live";
  }
  if (!current) {
    current =
      stages.find((s) => s.state === "waiting")?.key ?? (status === "APPROVED" ? "live" : "review");
  }
  // A listing not started yet (/business/new): the owner is on its details right now.
  if (!business) current = "details";
  return { stages, current, action };
}

/** Where "Continue to my listing" goes: the newest unfinished listing's next step, else the newest listing, else a new one. */
export function continueListingHref(
  businesses: { id: string; status: BusinessStatus; completeness: Completeness; updatedAt: Date }[],
) {
  const live = businesses.filter((b) => b.status !== "DELETED");
  const newest = (list: typeof live) => [...list].sort((a, b) => +b.updatedAt - +a.updatedAt)[0];
  const unfinished = newest(
    live.filter((b) => ["DRAFT", "REJECTED", "PENDING_PAYMENT"].includes(b.status)),
  );
  if (unfinished) {
    if (unfinished.status === "PENDING_PAYMENT") return `/business/${unfinished.id}/pay`;
    if (unfinished.status === "REJECTED") return `/business/${unfinished.id}/edit?step=1`;
    return `/business/${unfinished.id}/edit?step=${firstIncompleteStep(unfinished.completeness)}`;
  }
  const latest = newest(live);
  return latest ? `/dashboard#business-${latest.id}` : "/business/new";
}
