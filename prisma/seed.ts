// Idempotent seed: safe to run any number of times (`npm run db:seed`).
// Seeds app settings, categories, the 36 states + FCT and all 774 LGAs, then verifies counts.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { CATEGORIES } from "../src/config/categories";
import { isCategoryIconName } from "../src/config/category-icons";
import { NIGERIAN_STATES } from "../src/config/states";
import { slugify } from "../src/lib/slug";
import { loadEnv } from "../scripts/env-guard.mjs";
import { EXPECTED_LGA_COUNTS, EXPECTED_TOTAL_LGAS, NIGERIA_LGAS } from "./data/nigeria-lgas";

// Refuses the production database unless ALLOW_PRODUCTION=yes (see scripts/env-guard.mjs).
loadEnv({ script: "db:seed" });

const connectionString = process.env.DIRECT_URL;
if (!connectionString) {
  throw new Error("Missing DIRECT_URL environment variable.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const EXPECTED_STATES = 37;

/** Fails fast, before touching the database, if the seed data is inconsistent. */
function validateSourceData() {
  const problems: string[] = [];

  if (NIGERIAN_STATES.length !== EXPECTED_STATES) {
    problems.push(`Expected ${EXPECTED_STATES} states, found ${NIGERIAN_STATES.length}.`);
  }
  const stateSlugs = new Set<string>(NIGERIAN_STATES.map((s) => s.slug));
  for (const slug of Object.keys(NIGERIA_LGAS)) {
    if (!stateSlugs.has(slug)) problems.push(`LGA data has unknown state "${slug}".`);
  }

  let total = 0;
  for (const state of NIGERIAN_STATES) {
    const lgas = NIGERIA_LGAS[state.slug] ?? [];
    total += lgas.length;
    const expected = EXPECTED_LGA_COUNTS[state.slug];
    if (lgas.length !== expected) {
      problems.push(`${state.name}: expected ${expected} LGAs, found ${lgas.length}.`);
    }
    const slugs = lgas.map(slugify);
    const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    if (dupes.length) problems.push(`${state.name}: duplicate LGA slugs ${dupes.join(", ")}.`);
  }
  if (total !== EXPECTED_TOTAL_LGAS) {
    problems.push(`Expected ${EXPECTED_TOTAL_LGAS} LGAs in total, found ${total}.`);
  }

  const categorySlugs = CATEGORIES.map((c) => c.slug);
  if (new Set(categorySlugs).size !== categorySlugs.length) {
    problems.push("Duplicate category slugs.");
  }
  for (const category of CATEGORIES) {
    if (!isCategoryIconName(category.icon)) {
      problems.push(`Category ${category.slug}: unknown icon "${category.icon}".`);
    }
  }

  if (problems.length) {
    throw new Error(`Seed data is invalid:\n  - ${problems.join("\n  - ")}`);
  }
  return total;
}

/** Initial bank account for listing-fee transfers. Admins change it in /admin/settings. */
const INITIAL_BANK_ACCOUNT = {
  bankName: "First Bank of Nigeria",
  bankAccountNumber: "3122146201",
  bankAccountName: "Ebofuale Victor",
};

async function seedAppSettings() {
  // Single row with id 1. Never overwrite values an admin has changed.
  const existing = await prisma.appSetting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      paymentRequired: false,
      listingFeeNaira: 5000,
      manualTransferEnabled: true,
      ...INITIAL_BANK_ACCOUNT,
    },
  });
  // Fill bank details only if they have never been set (first run after the payments migration).
  if (!existing.bankName && !existing.bankAccountNumber && !existing.bankAccountName) {
    await prisma.appSetting.update({
      where: { id: 1 },
      data: { ...INITIAL_BANK_ACCOUNT, manualTransferEnabled: true },
    });
    console.log("Bank transfer details seeded.");
  }
}

async function seedCategories() {
  // The config file is the source of truth for these fields until an admin screen exists.
  // isActive is never touched, so a category an admin deactivates stays deactivated.
  for (const [index, category] of CATEGORIES.entries()) {
    const data = {
      name: category.name,
      icon: category.icon,
      description: category.description,
      sortOrder: (index + 1) * 10,
    };
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: data,
      create: { slug: category.slug, ...data },
    });
  }
}

