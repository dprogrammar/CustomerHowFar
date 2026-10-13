"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/** Registers the service worker (production only). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Not critical: the site works without it.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const SEEN_KEY = "chf-install-prompt-seen";

function storage(op: "get" | "set") {
  try {
    if (op === "get") return window.localStorage.getItem(SEEN_KEY) === "1";
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private mode etc.: just don't remember.
  }
  return false;
}

/**
 * Polite "Install app" offer for Android/Chromium: shown once, a little while after the
 * browser says the app can be installed, never on top of a business page's contact bar.
 * iPhone users get instructions on /help instead (Safari has no install prompt).
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (storage("get") || window.matchMedia("(display-mode: standalone)").matches) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      timer = setTimeout(() => {
        if (!document.body.classList.contains("has-contact-bar") && !storage("get")) {
          setVisible(true);
          storage("set");
        }
      }, 15_000);
    };
    const onInstalled = () => setVisible(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!visible || !event) return null;
  return (
    <div
      role="dialog"
      aria-labelledby="install-title"
      aria-describedby="install-text"
      className="fixed inset-x-3 bottom-[calc(var(--spacing-bottom-nav)+env(safe-area-inset-bottom)+0.75rem)] z-40 mx-auto max-w-md rounded-xl border border-border bg-white p-4 shadow-raised md:bottom-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <Download aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p id="install-title" className="font-semibold text-gray-900">
            Install the HowFar app
          </p>
          <p id="install-text" className="mt-0.5 text-sm text-gray-700">
            Open CustomerHowFar from your home screen. It&apos;s quick and uses little data.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={async () => {
                setVisible(false);
                await event.prompt().catch(() => {});
              }}
              className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Install
            </button>
            <button
              type="button"
              onClick={() => setVisible(false)}
              className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-gray-800 ring-1 ring-border hover:bg-muted"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="-m-1 inline-flex size-9 items-center justify-center rounded-lg text-gray-600 hover:bg-muted"
        >
          <X aria-hidden="true" className="size-5" />
          <span className="sr-only">Close</span>
        </button>
      </div>
    </div>
  );
}
