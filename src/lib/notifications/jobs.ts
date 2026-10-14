import "server-only";
import { getSiteUrl } from "@/config/site";
import { ratingReminderEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { prisma } from "@/lib/prisma";
import { deliver } from "./deliver";

// Daily job steps for notifications.

/** Notifications are kept for 90 days. */
export const NOTIFICATION_RETENTION_DAYS = 90;

export async function pruneNotifications() {
  const cutoff = new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.notification.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}

/**
 * "Did you hire [Business]? Rate them": for signed-in customers who contacted an approved
 * business 2 to 14 days ago and haven't reviewed it (confirmed email, not the owner). Each
 * customer/business pair is asked once; at most one reminder per person per day.
 */
export async function sendRatingReminders(limit = 300) {
  const due = await prisma.$queryRaw<{ user_id: string; business_id: string }[]>`
    SELECT DISTINCT ON (ce.user_id) ce.user_id::text, ce.business_id::text
    FROM contact_events ce
    JOIN businesses b ON b.id = ce.business_id AND b.status = 'APPROVED' AND b.owner_id <> ce.user_id
    JOIN profiles p ON p.id = ce.user_id AND p.status = 'ACTIVE'
    JOIN auth.users au ON au.id = ce.user_id AND au.email_confirmed_at IS NOT NULL
    WHERE ce.user_id IS NOT NULL
      AND ce.created_at <= now() - interval '2 days'
      AND ce.created_at >= now() - interval '14 days'
      AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.user_id = ce.user_id AND r.business_id = ce.business_id)
      AND NOT EXISTS (SELECT 1 FROM rating_reminders rr WHERE rr.user_id = ce.user_id AND rr.business_id = ce.business_id)
    ORDER BY ce.user_id, ce.created_at DESC
    LIMIT ${limit}`;
  let sent = 0;
  for (const row of due) {
    // Record first, so a crash can never send the same reminder twice.
    const inserted = await prisma.ratingReminder.createMany({
      data: { userId: row.user_id, businessId: row.business_id },
      skipDuplicates: true,
    });
    if (inserted.count === 0) continue;
    const [user, business] = await Promise.all([
      prisma.profile.findUnique({
        where: { id: row.user_id },
        select: { fullName: true, email: true },
      }),
      prisma.business.findUnique({
        where: { id: row.business_id },
        select: { name: true, slug: true },
      }),
    ]);
    if (!user || !business) continue;
    const link = `/business/${business.slug}#reviews-title`;
    await deliver({
      userId: row.user_id,
      category: "RATING_REMINDER",
      type: "rating-reminder",
      title: `Did you hire ${business.name}?`,
      body: "If you did, rate them. It helps other customers choose well.",
      link,
      email: () =>
        sendEmail({
          to: { email: user.email, name: user.fullName },
          tag: "rating-reminder",
          ...ratingReminderEmail({
            name: user.fullName,
            businessName: business.name,
            reviewUrl: `${getSiteUrl()}${link}`,
            settingsUrl: `${getSiteUrl()}/account/notifications`,
          }),
        }),
    });
    sent++;
  }
  return sent;
}
