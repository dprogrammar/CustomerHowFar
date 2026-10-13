import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { OPERATOR } from "@/config/legal";
import { ContentPage } from "@/components/content/content-page";
import { OpenHashDetails } from "@/components/content/open-hash-details";

export const metadata: Metadata = {
  title: "Help centre",
  description:
    "Answers for customers and businesses: finding and contacting businesses, staying safe, listing your business, the review process, the listing fee and the ID check.",
  alternates: { canonical: "/help" },
};

type Faq = { id: string; q: string; a: ReactNode };

const CUSTOMER_FAQS: Faq[] = [
  {
    id: "find",
    q: "How do I find a business?",
    a: (
      <p>
        Use the search bar at the top of every page: type what you need (for example
        &ldquo;tailor&rdquo; or &ldquo;AC repair&rdquo;) and choose your state and area. You can
        also browse by <Link href="/categories">category</Link>. Sort by &ldquo;Highest rated&rdquo;
        to see businesses with the best reviews first.
      </p>
    ),
  },
  {
    id: "contact-business",
    q: "How do I contact a business?",
    a: (
      <p>
        Open the business&apos;s page and tap <strong>Chat on WhatsApp</strong>,{" "}
        <strong>Call</strong> or <strong>Email</strong>. You talk to the business directly; we
        don&apos;t charge you anything. Tip: log in first, so you can leave a review afterwards.
      </p>
    ),
  },
  {
    id: "id-submitted",
    q: "What does “ID submitted” mean?",
    a: (
      <>
        <p>
          The business owner shared a photo of a government ID and a selfie holding it, and our team
          checked them visually.
        </p>
        <p>
          It is <strong>not</strong> an official government verification, and it doesn&apos;t
          guarantee the quality of their work. It&apos;s one helpful sign, not a promise.
        </p>
      </>
    ),
  },
  {
    id: "stay-safe",
    q: "How do I stay safe?",
    a: (
      <ul>
        <li>Meet in a public place, or have someone with you when a worker comes to your home.</li>
        <li>
          Never pay the full price upfront to a business you don&apos;t know. Agree a small deposit
          for materials, and pay the rest when the work is done.
        </li>
        <li>Agree the price and the job in writing, for example on WhatsApp.</li>
        <li>Report anything suspicious using &ldquo;Report this business&rdquo; on the listing.</li>
        <li>
          Read our full <Link href="/safety">safety tips</Link>.
        </li>
      </ul>
    ),
  },
  {
    id: "reviews-help",
    q: "How do reviews work?",
    a: (
      <p>
        To keep reviews genuine, you can review a business after contacting it through
        CustomerHowFar while logged in, with a confirmed email. You can edit or delete your review
        any time. If a review looks fake or offensive, tap &ldquo;Report&rdquo; under it.
      </p>
    ),
  },
  {
    id: "report-a-problem",
    q: "How do I report a problem?",
    a: (
      <p>
        To report a business, use <strong>Report this business</strong> at the bottom of its page
        (you need to be logged in). For anything else, a bug or a question,{" "}
        <Link href="/contact">contact us</Link> or email{" "}
        <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
      </p>
    ),
  },
];

