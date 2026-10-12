import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { ensureProfile } from "@/lib/auth/profile";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = [
  "signup",
  "email",
  "recovery",
  "invite",
  "magiclink",
  "email_change",
];

/**
 * Landing point for links in Supabase emails (confirm sign-up, reset password) and, later,
 * OAuth providers. Supports both the PKCE `code` flow and the `token_hash` flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  let next = safeRedirectPath(searchParams.get("next"));

  const supabase = await createClient();
  let user = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) user = data.user;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) user = data.user;
    if (type === "recovery") next = "/reset-password";
  }

  const redirectTo = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.nextUrl.origin));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };

  if (!user?.email) return redirectTo("/login?error=link_invalid");

  await ensureProfile({
    id: user.id,
    email: user.email,
    fullName: user.user_metadata?.full_name,
  });
  return redirectTo(next === "/account" && type === "signup" ? "/account?welcome=1" : next);
}
