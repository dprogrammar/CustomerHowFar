import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircleQuestion, Pencil, Plus, ThumbsDown, ThumbsUp } from "lucide-react";
import { listUnansweredGroups } from "@/lib/assistant/unanswered";
import { requireAdmin } from "@/lib/auth/session";
import { FAQ_CATEGORIES } from "@/lib/help/rules";
import { prisma } from "@/lib/prisma";
import { readParam } from "@/lib/search/url";
import { DismissUnanswered, FaqRowControls } from "@/components/admin/help-assistant-controls";
import { FormAlert } from "@/components/auth/form-fields";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Help assistant" };

const dateFmt = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function helpfulPercent(yes: number, no: number) {
  return yes + no === 0 ? null : Math.round((yes / (yes + no)) * 100);
}

async function Unanswered() {
  await requireAdmin();
  const groups = await listUnansweredGroups();
  if (groups.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-white p-4 text-sm text-gray-700">
        No unanswered questions right now.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {groups.slice(0, 50).map((g) => (
        <li key={g.ids[0]} className="rounded-xl border border-border bg-white p-4 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={g.count > 1 ? "accent" : "outline"}>
              Asked {g.count} time{g.count === 1 ? "" : "s"}
            </Badge>
            <span className="text-xs text-gray-600">
              Last asked {dateFmt.format(g.lastAskedOn)}
            </span>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-gray-900">
            {g.examples.map((e, i) => (
              <li key={i} className="break-words">
                &ldquo;{e}&rdquo;
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/help-assistant/new?from=${g.ids[0]}`}
              className={buttonVariants({ size: "sm" })}
            >
              <Plus aria-hidden="true" />
              Add as a help answer<span className="sr-only">: {g.examples[0]}</span>
            </Link>
            <DismissUnanswered ids={g.ids} label={g.examples[0] ?? ""} />
          </div>
        </li>
      ))}
    </ul>
  );
}

async function Entries() {
  await requireAdmin();
  const entries = await prisma.faqEntry.findMany({
    orderBy: [{ sortOrder: "asc" }, { question: "asc" }],
    select: {
      id: true,
      slug: true,
      question: true,
      category: true,
      isActive: true,
      visibility: true,
      timesShown: true,
      helpfulCount: true,
      notHelpfulCount: true,
    },
  });
  const totals = entries.reduce(
    (t, e) => ({
      shown: t.shown + e.timesShown,
      yes: t.yes + e.helpfulCount,
      no: t.no + e.notHelpfulCount,
    }),
    { shown: 0, yes: 0, no: 0 },
  );
  const overall = helpfulPercent(totals.yes, totals.no);

  return (
    <>
      <p className="mb-4 text-sm text-gray-700" role="status">
        {entries.filter((e) => e.isActive).length} of {entries.length} answers shown · answered{" "}
        {totals.shown} time{totals.shown === 1 ? "" : "s"} in the chat
        {overall !== null ? ` · ${overall}% found helpful (${totals.yes + totals.no} votes)` : ""}
      </p>
      {FAQ_CATEGORIES.map((c) => {
        const section = entries.filter((e) => e.category === c.key);
        if (section.length === 0) return null;
        return (
          <section key={c.key} aria-labelledby={`section-${c.key}`} className="mb-6">
            <h3 id={`section-${c.key}`} className="mb-2 text-base font-semibold text-gray-900">
              {c.label}
            </h3>
            <ol className="space-y-2">
              {section.map((e, i) => {
                const pct = helpfulPercent(e.helpfulCount, e.notHelpfulCount);
                return (
                  <li
                    key={e.id}
                    className="rounded-xl border border-border bg-white p-4 shadow-card"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">
                          {e.question} {!e.isActive && <Badge variant="outline">Hidden</Badge>}
                          {e.visibility !== "ALWAYS" && (
                            <Badge variant="accent">
                              {e.visibility === "FEE_ON"
                                ? "Only when fee is on"
                                : "Only when fee is off"}
                            </Badge>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-600">
                          /help#{e.slug} · shown {e.timesShown}×
                          <span className="ml-2 inline-flex items-center gap-1">
                            <ThumbsUp aria-hidden="true" className="size-3" />
                            <span className="sr-only">Helpful:</span>
                            {e.helpfulCount}
                          </span>
                          <span className="ml-2 inline-flex items-center gap-1">
                            <ThumbsDown aria-hidden="true" className="size-3" />
                            <span className="sr-only">Not helpful:</span>
                            {e.notHelpfulCount}
                          </span>
                          {pct !== null && <span className="ml-2">({pct}% helpful)</span>}
                        </p>
                      </div>
                      <Link
                        href={`/admin/help-assistant/${e.id}`}
                        className={buttonVariants({ size: "sm", variant: "outline" })}
                      >
                        <Pencil aria-hidden="true" />
                        Edit<span className="sr-only">: {e.question}</span>
                      </Link>
                    </div>
                    <div className="mt-3">
                      <FaqRowControls
                        id={e.id}
                        question={e.question}
                        isActive={e.isActive}
                        isFirst={i === 0}
                        isLast={i === section.length - 1}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </>
  );
}

async function SavedNote({
  searchParams,
}: {
  searchParams: PageProps<"/admin/help-assistant">["searchParams"];
}) {
  const saved = readParam((await searchParams).saved);
  if (saved !== "added" && saved !== "updated") return null;
  return (
    <FormAlert status="success" className="mb-5">
      {saved === "added" ? "Question added." : "Changes saved."} The Help Centre and the chat
      assistant show it straight away.
    </FormAlert>
  );
}

const skeleton = <div className="h-40 animate-pulse rounded-xl bg-muted" aria-hidden="true" />;

export default function AdminHelpAssistantPage(props: PageProps<"/admin/help-assistant">) {
  return (
    <>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900">
          <MessageCircleQuestion aria-hidden="true" className="size-6 text-brand-700" />
          Help assistant
        </h1>
        <Link href="/admin/help-assistant/new" className={buttonVariants({ size: "sm" })}>
          <Plus aria-hidden="true" />
          Add a question
        </Link>
      </div>
      <p className="mb-5 text-sm text-gray-700">
        These answers power the{" "}
        <Link href="/help" className="font-medium text-brand-700 underline">
          Help Centre
        </Link>{" "}
        and the HowFar Assistant chat. The assistant is free to run: it answers only from these
        entries and live data, with no AI service.
      </p>
      <Suspense fallback={null}>
        <SavedNote searchParams={props.searchParams} />
      </Suspense>

      <h2 className="mb-1 text-lg font-semibold text-gray-900">Unanswered questions</h2>
      <p className="mb-3 text-sm text-gray-700">
        Questions the chat couldn&apos;t answer, grouped when they&apos;re similar. Stored without
        names, emails or phone numbers, and deleted after 180 days.
      </p>
      <Suspense fallback={skeleton}>
        <Unanswered />
      </Suspense>

      <h2 className="mt-8 mb-3 text-lg font-semibold text-gray-900">Help answers</h2>
      <Suspense fallback={skeleton}>
        <Entries />
      </Suspense>
    </>
  );
}
