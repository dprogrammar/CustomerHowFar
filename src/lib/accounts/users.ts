import "server-only";
import { Prisma, type Role } from "@/generated/prisma/client";
import { purgeUserIdentityImages } from "@/lib/identity/server";
import { prisma } from "@/lib/prisma";
import type { StoredFile } from "@/lib/storage/cleanup";
import {
  banAuthUser,
  deleteAuthUser,
  revokeAllSessions,
  setAuthAdminFlag,
  unbanAuthUser,
} from "@/lib/supabase/admin";
import { lockBusinessForReviews, recomputeRating } from "@/lib/reviews/server";
import { assertNotLastAdmin } from "./admin-guard";
import { AccountRuleError, deleteBusinessInTx, type DeletedBusiness } from "./business-deletion";

// Account operations shared by admin and self-service actions. Callers check who is allowed;
// these enforce the data rules, run in transactions and return what must happen afterwards
// (file deletions, cache revalidation, emails). Nothing here logs personal data.

const DELETED_EMAIL_DOMAIN = "deleted.invalid";

async function lockProfile(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM profiles WHERE id = ${userId}::uuid FOR UPDATE`;
  const p = await tx.profile.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true },
  });
  if (!p || p.status === "DELETED") throw new AccountRuleError("This account no longer exists.");
  return p;
}

// --- Suspension ----------------------------------------------------------------------------

export async function suspendUser(input: { userId: string; adminId: string; reason: string }) {
  if (input.userId === input.adminId) throw new AccountRuleError("You can't suspend yourself.");
  const slugs = await prisma.$transaction(async (tx) => {
    const p = await lockProfile(tx, input.userId);
    if (p.status === "SUSPENDED") throw new AccountRuleError("This user is already suspended.");
    if (p.role === "ADMIN") await assertNotLastAdmin(tx, p.id);
    const businesses = await tx.business.findMany({
      where: { ownerId: p.id, status: { not: "DELETED" } },
      select: { id: true, slug: true, status: true },
    });
    // Remember each listing's status so unsuspending restores it exactly.
    for (const b of businesses) {
      await tx.business.update({
        where: { id: b.id },
        data: { statusBeforeUserSuspension: b.status, status: "SUSPENDED" },
      });
    }
    await tx.profile.update({
      where: { id: p.id },
      data: { status: "SUSPENDED", suspensionReason: input.reason, suspendedAt: new Date() },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId: input.adminId,
        action: "USER_SUSPENDED",
        targetUserId: p.id,
        summary: `${businesses.length} business${businesses.length === 1 ? "" : "es"} hidden`,
        reason: input.reason,
      },
    });
    return businesses.map((b) => b.slug);
  });
  // Block logins and end every session (the app also refuses suspended profiles).
  const banned = await banAuthUser(input.userId);
  await revokeAllSessions(input.userId);
  return { slugs, banned };
}

export async function unsuspendUser(input: { userId: string; adminId: string }) {
  const slugs = await prisma.$transaction(async (tx) => {
    const p = await lockProfile(tx, input.userId);
    if (p.status !== "SUSPENDED") throw new AccountRuleError("This user isn't suspended.");
    const businesses = await tx.business.findMany({
      where: { ownerId: p.id, statusBeforeUserSuspension: { not: null } },
      select: { id: true, slug: true, statusBeforeUserSuspension: true },
    });
    for (const b of businesses) {
      await tx.business.update({
        where: { id: b.id },
        data: { status: b.statusBeforeUserSuspension!, statusBeforeUserSuspension: null },
      });
    }
    await tx.profile.update({
      where: { id: p.id },
      data: { status: "ACTIVE", suspensionReason: null, suspendedAt: null },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId: input.adminId,
        action: "USER_UNSUSPENDED",
        targetUserId: p.id,
        summary: `${businesses.length} business${businesses.length === 1 ? "" : "es"} restored`,
      },
    });
    return businesses.map((b) => b.slug);
  });
  const unbanned = await unbanAuthUser(input.userId);
  return { slugs, unbanned };
}

// --- Role ----------------------------------------------------------------------------------

export async function changeUserRole(input: { userId: string; adminId: string; role: Role }) {
  if (input.userId === input.adminId) {
    throw new AccountRuleError("You can't change your own role. Ask another admin.");
  }
  const previous = await prisma.$transaction(async (tx) => {
    const p = await lockProfile(tx, input.userId);
    if (p.role === input.role) throw new AccountRuleError("The user already has that role.");
    if (p.role === "ADMIN") await assertNotLastAdmin(tx, p.id);
    await tx.profile.update({ where: { id: p.id }, data: { role: input.role } });
    await tx.adminAuditLog.create({
      data: {
        actorId: input.adminId,
        action: "USER_ROLE_CHANGED",
        targetUserId: p.id,
        summary: `${p.role} -> ${input.role}`,
      },
    });
    return p.role;
  });
  let synced = true;
  if (previous === "ADMIN" || input.role === "ADMIN") {
    synced = await setAuthAdminFlag(input.userId, input.role === "ADMIN");
    // A demoted admin must get a fresh token without the admin flag.
    if (previous === "ADMIN") await revokeAllSessions(input.userId);
  }
  return { synced };
}

// --- Deletion ------------------------------------------------------------------------------

export type DeletedAccount = {
  businesses: DeletedBusiness[];
  files: StoredFile[];
  /** Businesses whose rating changed because this user's reviews were deleted. */
  reviewedSlugs: string[];
};

/**
 * Deletes a user's account (right to erasure), keeping only anonymized payment records:
 * - their businesses are deleted (soft-deleted where payments exist);
 * - ID images are deleted now; verification records lose the name and the link to the user;
 * - saved businesses, reviews and contact events are deleted;
 * - payments keep amount, date, reference, method and business name only;
 * - the profile is deleted, or replaced by an anonymous placeholder if payments point to it;
 * - the Supabase login is deleted, so the email can sign up again.
 */
export async function deleteUserAccount(input: {
  userId: string;
  actorId: string | null;
  self: boolean;
  reason?: string | null;
}): Promise<DeletedAccount> {
  // Check the rules before touching anything (they're checked again, with locks, below).
  await prisma.$transaction(async (tx) => {
    const p = await lockProfile(tx, input.userId);
    if (p.role === "ADMIN") await assertNotLastAdmin(tx, p.id);
  });
  // The login goes first: if anything later fails, the person can't sign in to a half-deleted
  // account, and running the deletion again finishes the job.
  if (!(await deleteAuthUser(input.userId))) {
    throw new AccountRuleError("We couldn't remove the login. Nothing was deleted. Try again.");
  }
  // ID photos are the most sensitive data: delete them straight away. Any that fail are
  // retried by the daily job (their records are unlinked from the user below).
  await purgeUserIdentityImages(input.userId);

  const result = await prisma.$transaction(
    async (tx) => {
      const p = await lockProfile(tx, input.userId);
      if (p.role === "ADMIN") await assertNotLastAdmin(tx, p.id);

      const owned = await tx.business.findMany({
        where: { ownerId: p.id, status: { not: "DELETED" } },
        select: { id: true },
      });
      const businesses: DeletedBusiness[] = [];
      for (const b of owned) {
        businesses.push(
          await deleteBusinessInTx(tx, {
            businessId: b.id,
            actorId: input.actorId,
            action: input.self ? "BUSINESS_SELF_DELETED" : "BUSINESS_DELETED",
            reason: "Account deleted",
          }),
        );
      }

      // Payments: keep the accounting facts, drop everything personal (incl. receipt files).
      const proofs = await tx.payment.findMany({
        where: { userId: p.id, proofPublicId: { not: null } },
        select: { proofPublicId: true },
      });
      await tx.payment.updateMany({
        where: { userId: p.id, status: { in: ["PENDING", "AWAITING_CONFIRMATION"] } },
        data: { status: "ABANDONED" },
      });
      await tx.payment.updateMany({
        where: { userId: p.id },
        data: {
          senderName: null,
          senderBank: null,
          metadata: Prisma.DbNull,
          proofPublicId: null,
          proofFormat: null,
        },
      });

      await tx.identityVerification.updateMany({
        where: { userId: p.id },
        data: { userId: null, fullNameOnId: "Deleted account", nameReadByAdmin: null },
      });
      await tx.savedBusiness.deleteMany({ where: { userId: p.id } });
      // Their reviews go, and the ratings of the businesses they reviewed are recomputed.
      const reviewed = await tx.review.findMany({
        where: { userId: p.id },
        select: { businessId: true, business: { select: { slug: true } } },
      });
      await tx.review.deleteMany({ where: { userId: p.id } });
      for (const r of reviewed) {
        await lockBusinessForReviews(tx, r.businessId);
        await recomputeRating(tx, r.businessId);
      }
      await tx.reviewReport.deleteMany({ where: { reporterId: p.id } });
      await tx.businessReport.deleteMany({ where: { reporterId: p.id } });
      await tx.contactEvent.deleteMany({ where: { userId: p.id } });

      await tx.adminAuditLog.create({
        data: {
          actorId: input.self ? null : input.actorId,
          action: input.self ? "USER_SELF_DELETED" : "USER_DELETED",
          targetUserId: p.id,
          summary: `Role ${p.role}; ${businesses.length} business${businesses.length === 1 ? "" : "es"} deleted`,
          reason: input.reason ?? null,
        },
      });

      const stillReferenced =
        (await tx.payment.count({ where: { userId: p.id } })) > 0 ||
        (await tx.business.count({ where: { ownerId: p.id } })) > 0;
      if (stillReferenced) {
        await tx.profile.update({
          where: { id: p.id },
          data: {
            fullName: "Deleted user",
            email: `deleted-${p.id}@${DELETED_EMAIL_DOMAIN}`,
            phone: null,
            avatarUrl: null,
            role: "CUSTOMER",
            status: "DELETED",
            suspensionReason: null,
            suspendedAt: null,
            deletedAt: new Date(),
          },
        });
      } else {
        await tx.profile.delete({ where: { id: p.id } });
      }

      return {
        businesses,
        reviewedSlugs: reviewed.map((r) => r.business.slug),
        files: [
          ...businesses.flatMap((b) => b.files),
          ...proofs.map((x) => ({ publicId: x.proofPublicId!, private: true })),
        ],
      };
    },
    { timeout: 30_000 },
  );
  return result;
}
