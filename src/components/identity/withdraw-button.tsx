"use client";

import { useState, useTransition } from "react";
import { Undo2 } from "lucide-react";
import { withdrawIdentityAction, type IdentityActionResult } from "@/lib/identity/actions";
import { FormAlert } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Lets the owner take back an unreviewed submission (e.g. a blurry photo) and start again. A small
 * secondary option behind a confirmation: the page's main action is to continue with the listing.
 */
export function WithdrawIdentityButton() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<IdentityActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      {result && !result.ok && <FormAlert status="error">{result.error}</FormAlert>}
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} disabled={pending}>
        <Undo2 aria-hidden="true" />
        Withdraw and start again
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Withdraw your ID submission?"
        description="Your photos are deleted straight away and our team won't review them. You can submit again afterwards."
        confirmLabel="Withdraw"
        confirmVariant="danger"
        onConfirm={() =>
          startTransition(async () => {
            const outcome = await withdrawIdentityAction();
            setResult(outcome);
            setOpen(false);
          })
        }
        pending={pending}
      />
    </div>
  );
}
