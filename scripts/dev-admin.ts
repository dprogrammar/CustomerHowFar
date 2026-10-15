// DEVELOPMENT ONLY: creates (or updates) an admin account in the dev Supabase project so you can
// log in locally, and lets you set its password.
//
//   npm run dev:admin -- you@example.com              asks for a new password (typing is hidden)
//   npm run dev:admin -- you@example.com --no-password  creates the account only (no usable password)
//
// Refuses the production project, even with ALLOW_PRODUCTION=yes: production admins are made with
// `npm run make-admin` after they sign up on the live site.
import { randomBytes } from "node:crypto";
import readline from "node:readline";
import { Writable } from "node:stream";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PASSWORD_MIN_LENGTH } from "../src/lib/validation/password";
import { loadEnv } from "./env-guard.mjs";

const { production } = loadEnv({ script: "dev:admin" });
if (production) {
  console.error(
    "dev:admin only works on the dev project. Use `npm run make-admin` for production.",
  );
  process.exit(1);
}

const parsed = z.email().safeParse(process.argv[2]?.trim().toLowerCase());
if (!parsed.success) {
  console.error("Usage: npm run dev:admin -- you@example.com [--no-password]");
  process.exit(1);
}
const email = { data: parsed.data };
const setPassword = !process.argv.includes("--no-password");

/** Reads a line without echoing it. */
function askHidden(question: string) {
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, done) {
      if (!muted) process.stdout.write(chunk);
      done();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  return new Promise<string>((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  let password: string | null = null;
  if (setPassword) {
    if (!process.stdin.isTTY) throw new Error("Run this in a terminal to type the password.");
    password = await askHidden(
      `New password for ${email.data} (at least ${PASSWORD_MIN_LENGTH} characters): `,
    );
    if (password.length < PASSWORD_MIN_LENGTH) throw new Error("Password too short.");
    if ((await askHidden("Type it again: ")) !== password)
      throw new Error("Passwords don't match.");
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: { persistSession: false },
    },
  );
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }),
  });
  try {
    // Find the auth user (the dev project is small: a few pages at most).
    let userId: string | null = null;
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(`Could not list users (${error.code ?? "error"}).`);
      userId = data.users.find((u) => u.email?.toLowerCase() === email.data)?.id ?? null;
      if (data.users.length < 200) break;
    }
    if (!userId) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: email.data,
        // Without a chosen password, a long random one nobody knows.
        password: password ?? randomBytes(32).toString("base64url"),
        email_confirm: true,
        user_metadata: { full_name: "Dev Admin" },
        app_metadata: { role: "admin" },
      });
      if (error || !data.user)
        throw new Error(`Could not create the user (${error?.code ?? "error"}).`);
      userId = data.user.id;
      console.log(`Created ${email.data} in the dev project.`);
    } else {
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        ...(password ? { password } : {}),
        email_confirm: true,
        app_metadata: { role: "admin" },
      });
      if (error) throw new Error(`Could not update the user (${error.code ?? "error"}).`);
      console.log(`Updated ${email.data}${password ? " (new password set)" : ""}.`);
    }
    await prisma.profile.upsert({
      where: { id: userId },
      create: { id: userId, email: email.data, fullName: "Dev Admin", role: "ADMIN" },
      update: { role: "ADMIN", status: "ACTIVE" },
    });
    console.log(
      password
        ? "Done: it's an admin. Log in at http://localhost:3000/login."
        : "Done: it's an admin. Set its password with: npm run dev:admin -- " + email.data,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("dev:admin failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
