"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { revalidatePublicBusiness } from "@/lib/business/revalidate";
import {
  notifyAdminOfListingReport,
  notifyAdminOfReviewReport,
  notifyNewReview,
  notifyOwnerReply,
} from "@/lib/email/notifications";
import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyMessage } from "@/lib/rate-limit";
import {
  LISTING_REPORT_REASONS,
  OWNER_REPLY_MAX,
  REVIEW_COMMENT_MAX,
  REVIEW_COMMENT_MIN,
  REVIEW_REPORT_REASONS,
  type ListingReportReasonValue,
  type ReviewReportReasonValue,
} from "./rules";
import { getReviewEligibility, lockBusinessForReviews, recomputeRating } from "./server";

// Reviews, owner replies and reports. Every action re-checks the session and the rules on the
// server; ratings are recomputed in the same transaction as the review change.

export type ReviewActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const LOGIN = "Please log in to continue.";

const ELIGIBILITY_MESSAGES = {
  UNCONFIRMED: "Please confirm your email address before writing a review.",
  OWNER: "You can't review your own business.",
  NO_CONTACT:
    "You can review a business after contacting it through CustomerHowFar (WhatsApp, call or email) while logged in.",
  NOT_PUBLIC: "This business isn't accepting reviews.",
} as const;

const fieldErrorsOf = (error: z.ZodError) =>
  z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;

const reviewSchema = z.object({
  businessId: z.uuid(),
  rating: z
    .number({ error: "Choose a star rating." })
    .int()
    .min(1, "Choose a star rating.")
    .max(5, "Choose a star rating."),
  comment: z
    .string()
    .trim()
    .min(REVIEW_COMMENT_MIN, `Write at least ${REVIEW_COMMENT_MIN} characters.`)
    .max(REVIEW_COMMENT_MAX, `Use ${REVIEW_COMMENT_MAX} characters or fewer.`),
});

/** Creates the user's review, or updates it if they already wrote one. */
export async function saveReviewAction(
  input: z.input<typeof reviewSchema>,
): Promise<ReviewActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: LOGIN };
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check your review.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }
  const { businessId, rating, comment } = parsed.data;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, ownerId: true, status: true, slug: true },
  });
  if (!business) return { ok: false, error: "We couldn't find that business." };
  const eligibility = await getReviewEligibility(user.id, business);
  if (!eligibility.ok) return { ok: false, error: ELIGIBILITY_MESSAGES[eligibility.reason] };
  const limited = await rateLimit("review", user.id);
  if (!limited.ok) return { ok: false, error: tooManyMessage(limited) };

  const outcome = await prisma.$transaction(async (tx) => {
    await lockBusinessForReviews(tx, businessId);
    const existing = await tx.review.findUnique({
      where: { businessId_userId: { businessId, userId: user.id } },
      select: { id: true },
    });
    const review = existing
      ? await tx.review.update({ where: { id: existing.id }, data: { rating, comment } })
      : await tx.review.create({ data: { businessId, userId: user.id, rating, comment } });
    await recomputeRating(tx, businessId);
    return { id: review.id, created: !existing };
  });

  if (outcome.created) after(() => notifyNewReview(outcome.id));
  revalidatePublicBusiness(business.slug);
  refresh();
  return {
    ok: true,
    message: outcome.created ? "Thank you! Your review is live." : "Your review has been updated.",
  };
}

const idOnly = z.object({ reviewId: z.uuid() });

export async function deleteReviewAction(
  input: z.input<typeof idOnly>,
): Promise<ReviewActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: LOGIN };
  const parsed = idOnly.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const review = await prisma.review.findFirst({
    where: { id: parsed.data.reviewId, userId: user.id },
    select: { id: true, businessId: true, business: { select: { slug: true } } },
  });
  if (!review) return { ok: false, error: "We couldn't find your review." };
  await prisma.$transaction(async (tx) => {
    await lockBusinessForReviews(tx, review.businessId);
    await tx.review.deleteMany({ where: { id: review.id, userId: user.id } });
    await recomputeRating(tx, review.businessId);
  });
  revalidatePublicBusiness(review.business.slug);
  refresh();
  return { ok: true, message: "Your review has been deleted." };
}

