import Link from "next/link";
import { cacheLife } from "next/cache";
import { FOOTER_NAV } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { Container } from "@/components/ui/container";
import { Logo } from "./logo";

async function CopyrightYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-gray-950 text-gray-300">
      <Container className="py-12">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_2fr]">
          <div className="max-w-sm">
            <Logo inverse />
            <p className="mt-4 text-sm leading-6 text-gray-400">{siteConfig.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {FOOTER_NAV.map((section) => (
              <nav key={section.title} aria-label={section.title}>
                <h2 className="text-sm font-semibold text-white">{section.title}</h2>
                <ul className="mt-3 space-y-1">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
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

        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-sm text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; <CopyrightYear /> {siteConfig.name}. All rights reserved.
          </p>
          <p>
            Made in Nigeria{" "}
            <span role="img" aria-label="Nigerian flag">
              🇳🇬
            </span>
          </p>
        </div>
      </Container>
    </footer>
  );
}
