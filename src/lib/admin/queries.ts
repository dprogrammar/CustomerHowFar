import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const ADMIN_TABS = [
  { key: "review", label: "In review" },
  { key: "recheck", label: "Needs re-check" },
  { key: "payment", label: "Awaiting payment" },
  { key: "live", label: "Live" },
  { key: "rejected", label: "Changes requested" },
  { key: "suspended", label: "Suspended" },
  { key: "drafts", label: "Drafts" },
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number]["key"];

export function parseTab(value: unknown): AdminTab {
  return ADMIN_TABS.some((t) => t.key === value) ? (value as AdminTab) : "review";
}

const TAB_WHERE: Record<AdminTab, Prisma.BusinessWhereInput> = {
  review: { status: "PENDING_REVIEW" },
  recheck: { status: "APPROVED", needsRecheck: true },
  payment: { status: "PENDING_PAYMENT" },
  live: { status: "APPROVED" },
  rejected: { status: "REJECTED" },
  suspended: { status: "SUSPENDED" },
  drafts: { status: "DRAFT" },
};

const TAB_ORDER: Record<AdminTab, Prisma.BusinessOrderByWithRelationInput[]> = {
  // Oldest submission first: fair, first-come first-served review.
  review: [{ submittedAt: "asc" }, { createdAt: "asc" }],
  recheck: [{ updatedAt: "asc" }],
  payment: [{ updatedAt: "desc" }],
  live: [{ publishedAt: "desc" }],
  rejected: [{ updatedAt: "desc" }],
  suspended: [{ updatedAt: "desc" }],
  drafts: [{ updatedAt: "desc" }],
};

export async function getAdminOverview() {
  const [byStatus, recheck, users] = await Promise.all([
    prisma.business.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.business.count({ where: TAB_WHERE.recheck }),
    prisma.profile.count(),
  ]);
  const count = (status: string) => byStatus.find((s) => s.status === status)?._count._all ?? 0;
  return {
    review: count("PENDING_REVIEW"),
    recheck,
    payment: count("PENDING_PAYMENT"),
    live: count("APPROVED"),
    rejected: count("REJECTED"),
    suspended: count("SUSPENDED"),
    drafts: count("DRAFT"),
    users,
  };
}

export const ADMIN_PAGE_SIZE = 20;

/** Search by business name, owner email, or phone/WhatsApp (digits, any format). */
function searchWhere(query: string): Prisma.BusinessWhereInput | undefined {
  const q = query.trim().slice(0, 100);
  if (!q) return undefined;
  const or: Prisma.BusinessWhereInput[] = [
    { name: { contains: q, mode: "insensitive" } },
    { owner: { email: { contains: q, mode: "insensitive" } } },
  ];
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 4) {
    // Stored as +234XXXXXXXXXX; a local "0803..." search matches on the digits after the 0.
    const tail = digits.replace(/^(234|0)/, "");
    or.push({ phone: { contains: tail } }, { whatsappNumber: { contains: tail } });
  }
  return { OR: or };
}

export async function listAdminBusinesses(input: { tab: AdminTab; q: string; page: number }) {
  const where: Prisma.BusinessWhereInput = {
    AND: [TAB_WHERE[input.tab], searchWhere(input.q) ?? {}],
  };
  const page = Math.max(1, Math.floor(input.page) || 1);
  const [total, items] = await Promise.all([
    prisma.business.count({ where }),
    prisma.business.findMany({
      where,
      orderBy: TAB_ORDER[input.tab],
      skip: (page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        status: true,
        needsRecheck: true,
        isVerified: true,
        isFeatured: true,
        submittedAt: true,
        updatedAt: true,
        logoPublicId: true,
        coverPublicId: true,
        phone: true,
        category: { select: { name: true } },
        state: { select: { name: true } },
        owner: { select: { fullName: true, email: true } },
      },
    }),
  ]);
  return { total, items, page, pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
}

export async function getAdminBusiness(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      owner: {
        select: { id: true, fullName: true, email: true, phone: true, createdAt: true, role: true },
      },
      category: { select: { name: true, icon: true } },
      state: { select: { name: true } },
      lga: { select: { name: true } },
      photos: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { createdAt: "desc" } },
      moderationDecisions: {
        orderBy: { createdAt: "desc" },
        include: { admin: { select: { fullName: true } } },
      },
    },
  });
  if (!business) notFound();

  const numbers = [...new Set([business.phone, business.whatsappNumber])];
  const duplicates = await prisma.business.findMany({
    where: {
      id: { not: business.id },
      OR: [{ phone: { in: numbers } }, { whatsappNumber: { in: numbers } }],
    },
    select: { id: true, name: true, status: true, owner: { select: { email: true } } },
    take: 10,
  });

  const hasPaid = business.payments.some((p) => p.status === "SUCCESS");
  return { business, duplicates, hasPaid };
}

export async function getSettingsWithHistory() {
  const [settings, history] = await Promise.all([
    prisma.appSetting.findUnique({ where: { id: 1 } }),
    prisma.settingChange.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { admin: { select: { fullName: true, email: true } } },
    }),
  ]);
  return {
    paymentRequired: settings?.paymentRequired ?? false,
    listingFeeNaira: settings?.listingFeeNaira ?? 5000,
    updatedAt: settings?.updatedAt ?? null,
    history,
  };
}
