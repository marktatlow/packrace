import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshTokenIfNeeded } from "@/lib/strava";
import { syncAndComputeVdot, computeVdotFromDb } from "@/lib/bestEfforts";
import { generateRaceCard } from "@/lib/racecard";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // Require waiver acceptance
  if (!body.waiverAccepted) {
    return NextResponse.json({ error: "Waiver not accepted" }, { status: 400 });
  }

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Record waiver acceptance on the user (once accepted, valid for all future events)
  await prisma.user.update({
    where: { id: session.userId },
    data: { waiverAcceptedAt: new Date() },
  });

  const participant = await prisma.eventParticipant.upsert({
    where: { eventId_userId: { eventId: event.id, userId: session.userId } },
    create: { eventId: event.id, userId: session.userId },
    update: {},
  });

  // Compute Strava Est. in background — don't block the join response
  (async () => {
    try {
      const targetMeters = event.distanceKm * 1000;
      const existing = await prisma.bestEffort.count({ where: { userId: session.userId } });

      let vdotPredictedSecs: number | null;
      if (existing > 0) {
        // Already have stored efforts — compute from DB instantly, no Strava call
        vdotPredictedSecs = await computeVdotFromDb(session.userId, targetMeters);
      } else {
        // First time joining any event — do a full Strava sync
        const accessToken = await refreshTokenIfNeeded(session.userId);
        vdotPredictedSecs = await syncAndComputeVdot(session.userId, accessToken, targetMeters);
      }

      if (vdotPredictedSecs) {
        await prisma.eventParticipant.update({
          where: { id: participant.id },
          data: { vdotPredictedSecs },
        });
      }

      // Regenerate Tips so the new runner is included (need ≥2 participants with predictions)
      const predictedCount = await prisma.eventParticipant.count({
        where: { eventId: event.id, predictedTimeSecs: { not: null } },
      });
      if (predictedCount >= 2) {
        await generateRaceCard(event.id).catch(() => { /* non-fatal */ });
      }
    } catch { /* non-fatal */ }
  })();

  return NextResponse.json({ ok: true });
}
