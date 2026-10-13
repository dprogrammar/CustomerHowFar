"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { getCurrentUser, getSessionUser } from "@/lib/auth/session";
import { revalidatePublicBusiness } from "@/lib/business/revalidate";
import { prisma } from "@/lib/prisma";
import { deleteStoredFiles } from "@/lib/storage/cleanup";
import { verifyPassword } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AccountRuleError, deleteBusinessInTx } from "./business-deletion";
import { deleteUserAccount } from "./users";

// Self-service deletion: owners deleting their own businesses, users deleting their account.

export type AccountActionResult = { ok: true; message: string } | { ok: false; error: string };

const deleteBusinessSchema = z.object({ businessId: z.uuid(), confirmName: z.string() });

export async function deleteOwnBusinessAction(
  input: z.input<typeof deleteBusinessSchema>,
): Promise<AccountActionResult> {
  const session = await getSessionUser();
  if (!session) return { ok: false, error: "Please log in again." };
  const parsed = deleteBusinessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const b = await prisma.business.findFirst({
    where: { id: parsed.data.businessId, ownerId: session.id, status: { not: "DELETED" } },
    select: { name: true },
  });
  if (!b) return { ok: false, error: "We couldn't find that business." };
  if (parsed.data.confirmName.trim() !== b.name.trim()) {
    return { ok: false, error: "Type the business name exactly to confirm." };
  }
  let deleted;
  try {
    deleted = await prisma.$transaction((tx) =>
      deleteBusinessInTx(tx, {
        businessId: parsed.data.businessId,
        ownerId: session.id,
        actorId: session.id,
        action: "BUSINESS_SELF_DELETED",
      }),
    );
  } catch (error) {
    if (error instanceof AccountRuleError) return { ok: false, error: error.message };
    throw error;
  }
  revalidatePublicBusiness(deleted.slug);
  after(() => deleteStoredFiles(deleted.files));
  refresh();
  return { ok: true, message: `${deleted.name} has been deleted.` };
}

const deleteAccountSchema = z.object({
  confirmText: z.string().refine((v) => v === "DELETE", "Type DELETE to confirm."),
  password: z.string().min(1, "Enter your password.").max(200),
});

export async function deleteOwnAccountAction(
  input: z.input<typeof deleteAccountSchema>,
): Promise<AccountActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in again." };
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  if (user.role === "ADMIN") {
    return {
      ok: false,
      error:
        "Admin accounts can't be deleted here. Ask another admin to remove your admin role first.",
    };
  }
  if (!(await verifyPassword(user.email, parsed.data.password))) {
    return { ok: false, error: "That password is incorrect." };
  }
  let result;
  try {
    result = await deleteUserAccount({ userId: user.id, actorId: user.id, self: true });
  } catch (error) {
    if (error instanceof AccountRuleError) return { ok: false, error: error.message };
    throw error;
  }
  for (const b of result.businesses) revalidatePublicBusiness(b.slug);
  after(() => deleteStoredFiles(result.files));
  // The session no longer exists; clear the cookies on this device.
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  redirect("/account-deleted");
}
