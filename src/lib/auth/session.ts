import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import type { Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "./profile";
import { loginUrl } from "./redirect";

export type SessionUser = { id: string; email: string; fullName: string | null };

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: Role;
  createdAt: Date;
};

/**
 * Verified identity from the Supabase session cookie, or null. getClaims() validates the
 * JWT signature, so the result can be trusted for authorization. Deduplicated per request.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // The session is per request (and Supabase reads the clock to check expiry), so never
  // evaluate this during prerendering.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub || !claims.email) return null;

  const metadata = (claims.user_metadata ?? {}) as { full_name?: unknown };
  return {
    id: claims.sub,
    email: claims.email,
    fullName: typeof metadata.full_name === "string" ? metadata.full_name : null,
  };
});

/** Signed-in user with their profile (created on first use), or null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSessionUser();
  if (!session) return null;

  const profile =
    (await prisma.profile.findUnique({ where: { id: session.id } })) ??
    (await ensureProfile(session));

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    phone: profile.phone,
    avatarUrl: profile.avatarUrl,
    role: profile.role,
    createdAt: profile.createdAt,
  };
});

/** For protected pages: returns the user or redirects to /login?next=<returnTo>. */
export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginUrl(returnTo));
  return user;
}

/**
 * For every admin page and server action. Anyone who is not an admin (including signed-out
 * visitors) gets a 404, so the admin area is never revealed. The database role is the
 * authority; the proxy's token check is only an early filter.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") notFound();
  return user;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0]![0], parts.at(-1)![0]] : [parts[0]?.[0]];
  return letters.filter(Boolean).join("").toUpperCase() || "?";
}
