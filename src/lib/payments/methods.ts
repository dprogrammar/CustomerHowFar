// Payment methods available to owners. To add a method (e.g. Paystack later):
//  1. add its PaymentProvider enum value in prisma/schema.prisma,
//  2. add an entry here with how to tell whether it's enabled,
//  3. add its panel to the pay page and settle successful payments with settlePayment().
// No server-only imports here: the pay page and settings form both use this.

export type PaymentMethodId = "MANUAL_TRANSFER";

export type PaymentConfig = {
  paymentRequired: boolean;
  listingFeeNaira: number;
  manualTransfer: {
    enabled: boolean;
    bankName: string | null;
    accountNumber: string | null;
    accountName: string | null;
  };
};

export type PaymentMethodDefinition = {
  id: PaymentMethodId;
  label: string;
  description: string;
  /** Usable right now: switched on AND fully configured. */
  isAvailable: (config: PaymentConfig) => boolean;
};

export const PAYMENT_METHODS: PaymentMethodDefinition[] = [
  {
    id: "MANUAL_TRANSFER",
    label: "Pay by bank transfer",
    description:
      "Transfer from any Nigerian bank app, then upload your receipt. Confirmed within 1 working day.",
    isAvailable: (c) =>
      c.manualTransfer.enabled &&
      Boolean(c.manualTransfer.bankName && c.manualTransfer.accountName) &&
      /^\d{10}$/.test(c.manualTransfer.accountNumber ?? ""),
  },
];

export function availableMethods(config: PaymentConfig) {
  return PAYMENT_METHODS.filter((m) => m.isAvailable(config));
}

export const METHOD_LABELS: Record<string, string> = {
  MANUAL_TRANSFER: "Bank transfer",
  PAYSTACK: "Card (Paystack)",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Waiting for transfer",
  AWAITING_CONFIRMATION: "Awaiting confirmation",
  SUCCESS: "Paid",
  FAILED: "Proof rejected",
  ABANDONED: "Cancelled",
};

export function formatKobo(kobo: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: kobo % 100 === 0 ? 0 : 2,
  }).format(kobo / 100);
}
