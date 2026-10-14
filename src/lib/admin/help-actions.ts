"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { HELP_TAGS } from "@/lib/help/server";
import { FAQ_LIMITS, FAQ_SLUG, parseKeywords } from "@/lib/help/rules";
import { prisma } from "@/lib/prisma";

// Admin: manage help entries (shown on /help and used by the HowFar Assistant) and unanswered
// chat questions. requireAdmin() first (404 for anyone else). Every change expires the help
// cache, so /help and the chat show it immediately.

export type HelpActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const CATEGORY = z.enum(["CUSTOMERS", "SAFETY", "BUSINESSES", "ACCOUNT"]);

const saveSchema = z.object({
  id: z.uuid().optional(),
  question: z
    .string()
    .trim()
    .min(FAQ_LIMITS.questionMin, "Write the question (at least 5 characters).")
    .max(FAQ_LIMITS.questionMax, `Use ${FAQ_LIMITS.questionMax} characters or fewer.`),
  slug: z
    .string()
    .trim()
    .max(FAQ_LIMITS.slugMax, `Use ${FAQ_LIMITS.slugMax} characters or fewer.`)
    .regex(FAQ_SLUG, "Use lowercase letters, numbers and dashes, e.g. how-to-pay."),
  answer: z
    .string()
    .trim()
    .min(FAQ_LIMITS.answerMin, "Write the answer (at least 10 characters).")
    .max(FAQ_LIMITS.answerMax, `Use ${FAQ_LIMITS.answerMax} characters or fewer.`),
  keywords: z.string().max(5000),
  category: CATEGORY,
  isActive: z.boolean(),
  /** Unanswered questions this entry answers (deleted once it's saved). */
  resolveIds: z.array(z.uuid()).max(1000).optional(),
});

function expireHelp() {
  updateTag(HELP_TAGS.faqs);
}

export async function saveFaqAction(input: z.input<typeof saveSchema>): Promise<HelpActionResult> {
  await requireAdmin();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  const { id, question, slug, answer, category, isActive, resolveIds } = parsed.data;
  const keywords = parseKeywords(parsed.data.keywords);

  try {
    const saved = await prisma.$transaction(async (tx) => {
      if (id) {
        // The slug is the /help anchor other pages link to, so it never changes once created.
        return tx.faqEntry.update({
          where: { id },
          data: { question, answer, keywords, category, isActive },
          select: { id: true },
        });
      }
      const last = await tx.faqEntry.aggregate({ where: { category }, _max: { sortOrder: true } });
      const created = await tx.faqEntry.create({
        data: {
          slug,
          question,
          answer,
          keywords,
          category,
          isActive,
          sortOrder: (last._max.sortOrder ?? 0) + 10,
        },
        select: { id: true },
      });
      if (resolveIds?.length) {
        await tx.unansweredQuestion.deleteMany({ where: { id: { in: resolveIds } } });
      }
      return created;
    });
    expireHelp();
    return { ok: true, message: id ? "Saved." : "Question added.", id: saved.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return {
          ok: false,
          error: "Another entry already uses that link.",
          fieldErrors: { slug: ["Choose a different link, e.g. add a word."] },
        };
      }
      if (error.code === "P2025") return { ok: false, error: "That entry no longer exists." };
    }
    throw error;
  }
}

export async function setFaqActiveAction(input: {
  id: string;
  active: boolean;
}): Promise<HelpActionResult> {
  await requireAdmin();
  const parsed = z.object({ id: z.uuid(), active: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { count } = await prisma.faqEntry.updateMany({
    where: { id: parsed.data.id },
    data: { isActive: parsed.data.active },
  });
  if (count === 0) return { ok: false, error: "That entry no longer exists." };
  expireHelp();
  refresh();
  return { ok: true, message: parsed.data.active ? "Shown again." : "Hidden." };
}

/** Moves an entry one place up or down within its help section. */
export async function moveFaqAction(input: {
  id: string;
  direction: "up" | "down";
}): Promise<HelpActionResult> {
  await requireAdmin();
  const parsed = z
    .object({ id: z.uuid(), direction: z.enum(["up", "down"]) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { id, direction } = parsed.data;

  const moved = await prisma.$transaction(async (tx) => {
    const entry = await tx.faqEntry.findUnique({ where: { id }, select: { category: true } });
    if (!entry) return false;
    // Lock the section so two admins reordering at once can't interleave.
    await tx.$queryRaw`SELECT id FROM faq_entries WHERE category = ${entry.category}::faq_category FOR UPDATE`;
    const section = await tx.faqEntry.findMany({
      where: { category: entry.category },
      orderBy: [{ sortOrder: "asc" }, { question: "asc" }],
      select: { id: true },
    });
    const from = section.findIndex((e) => e.id === id);
    const to = direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= section.length) return true;
    [section[from], section[to]] = [section[to], section[from]];
    // Renumber the whole section (10, 20, 30...) so the order is always unambiguous.
    for (const [i, e] of section.entries()) {
      await tx.faqEntry.update({ where: { id: e.id }, data: { sortOrder: (i + 1) * 10 } });
    }
    return true;
  });
  if (!moved) return { ok: false, error: "That entry no longer exists." };
  expireHelp();
  refresh();
  return { ok: true, message: "Moved." };
}

/** Removes a group of unanswered questions (e.g. spam, or already covered). */
export async function dismissUnansweredAction(input: { ids: string[] }): Promise<HelpActionResult> {
  await requireAdmin();
  const parsed = z.object({ ids: z.array(z.uuid()).min(1).max(1000) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  await prisma.unansweredQuestion.deleteMany({ where: { id: { in: parsed.data.ids } } });
  refresh();
  return { ok: true, message: "Dismissed." };
}
