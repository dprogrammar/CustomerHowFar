import "server-only";
import { prisma } from "@/lib/prisma";

// The admin's "Show stats to business owners" switch (AppSetting.ownerStatsVisible, off by
// default). While it's off, owners see no numbers about their listings anywhere: no "Your stats"
// on the dashboard, no Monday summary, no old summaries in the bell. Every owner-facing read
// checks this on the server. Statistics are still collected, and admins always see them.

/** Read fresh on each call, so switching it in /admin/settings applies immediately. */
export async function areOwnerStatsVisible(): Promise<boolean> {
  const s = await prisma.appSetting.findUnique({
    where: { id: 1 },
    select: { ownerStatsVisible: true },
  });
  return s?.ownerStatsVisible ?? false;
}

/** Notification types that carry an owner's listing numbers. */
export const OWNER_STATS_NOTIFICATION_TYPES = ["weekly-stats"];
