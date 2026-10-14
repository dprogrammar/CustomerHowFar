"use client";

import { useEffect, useState, useTransition } from "react";
import { BellOff, BellRing, Smartphone } from "lucide-react";
import {
  markAllNotificationsReadAction,
  removePushSubscriptionAction,
  setNotificationPreferenceAction,
} from "@/lib/notifications/actions";
import {
  currentSubscription,
  pushSupport,
  turnOffPush,
  turnOnPush,
} from "@/lib/notifications/push-client";
import { cn } from "@/lib/utils";

/** An on/off switch for one category and channel (push or email). Saves straight away. */
export function PreferenceSwitch({
  category,
  channel,
  label,
  initial,
  disabled = false,
}: {
  category: string;
  channel: "push" | "email";
  /** Accessible name, e.g. "Listing updates by push". */
  label: string;
  initial: boolean;
  disabled?: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const toggle = () => {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const r = await setNotificationPreferenceAction({ category, channel, enabled: next });
      if (!r.ok) {
        setOn(!next);
        setError(true);
      } else setError(false);
    });
  };
  return (
    <span className="inline-flex flex-col items-center">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled || pending}
        onClick={toggle}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
          on ? "bg-brand-600" : "bg-gray-400",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block size-5 rounded-full bg-white shadow transition-transform",
            on ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
      {error && (
        <span role="alert" className="mt-1 text-xs text-red-700">
          Not saved
        </span>
      )}
    </span>
  );
}

type DeviceState = "loading" | "unsupported" | "ios" | "blocked" | "off" | "on" | "working";

/** Push on this device: turn on (asks the browser) or off, or explain why it isn't available. */
export function PushDeviceToggle() {
  const [state, setState] = useState<DeviceState>("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const support = pushSupport();
      if (support !== "supported") return setState(support);
      if (Notification.permission === "denied") return setState("blocked");
      setState((await currentSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const turnOn = async () => {
    setState("working");
    setMessage(null);
    const result = await turnOnPush();
    if (result === "on") {
      setState("on");
      setMessage("Push notifications are on for this device.");
    } else if (result === "denied") setState("blocked");
    else {
      setState("off");
      setMessage(
        result === "dismissed"
          ? "Your browser didn't turn them on. You can try again any time."
          : "Something went wrong. Please try again.",
      );
    }
  };
  const turnOff = async () => {
    setState("working");
    await turnOffPush();
    setState("off");
    setMessage("Push notifications are off for this device.");
  };

  const box = "rounded-xl border border-border bg-white p-4";
  if (state === "loading") return <div className={cn(box, "h-24 animate-pulse bg-muted")} />;
  if (state === "ios") {
    return (
      <div className={box}>
        <p className="flex items-start gap-2 text-sm text-gray-800">
          <Smartphone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-gray-600" />
          <span>
            Push notifications aren&apos;t available on iPhone and iPad for websites. You&apos;ll
            still get notifications here in the app (the bell at the top) and by email.
          </span>
        </p>
      </div>
    );
  }
  if (state === "unsupported") {
    return (
      <div className={box}>
        <p className="text-sm text-gray-800">
          This browser doesn&apos;t support push notifications. You&apos;ll still get notifications
          in the app and by email.
        </p>
      </div>
    );
  }
  return (
    <div className={box}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
          {state === "on" ? (
            <BellRing aria-hidden="true" className="size-5 text-brand-700" />
          ) : (
            <BellOff aria-hidden="true" className="size-5 text-gray-500" />
          )}
          {state === "on"
            ? "Push notifications are on for this device"
            : state === "blocked"
              ? "Notifications are blocked in this browser"
              : "Push notifications are off for this device"}
        </p>
        {state !== "blocked" && (
          <button
            type="button"
            onClick={state === "on" ? turnOff : turnOn}
            disabled={state === "working"}
            className={cn(
              "inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold disabled:opacity-60",
              state === "on"
                ? "text-gray-800 ring-1 ring-border hover:bg-muted"
                : "bg-brand-600 text-white hover:bg-brand-700",
            )}
          >
            {state === "working" ? "Please wait…" : state === "on" ? "Turn off" : "Turn on"}
          </button>
        )}
      </div>
      {state === "blocked" && (
        <p className="mt-2 text-sm text-gray-700">
          To turn them on, allow notifications for this site in your browser&apos;s site settings,
          then reload this page.
        </p>
      )}
      {message && (
        <p role="status" className="mt-2 text-sm text-gray-700">
          {message}
        </p>
      )}
    </div>
  );
}

export function RemoveDeviceButton({ id, label }: { id: string; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => void (await removePushSubscriptionAction({ id })))}
      className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-red-700 ring-1 ring-border hover:bg-red-50 disabled:opacity-60"
    >
      {pending ? "Removing…" : "Remove"}
      <span className="sr-only">: {label}</span>
    </button>
  );
}

export function MarkAllReadButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => void (await markAllNotificationsReadAction()))}
      className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-brand-800 ring-1 ring-brand-200 hover:bg-brand-50 disabled:opacity-60"
    >
      {pending ? "Marking…" : "Mark all as read"}
    </button>
  );
}
