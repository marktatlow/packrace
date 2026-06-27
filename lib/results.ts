import { prisma } from "./prisma";
import { refreshTokenIfNeeded } from "./strava";
import { updateRunnerTip, updateRaceIntro } from "./racecard";

const STRAVA_API = "https://www.strava.com/api/v3";
const RUN_TYPES = ["Run", "TrailRun", "VirtualRun"];

/** Downsample an array to at most maxPoints, keeping first + last */
function downsample(arr: number[], maxPoints: number): number[] {
  if (arr.length <= maxPoints) return arr;
  const step = (arr.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => arr[Math.round(i * step)]);
}

/** Extract the fastest segment slice, normalised to start at 0 */
function extractFastestSegment(
  distStream: number[],
  timeStream: number[],
  targetMeters: number
): { dist: number[]; time: number[] } {
  let left = 0;
  let bestLeft = 0;
  let bestRight = 0;
  let bestSecs: number | null = null;

  for (let right = 0; right < distStream.length; right++) {
    while (distStream[right] - distStream[left] > targetMeters) left++;
    const windowDist = distStream[right] - distStream[left];
    if (windowDist >= targetMeters * 0.96) {
      const windowTime = timeStream[right] - timeStream[left];
      if (bestSecs === null || windowTime < bestSecs) {
        bestSecs = windowTime;
        bestLeft = left;
        bestRight = right;
      }
    }
  }

  const distSlice = distStream.slice(bestLeft, bestRight + 1);
  const timeSlice = timeStream.slice(bestLeft, bestRight + 1);
  const d0 = distSlice[0];
  const t0 = timeSlice[0];
  return {
    dist: distSlice.map(d => d - d0),
    time: timeSlice.map(t => t - t0),
  };
}

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
  // Treadmill/indoor trainer runs ARE allowed — this is a fun event, not a regulated race.
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
    let segmentDist: number[] | null = null;
    let segmentTime: number[] | null = null;

    // Always fetch streams — needed for replay chart + longer-run segment detection
    const streamsRes = await fetch(
      `${STRAVA_API}/activities/${stravaActivityId}/streams?keys=distance,time&key_by_type=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const streams = await streamsRes.json();
    const distData: number[] = streams?.distance?.data ?? [];
    const timeData: number[] = streams?.time?.data ?? [];

    if (activity.distance <= targetMeters * 1.04) {
      // Close enough — use full stream normalised to event distance
      bestSecs = activity.moving_time;
      segmentDist = distData;
      segmentTime = timeData;
    } else if (distData.length > 0 && timeData.length > 0) {
      // Longer run — find fastest segment and extract that slice
      bestSecs = fastestSegment(distData, timeData, targetMeters);
      if (bestSecs !== null) {
        const seg = extractFastestSegment(distData, timeData, targetMeters);
        segmentDist = seg.dist;
        segmentTime = seg.time;
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
          // Store normalised stream for race replay chart
          streamDistance: segmentDist ? downsample(segmentDist, 150) : undefined,
          streamTime: segmentTime ? downsample(segmentTime, 150) : undefined,
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
          // Treadmill/indoor trainer runs ARE allowed — this is a fun event, not a regulated race.
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
