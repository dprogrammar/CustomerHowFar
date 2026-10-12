import { STATUS_META, type BusinessStatus } from "@/lib/business/rules";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "bg-gray-100 text-gray-800 ring-gray-300",
  accent: "bg-accent-50 text-accent-800 ring-accent-200",
  info: "bg-blue-50 text-blue-800 ring-blue-200",
  success: "bg-brand-50 text-brand-800 ring-brand-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
  dark: "bg-gray-800 text-white ring-gray-800",
} as const;

export function StatusBadge({ status, className }: { status: BusinessStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset",
        TONES[meta.tone],
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
