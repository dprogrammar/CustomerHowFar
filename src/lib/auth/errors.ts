import "server-only";

type AuthErrorLike = { code?: string; status?: number; name?: string } | null | undefined;

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Incorrect email or password.",
  email_not_confirmed:
    "Please confirm your email address first. Check your inbox for the confirmation link.",
  user_already_exists: "An account with this email already exists. Log in instead.",
  email_exists: "An account with this email already exists. Log in instead.",
  weak_password:
    "That password is too easy to guess. Use at least 8 characters with letters and numbers.",
  same_password: "Your new password must be different from your current password.",
  over_email_send_rate_limit: "Too many emails sent. Please wait a few minutes and try again.",
  over_request_rate_limit: "Too many attempts. Please wait a few minutes and try again.",
  email_address_invalid:
    "This email address can't be used. Please check it for typos or use a different email.",
  email_address_not_authorized:
    "We couldn't send an email to this address right now. Please try again later.",
  otp_expired: "This link has expired or has already been used. Please request a new one.",
  user_banned: "This account has been suspended. Contact support for help.",
  signup_disabled: "New sign-ups are temporarily closed. Please try again later.",
};

export const GENERIC_AUTH_ERROR = "Something went wrong. Please try again.";

/** Maps a Supabase Auth error to a friendly message. Logs only the code, never user input. */
export function authErrorMessage(error: AuthErrorLike, context: string): string {
  const code = error?.code;
  const message = code ? MESSAGES[code] : undefined;
  if (!message) {
    console.error(`[auth:${context}] unexpected error`, {
      code: code ?? "none",
      status: error?.status,
      name: error?.name,
    });
  }
  return message ?? GENERIC_AUTH_ERROR;
}
