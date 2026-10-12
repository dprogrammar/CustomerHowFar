"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Store, UserRound } from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

export type HeaderAccount = { fullName: string; email: string; initials: string };

export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white",
        className,
      )}
    >
      {initials}
    </span>
  );
}

/** Desktop account dropdown (disclosure pattern: button + list of links). */
export function AccountMenu({ account }: { account: HeaderAccount }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Close on outside click and Escape. Links close it on click.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const firstName = account.fullName.split(" ")[0];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex h-11 items-center gap-2 rounded-lg pr-2 pl-1 text-sm font-medium text-gray-800 hover:bg-muted"
      >
        <Avatar initials={account.initials} />
        <span className="max-w-28 truncate">{firstName}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 text-gray-500 transition-transform", open && "rotate-180")}
        />
        <span className="sr-only">Account menu</span>
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-white shadow-raised"
      >
        <div className="border-b border-border px-4 py-3">
          <p className="truncate text-sm font-semibold text-gray-900">{account.fullName}</p>
          <p className="truncate text-sm text-muted-foreground">{account.email}</p>
        </div>
        <ul className="p-1.5">
          <li>
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm text-gray-800 hover:bg-muted"
            >
              <UserRound aria-hidden="true" className="size-4 text-gray-500" />
              My account
            </Link>
          </li>
          <li>
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm text-gray-800 hover:bg-muted"
            >
              <Store aria-hidden="true" className="size-4 text-gray-500" />
              My businesses
            </Link>
          </li>
          <li>
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-red-700 hover:bg-red-50"
              >
                <LogOut aria-hidden="true" className="size-4" />
                Log out
              </button>
            </form>
          </li>
        </ul>
      </div>
    </div>
  );
}
