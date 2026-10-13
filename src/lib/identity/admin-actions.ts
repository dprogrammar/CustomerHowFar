"use server";

import { refresh, updateTag } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { approveBusinessInTx, RuleError, StaleError } from "@/lib/admin/moderation";
import { requireAdmin } from "@/lib/auth/session";
import { revalidatePublicBusiness } from "@/lib/business/revalidate";
import { notifyIdentityReviewed, notifyListingApproved } from "@/lib/email/notifications";
import { prisma } from "@/lib/prisma";
import { acceptIdentityInTx, IdentityRuleError, ownerPublicTags } from "./server";

// Admin decisions on identity checks. requireAdmin() first (404 for anyone else); a decision
// only applies while the check is still PENDING, and records the admin and time.

export type IdentityAdminResult = { ok: true; message: string } | { ok: false; error: string };

const STALE = "This ID check was already reviewed or withdrawn. Reload the page.";

const nameRead = z
  .string()
  .trim()
  .min(2, "Type the name you read on the ID.")
  .max(120, "Use 120 characters or fewer.");

const acceptSchema = z.object({ verificationId: z.uuid(), nameReadByAdmin: nameRead });

async function expireOwnerBadge(userId: string | null) {
  if (!userId) return;
  for (const tag of await ownerPublicTags(userId)) updateTag(tag);
}

export async function acceptIdentityAction(
  input: z.input<typeof acceptSchema>,
): Promise<IdentityAdminResult> {
  const admin = await requireAdmin();
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  let userId: string | null;
  try {
    userId = await prisma.$transaction((tx) =>
      acceptIdentityInTx(tx, { ...parsed.data, adminId: admin.id }),
    );
  } catch (error) {
    if (error instanceof IdentityRuleError) return { ok: false, error: STALE };
    throw error;
  }
  await expireOwnerBadge(userId);
  after(() => notifyIdentityReviewed(parsed.data.verificationId));
  refresh();
  return { ok: true, message: "ID accepted. The owner has been emailed." };
}

const rejectSchema = z.object({
  verificationId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(5, "Choose or write a reason for the owner.")
    .max(500, "Keep it under 500 characters."),
});

export async function rejectIdentityAction(
  input: z.input<typeof rejectSchema>,
): Promise<IdentityAdminResult> {
  const admin = await requireAdmin();
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const { count } = await prisma.identityVerification.updateMany({
    where: { id: parsed.data.verificationId, status: "PENDING" },
    data: {
      status: "REJECTED",
      rejectionReason: parsed.data.reason,
      reviewedById: admin.id,
      reviewedAt: new Date(),
    },
  });
  if (count !== 1) return { ok: false, error: STALE };
  after(() => notifyIdentityReviewed(parsed.data.verificationId));
  refresh();
  return { ok: true, message: "ID rejected. The owner has been emailed the reason." };
}

const bothSchema = z.object({
  businessId: z.uuid(),
  verificationId: z.uuid(),
  nameReadByAdmin: nameRead,
});

/** "Accept ID and approve listing": both decisions in one transaction (all approval rules apply). */
export async function acceptIdentityAndApproveAction(
  input: z.input<typeof bothSchema>,
): Promise<IdentityAdminResult> {
  const admin = await requireAdmin();
  const parsed = bothSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const { businessId, verificationId, nameReadByAdmin } = parsed.data;
  let slug: string;
  try {
    slug = await prisma.$transaction((tx) =>
      approveBusinessInTx(tx, {
        businessId,
        adminId: admin.id,
        expectedStatus: "PENDING_REVIEW",
        acceptIdentity: { verificationId, nameReadByAdmin },
      }),
    );
  } catch (error) {
    if (error instanceof StaleError || error instanceof IdentityRuleError) {
      return {
        ok: false,
        error: "This listing or ID check changed since you opened it. Reload the page.",
      };
    }
    if (error instanceof RuleError) return { ok: false, error: error.message };
    throw error;
  }
  const owner = await prisma.business.findUnique({
    where: { id: businessId },
    select: { ownerId: true },
  });
  await expireOwnerBadge(owner?.ownerId ?? null);
  revalidatePublicBusiness(slug);
  after(async () => {
    await notifyIdentityReviewed(verificationId);
    await notifyListingApproved(businessId);
  });
  refresh();
  return { ok: true, message: "ID accepted and listing approved. The owner has been emailed." };
}
