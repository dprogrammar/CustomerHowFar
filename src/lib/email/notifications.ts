import "server-only";
import { getSiteUrl } from "@/config/site";
import { deliver, deliverToAdmins } from "@/lib/notifications/deliver";
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
  listingReinstatedEmail,
  listingSuspendedEmail,
  identityAcceptedEmail,
  identityAcceptedMessage,
  identityRejectedEmail,
  adminIdentitySubmittedEmail,
  accountSuspendedEmail,
  businessDeletedEmail,
  newReviewEmail,
  ownerReplyEmail,
  adminListingReportEmail,
  contactMessageEmail,
} from "./templates";
import { LISTING_REASON_LABELS, reviewerName } from "@/lib/reviews/rules";
import { ID_TYPE_LABELS } from "@/lib/identity/rules";

// Each event creates, together: the email (as before), the in-app notification (the bell) and
// a push notification, following the person's settings (src/lib/notifications/deliver.ts).
// Each function loads what it needs and never throws. Call them from `after()` so they run once
// the database change has committed and never delay or undo the action.
// Push text never holds bank details, ID information or other people's full names.

const SETTINGS_PATH = "/account/notifications";
const settingsUrl = () => `${getSiteUrl()}${SETTINGS_PATH}`;

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
      owner: { select: { id: true, fullName: true, email: true } },
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
    await deliver({
      userId: b.owner.id,
      category: "LISTING",
      type: "listing-approved",
      title: "Your listing is live",
      body: `${b.name} is now on CustomerHowFar. Customers can find and contact you.`,
      link: `/business/${b.slug}`,
      email: () =>
        sendEmail({
          to: { email: b.owner.email, name: b.owner.fullName },
          tag: "listing-approved",
          ...listingApprovedEmail({
            ownerName: b.owner.fullName,
            businessName: b.name,
            listingUrl: `${site}/business/${b.slug}`,
            dashboardUrl: `${site}/dashboard`,
          }),
        }),
    });
  });
}

export function notifyChangesRequested(businessId: string, comment: string) {
  return safely("changes-requested", async () => {
    const b = await loadBusiness(businessId);
    if (!b) return;
    await deliver({
      userId: b.owner.id,
      category: "LISTING",
      type: "changes-requested",
      title: "Changes requested",
      body: `We've asked for changes to ${b.name}: ${comment}`,
      pushBody: `We've asked for some changes to ${b.name}. Tap to see what to fix.`,
      link: `/business/${b.id}/edit?step=1`,
      email: () =>
        sendEmail({
          to: { email: b.owner.email, name: b.owner.fullName },
          tag: "changes-requested",
          ...changesRequestedEmail({
            ownerName: b.owner.fullName,
            businessName: b.name,
            comment,
            fixUrl: `${getSiteUrl()}/business/${b.id}/edit?step=1`,
          }),
        }),
    });
  });
}

export function notifyListingSuspended(businessId: string, reason: string) {
  return safely("suspended", async () => {
    const b = await loadBusiness(businessId);
    if (!b) return;
    await deliver({
      userId: b.owner.id,
      category: "LISTING",
      type: "listing-suspended",
      title: "Your listing has been suspended",
      body: `${b.name} is hidden from customers. Reason: ${reason}`,
      pushBody: `${b.name} is hidden from customers. Tap for details.`,
      link: "/dashboard",
      email: () =>
        sendEmail({
          to: { email: b.owner.email, name: b.owner.fullName },
          tag: "listing-suspended",
          ...listingSuspendedEmail({
            ownerName: b.owner.fullName,
            businessName: b.name,
            reason,
            supportUrl: `${getSiteUrl()}/contact`,
          }),
        }),
    });
  });
}

export function notifyListingReinstated(businessId: string) {
  return safely("reinstated", async () => {
    const b = await loadBusiness(businessId);
    if (!b) return;
    await deliver({
      userId: b.owner.id,
      category: "LISTING",
      type: "listing-reinstated",
      title: "Your listing is live again",
      body: `${b.name} has been reinstated. Customers can find it again.`,
      link: `/business/${b.slug}`,
      email: () =>
        sendEmail({
          to: { email: b.owner.email, name: b.owner.fullName },
          tag: "listing-reinstated",
          ...listingReinstatedEmail({
            ownerName: b.owner.fullName,
            businessName: b.name,
            listingUrl: `${getSiteUrl()}/business/${b.slug}`,
            settingsUrl: settingsUrl(),
          }),
        }),
    });
  });
}

