import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { notifyAdminOfSubmission, notifyPaymentReceipt } from "@/lib/email/notifications";
import { settlePaymentInTx } from "@/lib/payments/settle";
import { prisma } from "@/lib/prisma";

/**
 * Records a confirmed provider payment by reference (for the future Paystack webhook/verify
 * step, after the amount has been verified with the provider). Idempotent.
 * Paying never publishes a listing: it moves PENDING_PAYMENT to PENDING_REVIEW only.
 */
export async function markPaymentSuccessful(
  reference: string,
  details: { paidAt?: Date; metadata?: Prisma.InputJsonValue } = {},
) {
  const payment = await prisma.payment.findUnique({ where: { reference }, select: { id: true } });
  if (!payment) throw new Error("Unknown payment reference.");
  const result = await prisma.$transaction((tx) =>
    settlePaymentInTx(tx, { paymentId: payment.id, from: ["PENDING"], ...details }),
  );
  if (result.outcome === "settled") {
    await notifyPaymentReceipt(payment.id);
    if (result.movedToReview) await notifyAdminOfSubmission(result.businessId, false);
  }
  return { alreadyProcessed: result.outcome === "already-settled" };
}
