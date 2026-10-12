import type { ComponentProps, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const fieldBase =
  "h-12 w-full rounded-lg border border-border bg-white text-base text-foreground shadow-xs transition-colors placeholder:text-gray-500 hover:border-gray-300 focus-visible:border-brand-600 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-600/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-600";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label className={cn("mb-1.5 block text-sm font-medium text-gray-800", className)} {...props} />
  );
}

export type InputProps = ComponentProps<"input"> & {
  /** Optional icon shown inside the field on the left. */
  icon?: ReactNode;
};

/** Text input. Uses 16px text so iOS does not zoom in on focus. */
export function Input({ className, icon, ...props }: InputProps) {
  if (!icon) return <input className={cn(fieldBase, "px-3.5", className)} {...props} />;

  return (
    <div className="relative w-full">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-gray-500 [&_svg]:size-5"
      >
        {icon}
      </span>
      <input className={cn(fieldBase, "pr-3.5 pl-11", className)} {...props} />
    </div>
  );
}

export type SelectProps = ComponentProps<"select"> & { icon?: ReactNode };

/** Native select (fast, accessible, great on mobile) with consistent styling. */
export function Select({ className, icon, children, ...props }: SelectProps) {
  return (
    <div className="relative w-full">
      {icon && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-gray-500 [&_svg]:size-5"
        >
          {icon}
        </span>
      )}
      <select
        className={cn(fieldBase, "appearance-none pr-10", icon ? "pl-11" : "pl-3.5", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-gray-500"
      />
    </div>
  );
}
