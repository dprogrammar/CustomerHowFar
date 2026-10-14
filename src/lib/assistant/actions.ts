"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { ASSISTANT } from "@/config/assistant";
import { getCurrentUser, getSessionUser } from "@/lib/auth/session";
import { isListingFeeOn } from "@/lib/payments/fee-switch";
import { prisma } from "@/lib/prisma";
import { ipKey, rateLimit, tooManyMessage } from "@/lib/rate-limit";
import { getAssistantProvider, type AssistantContext } from "./provider";
import { FIND_PROMPT, answerBySlug } from "./rules-provider";
import { listingStatusReply } from "./status";
import type { AssistantReply } from "./types";

// Chat endpoints for the HowFar Assistant. Messages are answered and forgotten: conversations
// are never stored (only unanswered questions, anonymously). Rate-limited per IP (stored as a
// keyed hash).

const askSchema = z.union([
  z.object({ text: z.string().trim().min(1).max(ASSISTANT.MAX_MESSAGE_LENGTH) }),
  z.object({ slug: z.string().regex(/^[a-z0-9-]{1,60}$/) }),
  z.object({ action: z.enum(["find", "status"]) }),
]);

const context: AssistantContext = {
  async getUser() {
    const user = await getCurrentUser();
    if (!user) return null;
    return { id: user.id, nameParts: user.fullName.split(/\s+/).filter(Boolean) };
  },
};

async function limited(): Promise<AssistantReply | null> {
  const result = await rateLimit("chat", ipKey(await headers()));
  return result.ok ? null : { kind: "error", text: tooManyMessage(result) };
}

export async function askAssistantAction(input: z.input<typeof askSchema>): Promise<AssistantReply> {
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) {
    return {
      kind: "error",
      text: `Please type a question of up to ${ASSISTANT.MAX_MESSAGE_LENGTH} characters.`,
    };
  }
  const blocked = await limited();
  if (blocked) return blocked;

  const data = parsed.data;
  if ("slug" in data) return answerBySlug(data.slug);
  if ("action" in data) {
    if (data.action === "find") return FIND_PROMPT;
    return listingStatusReply((await getSessionUser())?.id ?? null);
  }
  return getAssistantProvider().reply(data.text, context);
}

/**
 * What the chat shows when it opens: "My listing status" only for business owners, and the
 * listing-fee question only while the fee is switched on.
 */
export async function assistantStartAction(): Promise<{
  showListingStatus: boolean;
  feeOn: boolean;
}> {
  const [session, feeOn] = await Promise.all([getSessionUser(), isListingFeeOn()]);
  if (!session) return { showListingStatus: false, feeOn };
  const owns = await prisma.business.count({
    where: { ownerId: session.id, status: { not: "DELETED" } },
  });
  return { showListingStatus: owns > 0, feeOn };
}

const feedbackSchema = z.object({ faqId: z.uuid(), helpful: z.boolean() });

/** "Did this help?" Counts only; nothing about the person is stored. */
export async function assistantFeedbackAction(
  input: z.input<typeof feedbackSchema>,
): Promise<{ ok: boolean }> {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const result = await rateLimit("chat-feedback", ipKey(await headers()));
  if (!result.ok) return { ok: false };
  const { faqId, helpful } = parsed.data;
  if (helpful) {
    await prisma.$executeRaw`UPDATE faq_entries SET helpful_count = helpful_count + 1 WHERE id = ${faqId}::uuid`;
  } else {
    await prisma.$executeRaw`UPDATE faq_entries SET not_helpful_count = not_helpful_count + 1 WHERE id = ${faqId}::uuid`;
  }
  return { ok: true };
}
