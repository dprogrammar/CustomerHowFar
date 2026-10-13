import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { CATALOG_TAGS } from "@/lib/data/catalog";
import { prisma } from "@/lib/prisma";
import { PUBLIC_TAGS } from "./cache-tags";

// Public reads. ONLY approved businesses are returned here. Results are cached and tagged;
// see revalidate.ts for invalidation.

const publicSelect = {
  id: true,
  ownerId: true,
  status: true,
  slug: true,
  name: true,
  tagline: true,
  description: true,
  services: true,
  yearsOfExperience: true,
  openingHours: true,
  phone: true,
  whatsappNumber: true,
  email: true,
  area: true,
  isFeatured: true,
  logoPublicId: true,
  coverPublicId: true,
  instagramUrl: true,
  facebookUrl: true,
  tiktokUrl: true,
  websiteUrl: true,
  publishedAt: true,
  updatedAt: true,
  category: { select: { id: true, slug: true, name: true, icon: true } },
  state: { select: { id: true, slug: true, name: true } },
  lga: { select: { slug: true, name: true } },
  photos: {
    orderBy: { sortOrder: "asc" },
    select: { id: true, publicId: true, width: true, height: true, caption: true },
  },
  owner: {
    select: {
      identityVerifications: { where: { status: "APPROVED" }, select: { id: true }, take: 1 },
    },
  },
} satisfies Prisma.BusinessSelect;

type PublicBusinessRow = Prisma.BusinessGetPayload<{ select: typeof publicSelect }>;
/**
 * `idChecked`: the owner's ID check was accepted by the team (shown as the "ID submitted"
 * badge). It is a visual check, never an official verification. Owner data is not exposed.
 */
export type PublicBusiness = Omit<PublicBusinessRow, "owner"> & { idChecked: boolean };

function toPublic(row: PublicBusinessRow | null): PublicBusiness | null {
  if (!row) return null;
  const { owner, ...rest } = row;
  return { ...rest, idChecked: owner.identityVerifications.length > 0 };
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** An approved business by slug, or null. Cached until the business changes. */
export async function getPublicBusiness(slug: string): Promise<PublicBusiness | null> {
  "use cache";
  cacheLife("days");
  cacheTag(PUBLIC_TAGS.business(slug));
  if (!SLUG.test(slug) || slug.length > 120) return null;
  return toPublic(
    await prisma.business.findFirst({ where: { slug, status: "APPROVED" }, select: publicSelect }),
  );
}

/** Any-status business by slug, for owner/admin previews. Never cached. */
export async function getBusinessForPreview(slug: string): Promise<PublicBusiness | null> {
  if (!SLUG.test(slug) || slug.length > 120) return null;
  return toPublic(await prisma.business.findUnique({ where: { slug }, select: publicSelect }));
}

// --- Cards --------------------------------------------------------------------------------

export type BusinessCardData = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  area: string | null;
  /** Owner's ID check accepted ("ID submitted" badge). */
  idChecked: boolean;
  isFeatured: boolean;
  logoPublicId: string | null;
  coverPublicId: string | null;
  categoryName: string;
  categoryIcon: string;
  stateName: string | null;
  lgaName: string | null;
};

export const cardSelect = {
  id: true,
  slug: true,
  name: true,
  tagline: true,
  area: true,
  isFeatured: true,
  logoPublicId: true,
  coverPublicId: true,
  category: { select: { name: true, icon: true } },
  state: { select: { name: true } },
  lga: { select: { name: true } },
  owner: {
    select: {
      identityVerifications: { where: { status: "APPROVED" }, select: { id: true }, take: 1 },
    },
  },
} satisfies Prisma.BusinessSelect;

export function toCard(
  b: Prisma.BusinessGetPayload<{ select: typeof cardSelect }>,
): BusinessCardData {
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    tagline: b.tagline,
    area: b.area,
    idChecked: b.owner.identityVerifications.length > 0,
    isFeatured: b.isFeatured,
    logoPublicId: b.logoPublicId,
    coverPublicId: b.coverPublicId,
    categoryName: b.category.name,
    categoryIcon: b.category.icon,
    stateName: b.state?.name ?? null,
    lgaName: b.lga?.name ?? null,
  };
}

