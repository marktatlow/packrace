import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshTokenIfNeeded } from "@/lib/strava";
import { syncAndComputeVdot, computeVdotFromDb } from "@/lib/bestEfforts";
import { updateRunnerTip, updateRaceIntro, updateFastestOdds } from "@/lib/racecard";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  // Background: VDOT (with retries) → Tips → fastest odds → race intro
  (async () => {
    // 1. Compute VDOT — retry up to 3 times with 10s gaps if first attempt fails
    let vdotComputed = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) await sleep(10_000); // wait 10s before retry

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
          vdotComputed = true;
          break; // success — stop retrying
        }
      } catch {
        // retry
      }
    }

    if (!vdotComputed) {
      console.warn(`VDOT not computed for user ${session.userId} after 3 attempts`);
    }

    // 2. Generate runner tip (now has VDOT if computation succeeded)
    await updateRunnerTip(event.id, session.userId).catch(() => {});

    // 3. Update fastest-runner odds for whole field
    await updateFastestOdds(event.id).catch(() => {});

    // 4. Update race intro
    await updateRaceIntro(event.id, "pre-race").catch(() => {});
  })();

  return NextResponse.json({ ok: true });
}
