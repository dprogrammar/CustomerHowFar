"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyMessage } from "@/lib/rate-limit";
import { deviceLabel, isAllowedPushEndpoint, pushPublicKey } from "./push";

// Notification actions for the signed-in user only (the user id always comes from the session).

export type NotificationActionResult = { ok: true } | { ok: false; error: string };
const LOGIN = "Please log in again.";
/** Devices with push per account; adding another replaces the oldest. */
const MAX_DEVICES = 10;

export async function markNotificationReadAction(input: { id: string }) {
  const user = await getSessionUser();
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!user || !parsed.success) return { ok: false as const };
  await prisma.notification.updateMany({
    where: { id: parsed.data.id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true as const };
}

export async function markAllNotificationsReadAction(): Promise<NotificationActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: LOGIN };
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  refresh();
  return { ok: true };
}

/** What the push prompt needs: whether someone is signed in, and the VAPID public key. */
export async function pushSetupAction(): Promise<{ signedIn: boolean; publicKey: string | null }> {
  const user = await getSessionUser();
  return { signedIn: Boolean(user), publicKey: user ? pushPublicKey() : null };
}

const subscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{40,200}={0,2}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{10,100}={0,2}$/),
  }),
});

export async function savePushSubscriptionAction(
  input: z.input<typeof subscriptionSchema>,
): Promise<NotificationActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: LOGIN };
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success || !isAllowedPushEndpoint(parsed.data.endpoint)) {
    return { ok: false, error: "This browser's push service isn't supported." };
  }
  const limited = await rateLimit("push-subscribe", user.id);
  if (!limited.ok) return { ok: false, error: tooManyMessage(limited) };
  const { endpoint, keys } = parsed.data;
  const label = deviceLabel((await headers()).get("user-agent"));
  await prisma.$transaction(async (tx) => {
    // The same browser re-subscribing (or a shared device switching accounts) moves it over.
    await tx.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, label },
      update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, label },
    });
    const extra = await tx.pushSubscription.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip: MAX_DEVICES,
      select: { id: true },
    });
    if (extra.length) {
      await tx.pushSubscription.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
    }
  });
  refresh();
  return { ok: true };
}

/** Removes one of the user's devices (by id from the settings list, or this browser's endpoint). */
export async function removePushSubscriptionAction(input: {
  id?: string;
  endpoint?: string;
}): Promise<NotificationActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: LOGIN };
  const parsed = z
    .object({ id: z.uuid().optional(), endpoint: z.url().max(1000).optional() })
    .refine((v) => v.id || v.endpoint)
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  await prisma.pushSubscription.deleteMany({
    where: {
      userId: user.id,
      ...(parsed.data.id ? { id: parsed.data.id } : { endpoint: parsed.data.endpoint }),
    },
  });
  refresh();
  return { ok: true };
}

const CATEGORY = z.enum([
  "LISTING",
  "PAYMENT",
  "REVIEW",
  "RATING_REMINDER",
  "STATE_LAUNCH",
  "ADMIN",
  "WEEKLY_STATS",
]);

export async function setNotificationPreferenceAction(input: {
  category: string;
  channel: "push" | "email";
  enabled: boolean;
}): Promise<NotificationActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: LOGIN };
  const parsed = z
    .object({ category: CATEGORY, channel: z.enum(["push", "email"]), enabled: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { category, channel, enabled } = parsed.data;
  await prisma.notificationPreference.upsert({
    where: { userId_category: { userId: user.id, category } },
    create: { userId: user.id, category, [channel]: enabled },
    update: { [channel]: enabled },
  });
  return { ok: true };
}
