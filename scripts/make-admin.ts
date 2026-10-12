// Usage: npm run make-admin -- someone@example.com
// Promotes an existing user's profile to ADMIN. The user must have signed up and logged in once.
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
  if (profile.role === "ADMIN") {
    console.log(`${email} is already an admin.`);
    return;
  }
  await prisma.profile.update({ where: { email }, data: { role: "ADMIN" } });
  console.log(`${email} is now an admin (was ${profile.role}).`);
}

main()
  .catch((error: unknown) => {
    console.error("make-admin failed:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
