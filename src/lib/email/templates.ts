// Branded transactional email templates. Pure functions: no database or secrets.
// Email HTML uses tables and inline styles for compatibility with Gmail, Outlook and phones.

const BRAND = "#008751";
const BRAND_DARK = "#005637";
const ACCENT = "#fba224";

export type RenderedEmail = { subject: string; html: string; text: string };

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraph(text: string) {
  return `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2937">${text}</p>`;
}

function button(label: string, url: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:8px;background:${BRAND}"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(label)}</a></td></tr></table>`;
}

function quote(text: string) {
  return `<div style="margin:0 0 20px;padding:14px 16px;border-left:4px solid ${ACCENT};background:#fff8eb;border-radius:6px;font-size:15px;line-height:22px;color:#78350f;white-space:pre-line">${escapeHtml(text)}</div>`;
}

function layout({
  preheader,
  heading,
  body,
}: {
  preheader: string;
  heading: string;
  body: string;
}) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:${BRAND_DARK};padding:20px 24px">
<span style="font-size:20px;font-weight:700;color:#ffffff">Customer<span style="color:#fcba4d">HowFar</span></span>
</td></tr>
<tr><td style="padding:28px 24px 8px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;color:#111827">${escapeHtml(heading)}</h1>
${body}
</td></tr>
<tr><td style="padding:16px 24px 24px;border-top:1px solid #e5e7eb;font-size:13px;line-height:20px;color:#6b7280">
You are receiving this because of activity on your CustomerHowFar account.<br>Made in Nigeria.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function textFooter() {
  return "\n\n-- \nCustomerHowFar · Made in Nigeria";
}

export function listingApprovedEmail(input: {
  ownerName: string;
  businessName: string;
  listingUrl: string;
  dashboardUrl: string;
}): RenderedEmail {
  const first = input.ownerName.split(" ")[0] || "there";
  return {
    subject: `Your listing is live: ${input.businessName}`,
    html: layout({
      preheader: `${input.businessName} is now live on CustomerHowFar.`,
      heading: "Your listing is live",
      body:
        paragraph(`Hi ${escapeHtml(first)},`) +
        paragraph(
          `Great news: <strong>${escapeHtml(input.businessName)}</strong> has been approved and is now visible to customers on CustomerHowFar.`,
        ) +
        button("View your listing", input.listingUrl) +
        paragraph(
          `Tip: listings with clear photos of real work get more WhatsApp messages. You can add or update photos any time from <a href="${escapeHtml(input.dashboardUrl)}" style="color:${BRAND}">My businesses</a>.`,
        ),
    }),
    text:
      `Hi ${first},\n\nGreat news: ${input.businessName} has been approved and is now live on CustomerHowFar.\n\nView your listing: ${input.listingUrl}\nManage your businesses: ${input.dashboardUrl}` +
      textFooter(),
  };
}

export function changesRequestedEmail(input: {
  ownerName: string;
  businessName: string;
  comment: string;
  fixUrl: string;
}): RenderedEmail {
  const first = input.ownerName.split(" ")[0] || "there";
  return {
    subject: `Changes needed for ${input.businessName}`,
    html: layout({
      preheader: `Our team reviewed ${input.businessName} and asked for a few changes.`,
      heading: "A few changes are needed",
      body:
        paragraph(`Hi ${escapeHtml(first)},`) +
        paragraph(
          `Thanks for listing <strong>${escapeHtml(input.businessName)}</strong>. Our team reviewed it and needs a few changes before it can go live:`,
        ) +
        quote(input.comment) +
        button("Fix and resubmit", input.fixUrl) +
        paragraph(
          "Once you've made the changes, resubmit from the Review step and we'll take another look. You won't be charged again.",
        ),
    }),
    text:
      `Hi ${first},\n\nOur team reviewed ${input.businessName} and needs a few changes before it can go live:\n\n${input.comment}\n\nFix and resubmit: ${input.fixUrl}\n\nYou won't be charged again.` +
      textFooter(),
  };
}

