"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldBan, ShieldCheck, Trash2, UserCog } from "lucide-react";
import {
  changeUserRoleAction,
  deleteUserAction,
  suspendUserAction,
  unsuspendUserAction,
  type UserAdminResult,
} from "@/lib/admin/user-actions";
import { FormAlert } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { ROLE_LABELS } from "./user-badges";

type Dialog = "suspend" | "unsuspend" | "role" | "delete" | null;
type RoleValue = "CUSTOMER" | "BUSINESS_OWNER" | "ADMIN";

/**
 * Suspend / unsuspend, change role and delete. The server enforces every rule again (not on
 * yourself, never the last admin, extra confirmation for admins).
 */
export function UserActionsPanel({
  userId,
  name,
  role,
  status,
  isSelf,
  isLastAdmin,
}: {
  userId: string;
  name: string;
  role: RoleValue;
  status: "ACTIVE" | "SUSPENDED";
  isSelf: boolean;
  isLastAdmin: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState("");
  const [newRole, setNewRole] = useState<RoleValue>(role);
  const [confirmText, setConfirmText] = useState("");
  const [confirmAdmin, setConfirmAdmin] = useState(false);
  const [result, setResult] = useState<UserAdminResult | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  function open(d: Dialog) {
    setReason("");
    setConfirmText("");
    setConfirmAdmin(false);
    setDialog(d);
  }

  function run(action: () => Promise<UserAdminResult>, after?: () => void) {
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) {
        setDialog(null);
        after?.();
      }
    });
  }

  const locked = isSelf || isLastAdmin;

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="rounded-xl border border-border bg-white p-4 shadow-card sm:p-5"
    >
      <h2 id={`${id}-title`} className="text-base font-semibold text-gray-900">
        Actions
      </h2>
      <div aria-live="polite" className="mt-3 empty:hidden">
        {result && (
          <FormAlert status={result.ok ? "success" : "error"}>
            {result.ok ? result.message : result.error}
          </FormAlert>
        )}
      </div>
      {isSelf && (
        <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-gray-800">
          This is your own account. Another admin must suspend, delete or change the role of it.
        </p>
      )}
      {!isSelf && isLastAdmin && (
        <p className="mt-3 rounded-lg bg-accent-50 p-3 text-sm text-accent-900 ring-1 ring-accent-200">
          This is the last active admin, so it can&apos;t be suspended, deleted or demoted. Make
          someone else an admin first.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2">
        {status === "ACTIVE" ? (
          <Button
            size="lg"
            variant="outline"
            disabled={pending || locked}
            onClick={() => open("suspend")}
            className="text-red-700 hover:border-red-200 hover:bg-red-50"
          >
            <ShieldBan aria-hidden="true" />
            Suspend user
          </Button>
        ) : (
          <Button size="lg" disabled={pending} onClick={() => open("unsuspend")}>
            <ShieldCheck aria-hidden="true" />
            Unsuspend user
          </Button>
        )}
        <Button
          size="lg"
          variant="outline"
          disabled={pending || isSelf}
          onClick={() => {
            setNewRole(role);
            open("role");
          }}
        >
          <UserCog aria-hidden="true" />
          Change role
        </Button>
        <Button
          size="lg"
          variant="danger"
          disabled={pending || locked}
          onClick={() => open("delete")}
        >
          <Trash2 aria-hidden="true" />
          Delete user
        </Button>
      </div>

      <ConfirmDialog
        open={dialog === "suspend"}
        onClose={() => setDialog(null)}
        title={`Suspend ${name}?`}
        description="They are signed out everywhere and can't log in. All their listings are hidden from customers (and restored exactly if you unsuspend). Their email stays registered, so they can't sign up again with it. They are emailed your reason."
        confirmLabel="Suspend user"
        confirmVariant="danger"
        confirmDisabled={reason.trim().length < 10}
        onConfirm={() => run(() => suspendUserAction({ userId, reason }))}
        pending={pending}
      >
        <Label htmlFor={`${id}-reason`}>Reason (the user will see this)</Label>
        <Textarea
          id={`${id}-reason`}
          rows={4}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <p className="mt-1 text-sm text-gray-600">At least 10 characters.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "unsuspend"}
        onClose={() => setDialog(null)}
        title={`Unsuspend ${name}?`}
        description="They can log in again, and each of their listings returns to the status it had before the suspension."
        confirmLabel="Unsuspend user"
        onConfirm={() => run(() => unsuspendUserAction({ userId }))}
        pending={pending}
      />

      <ConfirmDialog
        open={dialog === "role"}
        onClose={() => setDialog(null)}
        title={`Change ${name}'s role`}
        description="Admins can see and change everything in the admin area. Removing the admin role signs them out everywhere."
        confirmLabel="Save role"
        confirmDisabled={newRole === role || (role === "ADMIN" && isLastAdmin)}
        onConfirm={() => run(() => changeUserRoleAction({ userId, role: newRole }))}
        pending={pending}
      >
        <Label htmlFor={`${id}-role`}>Role</Label>
        <Select
          id={`${id}-role`}
          value={newRole}
          onChange={(e) => setNewRole(e.target.value as RoleValue)}
        >
          {(["CUSTOMER", "BUSINESS_OWNER", "ADMIN"] as const).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        title={`Delete ${name}'s account?`}
        description="This can't be undone."
        confirmLabel="Delete account"
        confirmVariant="danger"
        confirmDisabled={confirmText !== "DELETE" || (role === "ADMIN" && !confirmAdmin)}
        onConfirm={() =>
          run(
            () =>
              deleteUserAction({ userId, confirmText, confirmAdmin, reason: reason || undefined }),
            () => router.push("/admin/users"),
          )
        }
        pending={pending}
      >
        <div className="space-y-3 text-sm text-gray-800">
          <ul className="list-disc space-y-1 pl-5">
            <li>Their businesses, photos, reviews, saved businesses and ID photos are deleted.</li>
            <li>Their login is deleted and their profile is erased.</li>
            <li>Payment records are kept for accounting, without their name, email or phone.</li>
          </ul>
          <p className="rounded-lg bg-accent-50 p-3 text-accent-900 ring-1 ring-accent-200">
            <strong className="font-semibold">
              After deletion the email is free to register again.
            </strong>{" "}
            For scammers and repeat offenders, suspend them instead: a suspended email can&apos;t
            sign up again.
          </p>
          {status === "ACTIVE" && (
            <Button
              type="button"
              variant="outline"
              fullWidth
              disabled={locked}
              onClick={() => open("suspend")}
            >
              <ShieldBan aria-hidden="true" />
              Suspend instead
            </Button>
          )}
          <div>
            <Label htmlFor={`${id}-del-reason`}>Note for the audit log (optional)</Label>
            <Input
              id={`${id}-del-reason`}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {role === "ADMIN" && (
            <label className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
              <input
                type="checkbox"
                checked={confirmAdmin}
                onChange={(e) => setConfirmAdmin(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-red-700"
              />
              <span>I understand this person is an admin and will lose all admin access.</span>
            </label>
          )}
          <div>
            <Label htmlFor={`${id}-confirm`}>Type DELETE to confirm</Label>
            <Input
              id={`${id}-confirm`}
              autoComplete="off"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </div>
        </div>
      </ConfirmDialog>
    </section>
  );
}
