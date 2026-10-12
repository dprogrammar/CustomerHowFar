"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { revalidatePublicBusiness } from "@/lib/business/revalidate";
import {
  notifyListingApproved,
  notifyPaymentReceipt,
  notifyProofRejected,
} from "@/lib/email/notifications";
import { SettleError, settlePaymentInTx } from "@/lib/payments/settle";
import { prisma } from "@/lib/prisma";
import { approveBusinessInTx, RuleError, StaleError } from "./moderation";

export type PaymentActionResult = { ok: true; message: string } | { ok: false; error: string };

const confirmSchema = z.object({ paymentId: z.uuid(), approve: z.boolean() });

/**
 * Confirms a bank transfer after the admin has seen the money in the bank account.
 * With approve = true, also approves the listing in the SAME transaction (all approval rules
 * apply; if approval isn't possible, nothing is changed). Confirming twice changes nothing.
 */
export async function confirmTransferAction(
  input: z.input<typeof confirmSchema>,
): Promise<PaymentActionResult> {
  const admin = await requireAdmin();
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { paymentId, approve } = parsed.data;

  let outcome: { businessId: string; already: boolean; approvedSlug: string | null };
  try {
    outcome = await prisma.$transaction(async (tx) => {
      const settled = await settlePaymentInTx(tx, {
        paymentId,
        from: ["AWAITING_CONFIRMATION"],
        reviewedById: admin.id,
      });
      if (settled.outcome === "already-settled") {
        return { businessId: settled.businessId, already: true, approvedSlug: null };
      }
      const approvedSlug = approve
        ? await approveBusinessInTx(tx, {
            businessId: settled.businessId,
            adminId: admin.id,
            comment: "Approved together with bank transfer confirmation.",
          })
        : null;
      return { businessId: settled.businessId, already: false, approvedSlug };
    });
  } catch (error) {
    if (error instanceof SettleError || error instanceof RuleError)
      return { ok: false, error: error.message };
    if (error instanceof StaleError)
      return { ok: false, error: "The listing changed. Reload the page and try again." };
    throw error;
  }

  if (outcome.already) {
    return { ok: true, message: "This payment was already confirmed. Nothing was changed." };
  }
  const { businessId, approvedSlug } = outcome;
  after(async () => {
    await notifyPaymentReceipt(paymentId);
    if (approvedSlug) await notifyListingApproved(businessId);
  });
  if (approvedSlug) revalidatePublicBusiness(approvedSlug);
  refresh();
  return {
    ok: true,
    message: approvedSlug
      ? "Payment confirmed and listing approved. The owner has been emailed a receipt."
      : "Payment confirmed. The listing is now in the review queue and the owner has been emailed a receipt.",
  };
}

const rejectSchema = z.object({
  paymentId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(5, "Please give the owner a reason (at least 5 characters).")
    .max(500),
});

/** Rejects a transfer proof; the owner is emailed the reason and can upload a new proof. */
export async function rejectTransferProofAction(
  input: z.input<typeof rejectSchema>,
): Promise<PaymentActionResult> {
  const admin = await requireAdmin();
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };

  const { count } = await prisma.payment.updateMany({
    where: { id: parsed.data.paymentId, status: "AWAITING_CONFIRMATION" },
    data: {
      status: "FAILED",
      rejectionReason: parsed.data.reason,
      reviewedById: admin.id,
      reviewedAt: new Date(),
    },
  });
  if (count === 0) {
    return { ok: false, error: "This payment was already reviewed or withdrawn. Reload the page." };
  }
  after(() => notifyProofRejected(parsed.data.paymentId));
  refresh();
  return {
    ok: true,
    message: "Proof rejected. The owner has been emailed the reason and can upload a new proof.",
  };
}
