import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { syncUserActivities } from "@/lib/strava";
import { recalculatePredictionsForEvent } from "@/lib/prediction";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await syncUserActivities(session.userId);

  // Recalculate predictions for all upcoming events
  const participations = await prisma.eventParticipant.findMany({
    where: { userId: session.userId, event: { date: { gt: new Date() } } },
    select: { eventId: true },
  });
  for (const p of participations) {
    await recalculatePredictionsForEvent(p.eventId);
  }

  return NextResponse.json({ ok: true });
}
