-- CreateTable
CREATE TABLE "job_runs" (
    "name" TEXT NOT NULL,
    "last_started_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "last_failure_at" TIMESTAMP(3),
    "last_error" TEXT,
    "last_duration_ms" INTEGER,
    "last_result" JSONB,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("name")
);


-- Row Level Security: block the Supabase Data API; the app uses Prisma (postgres role).
ALTER TABLE "job_runs" ENABLE ROW LEVEL SECURITY;
