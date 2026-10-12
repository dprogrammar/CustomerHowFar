"use client";

import { useId, useState, useTransition } from "react";
import {
  BadgeCheck,
  CircleCheck,
  MessageSquareWarning,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  Star,
} from "lucide-react";
import {
  approveListingAction,
  markRecheckedAction,
  reinstateListingAction,
  requestChangesAction,
  setListingFlagAction,
  suspendListingAction,
  type AdminActionResult,
} from "@/lib/admin/actions";
import type { BusinessStatus } from "@/lib/business/rules";
import { FormAlert } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label, Textarea } from "@/components/ui/input";

export const QUICK_REASONS = [
  "Photos are unclear or not your work. Please upload clear photos of jobs you have done yourself.",
  "Phone number unreachable. Please check your phone and WhatsApp numbers are correct and active.",
  "Description incomplete. Please describe the services you offer, your experience and your prices or how you charge.",
  "Wrong category. Please choose the category that best matches your main service.",
  "Address incomplete. Please add your street address and a nearby landmark so customers can find you.",
];

const QUICK_LABELS = [
  "Photos unclear / not your work",
  "Phone unreachable",
  "Description incomplete",
  "Wrong category",
  "Address incomplete",
];

type Dialog = "approve" | "reject" | "suspend" | "reinstate" | null;

