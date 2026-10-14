// Understanding a chat message: normalizing Nigerian English and Pidgin, spotting small talk,
// listing-status requests, a service category and a location. Pure functions (no database), so
// they are easy to test; the catalog (categories, states, LGAs) is passed in.

import {
  AMBIGUOUS_LGA_NAMES,
  AMBIGUOUS_STATE_NAMES,
  AREA_ALIASES,
  CATEGORY_TERMS,
  FILLERS,
  FIND_REQUEST,
  GOODBYE,
  GREETING,
  LOCATION_PREPOSITIONS,
  PHRASE_REWRITES,
  PLATFORM_WORDS,
  SERVICE_CUES,
  STATUS_REQUEST,
  STOPWORDS,
  THANKS,
  WORD_REWRITES,
} from "./vocabulary";

export type Understood = {
  /** Lowercase letters/digits and single spaces (e.g. "abeg how i go list my shop"). */
  normalized: string;
  /** Rewritten into plain English without fillers (e.g. "how do i list my business"). */
  plain: string;
  /** Meaningful words of `plain`, for matching (e.g. ["list", "business"]). */
  words: string[];
};

/** Lowercase, accents removed, apostrophes dropped ("don't" -> "dont"), punctuation -> spaces. */
export function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['‘’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PHRASE_PATTERNS = PHRASE_REWRITES.map(
  ([from, to]) => [new RegExp(`(?<=^| )${escapeRe(from)}(?= |$)`, "g"), to] as const,
);
const LEADING_GREETING =
  /^(how far|howfar|hi+|hello+|hey+|good (morning|afternoon|evening|day)|abeg|please|biko|oga|madam|sir|bros)( |$)/;

export function understand(text: string): Understood {
  const normalized = normalize(text);
  // "how far, how i go list my shop" -> drop the greeting when something follows it.
  let s = normalized;
  for (let i = 0; i < 4; i++) {
    const m = s.match(LEADING_GREETING);
    if (!m || m[0].trim() === s) break;
    s = s.slice(m[0].length).trim();
  }
  for (const [pattern, to] of PHRASE_PATTERNS) s = s.replace(pattern, to);
  const plainWords = s
    .split(" ")
    .map((w) => WORD_REWRITES[w] ?? w)
    .filter((w) => w && !FILLERS.has(w));
  const plain = plainWords.join(" ");
  const words = [
    ...new Set(plainWords.filter((w) => w.length >= 2 && !STOPWORDS.has(w) && /[a-z]/.test(w))),
  ].slice(0, 10);
  return { normalized, plain, words };
}

export type SmallTalk = "greeting" | "thanks" | "goodbye";

export function detectSmallTalk(u: Understood): SmallTalk | null {
  const bare = u.normalized
    .split(" ")
    .filter((w) => !FILLERS.has(w))
    .join(" ");
  if (!bare) return null;
  if (GREETING.test(bare)) return "greeting";
  if (THANKS.test(bare)) return "thanks";
  if (GOODBYE.test(bare)) return "goodbye";
  return null;
}

export function isStatusRequest(u: Understood) {
  // "Why was my listing rejected?" is a general question (help entry), unlike "why can't I see
  // my listing?".
  if (/^why /.test(u.plain) && !/^why (is|cant|cannot) (i )?(see )?my /.test(u.plain)) return false;
  return STATUS_REQUEST.test(u.plain);
}

export function isFindRequest(u: Understood) {
  return FIND_REQUEST.test(u.plain);
}

// --- Category ------------------------------------------------------------------------------

export type CatalogCategory = { slug: string; name: string };

/** The service category a message mentions (longest phrase wins), or null. */
export function detectCategory(u: Understood, categories: CatalogCategory[]) {
  const active = new Map(categories.map((c) => [c.slug, c]));
  const terms: [string, string][] = [];
  for (const c of categories) {
    const name = normalize(c.name);
    terms.push([name, c.slug]);
    // "Plumbers" -> "plumber"; "Hair & Beauty" -> also each word of two-part names.
    if (name.endsWith("s")) terms.push([name.slice(0, -1), c.slug]);
  }
  for (const [slug, list] of Object.entries(CATEGORY_TERMS)) {
    if (active.has(slug)) for (const t of list) terms.push([t, slug]);
  }
  terms.sort((a, b) => b[0].length - a[0].length);
  const padded = ` ${u.normalized} `;
  for (const [term, slug] of terms) {
    if (term && padded.includes(` ${term} `)) return active.get(slug) ?? null;
  }
  return null;
}

