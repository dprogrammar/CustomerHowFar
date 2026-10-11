-- Supabase exposes the public schema through its Data API to the anon and authenticated
-- roles. Enable Row Level Security with no policies so those roles cannot read or write
-- app_settings. The app connects through Prisma as the postgres role, which bypasses RLS.
ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;
