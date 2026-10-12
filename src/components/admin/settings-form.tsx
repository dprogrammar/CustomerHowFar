"use client";

import { useId, useState, useTransition } from "react";
import { updateSettingsAction, type AdminActionResult } from "@/lib/admin/actions";
import { formatNaira } from "@/lib/business/rules";
import { FormAlert } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SettingsForm({
  paymentRequired,
  listingFeeNaira,
}: {
  paymentRequired: boolean;
  listingFeeNaira: number;
}) {
  const [required, setRequired] = useState(paymentRequired);
  const [fee, setFee] = useState(String(listingFeeNaira));
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<AdminActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const switchLabelId = useId();
  const feeId = useId();

  const feeNumber = Number(fee);
  const feeValid = Number.isInteger(feeNumber) && feeNumber >= 100 && feeNumber <= 1_000_000;
  const changed = required !== paymentRequired || feeNumber !== listingFeeNaira;

  const effects: string[] = [];
  if (required !== paymentRequired) {
    effects.push(
      required
        ? `New submissions will need to pay ${formatNaira(feeValid ? feeNumber : listingFeeNaira)} before review. Listings already in review stay free.`
        : "New submissions go straight to review for free. Owners currently awaiting payment can submit for review without paying.",
    );
  }
  if (feeNumber !== listingFeeNaira && feeValid) {
    effects.push(
      `The fee changes from ${formatNaira(listingFeeNaira)} to ${formatNaira(feeNumber)} for payments made from now on. Businesses that already paid are never charged again.`,
    );
  }

  return (
    <div className="space-y-6">
      <div aria-live="polite" className="empty:hidden">
        {result && (
          <FormAlert status={result.ok ? "success" : "error"}>
            {result.ok ? result.message : result.error}
          </FormAlert>
        )}
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <p id={switchLabelId} className="text-base font-semibold text-gray-900">
            Require listing fee
          </p>
          <p className="mt-1 text-sm text-gray-700">
            When on, new listings must pay before they go to the review queue.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={required}
          aria-labelledby={switchLabelId}
          onClick={() => setRequired((value) => !value)}
          className={cn(
            "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors",
            required ? "bg-brand-600" : "bg-gray-400",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "inline-block size-6 rounded-full bg-white shadow transition-transform",
              required ? "translate-x-7" : "translate-x-1",
            )}
          />
          <span className="sr-only">{required ? "On" : "Off"}</span>
        </button>
      </div>
      <p className="-mt-3 text-sm font-medium text-gray-900">
        Currently: {required ? "On" : "Off"}
      </p>

      <div className="max-w-xs">
        <Label htmlFor={feeId}>Listing fee (₦)</Label>
        <Input
          id={feeId}
          type="number"
          inputMode="numeric"
          min={100}
          max={1000000}
          step={100}
          value={fee}
          onChange={(event) => setFee(event.target.value)}
          aria-invalid={!feeValid || undefined}
          aria-describedby={`${feeId}-hint`}
        />
        <p
          id={`${feeId}-hint`}
          className={cn("mt-1.5 text-sm", feeValid ? "text-gray-600" : "text-red-700")}
        >
          {feeValid
            ? `Shown to owners as ${formatNaira(feeNumber)}.`
            : "Enter a whole amount between ₦100 and ₦1,000,000."}
        </p>
      </div>

      <Button
        size="lg"
        disabled={!changed || !feeValid || pending}
        onClick={() => setConfirming(true)}
      >
        Save changes
      </Button>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Apply these changes now?"
        description={
          <ul className="list-disc space-y-1.5 pl-5">
            {effects.map((effect) => (
              <li key={effect}>{effect}</li>
            ))}
          </ul>
        }
        confirmLabel="Apply now"
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            const outcome = await updateSettingsAction({
              paymentRequired: required,
              listingFeeNaira: feeNumber,
            });
            setResult(outcome);
            if (outcome.ok) setConfirming(false);
          })
        }
      />
    </div>
  );
}
