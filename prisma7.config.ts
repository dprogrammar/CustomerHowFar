import { defineConfig } from "prisma/config";
import { loadEnv } from "./scripts/env-guard.mjs";

// Prisma does not load env files itself. Locally: .env.local (the DEV project); refuses the
// production database unless ALLOW_PRODUCTION=yes (scripts/env-guard.mjs). On Vercel the
// environment comes from the project settings: production migrations run during the build.
if (!process.env.VERCEL) loadEnv({ script: "prisma" });

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
