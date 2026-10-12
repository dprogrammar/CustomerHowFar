"use server";

import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { ensureProfile } from "@/lib/auth/profile";
import { prisma } from "@/lib/prisma";

export type SaveResult =
  | { ok: true; saved: boolean }
  | { ok: false; needsLogin: true }
  | { ok: false; needsLogin: false; error: string };

/** Saves or unsaves an approved business for the signed-in user. */
export async function setSavedBusinessAction(input: {
  businessId: string;
  saved: boolean;
}): Promise<SaveResult> {
  const session = await getSessionUser();
  if (!session) return { ok: false, needsLogin: true };
  const parsed = z.object({ businessId: z.uuid(), saved: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, needsLogin: false, error: "Something went wrong." };
  const { businessId, saved } = parsed.data;

  if (!saved) {
    await prisma.savedBusiness.deleteMany({ where: { userId: session.id, businessId } });
    return { ok: true, saved: false };
  }

  const business = await prisma.business.findFirst({
    where: { id: businessId, status: "APPROVED" },
    select: { id: true },
  });
  if (!business)
    return { ok: false, needsLogin: false, error: "This business is no longer available." };
  await ensureProfile(session);
  await prisma.savedBusiness.upsert({
    where: { userId_businessId: { userId: session.id, businessId } },
    update: {},
    create: { userId: session.id, businessId },
  });
  return { ok: true, saved: true };
}
