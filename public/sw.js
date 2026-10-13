/* CustomerHowFar clean-up service worker.
 *
 * App installation is switched off for now (see src/config/pwa.ts). Earlier versions of the site
 * registered a caching service worker at this URL. Browsers re-check /sw.js regularly, pick up
 * this version, and it then:
 * - deletes every cache the old worker created, and
 * - unregisters itself, so the site runs with no service worker at all.
 * It has no fetch handler, so it never intercepts or caches any request.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("chf-")).map((k) => caches.delete(k)));
      await self.registration.unregister();
    })(),
  );
});
