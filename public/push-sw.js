/* CustomerHowFar push notifications service worker.
 *
 * Registered ONLY when someone turns on push notifications. It does exactly two things: show a
 * push notification, and open the right page when it is clicked. There is deliberately NO fetch
 * handler: no page caching and no offline mode, and the site stays not installable (the manifest
 * keeps "display": "browser").
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const url =
    typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//")
      ? data.url
      : "/notifications";
  event.waitUntil(
    self.registration.showNotification(String(data.title || "CustomerHowFar").slice(0, 120), {
      body: String(data.body || "").slice(0, 200),
      icon: "/icons/icon-192.png",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const same = windows.find((w) => w.url === url);
      if (same) return same.focus();
      return self.clients.openWindow(url);
    })(),
  );
});