const BUSINESS_FAQS: Faq[] = [
  {
    id: "how-to-list",
    q: "How do I list my business?",
    a: (
      <>
        <p>
          Create a free account, then tap <Link href="/business/new">List your business</Link>. It
          takes about 5 minutes and has five short steps: basics, location, about, photos and
          review.
        </p>
        <p>
          Clear photos of your own work make the biggest difference. You can list up to 5
          businesses.
        </p>
      </>
    ),
  },
  {
    id: "review-process",
    q: "What happens after I submit?",
    a: (
      <p>
        Our team checks every listing before it goes live, usually within 1 to 2 working days. We
        check that the details are complete, the photos are real work and the phone number works. We
        email you when your listing is live, or tell you what to fix.
      </p>
    ),
  },
  {
    id: "listing-fee",
    q: "Is there a listing fee? How do I pay?",
    a: (
      <>
        <p>
          When the listing fee is switched on, you pay a one-time fee before your listing is
          reviewed. The amount is shown on the payment page. When it&apos;s off, listing is free.
        </p>
        <p>
          You pay by <strong>bank transfer</strong>: we show our bank details and a reference. Put
          the reference in your transfer narration, then upload a screenshot or photo of your
          receipt. Our team confirms it, usually within 1 working day.
        </p>
        <p>
          The fee is for reviewing your listing and isn&apos;t refundable once your listing is
          approved. See our <Link href="/terms#listing-fee">Terms of Service</Link> for details. You
          will never pay twice for the same listing.
        </p>
      </>
    ),
  },
  {
    id: "id-check",
    q: "Why do you ask for my ID and a selfie?",
    a: (
      <p>
        To keep CustomerHowFar safe and trusted. Our team needs to check your ID visually before
        your listing can be approved. Only our admin team sees the photos, we never ask for your ID
        number, and the photos are deleted 90 days after our review. Start from{" "}
        <Link href="/account/verify-identity">Verify your identity</Link>.
      </p>
    ),
  },
  {
    id: "edit-delete",
    q: "How do I edit or delete my listing?",
    a: (
      <p>
        Go to <Link href="/dashboard">My businesses</Link>. Tap <strong>Edit</strong> to change your
        details or photos; changes to a live listing show straight away. Tap{" "}
        <strong>Delete business</strong> to remove it (you&apos;ll type the business name to
        confirm). To close your whole account, use &ldquo;Delete my account&rdquo; on your{" "}
        <Link href="/account">account page</Link>.
      </p>
    ),
  },
  {
    id: "rejected",
    q: "Why was my listing rejected?",
    a: (
      <>
        <p>
          We&apos;ll always tell you why by email and on your dashboard. Common reasons: unclear
          photos or photos that aren&apos;t your own work, a phone number we couldn&apos;t reach, a
          short description, the wrong category, or an incomplete address.
        </p>
        <p>
          Fix the issue and tap <strong>Resubmit</strong>. If you already paid, you won&apos;t be
          charged again.
        </p>
      </>
    ),
  },
  {
    id: "reply-reviews",
    q: "Can I reply to reviews?",
    a: (
      <p>
        Yes. Open your listing while logged in and tap <strong>Reply</strong> under any review. You
        can post one public reply per review and edit it later. If a review breaks our rules, report
        it and our team will check it.
      </p>
    ),
  },
];

function FaqList({ items }: { items: Faq[] }) {
  return (
    <div className="!mt-4 divide-y divide-border rounded-xl border border-border bg-white">
      {items.map((f) => (
        <details key={f.id} id={f.id} className="group scroll-mt-24 px-4">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
            {f.q}
            <ChevronDown
              aria-hidden="true"
              className="size-5 shrink-0 text-gray-500 transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="pb-4 [&>*:first-child]:!mt-0">{f.a}</div>
        </details>
      ))}
    </div>
  );
}

export default function HelpPage() {
  return (
    <ContentPage
      title="Help centre"
      intro={
        <p>
          Quick answers for customers and businesses. Can&apos;t find what you need?{" "}
          <Link href="/contact" className="font-medium text-brand-700 underline">
            Contact us
          </Link>
          .
        </p>
      }
    >
      <nav aria-label="Help sections" className="!mt-4 flex flex-wrap gap-2">
        <a
          href="#for-customers"
          className="rounded-full bg-brand-50 px-4 py-2 text-sm !no-underline ring-1 ring-brand-200"
        >
          For customers
        </a>
        <a
          href="#for-businesses"
          className="rounded-full bg-brand-50 px-4 py-2 text-sm !no-underline ring-1 ring-brand-200"
        >
          For businesses
        </a>
      </nav>
      <OpenHashDetails />
      <h2 id="for-customers">For customers</h2>
      <FaqList items={CUSTOMER_FAQS} />
      <h2 id="for-businesses">For businesses</h2>
      <FaqList items={BUSINESS_FAQS} />
    </ContentPage>
  );
}
