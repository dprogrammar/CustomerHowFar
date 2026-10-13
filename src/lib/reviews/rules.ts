// Review and report rules shared by server and client. No server-only imports.

export const REVIEW_COMMENT_MIN = 20;
export const REVIEW_COMMENT_MAX = 1000;
export const OWNER_REPLY_MAX = 1000;
/** "Highest rated" sort: businesses with at least this many reviews rank first. */
export const MIN_REVIEWS_FOR_RANKING = 3;

export const REVIEW_REPORT_REASONS = [
  { value: "FAKE", label: "Fake review" },
  { value: "OFFENSIVE", label: "Offensive or abusive" },
  { value: "SPAM", label: "Spam or advertising" },
  { value: "NOT_A_CUSTOMER", label: "Not a real customer" },
] as const;
export type ReviewReportReasonValue = (typeof REVIEW_REPORT_REASONS)[number]["value"];

export const LISTING_REPORT_REASONS = [
  { value: "SCAM", label: "Scam or fraud" },
  { value: "FAKE_PHOTOS", label: "Fake or stolen photos" },
  { value: "WRONG_CONTACT", label: "Wrong contact details" },
  { value: "OFFENSIVE", label: "Offensive content" },
  { value: "CLOSED", label: "Business has closed" },
  { value: "OTHER", label: "Something else" },
] as const;
export type ListingReportReasonValue = (typeof LISTING_REPORT_REASONS)[number]["value"];

export const REVIEW_REASON_LABELS: Record<string, string> = Object.fromEntries(
  REVIEW_REPORT_REASONS.map((r) => [r.value, r.label]),
);
export const LISTING_REASON_LABELS: Record<string, string> = Object.fromEntries(
  LISTING_REPORT_REASONS.map((r) => [r.value, r.label]),
);

/** Public reviewer name: first name and last initial only ("Chika O."). */
export function reviewerName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Customer";
  const last = parts.length > 1 ? ` ${parts.at(-1)![0]!.toUpperCase()}.` : "";
  return `${parts[0]}${last}`;
}

export function formatRating(value: number) {
  return value.toFixed(1);
}
