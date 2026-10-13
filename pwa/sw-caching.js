/* CustomerHowFar service worker.
 *
 * Deliberately minimal and privacy-safe:
 * - Caches ONLY static build assets (/_next/static/*, hashed and immutable) and app icons, so
 *   repeat visits load faster on slow connections.
 * - Pages are always fetched from the network and NEVER cached (so logged-in pages, admin pages
 *   and personal data never end up in the cache). If the network is down, a friendly offline
 *   page is shown instead.
 * - API calls, server actions, uploads and cross-origin requests are not touched at all.
 */
const VERSION = "v1";
const STATIC_CACHE = `chf-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("chf-") && k !== STATIC_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Page loads: network only; offline page when the network is unavailable.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r || new Response("You're offline", { status: 503 })),
      ),
    );
    return;
  }

  // Hashed build assets and icons: cache first (they never change at the same URL).
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ||
            fetch(request).then((response) => {
              if (response.ok && response.type === "basic") cache.put(request, response.clone());
              return response;
            }),
        ),
      ),
    );
  }
  // Everything else (API, RSC payloads, images from Cloudinary...) goes straight to the network.
});
