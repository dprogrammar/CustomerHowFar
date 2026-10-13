import type { MetadataRoute } from "next";
import { APP_INSTALL_ENABLED } from "@/config/pwa";
import { siteConfig } from "@/config/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: siteConfig.name,
    short_name: "HowFar",
    description: siteConfig.description,
    lang: "en-NG",
    start_url: "/",
    scope: "/",
    // "browser" means "not installable": no install prompt or Android APK. Name, icons and theme
    // colour still look good in tabs and bookmarks. See src/config/pwa.ts.
    display: APP_INSTALL_ENABLED ? "standalone" : "browser",
    ...(APP_INSTALL_ENABLED ? { orientation: "portrait" as const } : {}),
    background_color: "#ffffff",
    theme_color: "#008751",
    categories: ["business", "lifestyle", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    ...(APP_INSTALL_ENABLED
      ? {
          shortcuts: [
            { name: "Find a business", short_name: "Search", url: "/search" },
            { name: "My businesses", short_name: "My businesses", url: "/dashboard" },
          ],
        }
      : {}),
  };
}
