# App installation (PWA) — currently disabled

CustomerHowFar is a mobile-responsive web app only for now. Installation was switched off
because some Android browsers package installable sites into an APK that Google Play Protect
blocks as an "Unsafe app".

The switch is `APP_INSTALL_ENABLED` in `src/config/pwa.ts`. While it is `false`:

- `src/app/manifest.ts` uses `"display": "browser"` (not installable), without shortcuts;
- `src/components/layout/pwa.tsx` renders `ServiceWorkerCleanup`, which unregisters old service
  workers and deletes their caches on page load;
- `public/sw.js` is a clean-up worker that deletes the old caches and unregisters itself;
- the root layout doesn't declare iOS "web app" mode (`appleWebApp`).

## Files kept for later

- `pwa/sw-caching.js` — the previous service worker (caches only hashed static assets and icons,
  shows an offline page, never caches pages, API responses or personal data).
- `pwa/offline.html` — the offline page it served.
- `public/icons/*` — the app icons (still used by the manifest and bookmarks).
- `InstallPrompt` and `ServiceWorkerRegistration` in `src/components/layout/pwa.tsx`.

## Re-enabling (as a proper project)

1. Decide on distribution first (e.g. a Trusted Web Activity published to Google Play under our
   own developer account, so Android users get a signed, trusted app instead of a browser-made APK).
2. Move `pwa/sw-caching.js` back to `public/sw.js` and `pwa/offline.html` to `public/offline.html`
   (bump the cache `VERSION` in the worker).
3. Set `APP_INSTALL_ENABLED = true`, then add the `/help` instructions for Android and iPhone.
4. Run the PWA checks in the hardening test suite (installability, offline page, cache contents).
