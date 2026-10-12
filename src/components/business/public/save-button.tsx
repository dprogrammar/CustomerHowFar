"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { setSavedBusinessAction } from "@/lib/business/saved-actions";
import { cn } from "@/lib/utils";

/** Heart toggle. Signed-out visitors are sent to log in and brought back. */
export function SaveButton({
  businessId,
  initialSaved,
  variant = "icon",
  disabled = false,
}: {
  businessId: string;
  initialSaved: boolean;
  variant?: "icon" | "full";
  disabled?: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  function toggle() {
    const next = !saved;
    setSaved(next); // Optimistic.
    startTransition(async () => {
      const result = await setSavedBusinessAction({ businessId, saved: next });
      if (result.ok) {
        setMessage(result.saved ? "Saved to your list." : "Removed from your saved list.");
        return;
      }
      setSaved(!next);
      if (result.needsLogin) router.push(`/login?next=${encodeURIComponent(pathname)}`);
      else setMessage(result.error);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled || pending}
        aria-pressed={saved}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:opacity-60",
          variant === "icon"
            ? "size-12 text-gray-800 ring-1 ring-border hover:bg-muted"
            : "h-11 flex-1 px-4 text-sm text-gray-900 ring-1 ring-border hover:bg-muted",
        )}
      >
        <Heart
          aria-hidden="true"
          className={cn("size-5", saved ? "fill-red-600 text-red-600" : "text-gray-700")}
        />
        {variant === "full" ? (
          saved ? (
            "Saved"
          ) : (
            "Save"
          )
        ) : (
          <span className="sr-only">{saved ? "Saved" : "Save"}</span>
        )}
      </button>
      <span className="sr-only" role="status">
        {message}
      </span>
    </>
  );
}
