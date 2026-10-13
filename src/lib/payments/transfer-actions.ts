"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { findOwnedBusiness, hasSuccessfulPayment } from "@/lib/business/queries";
import { deleteProof, sealProof, verifyUploadedProof } from "@/lib/cloudinary";
import { notifyAdminOfTransferProof, notifyProofReceived } from "@/lib/email/notifications";
import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyMessage } from "@/lib/rate-limit";
import { getPaymentConfig, newPaymentReference } from "./config";
import { PAYMENT_METHODS } from "./methods";

// Owner-side bank transfer flow. Every action re-checks the session, ownership, the business
// status and the payment settings on the server.

export type TransferActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const NOT_AVAILABLE = "Payment isn't needed for this listing right now. Reload the page.";

async function loadPayable(businessId: string) {
  const session = await getSessionUser();
  if (!session) return { error: "Please log in again." } as const;
  const business = await findOwnedBusiness(businessId, session.id);
  if (!business) return { error: "We couldn't find that business." } as const;
  if (business.status !== "PENDING_PAYMENT") return { error: NOT_AVAILABLE } as const;
  if (await hasSuccessfulPayment(business.id)) {
    return { error: "You've already paid for this listing. You won't be charged again." } as const;
  }
  const config = await getPaymentConfig();
  const transfer = PAYMENT_METHODS.find((m) => m.id === "MANUAL_TRANSFER")!;
  if (!config.paymentRequired) return { error: NOT_AVAILABLE } as const;
  if (!transfer.isAvailable(config)) {
    return { error: "Bank transfer isn't available right now. Please try again later." } as const;
  }
  return { session, business, config } as const;
}

