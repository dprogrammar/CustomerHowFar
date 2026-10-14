import "server-only";
import { ASSISTANT } from "@/config/assistant";
import { searchBusinesses, type BusinessCardData } from "@/lib/business/public";
import { getActiveCategories, getLgasGroupedByState, getStates } from "@/lib/data/catalog";
import { fillFacts } from "@/lib/help/facts";
import { getHelpFaqs, getLiveFacts, type HelpFaq } from "@/lib/help/server";
import { searchHref } from "@/lib/search/url";
import { formatNames } from "@/lib/service-areas/rules";
import { ANSWER_MIN_SCORE, RELATED_MIN_SCORE, countShown, matchFaqs } from "./match";
import type { AssistantContext, AssistantProvider } from "./provider";
import { listingStatusReply } from "./status";
import type { AssistantReply, ChatBusinessCard, ChatLink } from "./types";
import {
  detectCategory,
  detectLocation,
  detectSmallTalk,
  isFindRequest,
  isServiceRequest,
  isStatusRequest,
  isVagueServiceRequest,
  understand,
  type CatalogCategory,
  type DetectedLocation,
} from "./understand";
import { recordUnanswered } from "./unanswered";

// The free, rule-based assistant: help entries matched with PostgreSQL search, live facts from
// the database, and business search over approved listings. Nothing leaves our servers.

const WAITLIST_HREF = "/coming-soon#waitlist";
const EXAMPLES = "**plumber in Lekki** or **tailor in Ikeja**";

export const FIND_PROMPT: AssistantReply = {
  kind: "text",
  text: `Sure! What service do you need, and where? For example ${EXAMPLES}.`,
};

const HELP_LINKS: ChatLink[] = [
  { label: "Contact us", href: "/contact" },
  { label: "Help Centre", href: "/help" },
];

// --- Help answers ----------------------------------------------------------------------------

function relatedFor(faq: HelpFaq, all: HelpFaq[], preferred: string[] = []) {
  const picked: HelpFaq[] = [];
  for (const slug of preferred) {
    const f = all.find((x) => x.slug === slug);
    if (f && f.slug !== faq.slug && !picked.includes(f)) picked.push(f);
  }
  // Fill up with neighbours from the same help section.
  const section = all.filter((x) => x.category === faq.category && x.slug !== faq.slug);
  const start = Math.max(0, all.filter((x) => x.category === faq.category).indexOf(faq));
  for (const f of [...section.slice(start), ...section.slice(0, start)]) {
    if (picked.length >= 2) break;
    if (!picked.includes(f)) picked.push(f);
  }
  return picked.slice(0, 2).map((f) => ({ slug: f.slug, question: f.question }));
}

async function answerReply(
  faq: HelpFaq,
  options: { preferredRelated?: string[]; note?: string; links?: ChatLink[] } = {},
): Promise<AssistantReply> {
  const [facts, all] = await Promise.all([getLiveFacts(), getHelpFaqs()]);
  await countShown(faq.id);
  return {
    kind: "answer",
    faqId: faq.id,
    slug: faq.slug,
    question: faq.question,
    markdown: fillFacts(faq.answer, facts),
    note: options.note,
    links: options.links,
    related: relatedFor(faq, all, options.preferredRelated),
  };
}

/** A help entry chosen directly (quick question or related question). */
export async function answerBySlug(slug: string): Promise<AssistantReply> {
  const faq = (await getHelpFaqs()).find((f) => f.slug === slug);
  if (!faq) {
    return {
      kind: "fallback",
      text: "Sorry, that answer isn't available any more. Try the Help Centre.",
      links: HELP_LINKS,
    };
  }
  return answerReply(faq);
}

// --- Business search -----------------------------------------------------------------------

function toChatCard(b: BusinessCardData): ChatBusinessCard {
  return {
    slug: b.slug,
    name: b.name,
    categoryName: b.categoryName,
    place: [b.lgaName ?? b.area, b.stateName].filter(Boolean).join(", ") || null,
    ratingAverage: b.ratingAverage,
    reviewCount: b.reviewCount,
    idChecked: b.idChecked,
    logoPublicId: b.logoPublicId,
  };
}

