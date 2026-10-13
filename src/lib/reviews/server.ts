import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Review eligibility and rating sync. Reviews are allowed only from logged-in, active users
// with a confirmed email who contacted the business through CustomerHowFar while logged in
// (a WhatsApp/call/email ContactEvent with their user id), and never from the owner.

export type Eligibility =
  { ok: true } | { ok: false; reason: "UNCONFIRMED" | "OWNER" | "NO_CONTACT" | "NOT_PUBLIC" };

export async function isEmailConfirmed(userId: string) {
  const [row] = await prisma.$queryRaw<{ confirmed: boolean }[]>`
    SELECT email_confirmed_at IS NOT NULL AS confirmed FROM auth.users WHERE id = ${userId}::uuid`;
  return Boolean(row?.confirmed);
}

export async function getReviewEligibility(
  userId: string,
  business: { id: string; ownerId: string; status: string },
): Promise<Eligibility> {
  if (business.status !== "APPROVED") return { ok: false, reason: "NOT_PUBLIC" };
  if (business.ownerId === userId) return { ok: false, reason: "OWNER" };
  if (!(await isEmailConfirmed(userId))) return { ok: false, reason: "UNCONFIRMED" };
  const contacted = await prisma.contactEvent.findFirst({
    where: { businessId: business.id, userId, type: { in: ["WHATSAPP", "CALL", "EMAIL"] } },
    select: { id: true },
  });
  return contacted ? { ok: true } : { ok: false, reason: "NO_CONTACT" };
}

/**
 * Locks the business row so concurrent review changes are applied one at a time. Call first
 * in every transaction that changes a review, then recomputeRating() at the end.
 */
export async function lockBusinessForReviews(tx: Prisma.TransactionClient, businessId: string) {
  await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${businessId}::uuid FOR UPDATE`;
}

/** Recomputes ratingAverage and reviewCount from PUBLISHED reviews (raw SQL keeps updated_at). */
export async function recomputeRating(tx: Prisma.TransactionClient, businessId: string) {
  await tx.$executeRaw`
    UPDATE businesses b SET
      review_count = s.n,
      rating_average = s.avg
    FROM (
      SELECT count(*)::int AS n, coalesce(round(avg(rating)::numeric, 2), 0) AS avg
      FROM reviews WHERE business_id = ${businessId}::uuid AND status = 'PUBLISHED'
    ) s
    WHERE b.id = ${businessId}::uuid`;
}

/** Published reviews (plus the viewer's own, even if hidden), newest first, and the breakdown. */
export async function getBusinessReviews(businessId: string, viewerId: string | null) {
  const [reviews, groups] = await Promise.all([
    prisma.review.findMany({
      where: {
        businessId,
        OR: [{ status: "PUBLISHED" }, ...(viewerId ? [{ userId: viewerId }] : [])],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        userId: true,
        rating: true,
        comment: true,
        status: true,
        ownerReply: true,
        ownerReplyAt: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { fullName: true } },
      },
    }),
    prisma.review.groupBy({
      by: ["rating"],
      where: { businessId, status: "PUBLISHED" },
      _count: { _all: true },
    }),
  ]);
  const breakdown = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: groups.find((g) => g.rating === stars)?._count._all ?? 0,
  }));
  return { reviews, breakdown };
}
