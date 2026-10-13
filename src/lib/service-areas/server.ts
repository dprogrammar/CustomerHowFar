import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Service-area checks used by the business actions and admin approval. Always read the state
// from the database (never trust the browser).

type Db = Prisma.TransactionClient | typeof prisma;

export async function isStateActive(stateId: number | null | undefined, db: Db = prisma) {
  if (!stateId) return false;
  const s = await db.state.findUnique({ where: { id: stateId }, select: { isActive: true } });
  return Boolean(s?.isActive);
}

export async function getStateName(stateId: number) {
  return (await prisma.state.findUnique({ where: { id: stateId }, select: { name: true } }))?.name;
}
