"use client";

import { useId, useState, useTransition } from "react";
import { Flag } from "lucide-react";
import { reportListingAction, type ReviewActionResult } from "@/lib/reviews/actions";
import { LISTING_REPORT_REASONS, type ListingReportReasonValue } from "@/lib/reviews/rules";
import { FormAlert } from "@/components/auth/form-fields";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label, Textarea } from "@/components/ui/input";

/** "Report this business" for logged-in visitors: reason + optional details. */
export function ReportBusinessButton({
  businessId,
  businessName,
}: {
  businessId: string;
  businessName: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ListingReportReasonValue | "">("");
  const [details, setDetails] = useState("");
  const [result, setResult] = useState<ReviewActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();
  const detailsOk = reason !== "OTHER" || details.trim().length >= 10;

  return (
    <div>
      {result?.ok ? (
        <FormAlert status="success">{result.message}</FormAlert>
      ) : (
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setOpen(true);
          }}
          className="inline-flex min-h-11 items-center gap-1.5 rounded text-sm font-medium text-gray-700 hover:text-gray-900 hover:underline"
        >
          <Flag aria-hidden="true" className="size-4" />
          Report this business
        </button>
      )}
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Report ${businessName}`}
        description="Our team checks every report. The business isn't told who reported it."
        confirmLabel="Send report"
        confirmDisabled={!reason || !detailsOk}
        onConfirm={() =>
          startTransition(async () => {
            if (!reason) return;
            const outcome = await reportListingAction({ businessId, reason, details });
            setResult(outcome);
            if (outcome.ok) setOpen(false);
          })
        }
        pending={pending}
      >
        <div className="space-y-3">
          {result && !result.ok && <FormAlert status="error">{result.error}</FormAlert>}
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-gray-800">What&apos;s wrong?</legend>
            <div className="space-y-2">
              {LISTING_REPORT_REASONS.map((r) => (
                <label
                  key={r.value}
                  className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 text-sm text-gray-900"
                >
                  <input
                    type="radio"
                    name={`${id}-reason`}
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="size-4 accent-brand-600"
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <Label htmlFor={`${id}-details`}>
              Details {reason === "OTHER" ? "(required)" : "(optional)"}
            </Label>
            <Textarea
              id={`${id}-details`}
              rows={3}
              maxLength={1000}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="What happened? Include dates if you can."
            />
          </div>
        </div>
      </ConfirmDialog>
    </div>
  );
}