async function businessReply(
  category: CatalogCategory,
  location: DetectedLocation | null,
): Promise<AssistantReply> {
  if (location && !location.state.isActive) {
    const live = formatNames((await getStates()).filter((s) => s.isActive).map((s) => s.name));
    return {
      kind: "text",
      text: `We're not in **${location.label}** yet. CustomerHowFar is launching one state at a time, and we're live in **${live}** right now. Join the waitlist and we'll email you once when we launch in ${location.state.name}.`,
      links: [
        { label: `Join the ${location.state.name} waitlist`, href: WAITLIST_HREF },
        {
          label: `See ${category.name} in ${live}`,
          href: searchHref({ kind: "search" }, { category: category.slug }),
        },
      ],
    };
  }

  const filters = {
    category: category.slug,
    state: location?.state.slug,
    lga: location?.lga?.slug,
  };
  let result = await searchBusinesses(filters);
  let where = location ? ` in ${location.label}` : "";
  let widened = "";
  if (result.total === 0 && location?.lga) {
    // Nothing in that area yet: try the whole state.
    filters.lga = undefined;
    result = await searchBusinesses(filters);
    widened = `I couldn't find any in ${location.label} yet, so I looked across ${location.state.name}. `;
    where = ` in ${location.state.name}`;
  }

  if (result.total === 0) {
    const place = widened ? ` in ${location!.label} or anywhere in ${location!.state.name}` : where;
    return {
      kind: "businesses",
      text: `I couldn't find any businesses in **${category.name}**${place} on CustomerHowFar yet. We're adding new businesses all the time.`,
      items: [],
      seeAll: null,
      links: [
        { label: "Browse all categories", href: "/categories" },
        { label: "Search everything", href: "/search" },
      ],
    };
  }

  const items = result.items.slice(0, ASSISTANT.MAX_BUSINESS_CARDS).map(toChatCard);
  const found =
    result.total === 1
      ? `I found 1 business in **${category.name}**${where}:`
      : result.total > items.length
        ? `I found ${result.total} businesses in **${category.name}**${where}. Here are the top ${items.length}:`
        : `I found ${result.total} businesses in **${category.name}**${where}:`;
  const tip = location ? "" : ' Tell me your area (for example "in Ikeja") to narrow it down.';
  return {
    kind: "businesses",
    text: `${widened}${found}${tip}`,
    items,
    seeAll: {
      label:
        result.total > items.length ? `See all ${result.total} results` : "See on the search page",
      href: searchHref({ kind: "search" }, filters),
    },
  };
}

// --- The provider ----------------------------------------------------------------------------

async function chatCatalog() {
  const [categories, states, lgas] = await Promise.all([
    getActiveCategories(),
    getStates(),
    getLgasGroupedByState(),
  ]);
  return { categories, states, lgas };
}

export const rulesProvider: AssistantProvider = {
  id: "rules",

  async reply(text: string, ctx: AssistantContext): Promise<AssistantReply> {
    const u = understand(text);
    if (!u.normalized) {
      return { kind: "text", text: "Type a question, or pick one of the suggestions." };
    }

    switch (detectSmallTalk(u)) {
      case "greeting":
        return {
          kind: "text",
          text: `I dey o! 👋 How can I help? Ask me about using CustomerHowFar, or tell me what you need, like ${EXAMPLES}.`,
        };
      case "thanks":
        return { kind: "text", text: "You're welcome! Anything else I can help with?" };
      case "goodbye":
        return { kind: "text", text: "Bye for now! Come back any time." };
    }

    if (isStatusRequest(u)) return listingStatusReply((await ctx.getUser())?.id ?? null);
    if (isFindRequest(u)) return FIND_PROMPT;

    const { categories, states, lgas } = await chatCatalog();
    const category = detectCategory(u, categories);
    const location = detectLocation(u, states, lgas);

    if (category && isServiceRequest(u, category, location)) {
      return businessReply(category, location);
    }
    if (!category && isVagueServiceRequest(u, location)) {
      return {
        kind: "text",
        text: `What service do you need in **${location!.label}**? For example **plumber**, **tailor** or **AC repair**.`,
      };
    }

    const hits = await matchFaqs(u);
    const best = hits[0];
    if (best && best.score >= ANSWER_MIN_SCORE) {
      const all = await getHelpFaqs();
      const faq = all.find((f) => f.id === best.id);
      if (faq) {
        const preferredRelated = hits
          .slice(1)
          .filter((h) => h.score >= RELATED_MIN_SCORE)
          .map((h) => h.slug);
        // "Are you in Abuja?": say so for that state too.
        let note: string | undefined;
        let links: ChatLink[] | undefined;
        if (faq.slug === "which-states" && location) {
          if (location.state.isActive) {
            note = `Yes, we're live in **${location.state.name}**.`;
          } else {
            note = `We're not in **${location.state.name}** yet.`;
            links = [{ label: `Join the ${location.state.name} waitlist`, href: WAITLIST_HREF }];
          }
        }
        return answerReply(faq, { preferredRelated, note, links });
      }
    }

    // No good answer: say so honestly and keep the question (anonymously) for the team.
    const user = await ctx.getUser();
    await recordUnanswered(text, user?.nameParts ?? []);
    return {
      kind: "fallback",
      text: "I'm not sure about that yet. I've passed your question on (without your details) so we can add an answer. You can also contact our team or check the Help Centre.",
      links: HELP_LINKS,
    };
  },
};
