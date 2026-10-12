import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type AuthIdentity = {
  id: string;
  email: string;
  fullName?: string | null;
};

function fallbackName(email: string) {
  return email.split("@")[0]!.slice(0, 80) || "Customer";
}

/**
 * Returns the user's profile, creating it on first sign-in. Supabase Auth is the source of
 * truth for identity; this row holds app data (name, phone, role).
 */
export async function ensureProfile(identity: AuthIdentity) {
  const email = identity.email.toLowerCase();
  const create = {
    id: identity.id,
    email,
    fullName: identity.fullName?.trim() || fallbackName(email),
  };

  try {
    return await prisma.profile.upsert({ where: { id: identity.id }, update: {}, create });
  } catch (error) {
    // A profile with this email but a different id belongs to a deleted auth user that
    // signed up again. Auth is authoritative, so replace the stale row.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.$transaction(async (tx) => {
        await tx.profile.deleteMany({ where: { email, NOT: { id: identity.id } } });
        return tx.profile.upsert({ where: { id: identity.id }, update: {}, create });
      });
    }
    throw error;
  }
}
