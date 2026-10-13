"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IdCard, Info } from "lucide-react";
import { ID_BADGE_EXPLANATION, ID_BADGE_LABEL } from "@/lib/identity/rules";
import { cn } from "@/lib/utils";

const badgeClass =
  "inline-flex shrink-0 items-center gap-1 rounded-full border border-brand-200 bg-brand-50 font-medium text-brand-800";

/**
 * Static "ID submitted" badge for cards (which are links, so no button inside). The explanation
 * is in the tooltip and for screen readers.
 */
export function IdBadge({ className }: { className?: string }) {
  return (
    <span title={ID_BADGE_EXPLANATION} className={cn(badgeClass, "px-2 py-0.5 text-xs", className)}>
      <IdCard aria-hidden="true" className="size-3.5" />
      {ID_BADGE_LABEL}
      <span className="sr-only">. {ID_BADGE_EXPLANATION}</span>
    </span>
  );
}

/** "ID submitted" badge with a tap/click popover explaining exactly what it means. */
export function IdBadgePopover() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          badgeClass,
          "min-h-8 px-2.5 py-1 text-xs font-semibold hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <IdCard aria-hidden="true" className="size-4" />
        {ID_BADGE_LABEL}
        <Info aria-hidden="true" className="size-3.5 opacity-70" />
        <span className="sr-only">: what this means</span>
      </button>
      <div
        id={panelId}
        role="note"
        hidden={!open}
        className="absolute top-full left-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-white p-3 text-sm leading-relaxed text-gray-800 shadow-raised"
      >
        {ID_BADGE_EXPLANATION}
      </div>
    </div>
  );
}
