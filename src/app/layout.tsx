import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { getSiteUrl, siteConfig } from "@/config/site";
import { Suspense } from "react";
import { preconnect } from "react-dom";
import { ChatLauncher } from "@/components/assistant/chat-launcher";
import { BottomNav, BottomNavView } from "@/components/layout/bottom-nav";
import { PageTracker } from "@/components/layout/page-tracker";
import { PwaSupport } from "@/components/layout/pwa";
import { APP_INSTALL_ENABLED } from "@/config/pwa";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: `${siteConfig.name} - Find trusted artisans and businesses near you`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [...siteConfig.keywords],
  applicationName: siteConfig.name,
  // iOS "web app" mode only when installation is enabled (src/config/pwa.ts).
  ...(APP_INSTALL_ENABLED
    ? { appleWebApp: { capable: true, title: "HowFar", statusBarStyle: "default" as const } }
    : {}),
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    locale: siteConfig.locale,
    title: `${siteConfig.name} - Find trusted artisans and businesses near you`,
    description: siteConfig.description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} - Find trusted artisans and businesses near you`,
    description: siteConfig.description,
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#008751",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Most pages show Cloudinary images first: open that connection early on slow networks.
  preconnect("https://res.cloudinary.com");
  return (
    <html lang="en-NG" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col pb-[calc(var(--spacing-bottom-nav)+env(safe-area-inset-bottom))] md:pb-0">
        <a
          href="#main-content"
          className="sr-only z-50 rounded-md bg-brand-700 px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <SiteFooter />
        <Suspense fallback={<BottomNavView pathname={null} />}>
          <BottomNav />
        </Suspense>
        {/* Help chat button; the chat itself loads only when tapped. Hidden on admin pages (CSS). */}
        <Suspense fallback={null}>
          <ChatLauncher />
        </Suspense>
        <PwaSupport />
        {/* Anonymous page-view count, sent after load (see src/lib/analytics). */}
        <Suspense fallback={null}>
          <PageTracker />
        </Suspense>
      </body>
    </html>
  );
}
