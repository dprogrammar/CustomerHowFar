import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { CAMPAIGN_NAME } from "./rules";

// QR campaign counting. Only aggregate numbers per campaign are stored (visits, sign-ups, new
// listings). A first-party cookie remembers which campaign brought the visitor (the name only,
// no personal data) so a later sign-up or listing can be counted for it.

export const QR_COOKIE = "chf_qr";
/** How long a scan can still be credited with a sign-up or listing. */
export const QR_COOKIE_DAYS = 30;
/** Repeat visits from the same browser within this window count once. */
export const QR_VISIT_COOKIE = "chf_qr_v";
export const QR_VISIT_MINUTES = 30;

/** Counts a scan, for known campaigns only (unknown names are ignored). */
export async function recordQrVisit(campaign: string) {
  if (!CAMPAIGN_NAME.test(campaign)) return false;
  const { count } = await prisma.qrCampaign.updateMany({
    where: { name: campaign },
    data: { visits: { increment: 1 }, lastVisitAt: new Date() },
  });
  return count > 0;
}

/** Credits a sign-up or a new listing to the campaign in the visitor's cookie, if any. */
export async function recordQrConversion(kind: "signups" | "listings") {
  try {
    const campaign = (await cookies()).get(QR_COOKIE)?.value;
    if (!campaign || !CAMPAIGN_NAME.test(campaign)) return;
    await prisma.qrCampaign.updateMany({
      where: { name: campaign },
      data: { [kind]: { increment: 1 } },
    });
  } catch {
    // Counting must never break signing up or listing.
  }
}

export function listQrCampaigns() {
  return prisma.qrCampaign.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      visits: true,
      signups: true,
      listings: true,
      lastVisitAt: true,
      createdAt: true,
    },
  });
}