export function notifyAdminOfSubmission(businessId: string, resubmission: boolean) {
  return safely("admin-submission", async () => {
    const b = await loadBusiness(businessId);
    if (!b) return;
    const to = process.env.ADMIN_NOTIFY_EMAIL;
    await deliverToAdmins(
      {
        type: "admin-submission",
        title: resubmission ? "Listing resubmitted for review" : "New listing to review",
        body: `${b.name} (${b.category.name}) is waiting for review.`,
        link: `/admin/listings/${b.id}`,
      },
      to
        ? () =>
            sendEmail({
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
            })
        : undefined,
    );
  });
}

// --- Payments ------------------------------------------------------------------------------

async function loadPayment(paymentId: string) {
  return prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      business: { select: { id: true, name: true, status: true } },
      user: { select: { id: true, fullName: true, email: true } },
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
    await deliver({
      userId: p.user.id,
      category: "PAYMENT",
      type: "proof-received",
      title: "Payment proof received",
      body: `We got your payment proof for ${p.business.name}. We'll confirm it, usually within 1 working day.`,
      link: "/dashboard",
      email: () =>
        sendEmail({
          to: { email: p.user.email, name: p.user.fullName },
          tag: "proof-received",
          ...proofReceivedEmail({
            ownerName: p.user.fullName,
            businessName: p.business.name,
            amount: formatKobo(p.amountKobo),
            reference: p.reference,
            dashboardUrl: `${getSiteUrl()}/dashboard`,
          }),
        }),
    });
  });
}

export function notifyAdminOfTransferProof(paymentId: string) {
  return safely("admin-transfer-proof", async () => {
    const p = await loadPayment(paymentId);
    if (!p) return;
    const to = process.env.ADMIN_NOTIFY_EMAIL;
    await deliverToAdmins(
      {
        type: "admin-transfer-proof",
        title: "New transfer proof to confirm",
        body: `A payment proof for ${p.business.name} is waiting to be checked.`,
        link: `/admin/payments/${p.id}`,
      },
      to
        ? () =>
            sendEmail({
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
            })
        : undefined,
    );
  });
}

export function notifyPaymentReceipt(paymentId: string) {
  return safely("payment-receipt", async () => {
    const p = await loadPayment(paymentId);
    if (!p || p.status !== "SUCCESS") return;
    await deliver({
      userId: p.user.id,
      category: "PAYMENT",
      type: "payment-confirmed",
      title: "Payment confirmed",
      body: `Your payment for ${p.business.name} is confirmed. We've emailed your receipt.`,
      pushBody: `Your payment for ${p.business.name} is confirmed.`,
      link: "/dashboard",
      email: () =>
        sendEmail({
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
        }),
    });
  });
}

export function notifyProofRejected(paymentId: string) {
  return safely("proof-rejected", async () => {
    const p = await loadPayment(paymentId);
    if (!p || !p.rejectionReason) return;
    await deliver({
      userId: p.user.id,
      category: "PAYMENT",
      type: "proof-rejected",
      title: "Payment proof not accepted",
      body: `We couldn't accept your payment proof for ${p.business.name}: ${p.rejectionReason}`,
      pushBody: `We couldn't accept your payment proof for ${p.business.name}. Tap to see why.`,
      link: `/business/${p.business.id}/pay`,
      email: () =>
        sendEmail({
          to: { email: p.user.email, name: p.user.fullName },
          tag: "proof-rejected",
          ...proofRejectedEmail({
            ownerName: p.user.fullName,
            businessName: p.business.name,
            reference: p.reference,
            reason: p.rejectionReason!,
            payUrl: `${getSiteUrl()}/business/${p.business.id}/pay`,
          }),
        }),
    });
  });
}

// --- Identity checks -----------------------------------------------------------------------

async function loadIdentity(verificationId: string) {
  return prisma.identityVerification.findUnique({
    where: { id: verificationId },
    select: {
      id: true,
      status: true,
      idType: true,
      rejectionReason: true,
      userId: true,
      user: { select: { fullName: true, email: true, _count: { select: { businesses: true } } } },
    },
  });
}

