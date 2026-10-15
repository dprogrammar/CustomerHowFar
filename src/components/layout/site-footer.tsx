import Link from "next/link";
import { cacheLife } from "next/cache";
import { FOOTER_NAV } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { isListingFeeOn } from "@/lib/payments/fee-switch";
import { Container } from "@/components/ui/container";
import { Logo } from "./logo";

const DEVELOPER_MAILTO = `mailto:dprogrammar@gmail.com?subject=${encodeURIComponent(
  "Website/App project enquiry (via CustomerHowFar)",
)}`;

async function CopyrightYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

export async function SiteFooter() {
  // While listing is free, fee links are hidden (the switch is cached and tagged).
  const feeOn = await isListingFeeOn();
  return (
    <footer className="border-t border-border bg-gray-950 text-gray-300">
      <Container className="py-12">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.2fr_2fr]">
          <div className="max-w-sm">
            <Logo inverse />
            <p className="mt-4 text-sm leading-6 text-gray-400">{siteConfig.footerDescription}</p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {FOOTER_NAV.map((section) => (
              <nav key={section.title} aria-label={section.title}>
                <h2 className="text-sm font-semibold text-white">{section.title}</h2>
                <ul className="mt-3 space-y-1">
                  {section.links
                    .filter((link) => feeOn || !link.feeOnly)
                    .map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          prefetch={false}
                          className="inline-block rounded py-1.5 text-sm text-gray-400 hover:text-white"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        {/* Phones and tablets: stacked and centred. Desktop: one line, copyright on the left. */}
        <div className="mt-10 flex flex-col items-center gap-2 border-t border-white/10 pt-6 text-center text-sm text-gray-400 lg:flex-row lg:justify-between lg:text-left">
          <p>
            &copy; <CopyrightYear /> {siteConfig.name}. All rights reserved.
          </p>
          <div className="flex flex-col items-center gap-x-2 gap-y-2 lg:flex-row">
            <p>
              Designed &amp; built by{" "}
              <strong className="font-semibold text-accent-300">Dprogrammar</strong>
              <span aria-hidden="true"> · </span>
              <a
                href={DEVELOPER_MAILTO}
                aria-label="Email Dprogrammar at dprogrammar@gmail.com"
                className="rounded text-gray-300 underline underline-offset-2 hover:text-white"
              >
                dprogrammar@gmail.com
              </a>
            </p>
            <span aria-hidden="true" className="hidden lg:inline">
              ·
            </span>
            <p>
              Made in Nigeria{" "}
              <span role="img" aria-label="Nigerian flag">
                🇳🇬
              </span>
            </p>
          </div>
        </div>
      </Container>
    </footer>
  );
}
