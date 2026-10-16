import "server-only";
import { getSiteUrl } from "@/config/site";
import { weeklyStatsEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { deliver, isTestMode } from "@/lib/notifications/deliver";
import { prisma } from "@/lib/prisma";
import { ownerStatsMessage } from "./messages";
import { areOwnerStatsVisible } from "./owner-visibility";
import { addDays, dayDate, lagosDay } from "./rules";

/**
 * Daily job, Mondays only (Nigerian time): each owner of a live listing gets last week's views
 * and contacts (Monday to Sunday) under the bell, plus push/email if switched on for "Weekly
 * listing stats". Sent once per Monday, even if the job runs twice.
 */
export async function sendWeeklyOwnerStats(now = Date.now()) {
  const today = lagosDay(now);
  if (new Date(`${today}T00:00:00Z`).getUTCDay() !== 1) return 0;
  // Nothing while the admin hides stats from owners (in-app, push and email alike).
  if (!(await areOwnerStatsVisible())) return 0;
  // Claim this Monday first, so a second run can never send the summary twice.
  const claimed = await prisma.$executeRaw`
    INSERT INTO analytics_daily (day, metric, key, value) VALUES (${today}::date, 'weekly_sent', '', 0)
    ON CONFLICT DO NOTHING`;
  if (claimed === 0) return 0;

  const testMode = isTestMode();
  const from = addDays(today, -7);
  const to = addDays(today, -1);
  const rows = await prisma.$queryRaw<
    {
      business_id: string;
      name: string;
      owner_id: string;
      owner_name: string;
      owner_email: string;
      views: number;
      contacts: number;
    }[]
  >`
    SELECT b.id::text AS business_id, b.name, p.id::text AS owner_id, p.full_name AS owner_name,
      p.email AS owner_email, COALESCE(sum(s.views), 0)::int AS views,
      COALESCE(sum(s.whatsapp + s.calls + s.emails), 0)::int AS contacts
    FROM businesses b
    JOIN profiles p ON p.id = b.owner_id AND p.status = 'ACTIVE'
    LEFT JOIN business_stats_daily s ON s.business_id = b.id AND s.day BETWEEN ${from}::date AND ${to}::date
    WHERE b.status = 'APPROVED'
      AND (${!testMode} OR p.email LIKE '%@example.com')
    GROUP BY b.id, p.id`;

  let sent = 0;
  for (const row of rows) {
    // Only when there is something to report.
    if (row.views === 0 && row.contacts === 0) continue;
    const message = ownerStatsMessage(row.views, row.contacts, "last week");
    await deliver({
      userId: row.owner_id,
      category: "WEEKLY_STATS",
      type: "weekly-stats",
      title: `Your week: ${row.name}`,
      body: message,
      link: "/dashboard",
      email: () =>
        sendEmail({
          to: { email: row.owner_email, name: row.owner_name },
          tag: "weekly-stats",
          ...weeklyStatsEmail({
            ownerName: row.owner_name,
            businessName: row.name,
            message,
            dashboardUrl: `${getSiteUrl()}/dashboard`,
            settingsUrl: `${getSiteUrl()}/account/notifications`,
          }),
        }),
    });
    sent++;
  }
  await prisma.analyticsDaily.update({
    where: { day_metric_key: { day: dayDate(today), metric: "weekly_sent", key: "" } },
    data: { value: sent },
  });
  return sent;
}
