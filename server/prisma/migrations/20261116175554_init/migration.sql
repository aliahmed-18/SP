-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('LIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('QUICK_CHECK', 'EXPLAIN');

-- CreateEnum
CREATE TYPE "QuickCheckKind" AS ENUM ('MCQ', 'TRUE_FALSE', 'NUMERIC');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('DRAFT', 'LIVE', 'CLOSED', 'REVEALED');

-- CreateEnum
CREATE TYPE "TopicStatus" AS ENUM ('OPEN', 'ANSWERED_IN_CLASS', 'REPLIED');

-- CreateEnum
CREATE TYPE "ExplainTag" AS ENUM ('CORRECT', 'PARTIAL', 'MISCONCEPTION');

-- CreateEnum
CREATE TYPE "TakeawayStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "Instructor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Instructor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "courseId" TEXT,
    "code" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "academicMode" BOOLEAN NOT NULL DEFAULT true,
    "status" "SessionStatus" NOT NULL DEFAULT 'LIVE',
    "liveActivityId" TEXT,
    "flaggedCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "presentActivityId" TEXT,
    "projected" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "sessionId" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "lastQuestionAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("sessionId","deviceHash")
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "flaggedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "topicId" TEXT,
    "text" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "addressed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "TopicStatus" NOT NULL DEFAULT 'OPEN',
    "reply" TEXT,
    "meTooCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeToo" (
    "topicId" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeToo_pkey" PRIMARY KEY ("topicId","deviceHash")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "kind" "QuickCheckKind",
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "correct" JSONB,
    "tolerance" DOUBLE PRECISION,
    "explanation" TEXT,
    "modelAnswer" TEXT,
    "status" "ActivityStatus" NOT NULL DEFAULT 'DRAFT',
    "round" INTEGER NOT NULL DEFAULT 1,
    "closesAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Response" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "answer" JSONB,
    "confident" BOOLEAN,
    "text" TEXT,
    "tag" "ExplainTag",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Takeaway" (
    "sessionId" TEXT NOT NULL,
    "status" "TakeawayStatus" NOT NULL DEFAULT 'DRAFT',
    "keyPoints" JSONB NOT NULL DEFAULT '[]',
    "topTopicIds" JSONB NOT NULL DEFAULT '[]',
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Takeaway_pkey" PRIMARY KEY ("sessionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Instructor_email_key" ON "Instructor"("email");

-- CreateIndex
CREATE INDEX "Course_instructorId_idx" ON "Course"("instructorId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_liveActivityId_key" ON "Session"("liveActivityId");

-- CreateIndex
CREATE INDEX "Session_code_idx" ON "Session"("code");

-- CreateIndex
CREATE INDEX "Session_instructorId_startedAt_idx" ON "Session"("instructorId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Part_sessionId_number_key" ON "Part"("sessionId", "number");

-- CreateIndex
CREATE INDEX "Question_sessionId_createdAt_idx" ON "Question"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "Topic_sessionId_idx" ON "Topic"("sessionId");

-- CreateIndex
CREATE INDEX "Activity_sessionId_position_idx" ON "Activity"("sessionId", "position");

-- CreateIndex
CREATE INDEX "Response_activityId_round_idx" ON "Response"("activityId", "round");

-- CreateIndex
CREATE UNIQUE INDEX "Response_activityId_deviceHash_round_key" ON "Response"("activityId", "deviceHash", "round");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "Instructor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "Instructor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeToo" ADD CONSTRAINT "MeToo_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Takeaway" ADD CONSTRAINT "Takeaway_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Rules Prisma can't express (docs/02-data-model.md) ─────────────────────
-- Join code must be unique among LIVE sessions (ENDED codes can be reused later)
CREATE UNIQUE INDEX "session_live_code_unique" ON "Session"("code") WHERE "status" = 'LIVE';
-- Only one LIVE activity per session (backup for Session.liveActivityId)
CREATE UNIQUE INDEX "activity_one_live_per_session" ON "Activity"("sessionId") WHERE "status" = 'LIVE';
