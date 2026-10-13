import type { Prisma } from "@/generated/prisma/client";
import { AccountRuleError } from "./account-error";

/**
 * The last active admin can never be suspended, deleted or demoted. Locks the admin rows so two
 * admins can't remove each other at the same moment.
 */
export async function assertNotLastAdmin(tx: Prisma.TransactionClient, targetId: string) {
  const admins = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM profiles WHERE role = 'ADMIN' AND status = 'ACTIVE' ORDER BY id FOR UPDATE`;
  if (admins.some((a) => a.id === targetId) && admins.length <= 1) {
    throw new AccountRuleError("This is the last active admin. Make someone else an admin first.");
  }
}
