import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * The admin's listing-fee switch (AppSetting.paymentRequired), for wording only: while it's off,
 * pages present listing as free and don't mention fees or payments. Cached; turning the switch
 * on or off in /admin/settings expires FEE_SWITCH_TAG, so every page updates immediately.
 * (Payment decisions themselves always read the setting fresh: see getPaymentConfig.)
 */
export const FEE_SWITCH_TAG = "settings:listing-fee";

export async function isListingFeeOn(): Promise<boolean> {
  "use cache";
  cacheLife("hours");
  cacheTag(FEE_SWITCH_TAG);
  const s = await prisma.appSetting.findUnique({
    where: { id: 1 },
    select: { paymentRequired: true },
  });
  return s?.paymentRequired ?? false;
}

/**
 * The launch-period "FREE" homepage promotion: on only while the admin switch is on AND the
 * listing fee is off (it says listing is free). Same cache tag as the fee switch.
 */
export async function isHomepageFreePromoOn(): Promise<boolean> {
  "use cache";
  cacheLife("hours");
  cacheTag(FEE_SWITCH_TAG);
  const s = await prisma.appSetting.findUnique({
    where: { id: 1 },
    select: { paymentRequired: true, homepageFreePromo: true },
  });
  return Boolean(s?.homepageFreePromo) && !s?.paymentRequired;
}
