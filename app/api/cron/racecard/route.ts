import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateRaceCard } from "@/lib/racecard";

export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find events happening tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const start = new Date(tomorrow); start.setHours(0, 0, 0, 0);
  const end = new Date(tomorrow); end.setHours(23, 59, 59, 999);

  const events = await prisma.event.findMany({
    where: {
      date: { gte: start, lte: end },
      participants: { some: { predictedTimeSecs: { not: null } } },
    },
    select: { id: true },
  });

  const results = await Promise.allSettled(events.map((e) => generateRaceCard(e.id)));
  const succeeded = results.filter((r) => r.status === "fulfilled").length;

  return NextResponse.json({ generated: succeeded, total: events.length });
}
