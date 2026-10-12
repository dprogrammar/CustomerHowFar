import { Suspense } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { CATEGORIES } from "@/config/categories";
import { MAIN_NAV, ROUTES } from "@/config/navigation";
import { getCurrentUser, initials } from "@/lib/auth/session";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { QuickSearch } from "@/components/search/quick-search";
import { AccountMenu, type HeaderAccount } from "./account-menu";
import { Logo } from "./logo";
import { MobileMenu } from "./mobile-menu";

const menuCategories = CATEGORIES.slice(0, 8).map(({ slug, name }) => ({ slug, name }));

/** Only the fields the client components need. */
async function getHeaderAccount(): Promise<HeaderAccount | null> {
  try {
    const user = await getCurrentUser();
    return user
      ? { fullName: user.fullName, email: user.email, initials: initials(user.fullName) }
      : null;
  } catch (error) {
    // Let Next.js handle its own control-flow errors (e.g. stopping a prerender at cookies()).
    unstable_rethrow(error);
    // Never let a database hiccup take down every page; show the signed-out header instead.
    console.error(
      "[header] could not load account:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function DesktopAccount() {
  const account = await getHeaderAccount();
  if (account) return <AccountMenu account={account} />;
  return (
    <Link href={ROUTES.login} className={buttonVariants({ variant: "ghost", size: "md" })}>
      Log in
    </Link>
  );
}

async function MobileMenuWithAccount() {
  return <MobileMenu categories={menuCategories} account={await getHeaderAccount()} />;
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <Container>
        <div className="flex h-header items-center gap-4 lg:gap-6">
          <Logo />

          <QuickSearch id="header-search" className="hidden max-w-xl flex-1 md:block" />

          <nav aria-label="Main" className="ml-auto hidden items-center gap-1 lg:flex">
            {MAIN_NAV.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-muted hover:text-gray-900"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-2 md:flex lg:ml-0">
            {/* The session is read per request, so it streams in behind this boundary. */}
            <Suspense
              fallback={
                <span aria-hidden="true" className="h-9 w-20 animate-pulse rounded-lg bg-muted" />
              }
            >
              <DesktopAccount />
            </Suspense>
            <Link href={ROUTES.listBusiness} className={buttonVariants({ variant: "primary" })}>
              List your business
            </Link>
          </div>

          <div className="ml-auto md:hidden">
            <Suspense fallback={<MobileMenu categories={menuCategories} account={undefined} />}>
              <MobileMenuWithAccount />
            </Suspense>
          </div>
        </div>

        <QuickSearch id="mobile-header-search" className="pb-3 md:hidden" />
      </Container>
    </header>
  );
}
