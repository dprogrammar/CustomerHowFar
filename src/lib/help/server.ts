import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { OPERATOR } from "@/config/legal";
import { CATALOG_TAGS, getActiveStates } from "@/lib/data/catalog";
import { getPaymentConfig } from "@/lib/payments/config";
import { METHOD_LABELS, availableMethods } from "@/lib/payments/methods";
import { prisma } from "@/lib/prisma";
import type { LiveFacts } from "./facts";
import { FAQ_CATEGORIES, type FaqCategoryKey } from "./rules";

/**
 * Help centre content. Cached across requests; admin edits call updateTag(HELP_TAGS.faqs) and
 * settings changes updateTag(HELP_TAGS.facts), so /help and the chat refresh immediately.
 */
export const HELP_TAGS = {
  faqs: "help:faqs",
  facts: "help:facts",
} as const;

export type HelpFaq = {
  id: string;
  slug: string;
  question: string;
  answer: string;
  category: FaqCategoryKey;
};

const CATEGORY_ORDER = new Map(FAQ_CATEGORIES.map((c, i) => [c.key, i]));

/** Active help entries in page order (section, then sort order). */
export async function getHelpFaqs(): Promise<HelpFaq[]> {
  "use cache";
  cacheLife("days");
  cacheTag(HELP_TAGS.faqs);

  const rows = await prisma.faqEntry.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { question: "asc" }],
    select: { id: true, slug: true, question: true, answer: true, category: true },
  });
  return rows.sort(
    (a, b) => (CATEGORY_ORDER.get(a.category) ?? 9) - (CATEGORY_ORDER.get(b.category) ?? 9),
  );
}

/** Live values for answer placeholders. Never includes bank account details. */
export async function getLiveFacts(): Promise<LiveFacts> {
  "use cache";
  cacheLife("hours");
  cacheTag(HELP_TAGS.facts);
  cacheTag(CATALOG_TAGS.locations);

  const [states, config] = await Promise.all([getActiveStates(), getPaymentConfig()]);
  return {
    liveStates: states.map((s) => s.name),
    paymentRequired: config.paymentRequired,
    listingFeeNaira: config.listingFeeNaira,
    paymentMethods: availableMethods(config).map((m) =>
      (METHOD_LABELS[m.id] ?? m.label).toLowerCase(),
    ),
    contactEmail: OPERATOR.email,
  };
}