const replySchema = z.object({
  reviewId: z.uuid(),
  reply: z.string().trim().max(OWNER_REPLY_MAX, `Use ${OWNER_REPLY_MAX} characters or fewer.`),
});

/** The owner's single public reply. An empty reply removes it. */
export async function ownerReplyAction(
  input: z.input<typeof replySchema>,
): Promise<ReviewActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: LOGIN };
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const review = await prisma.review.findFirst({
    where: { id: parsed.data.reviewId, status: "PUBLISHED", business: { ownerId: user.id } },
    select: { id: true, ownerReply: true, business: { select: { slug: true } } },
  });
  if (!review) return { ok: false, error: "You can only reply to reviews of your own business." };
  const reply = parsed.data.reply || null;
  await prisma.review.update({
    where: { id: review.id },
    data: { ownerReply: reply, ownerReplyAt: reply ? new Date() : null },
  });
  revalidatePublicBusiness(review.business.slug);
  // Tell the reviewer about a new reply (not about edits or removals).
  if (reply && !review.ownerReply) after(() => notifyOwnerReply(review.id));
  refresh();
  return {
    ok: true,
    message: reply ? (review.ownerReply ? "Reply updated." : "Reply posted.") : "Reply removed.",
  };
}

const reviewReasons = REVIEW_REPORT_REASONS.map((r) => r.value) as [
  ReviewReportReasonValue,
  ...ReviewReportReasonValue[],
];
const reviewReportSchema = z.object({
  reviewId: z.uuid(),
  reason: z.enum(reviewReasons, { error: "Choose a reason." }),
});

export async function reportReviewAction(
  input: z.input<typeof reviewReportSchema>,
): Promise<ReviewActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: LOGIN };
  const parsed = reviewReportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const review = await prisma.review.findFirst({
    where: { id: parsed.data.reviewId, status: "PUBLISHED" },
    select: { id: true, userId: true },
  });
  if (!review) return { ok: false, error: "We couldn't find that review." };
  if (review.userId === user.id) return { ok: false, error: "You can't report your own review." };
  const limited = await rateLimit("report", user.id);
  if (!limited.ok) return { ok: false, error: tooManyMessage(limited) };
  try {
    await prisma.reviewReport.create({
      data: { reviewId: review.id, reporterId: user.id, reason: parsed.data.reason },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "You've already reported this review. Our team will look at it." };
    }
    throw error;
  }
  after(() => notifyAdminOfReviewReport(review.id));
  return { ok: true, message: "Thanks. Our team will review this report." };
}

const listingReasons = LISTING_REPORT_REASONS.map((r) => r.value) as [
  ListingReportReasonValue,
  ...ListingReportReasonValue[],
];
const listingReportSchema = z
  .object({
    businessId: z.uuid(),
    reason: z.enum(listingReasons, { error: "Choose a reason." }),
    details: z.string().trim().max(1000, "Use 1000 characters or fewer."),
  })
  .refine((v) => v.reason !== "OTHER" || v.details.length >= 10, {
    path: ["details"],
    message: "Please tell us what's wrong (at least 10 characters).",
  });

export async function reportListingAction(
  input: z.input<typeof listingReportSchema>,
): Promise<ReviewActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: LOGIN };
  const parsed = listingReportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }
  const business = await prisma.business.findFirst({
    where: { id: parsed.data.businessId, status: "APPROVED" },
    select: { id: true, ownerId: true },
  });
  if (!business) return { ok: false, error: "We couldn't find that business." };
  if (business.ownerId === user.id) {
    return { ok: false, error: "You can't report your own business." };
  }
  const limited = await rateLimit("report", user.id);
  if (!limited.ok) return { ok: false, error: tooManyMessage(limited) };
  let reportId: string;
  try {
    const report = await prisma.businessReport.create({
      data: {
        businessId: business.id,
        reporterId: user.id,
        reason: parsed.data.reason,
        details: parsed.data.details || null,
      },
      select: { id: true },
    });
    reportId = report.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        ok: false,
        error: "You've already reported this business. Our team is looking at it.",
      };
    }
    throw error;
  }
  after(() => notifyAdminOfListingReport(reportId));
  return { ok: true, message: "Thanks for telling us. Our team will look into it." };
}
