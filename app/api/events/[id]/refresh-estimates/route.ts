import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshTokenIfNeeded } from "@/lib/strava";
import { syncAndComputeVdot } from "@/lib/bestEfforts";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const targetMeters = event.distanceKm * 1000;
  const results: { name: string; updated: boolean }[] = [];

  for (const participant of event.participants) {
    try {
      const accessToken = await refreshTokenIfNeeded(participant.user.id);

      // Incremental sync: only fetches Strava activities newer than last sync,
      // merges any improved best efforts into DB, then computes VDOT from DB.
      // After the first full 180-day sync this only pulls a handful of new runs.
      const vdotPredictedSecs = await syncAndComputeVdot(
        participant.user.id,
        accessToken,
        targetMeters
      );

      await prisma.eventParticipant.update({
        where: { id: participant.id },
        data: { vdotPredictedSecs: vdotPredictedSecs ?? undefined },
      });

      results.push({ name: participant.user.firstName, updated: !!vdotPredictedSecs });
    } catch (e) {
      console.error(`Failed to refresh estimate for ${participant.user.firstName}:`, e);
      results.push({ name: participant.user.firstName, updated: false });
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  return NextResponse.json({ ok: true, results });
}