async function seedStatesAndLgas() {
  // Insert missing rows in bulk, then fix any renamed ones. Nothing is ever deleted, because
  // businesses may reference these rows.
  await prisma.state.createMany({
    data: NIGERIAN_STATES.map((s) => ({ slug: s.slug, name: s.name })),
    skipDuplicates: true,
  });
  const states = await prisma.state.findMany();
  const stateBySlug = new Map(states.map((s) => [s.slug, s]));
  for (const seed of NIGERIAN_STATES) {
    const existing = stateBySlug.get(seed.slug)!;
    if (existing.name !== seed.name) {
      await prisma.state.update({ where: { id: existing.id }, data: { name: seed.name } });
    }
  }

  const lgaRows = NIGERIAN_STATES.flatMap((state) =>
    NIGERIA_LGAS[state.slug]!.map((name) => ({
      stateId: stateBySlug.get(state.slug)!.id,
      name,
      slug: slugify(name),
    })),
  );
  const { count: inserted } = await prisma.lga.createMany({ data: lgaRows, skipDuplicates: true });

  // A fresh database (no state live yet) launches in Lagos. Once any state is live, which
  // states are live is only ever changed in /admin/service-areas.
  if ((await prisma.state.count({ where: { isActive: true } })) === 0) {
    await prisma.state.update({ where: { slug: "lagos" }, data: { isActive: true } });
    console.log("No state was live: Lagos is now live.");
  }

  const existingLgas = await prisma.lga.findMany({
    select: { id: true, stateId: true, slug: true, name: true },
  });
  const byKey = new Map(existingLgas.map((l) => [`${l.stateId}:${l.slug}`, l]));
  let renamed = 0;
  for (const row of lgaRows) {
    const existing = byKey.get(`${row.stateId}:${row.slug}`)!;
    if (existing.name !== row.name) {
      await prisma.lga.update({ where: { id: existing.id }, data: { name: row.name } });
      renamed++;
    }
  }
  return { inserted, renamed };
}

/** Checks what is actually in the database. */
async function verifyDatabase() {
  const problems: string[] = [];
  const [stateCount, lgaCount, categoryCount] = await Promise.all([
    prisma.state.count(),
    prisma.lga.count(),
    prisma.category.count({ where: { slug: { in: CATEGORIES.map((c) => c.slug) } } }),
  ]);
  if (stateCount !== EXPECTED_STATES) problems.push(`states table has ${stateCount} rows.`);
  if (lgaCount !== EXPECTED_TOTAL_LGAS) problems.push(`lgas table has ${lgaCount} rows.`);
  if (categoryCount !== CATEGORIES.length) problems.push(`categories: ${categoryCount} seeded.`);

  const perState = await prisma.state.findMany({
    select: { slug: true, name: true, _count: { select: { lgas: true } } },
  });
  for (const state of perState) {
    const expected = EXPECTED_LGA_COUNTS[state.slug];
    if (state._count.lgas !== expected) {
      problems.push(
        `${state.name} has ${state._count.lgas} LGAs in the database, expected ${expected}.`,
      );
    }
  }

  if (problems.length)
    throw new Error(`Database verification failed:\n  - ${problems.join("\n  - ")}`);
  return { stateCount, lgaCount, categoryCount };
}

async function main() {
  const lgaTotal = validateSourceData();
  console.log(
    `Source data OK: ${NIGERIAN_STATES.length} states, ${lgaTotal} LGAs, ${CATEGORIES.length} categories.`,
  );

  await seedAppSettings();
  await seedCategories();
  const { inserted, renamed } = await seedStatesAndLgas();
  console.log(`LGAs: ${inserted} inserted, ${renamed} renamed.`);

  const counts = await verifyDatabase();
  console.log(
    `Verified: ${counts.stateCount} states, ${counts.lgaCount} LGAs (all per-state counts match), ${counts.categoryCount} categories.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
