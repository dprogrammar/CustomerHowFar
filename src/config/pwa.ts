// App installation (PWA) switch.
//
// OFF for now: some Android browsers package installable sites into an APK that Google Play
// Protect flags as an "Unsafe app", which alarms users. While this is false:
// - the web manifest uses "display": "browser", so no browser treats the site as installable
//   (icons, name and theme colour are kept for tabs and bookmarks);
// - there is no install prompt and no iOS "web app" mode;
// - /sw.js is a clean-up worker that removes any service worker and caches installed by
//   earlier versions, and the page also unregisters old workers on load.
//
// To re-enable installation as a proper project later, see pwa/README.md.
export const APP_INSTALL_ENABLED = false;