export function listingSuspendedEmail(input: {
  ownerName: string;
  businessName: string;
  reason: string;
  supportUrl: string;
}): RenderedEmail {
  const first = input.ownerName.split(" ")[0] || "there";
  return {
    subject: `Your listing has been suspended: ${input.businessName}`,
    html: layout({
      preheader: `${input.businessName} has been suspended.`,
      heading: "Your listing has been suspended",
      body:
        paragraph(`Hi ${escapeHtml(first)},`) +
        paragraph(
          `<strong>${escapeHtml(input.businessName)}</strong> has been suspended and is no longer visible to customers. Reason:`,
        ) +
        quote(input.reason) +
        paragraph(
          `If you think this is a mistake, please <a href="${escapeHtml(input.supportUrl)}" style="color:${BRAND}">contact our support team</a>.`,
        ),
    }),
    text:
      `Hi ${first},\n\n${input.businessName} has been suspended and is no longer visible to customers.\n\nReason: ${input.reason}\n\nIf you think this is a mistake, contact support: ${input.supportUrl}` +
      textFooter(),
  };
}

export function adminSubmissionEmail(input: {
  businessName: string;
  categoryName: string;
  location: string;
  ownerName: string;
  ownerEmail: string;
  resubmission: boolean;
  reviewUrl: string;
}): RenderedEmail {
  const kind = input.resubmission ? "Resubmitted" : "New listing";
  return {
    subject: `[Review] ${kind}: ${input.businessName}`,
    html: layout({
      preheader: `${input.businessName} is waiting for review.`,
      heading: `${kind} waiting for review`,
      body:
        paragraph(
          `<strong>${escapeHtml(input.businessName)}</strong><br>${escapeHtml(input.categoryName)} · ${escapeHtml(input.location)}`,
        ) +
        paragraph(`Owner: ${escapeHtml(input.ownerName)} (${escapeHtml(input.ownerEmail)})`) +
        button("Open in review queue", input.reviewUrl),
    }),
    text: `${kind} waiting for review: ${input.businessName}\n${input.categoryName} · ${input.location}\nOwner: ${input.ownerName} (${input.ownerEmail})\n\nReview: ${input.reviewUrl}`,
  };
}

// --- Payments ------------------------------------------------------------------------------

function detailsTable(rows: [string, string][]) {
  const cells = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;width:40%">${escapeHtml(label)}</td><td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb">${cells}</table>`;
}

export function proofReceivedEmail(input: {
  ownerName: string;
  businessName: string;
  amount: string;
  reference: string;
  dashboardUrl: string;
}): RenderedEmail {
  const first = input.ownerName.split(" ")[0] || "there";
  return {
    subject: `We received your payment proof (${input.reference})`,
    html: layout({
      preheader: "Your transfer proof is waiting for confirmation.",
      heading: "Payment proof received",
      body:
        paragraph(`Hi ${escapeHtml(first)},`) +
        paragraph(
          `Thanks! We received your bank transfer proof for <strong>${escapeHtml(input.businessName)}</strong>. Our team will check that the money has arrived and confirm it, usually within 1 working day.`,
        ) +
        detailsTable([
          ["Amount", input.amount],
          ["Reference", input.reference],
        ]) +
        button("View my businesses", input.dashboardUrl),
    }),
    text: `Hi ${first},\n\nWe received your bank transfer proof for ${input.businessName}. We'll confirm it once the money has arrived, usually within 1 working day.\n\nAmount: ${input.amount}\nReference: ${input.reference}\n\n${input.dashboardUrl}${textFooter()}`,
  };
}

