import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0";

const variants = {
  /** Main action: brand green. */
  primary: "bg-brand-600 text-white shadow-xs hover:bg-brand-700 active:bg-brand-800",
  /** High-visibility secondary action: warm accent with dark text for contrast. */
  accent: "bg-accent-400 text-gray-950 shadow-xs hover:bg-accent-300 active:bg-accent-500",
  /** Quiet action on light backgrounds. */
  secondary: "bg-brand-50 text-brand-800 hover:bg-brand-100 active:bg-brand-200",
  outline:
    "border border-border bg-white text-foreground shadow-xs hover:border-gray-300 hover:bg-muted",
  ghost: "text-foreground hover:bg-muted",
  /** For use on dark/brand backgrounds. */
  inverse: "bg-white text-brand-800 shadow-xs hover:bg-brand-50",
  link: "h-auto px-0 text-brand-700 underline-offset-4 hover:underline",
  /** Destructive actions (suspend, delete). */
  danger: "bg-red-700 text-white shadow-xs hover:bg-red-800 active:bg-red-900",
} as const;

const sizes = {
  sm: "h-9 px-3 text-sm [&_svg]:size-4",
  md: "h-11 px-4 text-sm [&_svg]:size-4",
  lg: "h-12 px-6 text-base [&_svg]:size-5",
  icon: "size-11 [&_svg]:size-5",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export type ButtonStyleProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
};

/** Button classes, for styling links (next/link) as buttons. */
export function buttonVariants({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: ButtonStyleProps = {}) {
  return cn(base, variants[variant], sizes[size], fullWidth && "w-full", className);
}

export type ButtonProps = ComponentProps<"button"> & ButtonStyleProps;

export function Button({
  variant,
  size,
  fullWidth,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonVariants({ variant, size, fullWidth, className })}
      {...props}
    />
  );
}
