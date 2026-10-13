import "server-only";
import { prisma } from "@/lib/prisma";

export const REPORT_TABS = [
  { key: "reviews", label: "Reported reviews" },
  { key: "hidden", label: "Hidden reviews" },
  { key: "listings", label: "Reported listings" },
] as const;
export type ReportTab = (typeof REPORT_TABS)[number]["key"];

export function parseReportTab(value: unknown): ReportTab {
  return REPORT_TABS.some((t) => t.key === value) ? (value as ReportTab) : "reviews";
}

const reviewSelect = {
  id: true,
  rating: true,
  comment: true,
  status: true,
  createdAt: true,
  user: { select: { id: true, fullName: true } },
  business: { select: { id: true, name: true, slug: true } },
  reports: {
    orderBy: { createdAt: "asc" as const },
    select: { id: true, reason: true, status: true, createdAt: true },
  },
};

/** Reviews with open reports, oldest open report first. */
export async function listReportedReviews() {
  const reviews = await prisma.review.findMany({
    where: { reports: { some: { status: "OPEN" } } },
    select: reviewSelect,
    take: 100,
  });
  const firstOpen = (r: (typeof reviews)[number]) =>
    Math.min(...r.reports.filter((x) => x.status === "OPEN").map((x) => x.createdAt.getTime()));
  return reviews.sort((a, b) => firstOpen(a) - firstOpen(b));
}

export async function listHiddenReviews() {
  return prisma.review.findMany({
    where: { status: "HIDDEN" },
    orderBy: { updatedAt: "desc" },
    select: reviewSelect,
    take: 100,
  });
}

/** Businesses with open reports, oldest report first. */
export async function listReportedListings() {
  const businesses = await prisma.business.findMany({
    where: { reports: { some: { status: "OPEN" } }, status: { not: "DELETED" } },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      owner: { select: { id: true, fullName: true, status: true } },
      reports: {
        where: { status: "OPEN" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          reason: true,
          details: true,
          createdAt: true,
          reporter: { select: { fullName: true } },
        },
      },
    },
    take: 100,
  });
  return businesses.sort(
    (a, b) => (a.reports[0]?.createdAt.getTime() ?? 0) - (b.reports[0]?.createdAt.getTime() ?? 0),
  );
}

export async function getReportCounts() {
  const [reviews, listings] = await Promise.all([
    prisma.review.count({ where: { reports: { some: { status: "OPEN" } } } }),
    prisma.business.count({
      where: { reports: { some: { status: "OPEN" } }, status: { not: "DELETED" } },
    }),
  ]);
  return { reviews, listings };
}