export function adminTransferProofEmail(input: {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  amountDeclared: string;
  fee: string;
  reference: string;
  senderName: string;
  senderBank: string;
  reviewUrl: string;
}): RenderedEmail {
  return {
    subject: `[Payment] Transfer to confirm: ${input.reference} (${input.amountDeclared})`,
    html: layout({
      preheader: `${input.businessName} uploaded a transfer proof.`,
      heading: "Bank transfer waiting for confirmation",
      body:
        detailsTable([
          ["Business", input.businessName],
          ["Owner", `${input.ownerName} (${input.ownerEmail})`],
          ["Reference", input.reference],
          ["Fee", input.fee],
          ["Amount declared", input.amountDeclared],
          ["Sender", `${input.senderName}, ${input.senderBank}`],
        ]) +
        paragraph(
          "Check that the money is in the bank account before confirming. Receipts can be faked.",
        ) +
        button("Review the transfer", input.reviewUrl),
    }),
    text: `Transfer to confirm: ${input.reference}\nBusiness: ${input.businessName}\nOwner: ${input.ownerName} (${input.ownerEmail})\nFee: ${input.fee}\nDeclared: ${input.amountDeclared}\nSender: ${input.senderName}, ${input.senderBank}\n\nCheck the money is in the bank account before confirming.\n${input.reviewUrl}`,
  };
}

export function paymentReceiptEmail(input: {
  ownerName: string;
  businessName: string;
  amount: string;
  method: string;
  reference: string;
  paidOn: string;
  dashboardUrl: string;
  approved: boolean;
}): RenderedEmail {
  const first = input.ownerName.split(" ")[0] || "there";
  const next = input.approved
    ? "Your listing has also been approved and is now live."
    : "Your listing is now in our review queue. We'll email you when it's live.";
  return {
    subject: `Payment receipt: ${input.reference}`,
    html: layout({
      preheader: `Payment of ${input.amount} confirmed.`,
      heading: "Payment confirmed",
      body:
        paragraph(`Hi ${escapeHtml(first)},`) +
        paragraph(
          `Thank you. Your listing fee payment for <strong>${escapeHtml(input.businessName)}</strong> is confirmed.`,
        ) +
        detailsTable([
          ["Business", input.businessName],
          ["Amount", input.amount],
          ["Method", input.method],
          ["Reference", input.reference],
          ["Date", input.paidOn],
        ]) +
        paragraph(escapeHtml(next)) +
        button("View my businesses", input.dashboardUrl) +
        paragraph("Keep this email as your receipt. You won't be charged again for this listing."),
    }),
    text: `Hi ${first},\n\nYour listing fee payment for ${input.businessName} is confirmed.\n\nAmount: ${input.amount}\nMethod: ${input.method}\nReference: ${input.reference}\nDate: ${input.paidOn}\n\n${next}\n\nKeep this email as your receipt.${textFooter()}`,
  };
}

// --- Accounts ------------------------------------------------------------------------------

export function accountSuspendedEmail(input: {
  name: string;
  reason: string;
  supportUrl: string;
}): RenderedEmail {
  const first = input.name.split(" ")[0] || "there";
  return {
    subject: "Your CustomerHowFar account has been suspended",
    html: layout({
      preheader: "Your account and listings are no longer available.",
      heading: "Your account has been suspended",
      body:
        paragraph(`Hi ${escapeHtml(first)},`) +
        paragraph(
          "Our team has suspended your CustomerHowFar account. You can no longer log in, and your business listings are hidden from customers. Reason:",
        ) +
        quote(input.reason) +
        paragraph(
          `If you think this is a mistake, please <a href="${escapeHtml(input.supportUrl)}" style="color:${BRAND}">contact our support team</a>.`,
        ),
    }),
    text: `Hi ${first},\n\nOur team has suspended your CustomerHowFar account. You can no longer log in, and your business listings are hidden from customers.\n\nReason: ${input.reason}\n\nIf you think this is a mistake, contact support: ${input.supportUrl}${textFooter()}`,
  };
}

