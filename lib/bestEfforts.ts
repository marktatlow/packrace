/**
 * Incremental Strava best-effort sync.
 *
 * First call: fetches all activities from the last 180 days and stores best
 * efforts per standard distance in the DB.
 *
 * Subsequent calls: only fetches activities since the last sync — typically
 * just a handful of recent runs — then merges any improvements into the DB.
 *
 * VDOT prediction is then computed entirely from the DB, with no further
 * Strava calls needed.
 */

import { prisma } from "./prisma";

const STRAVA_API = "https://www.strava.com/api/v3";
const RUN_TYPES = ["Run", "TrailRun", "VirtualRun"];
const VALID_DISTANCES = [400, 805, 1000, 1609, 3219, 5000, 10000];
const INITIAL_LOOKBACK_DAYS = 60;

// ── VDOT maths ────────────────────────────────────────────────────────────────

function vdotFromEffort(distanceMeters: number, timeMins: number): number {
  const v = distanceMeters / timeMins;
  const pct =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * timeMins) +
    0.2989558 * Math.exp(-0.1932605 * timeMins);
  const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;
  return vo2 / pct;
}

function predictTimeFromVdot(vdot: number, targetMeters: number): number {
  let lo = 1,
    hi = 600;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFromEffort(targetMeters, mid) > vdot) lo = mid;
    else hi = mid;
    if (hi - lo < 0.001) break;
  }
  return (lo + hi) / 2;
}

// ── Strava fetch helpers ───────────────────────────────────────────────────────

async function stravaGet(path: string, accessToken: string): Promise<unknown> {
  const res = await fetch(`${STRAVA_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 429) throw new Error("Strava rate limit exceeded");
  return res.json();
}

// ── Core sync ─────────────────────────────────────────────────────────────────

/**
 * Sync best efforts for a user from Strava into the DB.
 * Only fetches activities newer than the user's last sync.
 * Returns the VDOT-predicted time for `targetMeters`.
 */
export async function syncAndComputeVdot(
  userId: string,
  accessToken: string,
  targetMeters: number
): Promise<number | null> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { stravaLastSyncAt: true },
  });

  // Determine how far back to fetch
  const since = user.stravaLastSyncAt
    ? Math.floor(user.stravaLastSyncAt.getTime() / 1000)
    : Math.floor((Date.now() - INITIAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000) / 1000);

  // Fetch new activities from Strava
  const newBests = new Map<number, number>(); // distanceMeters → best timeSecs

  let page = 1;
  while (true) {
    const activities = await stravaGet(
      `/athlete/activities?after=${since}&per_page=100&page=${page}`,
      accessToken
    ) as Array<{ type: string; id: number }>;

    if (!Array.isArray(activities) || activities.length === 0) break;

    for (const act of activities) {
      if (!RUN_TYPES.includes(act.type)) continue;

      const detail = await stravaGet(
        `/activities/${act.id}?include_all_efforts=true`,
        accessToken
      ) as { best_efforts?: Array<{ distance: number; moving_time: number }> };

      if (!detail?.best_efforts) continue;

      for (const effort of detail.best_efforts) {
        const d = Math.round(effort.distance);
        const t = effort.moving_time;
        if (!VALID_DISTANCES.includes(d) || t <= 0) continue;
        if (!newBests.has(d) || t < newBests.get(d)!) newBests.set(d, t);
      }
    }

    if (activities.length < 100) break;
    page++;
  }

  // Merge new bests into DB (only update if the new time beats what's stored)
  for (const [distanceMeters, timeSecs] of newBests) {
    const existing = await prisma.bestEffort.findUnique({
      where: { userId_distanceMeters: { userId, distanceMeters } },
    });

    if (!existing || timeSecs < existing.timeSecs) {
      await prisma.bestEffort.upsert({
        where: { userId_distanceMeters: { userId, distanceMeters } },
        create: { userId, distanceMeters, timeSecs },
        update: { timeSecs },
      });
    }
  }

  // Update last sync timestamp
  await prisma.user.update({
    where: { id: userId },
    data: { stravaLastSyncAt: new Date() },
  });

  // Compute VDOT from all stored best efforts (DB only — no more Strava calls)
  return computeVdotFromDb(userId, targetMeters);
}

/**
 * Compute VDOT prediction purely from stored DB best efforts.
 * Zero Strava API calls.
 */
export async function computeVdotFromDb(
  userId: string,
  targetMeters: number
): Promise<number | null> {
  const efforts = await prisma.bestEffort.findMany({ where: { userId } });
  if (efforts.length === 0) return null;

  const vdots = efforts
    .map((e) => vdotFromEffort(e.distanceMeters, e.timeSecs / 60))
    .filter((v) => v >= 20 && v <= 85);

  if (vdots.length === 0) return null;

  const sorted = [...vdots].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

  return Math.round(predictTimeFromVdot(median, targetMeters) * 60);
}

/**
 * Personal best for targetMeters from stored DB efforts.
 * Looks for an effort within ±10% of the target distance.
 */
export async function computePbFromDb(
  userId: string,
  targetMeters: number
): Promise<number | null> {
  const efforts = await prisma.bestEffort.findMany({ where: { userId } });
  let bestTime: number | null = null;
  let bestDiff = Infinity;

  for (const e of efforts) {
    const diff = Math.abs(e.distanceMeters - targetMeters) / targetMeters;
    if (diff <= 0.1 && diff < bestDiff) {
      bestDiff = diff;
      bestTime = e.timeSecs;
    }
  }

  return bestTime;
}
