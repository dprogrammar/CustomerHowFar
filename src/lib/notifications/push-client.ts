import {
  pushSetupAction,
  removePushSubscriptionAction,
  savePushSubscriptionAction,
} from "./actions";

// Browser side of Web Push. The service worker (/push-sw.js) is registered only when someone
// turns push on, and unregistered again when they turn it off on that device.

/**
 * "ios": iPhone/iPad, where web push only works for sites installed to the home screen (and this
 * site is deliberately not installable), so the option is hidden there.
 */
export type PushSupport = "supported" | "ios" | "unsupported";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (ios) return "ios";
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
    ? "supported"
    : "unsupported";
}

async function pushRegistration() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const isPush = [reg?.active, reg?.waiting, reg?.installing].some((w) =>
    w?.scriptURL.endsWith("/push-sw.js"),
  );
  return isPush ? reg! : null;
}

/** This browser's push subscription, if push is on here. */
export async function currentSubscription() {
  if (pushSupport() !== "supported") return null;
  const reg = await pushRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

function keyBytes(base64url: string) {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export type TurnOnResult = "on" | "denied" | "dismissed" | "signed-out" | "error";

/** Asks the browser for permission (only call from a click), subscribes and saves the device. */
export async function turnOnPush(): Promise<TurnOnResult> {
  if (pushSupport() !== "supported") return "error";
  const { signedIn, publicKey } = await pushSetupAction();
  if (!signedIn) return "signed-out";
  if (!publicKey) return "error";
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "dismissed";
  try {
    const reg =
      (await pushRegistration()) ??
      (await navigator.serviceWorker.register("/push-sw.js", { scope: "/" }));
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      }));
    const json = sub.toJSON();
    const saved = await savePushSubscriptionAction({
      endpoint: json.endpoint ?? sub.endpoint,
      keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
    });
    return saved.ok ? "on" : "error";
  } catch {
    return "error";
  }
}

/** Turns push off on this device: unsubscribes, forgets the device and removes the worker. */
export async function turnOffPush() {
  const reg = await pushRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await removePushSubscriptionAction({ endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  await reg?.unregister().catch(() => {});
}

// "Not now": don't ask again in this browser for 30 days.
const DISMISS_KEY = "chf-push-prompt-dismissed";
const DISMISS_DAYS = 30;

export function promptDismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function rememberPromptDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Private mode: we'll just ask again another time.
  }
}