export function businessDeletedEmail(input: {
  ownerName: string;
  businessName: string;
  reason: string;
  supportUrl: string;
}): RenderedEmail {
  const first = input.ownerName.split(" ")[0] || "there";
  return {
    subject: `Your listing has been removed: ${input.businessName}`,
    html: layout({
      preheader: `${input.businessName} has been removed from CustomerHowFar.`,
      heading: "Your listing has been removed",
      body:
        paragraph(`Hi ${escapeHtml(first)},`) +
        paragraph(
          `Our team has deleted <strong>${escapeHtml(input.businessName)}</strong> from CustomerHowFar, including its photos. Reason:`,
        ) +
        quote(input.reason) +
        paragraph(
          `If you think this is a mistake, please <a href="${escapeHtml(input.supportUrl)}" style="color:${BRAND}">contact our support team</a>.`,
        ),
    }),
    text: `Hi ${first},\n\nOur team has deleted ${input.businessName} from CustomerHowFar, including its photos.\n\nReason: ${input.reason}\n\nIf you think this is a mistake, contact support: ${input.supportUrl}${textFooter()}`,
  };
}

// --- Reviews, reports and contact ----------------------------------------------------------

function stars(rating: number) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

export function newReviewEmail(input: {
  ownerName: string;
  businessName: string;
  rating: number;
  comment: string;
  reviewerName: string;
  listingUrl: string;
}): RenderedEmail {
  const first = input.ownerName.split(" ")[0] || "there";
  return {
    subject: `New ${input.rating}-star review for ${input.businessName}`,
    html: layout({
      preheader: `${input.reviewerName} reviewed ${input.businessName}.`,
      heading: "You have a new review",
      body:
        paragraph(`Hi ${escapeHtml(first)},`) +
        paragraph(
          `<strong>${escapeHtml(input.reviewerName)}</strong> left a review for <strong>${escapeHtml(input.businessName)}</strong>: <span style="color:${ACCENT}" aria-label="${input.rating} out of 5 stars">${stars(input.rating)}</span>`,
        ) +
        quote(input.comment) +
        button("Read and reply", input.listingUrl) +
        paragraph(
          "A short, polite reply shows customers you care. If the review breaks our rules, you can report it from your listing page.",
        ),
    }),
    text: `Hi ${first},

${input.reviewerName} left a ${input.rating}-star review for ${input.businessName}:

${input.comment}

Read and reply: ${input.listingUrl}${textFooter()}`,
  };
}

export function adminListingReportEmail(input: {
  businessName: string;
  reason: string;
  details: string | null;
  openReports: number;
  reviewUrl: string;
}): RenderedEmail {
  return {
    subject: `[Report] ${input.businessName}: ${input.reason}`,
    html: layout({
      preheader: `A listing was reported: ${input.reason}.`,
      heading: "A listing was reported",
      body:
        detailsTable([
          ["Business", input.businessName],
          ["Reason", input.reason],
          ["Open reports", String(input.openReports)],
        ]) +
        (input.details ? quote(input.details) : "") +
        button("Open reported listings", input.reviewUrl),
    }),
    text: `A listing was reported.
Business: ${input.businessName}
Reason: ${input.reason}
Open reports: ${input.openReports}${
      input.details
        ? `

${input.details}`
        : ""
    }

${input.reviewUrl}`,
  };
}

export function contactMessageEmail(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): RenderedEmail {
  return {
    subject: `[Contact] ${input.subject}`,
    html: layout({
      preheader: `Message from ${input.name}.`,
      heading: "New message from the contact form",
      body:
        detailsTable([
          ["From", input.name],
          ["Email", input.email],
          ["Subject", input.subject],
        ]) +
        quote(input.message) +
        paragraph("Reply to this email to answer them directly."),
    }),
    text: `From: ${input.name} <${input.email}>
Subject: ${input.subject}

${input.message}`,
  };
}

// --- Identity checks -----------------------------------------------------------------------

