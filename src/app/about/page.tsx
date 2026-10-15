import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, MessageCircle, Search, Store } from "lucide-react";
import { ContentPage } from "@/components/content/content-page";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About us",
  description:
    "CustomerHowFar helps Nigerian artisans and businesses get found and trusted, and helps customers find reliable help near them.",
  alternates: { canonical: "/about" },
};

const VALUES = [
  {
    icon: Search,
    title: "Easy to find",
    text: "Search by service and area, from Lagos to Kano, and see real work before you call.",
  },
  {
    icon: BadgeCheck,
    title: "Built on trust",
    text: "Every listing is reviewed by our team. Reviews come only from people who contacted the business through us.",
  },
  {
    icon: MessageCircle,
    title: "Direct contact",
    text: "Talk to the business yourself on WhatsApp or by phone. No middlemen, and it's free to use.",
  },
];

export default function AboutPage() {
  return (
    <ContentPage
      title="About CustomerHowFar"
      intro={
        <p>
          &ldquo;Customer, how far?&rdquo; is how many Nigerian artisans greet the people they
          serve. We built CustomerHowFar so that more customers can say hello to the right business,
          and so good businesses get the customers they deserve.
        </p>
      }
    >
      <h2 id="story">Our story</h2>
      <p>
        Across Nigeria, millions of skilled tailors (Fashion Designers), electricians, plumbers, mechanics, caterers,
        hairstylists and other artisans do excellent work, but most customers only find them by word
        of mouth. Meanwhile, people looking for help often don&apos;t know who to trust, and many
        have been disappointed by someone they found online.
      </p>
      <p>
        CustomerHowFar brings the two together: a simple, trusted directory where businesses show
        real photos of their work, and customers can contact them directly.
      </p>

      <h2 id="mission">Our mission</h2>
      <ul>
        <li>
          <strong>For artisans and businesses:</strong> help you get found, look professional and
          build a reputation that follows you, even if you don&apos;t have a website.
        </li>
        <li>
          <strong>For customers:</strong> help you find reliable help near you, see their work and
          what others say, and contact them in one tap.
        </li>
      </ul>

      <ul className="not-prose !mt-8 grid !list-none grid-cols-1 gap-4 !space-y-0 !pl-0 sm:grid-cols-3">
        {VALUES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="rounded-xl border border-border bg-surface p-4">
            <Icon aria-hidden="true" className="size-6 text-brand-700" />
            <p className="!mt-2 font-semibold text-gray-900">{title}</p>
            <p className="!mt-1 text-sm leading-6 text-gray-700">{text}</p>
          </li>
        ))}
      </ul>

      <h2 id="who">Who we are</h2>
      <p>
        CustomerHowFar is a small Nigerian team based in Lagos. We&apos;re building it carefully,
        one trusted listing at a time. We&apos;d love to hear from you: questions, ideas and
        complaints all help us improve. <Link href="/contact">Contact us</Link>.
      </p>

      <div className="!mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/search"
          className={buttonVariants({ size: "lg", className: "!text-white !no-underline" })}
        >
          <Search aria-hidden="true" />
          Find a business
        </Link>
        <Link
          href="/business/new"
          className={buttonVariants({
            variant: "outline",
            size: "lg",
            className: "!text-gray-900 !no-underline",
          })}
        >
          <Store aria-hidden="true" />
          List your business
        </Link>
      </div>
    </ContentPage>
  );
}
