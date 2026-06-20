import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateCommentary } from "@/lib/commentary";
import { recalculatePredictionsForEvent } from "@/lib/prediction";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const upcomingEvents = await prisma.event.findMany({
    where: { date: { gt: new Date() } },
    include: { _count: { select: { participants: true } } },
  });

  for (const event of upcomingEvents) {
    if (event._count.participants < 2) continue;
    await recalculatePredictionsForEvent(event.id);
    await generateCommentary(event.id);
  }

  return NextResponse.json({ ok: true, processed: upcomingEvents.length });
}
