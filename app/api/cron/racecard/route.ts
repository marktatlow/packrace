import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateRaceIntro, updateRunnerTip } from "@/lib/racecard";

/**
 * Cron runs twice daily:
 *   - 00:00 UTC (1am BST) → race-day excitement for events happening today
 *   - 08:00 UTC (9am BST) → daily pre-race refresh + post-race summaries
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const generated: string[] = [];

  // Detect which run this is: midnight (race-day hype) or morning (daily refresh)
  const hour = now.getUTCHours();
  const isMidnightRun = hour < 2; // 00:00 UTC = 1am BST

  // ── RACE-DAY HYPE (midnight UTC / 1am BST) ──────────────────────────────
  if (isMidnightRun) {
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setUTCHours(23, 59, 59, 999);

    const raceDayEvents = await prisma.event.findMany({
      where: {
        windowStart: { gte: todayStart, lte: todayEnd },
        participants: { some: { predictedTimeSecs: { not: null } } },
      },
      select: { id: true, name: true },
    });

    for (const e of raceDayEvents) {
      await updateRaceIntro(e.id, "race-day").catch((err) =>
        console.error(`Race-day hype failed for ${e.name}:`, err)
      );
      generated.push(`race-day hype: ${e.name}`);
    }

    return NextResponse.json({ generated, total: generated.length });
  }

  // ── DAILY MORNING RUN (8am UTC / 9am BST) ───────────────────────────────

  // 1. Day-before: refresh pre-race intro for tomorrow's events
  const tomorrowStart = new Date(now);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  tomorrowStart.setUTCHours(0, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setUTCHours(23, 59, 59, 999);

  const dayBeforeEvents = await prisma.event.findMany({
    where: {
      date: { gte: tomorrowStart, lte: tomorrowEnd },
      participants: { some: { predictedTimeSecs: { not: null } } },
    },
    select: { id: true, name: true },
  });

  for (const e of dayBeforeEvents) {
    await updateRaceIntro(e.id, "pre-race").catch((err) =>
      console.error(`Day-before refresh failed for ${e.name}:`, err)
    );
    generated.push(`day-before: ${e.name}`);
  }

  // 2. Race-day: refresh intro for today's events
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setUTCHours(23, 59, 59, 999);

  const raceDayEvents = await prisma.event.findMany({
    where: {
      date: { gte: todayStart, lte: todayEnd },
      participants: { some: { predictedTimeSecs: { not: null } } },
    },
    select: { id: true, name: true },
  });

  for (const e of raceDayEvents) {
    await updateRaceIntro(e.id, "pre-race").catch((err) =>
      console.error(`Race-day morning refresh failed for ${e.name}:`, err)
    );
    generated.push(`race-day: ${e.name}`);
  }

  // 3. Post-race: events that closed in last 25h
  const closedSince = new Date(now.getTime() - 25 * 60 * 60 * 1000);

  const closedEvents = await prisma.event.findMany({
    where: {
      windowEnd: { gte: closedSince, lt: now },
      participants: {
        some: { predictedTimeSecs: { not: null }, actualTimeSecs: { not: null } },
      },
    },
    include: {
      participants: {
        where: { predictedTimeSecs: { not: null } },
        select: { userId: true, actualTimeSecs: true },
      },
    },
  });

  for (const e of closedEvents) {
    // Closing race summary
    await updateRaceIntro(e.id, "post-race").catch((err) =>
      console.error(`Post-race summary failed for ${e.name}:`, err)
    );
    // Per-runner verdict for each finisher (catches any the webhook missed)
    for (const p of e.participants.filter((p) => p.actualTimeSecs)) {
      await updateRunnerTip(e.id, p.userId).catch(() => {});
    }
    generated.push(`post-race: ${e.name}`);
  }

  return NextResponse.json({ generated, total: generated.length });
}
