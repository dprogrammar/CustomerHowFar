import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listUnansweredGroups } from "@/lib/assistant/unanswered";
import { requireAdmin } from "@/lib/auth/session";
import { getLiveFacts } from "@/lib/help/server";
import { slugFromQuestion } from "@/lib/help/rules";
import { readParam } from "@/lib/search/url";
import { FaqForm } from "@/components/admin/faq-form";

export const metadata: Metadata = { title: "Add a help answer" };

/** "Add as a help answer" from an unanswered question pre-fills the question. */
async function NewFaq({
  searchParams,
}: {
  searchParams: PageProps<"/admin/help-assistant/new">["searchParams"];
}) {
  await requireAdmin();
  const from = readParam((await searchParams).from, 40);
  const [facts, groups] = await Promise.all([
    getLiveFacts(),
    from ? listUnansweredGroups() : Promise.resolve([]),
  ]);
  const group = from ? groups.find((g) => g.ids.includes(from)) : undefined;
  const question = group?.examples[0] ?? "";
  return (
    <>
      {group && (
        <p className="mb-4 text-sm text-gray-700">
          Answering a question asked {group.count} time{group.count === 1 ? "" : "s"}. Tidy the
          wording, and add the other ways people asked as keywords.
        </p>
      )}
      <FaqForm
        facts={facts}
        resolveIds={group?.ids}
        initial={{
          question,
          slug: slugFromQuestion(question),
          answer: "",
          keywords: group ? group.examples.slice(1).join("\n") : "",
          category: "CUSTOMERS",
          visibility: "ALWAYS",
          isActive: true,
        }}
      />
    </>
  );
}

export default function NewFaqPage(props: PageProps<"/admin/help-assistant/new">) {
  return (
    <>
      <Link
        href="/admin/help-assistant"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700 underline underline-offset-2"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Help assistant
      </Link>
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-gray-900">Add a help answer</h1>
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
      >
        <NewFaq searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
