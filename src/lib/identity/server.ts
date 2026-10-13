import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { PUBLIC_TAGS } from "@/lib/business/cache-tags";
import { deletePrivateFile } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { RETENTION_DAYS, type IdentityState } from "./rules";

// Server-side identity helpers. Image public IDs never leave the server except as admin-only,
// short-lived download links.

/** The owner's current identity state, without any image references. */
export async function getIdentityState(userId: string) {
  const latest = await prisma.identityVerification.findFirst({
    where: { userId, status: { in: ["PENDING", "APPROVED", "REJECTED"] } },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      status: true,
      idType: true,
      rejectionReason: true,
      submittedAt: true,
      reviewedAt: true,
    },
  });
  const state: IdentityState = latest ? (latest.status as IdentityState) : "NONE";
  return { state, latest };
}

/** Submissions in the last 24 hours (for the daily limit), any outcome. */
export async function countRecentSubmissions(userId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.identityVerification.count({ where: { userId, submittedAt: { gte: since } } });
}

export async function isIdentityApproved(
  db: Prisma.TransactionClient | typeof prisma,
  userId: string,
) {
  const row = await db.identityVerification.findFirst({
    where: { userId, status: "APPROVED" },
    select: { id: true },
  });
  return Boolean(row);
}

/** Statuses of many owners at once (admin lists). */
export async function getIdentityStates(userIds: string[]): Promise<Record<string, IdentityState>> {
  if (userIds.length === 0) return {};
  const rows = await prisma.identityVerification.findMany({
    where: { userId: { in: userIds }, status: { in: ["PENDING", "APPROVED", "REJECTED"] } },
    orderBy: { submittedAt: "desc" },
    select: { userId: true, status: true },
  });
  const out: Record<string, IdentityState> = {};
  for (const r of rows) if (r.userId && !out[r.userId]) out[r.userId] = r.status as IdentityState;
  return out;
}

export class IdentityRuleError extends Error {}

/** Accepts a PENDING identity check inside the caller's transaction. */
export async function acceptIdentityInTx(
  tx: Prisma.TransactionClient,
  input: { verificationId: string; adminId: string; nameReadByAdmin: string },
) {
  const updated = await tx.identityVerification.updateMany({
    where: { id: input.verificationId, status: "PENDING" },
    data: {
      status: "APPROVED",
      nameReadByAdmin: input.nameReadByAdmin,
      reviewedById: input.adminId,
      reviewedAt: new Date(),
      rejectionReason: null,
    },
  });
  if (updated.count !== 1) {
    throw new IdentityRuleError(
      "This ID check was already reviewed or withdrawn. Reload the page.",
    );
  }
  const row = await tx.identityVerification.findUnique({
    where: { id: input.verificationId },
    select: { userId: true },
  });
  return row?.userId ?? null;
}

/** Cache tags to expire when an owner's ID status changes (their public badge). */
export async function ownerPublicTags(userId: string) {
  const businesses = await prisma.business.findMany({
    where: { ownerId: userId, status: "APPROVED" },
    select: { slug: true },
  });
  return [PUBLIC_TAGS.businesses, ...businesses.map((b) => PUBLIC_TAGS.business(b.slug))];
}

/** Deletes every image of the given verification rows and records it. */
export async function deleteIdentityImages(ids: string[]) {
  if (ids.length === 0) return 0;
  const rows = await prisma.identityVerification.findMany({
    where: { id: { in: ids }, imagesDeletedAt: null },
    select: { id: true, idFrontPublicId: true, idBackPublicId: true, selfiePublicId: true },
  });
  let deleted = 0;
  for (const row of rows) {
    const ok = await Promise.all(
      [row.idFrontPublicId, row.idBackPublicId, row.selfiePublicId]
        .filter(Boolean)
        .map((id) => deletePrivateFile(id)),
    );
    if (ok.every(Boolean)) {
      await prisma.identityVerification.update({
        where: { id: row.id },
        data: {
          imagesDeletedAt: new Date(),
          idFrontPublicId: null,
          idBackPublicId: null,
          selfiePublicId: null,
        },
      });
      deleted++;
    }
  }
  return deleted;
}

const DELETED_NAME = "Deleted account";

/**
 * Daily retention job. Deletes ID images (the record stays, with imagesDeletedAt set):
 * - RETENTION_DAYS after an accept/reject decision;
 * - straight away for withdrawn or replaced submissions;
 * - straight away when the account was deleted (userId is null), also clearing the names.
 */
export async function runIdentityRetention(now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const due = await prisma.identityVerification.findMany({
    where: {
      imagesDeletedAt: null,
      OR: [
        { status: { in: ["APPROVED", "REJECTED"] }, reviewedAt: { lt: cutoff } },
        { status: { in: ["WITHDRAWN", "SUPERSEDED"] } },
        { userId: null },
      ],
    },
    select: { id: true },
    take: 500,
  });
  const deleted = await deleteIdentityImages(due.map((d) => d.id));
  const anonymized = await prisma.identityVerification.updateMany({
    where: { userId: null, NOT: { fullNameOnId: DELETED_NAME } },
    data: { fullNameOnId: DELETED_NAME, nameReadByAdmin: null },
  });
  return { due: due.length, deleted, failed: due.length - deleted, anonymized: anonymized.count };
}

/** Immediately deletes all of a user's ID images (e.g. before deleting their account). */
export async function purgeUserIdentityImages(userId: string) {
  const rows = await prisma.identityVerification.findMany({
    where: { userId, imagesDeletedAt: null },
    select: { id: true },
  });
  return deleteIdentityImages(rows.map((r) => r.id));
}

export async function getAdminIdentity(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  const v = await prisma.identityVerification.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          createdAt: true,
          businesses: {
            where: { status: { not: "DELETED" } },
            select: { id: true, name: true, status: true },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      reviewedBy: { select: { fullName: true } },
    },
  });
  if (!v) notFound();
  const history = v.userId
    ? await prisma.identityVerification.findMany({
        where: { userId: v.userId, id: { not: v.id } },
        orderBy: { submittedAt: "desc" },
        select: {
          id: true,
          status: true,
          idType: true,
          submittedAt: true,
          reviewedAt: true,
          rejectionReason: true,
          imagesDeletedAt: true,
        },
      })
    : [];
  return { v, history };
}

export const IDENTITY_TABS = [
  { key: "pending", label: "To check", status: "PENDING" },
  { key: "accepted", label: "Accepted", status: "APPROVED" },
  { key: "rejected", label: "Rejected", status: "REJECTED" },
] as const;

export async function listAdminIdentities(tab: (typeof IDENTITY_TABS)[number]["key"]) {
  const status = IDENTITY_TABS.find((t) => t.key === tab)!.status;
  return prisma.identityVerification.findMany({
    where: { status },
    orderBy: status === "PENDING" ? { submittedAt: "asc" } : { reviewedAt: "desc" },
    take: 100,
    select: {
      id: true,
      idType: true,
      fullNameOnId: true,
      submittedAt: true,
      reviewedAt: true,
      user: { select: { fullName: true, email: true, _count: { select: { businesses: true } } } },
    },
  });
}

export async function countPendingIdentities() {
  return prisma.identityVerification.count({ where: { status: "PENDING" } });
}
