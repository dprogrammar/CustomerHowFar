// Removes personal data from a question before it is stored (unanswered questions). Pure, so it
// is easy to test. Errs on the side of removing too much.

const LINK = /\b(?:https?:\/\/|www\.)\S+/gi;
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/giu;
/** Phone, account, NIN and other numbers: 6+ digits, allowing spaces, dashes, dots and brackets. */
const LONG_NUMBER = /\+?\d[\d\s().-]{4,}\d/g;
const HANDLE = /(^|\s)@[\p{L}\p{N}_.]{2,}/gu;
/** "my name is Ada Obi", "call me Tunde" (any case): the next 1-3 words are a name. */
const NAME_INTRO =
  /\b(my name is|my names are|my name's|name is|names are|call me|i am called|my name na)\s+[\p{L}'-]+(?:\s+[\p{L}'-]+){0,2}/giu;
/** "I'm Ada", "this is Ada Obi", "na Tunde": only Capitalized words count as a name here. */
const SELF_INTRO = /\b([Ii] am|[Ii]'m|[Ii]m|[Tt]his is|[Ii]t'?s|[Nn]a)\s+(?:\p{Lu}[\p{L}'-]+\s*){1,3}/gu;
/** "Mr Okafor", "Mrs. Bello", "Chief Ade", "Engr Musa"... */
const TITLE_NAME =
  /\b(Mr|Mrs|Ms|Miss|Dr|Engr|Chief|Alhaji|Alhaja|Pastor|Prof|Barr|Oga|Madam|Aunty|Auntie|Uncle|Sir|Mama|Baba|Iya)\.?\s+\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+)?/gu;

export function scrubPersonalData(text: string, knownNames: string[] = []) {
  let s = text.normalize("NFKC");
  s = s.replace(LINK, "[link]");
  s = s.replace(EMAIL, "[email]");
  s = s.replace(LONG_NUMBER, (m) => (m.replace(/\D/g, "").length >= 6 ? "[number]" : m));
  s = s.replace(HANDLE, "$1[handle]");
  s = s.replace(NAME_INTRO, (_m, lead: string) => `${lead} [name]`);
  s = s.replace(SELF_INTRO, (_m, lead: string) => `${lead} [name] `);
  s = s.replace(TITLE_NAME, (_m, title: string) => `${title} [name]`);
  // The signed-in person's own name, wherever it appears.
  for (const part of knownNames) {
    if (part.length < 3) continue;
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, "giu"), "[name]");
  }
  return s.replace(/\s+/g, " ").trim().slice(0, 200);
}

/** Worth storing: still has some words once placeholders are removed. */
export function hasContent(scrubbed: string) {
  return (scrubbed.replace(/\[(link|email|number|handle|name)\]/g, "").match(/\p{L}/gu)?.length ?? 0) >= 3;
}
