import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Settings } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { openHref, timeAgo } from "@/lib/notifications/categories";
import { countNotifications, listNotifications, unreadCount } from "@/lib/notifications/server";
import { MarkAllReadButton } from "@/components/notifications/settings-controls";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

const PAGE_SIZE = 30;

async function NotificationList({
  searchParams,
}: Pick<PageProps<"/notifications">, "searchParams">) {
  const user = await requireUser("/notifications");
  const raw = (await searchParams).page;
  const page = Math.max(1, Math.min(50, Number(Array.isArray(raw) ? raw[0] : raw) || 1));
  const [items, total, unread] = await Promise.all([
    listNotifications(user.id, { take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    countNotifications(user.id),
    unreadCount(user.id),
  ]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-700" role="status">
          {unread === 0 ? "You're all caught up." : `${unread} unread`}
        </p>
        {unread > 0 && <MarkAllReadButton />}
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-white p-8 text-center text-gray-700">
          No notifications yet. We&apos;ll let you know about your listings, reviews and more.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-white">
          {items.map((n) => (
            <li key={n.id}>
              <a
                href={openHref(n.id)}
                className={cn(
                  "flex gap-3 px-4 py-4 hover:bg-muted",
                  !n.read && "bg-brand-50/60 hover:bg-brand-50",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    n.read ? "" : "bg-brand-600",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-gray-900", !n.read && "font-semibold")}>
                    {!n.read && <span className="sr-only">Unread: </span>}
                    {n.title}
                  </span>
                  <span className="mt-0.5 block text-sm break-words text-gray-700">{n.body}</span>
                  <span className="mt-1 block text-xs text-gray-600">
                    {timeAgo(n.createdAt)}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {total > page * PAGE_SIZE && (
        <div className="mt-4 text-center">
          <Link
            href={`/notifications?page=${page + 1}`}
            className={buttonVariants({ variant: "outline" })}
          >
            Older notifications
          </Link>
        </div>
      )}
      <p className="mt-4 text-xs text-gray-600">Notifications are kept for 90 days.</p>
    </>
  );
}

export default function NotificationsPage(props: PageProps<"/notifications">) {
  return (
    <div className="flex-1 bg-surface py-8 sm:py-12">
      <Container className="max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Notifications
          </h1>
          <Link href="/account/notifications" className={buttonVariants({ variant: "ghost" })}>
            <Settings aria-hidden="true" />
            Settings
          </Link>
        </div>
        <Suspense
          fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
        >
          <NotificationList searchParams={props.searchParams} />
        </Suspense>
      </Container>
    </div>
  );
}