export function identityAcceptedEmail(input: {
  ownerName: string;
  dashboardUrl: string;
}): RenderedEmail {
  const first = input.ownerName.split(" ")[0] || "there";
  return {
    subject: "Your ID check is complete",
    html: layout({
      preheader: "Our team has accepted your ID and selfie.",
      heading: "Your ID check is complete",
      body:
        paragraph(`Hi ${escapeHtml(first)},`) +
        paragraph(
          "Thank you. Our team has checked your ID and selfie and accepted them. Your approved listings now show an <strong>ID submitted</strong> badge, so customers know you've shared your ID with us.",
        ) +
        button("View my businesses", input.dashboardUrl) +
        paragraph(
          "We delete your ID photo and selfie 90 days after our review. We keep only a record that the check was done.",
        ),
    }),
    text: `Hi ${first},\n\nOur team has checked your ID and selfie and accepted them. Your approved listings now show an "ID submitted" badge.\n\n${input.dashboardUrl}\n\nWe delete your ID photo and selfie 90 days after our review.${textFooter()}`,
  };
}

export function identityRejectedEmail(input: {
  ownerName: string;
  reason: string;
  resubmitUrl: string;
}): RenderedEmail {
  const first = input.ownerName.split(" ")[0] || "there";
  return {
    subject: "Please submit your ID again",
    html: layout({
      preheader: "We couldn't accept your ID check. Here's why.",
      heading: "We couldn't accept your ID check",
      body:
        paragraph(`Hi ${escapeHtml(first)},`) +
        paragraph("Our team looked at your ID and selfie but couldn't accept them:") +
        quote(input.reason) +
        button("Submit again", input.resubmitUrl) +
        paragraph(
          "Tip: take the photos in good light, keep the ID beside your chin (not covering your face), and make sure the ID details are sharp and readable.",
        ),
    }),
    text: `Hi ${first},\n\nWe couldn't accept your ID check:\n\n${input.reason}\n\nSubmit again: ${input.resubmitUrl}${textFooter()}`,
  };
}

export function adminIdentitySubmittedEmail(input: {
  idType: string;
  businessCount: number;
  resubmission: boolean;
  reviewUrl: string;
}): RenderedEmail {
  // No names, emails or images in this email: admins open the check in the admin area.
  const kind = input.resubmission ? "Resubmitted ID check" : "New ID check";
  return {
    subject: `[ID check] ${kind} waiting`,
    html: layout({
      preheader: "A business owner submitted an ID and selfie.",
      heading: `${kind} waiting for review`,
      body:
        detailsTable([
          ["ID type", input.idType],
          ["Businesses owned", String(input.businessCount)],
        ]) + button("Open identity checks", input.reviewUrl),
    }),
    text: `${kind} waiting for review.\nID type: ${input.idType}\nBusinesses owned: ${input.businessCount}\n\n${input.reviewUrl}`,
  };
}

export function proofRejectedEmail(input: {
  ownerName: string;
  businessName: string;
  reference: string;
  reason: string;
  payUrl: string;
}): RenderedEmail {
  const first = input.ownerName.split(" ")[0] || "there";
  return {
    subject: `We couldn't confirm your payment (${input.reference})`,
    html: layout({
      preheader: "Please check your transfer and upload a new proof.",
      heading: "We couldn't confirm your payment",
      body:
        paragraph(`Hi ${escapeHtml(first)},`) +
        paragraph(
          `We checked your transfer proof for <strong>${escapeHtml(input.businessName)}</strong> (reference ${escapeHtml(input.reference)}) but couldn't confirm the payment:`,
        ) +
        quote(input.reason) +
        button("Upload a new proof", input.payUrl) +
        paragraph(
          "If you believe the money was sent, reply to this email with your transfer details.",
        ),
    }),
    text: `Hi ${first},\n\nWe couldn't confirm your transfer for ${input.businessName} (reference ${input.reference}):\n\n${input.reason}\n\nUpload a new proof: ${input.payUrl}${textFooter()}`,
  };
}
