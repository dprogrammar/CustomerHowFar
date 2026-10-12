import Link from "next/link";
import { Check } from "lucide-react";
import { WIZARD_STEPS, type WizardStep } from "@/lib/business/rules";
import { cn } from "@/lib/utils";

/**
 * Step indicator. With a businessId, steps are links so owners can jump around; before the
 * business exists (step 1 of a new listing) they are plain labels.
 */
export function WizardProgress({
  current,
  businessId,
  completed,
}: {
  current: WizardStep;
  businessId?: string;
  completed: Partial<Record<WizardStep, boolean>>;
}) {
  const percent = ((current - 1) / (WIZARD_STEPS.length - 1)) * 100;

  return (
    <nav aria-label="Listing steps" className="mb-6">
      <p className="mb-2 text-sm font-medium text-gray-700">
        Step {current} of {WIZARD_STEPS.length}:{" "}
        <span className="text-gray-900">{WIZARD_STEPS[current - 1]!.label}</span>
      </p>
      <div
        className="h-2 overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-label="Listing progress"
        aria-valuemin={1}
        aria-valuemax={WIZARD_STEPS.length}
        aria-valuenow={current}
        aria-valuetext={`Step ${current} of ${WIZARD_STEPS.length}`}
      >
        <div
          className="h-full rounded-full bg-brand-600 transition-[width]"
          style={{ width: `${Math.max(percent, 4)}%` }}
        />
      </div>
      <ol className="mt-3 grid grid-cols-5 gap-1 text-center text-[11px] sm:text-xs">
        {WIZARD_STEPS.map(({ step, label }) => {
          const isCurrent = step === current;
          const done = completed[step] && !isCurrent;
          const content = (
            <>
              <span
                className={cn(
                  "mx-auto mb-1 flex size-7 items-center justify-center rounded-full text-xs font-semibold ring-1",
                  isCurrent && "bg-brand-600 text-white ring-brand-600",
                  done && "bg-brand-50 text-brand-700 ring-brand-200",
                  !isCurrent && !done && "bg-white text-gray-600 ring-gray-300",
                )}
              >
                {done ? <Check aria-hidden="true" className="size-4" /> : step}
              </span>
              <span className={cn(isCurrent ? "font-semibold text-gray-900" : "text-gray-600")}>
                {label}
              </span>
              {done && <span className="sr-only"> (done)</span>}
            </>
          );
          return (
            <li key={step}>
              {businessId ? (
                <Link
                  href={`/business/${businessId}/edit?step=${step}`}
                  aria-current={isCurrent ? "step" : undefined}
                  className="block rounded-md py-1 hover:bg-muted"
                >
                  {content}
                </Link>
              ) : (
                <span aria-current={isCurrent ? "step" : undefined} className="block py-1">
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
