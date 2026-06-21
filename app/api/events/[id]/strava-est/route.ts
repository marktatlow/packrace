import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshTokenIfNeeded } from "@/lib/strava";
import { syncAndComputeVdot, computeVdotFromDb } from "@/lib/bestEfforts";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const participant = await prisma.eventParticipant.findUnique({
    where: { eventId_userId: { eventId: id, userId: session.userId } },
  });
  if (!participant) return NextResponse.json({ error: "Not a participant" }, { status: 403 });

  const targetMeters = event.distanceKm * 1000;

  // If we already have stored best efforts, compute from DB first (no Strava call)
  const existing = await prisma.bestEffort.count({ where: { userId: session.userId } });
  let vdotPredictedSecs: number | null;

  if (existing > 0) {
    vdotPredictedSecs = await computeVdotFromDb(session.userId, targetMeters);
  } else {
    // First time — do a full sync from Strava
    const accessToken = await refreshTokenIfNeeded(session.userId);
    vdotPredictedSecs = await syncAndComputeVdot(session.userId, accessToken, targetMeters);
  }

  await prisma.eventParticipant.update({
    where: { id: participant.id },
    data: { vdotPredictedSecs: vdotPredictedSecs ?? undefined },
  });

  return NextResponse.json({ vdotPredictedSecs });
}
