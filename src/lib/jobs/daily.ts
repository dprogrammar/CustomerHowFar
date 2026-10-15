import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { rollUpAnalytics } from "@/lib/analytics/rollup";
import { sendWeeklyOwnerStats } from "@/lib/analytics/weekly";
import { pruneUnansweredQuestions } from "@/lib/assistant/unanswered";
import { pruneNotifications, sendRatingReminders } from "@/lib/notifications/jobs";
import { runIdentityRetention } from "@/lib/identity/server";
import { prisma } from "@/lib/prisma";
import { pruneRateLimits } from "@/lib/rate-limit";
import { processPendingFileDeletions } from "@/lib/storage/cleanup";
import { cleanOrphanedUploads } from "@/lib/storage/orphans";

// The daily job (Vercel Cron). Every step touches the database, which also keeps the free
// Supabase project from pausing for inactivity. Results are counts only.

export const DAILY_JOB = "daily";

export async function runDailyJob() {
  const started = Date.now();
  await prisma.jobRun.upsert({
    where: { name: DAILY_JOB },
    update: { lastStartedAt: new Date() },
    create: { name: DAILY_JOB, lastStartedAt: new Date() },
  });
  try {
    // Keep-alive: a real query, even if every other step has nothing to do.
    await prisma.$queryRaw`SELECT 1`;
    const identity = await runIdentityRetention();
    const files = await processPendingFileDeletions();
    const rateLimitRowsPruned = await pruneRateLimits();
    const orphans = await cleanOrphanedUploads();
    const unansweredPruned = await pruneUnansweredQuestions();
    const notificationsPruned = await pruneNotifications();
    const ratingReminders = await sendRatingReminders();
    // Roll up yesterday (and any missed days), delete raw events older than 7 days, then the
    // Monday owner summary (which reads the rolled-up days).
    const analytics = await rollUpAnalytics();
    const weeklyStats = await sendWeeklyOwnerStats();
    const result = {
      identity,
      files,
      rateLimitRowsPruned,
      orphans,
      unansweredPruned,
      notificationsPruned,
      ratingReminders,
      analytics,
      weeklyStats,
    };
    await prisma.jobRun.update({
      where: { name: DAILY_JOB },
      data: {
        lastSuccessAt: new Date(),
        lastDurationMs: Date.now() - started,
        lastResult: result as unknown as Prisma.InputJsonValue,
        lastError: null,
      },
    });
    return result;
  } catch (error) {
    await prisma.jobRun
      .update({
        where: { name: DAILY_JOB },
        data: {
          lastFailureAt: new Date(),
          lastDurationMs: Date.now() - started,
          lastError: error instanceof Error ? error.name : "unknown",
        },
      })
      .catch(() => {});
    throw error;
  }
}

export async function getLastDailyJob() {
  return prisma.jobRun.findUnique({
    where: { name: DAILY_JOB },
    select: { lastSuccessAt: true, lastFailureAt: true, lastStartedAt: true },
  });
}
