"use client";

import { useId, useState, useTransition } from "react";
import { EyeOff, RotateCcw, ShieldBan, UserX, X } from "lucide-react";
import {
  dismissReviewReportsAction,
  hideReviewAction,
  resolveListingReportsAction,
  restoreReviewAction,
  type ReportActionResult,
} from "@/lib/admin/report-actions";
import { FormAlert } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label, Textarea } from "@/components/ui/input";

function Result({ result }: { result: ReportActionResult | null }) {
  if (!result) return null;
  return (
    <FormAlert status={result.ok ? "success" : "error"} className="mb-2">
      {result.ok ? result.message : result.error}
    </FormAlert>
  );
}

/** Hide / dismiss for a reported review, or restore for a hidden one. */
export function ReviewReportActions({ reviewId, hidden }: { reviewId: string; hidden: boolean }) {
  const [dialog, setDialog] = useState<"hide" | "dismiss" | "restore" | null>(null);
  const [result, setResult] = useState<ReportActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ReportActionResult>) =>
    startTransition(async () => {
      setResult(await action());
      setDialog(null);
    });

  return (
    <div className="mt-3">
      <Result result={result} />
      <div className="flex flex-wrap gap-2">
        {hidden ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setDialog("restore")}
          >
            <RotateCcw aria-hidden="true" />
            Restore review
          </Button>
        ) : (
          <>
            <Button size="sm" variant="danger" disabled={pending} onClick={() => setDialog("hide")}>
              <EyeOff aria-hidden="true" />
              Hide review
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setDialog("dismiss")}
            >
              <X aria-hidden="true" />
              Dismiss reports
            </Button>
          </>
        )}
      </div>
      <ConfirmDialog
        open={dialog === "hide"}
        onClose={() => setDialog(null)}
        title="Hide this review?"
        description="It disappears from the business page and stops counting in the rating. The reviewer still sees it, marked as hidden. You can restore it later."
        confirmLabel="Hide review"
        confirmVariant="danger"
        onConfirm={() => run(() => hideReviewAction({ reviewId }))}
        pending={pending}
      />
      <ConfirmDialog
        open={dialog === "dismiss"}
        onClose={() => setDialog(null)}
        title="Dismiss the reports?"
        description="The review stays visible and the open reports are closed."
        confirmLabel="Dismiss reports"
        onConfirm={() => run(() => dismissReviewReportsAction({ reviewId }))}
        pending={pending}
      />
      <ConfirmDialog
        open={dialog === "restore"}
        onClose={() => setDialog(null)}
        title="Restore this review?"
        description="It shows on the business page again and counts in the rating."
        confirmLabel="Restore review"
        onConfirm={() => run(() => restoreReviewAction({ reviewId }))}
        pending={pending}
      />
    </div>
  );
}

type ListingAction = "dismiss" | "suspend_listing" | "suspend_user";

const LISTING_DIALOGS: Record<
  ListingAction,
  { title: string; description: string; confirm: string; danger: boolean }
> = {
  dismiss: {
    title: "Dismiss these reports?",
    description: "The listing stays as it is and the open reports are closed.",
    confirm: "Dismiss reports",
    danger: false,
  },
  suspend_listing: {
    title: "Suspend this listing?",
    description:
      "It's hidden from customers immediately and the owner is emailed your reason. The reports are closed.",
    confirm: "Suspend listing",
    danger: true,
  },
  suspend_user: {
    title: "Suspend the owner?",
    description:
      "They can't log in, ALL their listings are hidden, and their email can't sign up again. They're emailed your reason. The reports are closed.",
    confirm: "Suspend owner",
    danger: true,
  },
};

export function ListingReportActions({
  businessId,
  canSuspendListing,
  canSuspendUser,
}: {
  businessId: string;
  canSuspendListing: boolean;
  canSuspendUser: boolean;
}) {
  const [dialog, setDialog] = useState<ListingAction | null>(null);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<ReportActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();
  const open = (a: ListingAction) => {
    setReason("");
    setDialog(a);
  };
  const d = dialog ? LISTING_DIALOGS[dialog] : null;

  return (
    <div className="mt-3">
      <Result result={result} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => open("dismiss")}>
          <X aria-hidden="true" />
          Dismiss
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !canSuspendListing}
          onClick={() => open("suspend_listing")}
          className="text-red-700 hover:border-red-200 hover:bg-red-50"
        >
          <ShieldBan aria-hidden="true" />
          Suspend listing
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={pending || !canSuspendUser}
          onClick={() => open("suspend_user")}
        >
          <UserX aria-hidden="true" />
          Suspend owner
        </Button>
      </div>
      {d && dialog && (
        <ConfirmDialog
          open
          onClose={() => setDialog(null)}
          title={d.title}
          description={d.description}
          confirmLabel={d.confirm}
          confirmVariant={d.danger ? "danger" : undefined}
          confirmDisabled={dialog !== "dismiss" && reason.trim().length < 10}
          onConfirm={() =>
            startTransition(async () => {
              setResult(await resolveListingReportsAction({ businessId, action: dialog, reason }));
              setDialog(null);
            })
          }
          pending={pending}
        >
          <Label htmlFor={`${id}-reason`}>
            {dialog === "dismiss" ? "Note (optional)" : "Reason (the owner will see this)"}
          </Label>
          <Textarea
            id={`${id}-reason`}
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </ConfirmDialog>
      )}
    </div>
  );
}
