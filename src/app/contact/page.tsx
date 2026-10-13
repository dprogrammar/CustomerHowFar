import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MapPin } from "lucide-react";
import { OPERATOR } from "@/config/legal";
import { ContactForm } from "@/components/content/contact-form";
import { ContentPage } from "@/components/content/content-page";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Questions, problems or ideas? Send the CustomerHowFar team a message.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <ContentPage
      title="Contact us"
      intro={
        <p>
          Questions, problems or ideas? Send us a message. To report a business, use{" "}
          <strong>Report this business</strong> on its page, so we can see which listing you mean.
        </p>
      }
    >
      <div className="not-prose !mt-6 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="rounded-xl border border-border bg-white p-4 sm:p-6">
          <h2 className="!mt-0 !text-lg">Send a message</h2>
          <div className="mt-4">
            <ContactForm />
          </div>
        </div>
        <aside className="space-y-4 text-sm">
          <div className="rounded-xl bg-surface p-4">
            <p className="flex items-center gap-2 font-semibold text-gray-900">
              <Mail aria-hidden="true" className="size-4" />
              Email
            </p>
            <p className="!mt-1">
              <a href={`mailto:${OPERATOR.email}`} className="break-all">
                {OPERATOR.email}
              </a>
            </p>
          </div>
          <div className="rounded-xl bg-surface p-4">
            <p className="flex items-center gap-2 font-semibold text-gray-900">
              <MapPin aria-hidden="true" className="size-4" />
              Based in
            </p>
            <p className="!mt-1">{OPERATOR.location}</p>
          </div>
          <p className="!mt-0 text-gray-700">
            Quick answers are in our <Link href="/help">Help centre</Link>.
          </p>
        </aside>
      </div>
    </ContentPage>
  );
}
