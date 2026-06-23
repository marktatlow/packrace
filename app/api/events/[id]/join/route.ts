import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshTokenIfNeeded } from "@/lib/strava";
import { syncAndComputeVdot, computeVdotFromDb } from "@/lib/bestEfforts";
import { updateRunnerTip, updateRaceIntro, updateFastestOdds } from "@/lib/racecard";

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

  await prisma.eventParticipant.upsert({
    where: { eventId_userId: { eventId: event.id, userId: session.userId } },
    create: { eventId: event.id, userId: session.userId },
    update: {},
  });

  // Background: VDOT → runner tip → race intro (in that order, each non-fatal)
  (async () => {
    // 1. Compute VDOT estimate
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
        await prisma.eventParticipant.updateMany({
          where: { eventId: event.id, userId: session.userId },
          data: { vdotPredictedSecs },
        });
      }
    } catch { /* non-fatal */ }

    // 2. Generate this runner's individual tip (with VDOT if available)
    await updateRunnerTip(event.id, session.userId).catch(() => {});

    // 3. Update fastest-runner odds across the whole field (needs all runners)
    await updateFastestOdds(event.id).catch(() => {});

    // 4. Update the race intro to include the new runner
    await updateRaceIntro(event.id, "pre-race").catch(() => {});
  })();

  return NextResponse.json({ ok: true });
}
