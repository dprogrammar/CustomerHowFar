import "server-only";
import { ASSISTANT } from "@/config/assistant";
import { prisma } from "@/lib/prisma";
import { hasContent, scrubPersonalData } from "./scrub";

// Questions the assistant couldn't answer, kept anonymously so admins can add help content:
// personal data is scrubbed first and nothing links a row to a person (no user id, no IP, a
// random id and the day only). Grouped for admins by trigram similarity.

/** Today's date in Lagos, at midnight UTC (the column is a plain DATE). */
function todayInLagos() {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
  return new Date(`${ymd}T00:00:00Z`);
}

export async function recordUnanswered(text: string, knownNames: string[] = []) {
  const scrubbed = scrubPersonalData(text, knownNames);
  if (!hasContent(scrubbed)) return;
  await prisma.unansweredQuestion.create({ data: { text: scrubbed, askedOn: todayInLagos() } });
}

export type UnansweredGroup = {
  /** Ids of every question in the group (to dismiss or resolve them together). */
  ids: string[];
  count: number;
  /** A few different wordings, most recent first. */
  examples: string[];
  lastAskedOn: Date;
};

/** Unanswered questions grouped by similarity, most asked first. */
export async function listUnansweredGroups(limit = 1000): Promise<UnansweredGroup[]> {
  const rows = await prisma.unansweredQuestion.findMany({
    orderBy: [{ askedOn: "desc" }, { id: "asc" }],
    take: limit,
    select: { id: true, text: true, askedOn: true },
  });
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const pairs = await prisma.$queryRaw<{ a: string; b: string }[]>`
    SELECT x.id::text AS a, y.id::text AS b
    FROM unanswered_questions x
    JOIN unanswered_questions y ON x.id < y.id
    WHERE x.id = ANY(${ids}::uuid[]) AND y.id = ANY(${ids}::uuid[])
      AND extensions.similarity(lower(x.text), lower(y.text)) >= 0.45`;

  // Union-find over similar pairs.
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (id: string): string => {
    const p = parent.get(id)!;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  for (const { a, b } of pairs) {
    const [ra, rb] = [find(a), find(b)];
    if (ra !== rb) parent.set(ra, rb);
  }

  const groups = new Map<string, UnansweredGroup>();
  for (const r of rows) {
    const root = find(r.id);
    const g = groups.get(root) ?? { ids: [], count: 0, examples: [], lastAskedOn: r.askedOn };
    g.ids.push(r.id);
    g.count++;
    const seen = g.examples.some((e) => e.toLowerCase() === r.text.toLowerCase());
    if (!seen && g.examples.length < 3) g.examples.push(r.text);
    if (r.askedOn > g.lastAskedOn) g.lastAskedOn = r.askedOn;
    groups.set(root, g);
  }
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || b.lastAskedOn.getTime() - a.lastAskedOn.getTime(),
  );
}

/** Daily job: unanswered questions are kept for a limited time. */
export async function pruneUnansweredQuestions() {
  const cutoff = new Date(Date.now() - ASSISTANT.UNANSWERED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.unansweredQuestion.deleteMany({ where: { askedOn: { lt: cutoff } } });
  return count;
}
