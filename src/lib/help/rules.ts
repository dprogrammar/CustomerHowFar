// Help centre rules shared by server and client (admin form). No server-only imports here.

export type FaqCategoryKey = "CUSTOMERS" | "SAFETY" | "BUSINESSES" | "ACCOUNT";

/** Sections of /help, in page order. `anchor` is the section id (e.g. /help#for-businesses). */
export const FAQ_CATEGORIES: { key: FaqCategoryKey; label: string; anchor: string }[] = [
  { key: "CUSTOMERS", label: "For customers", anchor: "for-customers" },
  { key: "SAFETY", label: "Staying safe", anchor: "staying-safe" },
  { key: "BUSINESSES", label: "For businesses", anchor: "for-businesses" },
  { key: "ACCOUNT", label: "Your account", anchor: "your-account" },
];

export const FAQ_LIMITS = {
  questionMin: 5,
  questionMax: 160,
  answerMin: 10,
  answerMax: 4000,
  keywordsMax: 60,
  keywordMaxLength: 60,
  slugMax: 60,
} as const;

export const FAQ_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A URL-safe anchor from a question, e.g. "How do I pay?" -> "how-do-i-pay". */
export function slugFromQuestion(question: string) {
  return question
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, FAQ_LIMITS.slugMax)
    .replace(/-+$/, "");
}

/** Keywords typed one per line or comma-separated -> a clean, de-duplicated list. */
export function parseKeywords(raw: string) {
  const seen = new Set<string>();
  for (const part of raw.split(/[\n,]+/)) {
    const k = part.trim().toLowerCase().replace(/\s+/g, " ");
    if (k) seen.add(k.slice(0, FAQ_LIMITS.keywordMaxLength));
  }
  return [...seen].slice(0, FAQ_LIMITS.keywordsMax);
}
