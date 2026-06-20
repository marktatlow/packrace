import { prisma } from "./prisma";
import { refreshTokenIfNeeded } from "./strava";

const STRAVA_API = "https://www.strava.com/api/v3";
const RUN_TYPES = ["Run", "TrailRun", "VirtualRun"];

// Sliding window: find the fastest segment of exactly targetMeters within a stream
function fastestSegment(
  distanceStream: number[],
  timeStream: number[],
  targetMeters: number
): number | null {
  let left = 0;
  let bestSecs: number | null = null;

  for (let right = 0; right < distanceStream.length; right++) {
    // Advance left pointer so window covers at least targetMeters
    while (distanceStream[right] - distanceStream[left] > targetMeters) {
      left++;
    }
    const windowDist = distanceStream[right] - distanceStream[left];
    if (windowDist >= targetMeters * 0.96) {
      const windowTime = timeStream[right] - timeStream[left];
      // Pro-rate if slightly short (96–100%)
      const adjustedTime = windowDist < targetMeters
        ? Math.round(windowTime * (targetMeters / windowDist))
        : windowTime;
      if (bestSecs === null || adjustedTime < bestSecs) {
        bestSecs = adjustedTime;
      }
    }
  }

  return bestSecs;
}

export async function fetchResultsForEvent(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { participants: { include: { user: true } } },
  });
  if (!event) return;

  const targetMeters = event.distanceKm * 1000;

  for (const participant of event.participants) {
    // Skip if already fetched
    if (participant.resultFetchedAt) continue;

    const user = participant.user;

    try {
      const accessToken = await refreshTokenIfNeeded(user.id);

      // Fetch activities within the event window
      const windowStart = Math.floor(event.windowStart.getTime() / 1000);
      const windowEnd = Math.floor(event.windowEnd.getTime() / 1000);

      const activitiesRes = await fetch(
        `${STRAVA_API}/athlete/activities?after=${windowStart}&before=${windowEnd}&per_page=10`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const activities = await activitiesRes.json();

      if (!Array.isArray(activities)) continue;

      const runs = activities.filter(
        (a: { type: string; distance: number }) =>
          RUN_TYPES.includes(a.type) && a.distance >= targetMeters * 0.96
      );

      if (runs.length === 0) {
        await prisma.eventParticipant.update({
          where: { id: participant.id },
          data: { resultFetchedAt: new Date() },
        });
        continue;
      }

      let bestSecs: number | null = null;
      let bestActivityId: bigint | null = null;

      for (const run of runs) {
        // If run distance is close to target, use moving time directly (no streams needed)
        if (run.distance >= targetMeters * 0.96 && run.distance <= targetMeters * 1.04) {
          const secs = run.moving_time as number;
          // Pro-rate if slightly short
          const adjusted = run.distance < targetMeters
            ? Math.round(secs * (targetMeters / run.distance))
            : secs;
          if (bestSecs === null || adjusted < bestSecs) {
            bestSecs = adjusted;
            bestActivityId = BigInt(run.id);
          }
          continue;
        }

        // For longer runs, fetch streams and use sliding window
        const streamsRes = await fetch(
          `${STRAVA_API}/activities/${run.id}/streams?keys=distance,time&key_by_type=true`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const streams = await streamsRes.json();

        if (!streams?.distance?.data || !streams?.time?.data) continue;

        const segmentSecs = fastestSegment(
          streams.distance.data,
          streams.time.data,
          targetMeters
        );

        if (segmentSecs !== null && (bestSecs === null || segmentSecs < bestSecs)) {
          bestSecs = segmentSecs;
          bestActivityId = BigInt(run.id);
        }
      }

      await prisma.eventParticipant.update({
        where: { id: participant.id },
        data: {
          actualTimeSecs: bestSecs ?? undefined,
          stravaActivityId: bestActivityId ?? undefined,
          resultFetchedAt: new Date(),
        },
      });
    } catch (err) {
      console.error(`Failed to fetch result for user ${user.id}:`, err);
    }
  }
}
