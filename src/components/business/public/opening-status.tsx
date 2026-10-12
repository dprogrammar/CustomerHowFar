"use client";

import { useSyncExternalStore } from "react";
import { DAYS, type DayKey, type OpeningHours } from "@/lib/business/rules";
import { cn } from "@/lib/utils";

// "Open now" depends on the current time in Nigeria, so it is computed in the browser (the
// rest of the page is cached). Re-evaluated every minute.

const lagosParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, 30_000);
  return () => clearInterval(timer);
}
const minuteNow = () => Math.floor(Date.now() / 60_000);
const serverSnapshot = () => null;

function lagosNow(minute: number): { day: DayKey; time: string } {
  const parts = lagosParts.formatToParts(new Date(minute * 60_000));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: get("weekday").toLowerCase().slice(0, 3) as DayKey,
    time: `${get("hour")}:${get("minute")}`,
  };
}

export function openingStatus(hours: OpeningHours, minute: number) {
  const { day, time } = lagosNow(minute);
  const today = hours[day];
  if (today && today.open <= time && time < today.close) {
    return { open: true, text: `Open now · closes ${today.close}` };
  }
  if (today && time < today.open)
    return { open: false, text: `Closed · opens today ${today.open}` };
  const order = DAYS.map((d) => d.key);
  for (let i = 1; i <= 7; i++) {
    const key = order[(order.indexOf(day) + i) % 7]!;
    const next = hours[key];
    if (next) {
      const label = i === 1 ? "tomorrow" : DAYS.find((d) => d.key === key)!.label;
      return { open: false, text: `Closed · opens ${label} ${next.open}` };
    }
  }
  return { open: false, text: "Closed" };
}

export function OpeningStatus({ hours, className }: { hours: OpeningHours; className?: string }) {
  const minute = useSyncExternalStore(subscribe, minuteNow, serverSnapshot);
  if (minute === null)
    return <span className={cn("text-sm text-gray-600", className)}>Opening hours</span>;
  const status = openingStatus(hours, minute);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium",
        status.open ? "text-brand-800" : "text-gray-700",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-2 rounded-full", status.open ? "bg-brand-600" : "bg-gray-400")}
      />
      {status.text}
      <span className="sr-only"> (Nigeria time)</span>
    </span>
  );
}

/** Highlights today's row in the hours table (computed in the browser). */
export function TodayMarker({ day }: { day: DayKey }) {
  const minute = useSyncExternalStore(subscribe, minuteNow, serverSnapshot);
  if (minute === null || lagosNow(minute).day !== day) return null;
  return (
    <span className="ml-1.5 rounded bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-800">
      Today
    </span>
  );
}