/** Same category, same state first, excluding the business itself. */
export async function getSimilarBusinesses(input: {
  businessId: string;
  categoryId: string;
  stateId: number | null;
}): Promise<BusinessCardData[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_TAGS.businesses);
  const base = {
    status: "APPROVED" as const,
    categoryId: input.categoryId,
    id: { not: input.businessId },
  };
  const order: Prisma.BusinessOrderByWithRelationInput[] = [
    { isFeatured: "desc" },
    { publishedAt: "desc" },
  ];
  const sameState = input.stateId
    ? await prisma.business.findMany({
        where: { ...base, stateId: input.stateId },
        orderBy: order,
        take: 6,
        select: cardSelect,
      })
    : [];
  const rest =
    sameState.length < 6
      ? await prisma.business.findMany({
          where: { ...base, id: { notIn: [input.businessId, ...sameState.map((b) => b.id)] } },
          orderBy: order,
          take: 6 - sameState.length,
          select: cardSelect,
        })
      : [];
  return [...sameState, ...rest].map(toCard);
}

/** Featured first, topped up with recently approved businesses. */
export async function getHomepageBusinesses(limit = 6): Promise<BusinessCardData[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_TAGS.businesses);
  const featured = await prisma.business.findMany({
    where: { status: "APPROVED", isFeatured: true },
    orderBy: [{ publishedAt: "desc" }],
    take: limit,
    select: cardSelect,
  });
  const recent =
    featured.length < limit
      ? await prisma.business.findMany({
          where: { status: "APPROVED", isFeatured: false },
          orderBy: [{ publishedAt: "desc" }],
          take: limit - featured.length,
          select: cardSelect,
        })
      : [];
  return [...featured, ...recent].map(toCard);
}

/** Active categories with the number of approved businesses in each. */
export async function getCategoriesWithCounts() {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_TAGS.businesses);
  cacheTag(CATALOG_TAGS.categories);
  const [categories, counts] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true, parentId: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, slug: true, name: true, icon: true, description: true },
    }),
    prisma.business.groupBy({
      by: ["categoryId"],
      where: { status: "APPROVED" },
      _count: { _all: true },
    }),
  ]);
  return categories.map((c) => ({
    ...c,
    count: counts.find((x) => x.categoryId === c.id)?._count._all ?? 0,
  }));
}

/** Data for the sitemap: approved businesses and category/state pages that have listings. */
export async function getSitemapData() {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_TAGS.businesses);
  const [businesses, combos] = await Promise.all([
    prisma.business.findMany({
      where: { status: "APPROVED" },
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: "desc" },
      take: 45000,
    }),
    prisma.$queryRaw<{ category_slug: string; state_slug: string | null }[]>`
      SELECT DISTINCT c.slug AS category_slug, s.slug AS state_slug
      FROM businesses b
      JOIN categories c ON c.id = b.category_id AND c.is_active
      LEFT JOIN states s ON s.id = b.state_id
      WHERE b.status = 'APPROVED'`,
  ]);
  return { businesses, combos };
}

// --- Search -------------------------------------------------------------------------------

export const SEARCH_SORTS = ["best", "newest", "viewed"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];
export const SEARCH_PAGE_SIZE = 20;
const MAX_RESULTS = 200;

export type SearchParamsInput = {
  q?: string;
  category?: string;
  state?: string;
  lga?: string;
  sort?: SearchSort;
  /** "Load more": returns the first page * 20 results. */
  page?: number;
};

export type SearchResult = { total: number; items: BusinessCardData[]; shown: number };

/** Words for the full-text prefix query: letters/digits only, so no tsquery syntax injection. */
function tsQueryFrom(q: string) {
  const words =
    q
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.slice(0, 6) ?? [];
  return words.length ? words.map((w) => `${w}:*`).join(" & ") : null;
}

type Row = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  area: string | null;
  id_checked: boolean;
  is_featured: boolean;
  logo_public_id: string | null;
  cover_public_id: string | null;
  category_name: string;
  category_icon: string;
  state_name: string | null;
  lga_name: string | null;
};

