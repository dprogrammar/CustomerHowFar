"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { AccountRuleError, deleteBusinessInTx } from "@/lib/accounts/business-deletion";
import {
  changeUserRole,
  deleteUserAccount,
  suspendUser,
  unsuspendUser,
} from "@/lib/accounts/users";
import { requireAdmin } from "@/lib/auth/session";
import { revalidatePublicBusiness } from "@/lib/business/revalidate";
import { notifyBusinessDeleted, notifyUserSuspended } from "@/lib/email/notifications";
import { prisma } from "@/lib/prisma";
import { deleteStoredFiles } from "@/lib/storage/cleanup";

// Admin user management. requireAdmin() first (404 for anyone else); the rules (no self-action,
// last admin, locks, transactions, audit log) live in lib/accounts.

export type UserAdminResult = { ok: true; message: string } | { ok: false; error: string };

function fail(error: unknown): UserAdminResult {
  if (error instanceof AccountRuleError) return { ok: false, error: error.message };
  throw error;
}
const invalid = (e: z.ZodError): UserAdminResult => ({
  ok: false,
  error: e.issues[0]?.message ?? "Invalid request.",
});
const reasonField = z
  .string()
  .trim()
  .min(10, "Please write a reason of at least 10 characters.")
  .max(1000, "Keep it under 1000 characters.");

function revalidateSlugs(slugs: string[]) {
  for (const slug of slugs) revalidatePublicBusiness(slug);
}

const suspendSchema = z.object({ userId: z.uuid(), reason: reasonField });

export async function suspendUserAction(
  input: z.input<typeof suspendSchema>,
): Promise<UserAdminResult> {
  const admin = await requireAdmin();
  const parsed = suspendSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  let result;
  try {
    result = await suspendUser({ ...parsed.data, adminId: admin.id });
  } catch (error) {
    return fail(error);
  }
  revalidateSlugs(result.slugs);
  after(() => notifyUserSuspended(parsed.data.userId));
  refresh();
  return {
    ok: true,
    message: result.banned
      ? "User suspended. They're signed out, can't log in, and their listings are hidden."
      : "User suspended and their listings hidden, but blocking the login in Supabase failed. Suspend again to retry (the app already refuses their login).",
  };
}

const userOnly = z.object({ userId: z.uuid() });

export async function unsuspendUserAction(
  input: z.input<typeof userOnly>,
): Promise<UserAdminResult> {
  const admin = await requireAdmin();
  const parsed = userOnly.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  let result;
  try {
    result = await unsuspendUser({ ...parsed.data, adminId: admin.id });
  } catch (error) {
    return fail(error);
  }
  revalidateSlugs(result.slugs);
  refresh();
  return {
    ok: true,
    message: result.unbanned
      ? "User unsuspended. They can log in again and their listings are back as they were."
      : "User unsuspended, but lifting the Supabase login ban failed. Unsuspend again or lift it in Supabase.",
  };
}

const roleSchema = z.object({
  userId: z.uuid(),
  role: z.enum(["CUSTOMER", "BUSINESS_OWNER", "ADMIN"]),
});

export async function changeUserRoleAction(
  input: z.input<typeof roleSchema>,
): Promise<UserAdminResult> {
  const admin = await requireAdmin();
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  let result;
  try {
    result = await changeUserRole({ ...parsed.data, adminId: admin.id });
  } catch (error) {
    return fail(error);
  }
  refresh();
  return {
    ok: true,
    message: result.synced
      ? "Role updated."
      : "Role updated, but syncing the admin flag to Supabase failed. Change it again to retry.",
  };
}

const deleteUserSchema = z.object({
  userId: z.uuid(),
  confirmText: z.string().refine((v) => v === "DELETE", "Type DELETE to confirm."),
  confirmAdmin: z.boolean().optional(),
  reason: z.string().trim().max(1000).optional(),
});

export async function deleteUserAction(
  input: z.input<typeof deleteUserSchema>,
): Promise<UserAdminResult> {
  const admin = await requireAdmin();
  const parsed = deleteUserSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { userId, confirmAdmin, reason } = parsed.data;
  if (userId === admin.id) return { ok: false, error: "You can't delete your own account here." };
  const target = await prisma.profile.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target) return { ok: false, error: "This account no longer exists." };
  if (target.role === "ADMIN" && confirmAdmin !== true) {
    return {
      ok: false,
      error: "This user is an admin. Tick the extra confirmation to delete them.",
    };
  }
  let result;
  try {
    result = await deleteUserAccount({
      userId,
      actorId: admin.id,
      self: false,
      reason: reason || null,
    });
  } catch (error) {
    return fail(error);
  }
  revalidateSlugs([...result.businesses.map((b) => b.slug), ...result.reviewedSlugs]);
  after(() => deleteStoredFiles(result.files));
  refresh();
  return {
    ok: true,
    message: `Account deleted: ${result.businesses.length} business${result.businesses.length === 1 ? "" : "es"} removed and payment records anonymized.`,
  };
}

const deleteBusinessSchema = z.object({
  businessId: z.uuid(),
  confirmName: z.string(),
  reason: reasonField,
});

export async function adminDeleteBusinessAction(
  input: z.input<typeof deleteBusinessSchema>,
): Promise<UserAdminResult> {
  const admin = await requireAdmin();
  const parsed = deleteBusinessSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { businessId, confirmName, reason } = parsed.data;
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      name: true,
      status: true,
      owner: { select: { fullName: true, email: true, status: true } },
    },
  });
  if (!b || b.status === "DELETED") return { ok: false, error: "This business no longer exists." };
  if (confirmName.trim() !== b.name.trim()) {
    return { ok: false, error: "Type the business name exactly to confirm." };
  }
  let deleted;
  try {
    deleted = await prisma.$transaction((tx) =>
      deleteBusinessInTx(tx, { businessId, actorId: admin.id, action: "BUSINESS_DELETED", reason }),
    );
  } catch (error) {
    return fail(error);
  }
  revalidatePublicBusiness(deleted.slug);
  after(async () => {
    await deleteStoredFiles(deleted.files);
    if (b.owner.status !== "DELETED") {
      await notifyBusinessDeleted({
        ownerEmail: b.owner.email,
        ownerName: b.owner.fullName,
        businessName: b.name,
        reason,
      });
    }
  });
  refresh();
  return {
    ok: true,
    message: deleted.soft
      ? "Business deleted. A minimal record is kept for accounting because it has payments. The owner has been emailed."
      : "Business deleted completely. The owner has been emailed.",
  };
}
