import "server-only";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { PaymentConfig } from "./methods";

/** Payment settings, always read fresh on the server (never trusted from the browser). */
export async function getPaymentConfig(): Promise<PaymentConfig> {
  const s = await prisma.appSetting.findUnique({ where: { id: 1 } });
  return {
    paymentRequired: s?.paymentRequired ?? false,
    listingFeeNaira: s?.listingFeeNaira ?? 5000,
    manualTransfer: {
      enabled: s?.manualTransferEnabled ?? false,
      bankName: s?.bankName ?? null,
      accountNumber: s?.bankAccountNumber ?? null,
      accountName: s?.bankAccountName ?? null,
    },
  };
}

// No 0/O, 1/I/L: references are read aloud and typed into bank apps.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A unique payment reference such as CHF-7K3P9Q. */
export async function newPaymentReference(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    const reference = `CHF-${code}`;
    const taken = await prisma.payment.findUnique({ where: { reference }, select: { id: true } });
    if (!taken) return reference;
  }
  throw new Error("Could not generate a unique payment reference.");
}