/** Starts (or resumes) a bank transfer: one PENDING payment with a stable reference. */
export async function startBankTransferAction(businessId: string): Promise<TransferActionResult> {
  if (!z.uuid().safeParse(businessId).success) return { ok: false, error: "Invalid request." };
  const loaded = await loadPayable(businessId);
  if ("error" in loaded) return { ok: false, error: loaded.error! };
  const { session, business, config } = loaded;
  const amountKobo = config.listingFeeNaira * 100;

  const awaiting = await prisma.payment.findFirst({
    where: { businessId: business.id, status: "AWAITING_CONFIRMATION" },
    select: { id: true },
  });
  if (awaiting)
    return {
      ok: false,
      error: "You've already sent a payment proof. Please wait for confirmation.",
    };

  const pending = await prisma.payment.findFirst({
    where: { businessId: business.id, provider: "MANUAL_TRANSFER", status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (pending) {
    // Keep the reference; refresh the amount in case the fee changed before they paid.
    if (pending.amountKobo !== amountKobo) {
      await prisma.payment.update({ where: { id: pending.id }, data: { amountKobo } });
    }
  } else {
    await prisma.payment.create({
      data: {
        businessId: business.id,
        userId: session.id,
        provider: "MANUAL_TRANSFER",
        status: "PENDING",
        amountKobo,
        reference: await newPaymentReference(),
      },
    });
  }
  refresh();
  return { ok: true };
}

const MAX_AGE_DAYS = 60;

const proofSchema = z.object({
  businessId: z.uuid(),
  senderName: z
    .string()
    .trim()
    .min(2, "Enter the name on the account you paid from.")
    .max(80, "Use 80 characters or fewer."),
  senderBank: z
    .string()
    .trim()
    .min(2, "Enter the bank you paid from.")
    .max(60, "Use 60 characters or fewer."),
  amountSent: z
    .string()
    .trim()
    .transform((v) => v.replace(/[₦,\s]/g, ""))
    .refine(
      (v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0,
      "Enter the amount you sent, e.g. 5000.",
    )
    .transform((v) => Math.round(Number(v) * 100))
    .refine((kobo) => kobo <= 100_000_000, "That amount looks too large."),
  transferDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date of the transfer.")
    .refine((v) => {
      const date = new Date(`${v}T00:00:00Z`);
      const now = Date.now();
      return (
        !Number.isNaN(date.getTime()) &&
        date.getTime() <= now + 86_400_000 &&
        date.getTime() >= now - MAX_AGE_DAYS * 86_400_000
      );
    }, `The date must be today or within the last ${MAX_AGE_DAYS} days.`),
  proofPublicId: z.string().min(1, "Please upload your payment slip or receipt.").max(300),
});

/** Attaches the uploaded proof and sender details: PENDING -> AWAITING_CONFIRMATION. */
export async function submitTransferProofAction(
  input: z.input<typeof proofSchema>,
): Promise<TransferActionResult> {
  const parsed = proofSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors as Record<
      string,
      string[] | undefined
    >;
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
  }
  const data = parsed.data;

  const loaded = await loadPayable(data.businessId);
  if ("error" in loaded) {
    await deleteOwnProof(data.proofPublicId);
    return { ok: false, error: loaded.error! };
  }
  const { session, business } = loaded;
  const burst = await rateLimit("proof-submit", session.id);
  if (!burst.ok) {
    await deleteOwnProof(data.proofPublicId);
    return { ok: false, error: tooManyMessage(burst) };
  }

  // Must be a private file in this user's proof folder, jpg/png/webp/pdf, at most 5 MB.
  const proof = await verifyUploadedProof(data.proofPublicId, session.id);
  if (!proof) {
    return {
      ok: false,
      error:
        "We couldn't verify your file. Upload a clear photo or PDF of your receipt (max 5 MB).",
    };
  }
  // Invalidate the signed URL the browser got from Cloudinary: only admins can view it now.
  const sealedId = await sealProof(proof.publicId, session.id, "proof");
  if (!sealedId) {
    await deleteProof(proof.publicId);
    return { ok: false, error: "Upload failed. Please try again." };
  }
  proof.publicId = sealedId;

  let paymentId: string | null = null;
  try {
    paymentId = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${business.id}::uuid FOR UPDATE`;
      const awaiting = await tx.payment.count({
        where: { businessId: business.id, status: "AWAITING_CONFIRMATION" },
      });
      if (awaiting > 0) return null;
      const pending = await tx.payment.findFirst({
        where: {
          businessId: business.id,
          provider: "MANUAL_TRANSFER",
          status: "PENDING",
          userId: session.id,
        },
        orderBy: { createdAt: "desc" },
      });
      if (!pending) return null;
      await tx.payment.update({
        where: { id: pending.id },
        data: {
          status: "AWAITING_CONFIRMATION",
          senderName: data.senderName,
          senderBank: data.senderBank,
          amountSentKobo: data.amountSent,
          transferDate: new Date(`${data.transferDate}T00:00:00Z`),
          proofPublicId: proof.publicId,
          proofFormat: proof.format,
          proofSubmittedAt: new Date(),
          rejectionReason: null,
        },
      });
      return pending.id;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      paymentId = null;
    else throw error;
  }

  if (!paymentId) {
    await deleteProof(proof.publicId);
    return {
      ok: false,
      error: "This payment already has a proof waiting for confirmation. Reload the page.",
    };
  }

  const id = paymentId;
  after(async () => {
    await notifyProofReceived(id);
    await notifyAdminOfTransferProof(id);
  });
  refresh();
  return { ok: true, message: "Payment proof submitted. We'll confirm it soon." };
}

async function deleteOwnProof(publicId: string) {
  const session = await getSessionUser();
  if (session && publicId.startsWith(`customerhowfar/proofs/${session.id}/`))
    await deleteProof(publicId);
}

/** Lets the owner take back a proof (e.g. wrong file) while it's still unreviewed. */
export async function withdrawTransferProofAction(
  paymentId: string,
): Promise<TransferActionResult> {
  if (!z.uuid().safeParse(paymentId).success) return { ok: false, error: "Invalid request." };
  const session = await getSessionUser();
  if (!session) return { ok: false, error: "Please log in again." };

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, userId: session.id, business: { ownerId: session.id } },
    select: { id: true, proofPublicId: true },
  });
  if (!payment) return { ok: false, error: "We couldn't find that payment." };

  const { count } = await prisma.payment.updateMany({
    where: { id: payment.id, status: "AWAITING_CONFIRMATION" },
    data: {
      status: "PENDING",
      senderName: null,
      senderBank: null,
      amountSentKobo: null,
      transferDate: null,
      proofPublicId: null,
      proofFormat: null,
      proofSubmittedAt: null,
    },
  });
  if (count === 0)
    return { ok: false, error: "This proof has already been reviewed. Reload the page." };
  await deleteProof(payment.proofPublicId);
  refresh();
  return { ok: true, message: "Proof withdrawn. You can upload a corrected one." };
}
