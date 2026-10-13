"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSiteUrl } from "@/config/site";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  loginSchema,
  profileSchema,
  resetPasswordSchema,
  signupSchema,
  type FieldErrors,
} from "@/lib/validation/auth";
import { authErrorMessage } from "./errors";
import { ensureProfile } from "./profile";
import { safeRedirectPath } from "./redirect";
import { getSessionUser } from "./session";

export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Non-sensitive values echoed back so the form keeps them after an error. Never passwords. */
  values?: Record<string, string>;
  /** Extra hint for the UI, e.g. offer to resend the confirmation email. */
  code?: "email_not_confirmed" | "check_email";
};

function fieldErrorsOf(error: z.ZodError): FieldErrors {
  // One message per field: several rules can fail on the same input (e.g. empty + format).
  const all = z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
  return Object.fromEntries(
    Object.entries(all).map(([field, messages]) => [field, messages?.slice(0, 1)]),
  ) as FieldErrors;
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function callbackUrl(next: string) {
  return `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: text(formData, "email") };
  const next = safeRedirectPath(text(formData, "next"));
  const parsed = loginSchema.safeParse({
    email: values.email,
    password: text(formData, "password"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return {
      status: "error",
      message: authErrorMessage(error, "login"),
      code: error?.code === "email_not_confirmed" ? "email_not_confirmed" : undefined,
      values,
    };
  }

  // Supabase bans suspended users, but check the profile too in case the ban hasn't applied.
  const existing = await prisma.profile.findUnique({
    where: { id: data.user.id },
    select: { status: true },
  });
  if (existing && existing.status !== "ACTIVE") {
    await supabase.auth.signOut({ scope: "local" });
    return { status: "error", message: SUSPENDED_MESSAGE, values };
  }

  await ensureProfile({
    id: data.user.id,
    email: data.user.email ?? parsed.data.email,
    fullName: data.user.user_metadata?.full_name,
  });
  redirect(next);
}

const SUSPENDED_MESSAGE =
  "This account has been suspended, so you can't log in. If you think this is a mistake, contact support.";

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { fullName: text(formData, "fullName"), email: text(formData, "email") };
  const next = safeRedirectPath(text(formData, "next"));
  const parsed = signupSchema.safeParse({
    ...values,
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
    acceptTerms: formData.get("acceptTerms") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), values };
  }

  const { email, password, fullName } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: callbackUrl(next) },
  });

  if (error) {
    return { status: "error", message: authErrorMessage(error, "signup"), values };
  }
  // With email confirmation on, Supabase hides existing accounts by returning a user with no
  // identities. The product wants to tell people the email is taken.
  if (data.user && data.user.identities?.length === 0) {
    return {
      status: "error",
      message: "An account with this email already exists. Log in or reset your password.",
      fieldErrors: { email: ["This email is already registered."] },
      values,
    };
  }
  if (data.session && data.user) {
    // Email confirmation is turned off: the user is signed in straight away.
    await ensureProfile({ id: data.user.id, email, fullName });
    redirect(next);
  }

  return { status: "success", code: "check_email", values: { email } };
}

export async function resendConfirmationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: text(formData, "email") });
  if (!parsed.success) return { status: "error", message: "Enter a valid email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: callbackUrl(safeRedirectPath(text(formData, "next"))) },
  });
  if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") {
    return { status: "error", message: authErrorMessage(error, "resend") };
  }
  // Same response whether or not the account exists.
  return {
    status: "success",
    message: "If that account is waiting for confirmation, we've sent a new link.",
  };
}

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = { email: text(formData, "email") };
  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), values };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: callbackUrl("/reset-password"),
  });
  if (error) {
    // Log for monitoring, but never tell the visitor whether the account exists.
    console.error("[auth:forgot-password] error", {
      code: error.code ?? "none",
      status: error.status,
    });
  }

  return {
    status: "success",
    message:
      "If an account exists for that email, we've sent a link to reset your password. Check your inbox and spam folder.",
    values: { email: parsed.data.email },
  };
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSessionUser();
  if (!session) {
    return {
      status: "error",
      message: "Your reset link has expired. Please request a new one.",
    };
  }

  const parsed = resetPasswordSchema.safeParse({
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", message: authErrorMessage(error, "reset-password") };

  redirect("/account?updated=password");
}

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSessionUser();
  if (!session) redirect("/login?next=%2Faccount");

  const values = { fullName: text(formData, "fullName"), phone: text(formData, "phone") };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), values };
  }

  await ensureProfile(session);
  await prisma.profile.update({
    where: { id: session.id },
    data: { fullName: parsed.data.fullName, phone: parsed.data.phone },
  });

  // Keep the auth metadata name in sync (used to create the profile on other devices).
  const supabase = await createClient();
  await supabase.auth.updateUser({ data: { full_name: parsed.data.fullName } });

  refresh();
  return {
    status: "success",
    message: "Your details have been saved.",
    values: { fullName: parsed.data.fullName, phone: parsed.data.phone ?? "" },
  };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
