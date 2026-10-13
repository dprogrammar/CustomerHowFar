"use client";

import { useId, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteOwnAccountAction } from "@/lib/accounts/actions";
import { FormAlert } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Label } from "@/components/ui/input";

/** "Delete my account": confirmed by typing DELETE and re-entering the password. */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  function confirm() {
    setError(null);
    startTransition(async () => {
      // On success the action signs out and redirects.
      const outcome = await deleteOwnAccountAction({ confirmText, password });
      if (outcome && !outcome.ok) setError(outcome.error);
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        onClick={() => {
          setConfirmText("");
          setPassword("");
          setError(null);
          setOpen(true);
        }}
        className="text-red-700 hover:border-red-200 hover:bg-red-50"
      >
        <Trash2 aria-hidden="true" />
        Delete my account
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete your account?"
        description="This can't be undone."
        confirmLabel="Delete my account"
        confirmVariant="danger"
        confirmDisabled={confirmText !== "DELETE" || password.length === 0}
        onConfirm={confirm}
        pending={pending}
      >
        <div className="space-y-3 text-sm text-gray-800">
          {error && <FormAlert status="error">{error}</FormAlert>}
          <div>
            <Label htmlFor={`${id}-confirm`}>Type DELETE to confirm</Label>
            <Input
              id={`${id}-confirm`}
              autoComplete="off"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`${id}-password`}>Your password</Label>
            <Input
              id={`${id}-password`}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>
      </ConfirmDialog>
    </>
  );
}
