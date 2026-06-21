import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshTokenIfNeeded } from "@/lib/strava";
import { fetchBestEfforts, computeVdotPrediction } from "@/lib/vdot";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const participant = await prisma.eventParticipant.upsert({
    where: { eventId_userId: { eventId: event.id, userId: session.userId } },
    create: { eventId: event.id, userId: session.userId },
    update: {},
  });

  // Compute Strava Est. in background — don't block the join response
  (async () => {
    try {
      const accessToken = await refreshTokenIfNeeded(session.userId);
      const efforts = await fetchBestEfforts(accessToken);
      const vdotPredictedSecs = computeVdotPrediction(efforts, event.distanceKm * 1000);
      if (vdotPredictedSecs) {
        await prisma.eventParticipant.update({
          where: { id: participant.id },
          data: { vdotPredictedSecs },
        });
      }
    } catch { /* non-fatal */ }
  })();

  return NextResponse.json({ ok: true });
}
