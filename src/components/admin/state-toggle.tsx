"use client";

import { useState, useTransition } from "react";
import { Mail, Power, PowerOff } from "lucide-react";
import {
  emailWaitlistAction,
  setStateActiveAction,
  type ServiceAreaResult,
} from "@/lib/admin/service-area-actions";
import { FormAlert } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/** Switch a state on/off (with a confirmation explaining the effect) and email its waitlist. */
export function StateToggle({
  stateId,
  name,
  isActive,
  liveListings,
  inProgress,
  waitlistPending,
  isLastLive,
}: {
  stateId: number;
  name: string;
  isActive: boolean;
  liveListings: number;
  inProgress: number;
  waitlistPending: number;
  isLastLive: boolean;
}) {
  const [dialog, setDialog] = useState<"on" | "off" | "email" | null>(null);
  const [emailWaitlist, setEmailWaitlist] = useState(true);
  const [result, setResult] = useState<ServiceAreaResult | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<ServiceAreaResult>) =>
    startTransition(async () => {
      setResult(await fn());
      setDialog(null);
    });

  return (
    <div className="mt-3">
      {result && (
        <FormAlert status={result.ok ? "success" : "error"} className="mb-2">
          {result.ok ? result.message : result.error}
        </FormAlert>
      )}
      <div className="flex flex-wrap gap-2">
        {isActive ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending || isLastLive}
            onClick={() => setDialog("off")}
            className="text-red-700 hover:border-red-200 hover:bg-red-50"
          >
            <PowerOff aria-hidden="true" />
            Switch off<span className="sr-only"> {name}</span>
          </Button>
        ) : (
          <Button size="sm" disabled={pending} onClick={() => setDialog("on")}>
            <Power aria-hidden="true" />
            Switch on<span className="sr-only"> {name}</span>
          </Button>
        )}
        {isActive && waitlistPending > 0 && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setDialog("email")}>
            <Mail aria-hidden="true" />
            Email the waitlist ({waitlistPending})<span className="sr-only"> for {name}</span>
          </Button>
        )}
      </div>
      {isActive && isLastLive && (
        <p className="mt-2 text-xs text-gray-600">
          At least one state must stay live. Switch another state on first.
        </p>
      )}

      <ConfirmDialog
        open={dialog === "on"}
        onClose={() => setDialog(null)}
        title={`Launch in ${name}?`}
        description={`Businesses in ${name} can list and be approved straight away. ${name} moves to "Live now" in search filters and the homepage note.`}
        confirmLabel={`Launch ${name}`}
        onConfirm={() => run(() => setStateActiveAction({ stateId, active: true, emailWaitlist }))}
        pending={pending}
      >
        {waitlistPending > 0 ? (
          <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm text-gray-800">
            <input
              type="checkbox"
              checked={emailWaitlist}
              onChange={(e) => setEmailWaitlist(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-brand-600"
            />
            <span>
              Email the waitlist for this state ({waitlistPending}{" "}
              {waitlistPending === 1 ? "person" : "people"}). Sent in small batches; each email has
              an unsubscribe link.
            </span>
          </label>
        ) : (
          <p className="text-sm text-gray-700">Nobody is on the waitlist for {name} yet.</p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "off"}
        onClose={() => setDialog(null)}
        title={`Switch off ${name}?`}
        description="New listings and submissions in this state will be blocked."
        confirmLabel={`Switch off ${name}`}
        confirmVariant="danger"
        onConfirm={() => run(() => setStateActiveAction({ stateId, active: false }))}
        pending={pending}
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-800">
          <li>
            <strong>{liveListings}</strong> live listing{liveListings === 1 ? "" : "s"} stay visible
            to customers.
          </li>
          <li>
            <strong>{inProgress}</strong> draft{inProgress === 1 ? "" : "s"} or listings in progress
            can still be edited, but not submitted or approved.
          </li>
          <li>Owners can&apos;t create new listings in {name}.</li>
        </ul>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "email"}
        onClose={() => setDialog(null)}
        title={`Email the ${name} waitlist?`}
        description={`Sends the "We're now live" email to people who haven't been emailed yet (up to 200 per click, in small batches). Nobody is emailed twice.`}
        confirmLabel="Send emails"
        onConfirm={() => run(() => emailWaitlistAction({ stateId }))}
        pending={pending}
      />
    </div>
  );
}
