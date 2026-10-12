import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import type { PaymentStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const ADMIN_PAYMENT_TABS = [
  { key: "confirm", label: "Transfers to confirm", status: "AWAITING_CONFIRMATION" },
  { key: "all", label: "All", status: null },
  { key: "paid", label: "Paid", status: "SUCCESS" },
  { key: "pending", label: "Not yet reported", status: "PENDING" },
  { key: "rejected", label: "Rejected", status: "FAILED" },
] as const;

export type AdminPaymentTab = (typeof ADMIN_PAYMENT_TABS)[number]["key"];

export function parsePaymentTab(value: unknown): AdminPaymentTab {
  return ADMIN_PAYMENT_TABS.some((t) => t.key === value) ? (value as AdminPaymentTab) : "confirm";
}

export const PAYMENTS_PAGE_SIZE = 25;

export async function listAdminPayments(input: { tab: AdminPaymentTab; page: number }) {
  const tab = ADMIN_PAYMENT_TABS.find((t) => t.key === input.tab)!;
  const where: Prisma.PaymentWhereInput = tab.status ? { status: tab.status as PaymentStatus } : {};
  const orderBy: Prisma.PaymentOrderByWithRelationInput[] =
    input.tab === "confirm" ? [{ proofSubmittedAt: "asc" }] : [{ createdAt: "desc" }];
  const page = Math.max(1, Math.floor(input.page) || 1);
  const [total, items] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAYMENTS_PAGE_SIZE,
      take: PAYMENTS_PAGE_SIZE,
      select: {
        id: true,
        provider: true,
        status: true,
        amountKobo: true,
        amountSentKobo: true,
        reference: true,
        createdAt: true,
        proofSubmittedAt: true,
        paidAt: true,
        business: { select: { id: true, name: true } },
        user: { select: { fullName: true, email: true } },
      },
    }),
  ]);
  return { total, items, page, pageCount: Math.max(1, Math.ceil(total / PAYMENTS_PAGE_SIZE)) };
}

export async function countTransfersToConfirm() {
  return prisma.payment.count({ where: { status: "AWAITING_CONFIRMATION" } });
}

/** Confirmed revenue (kobo): today, this month (Nigeria time) and all time. */
export async function getRevenueTotals() {
  const [row] = await prisma.$queryRaw<
    { today: bigint | null; month: bigint | null; total: bigint | null; count: bigint }[]
  >`
    SELECT
      sum(amount_kobo) FILTER (
        WHERE (paid_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Lagos')::date = (now() AT TIME ZONE 'Africa/Lagos')::date
      ) AS today,
      sum(amount_kobo) FILTER (
        WHERE date_trunc('month', paid_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Lagos') = date_trunc('month', now() AT TIME ZONE 'Africa/Lagos')
      ) AS month,
      sum(amount_kobo) AS total,
      count(*) AS count
    FROM payments WHERE status = 'SUCCESS'`;
  return {
    today: Number(row?.today ?? 0),
    month: Number(row?.month ?? 0),
    total: Number(row?.total ?? 0),
    count: Number(row?.count ?? 0),
  };
}

export async function getAdminPayment(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      business: {
        select: { id: true, name: true, slug: true, status: true, feeRequiredAtSubmit: true },
      },
      user: { select: { id: true, fullName: true, email: true, phone: true, createdAt: true } },
      reviewedBy: { select: { fullName: true } },
    },
  });
  if (!payment) notFound();
  const otherPayments = await prisma.payment.findMany({
    where: { businessId: payment.businessId, id: { not: payment.id } },
    orderBy: { createdAt: "desc" },
    select: { id: true, reference: true, status: true, amountKobo: true, createdAt: true },
  });
  return { payment, otherPayments };
}

/** The owner's most relevant manual-transfer payments for the pay page. */
export async function getOwnerTransferState(businessId: string) {
  const payments = await prisma.payment.findMany({
    where: { businessId, provider: "MANUAL_TRANSFER" },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  return {
    awaiting: payments.find((p) => p.status === "AWAITING_CONFIRMATION") ?? null,
    pending: payments.find((p) => p.status === "PENDING") ?? null,
    lastRejected: payments.find((p) => p.status === "FAILED") ?? null,
  };
}
