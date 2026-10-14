import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

// Web Push with the standard Push API and our own VAPID keys (no paid push service). The
// browser vendor's push service (Google, Mozilla, Microsoft, Apple) delivers the message.
// Payloads hold only a title, a short body and a site path: never bank details, ID information
// or other people's full names.

/** Push services browsers use. Endpoints elsewhere are refused (no requests to arbitrary URLs). */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^(.+\.)?push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
  /^(.+\.)?push\.apple\.com$/,
];

export function isAllowedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.some((h) => h.test(url.hostname));
  } catch {
    return false;
  }
}

export function pushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

let configured: boolean | null = null;
function configure() {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  configured = Boolean(pub && priv && subject);
  if (configured) webpush.setVapidDetails(subject!, pub!, priv!);
  return configured;
}

export type PushMessage = {
  title: string;
  body: string;
  /** Site path opened when the notification is clicked. */
  url: string;
  /** Replaces an earlier notification with the same tag on the device. */
  tag?: string;
};

/**
 * Sends to every device the user turned push on for. Subscriptions the push service reports as
 * gone (404/410) are deleted. Never throws.
 */
export async function sendPushToUser(userId: string, message: PushMessage) {
  if (!configure()) return { sent: 0, removed: 0 };
  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  let sent = 0;
  let removed = 0;
  const payload = JSON.stringify({
    title: message.title.slice(0, 120),
    body: message.body.slice(0, 200),
    url:
      message.url.startsWith("/") && !message.url.startsWith("//") ? message.url : "/notifications",
    tag: message.tag,
  });
  await Promise.all(
    subs.map(async (s) => {
      if (!isAllowedPushEndpoint(s.endpoint)) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        removed++;
        return;
      }
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 * 24, urgency: "normal", timeout: 10_000 },
        );
        sent++;
        await prisma.pushSubscription
          .update({ where: { id: s.id }, data: { lastUsedAt: new Date() } })
          .catch(() => {});
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Expired or unsubscribed in the browser: forget it.
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          removed++;
        } else {
          console.error("[push] send failed", { status: status ?? "network" });
        }
      }
    }),
  );
  return { sent, removed };
}

/** "Chrome on Android", "Safari on iPhone"... from the User-Agent header. */
export function deviceLabel(userAgent: string | null) {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /OPR\/|Opera/.test(ua)
        ? "Opera"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone/.test(ua)
      ? "iPhone"
      : /iPad/.test(ua)
        ? "iPad"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "device";
  return `${browser} on ${os}`;
}
