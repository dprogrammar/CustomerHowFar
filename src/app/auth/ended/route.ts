import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { loginUrl, safeRedirectPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Clears the auth cookies of a session that no longer works (revoked, suspended or deleted
 * account), then sends the visitor to the login page.
 */
export async function GET(request: NextRequest) {
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"));
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  const response = NextResponse.redirect(new URL(loginUrl(next), request.url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
