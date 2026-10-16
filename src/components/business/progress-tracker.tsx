import Link from "next/link";
import { ArrowRight, Check, CircleAlert, Clock3 } from "lucide-react";
import type { Progress, StageState } from "@/lib/business/progress";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Account created -> ID check -> Business details -> Sent for review -> Live. Rendered on the
// server from real data (see src/lib/business/progress.ts); nothing here comes from the browser.

const STATE_TEXT: Record<StageState, string> = {
  done: "done",
  in_progress: "in progress",
  waiting: "waiting on our team",
  action: "needs your action",
  not_started: "not started",
};

function StageIcon({ state, index }: { state: StageState; index: number }) {
  const base = "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold";
  if (state === "done")
    return (
      <span className={cn(base, "bg-brand-600 text-white")}>
        <Check aria-hidden="true" className="size-4" strokeWidth={3} />
      </span>
    );
  if (state === "waiting")
    return (
      <span className={cn(base, "bg-blue-100 text-blue-800")}>
        <Clock3 aria-hidden="true" className="size-4" />
      </span>
    );
  if (state === "action")
    return (
      <span className={cn(base, "bg-red-100 text-red-800")}>
        <CircleAlert aria-hidden="true" className="size-4" />
      </span>
    );
  if (state === "in_progress")
    return (
      <span className={cn(base, "bg-brand-50 text-brand-800 ring-2 ring-brand-600")}>{index}</span>
    );
  return <span className={cn(base, "bg-gray-100 text-gray-600")}>{index}</span>;
}

export function ProgressTracker({
  progress,
  title = "Your progress",
  showAction = true,
  className,
}: {
  progress: Progress;
  title?: string;
  /** Hide the button when the owner is already doing that step (e.g. inside the wizard). */
  showAction?: boolean;
  className?: string;
}) {
  const current = progress.stages.find((s) => s.key === progress.current)!;
  return (
    <section
      aria-label={title}
      className={cn("rounded-xl border border-border bg-surface p-3 sm:p-4", className)}
    >
      <ol className="grid grid-cols-5 gap-1">
        {progress.stages.map((s, i) => {
          const isCurrent = s.key === progress.current;
          return (
            <li
              key={s.key}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1 rounded-lg px-0.5 py-1.5 text-center",
                isCurrent && "bg-white shadow-sm ring-1 ring-brand-300",
              )}
            >
              <StageIcon state={s.state} index={i + 1} />
              <span
                className={cn(
                  "text-[11px] leading-tight sm:text-xs",
                  isCurrent ? "font-bold text-gray-900" : "text-gray-700",
                )}
              >
                <span className="sm:hidden">{s.short}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </span>
              <span className="sr-only">
                : {s.note} ({STATE_TEXT[s.state]}
                {isCurrent ? ", current step" : ""})
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-800" aria-live="polite">
          <span className="font-semibold text-gray-900">{current.label}:</span> {current.note}
        </p>
        {showAction && progress.action && (
          <Link
            href={progress.action.href}
            className={buttonVariants({ size: "md", className: "w-full sm:w-auto" })}
          >
            {progress.action.label}
            <ArrowRight aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  );
}
