import "server-only";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { getSupabasePublicEnv } from "./env";

// Supabase Auth admin operations (secret key; server only). Errors are logged by code only,
// never with emails, names or tokens.

/** Effectively permanent: Supabase bans for a duration; unsuspending lifts it ("none"). */
const BAN_DURATION = "876000h";

function adminClient() {
  const { url } = getSupabasePublicEnv();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Missing SUPABASE_SECRET_KEY environment variable.");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

function logError(op: string, error: { code?: string; status?: number } | null) {
  console.error(`[supabase-admin] ${op} failed`, {
    code: error?.code ?? "none",
    status: error?.status,
  });
}

/** Blocks logins and refreshes. Returns false on failure. */
export async function banAuthUser(userId: string) {
  const { error } = await adminClient().auth.admin.updateUserById(userId, {
    ban_duration: BAN_DURATION,
  });
  if (error) logError("ban", error);
  return !error;
}

export async function unbanAuthUser(userId: string) {
  const { error } = await adminClient().auth.admin.updateUserById(userId, { ban_duration: "none" });
  if (error) logError("unban", error);
  return !error;
}

/** Deletes the auth user (frees the email for a new sign-up). "Not found" counts as done. */
export async function deleteAuthUser(userId: string) {
  const { error } = await adminClient().auth.admin.deleteUser(userId);
  if (error && error.status !== 404 && error.code !== "user_not_found") {
    logError("delete", error);
    return false;
  }
  return true;
}

/** Keeps the auth user's admin flag (read by the proxy) in sync with the profile role. */
export async function setAuthAdminFlag(userId: string, isAdmin: boolean) {
  // Supabase merges app_metadata, so the flag is cleared by setting it to null (not omitting it).
  const { error } = await adminClient().auth.admin.updateUserById(userId, {
    app_metadata: { role: isAdmin ? "admin" : null },
  });
  if (error) logError("set-role", error);
  return !error;
}

/**
 * Signs the user out everywhere: deletes their Supabase sessions (refresh tokens go with them).
 * Access tokens already issued are rejected by getSessionUser(), which checks the session still
 * exists.
 */
export async function revokeAllSessions(userId: string) {
  await prisma.$executeRaw`DELETE FROM auth.sessions WHERE user_id = ${userId}::uuid`;
}

/** Checks a password without touching the caller's session cookies. */
export async function verifyPassword(email: string, password: string) {
  const { url, publishableKey } = getSupabasePublicEnv();
  const client = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;
  // Don't leave an extra session behind.
  const sessionId = decodeSessionId(data.session.access_token);
  if (sessionId) await prisma.$executeRaw`DELETE FROM auth.sessions WHERE id = ${sessionId}::uuid`;
  return true;
}

function decodeSessionId(jwt: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString("utf8")) as {
      session_id?: unknown;
    };
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}
