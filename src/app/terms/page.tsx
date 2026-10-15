import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_LAST_UPDATED, OPERATOR } from "@/config/legal";
import { ContentPage, OnThisPage } from "@/components/content/content-page";

// NOTE: Plain-English starting point. Have a Nigerian lawyer review this page before scaling
// (see src/config/legal.ts).

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The rules for using CustomerHowFar: what we do, what customers and business owners agree to, listing fees, reviews and how to contact us.",
  alternates: { canonical: "/terms" },
};

const SECTIONS = [
  { id: "about", label: "What CustomerHowFar is" },
  { id: "accounts", label: "Your account" },
  { id: "customers", label: "If you are a customer" },
  { id: "owners", label: "If you list a business" },
  { id: "listing-rules", label: "Listing rules" },
  { id: "listing-fee", label: "The listing fee" },
  { id: "id-badge", label: "The “ID submitted” badge" },
  { id: "reviews", label: "Reviews" },
  { id: "suspension", label: "Suspension and deletion" },
  { id: "liability", label: "Our liability" },
  { id: "law", label: "Governing law" },
  { id: "changes", label: "Changes to these terms" },
  { id: "contact", label: "Contact us" },
];

export default function TermsPage() {
  return (
    <ContentPage
      title="Terms of Service"
      updated={LEGAL_LAST_UPDATED}
      intro={
        <p>
          These terms explain the rules for using CustomerHowFar. Please read them. By creating an
          account or using the site, you agree to them.
        </p>
      }
    >
      <p>
        CustomerHowFar is operated by {OPERATOR.operatedBy}, {OPERATOR.location} (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;). You can reach us at{" "}
        <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
      </p>
      <OnThisPage items={SECTIONS} />

      <h2 id="about">1. What CustomerHowFar is</h2>
      <p>
        CustomerHowFar is an online directory. It helps customers find artisans and businesses in
        Nigeria, see their work, and contact them directly by WhatsApp, phone or email.
      </p>
      <ul>
        <li>
          <strong>We are not a party to any deal</strong> between a customer and a business. Any
          agreement about work, prices, deposits, delivery or refunds is only between you and the
          business.
        </li>
        <li>
          <strong>We do not employ the businesses</strong> listed and we do not guarantee their
          work, prices, availability, qualifications or honesty.
        </li>
        <li>We do not handle payments between customers and businesses.</li>
      </ul>

      <h2 id="accounts">2. Your account</h2>
      <ul>
        <li>You must be at least 18 years old to create an account.</li>
        <li>Give true information and keep it up to date.</li>
        <li>
          Keep your password private. You are responsible for what happens on your account. Tell us
          straight away if you think someone else has used it.
        </li>
        <li>
          One person, one account. Don&apos;t create accounts for other people without their
          permission.
        </li>
      </ul>

      <h2 id="customers">3. If you are a customer</h2>
      <ul>
        <li>
          Check a business carefully before you pay or hand over anything valuable. Agree the price
          and the work in writing (for example on WhatsApp). Read our{" "}
          <Link href="/safety">safety tips</Link>.
        </li>
        <li>Be honest and respectful when you contact businesses and when you write reviews.</li>
        <li>
          Don&apos;t use contact details from CustomerHowFar to send spam or for any unlawful
          purpose.
        </li>
      </ul>

      <h2 id="owners">4. If you list a business</h2>
      <ul>
        <li>You must own the business or be allowed to list it.</li>
        <li>
          Everything in your listing must be true and up to date: name, services, location, opening
          hours and contact details.
        </li>
        <li>
          Photos must show <strong>your own work</strong>. Don&apos;t use photos you found online or
          that belong to someone else.
        </li>
        <li>
          Treat customers fairly, do the work you agree to, and follow Nigerian law, including
          consumer protection law.
        </li>
        <li>
          You give us permission to show your listing, photos and reviews on CustomerHowFar and to
          use them to promote the site (for example in search results and social media previews).
          You keep ownership of your content.
        </li>
      </ul>

      <h2 id="listing-rules">5. Listing rules and prohibited content</h2>
      <p>Every listing is checked by our team before it goes live. We don&apos;t allow:</p>
      <ul>
        <li>Fake businesses, false claims, or impersonating another person or business.</li>
        <li>Illegal goods or services, or anything that encourages crime or violence.</li>
        <li>Sexual content, hate speech, or content that harasses or threatens anyone.</li>
        <li>Photos or text you don&apos;t have the right to use.</li>
        <li>
          Misleading prices, &ldquo;advance fee&rdquo; offers, or requests for payment for jobs or
          loans.
        </li>
        <li>Wrong phone numbers or contact details that don&apos;t belong to the business.</li>
      </ul>
      <p>
        We may refuse, ask you to change, hide or remove any listing that breaks these rules or that
        we reasonably believe may harm customers.
      </p>

      <h2 id="listing-fee">6. The listing fee</h2>
      <ul>
        <li>
          We may charge a one-time listing fee. The amount is shown before you pay. When the fee is
          switched off, listing is free.
        </li>
        <li>
          The fee pays for our team to <strong>review your listing</strong>. It is not a payment for
          customers, rankings or guaranteed results.
        </li>
        <li>
          <strong>Once your listing is approved, the fee is not refundable</strong>, including if
          you later delete the listing or it is suspended for breaking these terms.
        </li>
        <li>
          If your listing is not approved and you decide not to fix and resubmit it, you can ask for
          a refund. Refunds in that case are at our team&apos;s discretion. Email{" "}
          <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a> with your payment reference.
        </li>
        <li>
          If you pay by bank transfer, upload a clear proof of payment. We confirm payments manually
          and may reject a proof we can&apos;t match to money received.
        </li>
        <li>If you have already paid for a listing, you won&apos;t be charged again for it.</li>
      </ul>

      <h2 id="id-badge">7. The &ldquo;ID submitted&rdquo; badge</h2>
      <p>
        Business owners can share a photo of a government ID and a selfie holding it. Our team
        reviews them. When the check is accepted, the owner&apos;s listings show an &ldquo;ID
        submitted&rdquo; badge.
      </p>
      <p>
        <strong>This is not an official government verification</strong> and it is not a guarantee
        of the owner&apos;s honesty or the quality of their work. We don&apos;t check ID numbers
        against government records. Always take normal care before paying anyone.
      </p>

      <h2 id="reviews">8. Reviews</h2>
      <ul>
        <li>
          You can review a business after contacting it through CustomerHowFar while logged in. You
          can&apos;t review your own business, and you can write one review per business (you can
          edit or delete it).
        </li>
        <li>
          Reviews must be honest and based on your own experience. Don&apos;t post fake reviews,
          reviews you were paid for, offensive content, or personal information about anyone.
        </li>
        <li>Business owners can post one public reply to each review. Keep it polite.</li>
        <li>
          Anyone logged in can report a review. Our team may hide reviews that break these rules.
          Hidden reviews don&apos;t count towards a business&apos;s rating.
        </li>
        <li>Reviews are the opinions of the people who wrote them, not of CustomerHowFar.</li>
      </ul>

      <h2 id="suspension">9. Suspension and deletion</h2>
      <ul>
        <li>
          We may suspend a listing or an account if we reasonably believe it breaks these terms,
          misleads customers, or puts people at risk. A suspended account can&apos;t log in and its
          listings are hidden. We will tell you the reason by email.
        </li>
        <li>
          You can delete a listing at any time from your dashboard, and delete your account from
          your account page (&ldquo;Delete my account&rdquo;). See our{" "}
          <Link href="/privacy">Privacy Policy</Link> for what is deleted and what we must keep
          (anonymous payment records).
        </li>
        <li>
          If you think we made a mistake, <Link href="/contact">contact us</Link> and we will look
          again.
        </li>
      </ul>

      <h2 id="liability">10. Our liability</h2>
      <ul>
        <li>
          CustomerHowFar is provided &ldquo;as is&rdquo;. We work hard to keep it accurate and
          available, but we can&apos;t promise it will always be error-free or online.
        </li>
        <li>
          Because we are not a party to deals between customers and businesses, we are not
          responsible for any loss, damage, injury or dispute that comes from them, including poor
          work, non-delivery, or money paid to a business.
        </li>
        <li>
          As far as the law allows, our total liability to you for anything related to
          CustomerHowFar is limited to the listing fee you paid us in the 12 months before the claim
          (or ₦10,000 if you paid nothing).
        </li>
        <li>
          Nothing in these terms limits liability that can&apos;t be limited under Nigerian law, or
          your rights as a consumer.
        </li>
      </ul>

      <h2 id="law">11. Governing law</h2>
      <p>
        These terms are governed by the laws of the Federal Republic of Nigeria. If we can&apos;t
        settle a disagreement with you informally, it will be decided by the courts of Lagos State,
        Nigeria.
      </p>

      <h2 id="changes">12. Changes to these terms</h2>
      <p>
        We may update these terms as the service grows. We will change the &ldquo;Last
        updated&rdquo; date above and, for important changes, tell account holders by email or on
        the site. If you keep using CustomerHowFar after a change, you accept the new terms.
      </p>

      <h2 id="contact">13. Contact us</h2>
      <p>
        {OPERATOR.name} (operated by {OPERATOR.operatedBy}), {OPERATOR.location}. Email:{" "}
        <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>, or use our{" "}
        <Link href="/contact">contact form</Link>.
      </p>
    </ContentPage>
  );
}
