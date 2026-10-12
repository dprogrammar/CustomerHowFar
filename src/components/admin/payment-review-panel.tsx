"use client";

import { useId, useState, useTransition } from "react";
import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import {
  confirmTransferAction,
  rejectTransferProofAction,
  type PaymentActionResult,
} from "@/lib/admin/payment-actions";
import { FormAlert } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label, Textarea } from "@/components/ui/input";

const QUICK_REASONS = [
  {
    label: "Money not received",
    text: "We haven't received this money in our account. Please check the transfer with your bank.",
  },
  {
    label: "Amount incorrect",
    text: "The amount received doesn't match the listing fee. Please transfer the exact amount.",
  },
  {
    label: "Receipt unclear",
    text: "The receipt is unclear. Please upload a clear screenshot or PDF of the transfer receipt.",
  },
  {
    label: "Reference missing",
    text: "We couldn't find the payment reference in the transfer narration. Please include the reference.",
  },
];

type Dialog = "confirm" | "approve" | "reject" | null;

export function PaymentReviewPanel({
  paymentId,
  canApprove,
  amountShort,
}: {
  paymentId: string;
  /** False if approval isn't possible (e.g. the listing was already reviewed). */
  canApprove: boolean;
  /** The declared amount is less than the fee: confirming is blocked on the server too. */
  amountShort: boolean;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<PaymentActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const reasonId = useId();

  function run(action: () => Promise<PaymentActionResult>) {
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) setDialog(null);
    });
  }

  return (
    <section
      aria-labelledby="review-title"
      className="rounded-xl border border-border bg-white p-4 shadow-card sm:p-5"
    >
      <h2 id="review-title" className="text-base font-semibold text-gray-900">
        Review this transfer
      </h2>
      <p className="mt-3 flex gap-2 rounded-lg bg-accent-50 p-3 text-sm font-medium text-accent-900 ring-1 ring-accent-200">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Confirm the money is in your bank account before confirming. Receipts can be faked.
      </p>
      <div aria-live="polite" className="mt-3 empty:hidden">
        {result && (
          <FormAlert status={result.ok ? "success" : "error"}>
            {result.ok ? result.message : result.error}
          </FormAlert>
        )}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2">
        <Button size="lg" onClick={() => setDialog("confirm")} disabled={pending || amountShort}>
          <CircleCheck aria-hidden="true" />
          Confirm payment
        </Button>
        <Button
          size="lg"
          variant="secondary"
          onClick={() => setDialog("approve")}
          disabled={pending || amountShort || !canApprove}
        >
          <CircleCheck aria-hidden="true" />
          Confirm payment and approve listing
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={() => setDialog("reject")}
          disabled={pending}
          className="text-red-700 hover:border-red-200 hover:bg-red-50"
        >
          <CircleX aria-hidden="true" />
          Reject proof
        </Button>
      </div>
      {amountShort && (
        <p className="mt-3 text-sm text-red-800">
          The amount declared is less than the fee, so it can&apos;t be confirmed. Reject it as
          &ldquo;Amount incorrect&rdquo;.
        </p>
      )}

      <ConfirmDialog
        open={dialog === "confirm"}
        onClose={() => setDialog(null)}
        title="Confirm this payment?"
        description="Only confirm if you can see the money in the bank account. The listing moves to the review queue and the owner gets a receipt by email."
        confirmLabel="Yes, the money is in the account"
        pending={pending}
        onConfirm={() => run(() => confirmTransferAction({ paymentId, approve: false }))}
      />
      <ConfirmDialog
        open={dialog === "approve"}
        onClose={() => setDialog(null)}
        title="Confirm payment and approve the listing?"
        description="Only do this if the money is in the account AND you have reviewed the listing. It goes live immediately; the owner gets a receipt and a 'listing is live' email."
        confirmLabel="Confirm and approve"
        pending={pending}
        onConfirm={() => run(() => confirmTransferAction({ paymentId, approve: true }))}
      />
      <ConfirmDialog
        open={dialog === "reject"}
        onClose={() => setDialog(null)}
        title="Reject this payment proof?"
        description="The owner is emailed your reason and can upload a new proof."
        confirmLabel="Reject proof"
        confirmVariant="danger"
        confirmDisabled={reason.trim().length < 5}
        pending={pending}
        onConfirm={() => run(() => rejectTransferProofAction({ paymentId, reason }))}
      >
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-800">Quick reasons</legend>
          <div className="flex flex-wrap gap-2">
            {QUICK_REASONS.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => setReason(r.text)}
                className="rounded-full bg-muted px-3 py-1.5 text-sm text-gray-800 ring-1 ring-border hover:bg-brand-50"
              >
                {r.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="mt-4">
          <Label htmlFor={reasonId}>Reason (the owner will see this)</Label>
          <Textarea
            id={reasonId}
            rows={4}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </ConfirmDialog>
    </section>
  );
}