export function notifyIdentityReviewed(verificationId: string) {
  return safely("identity-reviewed", async () => {
    const v = await loadIdentity(verificationId);
    if (!v?.user || !v.userId) return;
    const user = v.user;
    const site = getSiteUrl();
    const to = { email: user.email, name: user.fullName };
    if (v.status === "APPROVED") {
      // Don't suggest a listing is live while one is still waiting for review.
      const inReview = await prisma.business.count({
        where: { ownerId: v.userId, status: "PENDING_REVIEW" },
      });
      const listingInReview = inReview > 0;
      const message = identityAcceptedMessage(listingInReview);
      await deliver({
        userId: v.userId,
        category: "LISTING",
        type: "identity-accepted",
        title: "ID check accepted",
        body: message,
        link: "/dashboard",
        email: () =>
          sendEmail({
            to,
            tag: "identity-accepted",
            ...identityAcceptedEmail({
              ownerName: user.fullName,
              dashboardUrl: `${site}/dashboard`,
              listingInReview,
            }),
          }),
      });
    } else if (v.status === "REJECTED" && v.rejectionReason) {
      const reason = v.rejectionReason;
      await deliver({
        userId: v.userId,
        category: "LISTING",
        type: "identity-rejected",
        title: "Please submit your ID again",
        body: `We couldn't accept your ID check: ${reason}`,
        pushBody: "We couldn't accept your ID check. Tap to see why and try again.",
        link: "/account/verify-identity",
        email: () =>
          sendEmail({
            to,
            tag: "identity-rejected",
            ...identityRejectedEmail({
              ownerName: user.fullName,
              reason,
              resubmitUrl: `${site}/account/verify-identity`,
            }),
          }),
      });
    }
  });
}

export function notifyAdminOfIdentity(verificationId: string, resubmission: boolean) {
  return safely("admin-identity", async () => {
    const v = await loadIdentity(verificationId);
    if (!v || v.status !== "PENDING") return;
    const to = process.env.ADMIN_NOTIFY_EMAIL;
    await deliverToAdmins(
      {
        type: "admin-identity",
        title: resubmission ? "ID check resubmitted" : "New ID check to review",
        body: "A business owner submitted an ID check.",
        link: `/admin/identity/${v.id}`,
      },
      to
        ? () =>
            sendEmail({
              to: { email: to },
              tag: "admin-identity",
              ...adminIdentitySubmittedEmail({
                idType: ID_TYPE_LABELS[v.idType] ?? v.idType,
                businessCount: v.user?._count.businesses ?? 0,
                resubmission,
                reviewUrl: `${getSiteUrl()}/admin/identity/${v.id}`,
              }),
            })
        : undefined,
    );
  });
}

// --- Accounts (email only: the person can no longer sign in to see notifications) ----------

export function notifyUserSuspended(userId: string) {
  return safely("account-suspended", async () => {
    const p = await prisma.profile.findUnique({
      where: { id: userId },
      select: { fullName: true, email: true, status: true, suspensionReason: true },
    });
    if (!p || p.status !== "SUSPENDED" || !p.suspensionReason) return;
    await sendEmail({
      to: { email: p.email, name: p.fullName },
      tag: "account-suspended",
      ...accountSuspendedEmail({
        name: p.fullName,
        reason: p.suspensionReason,
        supportUrl: `${getSiteUrl()}/contact`,
      }),
    });
  });
}

/** The owner's details are captured before deletion and passed in. */
export function notifyBusinessDeleted(input: {
  ownerEmail: string;
  ownerName: string;
  businessName: string;
  reason: string;
}) {
  return safely("business-deleted", async () => {
    await sendEmail({
      to: { email: input.ownerEmail, name: input.ownerName },
      tag: "business-deleted",
      ...businessDeletedEmail({
        ownerName: input.ownerName,
        businessName: input.businessName,
        reason: input.reason,
        supportUrl: `${getSiteUrl()}/contact`,
      }),
    });
  });
}

// --- Reviews, reports and contact ------------------------------------------------------------

