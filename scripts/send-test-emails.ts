// Sends ONE sample of each email template to ADMIN_NOTIFY_EMAIL so you can see how they look.
// Usage: npm run email:test
// Uses sample data; touches no database rows.
import { loadEnv } from "./env-guard.mjs";

// Refuses the production project unless ALLOW_PRODUCTION=yes (see scripts/env-guard.mjs).
loadEnv({ script: "email:test" });

async function main() {
  const { sendEmail } = await import("../src/lib/email/send");
  const t = await import("../src/lib/email/templates");

  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) throw new Error("ADMIN_NOTIFY_EMAIL is not set.");
  if (process.env.EMAIL_TEST_OUTBOX)
    throw new Error("Unset EMAIL_TEST_OUTBOX to send real emails.");

  const site = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
  const sample = { ownerName: "Adaeze Okafor", businessName: "Adaeze Couture (sample)" };
  const tagged = (r: { subject: string; html: string; text: string }) => ({
    ...r,
    subject: `[Test] ${r.subject}`,
  });

  const messages = [
    {
      tag: "test-listing-approved",
      ...tagged(
        t.listingApprovedEmail({
          ...sample,
          listingUrl: `${site}/business/adaeze-couture`,
          dashboardUrl: `${site}/dashboard`,
        }),
      ),
    },
    {
      tag: "test-changes-requested",
      ...tagged(
        t.changesRequestedEmail({
          ...sample,
          comment:
            "Photos are unclear or not your work. Please upload clear photos of jobs you have done yourself.",
          fixUrl: `${site}/dashboard`,
        }),
      ),
    },
    {
      tag: "test-listing-suspended",
      ...tagged(
        t.listingSuspendedEmail({
          ...sample,
          reason: "Several customers reported that this phone number is unreachable.",
          supportUrl: `${site}/contact`,
        }),
      ),
    },
    {
      tag: "test-admin-submission",
      ...tagged(
        t.adminSubmissionEmail({
          businessName: sample.businessName,
          categoryName: "Fashion & Tailoring",
          location: "Lekki, Eti-Osa, Lagos",
          ownerName: sample.ownerName,
          ownerEmail: "owner@example.com",
          resubmission: false,
          reviewUrl: `${site}/admin/listings?tab=review`,
        }),
      ),
    },
  ];

  let sent = 0;
  for (const message of messages) {
    const ok = await sendEmail({ to: { email: to }, ...message });
    console.log(`${ok ? "sent" : "FAILED"}: ${message.tag}`);
    if (ok) sent++;
  }
  console.log(`${sent}/${messages.length} test emails sent to ADMIN_NOTIFY_EMAIL.`);
  if (sent !== messages.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("email:test failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
