"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { AccountRuleError } from "@/lib/accounts/account-error";
import { suspendUser } from "@/lib/accounts/users";
import { requireAdmin } from "@/lib/auth/session";
import { revalidatePublicBusiness } from "@/lib/business/revalidate";
import { notifyListingSuspended, notifyUserSuspended } from "@/lib/email/notifications";
import { prisma } from "@/lib/prisma";
import { lockBusinessForReviews, recomputeRating } from "@/lib/reviews/server";

// Admin decisions on reported reviews and listings. requireAdmin() first (404 for anyone
// else). Every decision resolves the open reports and is recorded in the audit log.

export type ReportActionResult = { ok: true; message: string } | { ok: false; error: string };

const reviewOnly = z.object({ reviewId: z.uuid() });
const STALE = "This was already handled. Reload the page.";

async function loadReview(reviewId: string) {
  return prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true, businessId: true, business: { select: { slug: true } } },
  });
}

/** Hides a review (it stops counting in the rating) and closes its open reports. */
export async function hideReviewAction(
  input: z.input<typeof reviewOnly>,
): Promise<ReportActionResult> {
  const admin = await requireAdmin();
  const parsed = reviewOnly.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const review = await loadReview(parsed.data.reviewId);
  if (!review) return { ok: false, error: STALE };
  const done = await prisma.$transaction(async (tx) => {
    await lockBusinessForReviews(tx, review.businessId);
    const { count } = await tx.review.updateMany({
      where: { id: review.id, status: "PUBLISHED" },
      data: { status: "HIDDEN" },
    });
    if (count !== 1) return false;
    await tx.reviewReport.updateMany({
      where: { reviewId: review.id, status: "OPEN" },
      data: { status: "ACTIONED", resolvedById: admin.id, resolvedAt: new Date() },
    });
    await recomputeRating(tx, review.businessId);
    await tx.adminAuditLog.create({
      data: {
        actorId: admin.id,
        action: "REVIEW_HIDDEN",
        targetReviewId: review.id,
        targetBusinessId: review.businessId,
      },
    });
    return true;
  });
  if (!done) return { ok: false, error: STALE };
  revalidatePublicBusiness(review.business.slug);
  refresh();
  return { ok: true, message: "Review hidden. It no longer counts in the rating." };
}

export async function restoreReviewAction(
  input: z.input<typeof reviewOnly>,
): Promise<ReportActionResult> {
  const admin = await requireAdmin();
  const parsed = reviewOnly.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const review = await loadReview(parsed.data.reviewId);
  if (!review) return { ok: false, error: STALE };
  const done = await prisma.$transaction(async (tx) => {
    await lockBusinessForReviews(tx, review.businessId);
    const { count } = await tx.review.updateMany({
      where: { id: review.id, status: "HIDDEN" },
      data: { status: "PUBLISHED" },
    });
    if (count !== 1) return false;
    await recomputeRating(tx, review.businessId);
    await tx.adminAuditLog.create({
      data: {
        actorId: admin.id,
        action: "REVIEW_RESTORED",
        targetReviewId: review.id,
        targetBusinessId: review.businessId,
      },
    });
    return true;
  });
  if (!done) return { ok: false, error: STALE };
  revalidatePublicBusiness(review.business.slug);
  refresh();
  return { ok: true, message: "Review restored and counted in the rating again." };
}

export async function dismissReviewReportsAction(
  input: z.input<typeof reviewOnly>,
): Promise<ReportActionResult> {
  const admin = await requireAdmin();
  const parsed = reviewOnly.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const review = await loadReview(parsed.data.reviewId);
  if (!review) return { ok: false, error: STALE };
  const count = await prisma.$transaction(async (tx) => {
    const { count } = await tx.reviewReport.updateMany({
      where: { reviewId: review.id, status: "OPEN" },
      data: { status: "DISMISSED", resolvedById: admin.id, resolvedAt: new Date() },
    });
    if (count > 0) {
      await tx.adminAuditLog.create({
        data: {
          actorId: admin.id,
          action: "REVIEW_REPORTS_DISMISSED",
          targetReviewId: review.id,
          targetBusinessId: review.businessId,
          summary: `${count} report${count === 1 ? "" : "s"}`,
        },
      });
    }
    return count;
  });
  if (count === 0) return { ok: false, error: STALE };
  refresh();
  return { ok: true, message: "Reports dismissed. The review stays visible." };
}

const listingSchema = z
  .object({
    businessId: z.uuid(),
    action: z.enum(["dismiss", "suspend_listing", "suspend_user"]),
    reason: z.string().trim().max(1000, "Keep it under 1000 characters."),
  })
  .refine((v) => v.action === "dismiss" || v.reason.length >= 10, {
    message: "Please write a reason of at least 10 characters.",
  });

export async function resolveListingReportsAction(
  input: z.input<typeof listingSchema>,
): Promise<ReportActionResult> {
  const admin = await requireAdmin();
  const parsed = listingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { businessId, action, reason } = parsed.data;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, slug: true, status: true, ownerId: true },
  });
  if (!business || business.status === "DELETED") return { ok: false, error: STALE };

  const resolve = (resolution: string, status: "DISMISSED" | "ACTIONED") =>
    prisma.$transaction(async (tx) => {
      const { count } = await tx.businessReport.updateMany({
        where: { businessId, status: "OPEN" },
        data: { status, resolution, resolvedById: admin.id, resolvedAt: new Date() },
      });
      if (count > 0) {
        await tx.adminAuditLog.create({
          data: {
            actorId: admin.id,
            action:
              status === "DISMISSED" ? "LISTING_REPORTS_DISMISSED" : "LISTING_REPORTS_ACTIONED",
            targetBusinessId: businessId,
            targetUserId: business.ownerId,
            summary: `${resolution} (${count} report${count === 1 ? "" : "s"})`,
            reason: reason || null,
          },
        });
      }
      return count;
    });

  if (action === "dismiss") {
    if ((await resolve("Dismissed", "DISMISSED")) === 0) return { ok: false, error: STALE };
    refresh();
    return { ok: true, message: "Reports dismissed. The listing stays as it is." };
  }

  if (action === "suspend_listing") {
    const suspended = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${businessId}::uuid FOR UPDATE`;
      const { count } = await tx.business.updateMany({
        where: {
          id: businessId,
          status: { in: ["APPROVED", "PENDING_REVIEW", "PENDING_PAYMENT", "REJECTED"] },
        },
        data: { status: "SUSPENDED", isFeatured: false },
      });
      if (count !== 1) return false;
      await tx.moderationDecision.create({
        data: { businessId, adminId: admin.id, action: "SUSPENDED", comment: reason },
      });
      return true;
    });
    if (!suspended) return { ok: false, error: "This listing is already suspended." };
    await resolve("Listing suspended", "ACTIONED");
    after(() => notifyListingSuspended(businessId, reason));
    revalidatePublicBusiness(business.slug);
    refresh();
    return { ok: true, message: "Listing suspended and the owner emailed. Reports closed." };
  }

  // Suspend the owner: all their listings are hidden and they can't log in.
  let result;
  try {
    result = await suspendUser({ userId: business.ownerId, adminId: admin.id, reason });
  } catch (error) {
    if (error instanceof AccountRuleError) return { ok: false, error: error.message };
    throw error;
  }
  await resolve("Owner suspended", "ACTIONED");
  for (const slug of result.slugs) revalidatePublicBusiness(slug);
  after(() => notifyUserSuspended(business.ownerId));
  refresh();
  return { ok: true, message: "Owner suspended: their listings are hidden. Reports closed." };
}
