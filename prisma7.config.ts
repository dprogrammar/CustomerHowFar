import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma does not load env files itself. Mirror Next.js: .env.local wins over .env.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // The CLI (migrate, db pull, studio) uses the Supabase session pooler (port 5432).
    // The app itself connects through the transaction pooler via DATABASE_URL in src/lib/prisma.ts.
    url: process.env.DIRECT_URL,
  },
});
