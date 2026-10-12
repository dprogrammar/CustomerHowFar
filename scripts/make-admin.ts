// Usage: npm run make-admin -- someone@example.com
// Promotes an existing user's profile to ADMIN. The user must have signed up and logged in once.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { z } from "zod";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: [".env.local", ".env"], quiet: true });

const parsed = z.email().safeParse(process.argv[2]?.trim().toLowerCase());
if (!parsed.success) {
  console.error("Usage: npm run make-admin -- someone@example.com");
  process.exit(1);
}
const email = parsed.data;

const connectionString = process.env.DIRECT_URL;
if (!connectionString) {
  console.error("Missing DIRECT_URL environment variable.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const profile = await prisma.profile.findUnique({ where: { email } });
  if (!profile) {
    console.error(
      `No profile found for ${email}. The user must sign up and log in at least once first.`,
    );
    process.exitCode = 1;
    return;
  }
  if (profile.role !== "ADMIN") {
    await prisma.profile.update({ where: { email }, data: { role: "ADMIN" } });
  }

  // Also flag the Supabase user (app_metadata is server-only and included in the login token),
  // so the proxy can return a real 404 for non-admins on /admin. Takes effect on next login or
  // token refresh (within an hour).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Missing Supabase URL or secret key.");
  const supabase = createClient(url, secret, { auth: { persistSession: false } });
  const { data: existing, error: getError } = await supabase.auth.admin.getUserById(profile.id);
  if (getError || !existing.user) throw new Error("Could not load the Supabase user.");
  const { error } = await supabase.auth.admin.updateUserById(profile.id, {
    app_metadata: { ...existing.user.app_metadata, role: "admin" },
  });
  if (error) throw new Error(`Could not update the Supabase user (${error.code ?? "error"}).`);

  console.log(
    profile.role === "ADMIN"
      ? `${email} is already an admin (login flag synced).`
      : `${email} is now an admin (was ${profile.role}).`,
  );
  console.log("They must log out and back in (or wait up to an hour) to open /admin.");
}

main()
  .catch((error: unknown) => {
    console.error("make-admin failed:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
