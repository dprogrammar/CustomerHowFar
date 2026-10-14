import "server-only";
import type { NotificationCategory } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "./push";

// One event -> the in-app notification (always), plus push and email when the person has them
// switched on for that category (both on by default). Called from after() by the existing
// email helpers, so actions are never slowed down or undone. Never throws.

export type Delivery = {
  userId: string;
  category: NotificationCategory;
  /** Event name, e.g. "listing-approved". */
  type: string;
  title: string;
  /** Shown in the bell and on /notifications. Only what this person may see. */
  body: string;
  /** Site path opened on click. */
  link: string;
  /** Push text, when the in-app body is too detailed for a lock screen (defaults to body). */
  pushBody?: string;
  /** Sends the email (only called when the person has email on for this category). */
  email?: () => Promise<unknown>;
};

/** Each person's choice for one category (no row = both on). */
export async function preferencesFor(userIds: string[], category: NotificationCategory) {
  const rows = await prisma.notificationPreference.findMany({
    where: { userId: { in: userIds }, category },
    select: { userId: true, push: true, email: true },
  });
  const map = new Map(rows.map((r) => [r.userId, r]));
  return (userId: string) => map.get(userId) ?? { push: true, email: true };
}

const logFailure = (type: string, part: string) => (error: unknown) => {
  console.error(`[notify] ${type} ${part} failed`, {
    error: error instanceof Error ? error.name : "unknown",
  });
  return null;
};

/**
 * Test mode (EMAIL_TEST_OUTBOX set, never in production): only test accounts (@example.com) are
 * notified, so test runs against a shared database never reach real people or their devices.
 */
export const isTestMode = () => Boolean(process.env.EMAIL_TEST_OUTBOX);

async function deliverableInTestMode(userId: string) {
  const p = await prisma.profile.findUnique({ where: { id: userId }, select: { email: true } });
  return Boolean(p?.email.toLowerCase().endsWith("@example.com"));
}

export async function deliver(d: Delivery) {
  if (isTestMode() && !(await deliverableInTestMode(d.userId).catch(() => false))) return;
  // The preference read and the in-app insert start together; the email goes out as soon as the
  // preference is known and never waits for (or depends on) the in-app notification or push.
  const prefsRead = preferencesFor([d.userId], d.category)
    .then((get) => get(d.userId))
    .catch(() => ({ push: true, email: true }));
  const created = prisma.notification
    .create({
      data: {
        userId: d.userId,
        category: d.category,
        type: d.type,
        title: d.title.slice(0, 120),
        body: d.body.slice(0, 300),
        link: d.link.startsWith("/") ? d.link.slice(0, 300) : "/notifications",
      },
      select: { id: true },
    })
    .catch(logFailure(d.type, "in-app"));
  const prefs = await prefsRead;
  await Promise.all([
    prefs.email && d.email ? d.email().catch(logFailure(d.type, "email")) : null,
    (async () => {
      const note = await created;
      if (!prefs.push || !note) return;
      await sendPushToUser(d.userId, {
        title: d.title,
        body: d.pushBody ?? d.body,
        // Opening it from the lock screen marks it as read too.
        url: `/notifications/open/${note.id}`,
        tag: d.type,
      }).catch(logFailure(d.type, "push"));
    })(),
  ]);
}

/**
 * Admin alerts: in-app and push for every active admin (each admin's push choice applies). The
 * email goes once to the team inbox (ADMIN_NOTIFY_EMAIL), as before.
 */
export async function deliverToAdmins(
  d: Omit<Delivery, "userId" | "category" | "email">,
  teamEmail?: () => Promise<unknown>,
) {
  try {
    const admins = await prisma.profile.findMany({
      where: { role: "ADMIN", status: "ACTIVE" },
      select: { id: true },
    });
    await Promise.all([
      ...admins.map((a) => deliver({ ...d, userId: a.id, category: "ADMIN" })),
      teamEmail ? teamEmail() : null,
    ]);
  } catch (error) {
    console.error(`[notify] ${d.type} (admins) failed`, {
      error: error instanceof Error ? error.name : "unknown",
    });
  }
}
