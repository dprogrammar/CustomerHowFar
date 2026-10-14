"use server";

import { refresh, updateTag } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import type { BusinessStatus, ModerationAction, Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import {
  notifyChangesRequested,
  notifyListingApproved,
  notifyListingReinstated,
  notifyListingSuspended,
} from "@/lib/email/notifications";
import { revalidatePublicBusiness } from "@/lib/business/revalidate";
import { HELP_TAGS } from "@/lib/help/server";
import { FEE_SWITCH_TAG } from "@/lib/payments/fee-switch";
import { prisma } from "@/lib/prisma";
import { approveBusinessInTx, RuleError, StaleError } from "./moderation";

// Every action: requireAdmin() first (404 for anyone else), validate with zod, then change the
// business inside a transaction ONLY if its status is still what the admin saw, and record a
// ModerationDecision. Emails are sent after the response and never undo an action.

export type AdminActionResult = { ok: true; message: string } | { ok: false; error: string };

const STALE =
  "This listing was changed by someone else since you opened it. Reload the page and try again.";

const STATUSES = [
  "DRAFT",
  "PENDING_PAYMENT",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
  "DELETED",
] as const satisfies readonly BusinessStatus[];

const base = z.object({ businessId: z.uuid(), expectedStatus: z.enum(STATUSES) });
const withComment = (label: string) =>
  base.extend({
    comment: z
      .string()
      .trim()
      .min(10, `Please write a ${label} of at least 10 characters.`)
      .max(1000, "Keep it under 1000 characters."),
  });

async function moderate(
  adminId: string,
  input: { businessId: string; expectedStatus: BusinessStatus },
  allowedFrom: readonly BusinessStatus[],
  action: ModerationAction,
  comment: string | null,
  data: (
    current: {
      publishedAt: Date | null;
      feeRequiredAtSubmit: boolean;
      statusBeforeUserSuspension: BusinessStatus | null;
    },
    tx: Prisma.TransactionClient,
  ) => Promise<Prisma.BusinessUpdateManyMutationInput> | Prisma.BusinessUpdateManyMutationInput,
) {
  if (!allowedFrom.includes(input.expectedStatus)) {
    throw new RuleError("That action isn't available for this listing's status.");
  }
  return prisma.$transaction(async (tx) => {
    // Lock the row so two admins (or the owner) can't interleave changes.
    await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${input.businessId}::uuid FOR UPDATE`;
    const current = await tx.business.findUnique({
      where: { id: input.businessId },
      select: {
        status: true,
        publishedAt: true,
        feeRequiredAtSubmit: true,
        slug: true,
        statusBeforeUserSuspension: true,
      },
    });
    if (!current || current.status !== input.expectedStatus) throw new StaleError();

    const updated = await tx.business.updateMany({
      where: { id: input.businessId, status: input.expectedStatus },
      data: await data(current, tx),
    });
    if (updated.count !== 1) throw new StaleError();

    await tx.moderationDecision.create({
      data: { businessId: input.businessId, adminId, action, comment },
    });
    return current.slug;
  });
}

async function revalidateById(businessId: string) {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { slug: true } });
  if (b) revalidatePublicBusiness(b.slug);
}

function fail(error: unknown): AdminActionResult {
  if (error instanceof StaleError) return { ok: false, error: STALE };
  if (error instanceof RuleError) return { ok: false, error: error.message };
  throw error;
}

function invalid(error: z.ZodError): AdminActionResult {
  return { ok: false, error: error.issues[0]?.message ?? "Invalid request." };
}

export async function approveListingAction(
  input: z.input<typeof base>,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const parsed = base.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  let slug: string;
  try {
    // Shared approval rules (status check + payment fairness), see lib/admin/moderation.ts.
    slug = await prisma.$transaction((tx) =>
      approveBusinessInTx(tx, {
        businessId: parsed.data.businessId,
        adminId: admin.id,
        expectedStatus: parsed.data.expectedStatus,
      }),
    );
  } catch (error) {
    return fail(error);
  }
  after(() => notifyListingApproved(parsed.data.businessId));
  revalidatePublicBusiness(slug);
  refresh();
  return { ok: true, message: "Approved. The listing is live and the owner has been emailed." };
}

const rejectSchema = withComment("note for the owner");

export async function requestChangesAction(
  input: z.input<typeof rejectSchema>,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { comment } = parsed.data;
  let slug: string;
  try {
    slug = await moderate(
      admin.id,
      parsed.data,
      ["PENDING_REVIEW", "APPROVED"],
      "REJECTED",
      comment,
      () => ({
        status: "REJECTED",
        rejectionReason: comment,
        needsRecheck: false,
      }),
    );
  } catch (error) {
    return fail(error);
  }
  after(() => notifyChangesRequested(parsed.data.businessId, comment));
  revalidatePublicBusiness(slug);
  refresh();
  return { ok: true, message: "Changes requested. The owner has been emailed your note." };
}

const suspendSchema = withComment("reason");

export async function suspendListingAction(
  input: z.input<typeof suspendSchema>,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const parsed = suspendSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { comment } = parsed.data;
  let slug: string;
  try {
    slug = await moderate(
      admin.id,
      parsed.data,
      ["APPROVED", "PENDING_REVIEW", "PENDING_PAYMENT", "REJECTED"],
      "SUSPENDED",
      comment,
      () => ({ status: "SUSPENDED", isFeatured: false }),
    );
  } catch (error) {
    return fail(error);
  }
  after(() => notifyListingSuspended(parsed.data.businessId, comment));
  revalidatePublicBusiness(slug);
  refresh();
  return { ok: true, message: "Suspended. The listing is hidden and the owner has been emailed." };
}

export async function reinstateListingAction(
  input: z.input<typeof base>,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const parsed = base.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  let wentLive = false;
  let slug: string;
  try {
    slug = await moderate(admin.id, parsed.data, ["SUSPENDED"], "REINSTATED", null, (current) => {
      if (current.statusBeforeUserSuspension) {
        throw new RuleError(
          "This listing is hidden because its owner is suspended. Unsuspend the owner to restore it.",
        );
      }
      // Previously live listings go back live; never-approved ones go back to review.
      wentLive = current.publishedAt !== null;
      return wentLive
        ? { status: "APPROVED", needsRecheck: true }
        : { status: "PENDING_REVIEW", submittedAt: new Date() };
    });
  } catch (error) {
    return fail(error);
  }
  revalidatePublicBusiness(slug);
  if (wentLive) after(() => notifyListingReinstated(parsed.data.businessId));
  refresh();
  return {
    ok: true,
    message: wentLive
      ? "Reinstated. The listing is live again (flagged for a re-check)."
      : "Reinstated. The listing is back in the review queue.",
  };
}

export async function markRecheckedAction(input: z.input<typeof base>): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const parsed = base.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { businessId } = parsed.data;
  const done = await prisma.$transaction(async (tx) => {
    const updated = await tx.business.updateMany({
      where: { id: businessId, status: parsed.data.expectedStatus, needsRecheck: true },
      data: { needsRecheck: false },
    });
    if (updated.count !== 1) return false;
    await tx.moderationDecision.create({
      data: { businessId, adminId: admin.id, action: "RECHECKED" },
    });
    return true;
  });
  if (!done) return { ok: false, error: STALE };
  await revalidateById(businessId);
  refresh();
  return { ok: true, message: "Marked as re-checked." };
}

const flagSchema = z.object({
  businessId: z.uuid(),
  flag: z.enum(["featured"]),
  value: z.boolean(),
});

/** Sets (not toggles) a flag, so two admins clicking at once can't flip it back and forth. */
export async function setListingFlagAction(
  input: z.input<typeof flagSchema>,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const parsed = flagSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  // Only "featured" is settable. The old admin "Verified" badge was removed: the only public
  // trust signal is the owner's accepted ID check (see lib/identity).
  const { businessId, value } = parsed.data;
  const action: ModerationAction = value ? "FEATURED" : "UNFEATURED";

  const changed = await prisma.$transaction(async (tx) => {
    const updated = await tx.business.updateMany({
      where: { id: businessId, isFeatured: !value, status: { not: "DELETED" } },
      data: { isFeatured: value },
    });
    if (updated.count !== 1) return false;
    await tx.moderationDecision.create({ data: { businessId, adminId: admin.id, action } });
    return true;
  });
  if (!changed) return { ok: false, error: STALE };
  await revalidateById(businessId);
  refresh();
  return { ok: true, message: `Featured ${value ? "on" : "off"}.` };
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((v) => (v === "" ? null : v));

const settingsSchema = z.object({
  paymentRequired: z.boolean(),
  listingFeeNaira: z
    .number({ error: "Enter the fee in naira." })
    .int("Use whole naira, no kobo.")
    .min(100, "The fee must be at least ₦100.")
    .max(1_000_000, "The fee must be at most ₦1,000,000."),
  manualTransferEnabled: z.boolean(),
  bankName: optionalText(80),
  bankAccountNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, ""))
    .refine((v) => v === "" || /^\d{10}$/.test(v), "The account number must be exactly 10 digits.")
    .transform((v) => (v === "" ? null : v)),
  bankAccountName: optionalText(80),
});

type SettingsInput = z.output<typeof settingsSchema>;

/** Same rule as lib/payments/methods.ts: transfer is usable only when fully configured. */
function transferUsable(s: SettingsInput) {
  return s.manualTransferEnabled && Boolean(s.bankName && s.bankAccountName && s.bankAccountNumber);
}

export async function updateSettingsAction(
  input: z.input<typeof settingsSchema>,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const next = parsed.data;

  if (next.manualTransferEnabled && !transferUsable(next)) {
    return {
      ok: false,
      error: "To turn on bank transfer, fill in the bank name, account number and account name.",
    };
  }
  // Owners must always have a way to pay while the fee is on.
  if (next.paymentRequired && !transferUsable(next)) {
    return {
      ok: false,
      error:
        "The listing fee is on, so at least one payment method must be enabled. Turn on bank transfer (with complete bank details) or turn the fee off.",
    };
  }

  const changes = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM app_settings WHERE id = 1 FOR UPDATE`;
    const current = await tx.appSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
    const fields = [
      "paymentRequired",
      "listingFeeNaira",
      "manualTransferEnabled",
      "bankName",
      "bankAccountNumber",
      "bankAccountName",
    ] as const;
    const diff = fields
      .filter((field) => current[field] !== next[field])
      .map((field) => ({
        field,
        oldValue: String(current[field] ?? ""),
        newValue: String(next[field] ?? ""),
      }));
    if (diff.length === 0) return diff;
    await tx.appSetting.update({ where: { id: 1 }, data: next });
    await tx.settingChange.createMany({ data: diff.map((d) => ({ ...d, adminId: admin.id })) });
    return diff;
  });

  // The listing fee and payment methods appear in help answers (/help and the chat).
  // Turning the listing fee on or off also changes wording on /help, the homepage, onboarding,
  // the footer and the chat (src/lib/payments/fee-switch.ts).
  if (changes.length > 0) {
    updateTag(HELP_TAGS.facts);
    updateTag(FEE_SWITCH_TAG);
  }
  refresh();
  if (changes.length === 0) return { ok: true, message: "No changes to save." };
  return { ok: true, message: "Settings saved. They apply immediately." };
}
