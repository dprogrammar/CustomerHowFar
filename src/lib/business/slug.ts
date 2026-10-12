import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { slugify } from "@/lib/slug";

/** Slugs that would clash with routes under /business. */
const RESERVED = new Set(["new", "edit", "pay", "submitted", "dashboard", "admin", "api"]);

/** A unique business slug from its name, e.g. "adaeze-couture" or "adaeze-couture-2". */
export async function uniqueBusinessSlug(
  db: Prisma.TransactionClient,
  name: string,
  excludeId?: string,
): Promise<string> {
  let base = slugify(name).slice(0, 60).replace(/-+$/, "") || "business";
  if (RESERVED.has(base)) base = `${base}-business`;

  const taken = new Set(
    (
      await db.business.findMany({
        where: { slug: { startsWith: base }, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
        select: { slug: true },
      })
    ).map((b) => b.slug),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; i < 50; i++) {
    if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}
