import "server-only";
import { Prisma, type AuditAction } from "@/generated/prisma/client";
import type { StoredFile } from "@/lib/storage/cleanup";
import { AccountRuleError } from "./account-error";

// Deleting a business. With payments: a minimal private record is kept for accounting (status
// DELETED, name and payment rows only; everything public or personal removed). Without
// payments: the row is deleted and its photos, reviews, saves and contact events go with it.
// Cloudinary files are returned for the caller to delete AFTER the transaction commits.

export { AccountRuleError };

export type DeletedBusiness = {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  soft: boolean;
  files: StoredFile[];
};

export async function deleteBusinessInTx(
  tx: Prisma.TransactionClient,
  input: {
    businessId: string;
    actorId: string | null;
    action: Extract<AuditAction, "BUSINESS_DELETED" | "BUSINESS_SELF_DELETED">;
    reason?: string | null;
    /** For owners: the business must belong to this user. */
    ownerId?: string;
  },
): Promise<DeletedBusiness> {
  await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${input.businessId}::uuid FOR UPDATE`;
  const b = await tx.business.findUnique({
    where: { id: input.businessId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      ownerId: true,
      logoPublicId: true,
      coverPublicId: true,
      photos: { select: { publicId: true } },
      _count: { select: { payments: true } },
    },
  });
  if (!b || b.status === "DELETED" || (input.ownerId && b.ownerId !== input.ownerId)) {
    throw new AccountRuleError("This business no longer exists. Reload the page.");
  }

  const files: StoredFile[] = [b.logoPublicId, b.coverPublicId, ...b.photos.map((p) => p.publicId)]
    .filter((id): id is string => Boolean(id))
    .map((publicId) => ({ publicId, private: false }));
  const soft = b._count.payments > 0;

  if (soft) {
    await tx.businessPhoto.deleteMany({ where: { businessId: b.id } });
    await tx.review.deleteMany({ where: { businessId: b.id } });
    await tx.savedBusiness.deleteMany({ where: { businessId: b.id } });
    await tx.contactEvent.deleteMany({ where: { businessId: b.id } });
    await tx.businessReport.deleteMany({ where: { businessId: b.id } });
    // Unfinished payments can never complete now.
    await tx.payment.updateMany({
      where: { businessId: b.id, status: { in: ["PENDING", "AWAITING_CONFIRMATION"] } },
      data: { status: "ABANDONED" },
    });
    await tx.business.update({
      where: { id: b.id },
      data: {
        status: "DELETED",
        deletedAt: new Date(),
        statusBeforeUserSuspension: null,
        // Frees the public URL and removes everything except the name.
        slug: `deleted-${b.id}`,
        tagline: null,
        description: null,
        services: [],
        yearsOfExperience: null,
        phone: "",
        whatsappNumber: "",
        email: null,
        address: null,
        area: null,
        openingHours: Prisma.DbNull,
        instagramUrl: null,
        facebookUrl: null,
        tiktokUrl: null,
        websiteUrl: null,
        logoPublicId: null,
        coverPublicId: null,
        rejectionReason: null,
        isFeatured: false,
        needsRecheck: false,
        viewCount: 0,
        contactClickCount: 0,
        ratingAverage: 0,
        reviewCount: 0,
      },
    });
  } else {
    // Photos, reviews, saves, contact events and moderation history cascade.
    await tx.business.delete({ where: { id: b.id } });
  }

  await tx.adminAuditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      targetBusinessId: b.id,
      targetUserId: b.ownerId,
      summary: `${b.name}${soft ? " (record kept: has payments)" : ""}`,
      reason: input.reason ?? null,
    },
  });

  return { id: b.id, name: b.name, slug: b.slug, ownerId: b.ownerId, soft, files };
}
