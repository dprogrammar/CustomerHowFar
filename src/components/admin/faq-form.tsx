"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveFaqAction, type HelpActionResult } from "@/lib/admin/help-actions";
import { fillFacts, PLACEHOLDERS, type LiveFacts } from "@/lib/help/facts";
import { Markdown } from "@/lib/help/markdown";
import { FAQ_CATEGORIES, FAQ_LIMITS, slugFromQuestion, type FaqCategoryKey } from "@/lib/help/rules";
import { FormAlert } from "@/components/auth/form-fields";
import { proseClass } from "@/components/content/content-page";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type FaqFormValues = {
  id?: string;
  question: string;
  slug: string;
  answer: string;
  keywords: string;
  category: FaqCategoryKey;
  isActive: boolean;
};

function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-red-700">
      {errors[0]}
    </p>
  );
}

/** Add or edit a help entry, with a live preview using today's live facts. */
export function FaqForm({
  initial,
  facts,
  resolveIds,
}: {
  initial: FaqFormValues;
  facts: LiveFacts;
  /** Unanswered questions to remove once this new entry is saved. */
  resolveIds?: string[];
}) {
  const router = useRouter();
  const isNew = !initial.id;
  const [v, setV] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [result, setResult] = useState<HelpActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const ids = {
    question: useId(),
    category: useId(),
    answer: useId(),
    answerHelp: useId(),
    keywords: useId(),
    keywordsHelp: useId(),
    slug: useId(),
    active: useId(),
    preview: useId(),
  };
  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;
  const set = <K extends keyof FaqFormValues>(key: K, value: FaqFormValues[K]) =>
    setV((current) => ({ ...current, [key]: value }));

  const onQuestion = (question: string) =>
    setV((current) => ({
      ...current,
      question,
      slug: slugTouched ? current.slug : slugFromQuestion(question),
    }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const r = await saveFaqAction({ ...v, resolveIds });
      setResult(r);
      if (r.ok) router.push(`/admin/help-assistant?saved=${isNew ? "added" : "updated"}`);
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <form onSubmit={submit} noValidate className="space-y-5 rounded-xl border border-border bg-white p-4 sm:p-5">
        {result && !result.ok && <FormAlert status="error">{result.error}</FormAlert>}

        <div>
          <Label htmlFor={ids.question}>Question</Label>
          <Input
            id={ids.question}
            value={v.question}
            onChange={(e) => onQuestion(e.target.value)}
            maxLength={FAQ_LIMITS.questionMax}
            required
            aria-invalid={Boolean(fieldErrors?.question)}
            aria-describedby={fieldErrors?.question ? `${ids.question}-e` : undefined}
          />
          <FieldError id={`${ids.question}-e`} errors={fieldErrors?.question} />
        </div>

        <div>
          <Label htmlFor={ids.category}>Help section</Label>
          <Select
            id={ids.category}
            value={v.category}
            onChange={(e) => set("category", e.target.value as FaqCategoryKey)}
          >
            {FAQ_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor={ids.answer}>Answer</Label>
          <Textarea
            id={ids.answer}
            value={v.answer}
            onChange={(e) => set("answer", e.target.value)}
            rows={9}
            maxLength={FAQ_LIMITS.answerMax}
            required
            aria-invalid={Boolean(fieldErrors?.answer)}
            aria-describedby={`${ids.answerHelp}${fieldErrors?.answer ? ` ${ids.answer}-e` : ""}`}
          />
          <FieldError id={`${ids.answer}-e`} errors={fieldErrors?.answer} />
          <div id={ids.answerHelp} className="mt-2 space-y-1.5 text-xs leading-5 text-gray-700">
            <p>
              Leave a blank line between paragraphs. Start lines with <code>- </code> for a list.
              Use <code>**bold**</code> and <code>[link text](/help)</code> for links to our pages.
            </p>
            <p>Live facts (filled in when shown, so they&apos;re never out of date):</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {PLACEHOLDERS.map((p) => (
                <li key={p.key}>
                  <code>{`{{${p.key}}}`}</code>: {p.description}
                </li>
              ))}
            </ul>
            <p>Never write bank account details here: they only appear on the payment page.</p>
          </div>
        </div>

        <div>
          <Label htmlFor={ids.keywords}>Other ways people ask (optional)</Label>
          <Textarea
            id={ids.keywords}
            value={v.keywords}
            onChange={(e) => set("keywords", e.target.value)}
            rows={4}
            aria-describedby={ids.keywordsHelp}
          />
          <p id={ids.keywordsHelp} className="mt-1.5 text-xs text-gray-700">
            One per line or separated by commas: synonyms, Pidgin and common phrases (e.g. &ldquo;how
            much e cost&rdquo;, &ldquo;register my shop&rdquo;). Helps the chat assistant find this
            answer.
          </p>
        </div>

        <div>
          <Label htmlFor={ids.slug}>Link on the Help Centre</Label>
          {isNew ? (
            <>
              <div className="flex items-center gap-1 text-sm text-gray-700">
                <span className="shrink-0">/help#</span>
                <Input
                  id={ids.slug}
                  value={v.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set("slug", e.target.value.toLowerCase());
                  }}
                  maxLength={FAQ_LIMITS.slugMax}
                  aria-invalid={Boolean(fieldErrors?.slug)}
                  aria-describedby={fieldErrors?.slug ? `${ids.slug}-e` : undefined}
                />
              </div>
              <FieldError id={`${ids.slug}-e`} errors={fieldErrors?.slug} />
              <p className="mt-1.5 text-xs text-gray-700">Can&apos;t be changed after saving.</p>
            </>
          ) : (
            <p id={ids.slug} className="text-sm text-gray-800">
              <code>/help#{v.slug}</code> (fixed, so existing links keep working)
            </p>
          )}
        </div>

        <label className="flex items-start gap-3 text-sm text-gray-800" htmlFor={ids.active}>
          <input
            id={ids.active}
            type="checkbox"
            checked={v.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-brand-600"
          />
          <span>
            <span className="font-medium text-gray-900">Show this answer</span>
            <span className="block text-gray-700">On the Help Centre and in the chat assistant.</span>
          </span>
        </label>

        {resolveIds && resolveIds.length > 0 && (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
            Saving removes {resolveIds.length} matching unanswered question
            {resolveIds.length === 1 ? "" : "s"} from the list.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : isNew ? "Add question" : "Save changes"}
          </Button>
          <Link href="/admin/help-assistant" className={buttonVariants({ variant: "outline" })}>
            Cancel
          </Link>
        </div>
      </form>

      <section aria-labelledby={ids.preview} className="min-w-0">
        <h2 id={ids.preview} className="mb-2 text-sm font-semibold text-gray-900">
          Preview (as shown on the Help Centre and in the chat)
        </h2>
        <div className="rounded-xl border border-border bg-white p-4 sm:p-5">
          <p className="font-semibold text-gray-900">{v.question || "Your question"}</p>
          <div className={cn(proseClass, "text-sm leading-6 [&>*:first-child]:!mt-2")}>
            {v.answer.trim() ? (
              <Markdown source={fillFacts(v.answer, facts)} />
            ) : (
              <p className="text-gray-500">Your answer will appear here.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
