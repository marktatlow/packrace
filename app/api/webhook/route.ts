import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncActivity, refreshTokenIfNeeded } from "@/lib/strava";
import { generateCommentary } from "@/lib/commentary";
import { recalculatePredictionsForEvent } from "@/lib/prediction";

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.STRAVA_VERIFY_TOKEN) {
    return NextResponse.json({ "hub.challenge": challenge });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.object_type === "activity" && body.aspect_type === "create") {
    const stravaAthleteId = String(body.owner_id);
    const stravaActivityId = body.object_id;

    const user = await prisma.user.findUnique({ where: { stravaId: stravaAthleteId } });
    if (!user) return NextResponse.json({ ok: true });

    const accessToken = await refreshTokenIfNeeded(user.id);
    const activity = await syncActivity(user.id, stravaActivityId, accessToken);
    if (!activity) return NextResponse.json({ ok: true });

    // Auto-detect race result
    const upcomingParticipations = await prisma.eventParticipant.findMany({
      where: { userId: user.id },
      include: { event: true },
    });

    for (const p of upcomingParticipations) {
      const event = p.event;
      const eventDate = event.date;
      const diffMs = Math.abs(activity.startDate.getTime() - eventDate.getTime());
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      const distanceDiff = Math.abs(activity.distanceMeters - event.distanceKm * 1000) / (event.distanceKm * 1000);

      if (diffDays <= 1 && distanceDiff <= 0.1 && !p.actualTimeSecs) {
        await prisma.eventParticipant.update({
          where: { id: p.id },
          data: {
            actualTimeSecs: activity.movingTimeSecs,
            stravaActivityId: activity.stravaId,
          },
        });
      }

      // Regenerate commentary for upcoming events
      if (event.date > new Date()) {
        await recalculatePredictionsForEvent(event.id);
        const participantCount = await prisma.eventParticipant.count({ where: { eventId: event.id } });
        if (participantCount >= 2) {
          generateCommentary(event.id).catch(console.error);
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
