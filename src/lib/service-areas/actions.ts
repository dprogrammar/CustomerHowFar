"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { ipKey, rateLimit, tooManyMessage } from "@/lib/rate-limit";
import { newUnsubscribeToken } from "./waitlist";

// Public waitlist forms (homepage, onboarding, /coming-soon, "not in your state yet").
// Spam protection: hidden honeypot field + per-IP rate limit (IP stored only as a hash).

export type WaitlistState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: { email: string; name: string; stateId: string; role: string };
};

const schema = z.object({
  email: z.email("Enter a valid email address.").max(254),
  name: z.string().trim().max(80, "Use 80 characters or fewer."),
  stateId: z.coerce.number({ error: "Choose your state." }).int().positive("Choose your state."),
  role: z.enum(["CUSTOMER", "BUSINESS"], { error: "Tell us how you'll use CustomerHowFar." }),
  consent: z.literal("on", { error: "Please agree to be emailed about the launch." }),
});

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

export async function joinWaitlistAction(
  _prev: WaitlistState,
  form: FormData,
): Promise<WaitlistState> {
  const values = {
    email: text(form, "email").trim().toLowerCase(),
    name: text(form, "name"),
    stateId: text(form, "stateId"),
    role: text(form, "role"),
  };
  // Honeypot filled in: pretend it worked so bots learn nothing.
  if (text(form, "website").trim() !== "") {
    return { status: "success", message: "Thanks! We'll email you when we launch in your state." };
  }
  const parsed = schema.safeParse({ ...values, consent: text(form, "consent") || undefined });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>,
      values,
    };
  }
  const limited = await rateLimit("waitlist", ipKey(await headers()));
  if (!limited.ok) return { status: "error", message: tooManyMessage(limited), values };

  const state = await prisma.state.findUnique({
    where: { id: parsed.data.stateId },
    select: { id: true, name: true, isActive: true },
  });
  if (!state) {
    return { status: "error", fieldErrors: { stateId: ["Choose your state."] }, values };
  }
  if (state.isActive) {
    return {
      status: "success",
      message: `Good news: we're already live in ${state.name}! You can start using CustomerHowFar there now.`,
    };
  }

  const session = await getSessionUser();
  const data = {
    name: parsed.data.name || null,
    role: parsed.data.role,
    consentAt: new Date(),
    unsubscribedAt: null,
    ...(session ? { userId: session.id } : {}),
  };
  try {
    // One entry per email and state. Joining again refreshes consent (and re-subscribes).
    await prisma.waitlistEntry.upsert({
      where: { email_stateId: { email: parsed.data.email, stateId: state.id } },
      update: data,
      create: {
        ...data,
        email: parsed.data.email,
        stateId: state.id,
        unsubscribeToken: newUnsubscribeToken(),
      },
    });
  } catch (error) {
    // Two submissions at the same moment: the other one created the entry.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
      throw error;
    }
  }
  return {
    status: "success",
    message: `Thanks! We'll email you when CustomerHowFar launches in ${state.name}.`,
  };
}

const tokenSchema = z.string().min(20).max(100);

/** Unsubscribe from a waitlist (link in every waitlist email; no login needed). */
export async function unsubscribeWaitlistAction(
  _prev: WaitlistState,
  form: FormData,
): Promise<WaitlistState> {
  const parsed = tokenSchema.safeParse(text(form, "token"));
  if (!parsed.success) return { status: "error", message: "This unsubscribe link isn't valid." };
  const { count } = await prisma.waitlistEntry.updateMany({
    where: { unsubscribeToken: parsed.data },
    data: { unsubscribedAt: new Date() },
  });
  if (count === 0) return { status: "error", message: "This unsubscribe link isn't valid." };
  return {
    status: "success",
    message: "You've been unsubscribed. We won't email you about this launch.",
  };
}
