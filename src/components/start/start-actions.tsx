import Link from "next/link";
import { Search, Store } from "lucide-react";
import { ROUTES } from "@/config/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The two big choices on /start. Signed-in visitors get a greeting and account links instead of
// the sign-up links. The greeting line always takes the same space, so swapping the signed-out
// version (prerendered) for the signed-in one never shifts the page.

const SIGNUP_FOR_BUSINESS = `${ROUTES.signup}?next=${encodeURIComponent(ROUTES.listBusiness)}`;

export async function StartActions() {
  const user = await getCurrentUser().catch(() => null);
  return <StartActionsView firstName={user ? user.fullName.split(" ")[0] || "there" : null} />;
}

const linkClass =
  "rounded-md px-1 py-2 font-semibold text-white underline decoration-white/50 underline-offset-4 hover:decoration-white";

export function StartActionsView({ firstName }: { firstName: string | null }) {
  const signedIn = firstName !== null;
  return (
    <div className="mt-6">
      <p className="min-h-7 text-lg font-semibold text-brand-50" aria-live="polite">
        {signedIn ? `Welcome back, ${firstName}!` : "Welcome to CustomerHowFar"}
      </p>
      <div className="mt-4 grid gap-3">
        <Link
          href="/?focus=search"
          className={cn(
            buttonVariants({ variant: "inverse", size: "lg", fullWidth: true }),
            "h-14 text-lg font-extrabold",
          )}
        >
          <Search aria-hidden="true" />I need a service
        </Link>
        <Link
          href={signedIn ? ROUTES.listBusiness : SIGNUP_FOR_BUSINESS}
          className={cn(
            buttonVariants({ variant: "accent", size: "lg", fullWidth: true }),
            "h-14 text-lg font-extrabold",
          )}
        >
          <Store aria-hidden="true" />I own a business
        </Link>
      </div>
      {/* Both versions are inline text of the same height (two lines on phones), so the
          signed-in links replacing the sign-up links never shift the page. */}
      <p className="mt-4 flex min-h-11 flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-brand-50 md:min-h-0">
        {signedIn ? (
          <>
            <span>
              <Link href={ROUTES.account} className={linkClass}>
                Continue to my account
              </Link>
            </span>
            <span>
              <Link href={ROUTES.listBusiness} className={linkClass}>
                List a business
              </Link>
            </span>
          </>
        ) : (
          <>
            <span>
              Already have an account?{" "}
              <Link href={ROUTES.login} className={linkClass}>
                Log in
              </Link>
            </span>
            <span>
              New here?{" "}
              <Link href={ROUTES.signup} className={linkClass}>
                Create account
              </Link>
            </span>
          </>
        )}
      </p>
    </div>
  );
}
