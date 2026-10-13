import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import type { Prisma, Role, UserStatus } from "@/generated/prisma/client";
import { getIdentityState, getIdentityStates } from "@/lib/identity/server";
import { prisma } from "@/lib/prisma";

export const USERS_PAGE_SIZE = 20;

export const ROLE_FILTERS = [
  "CUSTOMER",
  "BUSINESS_OWNER",
  "ADMIN",
] as const satisfies readonly Role[];
export const STATUS_FILTERS = ["ACTIVE", "SUSPENDED"] as const satisfies readonly UserStatus[];

export type UserFilters = {
  q: string;
  role: Role | null;
  status: "ACTIVE" | "SUSPENDED" | null;
  page: number;
};

export function parseUserFilters(
  params: Record<string, string | string[] | undefined>,
): UserFilters {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const role = str(params.role);
  const status = str(params.status);
  return {
    q: str(params.q).trim().slice(0, 100),
    role: (ROLE_FILTERS as readonly string[]).includes(role) ? (role as Role) : null,
    status: (STATUS_FILTERS as readonly string[]).includes(status)
      ? (status as "ACTIVE" | "SUSPENDED")
      : null,
    page: Math.max(1, Math.floor(Number(str(params.page)) || 1)),
  };
}

function searchWhere(q: string): Prisma.ProfileWhereInput | undefined {
  if (!q) return undefined;
  const or: Prisma.ProfileWhereInput[] = [
    { fullName: { contains: q, mode: "insensitive" } },
    { email: { contains: q, mode: "insensitive" } },
  ];
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 4) or.push({ phone: { contains: digits.replace(/^(234|0)/, "") } });
  return { OR: or };
}

/** All users except deleted accounts' anonymous placeholders. */
export async function listAdminUsers(f: UserFilters) {
  const where: Prisma.ProfileWhereInput = {
    AND: [
      { status: f.status ?? { in: ["ACTIVE", "SUSPENDED"] } },
      f.role ? { role: f.role } : {},
      searchWhere(f.q) ?? {},
    ],
  };
  const [total, items] = await Promise.all([
    prisma.profile.count({ where }),
    prisma.profile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (f.page - 1) * USERS_PAGE_SIZE,
      take: USERS_PAGE_SIZE,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        _count: { select: { businesses: { where: { status: { not: "DELETED" } } } } },
      },
    }),
  ]);
  const idStates = await getIdentityStates(items.map((u) => u.id));
  return {
    total,
    page: f.page,
    pageCount: Math.max(1, Math.ceil(total / USERS_PAGE_SIZE)),
    items: items.map((u) => ({ ...u, idState: idStates[u.id] ?? ("NONE" as const) })),
  };
}

export async function getAdminUser(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await prisma.profile.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      suspensionReason: true,
      suspendedAt: true,
      createdAt: true,
      businesses: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          status: true,
          statusBeforeUserSuspension: true,
          createdAt: true,
        },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          reference: true,
          amountKobo: true,
          status: true,
          provider: true,
          createdAt: true,
          paidAt: true,
          business: { select: { name: true } },
        },
      },
    },
  });
  if (!user || user.status === "DELETED") notFound();
  const [identity, history, activeAdmins] = await Promise.all([
    getIdentityState(user.id),
    prisma.adminAuditLog.findMany({
      where: { targetUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        action: true,
        summary: true,
        reason: true,
        createdAt: true,
        actor: { select: { fullName: true } },
      },
    }),
    prisma.profile.count({ where: { role: "ADMIN", status: "ACTIVE" } }),
  ]);
  return { user, identity, history, activeAdmins };
}

export async function getUserCounts() {
  const rows = await prisma.profile.groupBy({ by: ["status"], _count: { _all: true } });
  const count = (s: UserStatus) => rows.find((r) => r.status === s)?._count._all ?? 0;
  return { active: count("ACTIVE"), suspended: count("SUSPENDED") };
}
