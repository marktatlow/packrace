-- CreateTable
CREATE TABLE "RaceCard" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "commentary" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaceCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RaceCard_eventId_key" ON "RaceCard"("eventId");

-- AddForeignKey
ALTER TABLE "RaceCard" ADD CONSTRAINT "RaceCard_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
