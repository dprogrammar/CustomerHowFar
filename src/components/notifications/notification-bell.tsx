"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Settings } from "lucide-react";
import { markAllNotificationsReadAction } from "@/lib/notifications/actions";
import { openHref, timeAgo, type NotificationItem } from "@/lib/notifications/categories";
import { cn } from "@/lib/utils";

// The header bell for signed-in users (desktop and phones): unread count, the latest
// notifications, "Mark all as read". The count refreshes on navigation, when the tab regains
// focus and every minute while the page is visible.

type Summary = { signedIn: boolean; unread: number; items: NotificationItem[] };

// The header renders a bell for desktop and one for phones (only one is visible); they share
// in-flight requests so each check is a single request.
const inflight = new Map<string, Promise<Summary | null>>();

function fetchSummary(list: boolean): Promise<Summary | null> {
  const url = `/api/notifications${list ? "?list=1" : ""}`;
  const pending = inflight.get(url);
  if (pending) return pending;
  const request = fetch(url, { cache: "no-store" })
    .then((res) => (res.ok ? (res.json() as Promise<Summary>) : null))
    .catch(() => null)
    .finally(() => inflight.delete(url));
  inflight.set(url, request);
  return request;
}

export function NotificationBell() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const titleId = useId();

  // Refresh the count on every navigation.
  useEffect(() => {
    let alive = true;
    fetchSummary(false).then((s) => {
      if (alive && s) setUnread(s.unread);
    });
    return () => {
      alive = false;
    };
  }, [pathname]);

  // ...when the tab is shown again, and every minute while it is visible.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      fetchSummary(false).then((s) => {
        if (s) setUnread(s.unread);
      });
    };
    const timer = setInterval(onVisible, 60_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  // Close on outside click and Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      const s = await fetchSummary(true);
      if (s) {
        setItems(s.items);
        setUnread(s.unread);
      }
    }
  };

  const markAll = async () => {
    setUnread(0);
    setItems((list) => list?.map((i) => ({ ...i, read: true })) ?? list);
    await markAllNotificationsReadAction().catch(() => {});
  };

  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="relative flex size-11 items-center justify-center rounded-lg text-gray-800 hover:bg-muted"
      >
        <Bell aria-hidden="true" className="size-6" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] leading-none font-bold text-white ring-2 ring-white"
          >
            {badge}
          </span>
        )}
        <span className="sr-only">Notifications{unread > 0 ? `, ${unread} unread` : ""}</span>
      </button>

      <div
        id={panelId}
        hidden={!open}
        role="region"
        aria-labelledby={titleId}
        className="fixed inset-x-3 top-[calc(var(--spacing-header)+0.25rem)] z-50 max-h-[calc(100dvh-var(--spacing-header)-1rem)] overflow-hidden rounded-xl border border-border bg-white shadow-raised md:absolute md:inset-x-auto md:top-full md:right-0 md:mt-2 md:w-96"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <p id={titleId} className="text-sm font-semibold text-gray-900">
            Notifications
          </p>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAll}
              className="rounded-md px-2 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              Mark all as read
            </button>
          )}
        </div>
        <div className="max-h-[min(26rem,calc(100dvh-12rem))] overflow-y-auto">
          {items === null ? (
            <p className="px-4 py-6 text-center text-sm text-gray-600">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-600">
              No notifications yet. We&apos;ll let you know when something happens.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li key={n.id}>
                  <NotificationRow item={n} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="rounded-md px-2 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            See all notifications
          </Link>
          <Link
            href="/account/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center gap-1.5 rounded-md px-2 py-2 text-sm text-gray-700 hover:bg-muted"
          >
            <Settings aria-hidden="true" className="size-4" />
            Settings
          </Link>
        </div>
      </div>
    </div>
  );
}

/** One notification. Opening it marks it as read (through /notifications/open/[id]). */
export function NotificationRow({ item }: { item: NotificationItem }) {
  return (
    <a
      href={openHref(item.id)}
      className={cn(
        "flex gap-3 px-4 py-3 hover:bg-muted",
        !item.read && "bg-brand-50/60 hover:bg-brand-50",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          item.read ? "bg-transparent" : "bg-brand-600",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm text-gray-900", !item.read && "font-semibold")}>
          {!item.read && <span className="sr-only">Unread: </span>}
          {item.title}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-sm text-gray-700">{item.body}</span>
        <span className="mt-1 block text-xs text-gray-600">{timeAgo(item.createdAt)}</span>
      </span>
    </a>
  );
}
