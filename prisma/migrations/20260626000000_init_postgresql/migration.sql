CREATE TABLE "User" (
  "id" SERIAL NOT NULL,
  "username" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "examDate" TEXT,
  "dailyAvailableMinutes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudyTask" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "date" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "estimatedMinutes" INTEGER NOT NULL,
  "priority" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'not_started',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StudyTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyCheckin" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "date" TEXT NOT NULL,
  "totalStudyMinutes" INTEGER NOT NULL,
  "completedSubjects" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "moodScore" INTEGER NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DailyCheckin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CheckinTask" (
  "id" SERIAL NOT NULL,
  "checkinId" INTEGER NOT NULL,
  "taskId" INTEGER NOT NULL,

  CONSTRAINT "CheckinTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
  "id" SERIAL NOT NULL,
  "senderId" INTEGER NOT NULL,
  "receiverId" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "DailyCheckin_userId_date_key" ON "DailyCheckin"("userId", "date");
CREATE UNIQUE INDEX "CheckinTask_checkinId_taskId_key" ON "CheckinTask"("checkinId", "taskId");

ALTER TABLE "StudyTask" ADD CONSTRAINT "StudyTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyCheckin" ADD CONSTRAINT "DailyCheckin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckinTask" ADD CONSTRAINT "CheckinTask_checkinId_fkey" FOREIGN KEY ("checkinId") REFERENCES "DailyCheckin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckinTask" ADD CONSTRAINT "CheckinTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "StudyTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
