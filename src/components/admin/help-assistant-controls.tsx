"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Trash2 } from "lucide-react";
import {
  dismissUnansweredAction,
  moveFaqAction,
  setFaqActiveAction,
  type HelpActionResult,
} from "@/lib/admin/help-actions";
import { Button } from "@/components/ui/button";

function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<HelpActionResult>) =>
    startTransition(async () => {
      const r = await fn();
      setError(r.ok ? null : r.error);
    });
  return { pending, error, run };
}

/** Reorder and show/hide one help entry. */
export function FaqRowControls({
  id,
  question,
  isActive,
  isFirst,
  isLast,
}: {
  id: string;
  question: string;
  isActive: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { pending, error, run } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending || isFirst}
        onClick={() => run(() => moveFaqAction({ id, direction: "up" }))}
      >
        <ArrowUp aria-hidden="true" />
        <span className="sr-only">Move up: {question}</span>
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending || isLast}
        onClick={() => run(() => moveFaqAction({ id, direction: "down" }))}
      >
        <ArrowDown aria-hidden="true" />
        <span className="sr-only">Move down: {question}</span>
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => setFaqActiveAction({ id, active: !isActive }))}
      >
        {isActive ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        {isActive ? "Hide" : "Show"}
        <span className="sr-only">: {question}</span>
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** Remove a group of unanswered questions. */
export function DismissUnanswered({ ids, label }: { ids: string[]; label: string }) {
  const { pending, error, run } = useAction();
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => dismissUnansweredAction({ ids }))}
      >
        <Trash2 aria-hidden="true" />
        Dismiss<span className="sr-only">: {label}</span>
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm text-red-700">
          {error}
        </p>
      )}
    </>
  );
}
