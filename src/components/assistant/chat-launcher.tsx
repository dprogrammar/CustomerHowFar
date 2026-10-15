"use client";

import { lazy, Suspense, useState, useSyncExternalStore } from "react";
import { LoaderCircle, MessageCircle, X } from "lucide-react";
import { ASSISTANT } from "@/config/assistant";
import { cn } from "@/lib/utils";

// The floating help-chat button. Kept tiny: the chat panel (and everything it needs) is loaded
// only when the button is tapped, or hovered/focused just before, so page speed is unaffected.

const loadPanel = () => import("./chat-panel");
const ChatPanel = lazy(loadPanel);

// Per-browser memory: hint closed, chat opened once, first-visit pulse shown. localStorage can
// be unavailable (private browsing), so fall back to memory for this page view.
type Seen = { opened?: boolean; hintClosed?: boolean; pulsed?: boolean };
const KEY = "chf-help-chat";
let memory = "{}";
const listeners = new Set<() => void>();

function readRaw() {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}
function remember(patch: Seen) {
  const next = JSON.stringify({ ...parse(readRaw()), ...patch });
  memory = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Not available: memory only.
  }
  listeners.forEach((l) => l());
}
function parse(raw: string): Seen {
  try {
    return (JSON.parse(raw) as Seen) ?? {};
  } catch {
    return {};
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * Rendered the same everywhere (server and browser agree, so no hydration errors). Admin pages
 * hide it with CSS via the admin layout's data-admin-shell marker (see globals.css).
 */
export function ChatLauncher() {
  return <Launcher />;
}

function Launcher() {
  // null on the server and during hydration: the hint and badge appear only after mount.
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const seen = raw === null ? null : parse(raw);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const showHint = seen !== null && !seen.opened && !seen.hintClosed;
  const showBadge = seen !== null && !seen.opened;
  const pulse = seen !== null && !seen.pulsed;

  const openChat = () => {
    setMounted(true);
    setOpen(true);
    if (!seen?.opened) remember({ opened: true, pulsed: true });
  };
  // The native dialog returns focus to this button when it closes.
  const closeChat = () => setOpen(false);

  return (
    <>
      {/* Fixed 56px box: the hint is positioned beside it, so it appearing never shifts layout. */}
      <div className="chat-launcher fixed right-4 z-40 size-14 print:hidden">
        {showHint && (
          <div className="chat-hint absolute top-1/2 right-full mr-3 flex -translate-y-1/2 items-center rounded-2xl bg-white py-1 pr-1 pl-3 text-sm font-semibold whitespace-nowrap text-gray-900 shadow-raised ring-1 ring-border">
            <button
              type="button"
              onClick={openChat}
              onPointerEnter={loadPanel}
              className="rounded-md py-1.5 text-left"
            >
              Need help? Chat with us
            </button>
            <button
              type="button"
              onClick={() => remember({ hintClosed: true })}
              className="ml-1 flex size-8 items-center justify-center rounded-full text-gray-600 hover:bg-muted hover:text-gray-900"
            >
              <X aria-hidden="true" className="size-4" />
              <span className="sr-only">Hide the chat hint</span>
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={openChat}
          onPointerEnter={loadPanel}
          onFocus={loadPanel}
          onTouchStart={loadPanel}
          onAnimationEnd={() => remember({ pulsed: true })}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            "relative flex size-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-[0_8px_24px_-6px_rgb(0_108_66/0.55),0_2px_6px_rgb(17_24_39/0.15)] transition-transform hover:scale-105 hover:bg-brand-700 focus-visible:outline-offset-4 active:scale-95",
            pulse && "chat-pulse",
          )}
        >
          {open ? (
            <X aria-hidden="true" className="size-7" strokeWidth={2.2} />
          ) : (
            <MessageCircle aria-hidden="true" className="size-7" strokeWidth={2.2} />
          )}
          <span className="sr-only">
            Open {ASSISTANT.name}, automated help chat{showBadge ? " (1 new message)" : ""}
          </span>
          {showBadge && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white ring-2 ring-white"
            >
              1
            </span>
          )}
        </button>
      </div>
      {mounted && (
        <Suspense fallback={<LoadingChat />}>
          <ChatPanel open={open} onClose={closeChat} />
        </Suspense>
      )}
    </>
  );
}

/** Shown over the button while the chat panel's code downloads (first open only). */
function LoadingChat() {
  return (
    <div
      role="status"
      className="chat-launcher fixed right-4 z-50 flex size-14 items-center justify-center rounded-full bg-brand-600 text-white"
    >
      <LoaderCircle aria-hidden="true" className="size-7 animate-spin" />
      <span className="sr-only">Opening the chat…</span>
    </div>
  );
}
