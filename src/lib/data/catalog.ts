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

export type StateListItem = { id: number; slug: string; name: string; isActive: boolean };

/**
 * All 36 states and the FCT, alphabetical, with whether each is live (open for businesses).
 * Toggling a state expires this cache (CATALOG_TAGS.locations).
 */
export async function getStates(): Promise<StateListItem[]> {
  "use cache";
  cacheLife("weeks");
  cacheTag(CATALOG_TAGS.locations);

  return prisma.state.findMany({
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true, isActive: true },
  });
}

/** Live states only, alphabetical. */
export async function getActiveStates(): Promise<StateListItem[]> {
  return (await getStates()).filter((s) => s.isActive);
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

/**
 * All LGAs grouped by state id, for instant client-side filtering in forms (about 7 KB
 * gzipped, cheaper on slow networks than a round trip every time the state changes).
 */
export async function getLgasGroupedByState(): Promise<
  Record<number, { id: number; name: string; slug: string }[]>
> {
  "use cache";
  cacheLife("weeks");
  cacheTag(CATALOG_TAGS.locations);

  const lgas = await prisma.lga.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, stateId: true },
  });
  const grouped: Record<number, { id: number; name: string; slug: string }[]> = {};
  for (const { stateId, id, name, slug } of lgas)
    (grouped[stateId] ??= []).push({ id, name, slug });
  return grouped;
}

/** Resolves state and LGA slugs (for search filters and SEO pages). Unknown slugs -> null. */
export async function resolveLocation(stateSlug?: string, lgaSlug?: string) {
  const states = await getStates();
  const state = stateSlug ? (states.find((s) => s.slug === stateSlug) ?? null) : null;
  let lga: { id: number; name: string; slug: string } | null = null;
  if (state && lgaSlug) {
    const grouped = await getLgasGroupedByState();
    lga = grouped[state.id]?.find((l) => l.slug === lgaSlug) ?? null;
  }
  return { state, lga };
}
