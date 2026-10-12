import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  action,
  align = "left",
  className,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 sm:mb-8",
        align === "center"
          ? "items-center text-center"
          : "sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        {eyebrow && (
          <p className="mb-2 text-sm font-semibold tracking-wide text-brand-700 uppercase">
            {eyebrow}
          </p>
        )}
        <h2 id={id} className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          {title}
        </h2>
        {description && <p className="mt-2 text-base text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
