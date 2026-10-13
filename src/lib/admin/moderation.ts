import "server-only";
import type { BusinessStatus, Prisma } from "@/generated/prisma/client";
import { acceptIdentityInTx } from "@/lib/identity/server";

// Business approval rules shared by "Approve" and "Confirm payment and approve listing".
// (Kept out of the "use server" actions file so these helpers can't be called from a browser.)

export class StaleError extends Error {}
export class RuleError extends Error {}

/**
 * Approves a business inside the caller's transaction. Rules:
 * - it must currently be PENDING_REVIEW (and still have the status the admin saw, if given);
 * - payment fairness: if the fee was on when it was submitted, it needs a SUCCESS payment;
 * - identity: the owner's ID check must be APPROVED. With `acceptIdentity`, the owner's pending
 *   ID check is accepted in the same transaction ("Accept ID and approve listing").
 * Records an APPROVED moderation decision. Returns the slug (for revalidation).
 */
export async function approveBusinessInTx(
  tx: Prisma.TransactionClient,
  input: {
    businessId: string;
    adminId: string;
    expectedStatus?: BusinessStatus;
    comment?: string;
    acceptIdentity?: { verificationId: string; nameReadByAdmin: string };
  },
): Promise<string> {
  await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${input.businessId}::uuid FOR UPDATE`;
  const current = await tx.business.findUnique({
    where: { id: input.businessId },
    select: {
      status: true,
      publishedAt: true,
      feeRequiredAtSubmit: true,
      slug: true,
      ownerId: true,
    },
  });
  if (!current) throw new StaleError();
  if (input.expectedStatus && current.status !== input.expectedStatus) throw new StaleError();
  if (current.status !== "PENDING_REVIEW") {
    throw new RuleError("Only listings in review can be approved.");
  }
  if (current.feeRequiredAtSubmit) {
    const paid = await tx.payment.count({
      where: { businessId: input.businessId, status: "SUCCESS" },
    });
    if (paid === 0) {
      throw new RuleError(
        "Can't approve: this listing was submitted while the listing fee was on, and it has no successful payment.",
      );
    }
  }
  if (input.acceptIdentity) {
    const pending = await tx.identityVerification.findFirst({
      where: {
        id: input.acceptIdentity.verificationId,
        userId: current.ownerId,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (!pending) throw new StaleError();
    await acceptIdentityInTx(tx, { ...input.acceptIdentity, adminId: input.adminId });
  }
  const idApproved = await tx.identityVerification.count({
    where: { userId: current.ownerId, status: "APPROVED" },
  });
  if (idApproved === 0) {
    throw new RuleError(
      "Can't approve: the owner's ID check hasn't been accepted yet. Review their ID first (or use \"Accept ID and approve listing\").",
    );
  }
  const updated = await tx.business.updateMany({
    where: { id: input.businessId, status: "PENDING_REVIEW" },
    data: {
      status: "APPROVED",
      publishedAt: current.publishedAt ?? new Date(),
      needsRecheck: false,
      rejectionReason: null,
    },
  });
  if (updated.count !== 1) throw new StaleError();
  await tx.moderationDecision.create({
    data: {
      businessId: input.businessId,
      adminId: input.adminId,
      action: "APPROVED",
      comment: input.comment ?? null,
    },
  });
  return current.slug;
}
