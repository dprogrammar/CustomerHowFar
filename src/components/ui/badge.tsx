import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const variants = {
  neutral: "bg-gray-100 text-gray-700",
  brand: "bg-brand-50 text-brand-800 ring-1 ring-brand-600/15 ring-inset",
  accent: "bg-accent-50 text-accent-800 ring-1 ring-accent-600/20 ring-inset",
  verified: "bg-brand-600 text-white",
  outline: "text-gray-700 ring-1 ring-border ring-inset",
} as const;

export type BadgeVariant = keyof typeof variants;

export type BadgeProps = ComponentProps<"span"> & { variant?: BadgeVariant };

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
