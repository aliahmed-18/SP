-- Scheduled lectures (calendar): plan a session, prepare it, start it at its time (auto) or by hand.

-- AlterEnum: SCHEDULED sorts between LIVE and ENDED, so "LIVE first, then planned, then past" lookups
-- (ORDER BY status) keep working.
ALTER TYPE "SessionStatus" ADD VALUE 'SCHEDULED' BEFORE 'ENDED';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "autoStart" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "durationMin" INTEGER,
ADD COLUMN     "scheduledFor" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Session_status_scheduledFor_idx" ON "Session"("status", "scheduledFor");

-- A join code is unique among sessions that aren't over (LIVE or SCHEDULED), so a code shared in advance
-- can't clash with another lecture when it starts. (Replaces the LIVE-only index; written as
-- "<> 'ENDED'" so it doesn't use the new enum value inside this migration.)
DROP INDEX "session_live_code_unique";
CREATE UNIQUE INDEX "session_open_code_unique" ON "Session"("code") WHERE "status" <> 'ENDED';
