import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_LAST_UPDATED, OPERATOR } from "@/config/legal";
import { ContentPage, OnThisPage } from "@/components/content/content-page";

// NOTE: Plain-English starting point aligned with the Nigeria Data Protection Act 2023. Have a
// Nigerian lawyer review this page before scaling (see src/config/legal.ts). Keep it in sync
// with what the app actually does (retention periods, providers, cookies).

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What personal data CustomerHowFar collects, why, who can see it, how long we keep it, and your rights under the Nigeria Data Protection Act 2023.",
  alternates: { canonical: "/privacy" },
};

const SECTIONS = [
  { id: "who-we-are", label: "Who we are" },
  { id: "what-we-collect", label: "What we collect" },
  { id: "why", label: "Why we use it" },
  { id: "legal-bases", label: "Legal bases" },
  { id: "who-sees", label: "Who can see what" },
  { id: "providers", label: "Service providers" },
  { id: "transfers", label: "International transfers" },
  { id: "retention", label: "How long we keep it" },
  { id: "rights", label: "Your rights" },
  { id: "cookies", label: "Cookies" },
  { id: "security", label: "Security" },
  { id: "children", label: "Children" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact and complaints" },
];

export default function PrivacyPage() {
  return (
    <ContentPage
      title="Privacy Policy"
      updated={LEGAL_LAST_UPDATED}
      intro={
        <p>
          This policy explains what personal data we collect, why, who can see it, how long we keep
          it and your rights. We follow the Nigeria Data Protection Act 2023 (NDPA).
        </p>
      }
    >
      <OnThisPage items={SECTIONS} />

      <h2 id="who-we-are">1. Who we are</h2>
      <p>
        CustomerHowFar is operated by {OPERATOR.operatedBy}, {OPERATOR.location}. We are the
        &ldquo;data controller&rdquo; for the personal data described here. Contact:{" "}
        <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
      </p>

      <h2 id="what-we-collect">2. What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your name, email address, password (stored securely by
          our login provider; we never see it) and, if you add it, your phone number.
        </li>
        <li>
          <strong>Business details:</strong> business name, category, description, services, phone
          and WhatsApp numbers, email, address, area, opening hours and social links. These are
          published on your listing.
        </li>
        <li>
          <strong>Photos:</strong> your logo, cover photo and photos of your work. These are public.
        </li>
        <li>
          <strong>ID and selfie images</strong> (business owners who complete the ID check): a photo
          of your government ID, an optional back photo, a selfie holding the ID, the ID type and
          the name as typed from the ID. <strong>We never ask for or store ID numbers.</strong>
        </li>
        <li>
          <strong>Payment proofs</strong> (if you pay by bank transfer): the receipt you upload, the
          name and bank you paid from, the amount and date.
        </li>
        <li>
          <strong>Contact click analytics:</strong> when someone taps WhatsApp, Call or Email on a
          listing we record the business, the type of contact and the time, and your account if you
          are logged in. We also count page views (numbers only).
        </li>
        <li>
          <strong>Reviews and reports</strong> you write, and <strong>messages</strong> you send us
          through the contact form.
        </li>
        <li>
          <strong>Waitlist sign-ups:</strong> if you ask us to email you when we launch in your
          state, we keep your email, your state, whether you&apos;re a customer or a business, your
          name if you give it, and when you agreed.
        </li>
        <li>
          <strong>Technical data:</strong> our hosting provider keeps short-lived server logs. To
          stop abuse (for example contact form spam) we store a one-way scrambled version of your IP
          address for up to two days.
        </li>
      </ul>

      <h2 id="why">3. Why we use it</h2>
      <ul>
        <li>To create and run your account and let you log in.</li>
        <li>To publish business listings and help customers find and contact businesses.</li>
        <li>To review listings before they go live and keep the site safe from scams.</li>
        <li>
          To check business owners&apos; ID and selfie visually (the &ldquo;ID submitted&rdquo;
          badge).
        </li>
        <li>To confirm listing fee payments and keep accounting records.</li>
        <li>To show genuine reviews and act on reports.</li>
        <li>
          To send you emails about your account and listings (for example, approval or a new
          review).
        </li>
        <li>To show business owners how many people viewed and contacted them.</li>
        <li>
          To email you once when we launch in your state, if you joined the waitlist, and to see
          which states people are waiting for.
        </li>
      </ul>
      <p>We don&apos;t sell your personal data and we don&apos;t show third-party adverts.</p>

      <h2 id="legal-bases">4. Legal bases</h2>
      <ul>
        <li>
          <strong>Contract:</strong> to provide the service you signed up for (accounts, listings,
          payments, emails about them).
        </li>
        <li>
          <strong>Consent:</strong> for the ID and selfie check. You give it with a checkbox before
          you submit, and you can withdraw it by withdrawing your submission or deleting your
          account.
        </li>
        <li>
          <strong>Consent:</strong> for the waitlist. You tick a box when you join, and every
          waitlist email has an unsubscribe link.
        </li>
        <li>
          <strong>Legitimate interests:</strong> to keep the site safe and trusted (moderation,
          reports, fraud prevention, rate limits) and to provide simple usage statistics.
        </li>
        <li>
          <strong>Legal obligation:</strong> to keep financial records of payments.
        </li>
      </ul>

      <h2 id="who-sees">5. Who can see what</h2>
      <ul>
        <li>
          <strong>Everyone:</strong> approved business listings, their photos, published reviews
          (with the reviewer&apos;s first name and last initial) and owners&apos; replies.
        </li>
        <li>
          <strong>Only the CustomerHowFar admin team:</strong> ID and selfie images, payment proofs,
          reports and your account details. These files are stored privately and can only be opened
          through short-lived links. After you submit your ID, even you can&apos;t view the images
          again.
        </li>
        <li>
          <strong>Business owners:</strong> see counts of views and contact clicks, never who
          clicked.
        </li>
        <li>We may share data if the law requires it, for example with the police or a court.</li>
      </ul>

      <h2 id="providers">6. Service providers</h2>
      <p>We use trusted providers that process data for us under contract:</p>
      <ul>
        <li>
          <strong>Supabase</strong>: database and secure login.
        </li>
        <li>
          <strong>Vercel</strong>: website hosting.
        </li>
        <li>
          <strong>Cloudinary</strong>: storing and resizing photos, ID images and payment proofs.
        </li>
        <li>
          <strong>Brevo</strong>: sending emails.
        </li>
      </ul>

      <h2 id="transfers">7. International transfers</h2>
      <p>
        Our servers are in Europe (Ireland and the European Union), and some providers may process
        data in other countries. These providers protect data with security measures and contractual
        safeguards that meet the standards required by the NDPA for transfers outside Nigeria.
      </p>

      <h2 id="retention">8. How long we keep it</h2>
      <ul>
        <li>
          <strong>ID and selfie images:</strong> deleted 90 days after our team reviews them, and
          straight away if you withdraw a submission or delete your account. We keep a short record
          that a check happened (type of ID and the decision).
        </li>
        <li>
          <strong>Account and listings:</strong> until you delete them, or we remove them under our{" "}
          <Link href="/terms">Terms of Service</Link>.
        </li>
        <li>
          <strong>Payment records:</strong> kept for accounting. When you delete your account they
          are anonymized: we keep only the amount, date, reference, payment method and business
          name, and delete the receipt and your name, email and phone.
        </li>
        <li>
          <strong>Waitlist sign-ups:</strong> until you delete your account. If you unsubscribe we
          keep only a record so we don&apos;t email you again; deleting your account removes your
          waitlist sign-ups completely.
        </li>
        <li>
          <strong>Scrambled IP addresses for rate limiting:</strong> up to two days.
        </li>
      </ul>

      <h2 id="rights">9. Your rights</h2>
      <p>Under the NDPA you can:</p>
      <ul>
        <li>
          <strong>Access</strong> the personal data we hold about you.
        </li>
        <li>
          <strong>Correct</strong> it. You can change your name and phone on your{" "}
          <Link href="/account">account page</Link> and your business details from your dashboard.
        </li>
        <li>
          <strong>Delete</strong> it. Use &ldquo;Delete my account&rdquo; on your account page. It
          deletes your profile, login, listings, photos, reviews and ID images straight away
          (anonymous payment records are kept, as explained above).
        </li>
        <li>
          <strong>Object</strong> to or ask us to restrict some uses of your data.
        </li>
        <li>
          <strong>Get a copy</strong> of data you gave us in a common format.
        </li>
        <li>
          <strong>Withdraw consent</strong> for the ID check at any time.
        </li>
      </ul>
      <p>
        Email <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a> to use any of these rights.
        We may need to confirm it&apos;s you, and we reply within 30 days.
      </p>

      <h2 id="cookies">10. Cookies</h2>
      <p>We only use cookies that are needed for the site to work:</p>
      <ul>
        <li>
          <strong>Login cookies</strong> (from Supabase) keep you signed in. Without them you
          can&apos;t log in.
        </li>
        <li>
          <strong>Counting cookies:</strong> small, short-lived cookies (2 minutes to 6 hours) so a
          page view or contact tap is counted once. They hold no personal data.
        </li>
      </ul>
      <p>
        We don&apos;t use advertising or third-party tracking cookies, so there&apos;s nothing to
        opt out of.
      </p>

      <h2 id="security">11. Security</h2>
      <ul>
        <li>All traffic uses encrypted connections (HTTPS).</li>
        <li>
          ID images and payment proofs are private files, viewable only by admins through links that
          expire after 5 minutes.
        </li>
        <li>
          Database access is restricted to our servers; admin pages are protected and actions are
          logged.
        </li>
        <li>
          Passwords are handled by our login provider and never stored by us in readable form.
        </li>
      </ul>
      <p>
        No system is perfectly secure. If we learn of a data breach that puts you at risk, we will
        tell you and the Nigeria Data Protection Commission as the law requires.
      </p>

      <h2 id="children">12. Children</h2>
      <p>
        CustomerHowFar is not for people under 18. We don&apos;t knowingly collect their data. If
        you think a child has given us personal data, contact us and we will delete it.
      </p>

      <h2 id="changes">13. Changes to this policy</h2>
      <p>
        We will update the &ldquo;Last updated&rdquo; date when this policy changes, and tell
        account holders about important changes.
      </p>

      <h2 id="contact">14. Contact and complaints</h2>
      <p>
        For privacy questions or requests, email{" "}
        <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a> or use our{" "}
        <Link href="/contact">contact form</Link>. If you are not happy with our answer, you can
        complain to the Nigeria Data Protection Commission (NDPC).
      </p>
    </ContentPage>
  );
}
