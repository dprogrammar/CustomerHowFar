// Live facts used in help answers, as {{placeholders}} filled when an answer is shown, so /help and
// the chat assistant never repeat out-of-date numbers. Shared by server and client (admin
// preview); the server reads the values in src/lib/help/server.ts.
//
// Bank account details are deliberately NOT a fact: they only appear on the payment page.

import { formatNames } from "@/lib/service-areas/rules";

export type LiveFacts = {
  /** Names of live states, alphabetical. */
  liveStates: string[];
  paymentRequired: boolean;
  listingFeeNaira: number;
  /** Labels of payment methods available right now, e.g. ["bank transfer"]. */
  paymentMethods: string[];
  contactEmail: string;
};

export const PLACEHOLDERS: { key: string; description: string }[] = [
  { key: "live_states", description: 'Live states, e.g. "Lagos" or "Lagos and Oyo"' },
  { key: "listing_fee", description: 'The listing fee amount, e.g. "₦5,000"' },
  {
    key: "fee_status",
    description: "A sentence saying whether the listing fee is on, with the amount",
  },
  { key: "payment_methods", description: 'How owners can pay, e.g. "bank transfer"' },
  { key: "contact_email", description: "Our contact email address" },
];

/** Text shown only while the listing fee is on, or only while listing is free. */
export const CONDITIONAL_BLOCKS: { open: string; close: string; description: string }[] = [
  { open: "{{#fee_on}}", close: "{{/fee_on}}", description: "only while the listing fee is on" },
  { open: "{{#fee_off}}", close: "{{/fee_off}}", description: "only while listing is free" },
];

export function formatFee(naira: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(naira);
}

export function feeStatusSentence(f: LiveFacts) {
  return f.paymentRequired
    ? `Listing has a one-time fee of **${formatFee(f.listingFeeNaira)}** per business, paid before your listing is reviewed.`
    : "Listing your business is **free**.";
}

/**
 * Keeps or drops {{#fee_on}}...{{/fee_on}} and {{#fee_off}}...{{/fee_off}} blocks, then replaces
 * {{placeholders}} with live values. Unknown placeholders are left as they are.
 */
export function fillFacts(markdown: string, f: LiveFacts) {
  const conditional = markdown.replace(
    /\{\{#fee_(on|off)\}\}([\s\S]*?)\{\{\/fee_\1\}\}/g,
    (_all, which: string, body: string) => ((which === "on") === f.paymentRequired ? body : ""),
  );
  return conditional.replace(/\{\{([a-z_]+)\}\}/g, (all, key: string) => {
    switch (key) {
      case "live_states":
        return formatNames(f.liveStates) || "Lagos";
      case "listing_fee":
        return formatFee(f.listingFeeNaira);
      case "fee_status":
        return feeStatusSentence(f);
      case "payment_methods":
        return f.paymentMethods.length
          ? formatNames(f.paymentMethods)
          : "the payment options shown on the payment page";
      case "contact_email":
        return f.contactEmail;
      default:
        return all;
    }
  });
}
