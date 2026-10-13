"use client";

import { useId, useState, useTransition } from "react";
import { Flag, MessageSquareReply, Star, Trash2 } from "lucide-react";
import {
  deleteReviewAction,
  ownerReplyAction,
  reportReviewAction,
  saveReviewAction,
  type ReviewActionResult,
} from "@/lib/reviews/actions";
import {
  OWNER_REPLY_MAX,
  REVIEW_COMMENT_MAX,
  REVIEW_COMMENT_MIN,
  REVIEW_REPORT_REASONS,
  type ReviewReportReasonValue,
} from "@/lib/reviews/rules";
import { FormAlert } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const RATING_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

/** Accessible 1-5 star picker: a radio group with large tap targets. */
function StarInput({
  value,
  onChange,
  invalid,
}: {
  value: number;
  onChange: (v: number) => void;
  invalid: boolean;
}) {
  const name = useId();
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset aria-invalid={invalid || undefined}>
      <legend className="mb-1.5 text-sm font-medium text-gray-800">Your rating</legend>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            onMouseEnter={() => setHover(n)}
            className="flex size-11 cursor-pointer items-center justify-center rounded-lg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-ring"
          >
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="sr-only"
            />
            <Star
              aria-hidden="true"
              className={cn(
                "size-8 transition-colors",
                n <= shown ? "fill-accent-400 text-accent-500" : "fill-white text-gray-400",
              )}
            />
            <span className="sr-only">
              {n} star{n === 1 ? "" : "s"} ({RATING_WORDS[n]})
            </span>
          </label>
        ))}
        <span className="ml-2 text-sm font-medium text-gray-800" aria-hidden="true">
          {RATING_WORDS[shown]}
        </span>
      </div>
    </fieldset>
  );
}

export function ReviewForm({
  businessId,
  existing,
}: {
  businessId: string;
  existing: { id: string; rating: number; comment: string; hidden: boolean } | null;
}) {
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [result, setResult] = useState<ReviewActionResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const id = useId();
  const errors = result && !result.ok ? result.fieldErrors : undefined;
  const length = comment.trim().length;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      setResult(await saveReviewAction({ businessId, rating, comment }));
    });
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={existing ? "Edit your review" : "Write a review"}
      className="space-y-4 rounded-xl border border-border bg-white p-4 sm:p-5"
    >
      <h3 className="text-base font-semibold text-gray-900">
        {existing ? "Your review" : "Write a review"}
      </h3>
      {existing?.hidden && (
        <p className="rounded-lg bg-gray-100 p-3 text-sm text-gray-800">
          Our team has hidden your review because it was reported. Only you can see it.
        </p>
      )}
      {result && (
        <FormAlert status={result.ok ? "success" : "error"}>
          {result.ok ? result.message : result.error}
        </FormAlert>
      )}
      <StarInput value={rating} onChange={setRating} invalid={Boolean(errors?.rating)} />
      {errors?.rating && <p className="text-sm text-red-700">{errors.rating[0]}</p>}
      <div>
        <Label htmlFor={`${id}-comment`}>Your experience</Label>
        <Textarea
          id={`${id}-comment`}
          rows={4}
          maxLength={REVIEW_COMMENT_MAX}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          aria-invalid={errors?.comment ? true : undefined}
          aria-describedby={`${id}-hint`}
          placeholder="What did they do for you? Were you happy with the work, price and timing?"
        />
        <p
          id={`${id}-hint`}
          className={cn("mt-1 text-sm", errors?.comment ? "text-red-700" : "text-gray-600")}
        >
          {errors?.comment?.[0] ??
            `${length}/${REVIEW_COMMENT_MAX} characters${length < REVIEW_COMMENT_MIN ? ` (at least ${REVIEW_COMMENT_MIN})` : ""}`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {existing ? "Update review" : "Post review"}
        </Button>
        {existing && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={pending}
            onClick={() => setConfirmDelete(true)}
            className="text-red-700 hover:border-red-200 hover:bg-red-50"
          >
            <Trash2 aria-hidden="true" />
            Delete review
          </Button>
        )}
      </div>
      {existing && (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title="Delete your review?"
          description="Your review and rating are removed from this business."
          confirmLabel="Delete review"
          confirmVariant="danger"
          onConfirm={() =>
            startTransition(async () => {
              const outcome = await deleteReviewAction({ reviewId: existing.id });
              setResult(outcome);
              setConfirmDelete(false);
              if (outcome.ok) {
                setRating(0);
                setComment("");
              }
            })
          }
          pending={pending}
        />
      )}
    </form>
  );
}

export function OwnerReplyForm({
  reviewId,
  existingReply,
}: {
  reviewId: string;
  existingReply: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState(existingReply ?? "");
  const [result, setResult] = useState<ReviewActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  function save(value: string) {
    startTransition(async () => {
      const outcome = await ownerReplyAction({ reviewId, reply: value });
      setResult(outcome);
      if (outcome.ok) setOpen(false);
    });
  }

  return (
    <div className="mt-3">
      {result && (
        <FormAlert status={result.ok ? "success" : "error"} className="mb-2">
          {result.ok ? result.message : result.error}
        </FormAlert>
      )}
      {!open ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <MessageSquareReply aria-hidden="true" />
          {existingReply ? "Edit your reply" : "Reply"}
        </Button>
      ) : (
        <div className="space-y-2">
          <Label htmlFor={`${id}-reply`}>Your public reply</Label>
          <Textarea
            id={`${id}-reply`}
            rows={3}
            maxLength={OWNER_REPLY_MAX}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending || reply.trim().length === 0}
              onClick={() => save(reply)}
            >
              Save reply
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {existingReply && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => save("")}
                className="text-red-700"
              >
                Remove reply
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ReportReviewButton({ reviewId }: { reviewId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReviewReportReasonValue | "">("");
  const [result, setResult] = useState<ReviewActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const name = useId();

  return (
    <>
      {result ? (
        <p role="status" className={cn("text-xs", result.ok ? "text-gray-700" : "text-red-700")}>
          {result.ok ? result.message : result.error}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-9 items-center gap-1 rounded text-xs font-medium text-gray-600 hover:text-gray-900 hover:underline"
        >
          <Flag aria-hidden="true" className="size-3.5" />
          Report<span className="sr-only"> this review</span>
        </button>
      )}
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Report this review"
        description="Tell us what's wrong. Our team will check it; the reviewer isn't told who reported it."
        confirmLabel="Send report"
        confirmDisabled={!reason}
        onConfirm={() =>
          startTransition(async () => {
            if (!reason) return;
            setResult(await reportReviewAction({ reviewId, reason }));
            setOpen(false);
          })
        }
        pending={pending}
      >
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-800">Reason</legend>
          <div className="space-y-2">
            {REVIEW_REPORT_REASONS.map((r) => (
              <label
                key={r.value}
                className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 text-sm text-gray-900"
              >
                <input
                  type="radio"
                  name={name}
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="size-4 accent-brand-600"
                />
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>
      </ConfirmDialog>
    </>
  );
}
