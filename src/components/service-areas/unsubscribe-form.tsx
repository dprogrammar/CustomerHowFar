"use client";

import { useActionState } from "react";
import { unsubscribeWaitlistAction, type WaitlistState } from "@/lib/service-areas/actions";
import { FormAlert, SubmitButton } from "@/components/auth/form-fields";

const initial: WaitlistState = { status: "idle" };

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(unsubscribeWaitlistAction, initial);
  if (state.status === "success") return <FormAlert status="success">{state.message}</FormAlert>;
  return (
    <form action={action} className="not-prose space-y-4">
      {state.status === "error" && state.message && (
        <FormAlert status="error">{state.message}</FormAlert>
      )}
      <p className="text-base text-gray-800">
        Stop emails about CustomerHowFar launching in your state?
      </p>
      <input type="hidden" name="token" value={token} />
      <SubmitButton pending={pending} pendingText="Unsubscribing..." className="w-full sm:w-auto">
        Unsubscribe
      </SubmitButton>
    </form>
  );
}
