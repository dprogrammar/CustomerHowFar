"use client";

import { useEffect, useId, useState } from "react";
import { BellRing, X } from "lucide-react";
import {
  currentSubscription,
  promptDismissedRecently,
  pushSupport,
  rememberPromptDismissed,
  turnOnPush,
} from "@/lib/notifications/push-client";
import { pushSetupAction } from "@/lib/notifications/actions";
import { cn } from "@/lib/utils";

// A friendly offer to turn on push notifications, shown only after a meaningful moment (a listing
// was just submitted, or a business was just contacted) and never on page load. The browser's
// own permission request only appears after "Turn on". Not shown on iPhones/iPads (no web push
// there for sites that aren't installed), when push is already on or blocked, to signed-out
// visitors, or for 30 days after "Not now".

const COPY = {
  listing: {
    title: "Get notified when it's approved",
    text: "Turn on notifications and we'll tell you the moment your listing is approved or needs a change.",
  },
  contact: {
    title: "Want a reminder to rate them?",
    text: "Turn on notifications for a reminder to rate this business, plus replies to your reviews.",
  },
} as const;

export function PushPrompt({
  context,
  floating = false,
}: {
  context: keyof typeof COPY;
  /** Phones: a card above the bottom bar (used on business pages). */
  floating?: boolean;
}) {
  const [state, setState] = useState<"hidden" | "offer" | "working" | "on" | "blocked">("hidden");
  const titleId = useId();

  useEffect(() => {
    let alive = true;
    (async () => {
      if (pushSupport() !== "supported" || promptDismissedRecently()) return;
      if (Notification.permission === "denied") return;
      if (await currentSubscription()) return;
      const { signedIn, publicKey } = await pushSetupAction();
      if (alive && signedIn && publicKey) setState("offer");
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // While floating, keep the chat button out of the way.
  useEffect(() => {
    if (!floating || state === "hidden") return;
    document.body.classList.add("has-push-prompt");
    return () => document.body.classList.remove("has-push-prompt");
  }, [floating, state]);

  if (state === "hidden") return null;

  const dismiss = () => {
    rememberPromptDismissed();
    setState("hidden");
  };
  const turnOn = async () => {
    setState("working");
    const result = await turnOnPush();
    if (result === "on") setState("on");
    else if (result === "denied") setState("blocked");
    else {
      rememberPromptDismissed();
      setState("hidden");
    }
  };

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "rounded-xl border border-border bg-white p-4 text-left shadow-raised",
        floating &&
          "push-prompt fixed inset-x-3 z-40 mx-auto max-w-md lg:right-6 lg:bottom-6 lg:left-auto",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <BellRing aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1" aria-live="polite">
          {state === "on" ? (
            <>
              <h2 id={titleId} className="font-semibold text-gray-900">
                Notifications are on
              </h2>
              <p className="mt-0.5 text-sm text-gray-700">
                Change what you get any time in your notification settings.
              </p>
            </>
          ) : state === "blocked" ? (
            <>
              <h2 id={titleId} className="font-semibold text-gray-900">
                Notifications are blocked
              </h2>
              <p className="mt-0.5 text-sm text-gray-700">
                Your browser is blocking notifications for this site. You&apos;ll still see updates
                in the app and by email.
              </p>
            </>
          ) : (
            <>
              <h2 id={titleId} className="font-semibold text-gray-900">
                {COPY[context].title}
              </h2>
              <p className="mt-0.5 text-sm text-gray-700">{COPY[context].text}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={turnOn}
                  disabled={state === "working"}
                  className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {state === "working" ? "Turning on…" : "Turn on"}
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-gray-700 ring-1 ring-border hover:bg-muted"
                >
                  Not now
                </button>
              </div>
            </>
          )}
        </div>
        {(state === "on" || state === "blocked") && (
          <button
            type="button"
            onClick={() => setState("hidden")}
            className="-mt-1 -mr-1 flex size-9 items-center justify-center rounded-lg text-gray-600 hover:bg-muted"
          >
            <X aria-hidden="true" className="size-4" />
            <span className="sr-only">Close</span>
          </button>
        )}
      </div>
    </section>
  );
}