export function notifyNewReview(reviewId: string) {
  return safely("new-review", async () => {
    const r = await prisma.review.findUnique({
      where: { id: reviewId },
      select: {
        rating: true,
        comment: true,
        status: true,
        user: { select: { fullName: true } },
        business: {
          select: {
            name: true,
            slug: true,
            owner: { select: { id: true, fullName: true, email: true, status: true } },
          },
        },
      },
    });
    if (!r || r.status !== "PUBLISHED" || r.business.owner.status !== "ACTIVE") return;
    const owner = r.business.owner;
    await deliver({
      userId: owner.id,
      category: "REVIEW",
      type: "new-review",
      title: `New ${r.rating}-star review`,
      body: `${reviewerName(r.user.fullName)} reviewed ${r.business.name}. Tap to read and reply.`,
      pushBody: `A customer left a ${r.rating}-star review for ${r.business.name}.`,
      link: `/business/${r.business.slug}#reviews-title`,
      email: () =>
        sendEmail({
          to: { email: owner.email, name: owner.fullName },
          tag: "new-review",
          ...newReviewEmail({
            ownerName: owner.fullName,
            businessName: r.business.name,
            rating: r.rating,
            comment: r.comment ?? "",
            reviewerName: reviewerName(r.user.fullName),
            listingUrl: `${getSiteUrl()}/business/${r.business.slug}#reviews-title`,
          }),
        }),
    });
  });
}

/** A business owner replied to a customer's review: tell the customer. */
export function notifyOwnerReply(reviewId: string) {
  return safely("owner-reply", async () => {
    const r = await prisma.review.findUnique({
      where: { id: reviewId },
      select: {
        status: true,
        ownerReply: true,
        user: { select: { id: true, fullName: true, email: true, status: true } },
        business: { select: { name: true, slug: true, status: true } },
      },
    });
    if (!r?.ownerReply || r.status !== "PUBLISHED" || r.user.status !== "ACTIVE") return;
    if (r.business.status !== "APPROVED") return;
    const reply = r.ownerReply;
    const link = `/business/${r.business.slug}#reviews-title`;
    await deliver({
      userId: r.user.id,
      category: "REVIEW",
      type: "owner-reply",
      title: `${r.business.name} replied to your review`,
      body: reply.length > 160 ? `${reply.slice(0, 157)}…` : reply,
      pushBody: `${r.business.name} replied to your review. Tap to read it.`,
      link,
      email: () =>
        sendEmail({
          to: { email: r.user.email, name: r.user.fullName },
          tag: "owner-reply",
          ...ownerReplyEmail({
            name: r.user.fullName,
            businessName: r.business.name,
            reply,
            reviewUrl: `${getSiteUrl()}${link}`,
            settingsUrl: settingsUrl(),
          }),
        }),
    });
  });
}

export function notifyAdminOfListingReport(reportId: string) {
  return safely("admin-listing-report", async () => {
    const r = await prisma.businessReport.findUnique({
      where: { id: reportId },
      select: {
        reason: true,
        details: true,
        businessId: true,
        business: { select: { name: true } },
      },
    });
    if (!r) return;
    const openReports = await prisma.businessReport.count({
      where: { businessId: r.businessId, status: "OPEN" },
    });
    const to = process.env.ADMIN_NOTIFY_EMAIL;
    const reason = LISTING_REASON_LABELS[r.reason] ?? r.reason;
    await deliverToAdmins(
      {
        type: "admin-listing-report",
        title: "New report",
        body: `${r.business.name} was reported: ${reason}.`,
        link: "/admin/reports?tab=listings",
      },
      to
        ? () =>
            sendEmail({
              to: { email: to },
              tag: "admin-listing-report",
              ...adminListingReportEmail({
                businessName: r.business.name,
                reason,
                details: r.details,
                openReports,
                reviewUrl: `${getSiteUrl()}/admin/reports?tab=listings`,
              }),
            })
        : undefined,
    );
  });
}

/** A review was reported (in-app and push for admins; there is no email for this). */
export function notifyAdminOfReviewReport(reviewId: string) {
  return safely("admin-review-report", async () => {
    const r = await prisma.review.findUnique({
      where: { id: reviewId },
      select: { business: { select: { name: true } } },
    });
    if (!r) return;
    await deliverToAdmins({
      type: "admin-review-report",
      title: "New report",
      body: `A review of ${r.business.name} was reported.`,
      link: "/admin/reports",
    });
  });
}

/** Contact form: sent to the admin inbox with reply-to set to the sender. Returns success. */
export async function sendContactMessage(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) return false;
  return sendEmail({
    to: { email: to },
    replyTo: { email: input.email, name: input.name },
    tag: "contact-form",
    ...contactMessageEmail(input),
  });
}