/**
 * Approved businesses matching the query and filters. Full-text search (stemmed, prefix) plus
 * trigram word similarity so small typos still match ("tailer" -> tailors). Ranked by
 * relevance with a boost for featured businesses and owners whose ID check was accepted.
 */
export async function searchBusinesses(input: SearchParamsInput): Promise<SearchResult> {
  "use cache";
  cacheLife("minutes");
  cacheTag(PUBLIC_TAGS.businesses);

  const q = (input.q ?? "").trim().toLowerCase().slice(0, 80);
  const tsq = tsQueryFrom(q);
  const fuzzy = q.length >= 3;
  const limit = Math.min(
    MAX_RESULTS,
    SEARCH_PAGE_SIZE * Math.max(1, Math.min(10, input.page ?? 1)),
  );

  const filters: Prisma.Sql[] = [Prisma.sql`b.status = 'APPROVED'`];
  if (input.category) filters.push(Prisma.sql`c.slug = ${input.category}`);
  if (input.state) filters.push(Prisma.sql`s.slug = ${input.state}`);
  if (input.lga) filters.push(Prisma.sql`l.slug = ${input.lga}`);
  if (q) {
    const matches: Prisma.Sql[] = [Prisma.sql`position(${q} in b.search_text) > 0`];
    if (tsq) matches.push(Prisma.sql`b.search_vector @@ to_tsquery('english', ${tsq})`);
    if (fuzzy) matches.push(Prisma.sql`extensions.word_similarity(${q}, b.search_text) >= 0.45`);
    filters.push(Prisma.sql`(${Prisma.join(matches, " OR ")})`);
  }
  const where = Prisma.join(filters, " AND ");

  const relevance = q
    ? Prisma.sql`(
        ${tsq ? Prisma.sql`coalesce(ts_rank_cd(b.search_vector, to_tsquery('english', ${tsq})), 0) * 2` : Prisma.sql`0`}
        + ${fuzzy ? Prisma.sql`extensions.word_similarity(${q}, b.search_text)` : Prisma.sql`0`}
        + CASE WHEN position(${q} in lower(b.name)) > 0 THEN 1 ELSE 0 END
      )`
    : Prisma.sql`0`;
  const idChecked = Prisma.sql`EXISTS (SELECT 1 FROM identity_verifications iv WHERE iv.user_id = b.owner_id AND iv.status = 'APPROVED')`;
  const boost = Prisma.sql`(CASE WHEN b.is_featured THEN 0.3 ELSE 0 END + CASE WHEN ${idChecked} THEN 0.15 ELSE 0 END)`;

  const orderBy =
    input.sort === "newest"
      ? Prisma.sql`b.published_at DESC NULLS LAST, b.id`
      : input.sort === "viewed"
        ? Prisma.sql`b.view_count DESC, b.published_at DESC NULLS LAST, b.id`
        : Prisma.sql`(${relevance} + ${boost}) DESC, b.published_at DESC NULLS LAST, b.id`;

  const from = Prisma.sql`
    FROM businesses b
    JOIN categories c ON c.id = b.category_id
    LEFT JOIN states s ON s.id = b.state_id
    LEFT JOIN lgas l ON l.id = b.lga_id
    WHERE ${where}`;

  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT b.id, b.slug, b.name, b.tagline, b.area, ${idChecked} AS id_checked, b.is_featured,
             b.logo_public_id, b.cover_public_id,
             c.name AS category_name, c.icon AS category_icon,
             s.name AS state_name, l.name AS lga_name
      ${from}
      ORDER BY ${orderBy}
      LIMIT ${limit}`,
    prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total ${from}`,
  ]);

  const items: BusinessCardData[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    tagline: r.tagline,
    area: r.area,
    idChecked: r.id_checked,
    isFeatured: r.is_featured,
    logoPublicId: r.logo_public_id,
    coverPublicId: r.cover_public_id,
    categoryName: r.category_name,
    categoryIcon: r.category_icon,
    stateName: r.state_name,
    lgaName: r.lga_name,
  }));
  return { total: countRows[0]?.total ?? 0, items, shown: items.length };
}
