import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCompleteness, type BusinessStatus } from "./rules";

const isUuid = (value: string) => z.uuid().safeParse(value).success;

/** The business if `userId` owns it, else null. Never reveals whether it exists. */
export async function findOwnedBusiness(businessId: string, userId: string) {
  if (!isUuid(businessId)) return null;
  return prisma.business.findFirst({ where: { id: businessId, ownerId: userId } });
}

/** Everything the wizard needs. 404s if the user doesn't own it. */
export async function getWizardBusiness(businessId: string, userId: string) {
  if (!isUuid(businessId)) notFound();
  const business = await prisma.business.findFirst({
    where: { id: businessId, ownerId: userId },
    include: {
      category: { select: { id: true, name: true, icon: true } },
      state: { select: { id: true, name: true } },
      lga: { select: { id: true, name: true } },
      photos: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          publicId: true,
          width: true,
          height: true,
          caption: true,
          sortOrder: true,
        },
      },
      moderationDecisions: {
        where: { action: { in: ["REJECTED", "SUSPENDED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { action: true, comment: true, createdAt: true },
      },
    },
  });
  if (!business) notFound();

  const completeness = getCompleteness({ ...business, workPhotoCount: business.photos.length });
  return { business, completeness, latestDecision: business.moderationDecisions[0] ?? null };
}

export type WizardBusiness = Awaited<ReturnType<typeof getWizardBusiness>>["business"];

export async function countOwnedBusinesses(userId: string) {
  return prisma.business.count({ where: { ownerId: userId } });
}

/** Dashboard list: newest first, with the latest admin comment for rejected/suspended ones. */
export async function getOwnerDashboard(userId: string) {
  const businesses = await prisma.business.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      tagline: true,
      logoPublicId: true,
      coverPublicId: true,
      needsRecheck: true,
      address: true,
      stateId: true,
      lgaId: true,
      description: true,
      updatedAt: true,
      category: { select: { name: true } },
      state: { select: { name: true } },
      photos: { orderBy: { sortOrder: "asc" }, take: 1, select: { publicId: true } },
      _count: { select: { photos: true } },
      rejectionReason: true,
      moderationDecisions: {
        where: { action: { in: ["REJECTED", "SUSPENDED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { comment: true },
      },
    },
  });

  return businesses.map((b) => ({
    ...b,
    status: b.status as BusinessStatus,
    completeness: getCompleteness({ ...b, workPhotoCount: b._count.photos }),
    adminComment: b.moderationDecisions[0]?.comment ?? b.rejectionReason ?? null,
  }));
}

/** Read on the server only. Missing settings row means payment is not required. */
export async function getPaymentSettings() {
  const settings = await prisma.appSetting.findUnique({ where: { id: 1 } });
  return {
    paymentRequired: settings?.paymentRequired ?? false,
    listingFeeNaira: settings?.listingFeeNaira ?? 5000,
  };
}

export async function hasSuccessfulPayment(businessId: string) {
  const count = await prisma.payment.count({ where: { businessId, status: "SUCCESS" } });
  return count > 0;
}
