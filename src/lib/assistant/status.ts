import "server-only";
import { getOwnerDashboard } from "@/lib/business/queries";
import { STATUS_META, firstIncompleteStep } from "@/lib/business/rules";
import { getIdentityState } from "@/lib/identity/server";
import { getPaymentConfig } from "@/lib/payments/config";
import { PAYMENT_STATUS_LABELS } from "@/lib/payments/methods";
import type { AssistantReply, ListingStatusItem } from "./types";

// "My listing status" in the chat: the SIGNED-IN owner's own businesses only. The user id always
// comes from the verified session (never from the browser).

const ID_CHECK_LABELS = {
  NONE: "Not started",
  PENDING: "Being checked",
  APPROVED: "Accepted",
  REJECTED: "Not accepted. Please submit again",
} as const;

export async function listingStatusReply(userId: string | null): Promise<AssistantReply> {
  if (!userId) {
    return {
      kind: "text",
      text: "Log in to see the status of your listings. I can only show your own businesses.",
      links: [{ label: "Log in", href: "/login?next=%2Fdashboard" }],
    };
  }
  const [businesses, identity, config] = await Promise.all([
    getOwnerDashboard(userId),
    getIdentityState(userId),
    getPaymentConfig(),
  ]);
  if (businesses.length === 0) {
    return {
      kind: "text",
      text: "You haven't listed a business yet. It takes about 5 minutes.",
      links: [{ label: "List your business", href: "/business/new" }],
    };
  }

  const idCheck = ID_CHECK_LABELS[identity.state];
  const idDone = identity.state === "APPROVED" || identity.state === "PENDING";
  const items: ListingStatusItem[] = businesses.map((b) => {
    const meta = STATUS_META[b.status];
    const pay = b.latestPayment;
    const payment = pay
      ? (PAYMENT_STATUS_LABELS[pay.status] ?? pay.status)
      : b.status === "PENDING_PAYMENT"
        ? "Not paid yet"
        : config.paymentRequired
          ? "Not needed yet"
          : null;

    let nextStep = "";
    let action: ListingStatusItem["action"] = null;
    switch (b.status) {
      case "DRAFT":
        nextStep = "Finish your listing and submit it for review.";
        action = {
          label: "Continue setup",
          href: `/business/${b.id}/edit?step=${firstIncompleteStep(b.completeness)}`,
        };
        break;
      case "PENDING_PAYMENT":
        if (pay?.status === "AWAITING_CONFIRMATION") {
          nextStep = "We're checking your payment, usually within 1 working day.";
        } else {
          nextStep =
            pay?.status === "FAILED"
              ? "Your payment proof wasn't accepted. Upload a new one."
              : "Pay the listing fee so we can review your listing.";
          action = { label: pay?.status === "FAILED" ? "Upload new proof" : "Pay", href: `/business/${b.id}/pay` };
        }
        break;
      case "PENDING_REVIEW":
        if (!idDone) {
          nextStep = "Verify your identity. We approve listings only after your ID check.";
          action = { label: "Verify your identity", href: "/account/verify-identity" };
        } else {
          nextStep = "Nothing to do. We'll email you, usually within 1 to 2 working days.";
        }
        break;
      case "REJECTED":
        nextStep = "Make the changes we asked for, then resubmit.";
        action = { label: "Fix and resubmit", href: `/business/${b.id}/edit?step=1` };
        break;
      case "APPROVED":
        nextStep = "Your listing is live.";
        action = { label: "View listing", href: `/business/${b.slug}` };
        break;
      case "SUSPENDED":
        nextStep = "Your listing is hidden. Contact us for help.";
        action = { label: "Contact us", href: "/contact" };
        break;
      default:
        nextStep = "";
    }
    return {
      name: b.name,
      statusLabel: meta.label,
      tone: meta.tone,
      payment,
      idCheck,
      note: b.status === "REJECTED" || b.status === "SUSPENDED" ? b.adminComment : null,
      nextStep,
      action,
    };
  });

  return {
    kind: "status",
    text:
      items.length === 1
        ? "Here's the status of your listing:"
        : `Here's the status of your ${items.length} listings:`,
    items,
    links: [{ label: "Open My businesses", href: "/dashboard" }],
  };
}
