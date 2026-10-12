"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copies a value (account number, amount, reference) with a visible confirmation. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      window.prompt(`Copy ${label}:`, value);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-brand-800 ring-1 ring-brand-200 hover:bg-brand-50"
    >
      {copied ? (
        <Check aria-hidden="true" className="size-4" />
      ) : (
        <Copy aria-hidden="true" className="size-4" />
      )}
      {copied ? "Copied" : "Copy"}
      <span className="sr-only"> {label}</span>
      <span role="status" className="sr-only">
        {copied ? `${label} copied` : ""}
      </span>
    </button>
  );
}
