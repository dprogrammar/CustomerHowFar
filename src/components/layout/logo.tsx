import Link from "next/link";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

/** Brand mark: a location pin on Nigerian green. Matches src/app/icon.svg. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="8" fill="#008751" />
      <path
        d="M16 6.5c-3.9 0-7 3-7 6.9 0 5 7 12.1 7 12.1s7-7.1 7-12.1c0-3.9-3.1-6.9-7-6.9Z"
        fill="#fff"
      />
      <circle cx="16" cy="13.4" r="2.8" fill="#fba224" />
    </svg>
  );
}

export function Logo({ className, inverse = false }: { className?: string; inverse?: boolean }) {
  return (
    <Link
      href="/"
      aria-label={`${siteConfig.name} home`}
      className={cn(
        "flex items-center gap-2 rounded-md text-lg font-bold tracking-tight",
        className,
      )}
    >
      <LogoMark />
      <span className={inverse ? "text-white" : "text-gray-900"}>
        Customer<span className={inverse ? "text-brand-200" : "text-brand-700"}>HowFar</span>
      </span>
    </Link>
  );
}
