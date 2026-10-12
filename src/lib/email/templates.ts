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
