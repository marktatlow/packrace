import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshTokenIfNeeded } from "@/lib/strava";
import { fetchBestEfforts, computeVdotPrediction } from "@/lib/vdot";
import { updateRunnerTip, updateRaceIntro, updateFastestOdds } from "@/lib/racecard";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    include: { participants: { include: { user: true } } },
  });

  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isParticipant = event.participants.some((p) => p.userId === session.userId);
  if (!isParticipant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const safe = JSON.parse(JSON.stringify(event, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v
  ));
  return NextResponse.json(safe);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const participant = await prisma.eventParticipant.findUnique({
    where: { eventId_userId: { eventId: id, userId: session.userId } },
  });
  if (!participant) return NextResponse.json({ error: "Not a participant" }, { status: 403 });

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only allow prediction updates before window starts
  if (body.predictedTimeSecs !== undefined) {
    if (new Date() >= event.windowStart) {
      return NextResponse.json({ error: "Window has started — predictions are locked" }, { status: 400 });
    }

    // Detect if this is a change (not a first-time set)
    const oldSecs = participant.predictedTimeSecs;
    const newSecs = body.predictedTimeSecs as number;
    const isChange = oldSecs !== null && oldSecs !== newSecs;

    await prisma.eventParticipant.update({
      where: { id: participant.id },
      data: { predictedTimeSecs: newSecs },
    });

    // Need user name for change callout
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { firstName: true },
    });
    const changeCtx = isChange && user
      ? { name: user.firstName, oldSecs, newSecs }
      : undefined;

    // Background: VDOT (retry if needed) → runner tip → race intro → fastest odds
    (async () => {
      let hasVdot = !!participant.vdotPredictedSecs;

      if (!hasVdot) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (attempt > 0) await sleep(10_000);
            const accessToken = await refreshTokenIfNeeded(session.userId);
            const efforts = await fetchBestEfforts(accessToken);
            const vdotPredictedSecs = computeVdotPrediction(efforts, event.distanceKm * 1000);
            if (vdotPredictedSecs) {
              await prisma.eventParticipant.update({
                where: { id: participant.id },
                data: { vdotPredictedSecs },
              });
              hasVdot = true;
              break;
            }
          } catch { /* retry */ }
        }
      }

      // Regenerate runner tip (with change callout if applicable)
      await updateRunnerTip(id, session.userId, changeCtx).catch(() => {});

      // Regenerate race intro (calling out the change if applicable)
      await updateRaceIntro(id, "pre-race", changeCtx).catch(() => {});

      // Update fastest odds for whole field
      await updateFastestOdds(id).catch(() => {});
    })();
  }

  return NextResponse.json({ ok: true });
}
