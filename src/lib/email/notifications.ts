import "server-only";
import { getSiteUrl } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "./send";
import { METHOD_LABELS, formatKobo } from "@/lib/payments/methods";
import {
  adminSubmissionEmail,
  adminTransferProofEmail,
  paymentReceiptEmail,
  proofReceivedEmail,
  proofRejectedEmail,
  changesRequestedEmail,
  listingApprovedEmail,
  listingSuspendedEmail,
} from "./templates";

// Each function loads what it needs, sends, and never throws. Call them from `after()` so they
// run once the database change has committed and never delay or undo the action.

async function loadBusiness(businessId: string) {
  return prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      slug: true,
      area: true,
      category: { select: { name: true } },
      state: { select: { name: true } },
      lga: { select: { name: true } },
      owner: { select: { fullName: true, email: true } },
    },
  });
}

async function safely(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    console.error(`[email] ${label} failed`, {
      error: error instanceof Error ? error.name : "unknown",
    });
  }
}

export function notifyListingApproved(businessId: string) {
  return safely("approved", async () => {
    const b = await loadBusiness(businessId);
    if (!b) return;
    const site = getSiteUrl();
    await sendEmail({
      to: { email: b.owner.email, name: b.owner.fullName },
      tag: "listing-approved",
      ...listingApprovedEmail({
        ownerName: b.owner.fullName,
        businessName: b.name,
        listingUrl: `${site}/business/${b.slug}`,
        dashboardUrl: `${site}/dashboard`,
      }),
    });
  });
}

export function notifyChangesRequested(businessId: string, comment: string) {
  return safely("changes-requested", async () => {
    const b = await loadBusiness(businessId);
    if (!b) return;
    await sendEmail({
      to: { email: b.owner.email, name: b.owner.fullName },
      tag: "changes-requested",
      ...changesRequestedEmail({
        ownerName: b.owner.fullName,
        businessName: b.name,
        comment,
        fixUrl: `${getSiteUrl()}/business/${b.id}/edit?step=1`,
      }),
    });
  });
}

export function notifyListingSuspended(businessId: string, reason: string) {
  return safely("suspended", async () => {
    const b = await loadBusiness(businessId);
    if (!b) return;
    await sendEmail({
      to: { email: b.owner.email, name: b.owner.fullName },
      tag: "listing-suspended",
      ...listingSuspendedEmail({
        ownerName: b.owner.fullName,
        businessName: b.name,
        reason,
        supportUrl: `${getSiteUrl()}/contact`,
      }),
    });
  });
}

export function notifyAdminOfSubmission(businessId: string, resubmission: boolean) {
  return safely("admin-submission", async () => {
    const to = process.env.ADMIN_NOTIFY_EMAIL;
    if (!to) return;
    const b = await loadBusiness(businessId);
    if (!b) return;
    await sendEmail({
      to: { email: to },
      tag: "admin-submission",
      ...adminSubmissionEmail({
        businessName: b.name,
        categoryName: b.category.name,
        location: [b.area, b.lga?.name, b.state?.name].filter(Boolean).join(", "),
        ownerName: b.owner.fullName,
        ownerEmail: b.owner.email,
        resubmission,
        reviewUrl: `${getSiteUrl()}/admin/listings/${b.id}`,
      }),
    });
  });
}

// --- Payments ------------------------------------------------------------------------------

async function loadPayment(paymentId: string) {
  return prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      business: { select: { id: true, name: true, status: true } },
      user: { select: { fullName: true, email: true } },
    },
  });
}

const dateFmt = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Africa/Lagos",
});

export function notifyProofReceived(paymentId: string) {
  return safely("proof-received", async () => {
    const p = await loadPayment(paymentId);
    if (!p) return;
    await sendEmail({
      to: { email: p.user.email, name: p.user.fullName },
      tag: "proof-received",
      ...proofReceivedEmail({
        ownerName: p.user.fullName,
        businessName: p.business.name,
        amount: formatKobo(p.amountKobo),
        reference: p.reference,
        dashboardUrl: `${getSiteUrl()}/dashboard`,
      }),
    });
  });
}

export function notifyAdminOfTransferProof(paymentId: string) {
  return safely("admin-transfer-proof", async () => {
    const to = process.env.ADMIN_NOTIFY_EMAIL;
    if (!to) return;
    const p = await loadPayment(paymentId);
    if (!p) return;
    await sendEmail({
      to: { email: to },
      tag: "admin-transfer-proof",
      ...adminTransferProofEmail({
        businessName: p.business.name,
        ownerName: p.user.fullName,
        ownerEmail: p.user.email,
        amountDeclared: formatKobo(p.amountSentKobo ?? 0),
        fee: formatKobo(p.amountKobo),
        reference: p.reference,
        senderName: p.senderName ?? "",
        senderBank: p.senderBank ?? "",
        reviewUrl: `${getSiteUrl()}/admin/payments/${p.id}`,
      }),
    });
  });
}

export function notifyPaymentReceipt(paymentId: string) {
  return safely("payment-receipt", async () => {
    const p = await loadPayment(paymentId);
    if (!p || p.status !== "SUCCESS") return;
    await sendEmail({
      to: { email: p.user.email, name: p.user.fullName },
      tag: "payment-receipt",
      ...paymentReceiptEmail({
        ownerName: p.user.fullName,
        businessName: p.business.name,
        amount: formatKobo(p.amountKobo),
        method: METHOD_LABELS[p.provider] ?? p.provider,
        reference: p.reference,
        paidOn: dateFmt.format(p.paidAt ?? new Date()),
        dashboardUrl: `${getSiteUrl()}/dashboard`,
        approved: p.business.status === "APPROVED",
      }),
    });
  });
}

export function notifyProofRejected(paymentId: string) {
  return safely("proof-rejected", async () => {
    const p = await loadPayment(paymentId);
    if (!p || !p.rejectionReason) return;
    await sendEmail({
      to: { email: p.user.email, name: p.user.fullName },
      tag: "proof-rejected",
      ...proofRejectedEmail({
        ownerName: p.user.fullName,
        businessName: p.business.name,
        reference: p.reference,
        reason: p.rejectionReason,
        payUrl: `${getSiteUrl()}/business/${p.business.id}/pay`,
      }),
    });
  });
}
