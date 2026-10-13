"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { OPERATOR } from "@/config/legal";
import { sendContactMessage } from "@/lib/email/notifications";
import { ipKey, takeRateLimit } from "@/lib/rate-limit";

// Contact form. Spam protection: a hidden honeypot field (bots fill it in; people never see
// it) and a per-IP rate limit (the IP is stored only as a keyed hash).

export type ContactState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: { name: string; email: string; subject: string; message: string };
};

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80, "Use 80 characters or fewer."),
  email: z.email("Enter a valid email address.").max(200),
  subject: z.string().trim().min(3, "Enter a subject.").max(120, "Use 120 characters or fewer."),
  message: z
    .string()
    .trim()
    .min(20, "Please write at least 20 characters.")
    .max(3000, "Use 3000 characters or fewer."),
});

const LIMITS = [
  { windowSeconds: 60 * 60, max: 3 },
  { windowSeconds: 24 * 60 * 60, max: 10 },
];

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

export async function contactAction(_prev: ContactState, form: FormData): Promise<ContactState> {
  const values = {
    name: text(form, "name"),
    email: text(form, "email").trim(),
    subject: text(form, "subject"),
    message: text(form, "message"),
  };
  // Honeypot filled in: pretend it worked so bots don't learn anything.
  if (text(form, "website").trim() !== "") {
    return { status: "success", message: "Thanks! Your message has been sent." };
  }
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>,
      values,
    };
  }
  if (!(await takeRateLimit(`contact:${ipKey(await headers())}`, LIMITS))) {
    return {
      status: "error",
      message: `You've sent several messages recently. Please try again later, or email us at ${OPERATOR.email}.`,
      values,
    };
  }
  const sent = await sendContactMessage(parsed.data);
  if (!sent) {
    return {
      status: "error",
      message: `Sorry, we couldn't send your message right now. Please email us at ${OPERATOR.email}.`,
      values,
    };
  }
  return {
    status: "success",
    message: "Thanks! Your message has been sent. We usually reply within 1 to 2 working days.",
  };
}
