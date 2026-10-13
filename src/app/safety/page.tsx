import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/content/content-page";

export const metadata: Metadata = {
  title: "Stay safe",
  description:
    "Simple tips to stay safe when hiring an artisan or business you found on CustomerHowFar.",
  alternates: { canonical: "/safety" },
};

export default function SafetyPage() {
  return (
    <ContentPage
      title="Stay safe"
      intro={
        <p>
          Most businesses on CustomerHowFar are honest and hard-working. These simple habits protect
          you from the few who aren&apos;t.
        </p>
      }
    >
      <h2 id="before">Before you agree</h2>
      <ul>
        <li>
          <strong>Look at their work and reviews.</strong> Real photos, honest reviews and a
          complete profile are good signs.
        </li>
        <li>
          <strong>Talk to them first.</strong> Ask questions on WhatsApp or by phone. Be careful if
          they rush you or won&apos;t answer clearly.
        </li>
        <li>
          <strong>Agree the price and the job in writing</strong>, for example in a WhatsApp
          message: what will be done, by when and for how much.
        </li>
        <li>
          <strong>&ldquo;ID submitted&rdquo; is a helpful sign, not a guarantee.</strong> It means
          our team visually checked the owner&apos;s ID and selfie. It is not an official government
          verification.
        </li>
      </ul>

      <h2 id="paying">Paying</h2>
      <ul>
        <li>
          <strong>Never pay the full price upfront</strong> to a business you don&apos;t know. Agree
          a small deposit for materials and pay the rest when the work is done.
        </li>
        <li>
          Pay to an account in the business or owner&apos;s name. Be careful if they ask you to pay
          a different person.
        </li>
        <li>Keep receipts and screenshots of your messages.</li>
        <li>
          Be very careful with offers that look too good to be true, or with anyone who asks for
          &ldquo;registration&rdquo;, &ldquo;clearing&rdquo; or other fees before doing any work.
        </li>
      </ul>

      <h2 id="meeting">Meeting and home visits</h2>
      <ul>
        <li>Meet in a public place when you can, especially the first time.</li>
        <li>When someone comes to your home, have a friend or family member with you.</li>
        <li>
          Don&apos;t leave valuables lying around, and don&apos;t share your bank details or PINs.
        </li>
        <li>Trust your instincts. If something feels wrong, stop.</li>
      </ul>

      <h2 id="report">If something goes wrong</h2>
      <ul>
        <li>
          Tap <strong>Report this business</strong> at the bottom of the listing. Our team checks
          every report and can suspend listings and accounts.
        </li>
        <li>
          If you&apos;ve lost money or been threatened, report it to the police. Your bank can also
          help if you act quickly.
        </li>
        <li>
          Questions? <Link href="/contact">Contact us</Link>.
        </li>
      </ul>
      <p>
        Remember: CustomerHowFar is a directory. Deals are between you and the business. See our{" "}
        <Link href="/terms">Terms of Service</Link>.
      </p>
    </ContentPage>
  );
}
