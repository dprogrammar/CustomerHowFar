"use client";

import { useId, useState, useTransition } from "react";
import { updateSettingsAction, type AdminActionResult } from "@/lib/admin/actions";
import { formatNaira } from "@/lib/business/rules";
import { FormAlert } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SettingsValues = {
  paymentRequired: boolean;
  listingFeeNaira: number;
  manualTransferEnabled: boolean;
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  homepageFreePromo: boolean;
};

function Switch({
  checked,
  onChange,
  labelId,
  describedBy,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  labelId: string;
  describedBy?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-describedby={describedBy}
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-brand-600" : "bg-gray-400",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-6 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-7" : "translate-x-1",
        )}
      />
      <span className="sr-only">{checked ? "On" : "Off"}</span>
    </button>
  );
}

export function SettingsForm({ initial }: { initial: SettingsValues }) {
  const [values, setValues] = useState(initial);
  const [fee, setFee] = useState(String(initial.listingFeeNaira));
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<AdminActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const ids = {
    fee: useId(),
    transfer: useId(),
    feeSwitch: useId(),
    bank: useId(),
    number: useId(),
    name: useId(),
    promo: useId(),
    promoHint: useId(),
  };
  const set = <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const feeNumber = Number(fee);
  const feeValid = Number.isInteger(feeNumber) && feeNumber >= 100 && feeNumber <= 1_000_000;
  const accountDigits = values.bankAccountNumber.replace(/\s/g, "");
  const accountValid = accountDigits === "" || /^\d{10}$/.test(accountDigits);
  const transferUsable =
    values.manualTransferEnabled &&
    Boolean(values.bankName.trim() && values.bankAccountName.trim()) &&
    /^\d{10}$/.test(accountDigits);
  const ruleError =
    values.manualTransferEnabled && !transferUsable
      ? "To turn on bank transfer, fill in the bank name, a 10-digit account number and the account name."
      : values.paymentRequired && !transferUsable
        ? "The listing fee is on, so at least one payment method must be enabled. Turn on bank transfer with complete details, or turn the fee off."
        : null;
  // The "Free" promotion can't be on while the listing fee is on (turning the fee on turns it off).
  const promoBlocked = values.paymentRequired;
  const next = {
    ...values,
    listingFeeNaira: feeNumber,
    bankAccountNumber: accountDigits,
    homepageFreePromo: values.homepageFreePromo && !promoBlocked,
  };
  const changed = (Object.keys(initial) as (keyof SettingsValues)[]).some(
    (k) => initial[k] !== next[k],
  );

  const effects: string[] = [];
  if (next.paymentRequired !== initial.paymentRequired) {
    effects.push(
      next.paymentRequired
        ? `New submissions will need to pay ${formatNaira(feeValid ? feeNumber : initial.listingFeeNaira)} before review. Listings already in review stay free.`
        : "New submissions go straight to review for free. Owners awaiting payment can submit without paying.",
    );
  }
  if (feeValid && feeNumber !== initial.listingFeeNaira) {
    effects.push(
      `The fee changes from ${formatNaira(initial.listingFeeNaira)} to ${formatNaira(feeNumber)} for payments started from now on.`,
    );
  }
  if (next.homepageFreePromo !== initial.homepageFreePromo) {
    effects.push(
      next.homepageFreePromo
        ? "The homepage shows the 'Free' promotion."
        : next.paymentRequired && !initial.paymentRequired
          ? "The homepage 'Free' promotion will be switched off, because it can't show while the listing fee is on."
          : "The 'Free' promotion is removed from the homepage.",
    );
  }
  if (next.manualTransferEnabled !== initial.manualTransferEnabled) {
    effects.push(
      next.manualTransferEnabled
        ? "Owners can pay by bank transfer."
        : "Bank transfer is hidden from owners.",
    );
  }
  if (
    next.bankName !== initial.bankName ||
    next.bankAccountNumber !== initial.bankAccountNumber ||
    next.bankAccountName !== initial.bankAccountName
  ) {
    effects.push(
      `Owners will be told to pay into: ${next.bankName}, ${next.bankAccountNumber}, ${next.bankAccountName}. Double-check these details.`,
    );
  }

  return (
    <div className="space-y-8">
      <div aria-live="polite" className="empty:hidden">
        {result && (
          <FormAlert status={result.ok ? "success" : "error"}>
            {result.ok ? result.message : result.error}
          </FormAlert>
        )}
      </div>

      <section aria-labelledby={ids.feeSwitch} className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id={ids.feeSwitch} className="text-base font-semibold text-gray-900">
              Require listing fee
            </p>
            <p className="mt-1 text-sm text-gray-700">
              When on, new listings must pay before they go to the review queue.
            </p>
          </div>
          <Switch
            checked={values.paymentRequired}
            onChange={(v) => set("paymentRequired", v)}
            labelId={ids.feeSwitch}
          />
        </div>
        <p className="text-sm font-medium text-gray-900">
          Currently: {values.paymentRequired ? "On" : "Off"}
        </p>
        <div className="max-w-xs">
          <Label htmlFor={ids.fee}>Listing fee (₦)</Label>
          <Input
            id={ids.fee}
            type="number"
            inputMode="numeric"
            min={100}
            max={1000000}
            step={100}
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            aria-invalid={!feeValid || undefined}
            aria-describedby={`${ids.fee}-hint`}
          />
          <p
            id={`${ids.fee}-hint`}
            className={cn("mt-1.5 text-sm", feeValid ? "text-gray-600" : "text-red-700")}
          >
            {feeValid
              ? `Shown to owners as ${formatNaira(feeNumber)}.`
              : "Enter a whole amount between ₦100 and ₦1,000,000."}
          </p>
        </div>
      </section>

      <section aria-labelledby={ids.transfer} className="space-y-4 border-t border-border pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id={ids.transfer} className="text-base font-semibold text-gray-900">
              Bank transfer
            </p>
            <p className="mt-1 text-sm text-gray-700">
              Owners transfer to this account and upload a receipt; you confirm each payment
              manually.
            </p>
          </div>
          <Switch
            checked={values.manualTransferEnabled}
            onChange={(v) => set("manualTransferEnabled", v)}
            labelId={ids.transfer}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor={ids.bank}>Bank name</Label>
            <Input
              id={ids.bank}
              value={values.bankName}
              maxLength={80}
              onChange={(e) => set("bankName", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={ids.number}>Account number</Label>
            <Input
              id={ids.number}
              inputMode="numeric"
              maxLength={12}
              value={values.bankAccountNumber}
              onChange={(e) => set("bankAccountNumber", e.target.value)}
              aria-invalid={!accountValid || undefined}
              aria-describedby={`${ids.number}-hint`}
            />
            <p
              id={`${ids.number}-hint`}
              className={cn("mt-1.5 text-sm", accountValid ? "text-gray-600" : "text-red-700")}
            >
              {accountValid
                ? "10 digits (NUBAN)."
                : "The account number must be exactly 10 digits."}
            </p>
          </div>
          <div>
            <Label htmlFor={ids.name}>Account name</Label>
            <Input
              id={ids.name}
              value={values.bankAccountName}
              maxLength={80}
              onChange={(e) => set("bankAccountName", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby={ids.promo} className="space-y-2 border-t border-border pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id={ids.promo} className="text-base font-semibold text-gray-900">
              Show &lsquo;Free&rsquo; promotion on homepage
            </p>
            <p id={ids.promoHint} className="mt-1 text-sm text-gray-700">
              {promoBlocked
                ? "Not available while the listing fee is on: the promotion says listing is free."
                : "A bold launch promotion on the homepage telling customers and businesses that CustomerHowFar is free."}
            </p>
          </div>
          <Switch
            checked={next.homepageFreePromo}
            onChange={(v) => set("homepageFreePromo", v)}
            labelId={ids.promo}
            describedBy={ids.promoHint}
            disabled={promoBlocked}
          />
        </div>
        <p className="text-sm font-medium text-gray-900">
          Currently: {next.homepageFreePromo ? "On" : "Off"}
        </p>
      </section>

      {ruleError && <FormAlert status="error">{ruleError}</FormAlert>}

      <Button
        size="lg"
        disabled={!changed || !feeValid || !accountValid || pending}
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
            const outcome = await updateSettingsAction(next);
            setResult(outcome);
            setConfirming(false);
          })
        }
      />
    </div>
  );
}
