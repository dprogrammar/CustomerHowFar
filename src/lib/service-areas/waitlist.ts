import "server-only";
import { randomBytes } from "node:crypto";
import { getSiteUrl } from "@/config/site";
import { sendEmail } from "@/lib/email/send";
import { deliver } from "@/lib/notifications/deliver";
import { waitlistLaunchEmail } from "@/lib/email/templates";
import { prisma } from "@/lib/prisma";

// Waitlist helpers. Emails are sent in small batches, each with its own unsubscribe link, and
// every sent email is recorded (notifiedAt), so running it again never emails anyone twice.
// Logs counts only.

export function newUnsubscribeToken() {
  return randomBytes(24).toString("base64url");
}

export function unsubscribeUrl(token: string) {
  return `${getSiteUrl()}/waitlist/unsubscribe?token=${encodeURIComponent(token)}`;
}

const BATCH_SIZE = 20;
const MAX_PER_RUN = 200;
const PAUSE_MS = 500;

/**
 * Emails people waiting for this (now live) state who haven't been emailed yet and haven't
 * unsubscribed. At most MAX_PER_RUN per call; returns how many remain.
 */
export async function emailStateWaitlist(stateId: number) {
  const state = await prisma.state.findUnique({
    where: { id: stateId },
    select: { name: true, isActive: true },
  });
  if (!state?.isActive) return { sent: 0, failed: 0, remaining: 0, notLive: true };

  const pending = await prisma.waitlistEntry.findMany({
    where: { stateId, notifiedAt: null, unsubscribedAt: null },
    orderBy: { createdAt: "asc" },
    take: MAX_PER_RUN,
    select: { id: true, email: true, name: true, role: true, unsubscribeToken: true, userId: true },
  });
  const site = getSiteUrl();
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    for (const entry of pending.slice(i, i + BATCH_SIZE)) {
      const unsubscribe = unsubscribeUrl(entry.unsubscribeToken);
      const actionPath = entry.role === "BUSINESS" ? "/business/new" : "/search";
      const send = () =>
        sendEmail({
          to: { email: entry.email, ...(entry.name ? { name: entry.name } : {}) },
          tag: "waitlist-launch",
          headers: { "List-Unsubscribe": `<${unsubscribe}>` },
          ...waitlistLaunchEmail({
            name: entry.name,
            stateName: state.name,
            role: entry.role,
            actionUrl: `${site}${actionPath}`,
            unsubscribeUrl: unsubscribe,
          }),
        });
      let ok: boolean;
      if (entry.userId) {
        // Signed-up people also get it in the app and by push; their email choice applies.
        let emailed: boolean | null = null;
        await deliver({
          userId: entry.userId,
          category: "STATE_LAUNCH",
          type: "state-launch",
          title: `We're live in ${state.name}`,
          body:
            entry.role === "BUSINESS"
              ? `You can now list your business in ${state.name}.`
              : `You can now find businesses in ${state.name}.`,
          link: actionPath,
          email: async () => {
            emailed = await send();
          },
        });
        ok = emailed !== false;
      } else {
        ok = await send();
      }
      if (ok) {
        await prisma.waitlistEntry.update({
          where: { id: entry.id },
          data: { notifiedAt: new Date() },
        });
        sent++;
      } else {
        failed++;
      }
    }
    if (i + BATCH_SIZE < pending.length) await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  const remaining = await prisma.waitlistEntry.count({
    where: { stateId, notifiedAt: null, unsubscribedAt: null },
  });
  if (failed > 0) console.error("[waitlist] some launch emails failed", { failed });
  return { sent, failed, remaining, notLive: false };
}

/** Waiting people per state (subscribed, not yet emailed) and in total (subscribed). */
export async function getWaitlistCounts() {
  const rows = await prisma.waitlistEntry.groupBy({
    by: ["stateId"],
    where: { unsubscribedAt: null },
    _count: { _all: true },
  });
  const pending = await prisma.waitlistEntry.groupBy({
    by: ["stateId"],
    where: { unsubscribedAt: null, notifiedAt: null },
    _count: { _all: true },
  });
  const map = new Map<number, { total: number; pending: number }>();
  for (const r of rows) map.set(r.stateId, { total: r._count._all, pending: 0 });
  for (const p of pending) {
    const m = map.get(p.stateId) ?? { total: 0, pending: 0 };
    m.pending = p._count._all;
    map.set(p.stateId, m);
  }
  return map;
}
