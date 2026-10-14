import "server-only";
import { prisma } from "@/lib/prisma";
import type { Understood } from "./understand";

// Matches a message to help entries in PostgreSQL:
//  - full-text search (stemmed, prefix) counts how many of the message's words an entry covers;
//  - pg_trgm similarity forgives typos ("lisitng" ~ "listing") against the entry's question and
//    keyword words, and compares whole keyword phrases ("how much", "list my business");
//  - ts_rank_cd breaks ties.
// Words are letters/digits only (see understand.ts), so they can't inject tsquery syntax.

export type FaqHit = { id: string; slug: string; score: number };

/** Below this, the assistant says it isn't sure instead of guessing. */
export const ANSWER_MIN_SCORE = 0.6;
/** Other entries at least this good are offered as related questions. */
export const RELATED_MIN_SCORE = 0.25;

type Row = {
  id: string;
  slug: string;
  /**
   * Sum over the message's words of the best credit each earns: 1 when found in the question or
   * keywords (search weight A), 0.7 when it matches one of their words despite a typo, 0.4 when
   * found only in the answer text.
   */
  credit: number;
  /** Words earning at least the typo credit (an entry needs one to be answered). */
  hits: number;
  /** Best similarity between a whole keyword phrase (or the question) and the message. */
  phrase: number;
  rank: number;
};

/** Phrase similarity below this is mostly shared filler words ("you", "my"): ignored. */
const PHRASE_FLOOR = 0.45;

export async function matchFaqs(u: Understood, limit = 5): Promise<FaqHit[]> {
  const words = u.words.filter((w) => /^[a-z0-9]+$/.test(w));
  if (words.length === 0) return [];
  // Prefix matching only for longer words: "app" must not match "approval".
  const anyWord = words.map((w) => (w.length >= 4 ? `${w}:*` : w)).join(" | ");

  const rows = await prisma.$queryRaw<Row[]>`
    SELECT id, slug, sum(credit)::float8 AS credit, count(*) FILTER (WHERE credit >= 0.7)::float8 AS hits,
           max(phrase)::float8 AS phrase, max(rank)::float8 AS rank
    FROM (
      SELECT f.id, f.slug,
        CASE
          WHEN f.search_vector @@ to_tsquery('english', w || CASE WHEN char_length(w) >= 4 THEN ':*A' ELSE ':A' END) THEN 1.0
          WHEN char_length(w) >= 4 AND EXISTS (
            SELECT 1 FROM unnest(f.match_terms) AS t
            WHERE extensions.similarity(w, t) >= CASE WHEN char_length(w) >= 6 THEN 0.3 ELSE 0.4 END
          ) THEN 0.7
          WHEN f.search_vector @@ to_tsquery('english', w || CASE WHEN char_length(w) >= 4 THEN ':*' ELSE '' END) THEN 0.4
          ELSE 0
        END AS credit,
        coalesce((SELECT max(extensions.strict_word_similarity(k, ${u.plain}))
          FROM unnest(f.keywords || lower(f.question)) AS k
          WHERE char_length(k) >= 4), 0) AS phrase,
        ts_rank_cd(f.search_vector, to_tsquery('english', ${anyWord}), 32) AS rank
      FROM faq_entries f
      CROSS JOIN unnest(${words}::text[]) AS w
      WHERE f.is_active
    ) per_word
    GROUP BY id, slug`;

  return rows
    .map((r) => {
      const coverage = Math.min(1, r.credit / words.length);
      const phrase = r.phrase >= PHRASE_FLOOR ? r.phrase : 0;
      const score = 0.55 * coverage + 0.35 * phrase + 0.1 * Math.min(1, r.rank * 4);
      return { id: r.id, slug: r.slug, score: r.hits > 0 ? score : score * 0.5 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Counts one more time an entry was given as the answer (no updated_at change). */
export async function countShown(faqId: string) {
  await prisma.$executeRaw`UPDATE faq_entries SET times_shown = times_shown + 1 WHERE id = ${faqId}::uuid`;
}
