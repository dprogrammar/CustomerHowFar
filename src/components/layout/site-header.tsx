import Link from "next/link";
import { CATEGORIES } from "@/config/categories";
import { MAIN_NAV, ROUTES } from "@/config/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { QuickSearch } from "@/components/search/quick-search";
import { Logo } from "./logo";
import { MobileMenu } from "./mobile-menu";

const menuCategories = CATEGORIES.slice(0, 8).map(({ slug, name }) => ({ slug, name }));

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
            <Link href={ROUTES.login} className={buttonVariants({ variant: "ghost", size: "md" })}>
              Log in
            </Link>
            <Link href={ROUTES.listBusiness} className={buttonVariants({ variant: "primary" })}>
              List your business
            </Link>
          </div>

          <div className="ml-auto md:hidden">
            <MobileMenu categories={menuCategories} />
          </div>
        </div>

        <QuickSearch id="mobile-header-search" className="pb-3 md:hidden" />
      </Container>
    </header>
  );
}
