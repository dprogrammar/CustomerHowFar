"use client";

import { useId, useState, useTransition } from "react";
import {
  CircleCheck,
  IdCard,
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
import { acceptIdentityAndApproveAction } from "@/lib/identity/admin-actions";
import { IDENTITY_STATE_LABELS, type IdentityState } from "@/lib/identity/rules";
import type { BusinessStatus } from "@/lib/business/rules";
import { FormAlert } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Label, Textarea } from "@/components/ui/input";

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

type Dialog = "approve" | "approveBoth" | "reject" | "suspend" | "reinstate" | null;

export function ModerationPanel({
  businessId,
  businessName,
  status,
  needsRecheck,
  isFeatured,
  paymentBlocksApproval,
  identity,
}: {
  businessId: string;
  businessName: string;
  status: BusinessStatus;
  needsRecheck: boolean;
  isFeatured: boolean;
  /** Fee was on at submission and there's no successful payment. */
  paymentBlocksApproval: boolean;
  /** The owner's ID check; listings can only be approved once it's accepted. */
  identity: { state: IdentityState; pendingId: string | null };
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [comment, setComment] = useState("");
  const [nameRead, setNameRead] = useState("");
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
        setNameRead("");
      }
    });
  }

  const canApprove = status === "PENDING_REVIEW";
  const canReject = status === "PENDING_REVIEW" || status === "APPROVED";
  const canSuspend = ["APPROVED", "PENDING_REVIEW", "PENDING_PAYMENT", "REJECTED"].includes(status);
  const canReinstate = status === "SUSPENDED";
  const canRecheck = status === "APPROVED" && needsRecheck;
  const idAccepted = identity.state === "APPROVED";
  const canApproveBoth = canApprove && identity.state === "PENDING" && identity.pendingId !== null;

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

      {canApprove && !idAccepted && (
        <p className="mt-3 rounded-lg bg-accent-50 p-3 text-sm text-accent-900 ring-1 ring-accent-200">
          Owner&apos;s ID check: <strong>{IDENTITY_STATE_LABELS[identity.state]}</strong>. The
          listing can&apos;t be approved until the owner&apos;s ID is accepted.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2">
        {canApproveBoth && (
          <Button
            size="lg"
            onClick={() => setDialog("approveBoth")}
            disabled={pending || paymentBlocksApproval}
          >
            <IdCard aria-hidden="true" />
            Accept ID and approve listing
          </Button>
        )}
        {canApprove && (
          <Button
            size="lg"
            variant={canApproveBoth ? "outline" : "primary"}
            onClick={() => setDialog("approve")}
            disabled={pending || paymentBlocksApproval || !idAccepted}
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

      <div className="mt-4 grid grid-cols-1 gap-2 border-t border-border pt-4">
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

      {identity.pendingId && (
        <ConfirmDialog
          open={dialog === "approveBoth"}
          onClose={() => setDialog(null)}
          title={"Accept ID and approve listing?"}
          description="Check that the face in the selfie matches the ID photo and that the ID is readable. Both decisions are recorded with your name and the time; the listing goes live and the owner is emailed."
          confirmLabel="Accept ID and approve"
          confirmDisabled={nameRead.trim().length < 2}
          onConfirm={() =>
            run(() =>
              acceptIdentityAndApproveAction({
                businessId,
                verificationId: identity.pendingId!,
                nameReadByAdmin: nameRead,
              }),
            )
          }
          pending={pending}
        >
          <div className="grid grid-cols-2 gap-2">
            {(["front", "selfie"] as const).map((kind) => (
              <a
                key={kind}
                href={`/admin/identity/${identity.pendingId}/image/${kind}`}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-lg bg-muted ring-1 ring-border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived private link */}
                <img
                  src={`/admin/identity/${identity.pendingId}/image/${kind}`}
                  alt={kind === "front" ? "ID photo" : "Selfie holding the ID"}
                  className="aspect-[4/3] w-full object-contain"
                />
              </a>
            ))}
          </div>
          <p className="mt-2 text-sm">
            <a
              href={`/admin/identity/${identity.pendingId}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand-700 underline"
            >
              Open the full ID check
            </a>{" "}
            to zoom in and see the history.
          </p>
          <div className="mt-3">
            <Label htmlFor={`${commentId}-name`}>Name you read on the ID</Label>
            <Input
              id={`${commentId}-name`}
              autoComplete="off"
              maxLength={120}
              value={nameRead}
              onChange={(event) => setNameRead(event.target.value)}
            />
          </div>
        </ConfirmDialog>
      )}

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