// --- Location ------------------------------------------------------------------------------

export type CatalogState = { id: number; slug: string; name: string; isActive: boolean };
export type CatalogLga = { slug: string; name: string };
export type DetectedLocation = {
  state: CatalogState;
  lga: CatalogLga | null;
  /** The place as the person wrote it, title-cased (e.g. "Lekki"). From our lists, never raw text. */
  label: string;
};

type Candidate = {
  phrase: string;
  stateSlug: string;
  lgaSlug?: string;
  needsPrep: boolean;
  isState: boolean;
  /** Lower is preferred when two places share a name (aliases, then live states). */
  priority: number;
};

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

function buildCandidates(states: CatalogState[], lgasByState: Record<number, CatalogLga[]>) {
  const list: Candidate[] = [];
  for (const [phrase, a] of Object.entries(AREA_ALIASES)) {
    list.push({
      phrase,
      stateSlug: a.state,
      lgaSlug: a.lga,
      needsPrep: Boolean(a.prep),
      isState: !a.lga,
      priority: 0,
    });
  }
  for (const s of states) {
    // "FCT (Abuja)" -> "fct abuja"; also the slug words ("akwa ibom", "cross river").
    for (const phrase of new Set([normalize(s.name), s.slug.replace(/-/g, " ")])) {
      list.push({
        phrase,
        stateSlug: s.slug,
        needsPrep: AMBIGUOUS_STATE_NAMES.has(phrase),
        isState: true,
        priority: 1,
      });
    }
    for (const l of lgasByState[s.id] ?? []) {
      const phrase = normalize(l.name);
      list.push({
        phrase,
        stateSlug: s.slug,
        lgaSlug: l.slug,
        needsPrep: AMBIGUOUS_LGA_NAMES.has(phrase) || (!s.isActive && phrase.length < 6),
        isState: false,
        priority: s.isActive ? 2 : 3,
      });
    }
  }
  return list.sort((a, b) => b.phrase.length - a.phrase.length || a.priority - b.priority);
}

/** The state (and LGA, if any) a message mentions, or null. Longest place name wins. */
export function detectLocation(
  u: Understood,
  states: CatalogState[],
  lgasByState: Record<number, CatalogLga[]>,
): DetectedLocation | null {
  const words = u.normalized.split(" ");
  const text = ` ${u.normalized} `;
  for (const c of buildCandidates(states, lgasByState)) {
    if (!c.phrase || !text.includes(` ${c.phrase} `)) continue;
    if (c.needsPrep) {
      const n = c.phrase.split(" ").length;
      const ok = words.some((_, i) => {
        if (words.slice(i, i + n).join(" ") !== c.phrase) return false;
        const before = words[i - 1];
        const after = words[i + n];
        return (before && LOCATION_PREPOSITIONS.has(before)) || (c.isState && after === "state");
      });
      if (!ok) continue;
    }
    const state = states.find((s) => s.slug === c.stateSlug);
    if (!state) continue;
    const lga = c.lgaSlug
      ? ((lgasByState[state.id] ?? []).find((l) => l.slug === c.lgaSlug) ?? null)
      : null;
    return { state, lga, label: titleCase(c.phrase) };
  }
  return null;
}

/** "I need a plumber in Lekki", "tailor for Ikeja", "who fit fix my AC", or just "plumber". */
export function isServiceRequest(
  u: Understood,
  category: CatalogCategory | null,
  location: DetectedLocation | null,
) {
  if (!category) return false;
  if (PLATFORM_WORDS.test(u.plain)) return false;
  return SERVICE_CUES.test(u.plain) || location !== null || u.words.length <= 3;
}

/** "I need someone in Lekki": a location and a request, but no service yet. */
export function isVagueServiceRequest(u: Understood, location: DetectedLocation | null) {
  return location !== null && SERVICE_CUES.test(u.plain) && !PLATFORM_WORDS.test(u.plain);
}
