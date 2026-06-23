import { prisma } from "./prisma";
import { refreshTokenIfNeeded } from "./strava";
import { updateRunnerTip, updateRaceIntro } from "./racecard";

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
      if (bestSecs === null || windowTime < bestSecs) {
        bestSecs = windowTime;
      }
    }
  }

  return bestSecs;
}

/**
 * Process a single known Strava activity for a user.
 * Called instantly by the webhook handler — much cheaper than a full scan.
 * Finds all active event windows the user is in and updates their result.
 */
export async function processActivityForUser(
  stravaAthleteId: string,
  stravaActivityId: number
): Promise<string> {
  // Find our user by Strava athlete ID
  const user = await prisma.user.findUnique({ where: { stravaId: stravaAthleteId } });
  if (!user) return `no user for stravaId=${stravaAthleteId}`;

  const now = new Date();

  // Find active event windows this user is participating in
  const participants = await prisma.eventParticipant.findMany({
    where: {
      userId: user.id,
      event: { windowStart: { lte: now }, windowEnd: { gte: now } },
    },
    include: { event: true },
  });

  if (participants.length === 0) return `no active windows for user=${user.id} at ${now.toISOString()}`;

  const accessToken = await refreshTokenIfNeeded(user.id);

  // Fetch the specific activity from Strava (1 API call)
  const res = await fetch(`${STRAVA_API}/activities/${stravaActivityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return `strava activity fetch failed: ${res.status}`;
  const activity = await res.json();

  if (!RUN_TYPES.includes(activity.sport_type ?? activity.type)) return `not a run: ${activity.sport_type ?? activity.type}`;
  // Exclude treadmill / indoor trainer runs — outdoor only
  if (activity.trainer === true) return `treadmill run excluded`;
  if (activity.manual === true) return `manual entry excluded`;

  const activityDate = new Date(activity.start_date);

  for (const participant of participants) {
    const targetMeters = participant.event.distanceKm * 1000;

    // Check activity is within this event's window
    if (activityDate < participant.event.windowStart || activityDate > participant.event.windowEnd) continue;
    // Check distance is close enough
    if (activity.distance < targetMeters * 0.96) continue;

    let bestSecs: number | null = null;
    let bestActivityId: bigint | null = BigInt(stravaActivityId);

    if (activity.distance <= targetMeters * 1.04) {
      bestSecs = activity.moving_time;
      console.log(`Using moving_time directly: ${bestSecs}s`);
    } else {
      console.log(`Fetching streams for ${stravaActivityId}...`);
      const streamsRes = await fetch(
        `${STRAVA_API}/activities/${stravaActivityId}/streams?keys=distance,time&key_by_type=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const streams = await streamsRes.json();
      console.log(`Streams status: ${streamsRes.status}, has data: ${!!streams?.distance?.data}`);
      if (streams?.distance?.data && streams?.time?.data) {
        bestSecs = fastestSegment(streams.distance.data, streams.time.data, targetMeters);
        console.log(`fastestSegment result: ${bestSecs}s`);
      }
    }

    if (bestSecs !== null) {
      // Only update if this is faster than any existing result (multiple runs scenario)
      if (participant.actualTimeSecs !== null && bestSecs >= participant.actualTimeSecs) {
        return `slower than existing result (${bestSecs}s vs ${participant.actualTimeSecs}s) — keeping best`;
      }

      await prisma.eventParticipant.update({
        where: { id: participant.id },
        data: {
          actualTimeSecs: bestSecs,
          stravaActivityId: bestActivityId ?? undefined,
          resultFetchedAt: new Date(),
        },
      });
      console.log(`✓ Updated result for ${user.firstName} in ${participant.event.name}: ${bestSecs}s`);

      // Generate post-race verdict for this athlete
      await updateRunnerTip(participant.eventId, user.id).catch((err) =>
        console.error(`Tips runner update failed:`, err)
      );

      // If the event window has now closed, generate the race closing summary too
      const now2 = new Date();
      if (now2 > participant.event.windowEnd) {
        await updateRaceIntro(participant.eventId, "post-race").catch((err) =>
          console.error(`Post-race summary failed:`, err)
        );
      }

      return `updated ${user.firstName}: ${bestSecs}s`;
    }
  }
  return `done`;
}

export async function fetchResultsForEvent(eventId: string, isLive = false) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { participants: { include: { user: true } } },
  });
  if (!event) return;

  const targetMeters = event.distanceKm * 1000;

  for (const participant of event.participants) {
    // During live window always re-fetch; after window skip if already done
    if (!isLive && participant.resultFetchedAt) continue;

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
        (a: { type: string; sport_type?: string; distance: number; trainer?: boolean; manual?: boolean }) =>
          RUN_TYPES.includes(a.sport_type ?? a.type) &&
          a.distance >= targetMeters * 0.96 &&
          !a.trainer &&   // exclude treadmill
          !a.manual       // exclude manual entries
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
          if (bestSecs === null || secs < bestSecs) {
            bestSecs = secs;
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

      // Only update the actual race result here.
      // VDOT/PB estimates are handled separately via /api/events/[id]/refresh-estimates
      // to avoid burning Strava rate limits on every poll.
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
