import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateRaceCard } from "@/lib/racecard";

/**
 * Runs daily at 8am UTC.
 * Handles all automatic Tips generation triggers:
 *   1. Day before the event  — pre-race build-up
 *   2. Day of the event      — race day card (predictions locked)
 *   3. Window just closed    — post-race final verdict
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const generated: string[] = [];

  // ── 1. Day before the event ──────────────────────────────────────────
  const tomorrowStart = new Date(now);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  tomorrowStart.setHours(0, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setHours(23, 59, 59, 999);

  const dayBeforeEvents = await prisma.event.findMany({
    where: {
      date: { gte: tomorrowStart, lte: tomorrowEnd },
      participants: { some: { predictedTimeSecs: { not: null } } },
    },
    select: { id: true, name: true },
  });

  for (const e of dayBeforeEvents) {
    await generateRaceCard(e.id).catch((err) => console.error(`Day-before card failed for ${e.name}:`, err));
    generated.push(`day-before: ${e.name}`);
  }

  // ── 2. Day of the event ──────────────────────────────────────────────
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const raceDayEvents = await prisma.event.findMany({
    where: {
      date: { gte: todayStart, lte: todayEnd },
      participants: { some: { predictedTimeSecs: { not: null } } },
    },
    select: { id: true, name: true },
  });

  for (const e of raceDayEvents) {
    await generateRaceCard(e.id).catch((err) => console.error(`Race-day card failed for ${e.name}:`, err));
    generated.push(`race-day: ${e.name}`);
  }

  // ── 3. Window just closed (in the last 25h) — final verdict ──────────
  // 25h window so we don't miss events that closed just before the last cron ran
  const closedSince = new Date(now.getTime() - 25 * 60 * 60 * 1000);

  const closedEvents = await prisma.event.findMany({
    where: {
      windowEnd: { gte: closedSince, lt: now },
      participants: {
        some: {
          predictedTimeSecs: { not: null },
          actualTimeSecs: { not: null }, // only if results are in
        },
      },
    },
    select: { id: true, name: true },
  });

  for (const e of closedEvents) {
    await generateRaceCard(e.id).catch((err) => console.error(`Post-race card failed for ${e.name}:`, err));
    generated.push(`post-race: ${e.name}`);
  }

  return NextResponse.json({ generated, total: generated.length });
}
