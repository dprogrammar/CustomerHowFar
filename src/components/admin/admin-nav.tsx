"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Banknote,
  ClipboardList,
  Flag,
  IdCard,
  LayoutDashboard,
  ListChecks,
  Settings,
  Activity,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS: {
  label: string;
  href: string;
  icon: LucideIcon;
  match: (p: string, tab: string | null) => boolean;
}[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard, match: (p) => p === "/admin" },
  {
    label: "Review queue",
    href: "/admin/listings?tab=review",
    icon: ClipboardList,
    match: (p, tab) => p === "/admin/listings" && (tab === null || tab === "review"),
  },
  {
    label: "All listings",
    href: "/admin/listings?tab=live",
    icon: ListChecks,
    match: (p, tab) =>
      p.startsWith("/admin/listings") &&
      !(p === "/admin/listings" && (tab === null || tab === "review")),
  },
  {
    label: "Identity checks",
    href: "/admin/identity",
    icon: IdCard,
    match: (p) => p.startsWith("/admin/identity"),
  },
  {
    label: "Reports",
    href: "/admin/reports",
    icon: Flag,
    match: (p) => p.startsWith("/admin/reports"),
  },
  {
    label: "Users",
    href: "/admin/users",
    icon: Users,
    match: (p) => p.startsWith("/admin/users"),
  },
  {
    label: "Payments",
    href: "/admin/payments",
    icon: Banknote,
    match: (p) => p.startsWith("/admin/payments"),
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: Settings,
    match: (p) => p.startsWith("/admin/settings"),
  },
  {
    label: "System",
    href: "/admin/system",
    icon: Activity,
    match: (p) => p.startsWith("/admin/system"),
  },
];

/** Admin section navigation: a scrollable tab bar on phones, a sidebar on desktop. */
export function AdminNav({ pathname, tab }: { pathname: string | null; tab: string | null }) {
  return (
    <nav
      aria-label="Admin"
      className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0"
    >
      <ul className="flex gap-1 lg:flex-col">
        {ITEMS.map(({ label, href, icon: Icon, match }) => {
          const active = pathname !== null && match(pathname, tab);
          return (
            <li key={label} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap",
                  active
                    ? "bg-brand-700 text-white"
                    : "text-gray-700 hover:bg-muted hover:text-gray-900",
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Reads the URL; render inside <Suspense> with <AdminNav pathname={null} tab={null} /> as fallback. */
export function AdminNavWithPath() {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  return <AdminNav pathname={pathname} tab={tab} />;
}
