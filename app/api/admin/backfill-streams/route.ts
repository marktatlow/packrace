import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshTokenIfNeeded } from "@/lib/strava";

const STRAVA_API = "https://www.strava.com/api/v3";

function downsample(arr: number[], max: number): number[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => arr[Math.round(i * step)]);
}

function extractSegment(dist: number[], time: number[], targetM: number) {
  // Find fastest segment
  let left = 0, bestLeft = 0, bestRight = dist.length - 1, bestSecs: number | null = null;
  for (let right = 0; right < dist.length; right++) {
    while (dist[right] - dist[left] > targetM) left++;
    const wd = dist[right] - dist[left];
    if (wd >= targetM * 0.96) {
      const wt = time[right] - time[left];
      if (bestSecs === null || wt < bestSecs) { bestSecs = wt; bestLeft = left; bestRight = right; }
    }
  }
  const d0 = dist[bestLeft], t0 = time[bestLeft];
  return {
    dist: dist.slice(bestLeft, bestRight + 1).map(d => d - d0),
    time: time.slice(bestLeft, bestRight + 1).map(t => t - t0),
  };
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const eventId = req.nextUrl.searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 });

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const participants = await prisma.eventParticipant.findMany({
    where: { eventId, actualTimeSecs: { not: null }, stravaActivityId: { not: null }, streamDistance: null },
    include: { user: true },
  });

  const results: string[] = [];

  for (const p of participants) {
    try {
      const accessToken = await refreshTokenIfNeeded(p.userId);
      const activityId = p.stravaActivityId!.toString();
      const targetM = event.distanceKm * 1000;

      const streamsRes = await fetch(
        `${STRAVA_API}/activities/${activityId}/streams?keys=distance,time&key_by_type=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const streams = await streamsRes.json();
      const distData: number[] = streams?.distance?.data ?? [];
      const timeData: number[] = streams?.time?.data ?? [];
      if (!distData.length) { results.push(`${p.user.firstName}: no stream data`); continue; }

      let segDist = distData, segTime = timeData;
      if (distData[distData.length - 1] > targetM * 1.04) {
        const seg = extractSegment(distData, timeData, targetM);
        segDist = seg.dist; segTime = seg.time;
      }

      await prisma.eventParticipant.update({
        where: { id: p.id },
        data: {
          streamDistance: downsample(segDist, 150),
          streamTime: downsample(segTime, 150),
        },
      });
      results.push(`${p.user.firstName}: stored ${segDist.length} points`);
    } catch (e) {
      results.push(`${p.user.firstName}: error — ${String(e)}`);
    }
  }

  return NextResponse.json({ ok: true, results });
}