export function ModerationPanel({
  businessId,
  businessName,
  status,
  needsRecheck,
  isVerified,
  isFeatured,
  paymentBlocksApproval,
}: {
  businessId: string;
  businessName: string;
  status: BusinessStatus;
  needsRecheck: boolean;
  isVerified: boolean;
  isFeatured: boolean;
  /** Fee was on at submission and there's no successful payment. */
  paymentBlocksApproval: boolean;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [comment, setComment] = useState("");
  const [result, setResult] = useState<AdminActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const commentId = useId();

  const expected = { businessId, expectedStatus: status };

  function run(action: () => Promise<AdminActionResult>) {
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) {
        setDialog(null);
        setComment("");
      }
    });
  }

  const canApprove = status === "PENDING_REVIEW";
  const canReject = status === "PENDING_REVIEW" || status === "APPROVED";
  const canSuspend = ["APPROVED", "PENDING_REVIEW", "PENDING_PAYMENT", "REJECTED"].includes(status);
  const canReinstate = status === "SUSPENDED";
  const canRecheck = status === "APPROVED" && needsRecheck;

  return (
    <section
      aria-labelledby="moderation-title"
      className="rounded-xl border border-border bg-white p-4 shadow-card sm:p-5"
    >
      <h2 id="moderation-title" className="text-base font-semibold text-gray-900">
        Actions
      </h2>

      <div aria-live="polite" className="mt-3 empty:hidden">
        {result && (
          <FormAlert status={result.ok ? "success" : "error"}>
            {result.ok ? result.message : result.error}
          </FormAlert>
        )}
      </div>

      {paymentBlocksApproval && canApprove && (
        <p className="mt-3 rounded-lg bg-accent-50 p-3 text-sm text-accent-900 ring-1 ring-accent-200">
          Submitted while the listing fee was on, with no successful payment. It can&apos;t be
          approved until the owner pays.
        </p>
      )}

      <div className="mt-4 grid gap-2">
        {canApprove && (
          <Button
            size="lg"
            onClick={() => setDialog("approve")}
            disabled={pending || paymentBlocksApproval}
          >
            <CircleCheck aria-hidden="true" />
            Approve
          </Button>
        )}
        {canReject && (
          <Button size="lg" variant="accent" onClick={() => setDialog("reject")} disabled={pending}>
            <MessageSquareWarning aria-hidden="true" />
            Request changes
          </Button>
        )}
        {canRecheck && (
          <Button
            size="lg"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => markRecheckedAction(expected))}
          >
            <RefreshCcw aria-hidden="true" />
            Mark as re-checked
          </Button>
        )}
        {canReinstate && (
          <Button size="lg" onClick={() => setDialog("reinstate")} disabled={pending}>
            <ShieldCheck aria-hidden="true" />
            Reinstate
          </Button>
        )}
        {canSuspend && (
          <Button
            size="lg"
            variant="outline"
            onClick={() => setDialog("suspend")}
            disabled={pending}
            className="text-red-700 hover:border-red-200 hover:bg-red-50"
          >
            <ShieldAlert aria-hidden="true" />
            Suspend
          </Button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4">
        <Button
          variant={isVerified ? "secondary" : "outline"}
          aria-pressed={isVerified}
          disabled={pending}
          onClick={() =>
            run(() => setListingFlagAction({ businessId, flag: "verified", value: !isVerified }))
          }
        >
          <BadgeCheck aria-hidden="true" />
          {isVerified ? "Verified" : "Verify"}
        </Button>
        <Button
          variant={isFeatured ? "secondary" : "outline"}
          aria-pressed={isFeatured}
          disabled={pending || (status !== "APPROVED" && !isFeatured)}
          onClick={() =>
            run(() => setListingFlagAction({ businessId, flag: "featured", value: !isFeatured }))
          }
        >
          <Star aria-hidden="true" />
          {isFeatured ? "Featured" : "Feature"}
        </Button>
      </div>

      <ConfirmDialog
        open={dialog === "approve"}
        onClose={() => setDialog(null)}
        title={`Approve ${businessName}?`}
        description="The listing goes live immediately and the owner gets a “Your listing is live” email."
        confirmLabel="Approve and publish"
        onConfirm={() => run(() => approveListingAction(expected))}
        pending={pending}
      />

      <ConfirmDialog
        open={dialog === "reject"}
        onClose={() => setDialog(null)}
        title="Request changes"
        description={
          status === "APPROVED"
            ? "This listing is live. Requesting changes takes it offline until the owner resubmits."
            : "The owner will be emailed your note with a link to fix and resubmit."
        }
        confirmLabel="Send to owner"
        confirmVariant="accent"
        confirmDisabled={comment.trim().length < 10}
        onConfirm={() => run(() => requestChangesAction({ ...expected, comment }))}
        pending={pending}
      >
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-800">Quick reasons</legend>
          <div className="flex flex-wrap gap-2">
            {QUICK_REASONS.map((reason, index) => (
              <button
                key={reason}
                type="button"
                onClick={() =>
                  setComment((current) =>
                    current.trim() ? `${current.trim()}\n${reason}` : reason,
                  )
                }
                className="rounded-full bg-muted px-3 py-1.5 text-sm text-gray-800 ring-1 ring-border hover:bg-brand-50"
              >
                {QUICK_LABELS[index]}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="mt-4">
          <Label htmlFor={commentId}>Note to the owner (they will see this)</Label>
          <Textarea
            id={commentId}
            rows={5}
            maxLength={1000}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
          <p className="mt-1 text-sm text-gray-600">
            At least 10 characters. Be specific and kind.
          </p>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "suspend"}
        onClose={() => setDialog(null)}
        title={`Suspend ${businessName}?`}
        description="The listing is hidden from customers immediately and the owner can't edit it. They are emailed the reason."
        confirmLabel="Suspend listing"
        confirmVariant="danger"
        confirmDisabled={comment.trim().length < 10}
        onConfirm={() => run(() => suspendListingAction({ ...expected, comment }))}
        pending={pending}
      >
        <Label htmlFor={`${commentId}-suspend`}>Reason (the owner will see this)</Label>
        <Textarea
          id={`${commentId}-suspend`}
          rows={4}
          maxLength={1000}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "reinstate"}
        onClose={() => setDialog(null)}
        title={`Reinstate ${businessName}?`}
        description="If it was live before, it goes live again (flagged for a re-check). Otherwise it returns to the review queue."
        confirmLabel="Reinstate"
        onConfirm={() => run(() => reinstateListingAction(expected))}
        pending={pending}
      />
    </section>
  );
}
