import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { loginUrl, safeRedirectPath } from "@/lib/auth/redirect";
import { getSupabasePublicEnv } from "./env";

/** Paths that need a signed-in user. Pages re-check on the server; this is an early redirect. */
const PROTECTED_PREFIXES = ["/account", "/dashboard", "/business/new"];
/** Owner pages for a specific business: /business/<id>/edit, /pay, /submitted. */
const PROTECTED_PATTERN = /^\/business\/[^/]+\/(edit|pay|submitted)\/?$/;

/** Pages that make no sense once signed in; signed-in visitors go to their account. */
const GUEST_ONLY = ["/login", "/signup"];

/**
 * Refreshes the Supabase session on every request so Server Components always see a valid
 * token, and redirects signed-out visitors away from protected pages.
 */
export async function updateSession(request: NextRequest) {
  const { url, publishableKey } = getSupabasePublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not run code between createServerClient and getClaims(): it refreshes the session.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname, search } = request.nextUrl;
  const isProtected =
    PROTECTED_PATTERN.test(pathname) ||
    PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    // Keep any refreshed/cleared auth cookies.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  };

  // Admin area: anyone whose token isn't flagged as admin gets a real 404 (rewritten to a path
  // that matches no route). The flag lives in app_metadata, which only the server can set;
  // pages and actions still verify the database role with requireAdmin().
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const appMetadata = (data?.claims?.app_metadata ?? {}) as { role?: unknown };
    if (!signedIn || appMetadata.role !== "admin") {
      // Server action calls (POST) get a plain 404; page views get the normal 404 page.
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new NextResponse("Not found", {
          status: 404,
          headers: { "Cache-Control": "private, no-store" },
        });
      }
      const notFound = NextResponse.rewrite(new URL("/_not-found-admin", request.url));
      response.cookies.getAll().forEach((cookie) => notFound.cookies.set(cookie));
      notFound.headers.set("Cache-Control", "private, no-store");
      return notFound;
    }
  }

  if (!signedIn && isProtected) return redirectTo(loginUrl(pathname + search));
  if (signedIn && GUEST_ONLY.includes(pathname)) {
    return redirectTo(safeRedirectPath(request.nextUrl.searchParams.get("next")));
  }

  return response;
}
