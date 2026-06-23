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

  if (!body.waiverAccepted) {
    return NextResponse.json({ error: "Waiver not accepted" }, { status: 400 });
  }

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  await prisma.user.update({
    where: { id: session.userId },
    data: { waiverAcceptedAt: new Date() },
  });

  const participant = await prisma.eventParticipant.upsert({
    where: { eventId_userId: { eventId: event.id, userId: session.userId } },
    create: { eventId: event.id, userId: session.userId },
    update: {},
  });

  // Run VDOT sync and Tips regeneration in background — don't block join response
  (async () => {
    // Step 1: try to compute VDOT estimate — failure must not block Tips
    try {
      const targetMeters = event.distanceKm * 1000;
      const existing = await prisma.bestEffort.count({ where: { userId: session.userId } });

      let vdotPredictedSecs: number | null;
      if (existing > 0) {
        vdotPredictedSecs = await computeVdotFromDb(session.userId, targetMeters);
      } else {
        const accessToken = await refreshTokenIfNeeded(session.userId);
        vdotPredictedSecs = await syncAndComputeVdot(session.userId, accessToken, targetMeters);
      }

      if (vdotPredictedSecs) {
        await prisma.eventParticipant.update({
          where: { id: participant.id },
          data: { vdotPredictedSecs },
        });
      }
    } catch {
      // VDOT failed — non-fatal, continue to Tips regeneration
    }

    // Step 2: always regenerate Tips, whether VDOT succeeded or not
    try {
      await generateRaceCard(event.id);
    } catch {
      // Tips failed — non-fatal
    }
  })();

  return NextResponse.json({ ok: true });
}
