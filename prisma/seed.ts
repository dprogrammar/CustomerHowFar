import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: [".env.local", ".env"], quiet: true });

const connectionString = process.env.DIRECT_URL;
if (!connectionString) {
  throw new Error("Missing DIRECT_URL environment variable.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  // AppSetting is a single row with id 1. Create it if missing; never overwrite existing values.
  const setting = await prisma.appSetting.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, paymentRequired: false, listingFeeNaira: 5000 },
  });

  console.log(
    `AppSetting ready (paymentRequired=${setting.paymentRequired}, listingFeeNaira=${setting.listingFeeNaira})`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
