"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteOwnBusinessAction } from "@/lib/accounts/actions";
import { adminDeleteBusinessAction } from "@/lib/admin/user-actions";
import { FormAlert } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Label, Textarea } from "@/components/ui/input";

type Result = { ok: true; message: string } | { ok: false; error: string };

/**
 * Delete a business: owners for their own, admins (with a reason the owner is emailed) for any.
 * Confirmed by typing the business name.
 */
export function DeleteBusinessButton({
  businessId,
  businessName,
  mode,
  hasPayments,
  redirectTo,
}: {
  businessId: string;
  businessName: string;
  mode: "owner" | "admin";
  hasPayments: boolean;
  /** Where to go after deleting (admins leave the deleted listing's page). */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();
  const nameMatches = confirmName.trim() === businessName.trim();

  function confirm() {
    startTransition(async () => {
      const outcome =
        mode === "admin"
          ? await adminDeleteBusinessAction({ businessId, confirmName, reason })
          : await deleteOwnBusinessAction({ businessId, confirmName });
      setResult(outcome);
      if (outcome.ok) {
        setOpen(false);
        if (redirectTo) router.push(redirectTo);
      }
    });
  }

  return (
    <>
      {result && (
        <FormAlert status={result.ok ? "success" : "error"} className="mb-3">
          {result.ok ? result.message : result.error}
        </FormAlert>
      )}
      <Button
        variant="outline"
        size={mode === "admin" ? "lg" : "md"}
        onClick={() => {
          setConfirmName("");
          setReason("");
          setResult(null);
          setOpen(true);
        }}
        disabled={pending}
        className="text-red-700 hover:border-red-200 hover:bg-red-50"
      >
        <Trash2 aria-hidden="true" />
        Delete business
        {mode === "owner" && <span className="sr-only">: {businessName}</span>}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete ${businessName}?`}
        description="This can't be undone."
        confirmLabel="Delete business"
        confirmVariant="danger"
        confirmDisabled={!nameMatches || (mode === "admin" && reason.trim().length < 10)}
        onConfirm={confirm}
        pending={pending}
      >
        <div className="space-y-3 text-sm text-gray-800">
          <ul className="list-disc space-y-1 pl-5">
            <li>The listing disappears from CustomerHowFar straight away.</li>
            <li>Its photos, logo, cover, reviews and saves are deleted.</li>
            {hasPayments && (
              <li>Its payment records are kept for accounting, with only the business name.</li>
            )}
          </ul>
          {mode === "admin" && (
            <div>
              <Label htmlFor={`${id}-reason`}>Reason (emailed to the owner)</Label>
              <Textarea
                id={`${id}-reason`}
                rows={3}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="mt-1 text-sm text-gray-600">At least 10 characters.</p>
            </div>
          )}
          <div>
            <Label htmlFor={`${id}-name`}>
              Type <strong className="font-semibold">{businessName}</strong> to confirm
            </Label>
            <Input
              id={`${id}-name`}
              autoComplete="off"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
            />
          </div>
        </div>
      </ConfirmDialog>
    </>
  );
}
