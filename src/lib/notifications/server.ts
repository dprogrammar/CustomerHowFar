import "server-only";
import type { NotificationCategory } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { NotificationItem } from "./categories";

// Reads for the bell, /notifications and /account/notifications. Always for ONE user: the id
// comes from the verified session, never from the browser.

export function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function listNotifications(
  userId: string,
  { take, skip = 0 }: { take: number; skip?: number },
): Promise<NotificationItem[]> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    skip,
    select: { id: true, title: true, body: true, link: true, readAt: true, createdAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    link: r.link,
    read: r.readAt !== null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export function countNotifications(userId: string) {
  return prisma.notification.count({ where: { userId } });
}

/** Every category's push/email choice for this user (defaults: both on). */
export async function getPreferences(userId: string) {
  const rows = await prisma.notificationPreference.findMany({
    where: { userId },
    select: { category: true, push: true, email: true },
  });
  const map = new Map<NotificationCategory, { push: boolean; email: boolean }>();
  for (const r of rows) map.set(r.category, { push: r.push, email: r.email });
  return (category: NotificationCategory) => map.get(category) ?? { push: true, email: true };
}

export function listDevices(userId: string) {
  return prisma.pushSubscription.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true, endpoint: true },
  });
}
