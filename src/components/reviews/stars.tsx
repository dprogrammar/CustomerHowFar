import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Read-only star rating (supports fractions, e.g. 4.3). Announced to screen readers as
 * "Rated 4.3 out of 5".
 */
export function Stars({
  value,
  size = "md",
  className,
}: {
  value: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const icon = size === "sm" ? "size-3.5" : size === "lg" ? "size-6" : "size-4.5";
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  const row = (filled: boolean) =>
    Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        aria-hidden="true"
        className={cn(
          icon,
          "shrink-0",
          filled ? "fill-accent-400 text-accent-500" : "fill-gray-200 text-gray-300",
        )}
      />
    ));
  return (
    <span
      role="img"
      aria-label={`Rated ${value.toFixed(1)} out of 5`}
      className={cn("relative inline-flex", className)}
    >
      <span className="inline-flex">{row(false)}</span>
      <span
        className="absolute inset-y-0 left-0 inline-flex overflow-hidden"
        style={{ width: `${pct}%` }}
      >
        {row(true)}
      </span>
    </span>
  );
}
