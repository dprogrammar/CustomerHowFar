"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CirclePlus, House, Search, UserRound, type LucideIcon } from "lucide-react";
import { ROUTES } from "@/config/navigation";
import { cn } from "@/lib/utils";

const ITEMS: { label: string; href: string; icon: LucideIcon; highlight?: boolean }[] = [
  { label: "Home", href: ROUTES.home, icon: House },
  { label: "Search", href: ROUTES.search, icon: Search },
  { label: "List Business", href: ROUTES.listBusiness, icon: CirclePlus, highlight: true },
  { label: "Account", href: ROUTES.account, icon: UserRound },
];

/** Fixed bottom tab bar for phones. Hidden from md (tablet) up. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white pb-[env(safe-area-inset-bottom)] shadow-nav md:hidden"
    >
      <ul className="grid h-bottom-nav grid-cols-4">
        {ITEMS.map(({ label, href, icon: Icon, highlight }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-brand-700" : "text-gray-600 hover:text-gray-900",
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "size-6",
                    highlight && "text-accent-600",
                    active && "text-brand-700",
                  )}
                  strokeWidth={active ? 2.4 : 2}
                />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
