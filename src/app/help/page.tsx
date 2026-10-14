import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { fillFacts, type LiveFacts } from "@/lib/help/facts";
import { Markdown } from "@/lib/help/markdown";
import { FAQ_CATEGORIES } from "@/lib/help/rules";
import { getHelpFaqs, getLiveFacts, type HelpFaq } from "@/lib/help/server";
import { ContentPage } from "@/components/content/content-page";
import { OpenHashDetails } from "@/components/content/open-hash-details";

export const metadata: Metadata = {
  title: "Help centre",
  description:
    "Answers for customers and businesses: finding and contacting businesses, staying safe, listing your business, the review process, the listing fee and the ID check.",
  alternates: { canonical: "/help" },
};

// The questions and answers live in the database (admin: Help assistant), shared with the chat
// assistant. Each entry's slug is its anchor, e.g. /help#listing-fee.

function FaqList({ items, facts }: { items: HelpFaq[]; facts: LiveFacts }) {
  return (
    <div className="!mt-4 divide-y divide-border rounded-xl border border-border bg-white">
      {items.map((f) => (
        <details key={f.id} id={f.slug} className="group scroll-mt-24 px-4">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
            {f.question}
            <ChevronDown
              aria-hidden="true"
              className="size-5 shrink-0 text-gray-500 transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="pb-4 [&>*:first-child]:!mt-0">
            <Markdown source={fillFacts(f.answer, facts)} />
          </div>
        </details>
      ))}
    </div>
  );
}

export default async function HelpPage() {
  const [faqs, facts] = await Promise.all([getHelpFaqs(), getLiveFacts()]);
  const sections = FAQ_CATEGORIES.map((c) => ({
    ...c,
    items: faqs.filter((f) => f.category === c.key),
  })).filter((s) => s.items.length > 0);

  return (
    <ContentPage
      title="Help centre"
      intro={
        <p>
          Quick answers for customers and businesses. Can&apos;t find what you need?{" "}
          <Link href="/contact" className="font-medium text-brand-700 underline">
            Contact us
          </Link>
          .
        </p>
      }
    >
      <nav aria-label="Help sections" className="!mt-4 flex flex-wrap gap-2">
        {sections.map((s) => (
          <a
            key={s.key}
            href={`#${s.anchor}`}
            className="rounded-full bg-brand-50 px-4 py-2 text-sm !no-underline ring-1 ring-brand-200"
          >
            {s.label}
          </a>
        ))}
      </nav>
      <OpenHashDetails />
      {sections.map((s) => (
        <section key={s.key} aria-labelledby={s.anchor}>
          <h2 id={s.anchor}>{s.label}</h2>
          <FaqList items={s.items} facts={facts} />
        </section>
      ))}
    </ContentPage>
  );
}
