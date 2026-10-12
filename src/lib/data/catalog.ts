import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * Reference data (categories, states, LGAs). It rarely changes, so reads are cached across
 * requests and baked into prerendered pages. After an admin edits this data, call
 * updateTag(CATALOG_TAGS.categories) or updateTag(CATALOG_TAGS.locations) to refresh.
 */
export const CATALOG_TAGS = {
  categories: "catalog:categories",
  locations: "catalog:locations",
} as const;

export type CategoryListItem = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  description: string | null;
};

/** Active top-level categories, in display order. */
export async function getActiveCategories(): Promise<CategoryListItem[]> {
  "use cache";
  cacheLife("days");
  cacheTag(CATALOG_TAGS.categories);

  return prisma.category.findMany({
    where: { isActive: true, parentId: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, slug: true, name: true, icon: true, description: true },
  });
}

export type StateListItem = { id: number; slug: string; name: string };

/** All 36 states and the FCT, alphabetical. */
export async function getStates(): Promise<StateListItem[]> {
  "use cache";
  cacheLife("weeks");
  cacheTag(CATALOG_TAGS.locations);

  return prisma.state.findMany({
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true },
  });
}

export type LgaListItem = { id: number; slug: string; name: string };

/** LGAs of one state, alphabetical. Returns [] for an unknown state. */
export async function getLgasByStateSlug(stateSlug: string): Promise<LgaListItem[]> {
  "use cache";
  cacheLife("weeks");
  cacheTag(CATALOG_TAGS.locations);

  return prisma.lga.findMany({
    where: { state: { slug: stateSlug } },
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true },
  });
}
