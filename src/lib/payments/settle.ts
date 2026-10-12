import "server-only";
import type { Prisma } from "@/generated/prisma/client";

export type SettleResult =
  | { outcome: "settled"; businessId: string; movedToReview: boolean }
  | { outcome: "already-settled"; businessId: string };

export class SettleError extends Error {}

/**
 * Marks a payment as successful, for ANY payment method (bank transfer today, Paystack later).
 * Call inside a transaction. Idempotent: settling an already-successful payment changes nothing.
 *
 * - locks the payment row;
 * - for bank transfers, requires the declared amount to cover the fee recorded on the row;
 * - marks it SUCCESS with paidAt (and the reviewing admin, if any);
 * - moves the business from PENDING_PAYMENT to PENDING_REVIEW (never to APPROVED).
 */
export async function settlePaymentInTx(
  tx: Prisma.TransactionClient,
  input: {
    paymentId: string;
    /** Statuses this method may settle from (e.g. AWAITING_CONFIRMATION for transfers). */
    from: ("PENDING" | "AWAITING_CONFIRMATION")[];
    reviewedById?: string;
    paidAt?: Date;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<SettleResult> {
  await tx.$queryRaw`SELECT id FROM payments WHERE id = ${input.paymentId}::uuid FOR UPDATE`;
  const payment = await tx.payment.findUnique({ where: { id: input.paymentId } });
  if (!payment) throw new SettleError("Payment not found.");
  if (payment.status === "SUCCESS")
    return { outcome: "already-settled", businessId: payment.businessId };
  if (!input.from.includes(payment.status as "PENDING" | "AWAITING_CONFIRMATION")) {
    throw new SettleError("This payment can no longer be confirmed. Reload the page.");
  }
  if (
    payment.provider === "MANUAL_TRANSFER" &&
    (payment.amountSentKobo ?? 0) < payment.amountKobo
  ) {
    throw new SettleError(
      "The amount the owner says they sent is less than the fee. Reject the proof as 'Amount incorrect' instead.",
    );
  }

  await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: "SUCCESS",
      paidAt: input.paidAt ?? new Date(),
      reviewedById: input.reviewedById ?? null,
      reviewedAt: input.reviewedById ? new Date() : null,
      rejectionReason: null,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
  });

  await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${payment.businessId}::uuid FOR UPDATE`;
  const moved = await tx.business.updateMany({
    where: { id: payment.businessId, status: "PENDING_PAYMENT" },
    data: { status: "PENDING_REVIEW", submittedAt: new Date(), needsRecheck: false },
  });
  return { outcome: "settled", businessId: payment.businessId, movedToReview: moved.count === 1 };
}
