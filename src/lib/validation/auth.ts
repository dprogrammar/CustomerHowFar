import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "./password";

// Server-side validation for auth and profile forms. Keep out of client components.

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address.")
  .max(254, "Email address is too long.")
  .pipe(z.email("Enter a valid email address."));

const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(72, "Use 72 characters or fewer.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.");

const fullName = z
  .string()
  .trim()
  .min(2, "Enter your full name.")
  .max(80, "Name is too long.")
  .regex(/^[\p{L}\p{M}' .-]+$/u, "Use letters, spaces, hyphens and apostrophes only.");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(72, "Incorrect email or password."),
});

export const signupSchema = z
  .object({
    fullName,
    email,
    password: newPassword,
    confirmPassword: z.string(),
    acceptTerms: z.literal("on", { error: "You must accept the terms to continue." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password: newPassword, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

/** Nigerian phone numbers: 080..., 81..., +234..., 234... Normalized to +234XXXXXXXXXX. */
export const nigerianPhone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ""))
  .refine((value) => value === "" || /^(\+?234|0)?[789][01]\d{8}$/.test(value), {
    message: "Enter a valid Nigerian phone number, e.g. 0803 123 4567.",
  })
  .transform((value) => (value === "" ? null : `+234${value.slice(-10)}`));

export const profileSchema = z.object({
  fullName,
  phone: nigerianPhone,
});

export type FieldErrors = Partial<Record<string, string[]>>;
