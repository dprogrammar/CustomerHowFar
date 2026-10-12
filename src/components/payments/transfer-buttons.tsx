"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Landmark, LoaderCircle, Undo2 } from "lucide-react";
import {
  startBankTransferAction,
  withdrawTransferProofAction,
} from "@/lib/payments/transfer-actions";
import { FormAlert } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/** Payment method option card. More methods (e.g. card) can be added as further cards. */
export function TransferMethodCard({
  businessId,
  label,
  description,
}: {
  businessId: string;
  label: string;
  description: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await startBankTransferAction(businessId);
            if (!result.ok) setError(result.error);
          })
        }
        className="flex w-full items-center gap-4 rounded-xl border-2 border-border bg-white p-4 text-left transition hover:border-brand-500 hover:bg-brand-50 disabled:opacity-60"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Landmark aria-hidden="true" className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-gray-900">{label}</span>
          <span className="block text-sm text-gray-700">{description}</span>
        </span>
        {pending ? (
          <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-gray-500" />
        ) : (
          <ArrowRight aria-hidden="true" className="size-5 text-gray-500" />
        )}
      </button>
      {error && (
        <FormAlert status="error" className="mt-3">
          {error}
        </FormAlert>
      )}
    </div>
  );
}

export function WithdrawProofButton({ paymentId }: { paymentId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Undo2 aria-hidden="true" />
        Withdraw and correct
      </Button>
      {error && (
        <FormAlert status="error" className="mt-3">
          {error}
        </FormAlert>
      )}
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Withdraw this proof?"
        description="Use this if you uploaded the wrong file or made a mistake. Your reference stays the same and you can upload a corrected proof straight away."
        confirmLabel="Withdraw proof"
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            const result = await withdrawTransferProofAction(paymentId);
            if (result.ok) setOpen(false);
            else {
              setError(result.error);
              setOpen(false);
            }
          })
        }
      />
    </>
  );
}
