"use client";

import { useId, useState, useTransition } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import {
  acceptIdentityAction,
  rejectIdentityAction,
  type IdentityAdminResult,
} from "@/lib/identity/admin-actions";
import { REJECTION_QUICK_REASONS } from "@/lib/identity/rules";
import { FormAlert } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Label, Textarea } from "@/components/ui/input";

/** Accept / reject a pending ID check. Every decision is confirmed and recorded with the admin. */
export function IdentityReviewPanel({ verificationId }: { verificationId: string }) {
  const [dialog, setDialog] = useState<"accept" | "reject" | null>(null);
  const [nameRead, setNameRead] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<IdentityAdminResult | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  function run(action: () => Promise<IdentityAdminResult>) {
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) setDialog(null);
    });
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="rounded-xl border border-border bg-white p-4 shadow-card sm:p-5"
    >
      <h2 id={`${id}-title`} className="text-base font-semibold text-gray-900">
        Decision
      </h2>
      <div aria-live="polite" className="mt-3 empty:hidden">
        {result && (
          <FormAlert status={result.ok ? "success" : "error"}>
            {result.ok ? result.message : result.error}
          </FormAlert>
        )}
      </div>

      <div className="mt-3">
        <Label htmlFor={`${id}-name`}>Name you read on the ID</Label>
        <Input
          id={`${id}-name`}
          autoComplete="off"
          maxLength={120}
          value={nameRead}
          onChange={(event) => setNameRead(event.target.value)}
        />
        <p className="mt-1 text-sm text-gray-600">
          Required to accept. Compare it with the names above.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2">
        <Button
          size="lg"
          onClick={() => setDialog("accept")}
          disabled={pending || nameRead.trim().length < 2}
        >
          <CircleCheck aria-hidden="true" />
          Accept ID
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={() => setDialog("reject")}
          disabled={pending}
          className="text-red-700 hover:border-red-200 hover:bg-red-50"
        >
          <CircleX aria-hidden="true" />
          Reject
        </Button>
      </div>

      <ConfirmDialog
        open={dialog === "accept"}
        onClose={() => setDialog(null)}
        title="Accept this ID?"
        description="Only accept if the ID is readable, the selfie clearly shows the same person holding it, and the names match. The owner's live listings will show the “ID submitted” badge and the owner is emailed."
        confirmLabel="Accept ID"
        onConfirm={() =>
          run(() => acceptIdentityAction({ verificationId, nameReadByAdmin: nameRead }))
        }
        pending={pending}
      />

      <ConfirmDialog
        open={dialog === "reject"}
        onClose={() => setDialog(null)}
        title="Reject this ID?"
        description="The owner is emailed your reason with a link to submit again."
        confirmLabel="Reject ID"
        confirmVariant="danger"
        confirmDisabled={reason.trim().length < 5}
        onConfirm={() => run(() => rejectIdentityAction({ verificationId, reason }))}
        pending={pending}
      >
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-800">Quick reasons</legend>
          <div className="flex flex-wrap gap-2">
            {REJECTION_QUICK_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={reason.includes(r)}
                onClick={() =>
                  setReason((current) => (current.trim() ? `${current.trim()}\n${r}` : r))
                }
                className="rounded-full bg-muted px-3 py-1.5 text-sm text-gray-800 ring-1 ring-border hover:bg-brand-50"
              >
                {r}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="mt-4">
          <Label htmlFor={`${id}-reason`}>Reason (the owner will see this)</Label>
          <Textarea
            id={`${id}-reason`}
            rows={4}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </ConfirmDialog>
    </section>
  );
}
