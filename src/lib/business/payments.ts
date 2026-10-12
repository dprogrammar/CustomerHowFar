import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Records a confirmed listing-fee payment (to be called from the Paystack webhook/verify step
 * after the amount and reference have been verified with Paystack). Idempotent: confirming the
 * same reference twice changes nothing.
 *
 * Paying never publishes a listing: a business waiting for payment moves to PENDING_REVIEW,
 * and only an admin can approve it.
 */
export async function markPaymentSuccessful(
  reference: string,
  details: { paidAt?: Date; metadata?: Prisma.InputJsonValue } = {},
) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { reference } });
    if (!payment) throw new Error("Unknown payment reference.");
    if (payment.status === "SUCCESS") return { alreadyProcessed: true };

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "SUCCESS", paidAt: details.paidAt ?? new Date(), metadata: details.metadata },
    });

    // Lock the business row so a concurrent submit/approve can't interleave.
    await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${payment.businessId}::uuid FOR UPDATE`;
    await tx.business.updateMany({
      where: { id: payment.businessId, status: "PENDING_PAYMENT" },
      data: { status: "PENDING_REVIEW", submittedAt: new Date(), needsRecheck: false },
    });
    return { alreadyProcessed: false };
  });
}
